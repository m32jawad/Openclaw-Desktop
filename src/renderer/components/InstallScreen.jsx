import React, { useState, useEffect, useCallback } from 'react';

const DependencyStatus = ({ label, status, version }) => {
  const getStatusIndicator = () => {
    if (status === 'checking') {
      return <div className="status-spinner"></div>;
    }
    if (status) {
      return <svg className="status-icon success" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>;
    }
    return <svg className="status-icon pending" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>;
  };

  return (
    <div className="dependency-status">
      <div className="dep-label">{label}</div>
      <div className="dep-version">{status && version ? `(v${version})` : ''}</div>
      <div className="dep-status-icon">{getStatusIndicator()}</div>
    </div>
  );
};

function InstallScreen({ onComplete }) {
  const [status, setStatus] = useState({
    node: { installed: 'checking' },
    npm: { installed: 'checking' },
    openclaw: { installed: 'checking' },
    diskSpace: { available: 'checking' }
  });
  const [installing, setInstalling] = useState(false);
  const [installationLog, setInstallationLog] = useState([]);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState({ percent: 0, message: '' });

  const checkDependencies = useCallback(async () => {
    const deps = await window.electronAPI.checkDependencies();
    setStatus(deps);
    return deps;
  }, []);

  useEffect(() => {
    checkDependencies();

    const unsubscribe = window.electronAPI.onInstallProgress((data) => {
      if (data.percent) {
        setProgress(prev => ({ ...prev, percent: data.percent }));
      }
      if (data.message) {
        setInstallationLog(prev => [...prev, data.message]);
        setProgress(prev => ({ ...prev, message: data.message }));
      }
      if (data.status === 'error') {
        setError(data.message);
        setInstalling(false);
      }
    });

    return () => unsubscribe?.();
  }, [checkDependencies]);

  const handleInstall = async () => {
    setInstalling(true);
    setError(null);
    setInstallationLog([]);
    setProgress({ percent: 0, message: 'Starting installation...' });

    try {
      let deps = await checkDependencies();

      if (!deps.node?.installed) {
        setProgress({ percent: 0, message: 'Installing Node.js...' });
        const result = await window.electronAPI.installNodeJs();
        if (!result.success) throw new Error(result.error);
        deps = await checkDependencies(); // Re-check after node install
      }

      if (!deps.openclaw?.installed) {
        setProgress({ percent: 50, message: 'Installing NeurAI...' });
        const result = await window.electronAPI.installOpenClaw();
        if (!result.success) throw new Error(result.error);
        deps = await checkDependencies(); // Re-check after openclaw install
      }
      
      setProgress({ percent: 100, message: 'Installation complete!' });
      setInstallationLog(prev => [...prev, 'All dependencies installed successfully!']);
      setInstalling(false);
      
      // Update status to show Continue button
      await checkDependencies();

    } catch (err) {
      setError(err.message);
      setInstalling(false);
    }
  };

  const allReady = status.node?.installed && status.npm?.installed && status.openclaw?.installed;
  const isChecking = Object.values(status).some(s => s.installed === 'checking');

  return (
    <div className="container">
      <div className="sidebar">
        <div className="logo">
          <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          <h2>NeurAI</h2>
        </div>
        <div className="step-list">
          <div className={`step ${!allReady ? 'active' : ''}`}>
            <div className="step-number">1</div>
            <div className="step-title">System Check</div>
          </div>
          <div className={`step ${allReady ? 'active' : ''}`}>
            <div className="step-number">2</div>
            <div className="step-title">Ready to Go</div>
          </div>
        </div>
        <div className="footer">
          <p>Version 1.0.0</p>
        </div>
      </div>
      <div className="main-content">
        <div className="header">
          <h1>Welcome to NeurAI</h1>
          <p>We'll guide you through the setup process.</p>
        </div>
        
        <div className="card">
          <h3>Dependency Status</h3>
          <p>Checking for required components on your system.</p>
          <div className="dependency-list">
            <DependencyStatus label="Node.js Runtime" status={status.node?.installed} version={status.node?.version} />
            <DependencyStatus label="NPM Package Manager" status={status.npm?.installed} version={status.npm?.version} />
            <DependencyStatus label="NeurAI Engine" status={status.openclaw?.installed} version={status.openclaw?.version} />
            <DependencyStatus label="Disk Space (1GB+)" status={status.diskSpace?.available} version={status.diskSpace?.freeSpace} />
          </div>
        </div>

        {installing && (
          <div className="card">
            <h3>Installation Progress</h3>
            <div className="progress-bar">
              <div className="progress-bar-inner" style={{ width: `${progress.percent}%` }}></div>
            </div>
            <p className="progress-message">{progress.message}</p>
            <div className="installation-log">
              {installationLog.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          </div>
        )}

        {error && (
          <div className="card error-card">
            <h3>Installation Failed</h3>
            <p>{error}</p>
            <button onClick={handleInstall} disabled={installing}>
              {installing ? 'Retrying...' : 'Retry Installation'}
            </button>
          </div>
        )}

        <div className="action-area">
          {allReady ? (
            <>
              <p>Your system is ready!</p>
              <button onClick={onComplete}>Continue to App</button>
            </>
          ) : (
            <button onClick={handleInstall} disabled={installing || isChecking}>
              {installing ? 'Installing...' : 'Install Dependencies'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default InstallScreen;
