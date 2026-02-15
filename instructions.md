# OpenClaw Desktop Application - Complete Instructions

## Project Overview

A standalone Electron desktop application that simplifies OpenClaw installation, onboarding, and management through an intuitive graphical interface.

---

## Goals

1. **One-Click Installation**: Bundle everything users need into a single `.exe` installer
2. **Dependency Management**: Automatically detect and install required dependencies (Node.js, npm)
3. **Guided Onboarding**: Visual wizard for OpenClaw setup (API keys, channels, preferences)
4. **Gateway Management**: Full UI control for all OpenClaw gateway features
5. **User-Friendly**: No command-line knowledge required

---

## Architecture

```
┌─────────────────────────────────────┐
│   Electron Desktop App (Frontend)  │
│   - React/Vue for UI                │
│   - Electron for native features    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   OpenClaw Gateway (Backend)        │
│   - WebSocket Server (port 18789)   │
│   - Config Management API           │
│   - Channel Integrations            │
└─────────────────────────────────────┘
```

---

## Tech Stack

### Core Technologies
- **Electron**: Desktop app framework (cross-platform)
- **React**: UI framework (or Vue.js as alternative)
- **Electron Builder**: Package as Windows `.exe` installer
- **node-pty**: Run CLI commands from Electron
- **ws**: WebSocket client to communicate with OpenClaw Gateway

### Bundled Components
- **Node.js Runtime**: Embed Node.js binary (portable)
- **OpenClaw CLI**: Bundle the npm package

---

## Features Breakdown

### 1. Installer & Setup

**What it does:**
- Checks system for Node.js/npm
- Installs missing dependencies if needed
- Installs OpenClaw CLI globally or portably
- Sets up initial config directory

**UI Flow:**
```
Welcome Screen
    ↓
System Check (Node.js, npm, disk space)
    ↓
Install Dependencies (if missing)
    ↓
Install OpenClaw CLI
    ↓
Success Screen → Launch App
```

**Technical Implementation:**

```javascript
// Check for Node.js
const { exec } = require('child_process');

function checkNodeInstalled() {
  return new Promise((resolve) => {
    exec('node --version', (error, stdout) => {
      resolve(!error && stdout.includes('v'));
    });
  });
}

// Bundle Node.js portable (alternative approach)
// Use electron-builder to include Node.js runtime
// Or use pkg to create standalone Node binary
```

### 2. Onboarding Wizard

**Steps:**

**Step 1: Welcome**
- Introduction to OpenClaw
- "Get Started" button

**Step 2: API Keys**
- Anthropic API Key input
- OpenAI (optional)
- Test connection button
- Visual feedback (✓ or ✗)

**Step 3: Workspace Setup**
- Choose workspace directory (default: `~/.openclaw/workspace`)
- Browse button
- Create workspace structure

**Step 4: Channels Setup**
- WhatsApp (show QR code for pairing)
- Telegram (BotFather token input)
- Discord (bot token)
- Skip/Setup Later option

**Step 5: Agent Configuration**
- Choose default model
- Set thinking level
- Name your agent
- Choose emoji

**Step 6: Completion**
- Summary of settings
- "Start Gateway" button
- Auto-launch on system startup (checkbox)

**UI Mockup:**
```
┌─────────────────────────────────────┐
│  OpenClaw Setup Wizard        [✕]   │
├─────────────────────────────────────┤
│  Step 2/6: Configure API Keys       │
│                                      │
│  Anthropic API Key:                 │
│  [___________________________] Test │
│  ✓ Connected successfully           │
│                                      │
│  OpenAI API Key (optional):         │
│  [___________________________] Test │
│                                      │
│         [Back]  [Next]               │
└─────────────────────────────────────┘
```

### 3. Main Dashboard

**Layout:**

```
┌──────────────────────────────────────────────┐
│  OpenClaw Desktop                      [─][□][✕] │
├─────────┬────────────────────────────────────┤
│         │  Dashboard                          │
│ Dash    │  ┌──────────────┬──────────────┐  │
│ Channels│  │ Gateway      │ Active Chats │  │
│ Config  │  │ Status: ●ON  │ WhatsApp: 3  │  │
│ Agents  │  │ Port: 18789  │ Telegram: 1  │  │
│ Skills  │  └──────────────┴──────────────┘  │
│ Logs    │                                     │
│ Help    │  Recent Messages:                   │
│         │  📱 +923105202695: "Hello..."      │
│         │  💬 @user: "Test message"         │
│         │                                     │
│         │  Quick Actions:                     │
│         │  [Start Gateway] [Stop Gateway]    │
│         │  [Send Message]  [View Logs]       │
└─────────┴────────────────────────────────────┘
```

