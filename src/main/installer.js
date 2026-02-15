const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const https = require('https');
const os = require('os');
const { app } = require('electron');

const execAsync = promisify(exec);

class DependencyInstaller {
  constructor() {
    this.nodeVersion = '20.11.0'; // LTS version
    this.nodePath = null;
    this.npmPath = null;
    
    // Check for bundled Node.js first
    this.bundledNodePath = this.getBundledNodePath();
  }

  getBundledNodePath() {
    // Check if we have bundled Node.js in resources
    let appPath = '';
    try {
      appPath = app.getAppPath();
    } catch (e) {
      // App not ready yet
    }
    
    const possiblePaths = [
      path.join(process.resourcesPath || '', 'node-portable', 'node.exe'),
      path.join(__dirname, '../../resources/node-portable', 'node.exe'),
      appPath ? path.join(appPath, 'resources/node-portable', 'node.exe') : ''
    ].filter(Boolean);

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    return null;
  }

  async checkNode() {
    try {
      // First check bundled Node
      if (this.bundledNodePath && fs.existsSync(this.bundledNodePath)) {
        const { stdout } = await execAsync(`"${this.bundledNodePath}" --version`);
        this.nodePath = this.bundledNodePath;
        return { installed: true, version: stdout.trim(), bundled: true };
      }

      // Then check system Node
      const { stdout } = await execAsync('node --version');
      this.nodePath = 'node';
      return { installed: true, version: stdout.trim(), bundled: false };
    } catch (error) {
      return { installed: false };
    }
  }

  async checkNpm() {
    try {
      // Check bundled npm
      if (this.bundledNodePath) {
        const npmPath = path.join(path.dirname(this.bundledNodePath), 'npm.cmd');
        if (fs.existsSync(npmPath)) {
          const { stdout } = await execAsync(`"${npmPath}" --version`);
          this.npmPath = npmPath;
          return { installed: true, version: stdout.trim(), bundled: true };
        }
      }

      // Check system npm
      const { stdout } = await execAsync('npm --version');
      this.npmPath = 'npm';
      return { installed: true, version: stdout.trim(), bundled: false };
    } catch (error) {
      return { installed: false };
    }
  }

  async checkOpenClaw() {
    try {
      const { stdout } = await execAsync('openclaw --version');
      return { installed: true, version: stdout.trim() };
    } catch (error) {
      // Check if installed locally
      const localPath = path.join(os.homedir(), '.openclaw', 'node_modules', '.bin', 'openclaw');
      if (fs.existsSync(localPath) || fs.existsSync(localPath + '.cmd')) {
        try {
          const { stdout } = await execAsync(`"${localPath}" --version`);
          return { installed: true, version: stdout.trim(), local: true };
        } catch (e) {
          return { installed: false };
        }
      }
      return { installed: false };
    }
  }

  async checkDiskSpace() {
    try {
      // Windows: use wmic or PowerShell
      const { stdout } = await execAsync(
        'powershell -Command "Get-PSDrive C | Select-Object -ExpandProperty Free"'
      );
      const freeBytes = parseInt(stdout.trim());
      const freeGB = freeBytes / (1024 * 1024 * 1024);
      return {
        available: freeGB >= 1, // Need at least 1GB
        freeSpace: `${freeGB.toFixed(2)} GB`,
        freeBytes
      };
    } catch (error) {
      return { available: true, freeSpace: 'Unknown' };
    }
  }

  async getSystemInfo() {
    const [node, npm, openclaw, diskSpace] = await Promise.all([
      this.checkNode(),
      this.checkNpm(),
      this.checkOpenClaw(),
      this.checkDiskSpace()
    ]);

    return {
      node,
      npm,
      openclaw,
      diskSpace,
      platform: process.platform,
      arch: process.arch
    };
  }

  async downloadFile(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);
      
