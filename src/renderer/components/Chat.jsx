import React, { useState, useEffect, useRef } from 'react';

// Security patterns to detect potentially malicious input
const SECURITY_PATTERNS = [
  // SQL Injection patterns
  { pattern: /('|\")?\s*(OR|AND)\s+['\"]?\d+['\"]?\s*=\s*['\"]?\d+/i, reason: 'SQL injection attempt detected (OR/AND condition)' },
  { pattern: /('|\")?\s*;\s*(DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE|CREATE|EXEC|EXECUTE)\s+/i, reason: 'SQL injection attempt detected (SQL command)' },
  { pattern: /UNION\s+(ALL\s+)?SELECT/i, reason: 'SQL injection attempt detected (UNION SELECT)' },
  { pattern: /('|\")?\s*--\s*$/m, reason: 'SQL injection attempt detected (comment injection)' },
  { pattern: /\/\*.*\*\//s, reason: 'SQL injection attempt detected (block comment)' },
  { pattern: /;\s*SELECT\s+.*FROM/i, reason: 'SQL injection attempt detected (chained SELECT)' },
  { pattern: /SLEEP\s*\(\d+\)/i, reason: 'SQL injection attempt detected (time-based attack)' },
  { pattern: /BENCHMARK\s*\(/i, reason: 'SQL injection attempt detected (benchmark attack)' },
  { pattern: /LOAD_FILE\s*\(/i, reason: 'SQL injection attempt detected (file access)' },
  { pattern: /INTO\s+(OUT|DUMP)FILE/i, reason: 'SQL injection attempt detected (file write)' },
  
  // Command Injection patterns
  { pattern: /[;&|]\s*(rm|del|format|shutdown|reboot|kill|pkill|wget|curl|nc|netcat|bash|sh|cmd|powershell)\s/i, reason: 'Command injection attempt detected (system command)' },
  { pattern: /`[^`]+`/s, reason: 'Command injection attempt detected (backtick execution)' },
  { pattern: /\$\([^)]+\)/s, reason: 'Command injection attempt detected (subshell execution)' },
  { pattern: /[|&;]\s*\/?(bin|usr|etc|tmp|var)\//i, reason: 'Command injection attempt detected (path traversal with command)' },
  { pattern: />\s*\/?(etc|tmp|var|home)\/[^\s]+/i, reason: 'Command injection attempt detected (file redirection)' },
  
  // Path Traversal patterns
  { pattern: /\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e\//i, reason: 'Path traversal attempt detected' },
  { pattern: /\/etc\/(passwd|shadow|hosts)/i, reason: 'Sensitive file access attempt detected' },
  
  // Script Injection patterns
  { pattern: /<script[^>]*>[\s\S]*?<\/script>/i, reason: 'Script injection attempt detected (script tag)' },
  { pattern: /javascript\s*:/i, reason: 'Script injection attempt detected (javascript protocol)' },
  { pattern: /on(load|error|click|mouseover|submit|focus|blur)\s*=/i, reason: 'Script injection attempt detected (event handler)' },
  
  // LDAP Injection patterns
  { pattern: /[)(|*\\]\s*(\||&|!)/i, reason: 'LDAP injection attempt detected' },
  
  // XXE patterns
  { pattern: /<!ENTITY\s+/i, reason: 'XML External Entity (XXE) attempt detected' },
  { pattern: /<!DOCTYPE[^>]*\[/i, reason: 'XML External Entity (XXE) attempt detected' }
];

/**
 * Validates user input against known malicious patterns
 * @param {string} input - The user input to validate
 * @returns {{ isValid: boolean, reason?: string }} Validation result
 */
function validateInput(input) {
  if (!input || typeof input !== 'string') {
    return { isValid: true };
  }

  for (const { pattern, reason } of SECURITY_PATTERNS) {
    if (pattern.test(input)) {
      return { isValid: false, reason };
    }
  }

  return { isValid: true };
}

function Chat({ gatewayStatus }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const voiceRecorderRef = useRef(null);
  const voiceStreamRef = useRef(null);
  const voiceChunksRef = useRef([]);

  useEffect(() => {
    // Check if audio recording is supported (works in Electron, unlike SpeechRecognition)
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      setVoiceSupported(true);
    }

    // Load chat history
    loadHistory();

    // Subscribe to gateway messages
    const unsubscribe = window.electronAPI.onGatewayMessage((message) => {
      handleGatewayMessage(message);
    });

    return () => {
      unsubscribe?.();
      // Cleanup voice recording
      if (voiceRecorderRef.current && voiceRecorderRef.current.state !== 'inactive') {
        voiceRecorderRef.current.stop();
      }
      if (voiceStreamRef.current) {
        voiceStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamBuffer]);

  const loadHistory = async () => {
    try {
      const history = await window.electronAPI.getChatHistory();
      if (history && history.length > 0) {
        setMessages(history);
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleGatewayMessage = (message) => {
    if (message.type === 'stream') {
      if (message.done) {
        // Stream complete — the final message contains the full text and content blocks
        const newMessage = {
          role: 'assistant',
          content: message.content || '',
          contentBlocks: message.contentBlocks || [{ type: 'text', text: message.content || '' }],
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, newMessage]);
        setStreamBuffer('');
        setStreaming(false);
        setSending(false);
      } else {
        // Streaming delta — accumulate for live preview
        setStreaming(true);
        setStreamBuffer(prev => prev + (message.content || ''));
      }
    } else if (message.type === 'assistant' || message.role === 'assistant') {
      const newMessage = {
        role: 'assistant',
        content: message.content,
        contentBlocks: message.contentBlocks || [{ type: 'text', text: message.content }],
        timestamp: message.timestamp || new Date().toISOString()
      };
      setMessages(prev => [...prev, newMessage]);
      setSending(false);
      setStreaming(false);
    }
  };

  const [securityError, setSecurityError] = useState(null);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    
    const userMessage = input.trim();
    
    // Security validation - check for malicious patterns
    const validation = validateInput(userMessage);
    if (!validation.isValid) {
      setSecurityError(validation.reason);
      // Auto-clear the error after 5 seconds
      setTimeout(() => setSecurityError(null), 5000);
      return;
    }
    
    setSecurityError(null);
    setInput('');
    setSending(true);
    setStreamBuffer('');

    // Add user message immediately
    setMessages(prev => [...prev, {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString()
    }]);

    try {
      await window.electronAPI.sendChatMessage(userMessage);
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages(prev => [...prev, {
        role: 'error',
        content: 'Failed to send message: ' + error.message,
        timestamp: new Date().toISOString()
      }]);
      setSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    if (window.confirm('Clear all chat messages?')) {
      setMessages([]);
    }
  };

  const toggleVoiceInput = async () => {
    if (!voiceSupported || !isConnected || isTranscribing) return;

    if (isRecording) {
      // Stop recording — the onstop handler will transcribe
      if (voiceRecorderRef.current && voiceRecorderRef.current.state !== 'inactive') {
        voiceRecorderRef.current.stop();
      }
    } else {
      // Start recording audio from microphone
      try {
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
          setIsRecording(false);
          setIsTranscribing(true);

          try {
            const blob = new Blob(voiceChunksRef.current, { type: mimeType || 'audio/webm' });
            const arrayBuffer = await blob.arrayBuffer();
            const result = await window.electronAPI.transcribeAudio(arrayBuffer);

            if (result.success && result.text) {
              setInput(prev => prev + (prev ? ' ' : '') + result.text);
            } else if (!result.success) {
              console.error('Transcription failed:', result.error);
            }
          } catch (err) {
            console.error('Transcription error:', err);
          }
          setIsTranscribing(false);
        };

        voiceRecorderRef.current = recorder;
        recorder.start();
        setIsRecording(true);
      } catch (error) {
        console.error('Failed to start audio recording:', error);
      }
    }
  };

  const isConnected = gatewayStatus === 'running';

  return (
    <div className="chat-container">
      {/* Header */}
      <div style={{ 
        padding: '16px 20px', 
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Chat with NeurAI</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span 
              className="status-dot" 
              style={{ 
                width: 8, 
                height: 8, 
                background: isConnected ? 'var(--accent-success)' : 'var(--accent-danger)' 
              }}
            />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {isConnected ? 'Connected to Gateway' : 'Gateway not running'}
            </span>
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={clearChat}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3,6 5,6 21,6"/>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
          Clear
        </button>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && !streaming ? (
          <div className="empty-state">
            <div style={{ fontSize: 48, marginBottom: 16 }}>💬</div>
            <h3 className="empty-state-title">Start a Conversation</h3>
            <p>Send a message to interact with NeurAI</p>
          </div>
        ) : (
          <>
            {messages.map((msg, index) => (
              <ChatMessage key={index} message={msg} />
            ))}
            
            {/* Streaming message */}
            {streaming && streamBuffer && (
              <div className="chat-message assistant">
                <div style={{ whiteSpace: 'pre-wrap' }}>{streamBuffer}</div>
                <span className="typing-indicator">●●●</span>
              </div>
            )}
            
            {/* Sending indicator */}
            {sending && !streaming && (
              <div className="chat-message assistant" style={{ opacity: 0.7 }}>
                <div className="typing-indicator">
                  <span>●</span><span>●</span><span>●</span>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-container">
        {securityError && (
          <div className="alert alert-danger" style={{ margin: '0 0 12px 0', flex: '0 0 100%' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M15 9l-6 6M9 9l6 6"/>
            </svg>
            <span><strong>Security Alert:</strong> {securityError}. Your message was not sent.</span>
          </div>
        )}
        {!isConnected && (
          <div className="alert alert-warning" style={{ margin: '0 0 12px 0', flex: '0 0 100%' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v4M12 16h.01"/>
            </svg>
            <span>Start the gateway to send messages</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, flex: 1 }}>
          <textarea
            ref={inputRef}
            className="chat-input"
            placeholder={isConnected ? "Type a message..." : "Gateway not running"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={!isConnected || sending}
            rows={1}
            style={{
              resize: 'none',
              minHeight: 44,
              maxHeight: 120
            }}
          />
          {voiceSupported && (
            <button
              className={`voice-input-btn ${isRecording ? 'recording' : ''} ${isTranscribing ? 'transcribing' : ''}`}
              onClick={toggleVoiceInput}
              disabled={!isConnected || sending || isTranscribing}
              title={isTranscribing ? 'Transcribing...' : isRecording ? 'Stop recording' : 'Voice input'}
            >
              {isTranscribing ? (
                <div className="spinner" style={{ width: 16, height: 16 }}></div>
              ) : isRecording ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                  <path d="M19 10v2a7 7 0 01-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              )}
            </button>
          )}
          <button 
            className="btn btn-primary" 
            onClick={sendMessage}
            disabled={!isConnected || !input.trim() || sending}
            style={{ alignSelf: 'flex-end' }}
          >
            {sending ? (
              <div className="spinner" style={{ width: 16, height: 16 }}></div>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22,2 15,22 11,13 2,9"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      <style>{`
        .typing-indicator {
          display: inline-flex;
          gap: 4px;
          padding: 0 4px;
        }
        .typing-indicator span {
          animation: blink 1.4s infinite both;
          font-size: 10px;
        }
        .typing-indicator span:nth-child(2) {
          animation-delay: 0.2s;
        }
        .typing-indicator span:nth-child(3) {
          animation-delay: 0.4s;
        }
        @keyframes blink {
          0%, 80%, 100% { opacity: 0.3; }
          40% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function ChatMessage({ message }) {
  const isUser = message.role === 'user';
  const isError = message.role === 'error';
  
  // Render content blocks (images, text, etc.)
  const renderContentBlocks = () => {
    // If contentBlocks exist, use them; otherwise fall back to plain content
    const blocks = message.contentBlocks || [{ type: 'text', text: message.content }];
    
    return blocks.map((block, index) => {
      switch (block.type) {
        case 'text':
          return (
            <div key={index} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {block.text}
            </div>
          );
        
        case 'image':
          // Handle different image source formats
          const imageSrc = block.source?.url || 
                          (block.source?.data ? `data:${block.source.media_type || 'image/png'};base64,${block.source.data}` : null);
          
          if (imageSrc) {
            return (
              <div key={index} style={{ marginTop: 8, marginBottom: 8 }}>
                <img 
                  src={imageSrc} 
                  alt={block.alt || 'Image'}
                  style={{ 
                    maxWidth: '100%', 
                    maxHeight: 400,
                    borderRadius: 8,
                    border: '1px solid var(--border-color)'
                  }}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    console.error('Failed to load image:', imageSrc);
                  }}
                />
              </div>
            );
          }
          return null;
        
        case 'qr':
        case 'qr_code':
          // QR codes are usually sent as text or base64 images
          const qrData = block.data || block.qr || block.text;
          if (qrData) {
            // If it's base64 or a data URL
            if (qrData.startsWith('data:image') || qrData.length > 100) {
              return (
                <div key={index} style={{ marginTop: 12, marginBottom: 12, textAlign: 'center' }}>
                  <div style={{ 
                    padding: 16, 
                    background: 'white', 
                    borderRadius: 12,
                    display: 'inline-block',
                    border: '2px solid var(--border-color)'
                  }}>
                    <img 
                      src={qrData.startsWith('data:') ? qrData : `data:image/png;base64,${qrData}`}
                      alt="QR Code"
                      style={{ 
                        width: 256,
                        height: 256,
                        display: 'block'
                      }}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = 'data:image/svg+xml,<svg xmlns="http://w.w.w3.org/2000/svg" width="256" height="256"><rect fill="%23f0f0f0" width="256" height="256"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%23999" font-size="16">QR Code</text></svg>';
                      }}
                    />
                  </div>
                  <p style={{ 
                    fontSize: 12, 
                    color: 'var(--text-secondary)', 
                    marginTop: 8 
                  }}>
                    Scan this QR code with your phone
                  </p>
                </div>
              );
            }
          }
          return null;
        
        default:
          // Unknown block type, try to render as text if it has text content
          if (block.text) {
            return (
              <div key={index} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {block.text}
              </div>
            );
          }
          return null;
      }
    }).filter(Boolean); // Remove null entries
  };
  
  return (
    <div className={`chat-message ${isUser ? 'user' : isError ? 'error' : 'assistant'}`}
      style={isError ? { 
        background: 'rgba(239, 68, 68, 0.1)', 
        borderColor: 'rgba(239, 68, 68, 0.3)',
        color: 'var(--accent-danger)'
      } : {}}
    >
      {renderContentBlocks()}
      {message.timestamp && (
        <div style={{ 
          fontSize: 10, 
          opacity: 0.6, 
          marginTop: 6,
          textAlign: isUser ? 'right' : 'left'
        }}>
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

export default Chat;
