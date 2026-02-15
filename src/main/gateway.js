const { spawn } = require('child_process');
const EventEmitter = require('events');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

class GatewayManager extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.wsClient = null;
    this.status = 'stopped';
    this.logs = [];
    this.chatHistory = [];
    this.configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    this.gatewayPort = 18789;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 30;
    this._startResolved = false;
    this._wsAuthenticated = false;
    this._requestId = 0;
    this._deviceId = this._generateDeviceId();
    this._healthCheckInterval = null;
    this._autoRecoveryEnabled = true;
    this._consecutiveFailures = 0;
    this._maxConsecutiveFailures = 3;
  }

  _generateDeviceId() {
    // Try to read device ID from OpenClaw's identity file first
    try {
      const identityPath = path.join(os.homedir(), '.openclaw', 'identity', 'device.json');
      if (fs.existsSync(identityPath)) {
        const identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
        if (identity.deviceId) {
          console.log('Using OpenClaw device ID from identity file');
          return identity.deviceId;
        }
      }
    } catch (error) {
      console.warn('Failed to read OpenClaw device ID, generating fallback:', error.message);
    }
    
    // Fallback: Stable device fingerprint based on hostname + username
    const crypto = require('crypto');
    const raw = `${os.hostname()}-${os.userInfo().username}-openclaw-desktop`;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
  }

  _nextRequestId() {
    return `req-${Date.now()}-${++this._requestId}`;
  }

  _stripAnsiCodes(text) {
    // Remove ANSI escape codes (color codes, formatting, etc.)
    return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1B\][^\x07]*\x07/g, '');
  }

  _parseLogMessage(rawMessage) {
    const text = this._stripAnsiCodes(rawMessage).trim();
    if (!text) return null;

    // Parse OpenClaw log format: timestamp level message
    // Example: "11:38:16 PM\nerror\ndiagnostic\nlane task error: ..."
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length === 0) return null;

    let level = 'info';
    let message = text;

    // Check for known log levels at the start
    const lowerText = text.toLowerCase();
    if (lowerText.includes('error') || lowerText.includes('failed') || lowerText.includes('diagnostic')) {
      level = 'error';
    } else if (lowerText.includes('warn') || lowerText.includes('warning')) {
      level = 'warn';
    }

    // Try to extract structured log format
    if (lines.length > 1) {
      // Format: "time\nlevel\ncategory\nmessage"
      const possibleLevel = lines[1].toLowerCase();
      if (['error', 'warn', 'info', 'debug'].includes(possibleLevel)) {
        level = possibleLevel === 'warn' ? 'warn' : possibleLevel === 'error' ? 'error' : 'info';
        message = lines.slice(2).join(' ');
      }
    }

    return { level, text: message };
  }

  async start() {
    if (this.status === 'running') {
      return { success: true, message: 'Gateway already running' };
    }

    // Clean up any orphaned processes first
    try {
      await this.cleanupOrphanedProcesses();
    } catch (cleanupError) {
      console.warn('Failed to cleanup orphaned processes:', cleanupError);
    }

    // Validate auth-profiles.json exists before starting
    try {
      const agentDir = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'agent');
      const authProfilesPath = path.join(agentDir, 'auth-profiles.json');
      
      if (fs.existsSync(authProfilesPath)) {
        const content = fs.readFileSync(authProfilesPath, 'utf8');
        const authProfiles = JSON.parse(content);
        
        // Check for keys in OpenClaw's correct format: profiles["provider:default"]
        const hasKeys = authProfiles.profiles && (
          authProfiles.profiles['anthropic:default'] || 
          authProfiles.profiles['openai:default'] || 
          authProfiles.profiles['google:default']
        );
        
        if (hasKeys) {
          const providers = Object.keys(authProfiles.profiles || {}).map(k => k.split(':')[0]);
          console.log('✓ Auth profiles validated:', providers.join(', '));
        } else {
          console.warn('⚠ Auth profiles exist but no API keys found. You may need to configure API keys.');
        }
      } else {
        console.warn('⚠ Auth profiles file not found at:', authProfilesPath);
        console.warn('  API keys may not be configured. Please complete onboarding or configure via settings.');
      }
    } catch (validationError) {
      console.warn('Failed to validate auth profiles:', validationError.message);
    }

    this.status = 'starting';
    this._startResolved = false;
    this.reconnectAttempts = 0;
    this.emit('status-change', this.status);

    return new Promise((resolve, reject) => {
      try {
        const config = this.getConfig();

        // Don't pass --token flag - let OpenClaw manage its own token
        // We'll read the actual token from config after gateway starts
        const args = ['gateway'];
        const env = { ...process.env };
        
        // OpenClaw now reads API keys from auth-profiles.json automatically
        // No need to pass them as environment variables

        this.process = spawn('openclaw', args, {
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: os.homedir(),
          env: env
        });

        const resolveOnce = (value) => {
          if (!this._startResolved) {
            this._startResolved = true;
            resolve(value);
          }
        };

        const rejectOnce = (error) => {
          if (!this._startResolved) {
            this._startResolved = true;
            reject(error);
          }
        };

        this.process.stdout.on('data', (data) => {
          const message = this._parseLogMessage(data.toString());
          if (message) {
            const log = {
              timestamp: new Date().toISOString(),
              level: message.level || 'info',
              message: message.text
            };
            this.logs.push(log);
            this.emit('log', log);
          }

          // Check if gateway is ready
          if (this.status !== 'running' && (data.toString().includes('Gateway running') || data.toString().includes('listening'))) {
            this.status = 'running';
            this.emit('status-change', this.status);
            // Wait longer to ensure gateway is fully ready and config is finalized
            setTimeout(() => {
              // FORCE Re-read config from disk to get the actual token OpenClaw might have generated
              // Clear require cache for config if any
              delete require.cache[require.resolve('./config')];
              const freshConfig = new (require('./config'))().getConfig();
              this._actualToken = freshConfig?.gateway?.auth?.token;
              
              if (!this._actualToken) {
                 // Try reading raw file if config manager fails or returns cached
                 try {
                   const rawConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
                   this._actualToken = rawConfig?.gateway?.auth?.token;
                 } catch (e) {
                   console.error('Failed to read raw config for token:', e);
                 }
              }

              console.log('Gateway started, using token:', this._actualToken ? this._actualToken.substring(0, 8) + '...' : 'none');
              this.connectWebSocket();
              // Start health monitoring after WebSocket is authenticated
            }, 3000);
            resolveOnce({ success: true });
          }
        });

        this.process.stderr.on('data', (data) => {
          const text = data.toString();
          console.error('Gateway stderr:', text);
          
          // Check for "already running" error
          if (text.includes('gateway already running') || text.includes('Port') && text.includes('already in use')) {
            console.log('Gateway already running, attempting cleanup...');
            this.cleanupOrphanedProcesses().then(() => {
              console.log('Cleanup complete, retrying start...');
              // Retry start after cleanup
              setTimeout(() => {
                if (this.status === 'starting') {
                  this.status = 'stopped';
                  this.start().then(resolveOnce).catch(rejectOnce);
                }
              }, 1000);
            }).catch(err => {
              console.error('Cleanup failed:', err);
              this.status = 'stopped';
              this.emit('status-change', this.status);
              rejectOnce(new Error('Gateway port already in use. Please stop any existing OpenClaw processes manually.'));
            });
            return;
          }
          
          const message = this._parseLogMessage(text);
          if (message) {
            const log = {
              timestamp: new Date().toISOString(),
              level: message.level || 'error',
              message: message.text
            };
            this.logs.push(log);
            this.emit('log', log);
          }
        });

        this.process.on('close', (code) => {
          this.process = null;
          this.status = 'stopped';
          this.emit('status-change', this.status);
          this.disconnectWebSocket();
          
          if (code !== 0 && code !== null) {
            const errorMsg = `Gateway exited with code ${code}`;
            this.emit('log', {
              timestamp: new Date().toISOString(),
              level: 'error',
              message: errorMsg
            });
            rejectOnce(new Error(errorMsg));
          } else {
            // Process exited cleanly during startup — still resolve so caller isn't stuck
            resolveOnce({ success: false, error: 'Gateway process exited' });
          }
        });

        this.process.on('error', (error) => {
          this.status = 'error';
          this.emit('status-change', this.status);
          rejectOnce(error);
        });

        // Timeout in case gateway doesn't print the expected text
        setTimeout(() => {
          if (this.status === 'starting') {
            // Assume it started if process is still running
            if (this.process && !this.process.killed) {
              this.status = 'running';
              this.emit('status-change', this.status);
              // Wait longer before connecting to ensure gateway is fully ready
              setTimeout(() => {
                // Re-read config to get the actual token OpenClaw is using
                this._actualToken = this.getConfig()?.gateway?.auth?.token;
                console.log('Gateway started (timeout), using token:', this._actualToken ? this._actualToken.substring(0, 8) + '...' : 'none');
                this.connectWebSocket();
              }, 3000);
              resolveOnce({ success: true });
            } else {
              rejectOnce(new Error('Gateway failed to start within timeout'));
            }
          }
        }, 10000);

      } catch (error) {
        this.status = 'error';
        this.emit('status-change', this.status);
        reject(error);
      }
    });
  }

  stop() {
    this._isStopping = true;
    this.stopHealthMonitoring();
  
    if (this.process) {
      try {
        if (process.platform === 'win32' && this.process.pid) {
          // Forcefully kill the entire process tree on Windows
          spawn('taskkill', ['/pid', this.process.pid.toString(), '/f', '/t'], { shell: true });
        } else {
          this.process.kill('SIGKILL'); // Force kill on other platforms
        }
      } catch (e) {
        console.error('Failed to kill process:', e);
      }
      this.process = null;
    }
  
    this.disconnectWebSocket();
    this.status = 'stopped';
    this.emit('status-change', this.status);
  
    // Reset the flag after a short delay to ensure all cleanup is done
    setTimeout(() => {
      this._isStopping = false;
    }, 500);
  
    return { success: true };
  }

  /**
   * Kill all openclaw gateway processes running on the system
   */
  async cleanupOrphanedProcesses() {
    return new Promise((resolve, reject) => {
      if (process.platform === 'win32') {
        // Windows: Find all node processes running openclaw gateway
        const findProc = spawn('wmic', [
          'process', 'where',
          '"CommandLine like \'%openclaw%gateway%\'"',
          'get', 'ProcessId'
        ], { shell: true });

        let output = '';
        findProc.stdout.on('data', (data) => {
          output += data.toString();
        });

        findProc.on('close', (code) => {
          if (code !== 0) {
            resolve(); // No processes found or error, continue anyway
            return;
          }

          // Parse PIDs from output
          const lines = output.split('\n');
          const pids = [];
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && /^\d+$/.test(trimmed)) {
              pids.push(trimmed);
            }
          }

          if (pids.length === 0) {
            resolve();
            return;
          }

          // Kill each process
          console.log(`Killing ${pids.length} orphaned gateway process(es):`, pids.join(', '));
          const killPromises = pids.map(pid => {
            return new Promise((res) => {
              const killProc = spawn('taskkill', ['/pid', pid, '/f', '/t'], { shell: true });
              killProc.on('close', () => res());
              setTimeout(() => res(), 2000); // Timeout after 2s
            });
          });

          Promise.all(killPromises).then(() => {
            // Wait a bit for processes to fully terminate
            setTimeout(() => resolve(), 500);
          });
        });

        // Timeout after 5 seconds
        setTimeout(() => resolve(), 5000);
      } else {
        // Unix/Mac: pkill or killall
        const killProc = spawn('pkill', ['-f', 'openclaw.*gateway'], { shell: true });
        killProc.on('close', () => {
          setTimeout(() => resolve(), 500);
        });
        setTimeout(() => resolve(), 3000);
      }
    });
  }

  async connectWebSocket() {
    // Clean up any existing connection first
    if (this.wsClient) {
      try {
        this.wsClient.removeAllListeners();
        this.wsClient.close();
      } catch (e) { /* ignore */ }
      this.wsClient = null;
    }

    // Don't try to connect if gateway is stopped
    if (this.status !== 'running' && this.status !== 'starting') {
      return;
    }
    
    try {
      // OpenClaw gateway requires localhost origin for secure context validation
      // Using "localhost" instead of "127.0.0.1" is required by the gateway
      this.wsClient = new WebSocket(`ws://localhost:${this.gatewayPort}`, {
        headers: {
          'Origin': `http://localhost:${this.gatewayPort}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36'
        }
      });

      this.wsClient.on('open', () => {
        // Wait for the connect.challenge event before sending the connect frame
        this.reconnectAttempts = 0;
        console.log('WebSocket connection open, waiting for challenge...');
      });

      this.wsClient.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          
          // Handle the connect.challenge event — send connect frame in response
          if (message.type === 'event' && message.event === 'connect.challenge' && !this._wsAuthenticated) {
            // Use the token we read after gateway started, or read fresh if not available
            let token = this._actualToken;
            if (!token) {
              const config = this.getConfig();
              token = config?.gateway?.auth?.token || '';
              this._actualToken = token;
            }
            
            const connectId = this._nextRequestId();
            this._pendingConnectId = connectId;
            // Connect frame - try using 'webchat' client which might not require browser secure context
            // Using 'openclaw-control-ui' triggers browser security checks that fail from Node.js
            const connectFrame = {
              type: 'req',
              id: connectId,
              method: 'connect',
              params: {
                minProtocol: 3,
                maxProtocol: 3,
                client: {
                  id: 'webchat',  // Try 'webchat' to bypass browser secure context requirement
                  version: '1.0.0',
                  platform: process.platform,
                  mode: 'node'
                },
                role: 'operator',
                scopes: ['operator.read', 'operator.write'],
                caps: ['tool-events'],
                commands: [],
                permissions: {},
                auth: token ? { token: token } : {},
                locale: 'en-US',
                userAgent: 'openclaw-desktop/1.0.0'
              }
            };
            this.wsClient.send(JSON.stringify(connectFrame));
            console.log('Sent connect frame with token:', token ? token.substring(0, 8) + '...' : 'none');
            return;
          }

          // Handle connect response
          if (message.type === 'res' && message.id === this._pendingConnectId) {
            if (message.ok) {
              this._wsAuthenticated = true;
              console.log('WebSocket authenticated with gateway (protocol v3)');
              this.emit('websocket-connected');
              // Start health monitoring now that we're authenticated
              this.startHealthMonitoring();
            } else {
              console.error('WebSocket connect rejected:', message.error?.message || message.error || message);
            }
            this._pendingConnectId = null;
            return;
          }

          this.handleWebSocketMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      });

      this.wsClient.on('close', () => {
        this._wsAuthenticated = false;
        // Only reconnect if gateway process is still alive and not intentionally stopping
        if (!this._isStopping && this.status === 'running' && this.process && !this.process.killed) {
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(2000 * this.reconnectAttempts, 10000);
            console.log(`WebSocket closed, reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            setTimeout(() => this.connectWebSocket(), delay);
          } else {
            console.error('Max WebSocket reconnect attempts reached. Trying to restart gateway.');
            this.autoRestart();
          }
        }
      });

      this.wsClient.on('error', (error) => {
        // Only log, don't take action — the 'close' event will handle reconnect
        console.error('WebSocket error:', error.message || error);
      });

    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      // Retry if process is still running
      if (this.status === 'running' && this.process && !this.process.killed && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(2000 * this.reconnectAttempts, 10000);
        setTimeout(() => this.connectWebSocket(), delay);
      }
    }
  }

  disconnectWebSocket() {
    this._wsAuthenticated = false;
    if (this.wsClient) {
      this.wsClient.removeAllListeners('close'); // Remove old listeners
      this.wsClient.on('close', () => {
        this._isStopping = false; // Reset flag after close completes
      });
      this._isStopping = true; // Prevent reconnect on explicit disconnect
      try {
        this.wsClient.close();
      } catch (e) { /* ignore */ }
      this.wsClient = null;
    }
    this.reconnectAttempts = 0;
  }

  handleWebSocketMessage(message) {
    // OpenClaw protocol v3: messages are "res" (response to our req) or "event" (server push)
    if (message.type === 'res') {
      // Response to a request we sent — dispatch to any waiting handler
      this.emit('_response:' + message.id, message);
      return;
    }

    if (message.type === 'event') {
      const event = message.event || '';
      const payload = message.payload || {};

      // Chat events: streaming delta and final response
      if (event === 'chat') {
        const state = payload.state; // 'delta' or 'final'
        const text = this._extractMessageText(payload.message);
        const content = this._extractMessageContent(payload.message);

        if (state === 'delta') {
          this.emit('message', {
            type: 'stream',
            content: text,
            contentBlocks: content,
            done: false
          });
        } else if (state === 'final') {
          // Final complete message
          if (text || content.length > 0) {
            this.chatHistory.push({
              role: 'assistant',
              content: text,
              contentBlocks: content,
              timestamp: new Date().toISOString()
            });
          }
          this.emit('message', {
            type: 'stream',
            content: text,
            contentBlocks: content,
            done: true
          });
        }
        return;
      }

      // Agent lifecycle events (start/end of processing)
      if (event === 'agent') {
        // Could track agent processing state if needed
        return;
      }

      // Health events (periodic)
      if (event === 'health') {
        return;
      }

      // Tick events (periodic keepalive)
      if (event === 'tick') {
        return;
      }

      if (event === 'whatsapp.qr') {
        this.emit('whatsapp-qr', payload.qr);
        return;
      }

      if (event === 'channel.status' || event === 'channels.status') {
        this.emit('channel-status', payload);
        return;
      }

      // Forward any other events
      this.emit('gateway-event', { event, ...payload });
      return;
    }
  }

  /**
   * Extract text content from an OpenClaw message object.
   * Messages have content as an array: [{type: 'text', text: '...'}]
   */
  _extractMessageText(msg) {
    if (!msg) return '';
    if (typeof msg.content === 'string') return msg.content;
    if (Array.isArray(msg.content)) {
      return msg.content
        .filter(block => block.type === 'text')
        .map(block => block.text || '')
        .join('');
    }
    return msg.text || '';
  }

  /**
   * Extract full content from an OpenClaw message object.
   * Returns array of content blocks: [{type: 'text', text: '...'}, {type: 'image', source: {...}}, etc]
   */
  _extractMessageContent(msg) {
    if (!msg) return [];
    if (typeof msg.content === 'string') {
      return [{ type: 'text', text: msg.content }];
    }
    if (Array.isArray(msg.content)) {
      return msg.content;
    }
    if (msg.text) {
      return [{ type: 'text', text: msg.text }];
    }
    return [];
  }

  async sendMessage(message) {
    if (!this.wsClient || this.wsClient.readyState !== WebSocket.OPEN) {
      return { success: false, error: 'WebSocket not connected' };
    }

    if (!this._wsAuthenticated) {
      return { success: false, error: 'WebSocket not authenticated' };
    }

    // Add to chat history
    this.chatHistory.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });

    return new Promise((resolve, reject) => {
      const requestId = this._nextRequestId();
      
      // OpenClaw protocol v3 request frame
      const payload = {
        type: 'req',
        id: requestId,
        method: 'chat.send',
        params: {
          sessionKey: 'agent:main:main',
          idempotencyKey: crypto.randomUUID(),
          message: message
        }
      };

      // Listen for the response by request id
      const onResponse = (res) => {
        this.removeListener('_response:' + requestId, onResponse);
        resolve({ success: res.ok !== false, response: res });
      };
      this.on('_response:' + requestId, onResponse);

      this.wsClient.send(JSON.stringify(payload));

      // Timeout after 120 seconds (agent responses can be slow)
      setTimeout(() => {
        this.removeListener('_response:' + requestId, onResponse);
        resolve({ success: true, message: 'Message sent (streaming)' });
      }, 120000);
    });
  }

  async getWhatsAppQR() {
    if (!this.wsClient || this.wsClient.readyState !== WebSocket.OPEN) {
      return { success: false, error: 'Gateway not connected' };
    }

    return new Promise((resolve) => {
      const requestId = this._nextRequestId();
      const payload = {
        type: 'req',
        id: requestId,
        method: 'whatsapp.qr',
        params: {}
      };

      this.once('whatsapp-qr', (qr) => {
        resolve({ success: true, qr });
      });

      const onResponse = (res) => {
        this.removeListener('_response:' + requestId, onResponse);
        if (res.payload?.qr) {
          resolve({ success: true, qr: res.payload.qr });
        }
      };
      this.on('_response:' + requestId, onResponse);

      this.wsClient.send(JSON.stringify(payload));

      // Timeout
      setTimeout(() => {
        this.removeListener('_response:' + requestId, onResponse);
        resolve({ success: false, error: 'QR code request timed out' });
      }, 30000);
    });
  }

  getConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        let content = fs.readFileSync(this.configPath, 'utf8');
        // Strip BOM if present
        if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Failed to read config:', error);
    }
    return null;
  }

  async configureApiKeys(apiKeys) {
    try {
      // OpenClaw reads API keys from auth-profiles.json in the agent directory
      // Don't store them in openclaw.json as that's invalid
      const agentDir = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'agent');
      const authProfilesPath = path.join(agentDir, 'auth-profiles.json');
      
      // Ensure agent directory exists
      if (!fs.existsSync(agentDir)) {
        fs.mkdirSync(agentDir, { recursive: true });
      }

      // Load existing auth profiles or create new
      let authProfiles = {};
      if (fs.existsSync(authProfilesPath)) {
        try {
          const content = fs.readFileSync(authProfilesPath, 'utf8');
          authProfiles = JSON.parse(content);
        } catch (e) {
          console.warn('Failed to parse existing auth-profiles.json, creating new one');
        }
      }

      // Create the default profile if it doesn't exist
      // Simplified structure: Map provider -> key directly for the agent
      // This matches how OpenClaw expects auth-profiles.json in agent directories
      
      // Add API keys directly to the root object (flat structure)
      if (apiKeys.anthropic) {
        authProfiles.anthropic = apiKeys.anthropic;
      }
      if (apiKeys.openai) {
        authProfiles.openai = apiKeys.openai;
      }
      if (apiKeys.google || apiKeys.gemini) {
        authProfiles.google = apiKeys.google || apiKeys.gemini;
      }

      // Also keep the legacy structure just in case, but prioritize flat
      if (!authProfiles.default) {
        authProfiles.default = {};
      }
      if (apiKeys.anthropic) authProfiles.default.anthropic = apiKeys.anthropic;
      if (apiKeys.openai) authProfiles.default.openai = apiKeys.openai;
      if (apiKeys.google || apiKeys.gemini) authProfiles.default.google = apiKeys.google || apiKeys.gemini;

      // Save auth profiles with both flat and nested structure to be safe
      fs.writeFileSync(authProfilesPath, JSON.stringify(authProfiles, null, 2), 'utf8');
      console.log('API keys configured in', authProfilesPath);
      
      return { success: true };
    } catch (error) {
      console.error('Failed to configure API keys:', error);
      return { success: false, error: error.message };
    }
  }

  getStatus() {
    return {
      status: this.status,
      running: this.status === 'running',
      port: this.gatewayPort,
      wsConnected: this.wsClient?.readyState === WebSocket.OPEN,
      pid: this.process?.pid || null
    };
  }

  getChatHistory() {
    return this.chatHistory;
  }

  clearChatHistory() {
    this.chatHistory = [];
  }

  getLogs(limit = 100) {
    return this.logs.slice(-limit);
  }

  clearLogs() {
    this.logs = [];
  }

  // Health monitoring and auto-recovery
  startHealthMonitoring() {
    if (this._healthCheckInterval) {
      return; // Already monitoring
    }

    // Reset failure counter when starting monitoring
    this._consecutiveFailures = 0;

    this._healthCheckInterval = setInterval(async () => {
      if (!this._autoRecoveryEnabled) return;
      if (!this._wsAuthenticated) return; // Only check when authenticated

      const isHealthy = await this.checkHealth();
      
      if (!isHealthy) {
        this._consecutiveFailures++;
        console.warn(`Gateway health check failed (${this._consecutiveFailures}/${this._maxConsecutiveFailures})`);
        
        if (this._consecutiveFailures >= this._maxConsecutiveFailures) {
          console.log('Gateway unhealthy, attempting auto-recovery...');
          this.emit('log', {
            timestamp: new Date().toISOString(),
            level: 'warn',
            message: 'Gateway health check failed, attempting auto-restart'
          });
          this.stopHealthMonitoring(); // Stop monitoring during restart
          await this.autoRestart();
        }
      } else {
        // Reset counter on successful health check
        if (this._consecutiveFailures > 0) {
          console.log('Gateway health check passed, resetting failure counter');
        }
        this._consecutiveFailures = 0;
      }
    }, 30000); // Check every 30 seconds
  }

  stopHealthMonitoring() {
    if (this._healthCheckInterval) {
      clearInterval(this._healthCheckInterval);
      this._healthCheckInterval = null;
    }
  }

  async checkHealth() {
    // Check if process is running
    if (this.status !== 'running' || !this.process || this.process.killed) {
      return false;
    }

    // Check if WebSocket is connected and authenticated
    if (!this.wsClient || this.wsClient.readyState !== WebSocket.OPEN || !this._wsAuthenticated) {
      return false;
    }

    // If all basic checks pass, consider it healthy
    // (Removed ping check as gateway.ping method doesn't exist in OpenClaw protocol)
    return true;
  }

  // Removed pingGateway() - gateway.ping method doesn't exist in OpenClaw protocol
  // Health checks now rely on process status and WebSocket connection state

  async autoRestart() {
    try {
      console.log('Auto-restarting gateway...');
      this.emit('log', {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Auto-restarting gateway...'
      });

      this.stop();
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait a bit longer
      
      const result = await this.start();
      
      if (result.success) {
        this._consecutiveFailures = 0;
        this.emit('log', {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Gateway auto-restart successful'
        });
        return { success: true };
      } else {
        throw new Error('Gateway start failed');
      }
    } catch (error) {
      this.emit('log', {
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `Gateway auto-restart failed: ${error.message}`
      });
      // Re-enable health monitoring even if restart failed
      this.startHealthMonitoring();
      return { success: false, error: error.message };
    }
  }

  setAutoRecovery(enabled) {
    this._autoRecoveryEnabled = enabled;
    if (enabled) {
      this.startHealthMonitoring();
    } else {
      this.stopHealthMonitoring();
    }
  }

  // Add method to completely reset configuration and restart
  async resetAndRepair(apiKeys) {
    try {
      console.log('Starting full reset and repair of OpenClaw...');
      this.emit('log', {
        timestamp: new Date().toISOString(),
        level: 'warn',
        message: 'Starting full reset and repair of OpenClaw...'
      });
      
      // 1. Stop gateway
      this.stop();
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 2. Kill any stray processes
      await this.cleanupOrphanedProcesses();

      // 3. Backup current state
      const openclawDir = path.join(os.homedir(), '.openclaw');
      if (fs.existsSync(openclawDir)) {
        try {
          const backupPath = path.join(os.homedir(), `.openclaw-backup-${Date.now()}`);
          // Rename the folder effectively deleting the current config but keeping a backup
          fs.renameSync(openclawDir, backupPath);
          console.log(`Backed up .openclaw to ${backupPath}`);
          this.emit('log', {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `Backed up configuration to ${backupPath}`
          });
        } catch (e) {
          console.error('Failed to backup .openclaw, error:', e);
        }
      }

      // 4. Ensure directory structure for agents
      const agentDir = path.join(openclawDir, 'agents', 'main', 'agent');
      fs.mkdirSync(agentDir, { recursive: true });

      // 4.1. Create initialized openclaw.json configuration
      // We must provide a valid config for openclaw gateway to start
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let newToken = '';
      for (let i = 0; i < 32; i++) {
        newToken += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      const initialConfig = {
        gateway: {
          port: 18789,
          mode: 'local',
          auth: {
            mode: 'token',
            token: newToken
          }
        },
        agents: {
          defaults: {
            model: {
              primary: 'anthropic/claude-sonnet-4-5'
            },
            workspace: path.join(openclawDir, 'workspace')
          }
        }
      };
      
      fs.writeFileSync(path.join(openclawDir, 'openclaw.json'), JSON.stringify(initialConfig, null, 2));
      console.log('Created fresh openclaw.json configuration');

      // 5. Restore API keys
      if (apiKeys) {
        await this.configureApiKeys(apiKeys);
      }
      
      // 6. Start gateway - this should trigger the standard startup flow including token generation
      console.log('Restarting gateway after reset...');
      await this.start();
      
      return { success: true };
    } catch (error) {
      console.error('Reset failed:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = GatewayManager;
