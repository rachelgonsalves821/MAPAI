/**
 * Tunnel launcher for Expo Go development.
 *
 * Why this exists:
 *   @expo/ngrok-bin ships ngrok v2.3.42, which ngrok.com shut down in 2024.
 *   --tunnel mode is permanently broken. This script uses Cloudflare Quick
 *   Tunnels instead — free, no account, no password prompts.
 *
 * What it does:
 *   1. Kills any process on METRO_PORT to ensure a clean start
 *   2. Opens a Cloudflare Quick Tunnel: <random>.trycloudflare.com → localhost:8081
 *   3. Sets REACT_NATIVE_PACKAGER_HOSTNAME so Metro advertises the tunnel URL
 *   4. Starts Expo so the bundle manifest uses the tunnel hostname
 *   5. Prints the exp:// URL to paste into Expo Go
 *
 * Usage:
 *   npm run start:tunnel
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const net = require('net');

const METRO_PORT = 8081;

const cloudflaredBin = path.resolve(
  __dirname,
  '../node_modules/cloudflared/bin/cloudflared'
);

function killPort(port) {
  try {
    // Windows: find and kill process on port
    const result = execSync(
      `for /f "tokens=5" %a in ('netstat -aon ^| findstr :${port}') do taskkill /F /PID %a`,
      { shell: 'cmd.exe', stdio: 'pipe' }
    );
  } catch {
    // Port was already free — that's fine
  }
}

function waitForPort(port, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function check() {
      const sock = new net.Socket();
      sock.setTimeout(500);
      sock.on('connect', () => { sock.destroy(); resolve(); });
      sock.on('error', () => {
        sock.destroy();
        if (Date.now() - start > timeout) {
          reject(new Error(`Metro did not start on port ${port} within ${timeout}ms`));
        } else {
          setTimeout(check, 500);
        }
      });
      sock.on('timeout', () => {
        sock.destroy();
        setTimeout(check, 500);
      });
      sock.connect(port, '127.0.0.1');
    }
    check();
  });
}

function startCloudflared() {
  return new Promise((resolve, reject) => {
    const cf = spawn(cloudflaredBin, [
      'tunnel',
      '--url', `http://localhost:${METRO_PORT}`,
      '--no-autoupdate',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let resolved = false;

    const tryResolve = (data) => {
      const text = data.toString();
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && !resolved) {
        resolved = true;
        resolve({ url: match[0], process: cf });
      }
    };

    cf.stdout.on('data', tryResolve);
    cf.stderr.on('data', tryResolve);

    cf.on('exit', (code) => {
      if (!resolved) reject(new Error(`cloudflared exited with code ${code}`));
    });

    setTimeout(() => {
      if (!resolved) reject(new Error('Timed out waiting for Cloudflare tunnel URL (30s)'));
    }, 30000);
  });
}

async function main() {
  // Step 1: Free up the port
  console.log(`\n🧹 Clearing port ${METRO_PORT}...`);
  killPort(METRO_PORT);

  // Step 2: Open Cloudflare tunnel
  console.log('☁️  Opening Cloudflare Quick Tunnel...\n');
  let tunnelUrl, cfProcess;
  try {
    ({ url: tunnelUrl, process: cfProcess } = await startCloudflared());
  } catch (err) {
    console.error('❌ Failed to open Cloudflare tunnel:', err.message);
    process.exit(1);
  }

  const hostname = new URL(tunnelUrl).hostname;

  console.log('✅ Tunnel open!');
  console.log('   ' + tunnelUrl + '\n');

  // Step 3: Start Metro
  console.log('⏳ Starting Metro bundler (this takes ~30s on first run)...\n');

  const expo = spawn(
    'npx',
    ['expo', 'start', '--host', 'localhost'],
    {
      env: {
        ...process.env,
        REACT_NATIVE_PACKAGER_HOSTNAME: hostname,
      },
      stdio: 'inherit',
      shell: true,
    }
  );

  // Step 4: Wait for Metro to be ready, then print the Expo Go URL
  waitForPort(METRO_PORT).then(() => {
    console.log('\n' + '='.repeat(50));
    console.log('📱 OPEN IN EXPO GO:');
    console.log('   exp://' + hostname);
    console.log('='.repeat(50) + '\n');
  }).catch(() => {});

  expo.on('exit', (code) => {
    cfProcess.kill();
    process.exit(code ?? 0);
  });

  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    cfProcess.kill();
    expo.kill('SIGINT');
  });
}

main();
