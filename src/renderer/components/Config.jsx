import React, { useState, useEffect } from 'react';

function Config() {
  const [activeTab, setActiveTab] = useState('gateway');
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    const cfg = await window.electronAPI.getConfig();
    setConfig(cfg);
  };

  const saveConfig = async (newConfig) => {
    setSaving(true);
    setSaved(false);
    try {
      await window.electronAPI.saveConfig(newConfig);
      setConfig(newConfig);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save config:', error);
    }
    setSaving(false);
  };

  const updateSection = (section, data) => {
    const updated = {
      ...config,
      [section]: { ...config[section], ...data }
    };
    setConfig(updated);
    return updated;
  };

  if (!config) {
    return (
      <div className="empty-state">
        <div className="spinner" style={{ width: 32, height: 32 }}></div>
        <p style={{ marginTop: 16 }}>Loading configuration...</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Configuration</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Configure all NeurAI gateway settings
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {saved && (
            <span style={{ color: 'var(--accent-success)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20,6 9,17 4,12"/>
              </svg>
              Saved
            </span>
          )}
          <button 
            className="btn btn-primary"
            onClick={() => saveConfig(config)}
            disabled={saving}
          >
            {saving ? (
              <>
                <div className="spinner"></div>
                Saving...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                  <polyline points="17,21 17,13 7,13 7,21"/>
                  <polyline points="7,3 7,8 15,8"/>
                </svg>
                Save Configuration
              </>
            )}
          </button>
        </div>
      </div>

      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'gateway' ? 'active' : ''}`}
          onClick={() => setActiveTab('gateway')}
        >
          Gateway
        </button>
        <button 
          className={`tab ${activeTab === 'agent' ? 'active' : ''}`}
          onClick={() => setActiveTab('agent')}
        >
          Agent
        </button>
        <button 
          className={`tab ${activeTab === 'apikeys' ? 'active' : ''}`}
          onClick={() => setActiveTab('apikeys')}
        >
          API Keys
        </button>
        <button 
          className={`tab ${activeTab === 'advanced' ? 'active' : ''}`}
          onClick={() => setActiveTab('advanced')}
        >
          Advanced
        </button>
      </div>

      {activeTab === 'gateway' && (
        <GatewayConfig 
          config={config.gateway} 
          onChange={(data) => updateSection('gateway', data)}
        />
      )}
      {activeTab === 'agent' && (
        <AgentConfig 
          config={config.agents?.defaults || {}} 
          onChange={(data) => {
            const updated = {
              ...config,
              agents: {
                ...config.agents,
                defaults: {
                  ...config.agents?.defaults,
                  ...data
                }
              }
            };
            setConfig(updated);
          }}
        />
      )}
      {activeTab === 'apikeys' && (
        <APIKeysConfig 
          config={config.apiKeys} 
          onChange={(data) => {
            const updated = { ...config, apiKeys: { ...config.apiKeys, ...data } };
            setConfig(updated);
          }}
        />
      )}
      {activeTab === 'advanced' && (
        <AdvancedConfig 
          config={config} 
          onChange={(data) => setConfig({ ...config, ...data })}
        />
      )}
    </div>
  );
}

function GatewayConfig({ config, onChange }) {
  return (
    <div>
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: 20 }}>Gateway Settings</h3>
        
        <div className="form-group">
          <label className="form-label">Port</label>
          <input
            type="number"
            className="form-input"
            value={config?.port || 18789}
            onChange={(e) => onChange({ port: parseInt(e.target.value) })}
            style={{ maxWidth: 200 }}
          />
          <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            The port the gateway WebSocket server listens on
          </p>
        </div>

        <div className="form-group">
          <label className="form-label">Authentication Mode</label>
          <select
            className="form-select"
            value={config?.auth?.mode || 'token'}
            onChange={(e) => onChange({ auth: { ...config?.auth, mode: e.target.value } })}
            style={{ maxWidth: 300 }}
          >
            <option value="token">Token Authentication</option>
            <option value="none">No Authentication</option>
          </select>
        </div>

        {config?.auth?.mode === 'token' && (
          <div className="form-group">
            <label className="form-label">Auth Token</label>
            <div className="input-with-button" style={{ maxWidth: 500 }}>
              <input
                type="password"
                className="form-input"
                value={config?.auth?.token || ''}
                onChange={(e) => onChange({ auth: { ...config?.auth, token: e.target.value } })}
                placeholder="Enter authentication token"
              />
              <button 
                className="btn btn-secondary"
                onClick={() => {
                  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)))
                    .map(b => b.toString(16).padStart(2, '0')).join('');
                  onChange({ auth: { ...config?.auth, token } });
                }}
              >
                Generate
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AgentConfig({ config, onChange }) {
  const models = [
    { value: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { value: 'anthropic/claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { value: 'anthropic/claude-3-opus-20240229', label: 'Claude 3 Opus' },
    { value: 'anthropic/claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
    { value: 'openai/gpt-4o', label: 'GPT-4o' },
    { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'openai/gpt-4-turbo', label: 'GPT-4 Turbo' }
  ];

  return (
    <div>
      <div className="alert alert-info" style={{ marginBottom: 24 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4M12 8h.01"/>
        </svg>
        <span>
          Agent configuration follows NeurAI's schema. Some UI-only settings (names, emojis) are not 
          persisted in NeurAI config. Use the NeurAI CLI for advanced agent configuration.
        </span>
      </div>

      <div className="card">
        <h3 className="card-title" style={{ marginBottom: 20 }}>Model Settings</h3>
        
        <div className="form-group">
          <label className="form-label">Default Model</label>
          <select
            className="form-select"
            value={config?.model?.primary || 'anthropic/claude-sonnet-4-5'}
            onChange={(e) => onChange({ model: { primary: e.target.value } })}
            style={{ maxWidth: 400 }}
          >
            {models.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            The AI model used for agent responses. Ensure you have the appropriate API key configured.
          </p>
        </div>

        <div className="form-group">
          <label className="form-label">Max Concurrent Sessions</label>
          <input
            type="number"
            className="form-input"
            value={config?.maxConcurrent || 4}
            onChange={(e) => onChange({ maxConcurrent: parseInt(e.target.value) })}
            min={1}
            max={10}
            style={{ maxWidth: 100 }}
          />
          <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            Maximum number of concurrent agent sessions. Default is 4.
          </p>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title" style={{ marginBottom: 20 }}>Workspace</h3>
        
        <div className="form-group">
          <label className="form-label">Workspace Directory</label>
          <div className="input-with-button" style={{ maxWidth: 500 }}>
            <input
              type="text"
              className="form-input"
              value={config?.workspace || ''}
              onChange={(e) => onChange({ workspace: e.target.value })}
              placeholder="Select workspace directory"
            />
            <button 
              className="btn btn-secondary"
              onClick={async () => {
                const dir = await window.electronAPI.selectDirectory();
                if (dir) onChange({ workspace: dir });
              }}
            >
              Browse
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function APIKeysConfig({ config, onChange }) {
  const [showKeys, setShowKeys] = useState({ anthropic: false, openai: false, gemini: false });
  const [testing, setTesting] = useState({ anthropic: false, openai: false, gemini: false });
  const [results, setResults] = useState({ anthropic: null, openai: null, gemini: null });
  const [geminiKey, setGeminiKey] = useState('');
  const [geminiSaving, setGeminiSaving] = useState(false);

  useEffect(() => {
    // Load Gemini key from dedicated store
    window.electronAPI.getGeminiApiKey().then(key => {
      if (key) setGeminiKey(key);
    });
  }, []);

  const saveGeminiKey = async () => {
    setGeminiSaving(true);
    try {
      await window.electronAPI.saveGeminiApiKey(geminiKey);
      // Also store in config for consistency
      onChange({ gemini: geminiKey });
      setResults(prev => ({ ...prev, gemini: 'saved' }));
      setTimeout(() => setResults(prev => ({ ...prev, gemini: null })), 2000);
    } catch (err) {
      console.error('Failed to save Gemini key:', err);
    }
    setGeminiSaving(false);
  };

  const testKey = async (provider) => {
    const key = config?.[provider];
    if (!key) return;

    setTesting(prev => ({ ...prev, [provider]: true }));
    try {
      const result = await window.electronAPI.testApiKey(provider, key);
      setResults(prev => ({ ...prev, [provider]: result.success ? 'success' : 'error' }));
    } catch (error) {
      setResults(prev => ({ ...prev, [provider]: 'error' }));
    }
    setTesting(prev => ({ ...prev, [provider]: false }));
  };

  return (
    <div>
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: 20 }}>Anthropic</h3>
        
        <div className="form-group">
          <label className="form-label">API Key</label>
          <div className="input-with-button" style={{ maxWidth: 600 }}>
            <input
              type={showKeys.anthropic ? 'text' : 'password'}
              className="form-input"
              value={config?.anthropic || ''}
              onChange={(e) => onChange({ anthropic: e.target.value })}
              placeholder="sk-ant-..."
            />
            <button 
              className="btn btn-secondary"
              onClick={() => setShowKeys(prev => ({ ...prev, anthropic: !prev.anthropic }))}
            >
              {showKeys.anthropic ? 'Hide' : 'Show'}
            </button>
            <button 
              className="btn btn-primary"
              onClick={() => testKey('anthropic')}
              disabled={testing.anthropic || !config?.anthropic}
            >
              {testing.anthropic ? <div className="spinner"></div> : 'Test'}
            </button>
          </div>
          {results.anthropic && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              {results.anthropic === 'success' ? (
                <span style={{ color: 'var(--accent-success)' }}>✓ Valid API key</span>
              ) : (
                <span style={{ color: 'var(--accent-danger)' }}>✗ Invalid API key</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3 className="card-title" style={{ marginBottom: 20 }}>OpenAI</h3>
        
        <div className="form-group">
          <label className="form-label">API Key</label>
          <div className="input-with-button" style={{ maxWidth: 600 }}>
            <input
              type={showKeys.openai ? 'text' : 'password'}
              className="form-input"
              value={config?.openai || ''}
              onChange={(e) => onChange({ openai: e.target.value })}
              placeholder="sk-..."
            />
            <button 
              className="btn btn-secondary"
              onClick={() => setShowKeys(prev => ({ ...prev, openai: !prev.openai }))}
            >
              {showKeys.openai ? 'Hide' : 'Show'}
            </button>
            <button 
              className="btn btn-primary"
              onClick={() => testKey('openai')}
              disabled={testing.openai || !config?.openai}
            >
              {testing.openai ? <div className="spinner"></div> : 'Test'}
            </button>
          </div>
          {results.openai && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              {results.openai === 'success' ? (
                <span style={{ color: 'var(--accent-success)' }}>✓ Valid API key</span>
              ) : (
                <span style={{ color: 'var(--accent-danger)' }}>✗ Invalid API key</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <h3 className="card-title" style={{ marginBottom: 0 }}>Google Gemini</h3>
          <span style={{ 
            padding: '2px 8px', 
            background: 'rgba(99,102,241,0.15)', 
            color: 'var(--accent-primary)', 
            borderRadius: 4, 
            fontSize: 11, 
            fontWeight: 600 
          }}>Required for Screen Recorder</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Used for AI-powered screen recording analysis and workflow generation. Get your key from{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style={{ color: 'var(--accent-primary)' }}>Google AI Studio</a>.
        </p>
        
        <div className="form-group">
          <label className="form-label">API Key</label>
          <div className="input-with-button" style={{ maxWidth: 600 }}>
            <input
              type={showKeys.gemini ? 'text' : 'password'}
              className="form-input"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="AIza..."
            />
            <button 
              className="btn btn-secondary"
              onClick={() => setShowKeys(prev => ({ ...prev, gemini: !prev.gemini }))}
            >
              {showKeys.gemini ? 'Hide' : 'Show'}
            </button>
            <button 
              className="btn btn-success"
              onClick={saveGeminiKey}
              disabled={geminiSaving || !geminiKey}
            >
              {geminiSaving ? <div className="spinner"></div> : 'Save'}
            </button>
          </div>
          {results.gemini === 'saved' && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--accent-success)' }}>✓ Gemini API key saved</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AdvancedConfig({ config, onChange }) {
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonValue, setJsonValue] = useState(JSON.stringify(config, null, 2));
  const [jsonError, setJsonError] = useState(null);
  const [resetting, setResetting] = useState(false);

  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonValue);
      onChange(parsed);
      setJsonError(null);
    } catch (error) {
      setJsonError('Invalid JSON: ' + error.message);
    }
  };

  const handleReset = async () => {
    if (window.confirm('Are you sure you want to completely reset and repair NeurAI? This will wipe the configuration, fix corrupted files, and restart the service.\n\nYour API keys will be preserved.')) {
      setResetting(true);
      try {
        // Get current keys to preserve them
        const keys = await window.electronAPI.getApiKeys();
        
        const result = await window.electronAPI.resetAndRepair(keys);
        if (result.success) {
           alert('Reset complete. The system will now reload.');
           window.location.reload();
        } else {
           alert('Reset failed: ' + result.error);
        }
      } catch (e) {
        console.error(e);
        alert('Reset failed: ' + e.message);
      }
      setResetting(false);
    }
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Raw Configuration</h3>
          <div className="toggle-container">
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>JSON Editor</span>
            <div 
              className={`toggle ${jsonMode ? 'active' : ''}`}
              onClick={() => {
                setJsonMode(!jsonMode);
                if (!jsonMode) {
                  setJsonValue(JSON.stringify(config, null, 2));
                }
              }}
            />
          </div>
        </div>

        {jsonMode ? (
          <>
            <textarea
              className="form-textarea"
              style={{ 
                fontFamily: 'monospace', 
                minHeight: 400,
                fontSize: 13
              }}
              value={jsonValue}
              onChange={(e) => setJsonValue(e.target.value)}
            />
            {jsonError && (
              <div className="alert alert-error" style={{ marginTop: 12 }}>
                {jsonError}
              </div>
            )}
            <button 
              className="btn btn-primary" 
              style={{ marginTop: 12 }}
              onClick={applyJson}
            >
              Apply Changes
            </button>
          </>
        ) : (
          <div style={{ 
            background: 'var(--bg-tertiary)', 
            padding: 16, 
            borderRadius: 8,
            fontSize: 13,
            fontFamily: 'monospace',
            maxHeight: 400,
            overflow: 'auto'
          }}>
            <pre style={{ margin: 0 }}>
              {JSON.stringify(config, null, 2)}
            </pre>
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="card-title" style={{ marginBottom: 20 }}>Danger Zone</h3>
        
        <div className="alert alert-warning" style={{ marginBottom: 16 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span>These actions cannot be undone. Proceed with caution.</span>
        </div>

        <button 
          className="btn btn-danger"
          onClick={handleReset}
          disabled={resetting}
        >
          {resetting ? 'Resetting & Repairing...' : 'Reset & Repair NeurAI'}
        </button>
      </div>
    </div>
  );
}

export default Config;
