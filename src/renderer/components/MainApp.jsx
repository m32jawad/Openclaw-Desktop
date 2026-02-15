import React, { useState, useEffect } from 'react';
import Dashboard from './Dashboard';
import Channels from './Channels';
import Config from './Config';
import Chat from './Chat';
import Logs from './Logs';
import Recorder from './Recorder';
import Workflows from './Workflows';
import Terminal from './Terminal';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'chat', label: 'Chat', icon: 'chat' },
  { id: 'terminal', label: 'Terminal', icon: 'terminal' },
  { id: 'recorder', label: 'Recorder', icon: 'recorder' },
  { id: 'workflows', label: 'Workflows', icon: 'workflows' },
  { id: 'channels', label: 'Channels', icon: 'channels' },
  { id: 'config', label: 'Configuration', icon: 'config' },
  { id: 'logs', label: 'Logs', icon: 'logs' }
];

function MainApp() {
  const [activeView, setActiveView] = useState('dashboard');
  const [gatewayStatus, setGatewayStatus] = useState('stopped');
  const [workflowsReloadTrigger, setWorkflowsReloadTrigger] = useState(0);

  useEffect(() => {
    // Subscribe to gateway status changes
    const unsubscribe = window.electronAPI.onGatewayStatus((status) => {
      setGatewayStatus(status);
    });

    // Get initial status
    window.electronAPI.getGatewayStatus().then(status => {
      setGatewayStatus(status.status || 'stopped');
    });

    return () => unsubscribe?.();
  }, []);

  const handleWorkflowCreated = () => {
    // Trigger workflows list reload by incrementing the trigger
    setWorkflowsReloadTrigger(prev => prev + 1);
    // Switch to workflows view
    setActiveView('workflows');
  };

  const renderIcon = (iconName) => {
    switch (iconName) {
      case 'dashboard':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7"/>
            <rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/>
          </svg>
        );
      case 'chat':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
        );
      case 'channels':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/>
            <path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
        );
      case 'config':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
        );
      case 'logs':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10,9 9,9 8,9"/>
          </svg>
        );
      case 'recorder':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="4" fill="currentColor"/>
          </svg>
        );
      case 'workflows':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="16,3 21,3 21,8"/>
            <line x1="4" y1="20" x2="21" y2="3"/>
            <polyline points="21,16 21,21 16,21"/>
            <line x1="15" y1="15" x2="21" y2="21"/>
            <line x1="4" y1="4" x2="9" y2="9"/>
          </svg>
        );
      case 'terminal':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="4,17 10,11 4,5"/>
            <line x1="12" y1="19" x2="20" y2="19"/>
          </svg>
        );
      default:
        return null;
    }
  };

  // Render all components but hide inactive ones to preserve state
  const renderContent = () => {
    return (
      <>
        <div style={{ display: activeView === 'dashboard' ? 'block' : 'none' }}>
          <Dashboard gatewayStatus={gatewayStatus} />
        </div>
        <div style={{ display: activeView === 'chat' ? 'block' : 'none' }}>
          <Chat gatewayStatus={gatewayStatus} />
        </div>
        <div style={{ display: activeView === 'terminal' ? 'block' : 'none' }}>
          <Terminal />
        </div>
        <div style={{ display: activeView === 'recorder' ? 'block' : 'none' }}>
          <Recorder onWorkflowCreated={handleWorkflowCreated} />
        </div>
        <div style={{ display: activeView === 'workflows' ? 'block' : 'none' }}>
          <Workflows 
            onNavigateToRecorder={() => setActiveView('recorder')} 
            reloadTrigger={workflowsReloadTrigger}
            gatewayStatus={gatewayStatus}
          />
        </div>
        <div style={{ display: activeView === 'channels' ? 'block' : 'none' }}>
          <Channels />
        </div>
        <div style={{ display: activeView === 'config' ? 'block' : 'none' }}>
          <Config />
        </div>
        <div style={{ display: activeView === 'logs' ? 'block' : 'none' }}>
          <Logs />
        </div>
      </>
    );
  };

  return (
    <div className="main-layout">
      <nav className="sidebar">
        <div className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              className={`sidebar-item ${activeView === item.id ? 'active' : ''}`}
              onClick={() => setActiveView(item.id)}
            >
              {renderIcon(item.icon)}
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8,
            padding: '8px 12px',
            background: 'var(--bg-tertiary)',
            borderRadius: 8
          }}>
            <div 
              className="status-dot" 
              style={{ 
                background: gatewayStatus === 'running' ? 'var(--accent-success)' : 'var(--accent-danger)'
              }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Gateway: {gatewayStatus === 'running' ? 'Running' : 'Stopped'}
            </span>
          </div>
        </div>
      </nav>

      <main className="content">
        {renderContent()}
      </main>
    </div>
  );
}

export default MainApp;
