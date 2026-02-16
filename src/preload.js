const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer via window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls (frameless window)
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),

  // Installation & Dependencies
  checkDependencies: () => ipcRenderer.invoke('check-dependencies'),
  isSystemReady: () => ipcRenderer.invoke('is-system-ready'),
  installNodeJs: () => ipcRenderer.invoke('install-nodejs'),
  installOpenClaw: () => ipcRenderer.invoke('install-openclaw'),
  onInstallProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('install-progress', listener);
    return () => ipcRenderer.removeListener('install-progress', listener);
  },

  // Gateway Control
  startGateway: () => ipcRenderer.invoke('start-gateway'),
  stopGateway: () => ipcRenderer.invoke('stop-gateway'),
  restartGateway: () => ipcRenderer.invoke('restart-gateway'),
  forceCleanupGateway: () => ipcRenderer.invoke('force-cleanup-gateway'),
  getGatewayStatus: () => ipcRenderer.invoke('get-gateway-status'),
  setAutoRecovery: (enabled) => ipcRenderer.invoke('set-auto-recovery', enabled),
  resetAndRepair: (apiKeys) => ipcRenderer.invoke('reset-and-repair', apiKeys),
  onGatewayStatus: (callback) => {
    const listener = (event, status) => callback(status);
    ipcRenderer.on('gateway-status', listener);
    return () => ipcRenderer.removeListener('gateway-status', listener);
  },
  onGatewayLog: (callback) => {
    const listener = (event, log) => callback(log);
    ipcRenderer.on('gateway-log', listener);
    return () => ipcRenderer.removeListener('gateway-log', listener);
  },

  // Configuration
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getConfigSection: (section) => ipcRenderer.invoke('get-config-section', section),
  updateConfigSection: (section, data) => ipcRenderer.invoke('update-config-section', section, data),

  // Onboarding
  getOnboardingStatus: () => ipcRenderer.invoke('get-onboarding-status'),
  setOnboardingComplete: () => ipcRenderer.invoke('set-onboarding-complete'),
  saveApiKeys: (keys) => ipcRenderer.invoke('save-api-keys', keys),
  getApiKeys: () => ipcRenderer.invoke('get-api-keys'),
  testApiKey: (provider, key) => ipcRenderer.invoke('test-api-key', provider, key),
  configureOpenClaw: (config) => ipcRenderer.invoke('configure-openclaw', config),
  startOAuth: (provider) => ipcRenderer.invoke('start-oauth', provider),
  verifyTelegramBot: (token) => ipcRenderer.invoke('verify-telegram-bot', token),
  testBraveSearchKey: (key) => ipcRenderer.invoke('test-brave-search-key', key),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  runOpenClawCLI: (command) => ipcRenderer.invoke('run-openclaw-cli', command),
  getGatewayErrors: () => ipcRenderer.invoke('get-gateway-errors'),

  // File/Directory dialogs
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectFile: (filters) => ipcRenderer.invoke('select-file', filters),

  // Chat
  sendChatMessage: (message) => ipcRenderer.invoke('send-chat-message', message),
  getChatHistory: () => ipcRenderer.invoke('get-chat-history'),
  onGatewayMessage: (callback) => {
    const listener = (event, message) => callback(message);
    ipcRenderer.on('gateway-message', listener);
    return () => ipcRenderer.removeListener('gateway-message', listener);
  },

  // OpenClaw Commands
  runOpenClawCommand: (command, args) => ipcRenderer.invoke('run-openclaw-command', command, args),

  // WhatsApp
  getWhatsAppQR: () => ipcRenderer.invoke('get-whatsapp-qr'),

  // Notifications
  showNotification: (options) => ipcRenderer.invoke('show-notification', options),

  // ---- Screen Recording & Workflow Automation ----

  // Screen recording
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  startRecording: (sourceId, withVoiceAssistant) => ipcRenderer.invoke('start-recording', sourceId, withVoiceAssistant),
  stopRecording: () => ipcRenderer.invoke('stop-recording'),
  saveRecording: (recordingId, buffer) => ipcRenderer.invoke('save-recording', recordingId, buffer),
  getRecordingStatus: () => ipcRenderer.invoke('get-recording-status'),

  // Input logging
  startInputLogging: (recordingId) => ipcRenderer.invoke('start-input-logging', recordingId),
  stopInputLogging: () => ipcRenderer.invoke('stop-input-logging'),
  addInputEvent: (event) => ipcRenderer.invoke('add-input-event', event),
  
  // Voice Assistant
  answerVoiceQuestion: (questionId, answer) => ipcRenderer.invoke('answer-voice-question', questionId, answer),
  captureScreenForAnalysis: () => ipcRenderer.invoke('capture-screen-for-analysis'),
  getVoiceContext: () => ipcRenderer.invoke('get-voice-context'),
  onVoiceAssistantQuestion: (callback) => {
    const listener = (event, question) => callback(question);
    ipcRenderer.on('voice-assistant-question', listener);
    return () => ipcRenderer.removeListener('voice-assistant-question', listener);
  },

  // Gemini analysis
  analyzeRecording: (recordingId) => ipcRenderer.invoke('analyze-recording', recordingId),

  // Workflow management
  saveWorkflow: (analysis, recordingId) => ipcRenderer.invoke('save-workflow', analysis, recordingId),
  listWorkflows: () => ipcRenderer.invoke('list-workflows'),
  getWorkflow: (id) => ipcRenderer.invoke('get-workflow', id),
  updateWorkflow: (id, updates) => ipcRenderer.invoke('update-workflow', id, updates),
  deleteWorkflow: (id) => ipcRenderer.invoke('delete-workflow', id),
  duplicateWorkflow: (id) => ipcRenderer.invoke('duplicate-workflow', id),
  generateAutomationPrompt: (id) => ipcRenderer.invoke('generate-automation-prompt', id),

  // Workflow execution
  runWorkflowAutomation: (workflowId, prompt) => ipcRenderer.invoke('run-workflow-automation', workflowId, prompt),

  // Workflow history
  getWorkflowHistory: (workflowId) => ipcRenderer.invoke('get-workflow-history', workflowId),
  clearWorkflowHistory: (workflowId) => ipcRenderer.invoke('clear-workflow-history', workflowId),

  // Audio transcription via Gemini
  transcribeAudio: (audioBuffer) => ipcRenderer.invoke('transcribe-audio', audioBuffer),

  // API key management for Gemini
  saveGeminiApiKey: (key) => ipcRenderer.invoke('save-gemini-api-key', key),
  getGeminiApiKey: () => ipcRenderer.invoke('get-gemini-api-key')
});

// Log when preload script loads
console.log('Preload script loaded');
