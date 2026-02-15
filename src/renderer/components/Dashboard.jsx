import React, { useState, useEffect } from 'react';

function Dashboard({ gatewayStatus }) {
  const [status, setStatus] = useState({
    status: gatewayStatus,
    port: 18789,
    wsConnected: false
  });
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [config, setConfig] = useState(null);

  useEffect(() => {
    loadData();
    
    // Subscribe to status updates
    const unsubscribe = window.electronAPI.onGatewayStatus((newStatus) => {
      setStatus(prev => ({ ...prev, status: newStatus }));
      setStarting(false);
      setStopping(false);
    });

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    setStatus(prev => ({ ...prev, status: gatewayStatus }));
  }, [gatewayStatus]);

  const loadData = async () => {
    try {
      const [statusResult, configResult] = await Promise.all([
        window.electronAPI.getGatewayStatus(),
        window.electronAPI.getConfig()
      ]);
      setStatus(statusResult);
      setConfig(configResult);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const startGateway = async () => {
    if (starting) return; // Prevent double-clicking
    setStarting(true);
    try {
      await window.electronAPI.startGateway();
      // Don't reset starting here - wait for status event
    } catch (error) {
      console.error('Failed to start gateway:', error);
      setStarting(false);
    }
  };

  const stopGateway = async () => {
    if (stopping) return; // Prevent double-clicking
    setStopping(true);
    try {
      await window.electronAPI.stopGateway();
      // Don't reset stopping here - wait for status event
    } catch (error) {
      console.error('Failed to stop gateway:', error);
      setStopping(false);
    }
  };

  const restartGateway = async () => {
    if (starting) return; // Prevent double-clicking
    setStarting(true);
    setStopping(true);
    try {
      await window.electronAPI.restartGateway();
      // Don't reset states here - wait for status events
    } catch (error) {
      console.error('Failed to restart gateway:', error);
      setStarting(false);
      setStopping(false);
    }
  };

  const forceCleanupAndRestart = async () => {
    if (!window.confirm('This will forcefully kill all OpenClaw gateway processes and restart. Continue?')) {
      return;
    }
    
    setStarting(true);
    setStopping(true);
    
    try {
      // Force cleanup first
      await window.electronAPI.forceCleanupGateway();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Now start fresh
      await window.electronAPI.startGateway();
    } catch (error) {
      console.error('Failed to force cleanup and restart:', error);
      setStarting(false);
      setStopping(false);
    }
  };

  const isRunning = status.status === 'running' || status.running;
  const isStarting = starting || status.status === 'starting';
  const isStopping = stopping;

  // Determine status badge
  const getStatusBadge = () => {
    if (isStarting && !isRunning) {
      return { className: 'warning', text: 'Starting...', showSpinner: true };
    }
    if (isStopping) {
      return { className: 'warning', text: 'Stopping...', showSpinner: true };
    }
    if (isRunning) {
      return { className: 'running', text: 'Running', showSpinner: false };
    }
    return { className: 'stopped', text: 'Stopped', showSpinner: false };
  };

  const statusBadge = getStatusBadge();

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Dashboard</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Monitor and control your OpenClaw gateway
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-3" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Gateway Status</span>
            <span className={`status-badge ${statusBadge.className}`}>
              {statusBadge.showSpinner ? (
                <div className="spinner" style={{ width: 12, height: 12, borderWidth: '2px' }}></div>
              ) : (
                <span className="status-dot"></span>
              )}
              {statusBadge.text}
            </span>
          </div>
          <div className="stat-value">
            {status.port || 18789}
            {status.port && (
              <button 
                className="btn btn-sm btn-ghost" 
                style={{ marginLeft: 8, padding: '2px 8px', fontSize: 12 }}
                onClick={() => {
                  const token = config?.gateway?.auth?.token;
                  window.electronAPI.openExternal(`http://localhost:${status.port}/dashboard?token=${token}`);
                }}
                disabled={!isRunning}
                title="Open OpenClaw Web Dashboard"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
              </button>
            )}
          </div>
          <div className="stat-label">Port</div>
        </div>

        <div className="stat-card">
          <div style={{ marginBottom: 16, color: 'var(--text-secondary)' }}>Active Model</div>
          <div style={{ fontSize: 16, fontWeight: 500, wordBreak: 'break-word' }}>
            {config?.agent?.model || 'Not configured'}
          </div>
          <div className="stat-label" style={{ marginTop: 8 }}>
            Thinking: {config?.agent?.thinkingLevel || 'low'}
          </div>
        </div>

        <div className="stat-card">
          <div style={{ marginBottom: 16, color: 'var(--text-secondary)' }}>Channels</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ChannelStatus 
              label="WhatsApp" 
              emoji="📱" 
              enabled={config?.channels?.whatsapp?.enabled} 
            />
            <ChannelStatus 
              label="Telegram" 
              emoji="✈️" 
              enabled={config?.channels?.telegram?.enabled} 
            />
            <ChannelStatus 
              label="Discord" 
              emoji="🎮" 
              enabled={config?.channels?.discord?.enabled} 
            />
          </div>
        </div>
      </div>

      {/* Gateway Control */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Gateway Control</h3>
            <p className="card-subtitle">Start, stop, or restart the OpenClaw gateway</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {!isRunning ? (
            <button 
              className="btn btn-success" 
              onClick={startGateway}
              disabled={starting}
              style={{ minWidth: 160 }}
            >
              {starting ? (
                <>
                  <div className="spinner"></div>
                  Connecting...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5,3 19,12 5,21"/>
                  </svg>
                  Start Gateway
                </>
              )}
            </button>
          ) : (
            <>
              <button 
                className="btn btn-danger" 
                onClick={stopGateway}
                disabled={stopping}
                style={{ minWidth: 160 }}
              >
                {stopping ? (
                  <>
                    <div className="spinner"></div>
                    Stopping...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="6" width="12" height="12"/>
                    </svg>
                    Stop Gateway
                  </>
                )}
              </button>
              
              <button 
                className="btn btn-secondary" 
                onClick={restartGateway}
                disabled={starting || stopping}
              >
                {(starting || stopping) ? (
                  <>
                    <div className="spinner"></div>
                    Restarting...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 4v6h-6"/>
                      <path d="M1 20v-6h6"/>
                      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10"/>
                      <path d="M20.49 15a9 9 0 01-14.85 3.36L1 14"/>
                    </svg>
                    Restart
                  </>
                )}
              </button>
            </>
          )}
          
          {isRunning && (
            <button 
              className="btn btn-primary" 
              onClick={() => window.electronAPI.openExternal(`http://localhost:${status.port || 18789}`)}
              style={{ marginLeft: 'auto' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                <polyline points="15,3 21,3 21,9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              Open Web View
            </button>
          )}
        </div>
        {/* Emergency Controls */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-color)' }}>
          <details style={{ cursor: 'pointer' }}>
            <summary style={{ fontSize: 13, color: 'var(--text-muted)', userSelect: 'none' }}>
              🔧 Advanced / Emergency Controls
            </summary>
            <div style={{ marginTop: 12, padding: 12, background: 'rgba(239, 68, 68, 0.05)', borderRadius: 8, border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                ⚠️ Use these controls only if the gateway is not responding or you're experiencing startup issues.
              </p>
              <button 
                className="btn btn-danger btn-sm"
                onClick={forceCleanupAndRestart}
                disabled={starting || stopping}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="1,4 1,10 7,10"/>
                  <path d="M3.51 15a9 9 0 1014.85-3.36L3.51 15z"/>
                  <line x1="22" y1="4" x2="18" y2="8"/>
                  <line x1="18" y1="4" x2="22" y2="8"/>
                </svg>
                Force Kill All Processes & Restart
              </button>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                This will terminate all openclaw gateway processes running on your system and start fresh.
              </p>
            </div>
          </details>
        </div>
        {isRunning && status.wsConnected && (
          <div className="alert alert-success" style={{ marginTop: 16, marginBottom: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20,6 9,17 4,12"/>
            </svg>
            <span>WebSocket connected - ready to receive messages</span>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Quick Actions</h3>
        </div>

        <div className="grid grid-cols-2" style={{ gap: 12 }}>
          <QuickAction 
            icon="💬" 
            title="Open Chat" 
            description="Send messages to OpenClaw"
            onClick={() => {}}
          />
          <QuickAction 
            icon="📱" 
            title="Connect WhatsApp" 
            description="Scan QR code to connect"
            onClick={() => {}}
          />
          <QuickAction 
            icon="⚙️" 
            title="Edit Config" 
            description="Modify gateway settings"
            onClick={() => {}}
          />
          <QuickAction 
            icon="📋" 
            title="View Logs" 
            description="Monitor gateway activity"
            onClick={() => {}}
          />
        </div>
      </div>

      {/* Agent Info */}
      {config?.agent && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Agent Configuration</h3>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ 
              width: 60, 
              height: 60, 
              background: 'var(--bg-tertiary)', 
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28
            }}>
              🦞
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>
                OpenClaw Agent
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                Model: {config.agents?.defaults?.model?.primary || config.agent?.model || 'Not configured'}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                Gateway: {config.gateway?.mode || 'local'} mode
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChannelStatus({ label, emoji, enabled }) {
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: 6,
      padding: '6px 10px',
      background: enabled ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-tertiary)',
      borderRadius: 6,
      fontSize: 12
    }}>
      <span>{emoji}</span>
      <span style={{ color: enabled ? 'var(--accent-success)' : 'var(--text-muted)' }}>
        {label}
      </span>
    </div>
  );
}

function QuickAction({ icon, title, description, onClick }) {
  return (
    <button 
      onClick={onClick}
      style={{ 
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 16,
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--border-color)',
        borderRadius: 8,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.2s'
      }}
      onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
      onMouseOut={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
    >
      <span style={{ fontSize: 24 }}>{icon}</span>
      <div>
        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{description}</div>
      </div>
    </button>
  );
}

export default Dashboard;
