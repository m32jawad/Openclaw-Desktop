import React, { useState, useEffect } from 'react';

function Channels() {
  const [activeTab, setActiveTab] = useState('whatsapp');
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    const cfg = await window.electronAPI.getConfig();
    setConfig(cfg);
  };

  const saveChannelConfig = async (channel, data) => {
    setSaving(true);
    try {
      const updated = {
        ...config,
        channels: {
          ...config.channels,
          [channel]: { ...config.channels[channel], ...data }
        }
      };
      await window.electronAPI.saveConfig(updated);
      setConfig(updated);
    } catch (error) {
      console.error('Failed to save config:', error);
    }
    setSaving(false);
  };

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Channels</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Configure messaging channels to communicate with your AI agent
        </p>
      </div>

      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'whatsapp' ? 'active' : ''}`}
          onClick={() => setActiveTab('whatsapp')}
        >
          📱 WhatsApp
        </button>
        <button 
          className={`tab ${activeTab === 'telegram' ? 'active' : ''}`}
          onClick={() => setActiveTab('telegram')}
        >
          ✈️ Telegram
        </button>
        <button 
          className={`tab ${activeTab === 'discord' ? 'active' : ''}`}
          onClick={() => setActiveTab('discord')}
        >
          🎮 Discord
        </button>
      </div>

      {activeTab === 'whatsapp' && (
        <WhatsAppConfig 
          config={config?.channels?.whatsapp} 
          onSave={(data) => saveChannelConfig('whatsapp', data)}
          saving={saving}
        />
      )}
      {activeTab === 'telegram' && (
        <TelegramConfig 
          config={config?.channels?.telegram} 
          onSave={(data) => saveChannelConfig('telegram', data)}
          saving={saving}
        />
      )}
      {activeTab === 'discord' && (
        <DiscordConfig 
          config={config?.channels?.discord} 
          onSave={(data) => saveChannelConfig('discord', data)}
          saving={saving}
        />
      )}
    </div>
  );
}

function WhatsAppConfig({ config, onSave, saving }) {
  const [enabled, setEnabled] = useState(config?.enabled || false);
  const [allowedNumbers, setAllowedNumbers] = useState(config?.allowedNumbers || []);
  const [newNumber, setNewNumber] = useState('');
  const [qrCode, setQrCode] = useState(null);
  const [loadingQR, setLoadingQR] = useState(false);

  useEffect(() => {
    if (config) {
      setEnabled(config.enabled || false);
      setAllowedNumbers(config.allowedNumbers || []);
    }
  }, [config]);

  const toggleEnabled = () => {
    const newEnabled = !enabled;
    setEnabled(newEnabled);
    onSave({ enabled: newEnabled });
  };

  const addNumber = () => {
    if (newNumber && !allowedNumbers.includes(newNumber)) {
      const updated = [...allowedNumbers, newNumber];
      setAllowedNumbers(updated);
      setNewNumber('');
      onSave({ allowedNumbers: updated });
    }
  };

  const removeNumber = (number) => {
    const updated = allowedNumbers.filter(n => n !== number);
    setAllowedNumbers(updated);
    onSave({ allowedNumbers: updated });
  };

  const showQRCode = async () => {
    setLoadingQR(true);
    try {
      const result = await window.electronAPI.getWhatsAppQR();
      if (result.success && result.qr) {
        setQrCode(result.qr);
      }
    } catch (error) {
      console.error('Failed to get QR code:', error);
    }
    setLoadingQR(false);
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">WhatsApp Connection</h3>
            <p className="card-subtitle">Connect your WhatsApp account to chat with the AI</p>
          </div>
          <div 
            className={`toggle ${enabled ? 'active' : ''}`}
            onClick={toggleEnabled}
          />
        </div>

        {enabled && (
          <>
            <div style={{ marginBottom: 24 }}>
              <button 
                className="btn btn-primary"
                onClick={showQRCode}
                disabled={loadingQR}
              >
                {loadingQR ? (
                  <>
                    <div className="spinner"></div>
                    Loading QR...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="7" height="7"/>
                      <rect x="14" y="3" width="7" height="7"/>
                      <rect x="14" y="14" width="7" height="7"/>
                      <rect x="3" y="14" width="7" height="7"/>
                    </svg>
                    Show QR Code
                  </>
                )}
              </button>
            </div>

            {qrCode && (
              <div className="alert alert-info" style={{ marginBottom: 24 }}>
                <div style={{ textAlign: 'center', width: '100%' }}>
                  <p style={{ marginBottom: 12 }}>Scan this QR code with your WhatsApp app:</p>
                  <div style={{ 
                    background: 'white', 
                    padding: 16, 
                    display: 'inline-block', 
                    borderRadius: 8 
                  }}>
                    {/* QR Code would be rendered here - using placeholder */}
                    <div style={{ 
                      width: 200, 
                      height: 200, 
                      background: '#f0f0f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#333',
                      fontSize: 12
                    }}>
                      QR Code: {qrCode.substring(0, 20)}...
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {enabled && (
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Allowed Numbers</h3>
              <p className="card-subtitle">Only these numbers can interact with the bot</p>
            </div>
          </div>

          <div className="input-with-button" style={{ marginBottom: 16 }}>
            <input
              type="text"
              className="form-input"
              placeholder="+923001234567"
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addNumber()}
            />
            <button className="btn btn-primary" onClick={addNumber}>
              Add
            </button>
          </div>

          {allowedNumbers.length > 0 ? (
            <div className="list">
              {allowedNumbers.map((number, index) => (
                <div key={index} className="list-item">
                  <span>📱 {number}</span>
                  <button 
                    className="btn btn-danger btn-sm"
                    onClick={() => removeNumber(number)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: 20 }}>
              <p style={{ color: 'var(--text-muted)' }}>No allowed numbers configured</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TelegramConfig({ config, onSave, saving }) {
  const [enabled, setEnabled] = useState(config?.enabled || false);
  const [botToken, setBotToken] = useState(config?.botToken || '');

  useEffect(() => {
    if (config) {
      setEnabled(config.enabled || false);
      setBotToken(config.botToken || '');
    }
  }, [config]);

  const toggleEnabled = () => {
    const newEnabled = !enabled;
    setEnabled(newEnabled);
    onSave({ enabled: newEnabled });
  };

  const saveToken = () => {
    onSave({ botToken });
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Telegram Bot</h3>
            <p className="card-subtitle">Connect a Telegram bot to chat with the AI</p>
          </div>
          <div 
            className={`toggle ${enabled ? 'active' : ''}`}
            onClick={toggleEnabled}
          />
        </div>

        {enabled && (
          <>
            <div className="form-group">
              <label className="form-label">Bot Token</label>
              <div className="input-with-button">
                <input
                  type="password"
                  className="form-input"
                  placeholder="123456789:ABCdefGHIjklMNO..."
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                />
                <button 
                  className="btn btn-primary" 
                  onClick={saveToken}
                  disabled={saving}
                >
                  {saving ? <div className="spinner"></div> : 'Save'}
                </button>
              </div>
              <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                Get your token from @BotFather on Telegram
              </p>
            </div>

            <div className="alert alert-info">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4M12 8h.01"/>
              </svg>
              <div>
                <strong>How to create a Telegram bot:</strong>
                <ol style={{ marginTop: 8, paddingLeft: 16, fontSize: 13 }}>
                  <li>Open Telegram and search for @BotFather</li>
                  <li>Send /newbot and follow the instructions</li>
                  <li>Copy the token and paste it here</li>
                </ol>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DiscordConfig({ config, onSave, saving }) {
  const [enabled, setEnabled] = useState(config?.enabled || false);
  const [botToken, setBotToken] = useState(config?.botToken || '');

  useEffect(() => {
    if (config) {
      setEnabled(config.enabled || false);
      setBotToken(config.botToken || '');
    }
  }, [config]);

  const toggleEnabled = () => {
    const newEnabled = !enabled;
    setEnabled(newEnabled);
    onSave({ enabled: newEnabled });
  };

  const saveToken = () => {
    onSave({ botToken });
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Discord Bot</h3>
            <p className="card-subtitle">Connect a Discord bot to chat with the AI</p>
          </div>
          <div 
            className={`toggle ${enabled ? 'active' : ''}`}
            onClick={toggleEnabled}
          />
        </div>

        {enabled && (
          <>
            <div className="form-group">
              <label className="form-label">Bot Token</label>
              <div className="input-with-button">
                <input
                  type="password"
                  className="form-input"
                  placeholder="MTIzNDU2Nzg5..."
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                />
                <button 
                  className="btn btn-primary" 
                  onClick={saveToken}
                  disabled={saving}
                >
                  {saving ? <div className="spinner"></div> : 'Save'}
                </button>
              </div>
              <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                Get your token from the Discord Developer Portal
              </p>
            </div>

            <div className="alert alert-info">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4M12 8h.01"/>
              </svg>
              <div>
                <strong>How to create a Discord bot:</strong>
                <ol style={{ marginTop: 8, paddingLeft: 16, fontSize: 13 }}>
                  <li>Go to discord.com/developers/applications</li>
                  <li>Create a new application</li>
                  <li>Go to Bot section and create a bot</li>
                  <li>Copy the token and paste it here</li>
                </ol>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Channels;
