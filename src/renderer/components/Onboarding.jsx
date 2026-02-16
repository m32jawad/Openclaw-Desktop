import React, { useState } from 'react';

const STEPS = [
  { id: 'welcome', title: 'Welcome' },
  { id: 'mode', title: 'Setup Mode' },
  { id: 'model', title: 'AI Model' },
  { id: 'auth', title: 'Authentication' },
  { id: 'telegram', title: 'Telegram Bot' },
  { id: 'skills', title: 'Skills' },
  { id: 'api-keys', title: 'API Keys' },
  { id: 'personality', title: 'Personality' },
  { id: 'complete', title: 'Complete' }
];

function Onboarding({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [config, setConfig] = useState({
    setupMode: 'quickstart', // 'quickstart' or 'manual'
    model: {
      provider: 'anthropic', // 'google', 'anthropic', 'openai' - temporarily defaulting to anthropic
      name: 'claude-sonnet-4-5', // specific model name
      authType: 'apikey' // 'oauth' or 'apikey'
    },
    apiKeys: {
      anthropic: '',
      openai: '',
      google: '',
      braveSearch: ''
    },
    telegram: {
      enabled: false,
      botToken: '',
      botUsername: ''
    },
    skills: {
      enabled: false,
      nodeManager: 'npm',
      skipForNow: true
    },
    personality: {
      botName: '',
      userName: '',
      greeting: ''
    },
    workspace: ''
  });

  const nextStep = () => {
    if (currentStep < STEPS.length - 1) {
      let nextIndex = currentStep + 1;
      // TEMPORARY: Skip model selection step (index 2) - only using Claude/Anthropic for now
      if (nextIndex === 2) {
        nextIndex = 3; // Skip to auth step
      }
      setCurrentStep(nextIndex);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      let prevIndex = currentStep - 1;
      // TEMPORARY: Skip model selection step (index 2) when going back
      if (prevIndex === 2) {
        prevIndex = 1; // Skip back to mode step
      }
      setCurrentStep(prevIndex);
    }
  };

  const updateConfig = (section, data) => {
    setConfig(prev => ({
      ...prev,
      [section]: { ...prev[section], ...data }
    }));
  };

  const handleComplete = async () => {
    // Save all configuration to OpenClaw
    try {
      await window.electronAPI.configureOpenClaw(config);
      onComplete();
    } catch (error) {
      console.error('Failed to configure OpenClaw:', error);
    }
  };

  const renderStep = () => {
    switch (STEPS[currentStep].id) {
      case 'welcome':
        return <WelcomeStep />;
      case 'mode':
        return <ModeSelectionStep config={config} updateConfig={updateConfig} />;
      case 'model':
        return <ModelSelectionStep config={config} updateConfig={updateConfig} />;
      case 'auth':
        return <AuthenticationStep config={config} updateConfig={updateConfig} />;
      case 'telegram':
        return <TelegramSetupStep config={config} updateConfig={updateConfig} />;
      case 'skills':
        return <SkillsConfigStep config={config} updateConfig={updateConfig} />;
      case 'api-keys':
        return <APIKeysStep config={config} updateConfig={updateConfig} />;
      case 'personality':
        return <PersonalityStep config={config} updateConfig={updateConfig} />;
      case 'complete':
        return <CompleteStep config={config} />;
      default:
        return null;
    }
  };

  return (
    <div className="onboarding-container">
      <div className="onboarding-card">
        <div className="onboarding-header">
          <div className="step-indicator">
            {STEPS.map((step, index) => (
              <div
                key={step.id}
                className={`step-dot ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}`}
              />
            ))}
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 600 }}>
            Step {currentStep + 1}/{STEPS.length}: {STEPS[currentStep].title}
          </h2>
        </div>

        <div className="onboarding-body">
          {renderStep()}
        </div>

        <div className="onboarding-footer">
          <button 
            className="btn btn-secondary" 
            onClick={prevStep}
            disabled={currentStep === 0}
            style={{ visibility: currentStep === 0 ? 'hidden' : 'visible' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back
          </button>

          {currentStep === STEPS.length - 1 ? (
            <button className="btn btn-success" onClick={handleComplete}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20,6 9,17 4,12"/>
              </svg>
              Start OpenClaw
            </button>
          ) : (
            <button className="btn btn-primary" onClick={nextStep}>
              Next
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function WelcomeStep() {
  return (
    <div style={{ textAlign: 'center' }}>
      <svg 
        width="80" height="80" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="var(--accent-primary)" 
        strokeWidth="1.5"
        style={{ margin: '0 auto 24px' }}
      >
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
      
      <h3 style={{ fontSize: 24, marginBottom: 12 }}>Welcome to OpenClaw</h3>
      <p style={{ color: 'var(--text-secondary)', maxWidth: 500, margin: '0 auto' }}>
        OpenClaw is a conversation-first AI assistant that runs locally on your system and connects 
        to messaging platforms like Telegram, WhatsApp, or Discord.
      </p>
      
      <div style={{ marginTop: 32, textAlign: 'left', background: 'var(--bg-tertiary)', padding: 20, borderRadius: 8 }}>
        <h4 style={{ marginBottom: 12 }}>This wizard will guide you through:</h4>
        <ul style={{ paddingLeft: 20, color: 'var(--text-secondary)', lineHeight: '1.8' }}>
          <li>Selecting your AI model provider (Google Gemini, Claude, OpenAI)</li>
          <li>Connecting to Telegram for chat access</li>
          <li>Configuring optional skills and API keys</li>
          <li>Setting up your bot's personality</li>
        </ul>
      </div>
    </div>
  );
}

function ModeSelectionStep({ config, updateConfig }) {
  const [mode, setMode] = useState(config.setupMode);

  const selectMode = (selectedMode) => {
    setMode(selectedMode);
    updateConfig('setupMode', selectedMode);
  };

  return (
    <div>
      <p style={{ marginBottom: 24, color: 'var(--text-secondary)' }}>
        Choose your setup mode. QuickStart is recommended for first-time users.
      </p>

      <div style={{ display: 'flex', gap: 16 }}>
        <div 
          className={`card card-selectable ${mode === 'quickstart' ? 'selected' : ''}`}
          onClick={() => selectMode('quickstart')}
          style={{ flex: 1, cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'start', gap: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 32 }}>⚡</div>
            <div>
              <h4 style={{ marginBottom: 8 }}>QuickStart</h4>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                Recommended for beginners. Sets up OpenClaw with safe defaults so you can get started quickly.
              </p>
            </div>
          </div>
          {mode === 'quickstart' && (
            <div style={{ marginTop: 12, padding: 8, background: 'var(--accent-primary-transparent)', borderRadius: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--accent-primary)' }}>✓ Selected</span>
            </div>
          )}
        </div>

        <div 
          className={`card card-selectable ${mode === 'manual' ? 'selected' : ''}`}
          onClick={() => selectMode('manual')}
          style={{ flex: 1, cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'start', gap: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 32 }}>🔧</div>
            <div>
              <h4 style={{ marginBottom: 8 }}>Manual Setup</h4>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                For advanced users. Configure every aspect of OpenClaw manually.
              </p>
            </div>
          </div>
          {mode === 'manual' && (
            <div style={{ marginTop: 12, padding: 8, background: 'var(--accent-primary-transparent)', borderRadius: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--accent-primary)' }}>✓ Selected</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ModelSelectionStep({ config, updateConfig }) {
  const [provider, setProvider] = useState(config.model.provider);

  const modelProviders = [
    { 
      id: 'google', 
      name: 'Google Gemini', 
      icon: '🔷',
      description: 'Google\'s latest AI models with OAuth authentication',
      models: ['gemini-1.5-flash-latest', 'gemini-1.5-pro-latest', 'gemini-1.5-flash', 'gemini-1.5-pro']
    },
    { 
      id: 'anthropic', 
      name: 'Anthropic Claude', 
      icon: '🔮',
      description: 'Claude models with superior reasoning and coding',
      models: ['claude-sonnet-4-5', 'claude-3-5-sonnet', 'claude-3-haiku']
    },
    { 
      id: 'openai', 
      name: 'OpenAI', 
      icon: '🤖',
      description: 'GPT models from OpenAI',
      models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo']
    }
  ];

  const selectProvider = (providerId) => {
    const selectedProvider = modelProviders.find(p => p.id === providerId);
    setProvider(providerId);
    updateConfig('model', {
      provider: providerId,
      name: selectedProvider.models[0],
      authType: providerId === 'google' ? 'oauth' : 'apikey'
    });
  };

  return (
    <div>
      <p style={{ marginBottom: 24, color: 'var(--text-secondary)' }}>
        Select your AI model provider. You can change this later in settings.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {modelProviders.map(p => (
          <div 
            key={p.id}
            className={`card card-selectable ${provider === p.id ? 'selected' : ''}`}
            onClick={() => selectProvider(p.id)}
            style={{ cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 28 }}>{p.icon}</div>
              <div style={{ flex: 1 }}>
                <h4 style={{ marginBottom: 4 }}>{p.name}</h4>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                  {p.description}
                </p>
              </div>
              {provider === p.id && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2">
                  <polyline points="20,6 9,17 4,12"/>
                </svg>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="alert alert-info" style={{ marginTop: 16 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4M12 8h.01"/>
        </svg>
        <span>
          <strong>Recommended:</strong> Google Gemini with OAuth provides the easiest setup. 
          Anthropic Claude is recommended for advanced coding tasks.
        </span>
      </div>
    </div>
  );
}

function AuthenticationStep({ config, updateConfig }) {
  const [key, setKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);
  const [oauthInProgress, setOauthInProgress] = useState(false);

  const provider = config.model.provider;
  const authType = config.model.authType;

  const handleOAuth = async () => {
    setOauthInProgress(true);
    try {
      const result = await window.electronAPI.startOAuth(provider);
      if (result.success) {
        setResult('success');
        updateConfig('apiKeys', { [provider]: result.token });
      } else {
        setResult('error');
      }
    } catch (error) {
      setResult('error');
    }
    setOauthInProgress(false);
  };

  const testApiKey = async () => {
    if (!key) return;
    setTesting(true);
    
    try {
      const testResult = await window.electronAPI.testApiKey(provider, key);
      setResult(testResult.success ? 'success' : 'error');
      
      if (testResult.success) {
        updateConfig('apiKeys', { [provider]: key });
      }
    } catch (error) {
      setResult('error');
    }
    
    setTesting(false);
  };

  const providerNames = {
    google: 'Google Gemini',
    anthropic: 'Anthropic Claude',
    openai: 'OpenAI'
  };

  const providerUrls = {
    google: 'https://makersuite.google.com/app/apikey',
    anthropic: 'https://console.anthropic.com/',
    openai: 'https://platform.openai.com/api-keys'
  };

  return (
    <div>
      <p style={{ marginBottom: 24, color: 'var(--text-secondary)' }}>
        Authenticate with {providerNames[provider]} to enable AI capabilities.
      </p>

      {authType === 'oauth' ? (
        <div>
          <div className="card" style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔐</div>
            <h4 style={{ marginBottom: 12 }}>OAuth Authentication</h4>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
              Click the button below to authenticate with {providerNames[provider]} through your browser.
              You'll be redirected to login and grant permissions.
            </p>
            
            <button 
              className="btn btn-primary" 
              onClick={handleOAuth}
              disabled={oauthInProgress || result === 'success'}
              style={{ minWidth: 200 }}
            >
              {oauthInProgress ? (
                <>
                  <div className="spinner"></div>
                  Authenticating...
                </>
              ) : result === 'success' ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20,6 9,17 4,12"/>
                  </svg>
                  Authenticated Successfully
                </>
              ) : (
                <>Authenticate with {providerNames[provider]}</>
              )}
            </button>

            {result === 'error' && (
              <div style={{ marginTop: 16, color: 'var(--accent-danger)', fontSize: 13 }}>
                ✗ Authentication failed. Please try again.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div className="form-group">
            <label className="form-label">
              {providerNames[provider]} API Key <span style={{ color: 'var(--accent-danger)' }}>*</span>
            </label>
            <div className="input-with-button">
              <input
                type="password"
                className="form-input"
                placeholder="Enter your API key..."
                value={key}
                onChange={(e) => setKey(e.target.value)}
                disabled={result === 'success'}
              />
              <button 
                className="btn btn-secondary" 
                onClick={testApiKey}
                disabled={testing || !key || result === 'success'}
              >
                {testing ? <div className="spinner"></div> : result === 'success' ? '✓' : 'Test'}
              </button>
            </div>
            {result && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                {result === 'success' ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-success)" strokeWidth="2">
                      <polyline points="20,6 9,17 4,12"/>
                    </svg>
                    <span style={{ color: 'var(--accent-success)', fontSize: 13 }}>API key validated successfully</span>
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-danger)" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    <span style={{ color: 'var(--accent-danger)', fontSize: 13 }}>Invalid API key</span>
                  </>
                )}
              </div>
            )}
            <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              Get your API key from{' '}
              <a 
                href="#" 
                onClick={(e) => { e.preventDefault(); window.electronAPI.openExternal(providerUrls[provider]); }}
                style={{ color: 'var(--accent-primary)' }}
              >
                {providerUrls[provider]}
              </a>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function TelegramSetupStep({ config, updateConfig }) {
  const [botToken, setBotToken] = useState(config.telegram.botToken);
  const [botUsername, setBotUsername] = useState(config.telegram.botUsername);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);

  const verifyToken = async () => {
    if (!botToken) return;
    setVerifying(true);
    
    try {
      const result = await window.electronAPI.verifyTelegramBot(botToken);
      if (result.success) {
        setVerified(true);
        setBotUsername(result.username);
        updateConfig('telegram', {
          enabled: true,
          botToken: botToken,
          botUsername: result.username
        });
      } else {
        setVerified(false);
      }
    } catch (error) {
      setVerified(false);
    }
    
    setVerifying(false);
  };

  const skipTelegram = () => {
    updateConfig('telegram', {
      enabled: false,
      botToken: '',
      botUsername: ''
    });
  };

  return (
    <div>
      <p style={{ marginBottom: 24, color: 'var(--text-secondary)' }}>
        Connect OpenClaw to Telegram so you can chat with your AI assistant from anywhere.
      </p>

      <div className="card" style={{ marginBottom: 16, padding: 20, background: 'var(--bg-tertiary)' }}>
        <h4 style={{ marginBottom: 12 }}>How to create a Telegram bot:</h4>
        <ol style={{ paddingLeft: 20, color: 'var(--text-secondary)', lineHeight: '1.8', margin: 0 }}>
          <li>Open Telegram and search for <strong>@BotFather</strong></li>
          <li>Send the command <code>/newbot</code></li>
          <li>Follow the prompts to choose a name and username</li>
          <li>Copy the bot token and paste it below</li>
        </ol>
      </div>

      <div className="form-group">
        <label className="form-label">Telegram Bot Token</label>
        <div className="input-with-button">
          <input
            type="text"
            className="form-input"
            placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            disabled={verified}
          />
          <button 
            className="btn btn-secondary" 
            onClick={verifyToken}
            disabled={verifying || !botToken || verified}
          >
            {verifying ? <div className="spinner"></div> : verified ? '✓ Verified' : 'Verify'}
          </button>
        </div>
        {verified && botUsername && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-success)" strokeWidth="2">
              <polyline points="20,6 9,17 4,12"/>
            </svg>
            <span style={{ color: 'var(--accent-success)', fontSize: 13 }}>
              Bot verified: @{botUsername}
            </span>
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <button className="btn btn-ghost" onClick={skipTelegram}>
          Skip Telegram setup (you can configure this later)
        </button>
      </div>
    </div>
  );
}

function SkillsConfigStep({ config, updateConfig }) {
  const [enabled, setEnabled] = useState(config.skills.enabled);
  const [nodeManager, setNodeManager] = useState(config.skills.nodeManager);

  const toggleSkills = (value) => {
    setEnabled(value);
    updateConfig('skills', {
      ...config.skills,
      enabled: value,
      skipForNow: !value
    });
  };

  return (
    <div>
      <p style={{ marginBottom: 24, color: 'var(--text-secondary)' }}>
        Skills are modular tools that extend your bot's capabilities (like sending emails, web searching, etc.).
      </p>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <div 
          className={`card card-selectable ${enabled ? 'selected' : ''}`}
          onClick={() => toggleSkills(true)}
          style={{ flex: 1, cursor: 'pointer' }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🛠️</div>
            <h4 style={{ marginBottom: 8 }}>Enable Skills</h4>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
              Configure skills directory and node manager
            </p>
          </div>
        </div>

        <div 
          className={`card card-selectable ${!enabled ? 'selected' : ''}`}
          onClick={() => toggleSkills(false)}
          style={{ flex: 1, cursor: 'pointer' }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⏭️</div>
            <h4 style={{ marginBottom: 8 }}>Skip for Now</h4>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
              You can configure skills later
            </p>
          </div>
        </div>
      </div>

      {enabled && (
        <div className="form-group">
          <label className="form-label">Node Package Manager</label>
          <select 
            className="form-select"
            value={nodeManager}
            onChange={(e) => {
              setNodeManager(e.target.value);
              updateConfig('skills', { ...config.skills, nodeManager: e.target.value });
            }}
          >
            <option value="npm">npm (recommended)</option>
            <option value="yarn">Yarn</option>
            <option value="pnpm">pnpm</option>
          </select>
        </div>
      )}

      <div className="alert alert-info">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4M12 8h.01"/>
        </svg>
        <span>
          Skills can be added and configured later through the OpenClaw dashboard or CLI.
        </span>
      </div>
    </div>
  );
}

function APIKeysStep({ config, updateConfig }) {
  const [braveKey, setBraveKey] = useState(config.apiKeys.braveSearch);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  const testKey = async () => {
    if (!braveKey) return;
    setTesting(true);
    
    try {
      const testResult = await window.electronAPI.testBraveSearchKey(braveKey);
      setResult(testResult.success ? 'success' : 'error');
      
      if (testResult.success) {
        updateConfig('apiKeys', { ...config.apiKeys, braveSearch: braveKey });
      }
    } catch (error) {
      setResult('error');
    }
    
    setTesting(false);
  };

  const skip = () => {
    updateConfig('apiKeys', { ...config.apiKeys, braveSearch: '' });
  };

  return (
    <div>
      <p style={{ marginBottom: 24, color: 'var(--text-secondary)' }}>
        Add API keys for additional capabilities. These are optional but enable enhanced features.
      </p>

      <div className="card" style={{ marginBottom: 16, padding: 20, background: 'var(--bg-tertiary)' }}>
        <h4 style={{ marginBottom: 12 }}>🔍 Brave Search API (Optional)</h4>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Enables your bot to perform web searches. Get your free API key from{' '}
          <a 
            href="#" 
            onClick={(e) => { e.preventDefault(); window.electronAPI.openExternal('https://brave.com/search/api/'); }}
            style={{ color: 'var(--accent-primary)' }}
          >
            brave.com/search/api
          </a>
        </p>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <div className="input-with-button">
            <input
              type="password"
              className="form-input"
              placeholder="BSA..."
              value={braveKey}
              onChange={(e) => setBraveKey(e.target.value)}
              disabled={result === 'success'}
            />
            <button 
              className="btn btn-secondary" 
              onClick={testKey}
              disabled={testing || !braveKey || result === 'success'}
            >
              {testing ? <div className="spinner"></div> : result === 'success' ? '✓' : 'Test'}
            </button>
          </div>
          {result && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              {result === 'success' ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-success)" strokeWidth="2">
                    <polyline points="20,6 9,17 4,12"/>
                  </svg>
                  <span style={{ color: 'var(--accent-success)', fontSize: 13 }}>API key validated successfully</span>
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-danger)" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                  <span style={{ color: 'var(--accent-danger)', fontSize: 13 }}>Invalid API key</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="alert alert-info">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4M12 8h.01"/>
        </svg>
        <span>
          You can add more API keys later through the settings or by asking your bot directly.
        </span>
      </div>

      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <button className="btn btn-ghost" onClick={skip}>
          Skip API keys for now
        </button>
      </div>
    </div>
  );
}

function PersonalityStep({ config, updateConfig }) {
  const [botName, setBotName] = useState(config.personality.botName);
  const [userName, setUserName] = useState(config.personality.userName);
  const [greeting, setGreeting] = useState(config.personality.greeting);

  const handleUpdate = () => {
    updateConfig('personality', {
      botName,
      userName,
      greeting: greeting || `Hi ${userName || 'there'}! I'm ${botName || 'OpenClaw'}, your AI assistant. How can I help you today?`
    });
  };

  return (
    <div>
      <p style={{ marginBottom: 24, color: 'var(--text-secondary)' }}>
        Give your bot a personality! This helps create a more personalized experience.
      </p>

      <div className="card" style={{ marginBottom: 16, padding: 20, background: 'var(--bg-tertiary)' }}>
        <div style={{ fontSize: 48, textAlign: 'center', marginBottom: 16 }}>🦞</div>
        <h4 style={{ textAlign: 'center', marginBottom: 8 }}>Time to hatch your OpenClaw!</h4>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
          Let's give your assistant a unique identity
        </p>
      </div>

      <div className="form-group">
        <label className="form-label">What should I call you?</label>
        <input
          type="text"
          className="form-input"
          placeholder="Your name..."
          value={userName}
          onChange={(e) => {
            setUserName(e.target.value);
            handleUpdate();
          }}
        />
        <p style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
          This is how your bot will address you
        </p>
      </div>

      <div className="form-group">
        <label className="form-label">What's your bot's name?</label>
        <input
          type="text"
          className="form-input"
          placeholder="e.g., Becky, Jarvis, Assistant..."
          value={botName}
          onChange={(e) => {
            setBotName(e.target.value);
            handleUpdate();
          }}
        />
        <p style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
          Choose a friendly name for your AI assistant
        </p>
      </div>

      <div className="form-group">
        <label className="form-label">Custom Greeting (Optional)</label>
        <textarea
          className="form-input"
          rows="3"
          placeholder={`Hi ${userName || 'there'}! I'm ${botName || 'OpenClaw'}, your AI assistant. How can I help you today?`}
          value={greeting}
          onChange={(e) => {
            setGreeting(e.target.value);
            handleUpdate();
          }}
        />
      </div>

      <div className="alert alert-info">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4M12 8h.01"/>
        </svg>
        <span>
          You can further customize your bot's personality, tone, and behavior through conversations!
        </span>
      </div>
    </div>
  );
}

function CompleteStep({ config }) {
  const getModelName = () => {
    const providers = {
      google: 'Google Gemini',
      anthropic: 'Anthropic Claude',
      openai: 'OpenAI GPT'
    };
    return providers[config.model.provider] || config.model.provider;
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 64, marginBottom: 24 }}>🎉</div>
      <h3 style={{ fontSize: 24, marginBottom: 12 }}>All Set! Your Bot is Ready to Hatch</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 32, maxWidth: 500, margin: '0 auto 32px' }}>
        {config.personality.botName || 'Your OpenClaw assistant'} is configured and ready to start. 
        Click "Start OpenClaw" to launch the gateway and begin chatting!
      </p>

      <div style={{ textAlign: 'left', background: 'var(--bg-tertiary)', padding: 24, borderRadius: 8, marginBottom: 24 }}>
        <h4 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2">
            <polyline points="20,6 9,17 4,12"/>
          </svg>
          Configuration Summary
        </h4>
        
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '12px 16px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Setup Mode:</span>
          <span style={{ fontSize: 13 }}>{config.setupMode === 'quickstart' ? '⚡ QuickStart' : '🔧 Manual'}</span>
          
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>AI Model:</span>
          <span style={{ fontSize: 13 }}>{getModelName()}</span>
          
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Bot Name:</span>
          <span style={{ fontSize: 13 }}>{config.personality.botName || 'Not set'}</span>
          
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Your Name:</span>
          <span style={{ fontSize: 13 }}>{config.personality.userName || 'Not set'}</span>
          
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Telegram:</span>
          <span style={{ fontSize: 13 }}>
            {config.telegram.enabled ? `✓ @${config.telegram.botUsername}` : '✗ Not configured'}
          </span>
          
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Web Search:</span>
          <span style={{ fontSize: 13 }}>
            {config.apiKeys.braveSearch ? '✓ Brave Search enabled' : '✗ Not configured'}
          </span>
          
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Skills:</span>
          <span style={{ fontSize: 13 }}>
            {config.skills.enabled ? `✓ Enabled (${config.skills.nodeManager})` : '✗ Skipped'}
          </span>
        </div>
      </div>

      {config.telegram.enabled && (
        <div className="alert alert-info" style={{ textAlign: 'left' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4M12 8h.01"/>
          </svg>
          <div>
            <strong>Next step:</strong> After starting OpenClaw, open Telegram and send <code>/start</code> to{' '}
            <strong>@{config.telegram.botUsername}</strong> to begin chatting with your bot!
          </div>
        </div>
      )}
    </div>
  );
}

export default Onboarding;