### 4. Channels Management

**WhatsApp Tab:**
- Connection status (Connected/Disconnected)
- QR Code display for pairing
- "Reconnect" button
- Allowed numbers list (add/remove)
- Pairing requests (approve/reject)

**Telegram Tab:**
- Bot token input
- Connection status
- Bot username display
- Test message button

**Discord Tab:**
- Bot token input
- Server list
- Channel permissions
- Invite link generator

**UI Example:**
```
┌─────────────────────────────────────┐
│  Channels > WhatsApp                │
├─────────────────────────────────────┤
│ Status: ● Connected                 │
│ Account: +923191727780              │
│                                     │
│ Allowed Numbers:                    │
│  +923105202695        [Remove]      │
│  +923146519232        [Remove]      │
│  [+ Add Number]                     │
│                                     │
│ Pending Pairing Requests:           │
│  +923334567890  Code: ABC123        │
│    [Approve] [Reject]               │
│                                     │
│ [Disconnect] [Reconnect] [Show QR]  │
└─────────────────────────────────────┘
```

### 5. Configuration Editor

**Visual config editor for:**
- Gateway settings (port, auth mode)
- Agent defaults (model, workspace)
- Message policies (pairing, allowlists)
- Skills management
- Cron jobs

**Features:**
- Form-based editing (no JSON editing required)
- Validation before save
- "Apply & Restart Gateway" button
- Import/Export config

**Example - Agent Config:**
```
┌─────────────────────────────────────┐
│ Configuration > Agent Settings      │
├─────────────────────────────────────┤
│ Default Model:                      │
│ [anthropic/claude-sonnet-4-5 ▼]     │
│                                     │
│ Thinking Level:                     │
│ ● Low  ○ Medium  ○ High             │
│                                     │
│ Max Concurrent Requests: [4]        │
│                                     │
│ Workspace Directory:                │
│ C:\Users\...\workspace   [Browse]   │
│                                     │
│        [Save]  [Reset]  [Apply]     │
└─────────────────────────────────────┘
```

### 6. Gateway Control

**Features:**
- Start/Stop/Restart gateway
- View real-time logs
- Gateway health status
- Port configuration
- Auto-start on boot

**Status Indicators:**
- 🟢 Running
- 🔴 Stopped
- 🟡 Starting/Restarting
- ⚠️ Error

### 7. Logs Viewer

**Features:**
- Live log streaming from gateway
- Filter by level (info, warn, error)
- Search logs
- Export logs to file
- Clear logs button

### 8. Skills Manager

**Features:**
- Browse available skills (ClawHub integration)
- Install/Uninstall skills
- View skill documentation
- Enable/Disable skills
- Update skills

---

## Development Steps

### Phase 1: Setup & Dependencies (Week 1)

**1. Initialize Electron Project**

```bash
cd D:\Fiverr\wajahat\openclaw-executable
npm init -y
npm install electron electron-builder
npm install react react-dom
npm install ws node-pty
```

**2. Project Structure**

```
openclaw-executable/
├── src/
│   ├── main/           # Electron main process
│   │   ├── index.js    # Entry point
│   │   ├── gateway.js  # Gateway manager
│   │   └── installer.js # Dependency installer
│   ├── renderer/       # React UI
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Onboarding.jsx
│   │   │   ├── Channels.jsx
│   │   │   ├── Config.jsx
│   │   │   └── Logs.jsx
│   │   └── utils/
│   │       └── gateway-client.js  # WebSocket client
│   └── preload.js     # Bridge between main & renderer
├── resources/         # Icons, images
├── build/            # Build configuration
├── package.json
└── electron-builder.json
```

**3. Basic Electron Setup**

`src/main/index.js`:
```javascript
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadFile('src/renderer/index.html');
}

app.whenReady().then(createWindow);
```

### Phase 2: Installer Logic (Week 2)

**4. Dependency Checker**

