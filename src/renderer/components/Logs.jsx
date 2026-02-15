import React, { useState, useEffect, useRef } from 'react';

function Logs() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('all'); // all, info, warn, error
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef(null);

  useEffect(() => {
    // Subscribe to gateway logs
    const unsubscribe = window.electronAPI.onGatewayLog((log) => {
      setLogs(prev => [...prev.slice(-999), log]); // Keep last 1000 logs
    });

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (autoScroll) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter(log => {
    // Filter by level
    if (filter !== 'all' && log.level !== filter) {
      return false;
    }
    // Filter by search
    if (search && !log.message.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  const clearLogs = () => {
    setLogs([]);
  };

  const exportLogs = () => {
    const content = filteredLogs
      .map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`)
      .join('\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openclaw-logs-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getLogStats = () => {
    const stats = { info: 0, warn: 0, error: 0 };
    logs.forEach(log => {
      if (stats[log.level] !== undefined) {
        stats[log.level]++;
      }
    });
    return stats;
  };

  const stats = getLogStats();

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Logs</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Monitor gateway activity and debug issues
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3" style={{ marginBottom: 20, gap: 12 }}>
        <div 
          className={`stat-card ${filter === 'info' ? 'active' : ''}`}
          style={{ 
            padding: 12, 
            cursor: 'pointer',
            border: filter === 'info' ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)'
          }}
          onClick={() => setFilter(filter === 'info' ? 'all' : 'info')}
        >
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-primary)' }}>
            {stats.info}
          </div>
          <div className="stat-label">Info</div>
        </div>
        <div 
          className={`stat-card ${filter === 'warn' ? 'active' : ''}`}
          style={{ 
            padding: 12, 
            cursor: 'pointer',
            border: filter === 'warn' ? '2px solid var(--accent-warning)' : '1px solid var(--border-color)'
          }}
          onClick={() => setFilter(filter === 'warn' ? 'all' : 'warn')}
        >
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-warning)' }}>
            {stats.warn}
          </div>
          <div className="stat-label">Warnings</div>
        </div>
        <div 
          className={`stat-card ${filter === 'error' ? 'active' : ''}`}
          style={{ 
            padding: 12, 
            cursor: 'pointer',
            border: filter === 'error' ? '2px solid var(--accent-danger)' : '1px solid var(--border-color)'
          }}
          onClick={() => setFilter(filter === 'error' ? 'all' : 'error')}
        >
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-danger)' }}>
            {stats.error}
          </div>
          <div className="stat-label">Errors</div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ height: 38 }}
          />
        </div>
        
        <select
          className="form-select"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 120, height: 38 }}
        >
          <option value="all">All Levels</option>
          <option value="info">Info</option>
          <option value="warn">Warning</option>
          <option value="error">Error</option>
        </select>

        <div className="toggle-container" style={{ gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Auto-scroll</span>
          <div 
            className={`toggle ${autoScroll ? 'active' : ''}`}
            onClick={() => setAutoScroll(!autoScroll)}
            style={{ width: 36, height: 20 }}
          />
        </div>

        <button className="btn btn-secondary btn-sm" onClick={exportLogs}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7,10 12,15 17,10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export
        </button>

        <button className="btn btn-danger btn-sm" onClick={clearLogs}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3,6 5,6 21,6"/>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
          Clear
        </button>
      </div>

      {/* Logs Container */}
      <div className="logs-container" style={{ flex: 1, minHeight: 0 }}>
        {filteredLogs.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <p style={{ color: 'var(--text-muted)' }}>
              {logs.length === 0 
                ? 'No logs yet. Start the gateway to see activity.'
                : 'No logs match your filters.'}
            </p>
          </div>
        ) : (
          filteredLogs.map((log, index) => (
            <LogEntry key={index} log={log} />
          ))
        )}
        <div ref={logsEndRef} />
      </div>

      <div style={{ 
        padding: '12px 0', 
        borderTop: '1px solid var(--border-color)',
        marginTop: 12,
        fontSize: 12,
        color: 'var(--text-muted)',
        display: 'flex',
        justifyContent: 'space-between'
      }}>
        <span>Showing {filteredLogs.length} of {logs.length} logs</span>
        <span>
          {filter !== 'all' && `Filtered by: ${filter}`}
          {search && ` | Search: "${search}"`}
        </span>
      </div>
    </div>
  );
}

function LogEntry({ log }) {
  const levelColors = {
    info: 'var(--accent-primary)',
    warn: 'var(--accent-warning)',
    error: 'var(--accent-danger)'
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="log-entry">
      <span className="log-timestamp">
        {formatTimestamp(log.timestamp)}
      </span>
      <span 
        className={`log-level ${log.level}`}
        style={{ color: levelColors[log.level] || 'var(--text-secondary)' }}
      >
        [{log.level?.toUpperCase() || 'LOG'}]
      </span>
      <span className="log-message">
        {log.message}
      </span>
    </div>
  );
}

export default Logs;
