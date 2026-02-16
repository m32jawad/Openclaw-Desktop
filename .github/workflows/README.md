# GitHub Actions Workflows

This directory contains CI/CD workflows for building the OpenClaw Desktop application.

## Available Workflows

### 🍎 `build-mac.yml` - macOS Only
Builds the application for macOS (both Intel and Apple Silicon).

**Triggers:**
- Push to `main` or `master` branch
- Push tags matching `v*` (e.g., `v1.0.0`)
- Pull requests
- Manual trigger via GitHub UI

**Outputs:**
- `.dmg` installer (macOS disk image)
- `.zip` archive (universal binary)

**Usage:**
```bash
# Trigger manually from GitHub Actions tab
# Or push a tag:
git tag v1.0.0
git push origin v1.0.0
```

### 🌍 `build-all.yml` - All Platforms
Builds for Windows, macOS, and Linux in parallel.

**Triggers:**
- Push to `main` or `master` branch
- Push tags matching `v*`
- Manual trigger via GitHub UI

**Outputs:**
- **Windows**: `.exe` NSIS installer
- **macOS**: `.dmg` + `.zip`
- **Linux**: `.AppImage` + `.deb`

**Auto-Release:**
When you push a version tag (e.g., `v1.0.0`), all builds are automatically:
1. Built in parallel on native runners
2. Collected into a single GitHub Release
3. Published with all platform installers attached

## How to Create a Release

1. **Update version in `package.json`:**
   ```json
   {
     "version": "1.0.0"
   }
   ```

2. **Commit and tag:**
   ```bash
   git add package.json
   git commit -m "Release v1.0.0"
   git tag v1.0.0
   git push origin main
   git push origin v1.0.0
   ```

3. **Wait for builds:**
   - Check the Actions tab in GitHub
   - All platforms build in ~5-10 minutes
   - Release is created automatically with all installers

## Development Builds

For testing without creating a release:
1. Go to **Actions** tab
2. Select a workflow
3. Click **Run workflow** button
4. Download artifacts from the workflow run

## Local Testing

Test builds locally before pushing:

```bash
# Windows
npm run build:win

# macOS (requires macOS or use zip target on Windows)
npm run build:mac
npm run build:mac:zip  # Cross-platform friendly

# Linux (works on any OS)
npm run build:linux
```

## Requirements

- Node.js 18+
- Dependencies will be installed automatically by CI
- No code signing configured (builds are unsigned)

## Troubleshooting

**Build fails on macOS:**
- Ensure `icon.png` exists in `resources/` directory
- Run `npm run icons` to regenerate if needed

**Build fails on Windows:**
- Check that `node-pty` compiles correctly
- May need Windows Build Tools

**Release not created:**
- Ensure tag matches `v*` pattern (e.g., `v1.0.0`, not `1.0.0`)
- Check that `GITHUB_TOKEN` permissions are correct in repo settings
