// suite/index.ts — the Mocha entry the extension host invokes.

import * as path from 'path';
import { glob } from 'glob';
import Mocha from 'mocha';

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 20000 });
  const testsRoot = __dirname;
  // The firstContact* suites need their OWN host (virgin profile · real
  // engine): runFirstContact.ts launches them one at a time via
  // NIKA_ITEST_SUITE; the default smoke host (bogus binary path · LSP
  // off) must never load them — and they must never ride its profile.
  const only = process.env.NIKA_ITEST_SUITE;
  const files = (await glob('**/*.test.js', { cwd: testsRoot })).filter((f) => (only
    ? path.basename(f) === `${only}.test.js`
    : !path.basename(f).startsWith('firstContact')));
  for (const f of files) { mocha.addFile(path.resolve(testsRoot, f)); }

  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) { reject(new Error(`${failures} integration test(s) failed`)); }
      else { resolve(); }
    });
  });
}