`src/main/installer.js`:
```javascript
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class DependencyInstaller {
  async checkNode() {
    try {
      const { stdout } = await execAsync('node --version');
      return { installed: true, version: stdout.trim() };
    } catch (error) {
      return { installed: false };
    }
  }

  async checkNpm() {
    try {
      const { stdout } = await execAsync('npm --version');
      return { installed: true, version: stdout.trim() };
    } catch (error) {
      return { installed: false };
    }
  }

  async checkOpenClaw() {
    try {
      const { stdout } = await execAsync('openclaw --version');
      return { installed: true, version: stdout.trim() };
    } catch (error) {
      return { installed: false };
    }
  }

  async installOpenClaw() {
    return await execAsync('npm install -g openclaw');
  }

  async getSystemInfo() {
    const node = await this.checkNode();
    const npm = await this.checkNpm();
    const openclaw = await this.checkOpenClaw();
    
    return { node, npm, openclaw };
  }
}

module.exports = DependencyInstaller;
```

**5. Bundle Node.js (Alternative Approach)**

For a truly standalone installer, bundle Node.js:

```json
// electron-builder.json
{
  "appId": "com.openclaw.desktop",
  "productName": "OpenClaw Desktop",
  "files": [
    "src/**/*",
    "node_modules/**/*",
    "resources/**/*"
  ],
  "extraResources": [
    {
      "from": "node-runtime/",
      "to": "node",
      "filter": ["**/*"]
    }
  ],
  "win": {
    "target": "nsis",
    "icon": "resources/icon.ico"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true
  }
}
```

Download portable Node.js and place in `node-runtime/` folder.

### Phase 3: Gateway Integration (Week 2-3)

**6. Gateway Manager**

`src/main/gateway.js`:
```javascript
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class GatewayManager {
  constructor() {
    this.process = null;
    this.configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
  }

  start() {
    return new Promise((resolve, reject) => {
      this.process = spawn('openclaw', ['gateway'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      this.process.stdout.on('data', (data) => {
        console.log(`Gateway: ${data}`);
      });

      this.process.stderr.on('data', (data) => {
        console.error(`Gateway Error: ${data}`);
      });

      this.process.on('error', reject);
      
      // Wait for gateway to be ready
      setTimeout(() => resolve(this.process), 2000);
    });
  }

  stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  isRunning() {
    return this.process !== null && !this.process.killed;
  }

  getConfig() {
    if (fs.existsSync(this.configPath)) {
      return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
    }
    return null;
  }

  saveConfig(config) {
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }
}

module.exports = GatewayManager;
```

**7. WebSocket Client (Renderer)**

`src/renderer/utils/gateway-client.js`:
```javascript
class GatewayClient {
  constructor(url = 'ws://127.0.0.1:18789') {
    this.url = url;
    this.ws = null;
    this.token = null;
  }

  async connect(token) {
    this.token = token;
    
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        // Send auth
        this.ws.send(JSON.stringify({
          type: 'auth',
          token: this.token
        }));
        resolve();
      };

      this.ws.onerror = (error) => reject(error);
      
      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      };
    });
  }

  async getConfig() {
    return this.send({
      tool: 'gateway',
      parameters: { action: 'config.get' }
    });
  }

  async updateConfig(patch) {
    return this.send({
      tool: 'gateway',
      parameters: { 
        action: 'config.patch',
        raw: JSON.stringify(patch)
      }
    });
  }

  async sendMessage(channel, target, message) {
    return this.send({
      tool: 'message',
      parameters: {
        action: 'send',
        channel,
        target,
        message
      }
    });
  }

  send(payload) {
    return new Promise((resolve, reject) => {
      const id = Date.now();
      payload.id = id;

      this.ws.send(JSON.stringify(payload));

      const handler = (event) => {
        const response = JSON.parse(event.data);
        if (response.id === id) {
          this.ws.removeEventListener('message', handler);
          resolve(response);
        }
      };

      this.ws.addEventListener('message', handler);
      setTimeout(() => reject(new Error('Timeout')), 10000);
    });
  }

  handleMessage(data) {
    // Handle incoming messages, status updates, etc.
    console.log('Gateway message:', data);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export default GatewayClient;
```

### Phase 4: UI Development (Week 3-4)

**8. Onboarding Component**

