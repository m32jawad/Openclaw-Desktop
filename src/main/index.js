const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, Notification, desktopCapturer } = require('electron');
const path = require('path');
const Store = require('electron-store');
const DependencyInstaller = require('./installer');
const GatewayManager = require('./gateway');
const ConfigManager = require('./config');
const ScreenRecorder = require('./recorder');
const InputLogger = require('./inputLogger');
const GeminiAnalyzer = require('./geminiAnalyzer');
const WorkflowManager = require('./workflowManager');
const VoiceAssistant = require('./voiceAssistant');

// Initialize stores and managers
const store = new Store({
  encryptionKey: 'openclaw-desktop-secure-key',
  name: 'openclaw-config'
});

const installer = new DependencyInstaller();
const gatewayManager = new GatewayManager();
const configManager = new ConfigManager();
const voiceAssistant = new VoiceAssistant(configManager, store);
const screenRecorder = new ScreenRecorder(voiceAssistant);
const inputLogger = new InputLogger();
const geminiAnalyzer = new GeminiAnalyzer(configManager, store);
const workflowManager = new WorkflowManager();

let mainWindow = null;
let tray = null;
let transcribeBlockedUntil = 0;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    // icon: path.join(__dirname, '../../resources/icon.ico'), // Commented out - needs proper size icon
    show: false
  });

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadFile(path.join(__dirname, '../../build/index.html'));
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../build/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Forward gateway messages to renderer
  gatewayManager.on('message', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('gateway-message', data);
    }
  });

  gatewayManager.on('status-change', (status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('gateway-status', status);
    }
  });

  gatewayManager.on('log', (log) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('gateway-log', log);
    }
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, '../../resources/tray-icon.png'));
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Open OpenClaw', 
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Start Gateway',
      id: 'start-gateway',
      click: () => gatewayManager.start(),
      enabled: gatewayManager.getStatus().status !== 'running'
    },
    {
      label: 'Stop Gateway',
      id: 'stop-gateway',
      click: () => gatewayManager.stop(),
      enabled: gatewayManager.getStatus().status === 'running'
    },
    { type: 'separator' },
    { 
      label: 'Quit', 
      click: () => {
        app.isQuitting = true;
        app.quit();
      } 
    }
  ]);

  tray.setToolTip('OpenClaw Desktop');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });

  // Update menu based on gateway status
  gatewayManager.on('status-change', (status) => {
    const startItem = contextMenu.getMenuItemById('start-gateway');
    const stopItem = contextMenu.getMenuItemById('stop-gateway');
    if (startItem) startItem.enabled = status.status !== 'running';
    if (stopItem) stopItem.enabled = status.status === 'running';
    tray.setContextMenu(contextMenu);
  });
}

// Window control handlers
ipcMain.handle('window-minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window-close', () => {
  mainWindow?.hide();
});

// Dependency & Installation handlers
ipcMain.handle('check-dependencies', async () => {
  return await installer.getSystemInfo();
});

ipcMain.handle('is-system-ready', async () => {
  return await installer.isSystemReady();
});

ipcMain.handle('install-nodejs', async (event) => {
  return await installer.installNodeJs((progress) => {
    event.sender.send('install-progress', progress);
  });
});

ipcMain.handle('install-openclaw', async (event) => {
  const result = await installer.installOpenClaw((progress) => {
    event.sender.send('install-progress', progress);
  });
  
  // After installation, ensure config is properly initialized with our token
  if (result.success) {
    try {
      // Wait a bit for OpenClaw to finish any post-install config setup
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Ensure our config manager initializes/validates the config
      const config = configManager.getConfig();
      
      // Force save to ensure our token is written
      configManager.saveConfig(config);
      
      console.log('Config initialized after OpenClaw installation');

      // Reset onboarding status since this is a fresh installation
      store.set('onboardingComplete', false);
    } catch (error) {
      console.error('Error initializing config after installation:', error);
    }
  }
  
  return result;
});

