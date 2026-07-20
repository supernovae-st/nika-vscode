// esbuild.mjs — Build BOTH runtime bundles.
//
//   out/extension.js   — the extension host bundle (node CJS · vscode external)
//   out/webview/dag.js — the DAG webview bundle (browser IIFE)
//
// The extension MUST be bundled: .vscodeignore excludes node_modules/**,
// so an unbundled tsc output would fail at activation on the very first
// `require('vscode-languageclient/node')` in a packaged VSIX. tsc runs
// as typecheck only (noEmit) — esbuild owns every emitted byte.
//
// Usage:
//   node esbuild.mjs              # production build
//   node esbuild.mjs --watch      # dev mode with rebuild on change

import * as esbuild from 'esbuild';

const args = process.argv.slice(2);
const isWatch = args.includes('--watch');
const isDev = isWatch || args.includes('--dev');

// ─── Extension host (Node) ───────────────────────────────────────────────
const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  outfile: 'out/extension.js',
  bundle: true,
  minify: !isDev,
  sourcemap: isDev ? 'inline' : false,
  platform: 'node',
  target: 'node16', // VS Code 1.75 Electron baseline
  format: 'cjs',
  external: ['vscode'],
  logLevel: 'info',
};

// ─── Webview (Browser) ────────────────────────────────────────────────────
// Runs inside a sandboxed <iframe> in VS Code's webview.
// Must be a single self-contained IIFE — no imports at runtime.
const webviewConfig = {
  entryPoints: ['src/webview/dag.ts'],
  outfile: 'out/webview/dag.js',
  bundle: true,
  minify: !isDev,
  sourcemap: isDev ? 'inline' : false,
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  external: [],
  mainFields: ['browser', 'module', 'main'],
  conditions: ['browser', 'import', 'default'],
  globalName: 'NikaDag',
  alias: {
    'elkjs': 'elkjs/lib/elk.bundled.js',
  },
  logOverride: {
    'commonjs-variable-in-esm': 'silent',
  },
  logLevel: 'info',
};

// ─── ELK layout worker (Browser Worker) ──────────────────────────────────
// A CLASSIC iife script — `new Worker(uri)` boots it without {type:
// 'module'}; same elkjs alias as the webview bundle, so the worker and
// the sync fallback run byte-identical layout code.
const elkWorkerConfig = {
  entryPoints: ['src/webview/elkWorker.ts'],
  outfile: 'out/webview/elkWorker.js',
  bundle: true,
  minify: !isDev,
  sourcemap: isDev ? 'inline' : false,
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  external: [],
  mainFields: ['browser', 'module', 'main'],
  conditions: ['browser', 'import', 'default'],
  alias: {
    'elkjs': 'elkjs/lib/elk.bundled.js',
  },
  logOverride: {
    'commonjs-variable-in-esm': 'silent',
  },
  logLevel: 'info',
};

// ─── CSS for webview ─────────────────────────────────────────────────────
const cssConfig = {
  entryPoints: ['src/webview/dag.css'],
  outfile: 'out/webview/dag.css',
  bundle: true,
  minify: !isDev,
  logLevel: 'info',
};

async function build() {
  const configs = [extensionConfig, webviewConfig, elkWorkerConfig, cssConfig];
  if (isWatch) {
    const contexts = await Promise.all(configs.map((c) => esbuild.context(c)));
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    console.log('[nika] Watching extension + webview for changes...');
  } else {
    await Promise.all(configs.map((c) => esbuild.build(c)));
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
