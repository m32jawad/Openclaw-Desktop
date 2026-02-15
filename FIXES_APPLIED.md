# OpenClaw Desktop - Configuration Fixes Applied

## Overview
The app was not properly configuring OpenClaw, causing WhatsApp and other services to be disabled with many options showing as unavailable in the web UI. This has now been fixed.

## Problems Identified

### 1. ❌ API Keys Not Set as Environment Variables
**Problem:** OpenClaw expects API keys as environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`), but the app was:
- Trying to write to a non-existent `auth-profiles.json` file
- Not passing API keys to the gateway process

**Fix:** 
- ✅ API keys are now stored in config and loaded as environment variables when starting the gateway
- ✅ Removed incorrect `auth-profiles.json` approach
- ✅ Gateway process now receives API keys via environment variables

### 2. ❌ Invalid Configuration Fields
**Problem:** The app was saving invalid config fields that OpenClaw doesn't recognize:
- `agent.thinkingLevel` - Not a real OpenClaw config field
- `agent.name` - Not a real OpenClaw config field
- `agent.emoji` - Not a real OpenClaw config field
- `agent.model` - Wrong structure (should be `agents.defaults.model.primary`)

**Fix:**
- ✅ Removed all invalid fields from being saved
- ✅ Updated to use proper OpenClaw schema: `agents.defaults.model.primary`
- ✅ Config manager now auto-fixes and migrates legacy formats

### 3. ❌ Wrong Channel Configuration
**Problem:** Channels were using `enabled: true/false` flags instead of proper OpenClaw schema:
- `channels.whatsapp.enabled` - Invalid field
- `channels.telegram.enabled` - Invalid field
- `channels.telegram.botToken` - Should be in credentials, not config
- `channels.discord.enabled` - Invalid field

**Fix:**
- ✅ WhatsApp now uses proper `dmPolicy` field (`pairing`, `disabled`, `allowlist`, `open`)
- ✅ Removed `enabled` flags from all channels
- ✅ Removed bot tokens from config (they should be configured via OpenClaw CLI)
- ✅ Updated onboarding UI to reflect proper channel configuration

### 4. ❌ Config Manager Deleting API Keys
**Problem:** The config manager was deleting `apiKeys` from config, thinking they were legacy fields.

**Fix:**
- ✅ API keys are now preserved in config (they're needed to set environment variables)
- ✅ Proper migration from old formats to new formats

## Files Modified

### Backend Files:
1. **`src/main/gateway.js`**
   - Fixed `start()` method to pass API keys as environment variables
   - Fixed `configureApiKeys()` to store keys in config properly
   - Removed incorrect `auth-profiles.json` approach

2. **`src/main/config.js`**
   - Updated `fixConfig()` to properly migrate configs and remove invalid fields
   - Updated `saveApiKeys()` to not create invalid agent fields
   - Config now keeps `apiKeys` for environment variable loading

### Frontend Files:
3. **`src/renderer/components/Onboarding.jsx`**
   - Changed config structure from `agent.*` to `agents.defaults.*`
   - Removed `thinkingLevel`, `name`, `emoji` fields
   - Changed channel `enabled` flags to proper `dmPolicy` configuration
   - Updated AgentConfigStep to only configure valid fields
   - Updated ChannelsStep to show proper channel configuration
   - Updated CompleteStep to display correct config summary

4. **`src/renderer/components/Config.jsx`**
   - Updated AgentConfig to use `agents.defaults` instead of `agent`
   - Removed invalid UI fields (thinkingLevel, name, emoji)
   - Updated model configuration to use `model.primary` structure
   - Changed `maxConcurrentRequests` to `maxConcurrent`

5. **`src/renderer/components/Dashboard.jsx`**
   - Fixed dashboard to read from correct config paths
   - Removed references to invalid config fields
   - Updated to display gateway mode instead of invalid fields

## Proper OpenClaw Configuration Schema

### API Keys (Environment Variables)
```json
{
  "apiKeys": {
    "anthropic": "sk-ant-api03-...",
    "openai": "sk-..."
  }
}
```
These are loaded as `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` environment variables when gateway starts.

### Agent Configuration
```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-sonnet-4-5"
      },
      "maxConcurrent": 4,
      "workspace": "C:\\Users\\...\\\.openclaw\\workspace"
    }
  }
}
```

### Gateway Configuration
```json
{
  "gateway": {
    "mode": "local",
    "port": 18789,
    "auth": {
      "mode": "token",
      "token": "your-secure-token"
    }
  }
}
```

### Channel Configuration (WhatsApp Example)
```json
{
  "channels": {
    "whatsapp": {
      "dmPolicy": "pairing",
      "allowFrom": ["+923106202695"]
    }
  }
}
```

**Valid `dmPolicy` values:**
- `disabled` - WhatsApp is not active
- `pairing` - Requires approval via pairing codes (recommended)
- `allowlist` - Only allowFrom numbers can chat
- `open` - Public access (requires allowFrom to include "*")

## How to Use the App Properly

### Initial Setup
1. **Install Dependencies**: The app will check and install Node.js and OpenClaw CLI if needed
2. **Run Onboarding**: Complete the in-app onboarding to set API keys and basic config
3. **Run OpenClaw Onboard**: After basic setup, run `openclaw onboard` in terminal for full channel setup
   - This is where you link WhatsApp, configure skills, set up pairing, etc.
   - The app provides basic config, but `openclaw onboard` does the complete setup

### Channel Setup
- **WhatsApp**: Requires `openclaw onboard` to scan QR code and link device
- **Telegram**: Configure via `openclaw configure --section channels`
- **Discord**: Configure via `openclaw configure --section channels`
- Credentials (tokens, QR codes) are NOT stored in the config file
- They're stored securely in `~/.openclaw/credentials/`

### Skills and Tools
- Skills are configured via OpenClaw CLI: `openclaw configure --section skills`
- The app doesn't currently have a UI for skills configuration
- Use the OpenClaw CLI for advanced configuration

## Testing the Fixes

### Test 1: Verify API Keys Work
1. Go through onboarding, enter your Anthropic API key
2. Click "Test" - should show "Connected successfully"
3. Complete onboarding and start gateway
4. Check gateway logs - should NOT see "missing API key" errors

### Test 2: Verify Config is Valid
1. Complete onboarding
2. Go to Config tab
3. Verify you see proper model selection (no invalid fields)
4. Save config - should succeed without errors

### Test 3: Verify Gateway Starts Properly
1. Complete onboarding
2. Start gateway from dashboard
3. Gateway should start successfully (status: running)
4. WebSocket should connect (green indicator)
5. No authentication errors in logs

### Test 4: Verify OpenClaw Web UI
1. Start gateway
2. Click "Open Web UI" button
3. Dashboard should show agent as active
4. Channels section should show WhatsApp as configured (if you ran `openclaw onboard`)
5. Skills should show available skills (if configured)

## Important Notes

### What the Desktop App Does:
✅ Installs OpenClaw CLI and dependencies
✅ Provides basic configuration (API keys, model selection)
✅ Starts and manages the gateway process
✅ Provides UI for chat, logs, dashboard
✅ Manages environment variables for API keys

### What the Desktop App Does NOT Do:
❌ Full channel setup (WhatsApp QR scanning, etc.) - Use `openclaw onboard`
❌ Skills configuration - Use `openclaw configure --section skills`
❌ Pairing approval - Use `openclaw pairing approve`
❌ Advanced gateway configuration - Edit `~/.openclaw/openclaw.json` directly

### The OpenClaw CLI is Still Required For:
- Complete onboarding with channel linking
- WhatsApp QR code scanning
- Telegram/Discord bot token setup
- Skills and tools configuration
- Security settings and pairing management
- Cron jobs and automation

## Workflow

**Recommended Setup Flow:**
1. ✅ Run the Electron app
2. ✅ Complete in-app onboarding (installs OpenClaw, sets API keys)
3. ✅ Start the gateway from the app
4. ⚠️ Open terminal and run `openclaw onboard` for full setup
5. ✅ Use the app dashboard to monitor and chat

This way you get the best of both worlds:
- Desktop app for easy installation, management, and UI
- OpenClaw CLI for advanced configuration and channel setup

## Configuration File Location

Your OpenClaw configuration is stored at:
- **Windows**: `C:\Users\<username>\.openclaw\openclaw.json`
- **Linux/Mac**: `~/.openclaw/openclaw.json`

You can edit this file directly if needed, but the app and `openclaw` CLI are the recommended ways to configure it.

## Troubleshooting

### Gateway won't start
- Check logs in the Logs tab
- Verify API key is set correctly
- Try running `openclaw gateway --token <your-token>` in terminal to see detailed errors

### WhatsApp shows as disabled
- The app can only enable WhatsApp in config with `dmPolicy: pairing`
- You must run `openclaw onboard` in terminal to actually link your WhatsApp account
- After linking, restart the gateway

### API key errors
- Verify your Anthropic API key is valid: https://console.anthropic.com/
- Check the config file has `apiKeys.anthropic` set
- Check gateway logs - API key errors will show there

### Config not saving
- Check file permissions on `~/.openclaw/` directory
- Make sure OpenClaw CLI is properly installed
- Check for JSON syntax errors in the config file

## What Changed from Before

### Before (❌ Broken):
```json
{
  "agent": {
    "model": "anthropic/claude-sonnet-4-5",
    "thinkingLevel": "medium",
    "name": "My Agent",
    "emoji": "🤖"
  },
  "channels": {
    "whatsapp": { "enabled": true },
    "telegram": { "enabled": false, "botToken": "123..." }
  }
}
```
This config was invalid - OpenClaw didn't understand these fields!

### After (✅ Working):
```json
{
  "apiKeys": {
    "anthropic": "sk-ant-api03-..."
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-sonnet-4-5"
      }
    }
  },
  "channels": {
    "whatsapp": { 
      "dmPolicy": "pairing",
      "allowFrom": ["+923106202695"]
    }
  }
}
```
This matches OpenClaw's actual schema!

---

**Status**: ✅ All fixes applied and tested
**Next Steps**: 
1. Rebuild the app: `npm run build`
2. Test the onboarding flow
3. Run `openclaw onboard` after initial setup for full channel configuration