// Gateway control handlers
ipcMain.handle('start-gateway', async () => {
  try {
    const result = await gatewayManager.start();
    return result?.success !== false ? { success: true } : { success: false, error: result?.error || 'Gateway failed to start' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-gateway', () => {
  gatewayManager.stop();
  return { success: true };
});

ipcMain.handle('restart-gateway', async () => {
  try {
    gatewayManager.stop();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await gatewayManager.start();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('force-cleanup-gateway', async () => {
  try {
    await gatewayManager.cleanupOrphanedProcesses();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-gateway-status', () => {
  return gatewayManager.getStatus();
});

ipcMain.handle('set-auto-recovery', (event, enabled) => {
  gatewayManager.setAutoRecovery(enabled);
  return { success: true };
});

ipcMain.handle('reset-and-repair', async (event, apiKeys) => {
  return await gatewayManager.resetAndRepair(apiKeys);
});

// Config handlers
ipcMain.handle('get-config', () => {
  return configManager.getConfig();
});

ipcMain.handle('save-config', async (event, config) => {
  return configManager.saveConfig(config);
});

ipcMain.handle('get-config-section', (event, section) => {
  return configManager.getSection(section);
});

ipcMain.handle('update-config-section', (event, section, data) => {
  return configManager.updateSection(section, data);
});

// Onboarding handlers
ipcMain.handle('get-onboarding-status', () => {
  return store.get('onboardingComplete', false);
});

ipcMain.handle('set-onboarding-complete', () => {
  store.set('onboardingComplete', true);
});

ipcMain.handle('save-api-keys', async (event, keys) => {
  const result = configManager.saveApiKeys(keys);
  // Also configure OpenClaw's auth-profiles.json
  await gatewayManager.configureApiKeys(keys);
  return result;
});

ipcMain.handle('get-api-keys', () => {
  return configManager.getApiKeys();
});

ipcMain.handle('test-api-key', async (event, provider, key) => {
  return await configManager.testApiKey(provider, key);
});

// New onboarding handlers
ipcMain.handle('configure-openclaw', async (event, config) => {
  try {
    // Save configuration to OpenClaw config files
    // Build valid OpenClaw config structure (no personality key, that's invalid)
    const openclawConfig = configManager.getConfig() || {};
    
    // Update agents.defaults.model
    if (!openclawConfig.agents) openclawConfig.agents = {};
    if (!openclawConfig.agents.defaults) openclawConfig.agents.defaults = {};
    openclawConfig.agents.defaults.model = {
      primary: `${config.model.provider}/${config.model.name}`
    };
    
    // Configure channels if Telegram is enabled
    if (config.telegram.enabled) {
      if (!openclawConfig.channels) openclawConfig.channels = {};
      // Note: Telegram botToken should be in environment or credentials, not config
      // But for initial setup we'll note it - user should run 'openclaw channels login' properly
      console.log('Telegram bot configured:', config.telegram.botUsername);
    }

    // Save entire config (properly structured)
    await configManager.saveConfig(openclawConfig);

    // CRITICAL: Save API keys to auth-profiles.json (where OpenClaw reads them from)
    // This ensures keys persist across restarts
    if (config.apiKeys) {
      console.log('Saving API keys to auth-profiles.json...');
      
      // Also configure via gateway manager
      const saveResult = await gatewayManager.configureApiKeys(config.apiKeys);
      
      if (saveResult && saveResult.success) {
        console.log('API keys saved successfully');
      } else {
        console.error('Failed to save API keys via gateway manager');
      }
      
      // Keep local configManager backup too
      configManager.saveApiKeys(config.apiKeys);
    }
    
    // Also set environment variables temporarily for current session
    if (config.apiKeys.anthropic) {
      process.env.ANTHROPIC_API_KEY = config.apiKeys.anthropic;
    }
    if (config.apiKeys.openai) {
      process.env.OPENAI_API_KEY = config.apiKeys.openai;
    }
    if (config.apiKeys.google) {
      process.env.GOOGLE_API_KEY = config.apiKeys.google;
    }
    if (config.apiKeys.braveSearch) {
      process.env.BRAVE_SEARCH_API_KEY = config.apiKeys.braveSearch;
    }
    
    // Store personality/bot name in our internal store (not OpenClaw config)
    if (config.personality) {
      store.set('personality', config.personality);
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to configure OpenClaw:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('start-oauth', async (event, provider) => {
  try {
    // For Google OAuth, we would typically open a browser window
    // and handle the OAuth flow. For now, we'll return a mock success
    // In a real implementation, this would:
    // 1. Open browser to OAuth URL
    // 2. Handle callback
    // 3. Exchange code for token
    // 4. Return token
    
    const { shell } = require('electron');
    
    const oauthUrls = {
      google: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:8080/callback&response_type=code&scope=https://www.googleapis.com/auth/generative-language',
      anthropic: 'https://console.anthropic.com/',
      openai: 'https://platform.openai.com/api-keys'
    };

    if (oauthUrls[provider]) {
      await shell.openExternal(oauthUrls[provider]);
    }

    // For now, return a placeholder indicating OAuth is not fully implemented
    // In production, this would handle the full OAuth flow
    return { 
      success: false, 
      error: 'OAuth flow requires browser integration. Please use API key authentication instead.' 
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('verify-telegram-bot', async (event, token) => {
  try {
    const https = require('https');
    
    return new Promise((resolve) => {
      https.get(`https://api.telegram.org/bot${token}/getMe`, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.ok && json.result) {
              resolve({ 
                success: true, 
                username: json.result.username,
                botName: json.result.first_name
              });
            } else {
              resolve({ success: false, error: 'Invalid bot token' });
            }
          } catch (e) {
            resolve({ success: false, error: 'Failed to parse response' });
          }
        });
      }).on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('test-brave-search-key', async (event, key) => {
  try {
    const https = require('https');
    
    return new Promise((resolve) => {
      const options = {
        hostname: 'api.search.brave.com',
        path: '/res/v1/web/search?q=test',
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': key
        }
      };

      https.get(options, (res) => {
        if (res.statusCode === 200) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: 'Invalid API key' });
        }
      }).on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-external', async (event, url) => {
  try {
    const { shell } = require('electron');
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('run-openclaw-cli', async (event, command) => {
  const { spawn } = require('child_process');
  
  return new Promise((resolve) => {
    try {
      const proc = spawn('openclaw', command.split(' '), {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          code: code,
          stdout: stdout,
          stderr: stderr,
          output: stdout + stderr
        });
      });
      
      proc.on('error', (error) => {
        resolve({
          success: false,
          error: error.message,
          output: error.message
        });
      });
      
      // Timeout after 60 seconds
      setTimeout(() => {
        try {
          proc.kill();
        } catch (e) {}
        resolve({
          success: false,
          error: 'Command timed out after 60 seconds',
          output: stdout + stderr
        });
      }, 60000);
    } catch (error) {
      resolve({
        success: false,
        error: error.message,
        output: error.message
      });
    }
  });
});

ipcMain.handle('get-gateway-errors', async () => {
  // Check for common OpenClaw issues
  const errors = [];
  
  try {
    const config = configManager.getConfig();
    
    // Check for invalid config keys by running doctor
    const { spawn } = require('child_process');
    const doctor = spawn('openclaw', ['doctor', '--json'], { shell: true });
    
    let doctorOutput = '';
    doctor.stdout.on('data', (data) => {
      doctorOutput += data.toString();
    });
    
    await new Promise((resolve) => {
      doctor.on('close', () => resolve());
      setTimeout(resolve, 5000);
    });
    
    if (doctorOutput) {
      try {
        const doctorData = JSON.parse(doctorOutput);
        if (doctorData.issues) {
          errors.push(...doctorData.issues);
        }
      } catch (e) {
        // If JSON parse fails, extract errors from text
        if (doctorOutput.includes('Unrecognized key')) {
          errors.push({
            type: 'config',
            message: 'Invalid configuration keys detected',
            fix: 'openclaw doctor --fix'
          });
        }
      }
    }
    
    return { success: true, errors: errors };
  } catch (error) {
    return { success: false, error: error.message, errors: [] };
  }
});

// File/Directory handlers
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('select-file', async (event, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || []
  });
  return result.canceled ? null : result.filePaths[0];
});

// Chat/Message handlers
ipcMain.handle('send-chat-message', async (event, message) => {
  return await gatewayManager.sendMessage(message);
});

ipcMain.handle('get-chat-history', () => {
  return gatewayManager.getChatHistory();
});

// Run OpenClaw command (for onboarding)
ipcMain.handle('run-openclaw-command', async (event, command, args) => {
  return await installer.runOpenClawCommand(command, args);
});

// WhatsApp QR Code
ipcMain.handle('get-whatsapp-qr', async () => {
  return await gatewayManager.getWhatsAppQR();
});

// Notification helper
ipcMain.handle('show-notification', (event, { title, body }) => {
  new Notification({ title, body }).show();
});

// ============================================================
// Screen Recording & Workflow Automation IPC Handlers
// ============================================================

// Screen sources
ipcMain.handle('get-screen-sources', async () => {
  return await screenRecorder.getSources();
});

// Recording control
ipcMain.handle('start-recording', (event, sourceId, withVoiceAssistant = false) => {
  // Setup question callback to send to renderer
  if (withVoiceAssistant) {
    screenRecorder.setQuestionCallback((question) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('voice-assistant-question', question);
      }
    });
  }
  return screenRecorder.startRecording(sourceId, withVoiceAssistant);
});

ipcMain.handle('stop-recording', () => {
  return screenRecorder.stopRecording();
});

ipcMain.handle('save-recording', async (event, recordingId, buffer) => {
  return await screenRecorder.saveRecording(recordingId, buffer);
});

ipcMain.handle('get-recording-status', () => {
  return screenRecorder.getStatus();
});

// Input logging
ipcMain.handle('start-input-logging', (event, recordingId) => {
  return inputLogger.startLogging(recordingId);
});

ipcMain.handle('stop-input-logging', () => {
  return inputLogger.stopLogging();
});

ipcMain.handle('add-input-event', (event, inputEvent) => {
  inputLogger.addEvent(inputEvent);
  return { success: true };
});

// Voice Assistant handlers
ipcMain.handle('answer-voice-question', async (event, questionId, answer) => {
  await screenRecorder.answerQuestion(questionId, answer);
  return { success: true };
});

ipcMain.handle('capture-screen-for-analysis', async () => {
  const recentEvents = inputLogger.getRecentEvents(5000); // Last 5 seconds
  await screenRecorder.captureScreenForAnalysis(recentEvents);
  return { success: true };
});

ipcMain.handle('get-voice-context', () => {
  return screenRecorder.getVoiceAssistantContext();
});

// Gemini analysis
ipcMain.handle('analyze-recording', async (event, recordingId) => {
  try {
    const videoPath = screenRecorder.getRecordingPath(recordingId);
    const events = inputLogger.getEvents(recordingId);
    const eventsSummary = inputLogger.summarizeEvents(events);
    
    // Get voice assistant context if available
    const voiceContext = screenRecorder.getVoiceAssistantContext();
    
    const result = await geminiAnalyzer.analyzeRecording(videoPath, eventsSummary, voiceContext);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Workflow management
ipcMain.handle('save-workflow', (event, analysis, recordingId) => {
  return workflowManager.saveWorkflow(analysis, recordingId);
});

ipcMain.handle('list-workflows', () => {
  return workflowManager.listWorkflows();
});

ipcMain.handle('get-workflow', (event, id) => {
  return workflowManager.getWorkflow(id);
});

ipcMain.handle('update-workflow', (event, id, updates) => {
  return workflowManager.updateWorkflow(id, updates);
});

ipcMain.handle('delete-workflow', (event, id) => {
  return workflowManager.deleteWorkflow(id);
});

ipcMain.handle('duplicate-workflow', (event, id) => {
  return workflowManager.duplicateWorkflow(id);
});

ipcMain.handle('generate-automation-prompt', (event, id) => {
  const workflow = workflowManager.getWorkflow(id);
  return workflowManager.generateAutomationPrompt(workflow);
});

// Workflow execution — sends prompt to OpenClaw gateway
ipcMain.handle('run-workflow-automation', async (event, workflowId, prompt) => {
  const startedAt = new Date().toISOString();
  const workflow = workflowManager.getWorkflow(workflowId);
  const totalSteps = workflow?.steps?.length || 0;

  try {
    // Check if gateway is running, if not try to start it
    if (gatewayManager.status !== 'running') {
      console.log('Gateway not running, attempting to start...');
      const startResult = await gatewayManager.start();
      if (!startResult.success) {
        throw new Error(`Failed to start gateway: ${startResult.message || 'Unknown error'}`);
      }
      // Wait a moment for WebSocket to connect
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Send the automation prompt to OpenClaw via gateway
    const result = await gatewayManager.sendMessage(prompt);
    
    // Check if sendMessage returned an error (it doesn't throw, it returns error object)
    if (!result.success) {
      throw new Error(result.error || 'Failed to send message to gateway');
    }
    
    // Record the run
    workflowManager.recordRun(workflowId, {
      status: 'completed',
      startedAt,
      duration: Date.now() - new Date(startedAt).getTime(),
      stepsCompleted: totalSteps,
      totalSteps,
      logs: [`Automation prompt sent to OpenClaw successfully`]
    });

    return { success: true, result };
  } catch (error) {
    workflowManager.recordRun(workflowId, {
      status: 'failed',
      startedAt,
      duration: Date.now() - new Date(startedAt).getTime(),
      stepsCompleted: 0,
      totalSteps,
      error: error.message,
      logs: [`Error: ${error.message}`]
    });
    return { success: false, error: error.message };
  }
});

// Workflow history
ipcMain.handle('get-workflow-history', (event, workflowId) => {
  return workflowManager.getHistory(workflowId || null);
});

ipcMain.handle('clear-workflow-history', (event, workflowId) => {
  return workflowManager.clearHistory(workflowId || null);
});

// Audio transcription via Gemini
ipcMain.handle('transcribe-audio', async (event, audioBuffer) => {
  const https = require('https');
  try {
    const now = Date.now();
    if (now < transcribeBlockedUntil) {
      const retryInSeconds = Math.ceil((transcribeBlockedUntil - now) / 1000);
      return {
        success: false,
        error: `Gemini API temporarily rate-limited. Please retry in ${retryInSeconds}s.`
      };
    }

    // Get API key from multiple sources (in priority order)
    const config = configManager.getConfig() || {};
    const authProfileKeys = configManager.getApiKeys() || {};
    const keySource =
      store.get('geminiApiKey', '') ? 'electron-store(geminiApiKey)' :
      authProfileKeys.google ? 'auth-profiles(google)' :
      config?.agents?.defaults?.model?.apiKey ? 'config(agents.defaults.model.apiKey)' :
      process.env.GEMINI_API_KEY ? 'env(GEMINI_API_KEY)' :
      process.env.GOOGLE_API_KEY ? 'env(GOOGLE_API_KEY)' :
      null;

    const apiKey = store.get('geminiApiKey', '') ||
                   authProfileKeys.google ||
                   config?.agents?.defaults?.model?.apiKey ||
                   process.env.GEMINI_API_KEY ||
                   process.env.GOOGLE_API_KEY ||
                   '';

    if (!apiKey) {
      return { success: false, error: 'No Gemini API key configured. Add one in Configuration > API Keys.' };
    }

    const maskedKey = apiKey.substring(0, 6) + '...' + apiKey.substring(apiKey.length - 4);
    console.log(`[Transcribe] Using API key from ${keySource}: ${maskedKey}`);

    const base64Audio = Buffer.from(audioBuffer).toString('base64');

    const requestBody = {
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType: 'audio/webm',
              data: base64Audio
            }
          },
          {
            text: 'Transcribe this audio exactly as spoken. Output only the transcription text with no additional formatting, labels, or commentary. If there is no speech or only silence, output an empty string.'
          }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048
      }
    };

    const modelName = 'gemini-2.5-flash';
    const response = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(parsed.error?.message || `HTTP ${res.statusCode}`));
            }
          } catch (e) {
            reject(new Error(`Failed to parse response: ${data.substring(0, 200)}`));
          }
        });
      });
      req.on('error', reject);
      req.write(JSON.stringify(requestBody));
      req.end();
    });

    const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('[Transcribe] Success:', text.substring(0, 100));
    return { success: true, text: text.trim() };
  } catch (error) {
    console.error('[Transcribe] Error:', error.message);
    // Provide actionable error for quota issues
    if (error.message?.includes('quota') || error.message?.includes('free_tier') || error.message?.includes('429')) {
      const retryMatch = error.message.match(/retry in\s+([\d.]+)s/i);
      const retryMs = retryMatch ? Math.ceil(parseFloat(retryMatch[1]) * 1000) : 30000;
      transcribeBlockedUntil = Date.now() + retryMs;

      const hint = 'Gemini API rate limit hit. Please wait a moment and try again. ' +
        'If this persists, check your quota at https://ai.dev/rate-limit. ' +
        'You can update the key in Configuration > API Keys.';
      console.error('[Transcribe]', hint);
      return { success: false, error: hint };
    }
    return { success: false, error: error.message };
  }
});

// Gemini API key management
ipcMain.handle('save-gemini-api-key', (event, key) => {
  store.set('geminiApiKey', key);
  return { success: true };
});

ipcMain.handle('get-gemini-api-key', () => {
  return store.get('geminiApiKey', '');
});

// App lifecycle
app.whenReady().then(async () => {
  createWindow();
  // createTray(); // Uncomment when tray icon is ready
  
  // Auto-start gateway if enabled in config
  const appConfig = configManager.getSection('app');
  if (appConfig && appConfig.autoStartGateway) {
    setTimeout(() => {
      gatewayManager.start();
    }, 2000); // Delay to allow UI to load
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  gatewayManager.stop();
  screenRecorder.cleanup();
});
