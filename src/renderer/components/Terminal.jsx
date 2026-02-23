import React, { useState, useRef, useEffect } from 'react';

function Terminal() {
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState([]);
  const [executing, setExecuting] = useState(false);
  const terminalEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const quickCommands = [
    { label: 'Doctor (Fix Config)', command: 'doctor --fix', description: 'Auto-fix config issues' },
    { label: 'Doctor (Check)', command: 'doctor', description: 'Check for issues' },
    { label: 'Gateway Status', command: 'gateway --status', description: 'Check gateway status' },
    { label: 'List Channels', command: 'channels list', description: 'Show configured channels' },
    { label: 'Show Config', command: 'config show', description: 'Display current config' },
    { label: 'Update NeurAI', command: 'update', description: 'Update to latest version' }
  ];

  const handleExecute = async (cmd) => {
    if (!cmd.trim() || executing) return;

    const commandToRun = cmd.trim();
    setExecuting(true);
    
    // Add command to history
    setHistory(prev => [...prev, { type: 'command', text: commandToRun, timestamp: new Date() }]);

    try {
      const result = await window.electronAPI.runOpenClawCLI(commandToRun);
      
      setHistory(prev => [...prev, {
        type: 'output',
        success: result.success,
        text: result.output || result.error || 'No output',
        code: result.code,
        timestamp: new Date()
      }]);
    } catch (error) {
      setHistory(prev => [...prev, {
        type: 'output',
        success: false,
        text: `Error: ${error.message}`,
        timestamp: new Date()
      }]);
    }

    setCommand('');
    setExecuting(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleExecute(command);
    }
  };

  const handleQuickCommand = (cmd) => {
    setCommand(cmd);
    inputRef.current?.focus();
  };

  const clearTerminal = () => {
    setHistory([]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 20 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 24, marginBottom: 8 }}>NeurAI Terminal</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Run NeurAI CLI commands directly from the app
        </p>
      </div>

      {/* Quick Commands */}
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ fontSize: 14, marginBottom: 12, color: 'var(--text-secondary)' }}>
          Quick Commands
        </h4>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {quickCommands.map((qc, i) => (
            <button
              key={i}
              className="btn btn-secondary"
              onClick={() => handleQuickCommand(qc.command)}
              style={{ fontSize: 13, padding: '6px 12px' }}
              title={qc.description}
            >
              {qc.label}
            </button>
          ))}
          <button
            className="btn btn-ghost"
            onClick={clearTerminal}
            style={{ fontSize: 13, padding: '6px 12px' }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Terminal Output */}
      <div
        style={{
          flex: 1,
          background: '#0a0a0a',
          border: '1px solid var(--border-color)',
          borderRadius: 8,
          padding: 16,
          fontFamily: 'Consolas, Monaco, "Courier New", monospace',
          fontSize: 13,
          overflow: 'auto',
          marginBottom: 16
        }}
      >
        {history.length === 0 ? (
          <div style={{ color: '#666', fontStyle: 'italic' }}>
            No commands executed yet. Type a command below or use quick commands.
          </div>
        ) : (
          history.map((entry, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              {entry.type === 'command' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ color: '#66d9ef' }}>$</span>
                  <span style={{ color: '#a6e22e' }}>openclaw</span>
                  <span style={{ color: '#f8f8f2' }}>{entry.text}</span>
                </div>
              ) : (
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: entry.success ? '#f8f8f2' : '#f92672',
                    background: 'rgba(0,0,0,0.3)',
                    padding: 8,
                    borderRadius: 4,
                    borderLeft: `3px solid ${entry.success ? '#a6e22e' : '#f92672'}`
                  }}
                >
                  {entry.text}
                  {entry.code !== undefined && entry.code !== 0 && (
                    <div style={{ marginTop: 8, color: '#f92672' }}>
                      Exit code: {entry.code}
                    </div>
                  )}
                </pre>
              )}
            </div>
          ))
        )}
        <div ref={terminalEndRef} />
      </div>

      {/* Command Input */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: '#0a0a0a',
          border: '1px solid var(--border-color)',
          borderRadius: 8,
          padding: '8px 12px',
          fontFamily: 'Consolas, Monaco, "Courier New", monospace',
          fontSize: 13
        }}>
          <span style={{ color: '#66d9ef' }}>$</span>
          <span style={{ color: '#a6e22e' }}>openclaw</span>
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={executing}
            placeholder="doctor --fix"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f8f8f2',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              padding: 0
            }}
          />
        </div>
        <button
          className="btn btn-primary"
          onClick={() => handleExecute(command)}
          disabled={executing || !command.trim()}
          style={{ minWidth: 100 }}
        >
          {executing ? (
            <>
              <div className="spinner"></div>
              Running...
            </>
          ) : (
            'Execute'
          )}
        </button>
      </div>

      <div style={{
        marginTop: 12,
        fontSize: 12,
        color: 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4M12 8h.01"/>
        </svg>
        Press Enter to execute. Commands run with your installed NeurAI version.
      </div>
    </div>
  );
}

export default Terminal;
