// journeyReal.e2e.test.ts — the WHOLE story on the REAL engine, chained:
// one diamond run (with a genuinely flaky task) → the journal → every
// consumer this extension ships reads THAT journal: fold (statuses ·
// retries · durations), full outputs (x-ray), attempt ladders, the run
// report — then the flagship: `--resume --from` forks the run and the
// second journal must show upstream REHYDRATED (cache-hit), not re-run.
// Self-skips without a journal-writing binary (the runWire law); every
// assertion targets events, never exit-code folklore.

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { foldTrace } from '../core/traceFold';
import { parseTraceOutputs, xrayHintsForText } from '../core/xray';
import { attemptLadders } from '../core/attempts';
import { renderRunReport } from '../core/runReport';
import { extractRunArtifacts } from '../core/artifacts';

// Prefer a RELEASED binary over the bare PATH: on dev machines a
// sister session routinely swaps /opt/homebrew/bin/nika for an
// in-flight branch build whose contracts (exit codes · trace layout)
// legitimately drift — these belts pin the SHIPPED behavior.
const CELLAR = (() => {
  try {
    const base = '/opt/homebrew/Cellar/nika';
    const versions = fs.readdirSync(base).sort();
    return versions.length ? `${base}/${versions[versions.length - 1]}/bin/nika` : undefined;
  } catch { return undefined; }
})();
const CANDIDATES = [process.env.NIKA_BIN, CELLAR, 'nika']
  .filter((p): p is string => typeof p === 'string' && p.length > 0);

function probe(bin: string): boolean {
  try {
    const help = execFileSync(bin, ['run', '--help'], { timeout: 5000, encoding: 'utf-8' });
    return help.includes('--from') && help.includes('--resume');
  } catch {
    return false;
  }
}

const BIN = CANDIDATES.find(probe);

const WORKFLOW = `nika: v1
workflow:
  id: journey-e2e
tasks:
  seed:
    exec:
      command: ["echo", "hello-seed"]
  flaky:
    after: { seed: succeeded }
    retry:
      max_attempts: 2
    exec:
      command: ["false"]
  right:
    after: { seed: succeeded }
    exec:
      command: ["echo", "right-out"]
`;

function run(bin: string, cwd: string, args: string[]): { code: number } {
  try {
    execFileSync(bin, args, { cwd, timeout: 60000, env: { ...process.env, NO_COLOR: '1' } });
    return { code: 0 };
  } catch (e) {
    return { code: (e as { status?: number }).status ?? -1 };
  }
}

function traceFiles(dir: string): string[] {
  const traceDir = path.join(dir, '.nika', 'traces');
  if (!fs.existsSync(traceDir)) { return []; }
  return fs.readdirSync(traceDir)
    .filter((f) => f.endsWith('.ndjson'))
    .map((f) => path.join(traceDir, f))
    .sort();
}

