const { desktopCapturer, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

class ScreenRecorder {
  constructor(voiceAssistant = null) {
    this.recordingsDir = path.join(os.homedir(), '.openclaw', 'recordings');
    this.ensureDir();
    this.isRecording = false;
    this.currentRecordingId = null;
    this.startTime = null;
    this.maxDurationMs = 15 * 60 * 1000; // 15 minutes
    this.timeoutHandle = null;
    
    // Voice assistant integration
    this.voiceAssistant = voiceAssistant;
    this.captureInterval = null;
    this.lastCaptureTime = 0;
    this.captureIntervalMs = 5000; // Capture screen every 5 seconds
    this.screenCapturesDir = path.join(this.recordingsDir, 'captures');
    this.ensureCapturesDir();
  }
  
  ensureCapturesDir() {
    if (!fs.existsSync(this.screenCapturesDir)) {
      fs.mkdirSync(this.screenCapturesDir, { recursive: true });
    }
  }

  ensureDir() {
    if (!fs.existsSync(this.recordingsDir)) {
      fs.mkdirSync(this.recordingsDir, { recursive: true });
    }
  }

  generateId() {
    return `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async getSources() {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 }
    });
    return sources.map(s => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL()
    }));
  }

  startRecording(sourceId, withVoiceAssistant = false) {
    if (this.isRecording) {
      return { success: false, error: 'Already recording' };
    }
    this.currentRecordingId = this.generateId();
    this.isRecording = true;
    this.startTime = Date.now();

    // The actual MediaRecorder runs in the renderer process (browser API).
    // This module manages state & file paths for the main process side.
    const filePath = path.join(this.recordingsDir, `${this.currentRecordingId}.webm`);
    
    // Start voice assistant if requested
    if (withVoiceAssistant && this.voiceAssistant) {
      this.voiceAssistant.startSession(this.currentRecordingId, (question) => {
        // Callback to send question to renderer
        if (this.questionCallback) {
          this.questionCallback(question);
        }
      });
    }

    return {
      success: true,
      recordingId: this.currentRecordingId,
      filePath,
      sourceId,
      maxDurationMs: this.maxDurationMs,
      voiceAssistantActive: withVoiceAssistant && !!this.voiceAssistant
    };
  }
  
  /**
   * Set callback for voice assistant questions
   */
  setQuestionCallback(callback) {
    this.questionCallback = callback;
  }
  
  /**
   * Capture current screen for voice assistant analysis
   */
  async captureScreenForAnalysis(recentEvents = []) {
    if (!this.isRecording || !this.voiceAssistant || !this.voiceAssistant.isActive) {
      return;
    }
    
    const now = Date.now();
    if (now - this.lastCaptureTime < this.captureIntervalMs) {
      return; // Too soon
    }
    
    this.lastCaptureTime = now;
    
    try {
      // Capture screenshot
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1280, height: 720 }
      });
      
      if (sources.length > 0) {
        const thumbnail = sources[0].thumbnail;
        const imageBase64 = thumbnail.toPNG().toString('base64');
        const timestamp = now - this.startTime;
        
        // Save capture (optional - for debugging)
        const capturePath = path.join(
          this.screenCapturesDir,
          `${this.currentRecordingId}_${timestamp}.png`
        );
        fs.writeFileSync(capturePath, Buffer.from(imageBase64, 'base64'));
        
        // Send to voice assistant for analysis
        await this.voiceAssistant.processScreenCapture(imageBase64, timestamp, recentEvents);
      }
    } catch (error) {
      console.error('[Recorder] Error capturing screen:', error);
      // Don't throw - just log and continue
    }
  }
  
  /**
   * Answer a voice assistant question
   */
  async answerQuestion(questionId, answer) {
    if (this.voiceAssistant && this.voiceAssistant.isActive) {
      await this.voiceAssistant.receiveAnswer(questionId, answer);
    }
  }
  
  /**
   * Get voice assistant context
   */
  getVoiceAssistantContext() {
    if (this.voiceAssistant && this.voiceAssistant.isActive) {
      return this.voiceAssistant.stopSession();
    }
    return null;
  }

  async saveRecording(recordingId, buffer) {
    const filePath = path.join(this.recordingsDir, `${recordingId}.webm`);
    fs.writeFileSync(filePath, Buffer.from(buffer));
    this.isRecording = false;
    this.currentRecordingId = null;
    this.startTime = null;
    return { success: true, filePath, size: buffer.byteLength };
  }

  stopRecording() {
    if (!this.isRecording) {
      return { success: false, error: 'Not recording' };
    }
    const recordingId = this.currentRecordingId;
    const duration = Date.now() - this.startTime;
    
    // Stop voice assistant and get context
    let voiceAssistantContext = null;
    if (this.voiceAssistant && this.voiceAssistant.isActive) {
      voiceAssistantContext = this.voiceAssistant.stopSession();
    }
    
    this.isRecording = false;
    this.currentRecordingId = null;
    this.startTime = null;
    this.lastCaptureTime = 0;
    
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    
    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }
    
    return { 
      success: true, 
      recordingId, 
      duration,
      voiceAssistantContext 
    };
  }

  getStatus() {
    return {
      isRecording: this.isRecording,
      recordingId: this.currentRecordingId,
      elapsed: this.startTime ? Date.now() - this.startTime : 0,
      maxDurationMs: this.maxDurationMs
    };
  }

  getRecordingPath(recordingId) {
    return path.join(this.recordingsDir, `${recordingId}.webm`);
  }

  listRecordings() {
    this.ensureDir();
    const files = fs.readdirSync(this.recordingsDir).filter(f => f.endsWith('.webm'));
    return files.map(f => {
      const stat = fs.statSync(path.join(this.recordingsDir, f));
      return {
        id: f.replace('.webm', ''),
        filename: f,
        size: stat.size,
        created: stat.birthtime
      };
    });
  }

  deleteRecording(recordingId) {
    const filePath = this.getRecordingPath(recordingId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return { success: true };
    }
    return { success: false, error: 'Recording not found' };
  }
}

module.exports = ScreenRecorder;
