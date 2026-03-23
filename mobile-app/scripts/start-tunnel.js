/**
 * Tunnel launcher for Expo Go development.
 *
 * Why this exists:
 *   @expo/ngrok-bin ships ngrok v2.3.42, which ngrok.com shut down in 2024.
 *   --tunnel mode is permanently broken. This script uses Cloudflare Quick
 *   Tunnels instead — free, no account, no password prompts.
 *
 * What it does:
 *   1. Opens a Cloudflare Quick Tunnel: <random>.trycloudflare.com → localhost:8081
 *   2. Sets REACT_NATIVE_PACKAGER_HOSTNAME so Metro advertises the tunnel URL
 *   3. Starts Expo so the bundle manifest uses the tunnel hostname
 *   4. Prints the exp:// URL to paste into Expo Go
 *
 * Usage:
 *   npm run start:tunnel
 */

const { spawn } = require('child_process');
const path = require('path');

const METRO_PORT = 8081;

// Path to the cloudflared binary installed via the npm package
const cloudflaredBin = path.resolve(
  __dirname,
  '../node_modules/cloudflared/bin/cloudflared'
);

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
      // Cloudflare prints the URL to stderr
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
      if (!resolved) reject(new Error('Timed out waiting for Cloudflare tunnel URL'));
    }, 30000);
  });
}

async function main() {
  console.log('\n☁️  Opening Cloudflare Quick Tunnel to localhost:' + METRO_PORT + '...');
  console.log('   (no account or password needed)\n');

  let tunnelUrl, cfProcess;
  try {
    ({ url: tunnelUrl, process: cfProcess } = await startCloudflared());
  } catch (err) {
    console.error('❌ Failed to open Cloudflare tunnel:', err.message);
    console.error('   Make sure port 8081 is not already in use.');
    process.exit(1);
  }

  const hostname = new URL(tunnelUrl).hostname;

  console.log('✅ Tunnel open!');
  console.log('   Tunnel URL : ' + tunnelUrl);
  console.log('\n📱 Open in Expo Go:');
  console.log('   exp://' + hostname);
  console.log('\n   (Paste that URL into Expo Go → no password needed)\n');
  console.log('⏳ Starting Expo Metro bundler...\n');

  const expo = spawn(
    'npx',
    ['expo', 'start', '--clear', '--host', 'localhost'],
    {
      env: {
        ...process.env,
        REACT_NATIVE_PACKAGER_HOSTNAME: hostname,
      },
      stdio: 'inherit',
      shell: true,
    }
  );

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
