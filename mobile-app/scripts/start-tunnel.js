/**
 * Tunnel launcher for Expo Go development.
 *
 * Why this exists:
 *   @expo/ngrok-bin ships ngrok v2.3.42, which ngrok.com shut down in 2024.
 *   --tunnel mode is permanently broken. This script uses localtunnel instead.
 *
 * What it does:
 *   1. Opens a localtunnel from <tunnel-url> → localhost:8081
 *   2. Sets REACT_NATIVE_PACKAGER_HOSTNAME so Metro advertises the tunnel URL
 *   3. Starts Expo so Metro uses that hostname in the bundle manifest
 *   4. Prints the exp:// URL to paste into Expo Go
 *
 * Usage:
 *   npm run start:tunnel
 */

const localtunnel = require('localtunnel');
const { spawn } = require('child_process');

const METRO_PORT = 8081;

async function main() {
  console.log('\n🚇 Opening tunnel to localhost:' + METRO_PORT + '...');

  let tunnel;
  try {
    tunnel = await localtunnel({ port: METRO_PORT });
  } catch (err) {
    console.error('❌ Failed to open tunnel:', err.message);
    process.exit(1);
  }

  const tunnelUrl = tunnel.url; // e.g. https://fast-monkey-42.loca.lt
  const hostname = new URL(tunnelUrl).hostname; // e.g. fast-monkey-42.loca.lt

  console.log('\n✅ Tunnel open!');
  console.log('   Tunnel URL : ' + tunnelUrl);
  console.log('\n📱 Steps to open in Expo Go:');
  console.log('   1. Open Safari on your iPhone and visit:');
  console.log('      ' + tunnelUrl);
  console.log('      Tap "Click to Continue" to allow the tunnel (one-time per session)');
  console.log('   2. Then in Expo Go, enter this URL:');
  console.log('      exp://' + hostname);
  console.log('\n⏳ Starting Expo Metro bundler...\n');

  tunnel.on('error', (err) => {
    console.error('Tunnel error:', err.message);
  });

  tunnel.on('close', () => {
    console.log('Tunnel closed.');
  });

  // Start Expo with the tunnel hostname so Metro advertises correct URLs
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
    tunnel.close();
    process.exit(code ?? 0);
  });

  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    tunnel.close();
    expo.kill('SIGINT');
  });
}

main();
