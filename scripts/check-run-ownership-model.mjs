// Explicit, offline TLA+ gate. No download or global runtime installation.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const jar = process.env.TLC_JAR && resolve(process.env.TLC_JAR);
if (!jar) throw new Error('Set TLC_JAR to the official v1.7.4 tla2tools.jar; see docs/formal/README.md');
if (statSync(jar).size > 16 * 1024 * 1024) throw new Error('TLC jar exceeds the expected tool size');
const digest = createHash('sha256').update(readFileSync(jar)).digest('hex');
if (digest !== '936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88') {
  throw new Error('TLC jar digest does not match the recorded v1.7.4 tool');
}
const java = process.env.JAVA_BIN || 'java';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'formal');
const fixture = mkdtempSync(join(tmpdir(), 'nika-tlc-'));
try {
  for (const [name, invariant] of [
    ['LiveRunOwnership', undefined],
    ['LiveRunOwnership-early-release', 'OwnerUntilClose'],
    ['LiveRunOwnership-stale-publication', 'NoStalePublication'],
  ]) {
    let output;
    let status = 0;
    try {
      output = execFileSync(java, [
        '-XX:+UseParallelGC', '-Xmx256m', '-cp', jar, 'tlc2.TLC',
        '-workers', '1', '-metadir', join(fixture, name),
        '-config', `${name}.cfg`, 'LiveRunOwnership.tla',
      ], { cwd: root, encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL', maxBuffer: 2 * 1024 * 1024 });
    } catch (error) {
      // A missing tool, parser error or timeout must not pass as a mutant.
      if (error.status !== 12 || error.signal) throw error;
      status = error.status;
      output = String(error.stdout ?? '') + String(error.stderr ?? '');
    }
    if (invariant) {
      if (status !== 12 || !output.includes(`Invariant ${invariant} is violated.`)) {
        throw new Error(`${name}: expected ${invariant}, got exit ${status}\n${output}`);
      }
      console.log(`${name}: expected counterexample for ${invariant}`);
    } else {
      if (status !== 0 || !output.includes('Model checking completed. No error has been found.')
        || !output.includes('0 states left on queue.')) {
        throw new Error(`${name}: incomplete or failed exploration\n${output}`);
      }
      console.log(`${name}: ${output.split('\n').find((line) => line.includes('distinct states found'))}`);
    }
  }
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