`src/renderer/components/Onboarding.jsx`:
```jsx
import React, { useState } from 'react';

const steps = [
  'Welcome',
  'API Keys',
  'Workspace',
  'Channels',
  'Agent Config',
  'Complete'
];

function Onboarding({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [config, setConfig] = useState({
    apiKeys: {},
    workspace: '',
    channels: {},
    agent: {}
  });

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete(config);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <WelcomeStep />;
      case 1:
        return <APIKeysStep config={config} setConfig={setConfig} />;
      case 2:
        return <WorkspaceStep config={config} setConfig={setConfig} />;
      case 3:
        return <ChannelsStep config={config} setConfig={setConfig} />;
      case 4:
        return <AgentConfigStep config={config} setConfig={setConfig} />;
      case 5:
        return <CompleteStep config={config} />;
      default:
        return null;
    }
  };

  return (
    <div className="onboarding">
      <div className="progress-bar">
        {steps.map((step, index) => (
          <div
            key={step}
            className={`step ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}`}
          >
            {step}
          </div>
        ))}
      </div>
      
      <div className="step-content">
        {renderStep()}
      </div>

      <div className="navigation">
        <button onClick={prevStep} disabled={currentStep === 0}>
          Back
        </button>
        <button onClick={nextStep}>
          {currentStep === steps.length - 1 ? 'Finish' : 'Next'}
        </button>
      </div>
    </div>
  );
}

function APIKeysStep({ config, setConfig }) {
  const [anthropicKey, setAnthropicKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const testConnection = async () => {
    setTesting(true);
    try {
      // Call API to test key
      const response = await window.electronAPI.testAPIKey('anthropic', anthropicKey);
      setTestResult(response.success ? 'success' : 'failed');
      
      if (response.success) {
        setConfig({
          ...config,
          apiKeys: { ...config.apiKeys, anthropic: anthropicKey }
        });
      }
    } catch (error) {
      setTestResult('error');
    }
    setTesting(false);
  };

  return (
    <div className="api-keys-step">
      <h2>Configure API Keys</h2>
      
      <div className="form-group">
        <label>Anthropic API Key *</label>
        <div className="input-with-button">
          <input
            type="password"
            value={anthropicKey}
            onChange={(e) => setAnthropicKey(e.target.value)}
            placeholder="sk-ant-..."
          />
          <button onClick={testConnection} disabled={testing || !anthropicKey}>
            {testing ? 'Testing...' : 'Test'}
          </button>
        </div>
        {testResult === 'success' && <span className="success">✓ Connected</span>}
        {testResult === 'failed' && <span className="error">✗ Invalid key</span>}
      </div>

      <p className="help-text">
        Get your API key from <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a>
      </p>
    </div>
  );
}

export default Onboarding;
```

**9. Dashboard Component**

`src/renderer/components/Dashboard.jsx`:
```jsx
import React, { useEffect, useState } from 'react';

function Dashboard({ gatewayClient }) {
  const [gatewayStatus, setGatewayStatus] = useState('unknown');
  const [channels, setChannels] = useState({});
  const [recentMessages, setRecentMessages] = useState([]);

  useEffect(() => {
    // Fetch gateway health
    const fetchStatus = async () => {
      try {
        const response = await window.electronAPI.getGatewayStatus();
        setGatewayStatus(response.running ? 'running' : 'stopped');
        setChannels(response.channels || {});
      } catch (error) {
        setGatewayStatus('error');
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);

    return () => clearInterval(interval);
  }, []);

  const startGateway = async () => {
    await window.electronAPI.startGateway();
    setGatewayStatus('running');
  };

  const stopGateway = async () => {
    await window.electronAPI.stopGateway();
    setGatewayStatus('stopped');
  };

  return (
    <div className="dashboard">
      <h1>OpenClaw Dashboard</h1>

      <div className="status-grid">
        <div className="status-card">
          <h3>Gateway Status</h3>
          <div className={`status-indicator ${gatewayStatus}`}>
            {gatewayStatus === 'running' ? '🟢 Running' : '🔴 Stopped'}
          </div>
          <p>Port: 18789</p>
        </div>

        <div className="status-card">
          <h3>Active Channels</h3>
          <ul>
            {Object.entries(channels).map(([name, status]) => (
              <li key={name}>
                {name}: {status.connected ? '✓' : '✗'}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="recent-messages">
        <h3>Recent Messages</h3>
        {recentMessages.length === 0 ? (
          <p>No recent messages</p>
        ) : (
          <ul>
            {recentMessages.map((msg, i) => (
              <li key={i}>
                <strong>{msg.from}:</strong> {msg.text}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="quick-actions">
        <button onClick={startGateway} disabled={gatewayStatus === 'running'}>
          Start Gateway
        </button>
        <button onClick={stopGateway} disabled={gatewayStatus !== 'running'}>
          Stop Gateway
        </button>
      </div>
    </div>
  );
}

export default Dashboard;
```

