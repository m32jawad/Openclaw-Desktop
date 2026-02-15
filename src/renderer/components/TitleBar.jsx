import React from 'react';

function TitleBar() {
  const handleMinimize = () => {
    window.electronAPI.minimizeWindow();
  };

  const handleMaximize = () => {
    window.electronAPI.maximizeWindow();
  };

  const handleClose = () => {
    window.electronAPI.closeWindow();
  };

  return (
    <div className="title-bar">
      <div className="title-bar-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        OpenClaw Desktop
      </div>
      
      <div className="title-bar-controls">
        <button className="title-bar-btn" onClick={handleMinimize} title="Minimize">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect width="10" height="1" x="1" y="6" fill="currentColor"/>
          </svg>
        </button>
        
        <button className="title-bar-btn" onClick={handleMaximize} title="Maximize">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect width="9" height="9" x="1.5" y="1.5" fill="none" stroke="currentColor"/>
          </svg>
        </button>
        
        <button className="title-bar-btn close" onClick={handleClose} title="Close">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

export default TitleBar;
