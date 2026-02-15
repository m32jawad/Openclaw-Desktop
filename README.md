# OpenClaw Desktop

A standalone Electron desktop application that simplifies OpenClaw installation, onboarding, and management through an intuitive graphical interface.

## Features

- **One-Click Installation**: Automatically detects and installs required dependencies (Node.js, npm, OpenClaw)
- **Guided Onboarding**: Visual wizard for OpenClaw setup (API keys, channels, preferences)
- **Gateway Management**: Start, stop, and restart the OpenClaw gateway from the UI
- **Configuration Editor**: Full GUI control for all OpenClaw settings
- **Chat Interface**: Send messages to OpenClaw directly from the app
- **Channel Management**: Configure WhatsApp, Telegram, and Discord integrations
- **Logs Viewer**: Real-time gateway logs with filtering and export

## Prerequisites

For development:
- Node.js 18+ installed on your system
- npm or yarn

## Installation

```bash
# Clone the repository
cd moltbot

# Install dependencies
npm install

# Start in development mode
npm start
```

## Development

```bash
# Run in development mode with auto-reload
npm run dev

# Build the renderer (React app)
npm run build:renderer
```

## Building the Installer

```bash
# Build Windows installer
npm run build:win

# Build without packaging (for testing)
npm run build:dir
```

The built installer will be in the `dist/` folder.

## Project Structure

```
openclaw-desktop/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── index.js          # Entry point, window management
│   │   ├── installer.js      # Dependency installation
│   │   ├── gateway.js        # Gateway control & WebSocket
│   │   └── config.js         # Configuration management
│   ├── renderer/             # React UI
│   │   ├── index.jsx         # React entry point
│   │   ├── App.jsx           # Main app component
│   │   ├── components/       # UI components
│   │   │   ├── TitleBar.jsx
│   │   │   ├── InstallScreen.jsx
│   │   │   ├── Onboarding.jsx
│   │   │   ├── MainApp.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Channels.jsx
│   │   │   ├── Config.jsx
│   │   │   ├── Chat.jsx
│   │   │   └── Logs.jsx
│   │   └── styles/
│   │       └── main.css
│   └── preload.js            # IPC bridge
├── resources/                # Icons, images
├── build/                    # Compiled renderer
├── dist/                     # Built installers
├── package.json
└── webpack.config.js
```

## How It Works

### Installation Flow
1. User runs the installer/app
2. System check detects Node.js, npm, and OpenClaw
3. Missing dependencies are automatically installed
4. Onboarding wizard guides through configuration

### Onboarding Steps
1. Welcome screen
2. API keys configuration (Anthropic, OpenAI)
3. Workspace directory selection
4. Channel setup (WhatsApp, Telegram, Discord)
5. Agent configuration (model, thinking level, name)
6. Completion summary

### Main Application
- **Dashboard**: Gateway status, quick actions, channel overview
- **Chat**: Direct interaction with OpenClaw AI
- **Channels**: Configure messaging integrations
- **Configuration**: Full settings editor
- **Logs**: Real-time gateway logs

## Configuration

Configuration is stored in:
- Windows: `%USERPROFILE%\.openclaw\openclaw.json`

## Security

- API keys are stored with encryption using electron-store
- Gateway uses token authentication
- All communication is local (127.0.0.1)

## Troubleshooting

### Gateway won't start
1. Check if port 18789 is available
2. Verify OpenClaw is installed: `openclaw --version`
3. Check logs in the Logs tab

### Dependencies not found
1. Click "Refresh" on the install screen
2. Try running as Administrator
3. Manually install Node.js from nodejs.org

### WebSocket connection issues
1. Ensure gateway is running
2. Check auth token matches
3. Verify firewall isn't blocking local connections

## License

MIT

## Credits

Built with:
- [Electron](https://www.electronjs.org/)
- [React](https://react.dev/)
- [OpenClaw](https://openclaw.ai/)