### Phase 5: Build & Package (Week 5)

**10. IPC Bridge (Preload Script)**

`src/preload.js`:
```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Gateway control
  startGateway: () => ipcRenderer.invoke('start-gateway'),
  stopGateway: () => ipcRenderer.invoke('stop-gateway'),
  restartGateway: () => ipcRenderer.invoke('restart-gateway'),
  getGatewayStatus: () => ipcRenderer.invoke('get-gateway-status'),

  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  updateConfig: (config) => ipcRenderer.invoke('update-config', config),

  // Installation
  checkDependencies: () => ipcRenderer.invoke('check-dependencies'),
  installOpenClaw: () => ipcRenderer.invoke('install-openclaw'),

  // System
  testAPIKey: (provider, key) => ipcRenderer.invoke('test-api-key', provider, key),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),

  // Messaging
  onMessage: (callback) => ipcRenderer.on('message', callback),
  sendMessage: (channel, target, message) => 
    ipcRenderer.invoke('send-message', channel, target, message)
});
```

**11. Package Configuration**

`package.json`:
```json
{
  "name": "openclaw-desktop",
  "version": "1.0.0",
  "description": "OpenClaw Desktop Application",
  "main": "src/main/index.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder",
    "build:win": "electron-builder --win"
  },
  "build": {
    "appId": "com.openclaw.desktop",
    "productName": "OpenClaw Desktop",
    "win": {
      "target": "nsis",
      "icon": "resources/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true
    }
  },
  "dependencies": {
    "electron": "^28.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "ws": "^8.14.2",
    "node-pty": "^1.0.0"
  },
  "devDependencies": {
    "electron-builder": "^24.9.1"
  }
}
```

**12. Build the Installer**

```bash
npm run build:win
```

This creates:
- `dist/OpenClaw Desktop Setup.exe` - Installer
- Includes all dependencies bundled

---

## Additional Features

### Auto-Update System

Use `electron-updater` to check for app updates:

```javascript
const { autoUpdater } = require('electron-updater');

autoUpdater.checkForUpdatesAndNotify();
```

### System Tray Icon

Run OpenClaw in background:

```javascript
const { Tray, Menu } = require('electron');

let tray = new Tray('resources/tray-icon.png');
const contextMenu = Menu.buildFromTemplate([
  { label: 'Open OpenClaw', click: () => win.show() },
  { label: 'Quit', click: () => app.quit() }
]);
tray.setContextMenu(contextMenu);
```

### Notifications

Desktop notifications for new messages:

```javascript
const { Notification } = require('electron');

new Notification({
  title: 'New WhatsApp Message',
  body: '+923105202695: Hello...'
}).show();
```

---

## Security Considerations

1. **API Key Storage**: Use `electron-store` with encryption
2. **Gateway Auth**: Always use token authentication
3. **Config Protection**: Set proper file permissions on config files
4. **Updates**: Sign installers with code-signing certificate

---

## Testing Strategy

1. **Unit Tests**: Jest for business logic
2. **E2E Tests**: Spectron for Electron UI testing
3. **Manual Testing**: Test on fresh Windows installs

---

## Deployment Checklist

- [ ] Code signing certificate
- [ ] Auto-update server setup
- [ ] Privacy policy
- [ ] User documentation
- [ ] GitHub releases or website hosting

---

## Estimated Timeline

- **Week 1**: Project setup, dependency checking, basic Electron structure
- **Week 2**: Gateway integration, installer logic
- **Week 3**: Onboarding wizard UI
- **Week 4**: Dashboard, channels, config UI
- **Week 5**: Polish, testing, packaging

**Total: 5 weeks for MVP**

---

## Next Steps

1. Set up React + Electron boilerplate
2. Implement dependency checker
3. Build basic gateway manager
4. Create onboarding wizard
5. Add channel management UI
6. Package as installer

---

## Resources

- Electron Docs: https://www.electronjs.org/docs
- Electron Builder: https://www.electron.build/
- OpenClaw Docs: https://docs.openclaw.ai/
- React Docs: https://react.dev/

---

**Ready to start building? Begin with Phase 1 and work through each step systematically!**
