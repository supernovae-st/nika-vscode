// runTests.ts — launch a REAL VS Code with the extension loaded and run
// the Mocha smoke suite inside its extension host. This is the F5 QA the
// vitest harness can't do: it exercises activation, CSP webview load,
// asWebviewUri, command registration and the serializer against the
// actual editor — the harness↔host gap, closed and CI-runnable.
//
//   npm run compile:integration && npm run test:integration
//
// Downloads a VS Code build on first run (~200 MB, cached). On CI use
// xvfb-run; on macOS it briefly shows a window and exits.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  try {
    // out-integration/ sits at the repo root — ONE level up IS the
    // extension (package.json + out/). Two levels up is the parent
    // folder: VS Code treats a package.json-less dev path as a folder
    // OF extensions and scans its children — in a container layout
    // that accidentally found repo/, in a shared scratchpad it loads
    // whichever sibling clone wins the dedupe. Anchor to the root.
    const extensionDevelopmentPath = path.resolve(__dirname, '..');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    // The user-data-dir must be SHORT: VS Code opens a Unix domain socket
    // under it and the path is capped at 103 chars — our deep repo path
    // blows past that. A short tmp dir keeps the socket legal.
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nk-ud-'));

    // A test WORKSPACE that points the binary at a bogus path (autoDownload
    // off): the smoke suite targets activation · commands · language ·
    // webview — NOT the LSP. Without this the real `nika` on PATH starts
    // `nika lsp`, and tearing the host down mid-handshake makes the
    // languageclient thrash on its own start-failure (library-internal).
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'nk-ws-'));
    fs.mkdirSync(path.join(workspace, '.vscode'), { recursive: true });
    fs.writeFileSync(
      path.join(workspace, '.vscode', 'settings.json'),
      JSON.stringify({ 'nika.server.path': '/nonexistent/nika-smoke', 'nika.server.autoDownload': false }, null, 2),
    );

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      // The workspace folder + a throwaway user-data-dir + no other
      // extensions = a clean, LSP-free host.
      launchArgs: [workspace, `--user-data-dir=${userDataDir}`, '--disable-extensions', '--disable-gpu'],
    });
  } catch (err) {
    console.error('integration tests failed:', err);
    process.exit(1);
  }
}

void main();
