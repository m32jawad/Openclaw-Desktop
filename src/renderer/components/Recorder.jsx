import React, { useState, useEffect, useRef, useCallback } from 'react';

function Recorder({ onWorkflowCreated }) {
  const [state, setState] = useState('idle'); // idle, no-key, selecting, recording, processing, analyzing, done
  const [sources, setSources] = useState([]);
  const [selectedSource, setSelectedSource] = useState(null);
  const [recordingId, setRecordingId] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [maxDuration] = useState(15 * 60); // 15 minutes in seconds
  const [error, setError] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [processingStatus, setProcessingStatus] = useState('');
  const [hasApiKey, setHasApiKey] = useState(null); // null = loading, true/false
  
  // Voice Assistant state
  const [voiceAssistantEnabled, setVoiceAssistantEnabled] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [answerText, setAnswerText] = useState('');
  const [questionHistory, setQuestionHistory] = useState([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const maxTimerRef = useRef(null);
  const speechSynthesisRef = useRef(null);
  const screenCaptureIntervalRef = useRef(null);
  const voiceRecorderRef = useRef(null);
  const voiceStreamRef = useRef(null);
  const voiceChunksRef = useRef([]);

  // Input event tracking
  const eventsRef = useRef([]);
  const recordingStartRef = useRef(null);

  useEffect(() => {
    checkApiKey();
    
    // Note: Web SpeechRecognition does NOT work in Electron.
    // Voice input uses MediaRecorder + Gemini transcription instead (see startListening/stopListening).
    
    // Setup voice assistant question listener
    const removeListener = window.electronAPI.onVoiceAssistantQuestion?.((question) => {
      setCurrentQuestion(question);
      setQuestionHistory(prev => [...prev, question]);
      speakQuestion(question.question);
    });
    
    return () => {
      stopTimer();
      cleanupStream();
      cancelSpeech();
      stopListening();
      if (screenCaptureIntervalRef.current) {
        clearInterval(screenCaptureIntervalRef.current);
      }
      if (removeListener) removeListener();
    };
  }, []);

  const checkApiKey = async () => {
    try {
      const key = await window.electronAPI.getGeminiApiKey();
      if (key) {
        setHasApiKey(true);
      } else {
        // Also check config
        const config = await window.electronAPI.getConfig();
        const hasKey = !!(config?.apiKeys?.gemini || config?.apiKeys?.google);
        setHasApiKey(hasKey);
        if (!hasKey) {
          setState('no-key');
        }
      }
    } catch {
      setHasApiKey(false);
      setState('no-key');
    }
  };

  const startTimer = () => {
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
  };

  const cleanupStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };
  
  // Voice Assistant Functions
  const speakQuestion = (text) => {
    if (!('speechSynthesis' in window)) {
      console.warn('[TTS] Speech synthesis not supported');
      return;
    }
    
    cancelSpeech(); // Cancel any ongoing speech
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      // Auto-start listening after question is spoken
      startListening();
    };
    utterance.onerror = () => setIsSpeaking(false);
    
    speechSynthesisRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };
  
  const cancelSpeech = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };
  
  const startListening = async () => {
    // Use MediaRecorder + Gemini transcription (SpeechRecognition doesn't work in Electron)
    if (isListening || isTranscribing) {
      console.log('[VoiceInput] Already listening or transcribing');
      return;
    }
    
    try {
      console.log('[VoiceInput] Starting microphone recording...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceStreamRef.current = stream;
      voiceChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) voiceChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Stop mic stream
        stream.getTracks().forEach(track => track.stop());
        voiceStreamRef.current = null;
        setIsListening(false);
        setIsTranscribing(true);

        try {
          const blob = new Blob(voiceChunksRef.current, { type: mimeType || 'audio/webm' });
          const arrayBuffer = await blob.arrayBuffer();
          console.log('[VoiceInput] Sending audio for transcription...');
          const result = await window.electronAPI.transcribeAudio(arrayBuffer);

          if (result.success && result.text) {
            console.log('[VoiceInput] Transcript:', result.text);
            setAnswerText(result.text);
          } else if (!result.success) {
            console.error('[VoiceInput] Transcription failed:', result.error);
            setError('Voice transcription failed: ' + result.error);
          }
        } catch (err) {
          console.error('[VoiceInput] Transcription error:', err);
          setError('Voice transcription error: ' + err.message);
        }
        setIsTranscribing(false);
      };

      voiceRecorderRef.current = recorder;
      recorder.start();
      setIsListening(true);
      console.log('[VoiceInput] Listening...');
    } catch (error) {
      console.error('[VoiceInput] Failed to start:', error);
      setError(`Voice input failed: ${error.message}`);
      setIsListening(false);
    }
  };
  
  const stopListening = () => {
    if (voiceRecorderRef.current && voiceRecorderRef.current.state !== 'inactive') {
      try {
        voiceRecorderRef.current.stop();
      } catch (error) {
        console.error('[VoiceInput] Failed to stop:', error);
      }
    }
    if (voiceStreamRef.current) {
      voiceStreamRef.current.getTracks().forEach(track => track.stop());
      voiceStreamRef.current = null;
    }
    setIsListening(false);
  };
  
  const submitAnswer = async () => {
    if (!currentQuestion || !answerText.trim()) return;
    
    try {
      await window.electronAPI.answerVoiceQuestion(currentQuestion.id, answerText.trim());
      setCurrentQuestion(null);
      setAnswerText('');
      stopListening();
    } catch (error) {
      console.error('[VoiceAssistant] Failed to submit answer:', error);
      setError('Failed to submit answer: ' + error.message);
    }
  };
  
  const skipQuestion = async () => {
    if (!currentQuestion) return;
    
    try {
      await window.electronAPI.answerVoiceQuestion(currentQuestion.id, null);
      setCurrentQuestion(null);
      setAnswerText('');
      stopListening();
    } catch (error) {
      console.error('[VoiceAssistant] Failed to skip question:', error);
    }
  };

  // Input event handlers
  const handleKeyDown = useCallback((e) => {
    if (!recordingStartRef.current) return;
    const timestamp = Date.now() - recordingStartRef.current;
    eventsRef.current.push({
      type: 'keypress',
      timestamp,
      key: e.key,
      code: e.code,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey
    });
  }, []);

  const handleMouseClick = useCallback((e) => {
    if (!recordingStartRef.current) return;
    const timestamp = Date.now() - recordingStartRef.current;
    const target = e.target?.tagName ? `${e.target.tagName}${e.target.textContent ? ': ' + e.target.textContent.substring(0, 50) : ''}` : '';
    eventsRef.current.push({
      type: 'click',
      timestamp,
      button: e.button,
      x: e.screenX,
      y: e.screenY,
      target
    });
  }, []);

  const handleScroll = useCallback((e) => {
    if (!recordingStartRef.current) return;
    const timestamp = Date.now() - recordingStartRef.current;
    eventsRef.current.push({
      type: 'scroll',
      timestamp,
      deltaY: e.deltaY
    });
  }, []);

  const attachInputListeners = () => {
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('click', handleMouseClick, true);
    window.addEventListener('wheel', handleScroll, true);
  };

  const detachInputListeners = () => {
    window.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('click', handleMouseClick, true);
    window.removeEventListener('wheel', handleScroll, true);
  };

  const showSourcePicker = async () => {
    try {
      // Re-check API key before starting
      const key = await window.electronAPI.getGeminiApiKey();
      const config = await window.electronAPI.getConfig();
      if (!key && !config?.apiKeys?.gemini && !config?.apiKeys?.google) {
        setState('no-key');
        return;
      }
      setState('selecting');
      const srcs = await window.electronAPI.getScreenSources();
      setSources(srcs);
    } catch (err) {
      setError('Failed to get screen sources: ' + err.message);
      setState('idle');
    }
  };

  const startRecording = async (source) => {
    try {
      setError(null);
      setSelectedSource(source);

      // Get the screen stream using Electron's desktopCapturer constraint
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: source.id,
            maxWidth: 1920,
            maxHeight: 1080,
            maxFrameRate: 15
          }
        }
      });

      streamRef.current = stream;

      // Notify main process
      const result = await window.electronAPI.startRecording(source.id, voiceAssistantEnabled);
      if (!result.success) {
        throw new Error(result.error);
      }
      setRecordingId(result.recordingId);

      // Setup MediaRecorder
      chunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 1500000 // 1.5 Mbps for reasonable quality/size
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        await handleRecordingComplete(result.recordingId);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000); // Collect in 1-second chunks

      // Start input logging
      eventsRef.current = [];
      recordingStartRef.current = Date.now();
      attachInputListeners();
      await window.electronAPI.startInputLogging(result.recordingId);

      // Start timer
      startTimer();
      
      // Start screen captures for voice assistant if enabled
      if (voiceAssistantEnabled && result.voiceAssistantActive) {
        screenCaptureIntervalRef.current = setInterval(async () => {
          try {
            await window.electronAPI.captureScreenForAnalysis();
          } catch (error) {
            console.error('[Recorder] Screen capture error:', error);
          }
        }, 20000); // Capture every 20 seconds (reduced to avoid quota limits)
      }

      // Auto-stop at 15 minutes
      maxTimerRef.current = setTimeout(() => {
        stopRecording();
      }, maxDuration * 1000);

      setState('recording');
    } catch (err) {
      setError('Failed to start recording: ' + err.message);
      cleanupStream();
      setState('idle');
    }
  };

  const stopRecording = async () => {
    try {
      stopTimer();
      detachInputListeners();
      cancelSpeech();
      stopListening();
      
      // Stop screen capture interval
      if (screenCaptureIntervalRef.current) {
        clearInterval(screenCaptureIntervalRef.current);
        screenCaptureIntervalRef.current = null;
      }

      // Stop input logging
      await window.electronAPI.stopInputLogging();

      // Stop media recorder - this triggers the onstop handler
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      
      // Notify main process
      await window.electronAPI.stopRecording();

      setState('processing');
      setProcessingStatus('Saving recording...');
    } catch (err) {
      setError('Error stopping recording: ' + err.message);
      setState('idle');
    }
  };

  const handleRecordingComplete = async (recId) => {
    try {
      setProcessingStatus('Saving video file...');
      
      // Combine chunks into a single blob
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const arrayBuffer = await blob.arrayBuffer();

      // Send to main process to save
      await window.electronAPI.saveRecording(recId, arrayBuffer);

      // Clean up stream
      cleanupStream();

      // Now analyze with Gemini
      setProcessingStatus('Analyzing recording with Gemini AI...');
      setState('analyzing');

      const analysis = await window.electronAPI.analyzeRecording(recId);

      if (analysis.success) {
        setAnalysisResult(analysis.analysis);
        setState('done');
        setProcessingStatus('');
      } else {
        setError('Analysis failed: ' + analysis.error);
        setState('analysis-failed');
        setProcessingStatus('');
      }
    } catch (err) {
      setError('Processing failed: ' + err.message);
      setState('analysis-failed');
      setProcessingStatus('');
    }
  };

  const retryAnalysis = async () => {
    if (!recordingId) return;
    
    setError(null);
    setProcessingStatus('Retrying analysis with Gemini AI...');
    setState('analyzing');

    try {
      const analysis = await window.electronAPI.analyzeRecording(recordingId);

      if (analysis.success) {
        setAnalysisResult(analysis.analysis);
        setState('done');
        setProcessingStatus('');
      } else {
        setError('Analysis failed again: ' + analysis.error);
        setState('analysis-failed');
        setProcessingStatus('');
      }
    } catch (err) {
      setError('Failed to retry analysis: ' + err.message);
      setState('analysis-failed');
      setProcessingStatus('');
    }
  };

  const saveAsWorkflow = async () => {
    try {
      const result = await window.electronAPI.saveWorkflow(analysisResult, recordingId);
      if (result.id) {
        if (onWorkflowCreated) {
          onWorkflowCreated(result);
        }
        // Reset
        setState('idle');
        setAnalysisResult(null);
        setRecordingId(null);
        setElapsed(0);
      }
    } catch (err) {
      setError('Failed to save workflow: ' + err.message);
    }
  };

  const resetRecorder = () => {
    setState('idle');
    setAnalysisResult(null);
    setRecordingId(null);
    setElapsed(0);
    setError(null);
    setSelectedSource(null);
    setSources([]);
    setProcessingStatus('');
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Screen Recorder</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Record your screen to create automated workflows with AI analysis
        </p>
      </div>

      {error && (
        <div className="card" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--accent-danger)', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-danger)" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            <span style={{ color: 'var(--accent-danger)', flex: 1 }}>{error}</span>
            {state === 'analysis-failed' && recordingId && (
              <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 16px' }} onClick={retryAnalysis}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10"/><path d="M20.49 15a9 9 0 01-14.85 3.36L1 14"/>
                </svg>
                Retry Analysis
              </button>
            )}
            <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => { setError(null); if (state === 'analysis-failed') setState('idle'); }}>Dismiss</button>
          </div>
        </div>
      )}

      {/* Analysis Failed State */}
      {state === 'analysis-failed' && !error && (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ marginBottom: 24 }}>
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="var(--accent-warning)" strokeWidth="1.5" style={{ opacity: 0.8 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h2 style={{ fontSize: 22, marginBottom: 12 }}>Analysis Failed</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 32, maxWidth: 500, margin: '0 auto 32px' }}>
            The recording was saved successfully, but AI analysis encountered an issue.
            You can retry the analysis or start a new recording.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={resetRecorder}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1014.85-3.36L3.51 15z"/>
              </svg>
              Start New Recording
            </button>
            <button className="btn btn-primary" style={{ fontSize: 16, padding: '12px 28px' }} onClick={retryAnalysis}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10"/><path d="M20.49 15a9 9 0 01-14.85 3.36L1 14"/>
              </svg>
              Retry Analysis
            </button>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 24 }}>
            Recording ID: {recordingId}
          </p>
        </div>
      )}

      {/* No API Key State */}
      {state === 'no-key' && (
        <NoApiKeySetup onKeySet={() => { setHasApiKey(true); setState('idle'); }} />
      )}

      {/* Idle State - Start Recording */}
      {state === 'idle' && (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ marginBottom: 24 }}>
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="1.5" style={{ opacity: 0.8 }}>
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="4" fill="var(--accent-danger)"/>
            </svg>
          </div>
          <h2 style={{ fontSize: 22, marginBottom: 12 }}>Ready to Record</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 32, maxWidth: 500, margin: '0 auto 32px' }}>
            Capture your screen activity and input events. The recording will be analyzed by Gemini AI 
            to generate an automated workflow that you can edit and run with OpenClaw.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            <div className="info-tag">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
              Max 15 minutes
            </div>
            <div className="info-tag">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              Screen + Input Events
            </div>
            <div className="info-tag">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              AI-Powered Analysis
            </div>
          </div>
          
          {/* Voice Assistant Toggle */}
          <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 16px', borderRadius: 8, border: voiceAssistantEnabled ? '2px solid var(--accent-primary)' : '2px solid var(--border-color)', background: voiceAssistantEnabled ? 'rgba(59, 130, 246, 0.1)' : 'transparent', transition: 'all 0.2s' }}>
              <input 
                type="checkbox" 
                checked={voiceAssistantEnabled}
                onChange={(e) => setVoiceAssistantEnabled(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 003 3v7a3 3 0 11-6 0V4a3 3 0 003-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              <span style={{ fontWeight: 500, fontSize: 14 }}>Enable Voice Assistant</span>
            </label>
          </div>
          {voiceAssistantEnabled && (
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20, maxWidth: 520, margin: '0 auto 20px', fontStyle: 'italic' }}>
              🎙️ The AI will monitor your recording every 20 seconds, ask clarifying questions, and create detailed, instructional workflows
              <br />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>⚠️ Free tier: Limited to ~15 questions per minute</span>
            </p>
          )}
          
          <button className="btn btn-primary" style={{ fontSize: 16, padding: '12px 32px' }} onClick={showSourcePicker}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="8"/>
            </svg>
            Start Capture
          </button>
        </div>
      )}

      {/* Source Selection */}
      {state === 'selecting' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Select Screen to Record</h3>
              <p className="card-subtitle">Choose which screen or window to capture</p>
            </div>
            <button className="btn btn-secondary" onClick={resetRecorder}>Cancel</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280, 1fr))', gap: 16 }}>
            {sources.map(source => (
              <div 
                key={source.id}
                className="source-card"
                onClick={() => startRecording(source)}
              >
                <img 
                  src={source.thumbnail} 
                  alt={source.name}
                  style={{ width: '100%', borderRadius: 8, marginBottom: 8, border: '1px solid var(--border-color)' }}
                />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {source.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recording State */}
      {state === 'recording' && (
        <div>
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div className="recording-indicator">
              <div className="recording-dot"></div>
              <span>RECORDING</span>
            </div>
            <div style={{ fontSize: 48, fontWeight: 700, fontFamily: 'monospace', marginBottom: 8 }}>
              {formatTime(elapsed)}
            </div>
            <div style={{ marginBottom: 24 }}>
              <div className="progress-bar" style={{ maxWidth: 400, margin: '0 auto' }}>
                <div className="progress-fill" style={{ width: `${(elapsed / maxDuration) * 100}%` }}></div>
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                {formatTime(maxDuration - elapsed)} remaining
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
              <div className="info-tag recording-tag">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
                {selectedSource?.name || 'Screen'}
              </div>
              <div className="info-tag recording-tag">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Logging inputs
              </div>
            </div>
            <button className="btn btn-danger" style={{ fontSize: 16, padding: '12px 32px' }} onClick={stopRecording}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
              </svg>
              Stop Recording
            </button>
          </div>
          
          {/* Voice Assistant Q&A Interface */}
          {voiceAssistantEnabled && currentQuestion && (
            <div className="card" style={{ marginTop: 20, padding: 24, background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(147, 51, 234, 0.1))', border: '2px solid var(--accent-primary)' }}>
              <div style={{ display: 'flex', alignItems: 'start', gap: 16, marginBottom: 16 }}>
                <div style={{ background: 'var(--accent-primary)', borderRadius: '50%', padding: 12, flexShrink: 0 }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <path d="M12 1a3 3 0 003 3v7a3 3 0 11-6 0V4a3 3 0 003-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/>
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <h4 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Voice Assistant</h4>
                    {isSpeaking && (
                      <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        <div className="recording-dot" style={{ width: 6, height: 6 }}></div>
                        <span style={{ fontSize: 11, color: 'var(--accent-primary)', fontWeight: 600 }}>Speaking...</span>
                      </div>
                    )}
                  </div>
                  <p style={{ fontSize: 15, marginBottom: 16, color: 'var(--text-primary)' }}>
                    {currentQuestion.question}
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <input
                      type="text"
                      className="input-field"
                      value={answerText}
                      onChange={(e) => setAnswerText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') submitAnswer(); }}
                      placeholder="Type or speak your answer..."
                      style={{ flex: 1 }}
                    />
                    {navigator.mediaDevices && (
                      <button 
                        className={`btn ${isListening ? 'btn-danger' : isTranscribing ? 'btn-secondary' : 'btn-secondary'}`}
                        onClick={isListening ? stopListening : startListening}
                        disabled={isTranscribing}
                        title={isTranscribing ? 'Transcribing...' : isListening ? 'Stop listening' : 'Use voice input'}
                        style={{ padding: '8px 12px', position: 'relative' }}
                      >
                        {isTranscribing ? (
                          <div className="spinner" style={{ width: 16, height: 16 }}></div>
                        ) : (
                          <>
                            {isListening && (
                              <div className="recording-dot" style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6 }}></div>
                            )}
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 003 3v7a3 3 0 11-6 0V4a3 3 0 003-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button 
                      className="btn btn-primary" 
                      onClick={submitAnswer}
                      disabled={!answerText.trim()}
                      style={{ flex: 1 }}
                    >
                      Submit Answer
                    </button>
                    <button className="btn btn-secondary" onClick={skipQuestion}>
                      Skip
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Question History */}
          {voiceAssistantEnabled && questionHistory.length > 0 && !currentQuestion && (
            <div className="card" style={{ marginTop: 20, padding: 20 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
                💬 Questions Asked ({questionHistory.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {questionHistory.slice(-3).map((q, idx) => (
                  <div key={idx} style={{ padding: 8, background: 'var(--card-bg)', borderRadius: 6, fontSize: 13 }}>
                    <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>Q: {q.question}</div>
                    {q.answer && <div style={{ color: 'var(--text-primary)', paddingLeft: 12 }}>A: {q.answer}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Processing / Analyzing State */}
      {(state === 'processing' || state === 'analyzing') && (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div className="spinner" style={{ width: 48, height: 48, margin: '0 auto 24px' }}></div>
          <h2 style={{ fontSize: 22, marginBottom: 12 }}>
            {state === 'processing' ? 'Processing Recording...' : 'Analyzing with Gemini AI...'}
          </h2>
          <p style={{ color: 'var(--text-secondary)' }}>{processingStatus}</p>
          {state === 'analyzing' && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>
              This may take 1-3 minutes depending on recording length
            </p>
          )}
        </div>
      )}

      {/* Analysis Complete */}
      {state === 'done' && analysisResult && (
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <div>
                <h3 className="card-title">{analysisResult.title || 'Workflow Analysis'}</h3>
                <p className="card-subtitle">AI-generated workflow from your recording</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" onClick={resetRecorder}>Discard</button>
                <button className="btn btn-success" onClick={saveAsWorkflow}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/>
                  </svg>
                  Save as Workflow
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <h4 style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>Description</h4>
              <p style={{ lineHeight: 1.7 }}>{analysisResult.description}</p>
            </div>

            {analysisResult.applications_used?.length > 0 && (
              <div style={{ marginBottom: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {analysisResult.applications_used.map((app, i) => (
                  <span key={i} className="info-tag">{app}</span>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div className="stat-card" style={{ padding: 16 }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 4 }}>Complexity</div>
                <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{analysisResult.complexity || 'N/A'}</div>
              </div>
              <div className="stat-card" style={{ padding: 16 }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 4 }}>Steps</div>
                <div style={{ fontWeight: 600 }}>{analysisResult.steps?.length || 0}</div>
              </div>
              <div className="stat-card" style={{ padding: 16 }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 4 }}>Est. Automation Time</div>
                <div style={{ fontWeight: 600 }}>{analysisResult.estimated_automation_time || 'N/A'}</div>
              </div>
            </div>
          </div>

          {/* Steps Preview */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: 16 }}>Generated Steps ({analysisResult.steps?.length || 0})</h3>
            <div className="workflow-steps-preview">
              {(analysisResult.steps || []).map((step, i) => (
                <div key={i} className="workflow-step-card">
                  <div className="step-number">{step.step_number || i + 1}</div>
                  <div className="step-content">
                    <div className="step-action">{step.action}</div>
                    <div className="step-description">{step.description}</div>
                    <div className="step-meta">
                      {step.action_type && <span className="step-tag">{step.action_type}</span>}
                      {step.application && <span className="step-tag">{step.application}</span>}
                      {step.target && <span className="step-tag target">Target: {step.target}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NoApiKeySetup({ onKeySet }) {
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await window.electronAPI.saveGeminiApiKey(apiKey.trim());
      onKeySet();
    } catch (err) {
      setError('Failed to save: ' + err.message);
    }
    setSaving(false);
  };

  return (
    <div className="card" style={{ textAlign: 'center', padding: 48 }}>
      <div style={{ marginBottom: 20 }}>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--accent-warning)" strokeWidth="1.5" style={{ opacity: 0.8 }}>
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
        </svg>
      </div>
      <h2 style={{ fontSize: 22, marginBottom: 8 }}>Gemini API Key Required</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, maxWidth: 480, margin: '0 auto 24px' }}>
        Screen recording analysis requires a Google Gemini API key.
        Get a free key from{' '}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" 
           style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>
          Google AI Studio
        </a>.
      </p>

      <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'left' }}>
        <label className="input-label" style={{ marginBottom: 6 }}>Gemini API Key</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="password"
            className="input-field"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="AIza..."
            style={{ flex: 1 }}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
          />
          <button 
            className="btn btn-success" 
            onClick={handleSave}
            disabled={saving || !apiKey.trim()}
            style={{ whiteSpace: 'nowrap' }}
          >
            {saving ? <div className="spinner"></div> : 'Save & Continue'}
          </button>
        </div>
        {error && (
          <p style={{ color: 'var(--accent-danger)', fontSize: 13, marginTop: 8 }}>{error}</p>
        )}
      </div>

      <div style={{ marginTop: 24, display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        <div className="info-tag">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20,6 9,17 4,12"/></svg>
          Free tier available
        </div>
        <div className="info-tag">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          Stored securely locally
        </div>
        <div className="info-tag">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Also editable in Configuration &gt; API Keys
        </div>
      </div>
    </div>
  );
}

export default Recorder;
