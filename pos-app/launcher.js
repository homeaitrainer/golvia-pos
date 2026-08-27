const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const clientDir = path.join(__dirname, 'client');
const serverDir = path.join(__dirname, 'server');
const distDir = path.join(clientDir, 'dist');

if (!fs.existsSync(distDir)) {
  console.log('Building client for the first run...');
  execSync('npm run build', { cwd: clientDir, stdio: 'inherit' });
}

const server = spawn('node', ['src/server.js'], { cwd: serverDir, stdio: 'inherit' });

setTimeout(() => {
  const url = 'http://localhost:4173';
  const opener = os.platform() === 'win32' ? 'start' : os.platform() === 'darwin' ? 'open' : 'xdg-open';
  spawn(opener, [url], { shell: true, stdio: 'ignore' });
}, 1500);

process.on('SIGINT', () => { server.kill(); process.exit(); });
