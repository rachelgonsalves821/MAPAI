/**
 * Tunnel launcher for Expo Go development.
 *
 * Architecture:
 *   Expo Go → Cloudflare:443 → localhost:8081 (proxy) → Metro:8082
 *
 * Why the proxy?
 *   Metro embeds its own port in the bundle manifest URL, producing:
 *     http://hostname:8082/index.bundle   ← Metro's internal port, wrong
 *   Cloudflare only accepts HTTPS on port 443, so Expo Go can't reach :8082.
 *   The proxy intercepts manifest (JSON) responses and rewrites URLs to:
 *     https://hostname/index.bundle       ← Cloudflare's HTTPS port, correct
 *
 * Usage:  npm run start:tunnel
 */

const { spawn, execSync } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');

const PROXY_PORT = 8081;   // Cloudflare tunnels here; Expo Go connects here
const METRO_PORT = 8082;   // Metro's internal port (hidden from Expo Go)

const cloudflaredBin = path.resolve(
  __dirname,
  '../node_modules/cloudflared/bin/cloudflared'
);

// ─── Helpers ────────────────────────────────────────────────────────────────

function killPort(port) {
  try {
    execSync(
      `for /f "tokens=5" %a in ('netstat -aon ^| findstr :${port}') do taskkill /F /PID %a`,
      { shell: 'cmd.exe', stdio: 'pipe' }
    );
  } catch { /* port was free */ }
}

function waitForPort(port, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    function attempt() {
      const sock = new net.Socket();
      sock.setTimeout(500);
      sock.on('connect', () => { sock.destroy(); resolve(); });
      sock.on('error', () => { sock.destroy(); retry(); });
      sock.on('timeout', () => { sock.destroy(); retry(); });
      sock.connect(port, '127.0.0.1');
    }
    function retry() {
      if (Date.now() > deadline) return reject(new Error(`Port ${port} not ready after ${timeout}ms`));
      setTimeout(attempt, 600);
    }
    attempt();
  });
}

function startCloudflared() {
  return new Promise((resolve, reject) => {
    const cf = spawn(cloudflaredBin, [
      'tunnel', '--url', `http://localhost:${PROXY_PORT}`, '--no-autoupdate',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let resolved = false;
    const tryResolve = (data) => {
      const match = data.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && !resolved) { resolved = true; resolve({ url: match[0], process: cf }); }
    };
    cf.stdout.on('data', tryResolve);
    cf.stderr.on('data', tryResolve);
    cf.on('exit', code => { if (!resolved) reject(new Error(`cloudflared exited: ${code}`)); });
    setTimeout(() => { if (!resolved) reject(new Error('Timed out waiting for Cloudflare URL')); }, 30000);
  });
}

// ─── Reverse proxy with manifest URL rewriting ──────────────────────────────

function createProxy(tunnelHostname) {
  const server = http.createServer((req, res) => {
    const opts = {
      host: 'localhost', port: METRO_PORT,
      path: req.url, method: req.method,
      headers: { ...req.headers, host: `localhost:${METRO_PORT}` },
    };

    const proxyReq = http.request(opts, (proxyRes) => {
      const ct = proxyRes.headers['content-type'] || '';

      if (ct.includes('application/json') || ct.includes('text/javascript') && req.url === '/') {
        // Collect full body so we can rewrite it
        const chunks = [];
        proxyRes.on('data', c => chunks.push(c));
        proxyRes.on('end', () => {
          let body = Buffer.concat(chunks).toString('utf8');
          // Rewrite any occurrence of the internal host:port → tunnel HTTPS URL
          const portPattern = new RegExp(`http://[^"'\\s]*:${METRO_PORT}`, 'g');
          body = body.replace(portPattern, `https://${tunnelHostname}`);
          const headers = { ...proxyRes.headers, 'content-length': Buffer.byteLength(body) };
          res.writeHead(proxyRes.statusCode, headers);
          res.end(body);
        });
      } else {
        // Stream everything else unchanged
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      }
    });

    proxyReq.on('error', () => { res.writeHead(502); res.end('Metro not ready'); });
    req.pipe(proxyReq);
  });

  // WebSocket passthrough (needed for Fast Refresh / HMR)
  server.on('upgrade', (req, clientSocket, head) => {
    const opts = {
      host: 'localhost', port: METRO_PORT,
      path: req.url, headers: { ...req.headers, host: `localhost:${METRO_PORT}` },
    };
    const proxyReq = http.request(opts);
    proxyReq.on('upgrade', (_res, serverSocket) => {
      clientSocket.write('HTTP/1.1 101 Switching Protocols\r\n\r\n');
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });
    proxyReq.on('error', () => clientSocket.destroy());
    proxyReq.end();
  });

  return server;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🧹 Clearing ports ${PROXY_PORT} and ${METRO_PORT}...`);
  killPort(PROXY_PORT);
  killPort(METRO_PORT);

  console.log('☁️  Opening Cloudflare Quick Tunnel...\n');
  let tunnelUrl, cfProcess;
  try {
    ({ url: tunnelUrl, process: cfProcess } = await startCloudflared());
  } catch (err) {
    console.error('❌ Cloudflare tunnel failed:', err.message);
    process.exit(1);
  }

  const hostname = new URL(tunnelUrl).hostname;
  console.log('✅ Tunnel: ' + tunnelUrl + '\n');

  // Start the proxy (Cloudflare → proxy:8081 → Metro:8082)
  const proxy = createProxy(hostname);
  proxy.listen(PROXY_PORT, '0.0.0.0', () => {
    console.log(`🔀 Proxy listening on :${PROXY_PORT} → Metro :${METRO_PORT}`);
    console.log('⏳ Starting Metro bundler (first run ~30s)...\n');
  });

  // Start Metro on the internal port
  const expo = spawn('npx', ['expo', 'start', '--port', String(METRO_PORT), '--host', 'localhost'], {
    env: {
      ...process.env,
      REACT_NATIVE_PACKAGER_HOSTNAME: hostname,
    },
    stdio: 'inherit',
    shell: true,
  });

  // Print the Expo Go URL once Metro is ready
  waitForPort(METRO_PORT).then(() => {
    console.log('\n' + '═'.repeat(52));
    console.log('📱  PASTE THIS INTO EXPO GO:');
    console.log('    exp://' + hostname);
    console.log('═'.repeat(52) + '\n');
  }).catch(() => {});

  const cleanup = () => {
    cfProcess.kill();
    proxy.close();
    expo.kill('SIGINT');
  };
  expo.on('exit', () => { cleanup(); process.exit(0); });
  process.on('SIGINT', () => { console.log('\nShutting down...'); cleanup(); });
}

main();