      https.get(url, (response) => {
        // Handle redirect
        if (response.statusCode === 302 || response.statusCode === 301) {
          file.close();
          fs.unlinkSync(destPath);
          return this.downloadFile(response.headers.location, destPath, onProgress)
            .then(resolve)
            .catch(reject);
        }

        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          if (onProgress && totalSize) {
            onProgress({
              percent: Math.round((downloadedSize / totalSize) * 100),
              downloaded: downloadedSize,
              total: totalSize
            });
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve(destPath);
        });
      }).on('error', (error) => {
        fs.unlink(destPath, () => {});
        reject(error);
      });
    });
  }

  async installNodeJs(onProgress) {
    const installerUrl = `https://nodejs.org/dist/v${this.nodeVersion}/node-v${this.nodeVersion}-x64.msi`;
    const tempDir = os.tmpdir();
    const installerPath = path.join(tempDir, `node-v${this.nodeVersion}.msi`);

    try {
      onProgress?.({ status: 'downloading', message: 'Downloading Node.js...' });

      await this.downloadFile(installerUrl, installerPath, (progress) => {
        onProgress?.({ 
          status: 'downloading', 
          message: `Downloading Node.js... ${progress.percent}%`,
          percent: progress.percent
        });
      });

      onProgress?.({ status: 'installing', message: 'Installing Node.js...' });

      // Silent install
      await execAsync(`msiexec /i "${installerPath}" /qn /norestart`);

      // Clean up
      fs.unlinkSync(installerPath);

      // Refresh PATH
      await this.refreshPath();

      onProgress?.({ status: 'complete', message: 'Node.js installed successfully' });

      return { success: true };
    } catch (error) {
      onProgress?.({ status: 'error', message: error.message });
      return { success: false, error: error.message };
    }
  }

  async refreshPath() {
    // Get updated PATH from registry
    try {
      const { stdout } = await execAsync(
        'powershell -Command "[Environment]::GetEnvironmentVariable(\'Path\', \'Machine\') + \';\' + [Environment]::GetEnvironmentVariable(\'Path\', \'User\')"'
      );
      process.env.PATH = stdout.trim();
    } catch (error) {
      console.error('Failed to refresh PATH:', error);
    }
  }

  async installOpenClaw(onProgress) {
    try {
      onProgress?.({ status: 'installing', message: 'Installing OpenClaw CLI...' });

      // Create openclaw directory
      const openclawDir = path.join(os.homedir(), '.openclaw');
      if (!fs.existsSync(openclawDir)) {
        fs.mkdirSync(openclawDir, { recursive: true });
      }

      // Install openclaw globally
      const npmCmd = this.npmPath || 'npm';
      
      await new Promise((resolve, reject) => {
        const install = spawn(npmCmd, ['install', '-g', 'openclaw'], {
          shell: true,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let output = '';
        
        install.stdout.on('data', (data) => {
          output += data.toString();
          onProgress?.({ status: 'installing', message: data.toString().trim() });
        });

        install.stderr.on('data', (data) => {
          output += data.toString();
        });

        install.on('close', (code) => {
          if (code === 0) {
            resolve(output);
          } else {
            reject(new Error(`Installation failed with code ${code}: ${output}`));
          }
        });

        install.on('error', reject);
      });

      onProgress?.({ status: 'complete', message: 'OpenClaw installed successfully' });

      return { success: true };
    } catch (error) {
      onProgress?.({ status: 'error', message: error.message });
      return { success: false, error: error.message };
    }
  }

  async runOpenClawCommand(command, args = []) {
    return new Promise((resolve, reject) => {
      const fullArgs = [command, ...args];
      
      const proc = spawn('openclaw', fullArgs, {
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
        if (code === 0) {
          resolve({ success: true, stdout, stderr });
        } else {
          resolve({ success: false, stdout, stderr, code });
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  async isSystemReady() {
    // Check if all dependencies are installed
    const systemInfo = await this.getSystemInfo();
    
    const ready = {
      node: systemInfo.node.installed,
      npm: systemInfo.npm.installed,
      openclaw: systemInfo.openclaw.installed
    };

    // For initial install, we only need the core dependencies
    // Config and gateway setup will be done during onboarding
    return {
      ready: ready.node && ready.npm && ready.openclaw,
      details: ready,
      systemInfo
    };
  }
}

module.exports = DependencyInstaller;
