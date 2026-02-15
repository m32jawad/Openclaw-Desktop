const fs = require('fs');
const path = require('path');
const os = require('os');

class InputLogger {
  constructor() {
    this.logsDir = path.join(os.homedir(), '.openclaw', 'recordings');
    this.ensureDir();
    this.events = [];
    this.isLogging = false;
    this.startTime = null;
  }

  ensureDir() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  startLogging(recordingId) {
    this.events = [];
    this.isLogging = true;
    this.startTime = Date.now();
    this.recordingId = recordingId;
    return { success: true };
  }

  addEvent(event) {
    if (!this.isLogging) return;

    const timestamp = Date.now() - this.startTime;
    this.events.push({
      timestamp,
      ...event
    });
  }

  stopLogging() {
    this.isLogging = false;
    const events = [...this.events];
    const recordingId = this.recordingId;

    // Save events log to file
    if (recordingId && events.length > 0) {
      const logPath = path.join(this.logsDir, `${recordingId}_events.json`);
      fs.writeFileSync(logPath, JSON.stringify(events, null, 2));
    }

    this.events = [];
    this.recordingId = null;
    this.startTime = null;

    return { success: true, eventCount: events.length, events };
  }

  getEvents(recordingId) {
    const logPath = path.join(this.logsDir, `${recordingId}_events.json`);
    if (fs.existsSync(logPath)) {
      return JSON.parse(fs.readFileSync(logPath, 'utf8'));
    }
    return [];
  }

  getStatus() {
    return {
      isLogging: this.isLogging,
      eventCount: this.events.length,
      elapsed: this.startTime ? Date.now() - this.startTime : 0
    };
  }

  // Summarize events into human-readable format for AI analysis
  summarizeEvents(events) {
    if (!events || events.length === 0) return 'No input events recorded.';

    const summary = [];
    let lastAction = '';
    let repeatCount = 0;
    let typingBuffer = '';
    let typingStart = 0;

    for (const event of events) {
      const timeStr = this.formatTime(event.timestamp);

      if (event.type === 'keypress') {
        if (event.key && event.key.length === 1) {
          if (!typingBuffer) typingStart = event.timestamp;
          typingBuffer += event.key;
        } else {
          // Flush typing buffer
          if (typingBuffer) {
            summary.push(`[${this.formatTime(typingStart)}] Typed: "${typingBuffer}"`);
            typingBuffer = '';
          }
          if (event.key) {
            const modifiers = [];
            if (event.ctrlKey) modifiers.push('Ctrl');
            if (event.altKey) modifiers.push('Alt');
            if (event.shiftKey) modifiers.push('Shift');
            if (event.metaKey) modifiers.push('Meta');
            const combo = [...modifiers, event.key].join('+');
            summary.push(`[${timeStr}] Key: ${combo}`);
          }
        }
      } else if (event.type === 'click') {
        if (typingBuffer) {
          summary.push(`[${this.formatTime(typingStart)}] Typed: "${typingBuffer}"`);
          typingBuffer = '';
        }
        const btn = event.button === 0 ? 'Left' : event.button === 2 ? 'Right' : 'Middle';
        summary.push(`[${timeStr}] ${btn} Click at (${event.x}, ${event.y})${event.target ? ` on "${event.target}"` : ''}`);
      } else if (event.type === 'scroll') {
        if (typingBuffer) {
          summary.push(`[${this.formatTime(typingStart)}] Typed: "${typingBuffer}"`);
          typingBuffer = '';
        }
        const dir = event.deltaY > 0 ? 'down' : 'up';
        summary.push(`[${timeStr}] Scroll ${dir}`);
      } else if (event.type === 'dblclick') {
        if (typingBuffer) {
          summary.push(`[${this.formatTime(typingStart)}] Typed: "${typingBuffer}"`);
          typingBuffer = '';
        }
        summary.push(`[${timeStr}] Double Click at (${event.x}, ${event.y})${event.target ? ` on "${event.target}"` : ''}`);
      }
    }

    // Flush remaining typing buffer
    if (typingBuffer) {
      summary.push(`[${this.formatTime(typingStart)}] Typed: "${typingBuffer}"`);
    }

    return summary.join('\n');
  }

  formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
}

module.exports = InputLogger;
