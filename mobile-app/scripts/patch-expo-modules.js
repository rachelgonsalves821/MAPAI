/**
 * Patch expo-modules-core for Node 24 compatibility.
 * Node 24 enables TypeScript type stripping by default but refuses to strip
 * types from node_modules/ files. expo-modules-core's package.json points
 * "main" to "src/index.ts" which crashes the Expo CLI on Node 24.
 * This patch redirects "main" to the pre-built "index.js" null stub so the
 * CLI starts cleanly. Metro still gets the real TS source via metro.config.js.
 */
const fs = require('fs');
const path = require('path');

const pkgPath = path.resolve(__dirname, '../node_modules/expo-modules-core/package.json');

if (!fs.existsSync(pkgPath)) {
  console.log('patch-expo-modules: expo-modules-core not found, skipping.');
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

if (pkg.main === 'index.js') {
  console.log('patch-expo-modules: already patched.');
  process.exit(0);
}

pkg.main = 'index.js';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
console.log('patch-expo-modules: patched expo-modules-core main → index.js');
