const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

class ConfigManager {
  constructor() {
    this.configDir = path.join(os.homedir(), '.openclaw');
    this.configPath = path.join(this.configDir, 'openclaw.json');
    this.defaultConfig = {
      gateway: {
        port: 18789,
        mode: 'local',
        auth: {
          mode: 'token',
          token: this.generateToken()
        }
      },
      agents: {
        defaults: {
          model: {
            primary: 'anthropic/claude-sonnet-4-5'
          },
          maxConcurrent: 4,
          workspace: path.join(this.configDir, 'workspace')
        }
      },
      channels: {
        whatsapp: {
          dmPolicy: 'pairing',
          groupPolicy: 'allowlist'
        }
      },
      skills: {},
      cron: {}
    };
  }

  generateToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }

  ensureConfigDir() {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    
    // Ensure workspace directory
    const workspacePath = path.join(this.configDir, 'workspace');
    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
    }
  }

  getConfig() {
    try {
      this.ensureConfigDir();
      
      if (fs.existsSync(this.configPath)) {
        let content = fs.readFileSync(this.configPath, 'utf8');
        
        // Strip BOM if present
        if (content.charCodeAt(0) === 0xFEFF) {
          content = content.slice(1);
        }
        
        const config = JSON.parse(content);
        
        // Auto-fix and validate config
        const fixed = this.fixConfig(config);
        
        // Save the fixed config if it was modified
        if (JSON.stringify(fixed) !== JSON.stringify(config)) {
          console.log('Auto-repaired config file');
          this.saveConfig(fixed);
        }
        
        return fixed;
      }
      
      // Create default config if none exists
      console.log('Creating default config');
      this.saveConfig(this.defaultConfig);
      return this.defaultConfig;
    } catch (error) {
      console.error('Error reading config:', error);
      console.log('Using default config due to error');
      return this.defaultConfig;
    }
  }

  /**
   * Fix common config issues and migrate legacy formats
   */
  fixConfig(config) {
    const fixed = JSON.parse(JSON.stringify(config)); // Deep clone

    // Ensure gateway.mode exists
    if (fixed.gateway && !fixed.gateway.mode) {
      fixed.gateway.mode = 'local';
    }

    // Migrate legacy agent.* to agents.defaults.*
    if (fixed.agent) {
      if (!fixed.agents) fixed.agents = {};
      if (!fixed.agents.defaults) fixed.agents.defaults = {};

      // Migrate model
      if (fixed.agent.model && typeof fixed.agent.model === 'string') {
        fixed.agents.defaults.model = {
          primary: fixed.agent.model
        };
      }

      // Migrate workspace
      if (fixed.agent.workspace) {
        fixed.agents.defaults.workspace = fixed.agent.workspace;
      }

      // Migrate maxConcurrentRequests to maxConcurrent
      if (fixed.agent.maxConcurrentRequests) {
        fixed.agents.defaults.maxConcurrent = fixed.agent.maxConcurrentRequests;
      }

      // Remove invalid fields (thinkingLevel, emoji, name not supported by OpenClaw)
      delete fixed.agent;
    }

    // Remove apiKeys from config - OpenClaw doesn't recognize this field
    // API keys should be in auth-profiles.json, not openclaw.json
    if (fixed.apiKeys) {
      console.log('Migrating API keys from openclaw.json to auth-profiles.json');
      this.saveApiKeysToAuthProfiles(fixed.apiKeys);
      delete fixed.apiKeys;
    }

    // Migrate channels.whatsapp.enabled to proper dmPolicy
    if (fixed.channels?.whatsapp) {
      if (fixed.channels.whatsapp.enabled !== undefined) {
        // If enabled was true, set dmPolicy to pairing (safe default)
        if (fixed.channels.whatsapp.enabled && !fixed.channels.whatsapp.dmPolicy) {
          fixed.channels.whatsapp.dmPolicy = 'pairing';
        }
        delete fixed.channels.whatsapp.enabled;
      }
      if (fixed.channels.whatsapp.allowedNumbers) {
        if (!fixed.channels.whatsapp.allowFrom) {
          fixed.channels.whatsapp.allowFrom = fixed.channels.whatsapp.allowedNumbers;
        }
        delete fixed.channels.whatsapp.allowedNumbers;
      }
    }

    // Remove invalid channel fields (enabled, botToken should be in credentials, not config)
    if (fixed.channels?.telegram) {
      delete fixed.channels.telegram.enabled;
      if (fixed.channels.telegram.botToken) {
        // Log warning that bot tokens should be configured via openclaw CLI
        console.warn('Telegram botToken found in config - it should be configured via openclaw CLI');
        delete fixed.channels.telegram.botToken;
      }
    }
    if (fixed.channels?.discord) {
      delete fixed.channels.discord.enabled;
      if (fixed.channels.discord.botToken) {
        console.warn('Discord botToken found in config - it should be configured via openclaw CLI');
        delete fixed.channels.discord.botToken;
      }
    }

    // Ensure skills and cron are objects, not arrays
    if (Array.isArray(fixed.skills)) {
      fixed.skills = {};
    }
    if (Array.isArray(fixed.cron)) {
      fixed.cron = {};
    }

    // Ensure workspace exists
    if (fixed.agents?.defaults && !fixed.agents.defaults.workspace) {
      fixed.agents.defaults.workspace = path.join(this.configDir, 'workspace');
    }

    return fixed;
  }

  saveConfig(config) {
    try {
      this.ensureConfigDir();
      
      // Always remove apiKeys field before saving - it's invalid in OpenClaw config
      // API keys must be in auth-profiles.json, not openclaw.json
      const cleanConfig = JSON.parse(JSON.stringify(config)); // Deep clone
      if (cleanConfig.apiKeys) {
        console.log('⚠️  Removing invalid apiKeys field from config before save');
        delete cleanConfig.apiKeys;
      }
      
      const content = JSON.stringify(cleanConfig, null, 2);
      // Write without BOM
      fs.writeFileSync(this.configPath, content, { encoding: 'utf8' });
      return { success: true };
    } catch (error) {
      console.error('Error saving config:', error);
      return { success: false, error: error.message };
    }
  }

  getSection(section) {
    const config = this.getConfig();
    return config[section] || null;
  }

  updateSection(section, data) {
    try {
      const config = this.getConfig();
      config[section] = this.mergeDeep(config[section] || {}, data);
      return this.saveConfig(config);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  saveApiKeys(keys) {
    try {
      // Save API keys to auth-profiles.json (OpenClaw's proper location)
      this.saveApiKeysToAuthProfiles(keys);
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Save API keys to OpenClaw's auth-profiles.json in the agent directory
   */
  saveApiKeysToAuthProfiles(keys) {
    try {
      // Agent directory structure: ~/.openclaw/agents/main/agent/
      const agentDir = path.join(this.configDir, 'agents', 'main', 'agent');
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
      if (!authProfiles.default) {
        authProfiles.default = {};
      }

      // Add API keys to the default profile
      if (keys.anthropic) {
        authProfiles.default.anthropic = keys.anthropic;
      }
      if (keys.openai) {
        authProfiles.default.openai = keys.openai;
      }
      if (keys.google || keys.gemini) {
        authProfiles.default.google = keys.google || keys.gemini;
      }

      // Save auth profiles
      fs.writeFileSync(authProfilesPath, JSON.stringify(authProfiles, null, 2), 'utf8');
      console.log('API keys saved to', authProfilesPath);
      
      return { success: true };
    } catch (error) {
      console.error('Failed to save auth profiles:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get API keys from auth-profiles.json
   */
  getApiKeys() {
    try {
      const agentDir = path.join(this.configDir, 'agents', 'main', 'agent');
      const authProfilesPath = path.join(agentDir, 'auth-profiles.json');
      
      if (!fs.existsSync(authProfilesPath)) {
        return {};
      }

      const content = fs.readFileSync(authProfilesPath, 'utf8');
      const authProfiles = JSON.parse(content);
      
      return authProfiles.default || {};
    } catch (error) {
      console.error('Failed to load auth profiles:', error);
      return {};
    }
  }

  async testApiKey(provider, key) {
    try {
      switch (provider) {
        case 'anthropic':
          return await this.testAnthropicKey(key);
        case 'openai':
          return await this.testOpenAIKey(key);
        default:
          return { success: false, error: 'Unknown provider' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async testAnthropicKey(key) {
    return new Promise((resolve) => {
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          // 400 means bad request (missing body) but auth passed
          // 401 means invalid key
          if (res.statusCode === 400 || res.statusCode === 200) {
            resolve({ success: true });
          } else if (res.statusCode === 401) {
            resolve({ success: false, error: 'Invalid API key' });
          } else {
            resolve({ success: false, error: `HTTP ${res.statusCode}` });
          }
        });
      });

      req.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });

      req.write(JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }]
      }));
      req.end();

      // Timeout
      setTimeout(() => {
        resolve({ success: false, error: 'Request timed out' });
      }, 15000);
    });
  }

  async testOpenAIKey(key) {
    return new Promise((resolve) => {
      const options = {
        hostname: 'api.openai.com',
        path: '/v1/models',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${key}`
        }
      };

      const req = https.request(options, (res) => {
        if (res.statusCode === 200) {
          resolve({ success: true });
        } else if (res.statusCode === 401) {
          resolve({ success: false, error: 'Invalid API key' });
        } else {
          resolve({ success: false, error: `HTTP ${res.statusCode}` });
        }
      });

      req.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });

      req.end();

      setTimeout(() => {
        resolve({ success: false, error: 'Request timed out' });
      }, 15000);
    });
  }

  mergeDeep(target, source) {
    const output = { ...target };
    
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            output[key] = source[key];
          } else {
            output[key] = this.mergeDeep(target[key], source[key]);
          }
        } else {
          output[key] = source[key];
        }
      });
    }
    
    return output;
  }

  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  // Channel-specific methods
  getWhatsAppConfig() {
    const config = this.getConfig();
    return config.channels?.whatsapp || { enabled: false, allowedNumbers: [] };
  }

  updateWhatsAppConfig(data) {
    return this.updateSection('channels', {
      whatsapp: { ...this.getWhatsAppConfig(), ...data }
    });
  }

  getTelegramConfig() {
    const config = this.getConfig();
    return config.channels?.telegram || { enabled: false, botToken: '' };
  }

  updateTelegramConfig(data) {
    return this.updateSection('channels', {
      telegram: { ...this.getTelegramConfig(), ...data }
    });
  }

  getDiscordConfig() {
    const config = this.getConfig();
    return config.channels?.discord || { enabled: false, botToken: '' };
  }

  updateDiscordConfig(data) {
    return this.updateSection('channels', {
      discord: { ...this.getDiscordConfig(), ...data }
    });
  }
}

module.exports = ConfigManager;
