// costBaseline.ts — the HEAD-side of the cost-delta lens.
//
// Resolves "what was this workflow's cost ceiling at git HEAD?" so the
// chip can show the CHANGE (core/costDelta). All IO, all garnish-law:
// every failure path (no git · no repo · untracked file · HEAD version
// doesn't check) collapses to undefined = no delta shown, never an error.
// One baseline check per (file, HEAD sha) — commits invalidate, keystrokes
// never do; the rev-parse probe per lookup is a ~ms local spawn.

import { execFile } from 'child_process';
import * as path from 'path';
import { parseCheckReport } from '../core/cliContract';
import type { CostBaseline } from '../core/costDelta';
import { runCliOnText, type TextRunner } from '../core/spawn';

function git(args: string[], cwd: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout: 4000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      resolve(err ? undefined : stdout);
    });
  });
}

export class CostBaselineTracker {
  /** fsPath → the baseline computed at that HEAD (sha stamps the entry;
   *  `baseline: undefined` is a REMEMBERED miss — untracked stays silent
   *  without re-probing until the next commit). */
  private readonly cache = new Map<string, { sha: string; baseline: CostBaseline | undefined }>();

  constructor(private readonly service: TextRunner) {}

  /** The HEAD baseline for `fsPath`, or undefined when there is none
   *  (not a repo · untracked · HEAD content refuses to check). */
  async baselineFor(fsPath: string): Promise<CostBaseline | undefined> {
    const dir = path.dirname(fsPath);
    const sha = (await git(['rev-parse', 'HEAD'], dir))?.trim();
    if (!sha) { return undefined; }
    const cached = this.cache.get(fsPath);
    if (cached && cached.sha === sha) { return cached.baseline; }

    const baseline = await this.compute(fsPath, dir);
    // Last-write-wins is fine here: two concurrent computes at the same
    // sha produce the same value; a compute finishing after a commit is
    // replaced on the next lookup (sha mismatch).
    this.cache.set(fsPath, { sha, baseline });
    return baseline;
  }

  private async compute(fsPath: string, dir: string): Promise<CostBaseline | undefined> {
    // `HEAD:./name` resolves relative to cwd — rename/untracked → undefined.
    const headText = await git(['show', `HEAD:./${path.basename(fsPath)}`], dir);
    if (headText === undefined || headText.length === 0) { return undefined; }

    try {
      const res = await runCliOnText(
        this.service,
        (file) => ['check', file, '--json'],
        headText,
        20000,
        'base',
      );
      const report = parseCheckReport(res.stdout);
      if (!report) { return undefined; }
      return {
        usd: report.cost.bounded_total_usd,
        unbounded: report.cost.has_unbounded === true,
      };
    } catch {
      return undefined;
    }
  }
}
