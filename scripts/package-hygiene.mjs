// package-hygiene.mjs — nothing developer-local may ride the VSIX.
//
// Found by diffing the PUBLISHED artifact against a local rebuild after
// 0.107.9: every shared file was byte-identical (the registry got
// exactly what CI built), and the ONE extra file in the local package
// was `.claude/scheduled_tasks.lock` — this machine's own agent state.
// It never reached users because CI has no such file, but nothing was
// stopping it: .vscodeignore simply did not mention those paths.
//
// This gate does not package anything (that is slow). It asserts the
// EXCLUSION RULES cover the classes of developer-local state we know
// about, so a machine that happens to have one cannot ship it.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ignore = readFileSync(resolve(here, '..', '.vscodeignore'), 'utf8');

// Each entry: a path class that is a developer's business, never a
// user's, and the pattern that must exclude it.
const MUST_EXCLUDE = [
  ['agent state', '.claude/**'],
  ['MCP wiring', '.mcp.json'],
  ['workspace files', '*.code-workspace'],
  ['sources', 'src/**'],
  ['CI', '.github/**'],
  ['tooling', 'scripts/**'],
  ['editor config', '.vscode/**'],
  ['dependencies', 'node_modules/**'],
];

const lines = ignore.split('\n').map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'));
const missing = MUST_EXCLUDE.filter(([, pat]) => !lines.includes(pat));

if (missing.length === 0) {
  console.log(`package-hygiene: OK — ${MUST_EXCLUDE.length} classes of developer-local state are excluded`);
  process.exit(0);
}
for (const [what, pat] of missing) {
  console.error(`package-hygiene · ${what} could ride the VSIX · .vscodeignore is missing \`${pat}\``);
}
console.error('\nA machine that happens to hold one of these would publish it. The registry gets what the packager sees, not what CI happens to have.');
process.exit(1);
