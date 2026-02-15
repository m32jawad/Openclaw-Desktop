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
  
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const maxTimerRef = useRef(null);
  const speechSynthesisRef = useRef(null);
  const screenCaptureIntervalRef = useRef(null);

  // Input event tracking
  const eventsRef = useRef([]);
  const recordingStartRef = useRef(null);

  useEffect(() => {
    checkApiKey();
    
    // Setup voice assistant question listener
    const handleQuestion = (question) => {
      setCurrentQuestion(question);
      setQuestionHistory(prev => [...prev, question]);
      speakQuestion(question.question);
    };
    
    window.electronAPI.onVoiceAssistantQuestion?.(handleQuestion);
    
    return () => {
      stopTimer();
      cleanupStream();
      cancelSpeech();
      if (screenCaptureIntervalRef.current) {
        clearInterval(screenCaptureIntervalRef.current);
      }
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
      const result = await window.electronAPI.startRecording(source.id);
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
