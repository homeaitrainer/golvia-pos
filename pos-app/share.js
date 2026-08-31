// Starts GOLVIA and exposes it on a temporary public HTTPS link, so other devices (phone, tablet,
// a second laptop) can use the till without installing anything.
//
// Why a tunnel rather than hosting: the shop's data lives in one SQLite file on THIS machine.
// Deploying a second copy to a cloud host would give that copy its own empty database -- sales rung
// up there would not appear here, and stock counts would silently drift apart. Tunnelling keeps a
// single source of truth: every device talks to this machine.
//
// The link lasts only as long as this window stays open, and changes each time you start it.
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const clientDir = path.join(__dirname, 'client');
const serverDir = path.join(__dirname, 'server');
const distDir = path.join(clientDir, 'dist');
const PORT = process.env.PORT || 4173;

const children = [];
function shutdown() {
  for (const child of children) {
    try { child.kill(); } catch { /* already gone */ }
  }
  process.exit();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (!fs.existsSync(distDir)) {
  console.log('Building the app for the first run...');
  execSync('npm run build', { cwd: clientDir, stdio: 'inherit' });
}

console.log('Starting GOLVIA...');
const server = spawn('node', ['src/server.js'], { cwd: serverDir, stdio: 'inherit' });
children.push(server);

server.on('exit', (code) => {
  if (code !== 0) {
    console.error(`\nGOLVIA stopped unexpectedly (exit code ${code}).`);
    shutdown();
  }
});

// A freshly-installed cloudflared is on the machine PATH, but only for shells started AFTER the
// install -- so relying on PATH alone means this fails the first time, right when it is being set
// up. Check the standard install locations too.
function resolveCloudflared() {
  const candidates = [
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
    '/opt/homebrew/bin/cloudflared',
    '/usr/local/bin/cloudflared',
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'cloudflared'; // fall back to PATH
}

// Give the server a moment to bind before pointing the tunnel at it.
setTimeout(() => {
  // No `shell: true`: it is unnecessary here and passes arguments unescaped to a shell.
  const tunnel = spawn(resolveCloudflared(), ['tunnel', '--url', `http://localhost:${PORT}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(tunnel);

  let announced = false;
  const watchForLink = (chunk) => {
    const text = chunk.toString();
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (match && !announced) {
      announced = true;
      const link = match[0];
      console.log('\n' + '='.repeat(64));
      console.log('  GOLVIA is now open to other devices at:\n');
      console.log(`     ${link}`);
      console.log('\n  Open that on any phone, tablet or laptop and log in as usual.');
      console.log('  Everything shares this computer\'s database, so sales and stock');
      console.log('  stay correct no matter which device rings them up.');
      console.log('\n  The link dies when you close this window, and is different');
      console.log('  every time you start it.');
      console.log('='.repeat(64) + '\n');
    }
  };

  tunnel.stdout.on('data', watchForLink);
  tunnel.stderr.on('data', watchForLink); // cloudflared logs the URL to stderr

  tunnel.on('error', (err) => {
    console.error('\nCould not start the tunnel:', err.message);
    console.error('Install it once with:  winget install --id Cloudflare.cloudflared');
    console.error('GOLVIA itself is still running on this computer at http://localhost:' + PORT);
  });

  tunnel.on('exit', (code) => {
    if (code !== 0 && !announced) {
      console.error('\nThe tunnel exited before producing a link (exit code ' + code + ').');
      console.error('Check that cloudflared is installed:  cloudflared --version');
      console.error('GOLVIA itself is still running at http://localhost:' + PORT);
    }
  });
}, 2500);