describe.skipIf(!BIN)('the journey on the real engine', () => {
  it('run → journal → fold/outputs/ladder/report → fork rehydrates upstream', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nika-journey-'));
    try {
      const wf = path.join(dir, 'journey.nika.yaml');
      fs.writeFileSync(wf, WORKFLOW);

      // ── Run 1: the flaky diamond (expected to FAIL after retries). ──
      const first = run(BIN!, dir, ['run', wf, '--json', '--color', 'never']);
      expect(first.code).not.toBe(0); // flaky exhausts its attempts
      const traces1 = traceFiles(dir);
      expect(traces1.length).toBeGreaterThan(0);
      const ndjson1 = fs.readFileSync(traces1[traces1.length - 1], 'utf-8');

      // Fold: statuses + the retry count come from events, not narration.
      const fold1 = foldTrace(ndjson1);
      expect(fold1.tasks.get('seed')?.status).toBe('success');
      expect(fold1.tasks.get('right')?.status).toBe('success');
      expect(fold1.tasks.get('flaky')?.status).toBe('failed');
      // Engine truth learned HERE: a deterministic exec exit-code is NOT
      // transient, so `retry:` correctly does not re-attempt it — zero
      // task_retrying events. Multi-attempt ladders are covered by the
      // synthetic unit (the event kinds are the engine's own).

      // Full outputs (the x-ray substrate): seed's recorded output exists
      // and resolves a real hint on real YAML.
      const outputs = parseTraceOutputs(ndjson1);
      expect(outputs.has('seed')).toBe(true);
      const hints = xrayHintsForText('note: "${{ tasks.seed.output }}"', outputs);
      expect(hints).toHaveLength(1);

      // The ladder: flaky's failure carries the engine's detail line.
      const ladder = attemptLadders(ndjson1).get('flaky');
      expect(ladder).toBeDefined();
      expect(ladder![ladder!.length - 1].outcome).toBe('failed');
      expect(ladder![ladder!.length - 1].detail).toBeDefined();

      // The report: failures section + the ladder, from the same events.
      const report = renderRunReport({
        traceName: 'journey',
        model: fold1,
        artifacts: extractRunArtifacts(ndjson1),
        ladders: attemptLadders(ndjson1),
      });
      expect(report).toContain('## Failures');
      expect(report).toContain('`flaky`');

      // ── The flagship: fork from `right` — upstream must REHYDRATE. ──
      run(BIN!, dir, ['run', wf, '--resume', traces1[traces1.length - 1], '--from', 'right', '--json', '--color', 'never']);
      const traces2 = traceFiles(dir).filter((t) => !traces1.includes(t));
      expect(traces2.length).toBeGreaterThan(0);
      const ndjson2 = fs.readFileSync(traces2[traces2.length - 1], 'utf-8');
      const fold2 = foldTrace(ndjson2);
      // seed came back from the recorded run (cache-hit), right ran fresh.
      expect(fold2.tasks.get('seed')?.cached).toBe(true);
      expect(fold2.tasks.get('right')?.status).toBe('success');
      expect(fold2.tasks.get('right')?.cached).not.toBe(true);
      expect(ndjson2).toContain('task_cache_hit');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('nika:prompt pauses with the QUESTION in the journal; --answer resumes and completes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nika-pause-'));
    try {
      const wf = path.join(dir, 'gate.nika.yaml');
      fs.writeFileSync(wf, [
        'nika: v1',
        'workflow:',
        '  id: pause-e2e',
        'tasks:',
        '  approve:',
        '    invoke:',
        '      tool: "nika:prompt"',
        '      args:',
        '        message: "Ship it?"',
        '  ship:',
        '    after: { approve: succeeded }',
        '    exec:',
        '      command: ["echo", "shipped"]',
      ].join('\n'));
      const paused = run(BIN!, dir, ['run', wf, '--json', '--color', 'never']);
      expect(paused.code).toBe(4); // exit 4 = PAUSED, the human-gate
      const t1 = traceFiles(dir);
      expect(t1.length).toBeGreaterThan(0);
      const fold = foldTrace(fs.readFileSync(t1[t1.length - 1], 'utf-8'));
      expect(fold.workflowStatus).toBe('paused');
      expect(fold.paused).toMatchObject({ task: 'approve', mode: 'confirm', message: 'Ship it?' });

      const done = run(BIN!, dir, ['run', wf, '--resume', t1[t1.length - 1], '--answer', 'approve=true', '--json', '--color', 'never']);
      expect(done.code).toBe(0);
      const t2 = traceFiles(dir).filter((t) => !t1.includes(t));
      const fold2 = foldTrace(fs.readFileSync(t2[t2.length - 1], 'utf-8'));
      expect(fold2.workflowStatus).toBe('completed');
      expect(fold2.tasks.get('ship')?.status).toBe('success');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('journals follow the process CWD, not the workflow file (the spawn-cwd law)', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'nika-cwd-'));
    try {
      const wfDir = path.join(base, 'wfdir');
      const elsewhere = path.join(base, 'elsewhere');
      fs.mkdirSync(wfDir);
      fs.mkdirSync(elsewhere);
      const wf = path.join(wfDir, 'probe.nika.yaml');
      fs.writeFileSync(wf, 'nika: v1\nworkflow:\n  id: cwd-probe\ntasks:\n  a:\n    exec:\n      command: ["true"]\n');
      run(BIN!, elsewhere, ['run', wf, '--json', '--color', 'never']);
      const here = traceFiles(elsewhere).length;
      const there = traceFiles(wfDir).length;
      // Whichever way the engine decides, exactly ONE side owns the
      // journal — and our spawns must pass the cwd deliberately.
      expect(here + there).toBeGreaterThan(0);
      expect(Math.min(here, there)).toBe(0);
      // Document the empirical law the extension relies on:
      expect(here).toBeGreaterThan(0); // journals follow the CWD
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});
