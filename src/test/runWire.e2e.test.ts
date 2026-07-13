// runWire.e2e.test.ts — the LIVE-RUN seam, pinned against the REAL binary.
//
// The canvas run pill spawns `nika run --json` and paints the folded
// stream; this suite proves that whole wire end-to-end with the real
// engine (self-skips without a binary, same law as contract.test.ts):
//   · a real fan-out run streams NDJSON whose fold reaches the exact
//     terminal state (every task success · workflow completed)
//   · the fold is chunk-boundary-independent ON THE REAL STREAM (the
//     runLive re-fold-the-buffer design assumption, proven not assumed)
//   · a failing task folds to failed/completed-with-failure — the
//     verdict the aurora danger flash keys on
//   · `--model mock/echo` OVERRIDES a cloud envelope model (the ▶ mock
//     preview promise: zero keys, zero network, still a real run)

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { foldTrace } from '../core/traceFold';

const CANDIDATES = [
  process.env.NIKA_BIN,
  path.resolve(__dirname, '../../../../repos/engine/repo/target/release/nika-cli'),
  path.resolve(__dirname, '../../../../repos/engine/repo/target/debug/nika-cli'),
].filter((p): p is string => typeof p === 'string');

const BIN = CANDIDATES.find((p) => {
  try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; }
});

function runStream(args: string[]): { code: number; stdout: string } {
  try {
    const stdout = execFileSync(BIN!, args, {
      encoding: 'utf-8',
      timeout: 60000,
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, NO_COLOR: '1' },
    });
    return { code: 0, stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    return { code: e.status ?? 1, stdout: e.stdout ?? '' };
  }
}

function tmpWorkflow(content: string): string {
  const file = path.join(os.tmpdir(), `nika-runwire-${process.pid}-${Math.floor(performance.now() * 1000)}.nika.yaml`);
  fs.writeFileSync(file, content, 'utf-8');
  return file;
}

const FANOUT_WF = `nika: v1
workflow:
  id: runwire-fanout

model: mock/echo

tasks:
  seed:
    infer:
      prompt: "Name three colors, one per line."

  branch_a:
    depends_on: [seed]
    infer:
      prompt: "Comment on \${{ tasks.seed.output }} briefly."

  branch_b:
    depends_on: [seed]
    infer:
      prompt: "Count the lines in \${{ tasks.seed.output }}."

  join:
    depends_on: [branch_a, branch_b]
    infer:
      prompt: "Merge \${{ tasks.branch_a.output }} and \${{ tasks.branch_b.output }}."
`;

const FAILING_WF = `nika: v1
workflow:
  id: runwire-fail

model: mock/echo

tasks:
  ok_step:
    infer:
      prompt: "Say ok."

  boom:
    depends_on: [ok_step]
    exec:
      shell: "exit 7"
`;

// Envelope pins a CLOUD model — only the --model override makes this
// runnable with zero keys. Exactly the ▶ mock preview path.
const CLOUD_WF = `nika: v1
workflow:
  id: runwire-cloud

model: mistral/mistral-small

tasks:
  only:
    infer:
      prompt: "One short sentence."
`;

describe.skipIf(!BIN)('live-run wire (real binary · the canvas run pill seam)', () => {
  it('a real fan-out run folds to the exact terminal state', () => {
    const file = tmpWorkflow(FANOUT_WF);
    try {
      const res = runStream(['run', file, '--json', '--color', 'never']);
      expect(res.code).toBe(0);

      const model = foldTrace(res.stdout);
      expect(model.workflowStatus).toBe('completed');
      expect([...model.tasks.keys()].sort()).toEqual(['branch_a', 'branch_b', 'join', 'seed']);
      for (const t of model.tasks.values()) {
        expect(t.status, `task ${t.id}`).toBe('success');
        expect(t.durationMs, `duration of ${t.id}`).toBeTypeOf('number');
      }
      // The timeline respects the DAG: seed terminal before join starts.
      const order = model.timeline.map((e) => `${e.taskId}:${e.status}`);
      expect(order.indexOf('seed:success')).toBeLessThan(order.indexOf('join:running'));
    } finally {
      fs.unlinkSync(file);
    }
  });

  it('the fold is chunk-boundary-independent on the REAL stream', () => {
    const file = tmpWorkflow(FANOUT_WF);
    try {
      const stream = runStream(['run', file, '--json', '--color', 'never']).stdout;
      const whole = foldTrace(stream);

      // Re-fold at 17-byte increments the way runLive does per chunk:
      // every intermediate fold must never throw, and the final fold at
      // the full buffer must equal the one-shot fold.
      let buffer = '';
      for (let i = 0; i < stream.length; i += 17) {
        buffer += stream.slice(i, i + 17);
        foldTrace(buffer); // must not throw on partial trailing lines
      }
      const rebuilt = foldTrace(buffer);
      expect(rebuilt.workflowStatus).toBe(whole.workflowStatus);
      expect([...rebuilt.tasks.entries()].map(([id, t]) => [id, t.status]))
        .toEqual([...whole.tasks.entries()].map(([id, t]) => [id, t.status]));
    } finally {
      fs.unlinkSync(file);
    }
  });

  it('a failing exec folds to the verdict the danger flash keys on', () => {
    const file = tmpWorkflow(FAILING_WF);
    try {
      const res = runStream(['run', file, '--json', '--color', 'never']);
      expect(res.code).not.toBe(0);

      const model = foldTrace(res.stdout);
      expect(model.workflowStatus).toBe('failed');
      expect(model.tasks.get('ok_step')?.status).toBe('success');
      expect(model.tasks.get('boom')?.status).toBe('failed');
    } finally {
      fs.unlinkSync(file);
    }
  });

  it('--model mock/echo overrides a cloud envelope (the zero-key preview)', () => {
    const file = tmpWorkflow(CLOUD_WF);
    try {
      const res = runStream(['run', file, '--json', '--color', 'never', '--model', 'mock/echo']);
      expect(res.code).toBe(0);
      const model = foldTrace(res.stdout);
      expect(model.workflowStatus).toBe('completed');
      expect(model.tasks.get('only')?.status).toBe('success');
    } finally {
      fs.unlinkSync(file);
    }
  });
});
