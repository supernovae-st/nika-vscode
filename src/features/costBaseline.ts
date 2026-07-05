// costBaseline.ts — the HEAD-side of the cost-delta lens.
//
// Resolves "what was this workflow's cost ceiling at git HEAD?" so the
// chip can show the CHANGE (core/costDelta). All IO, all garnish-law:
// every failure path (no git · no repo · untracked file · HEAD version
// doesn't check) collapses to undefined = no delta shown, never an error.
// One baseline check per (file, HEAD sha) — commits invalidate, keystrokes
// never do; the rev-parse probe per lookup is a ~ms local spawn.

import { execFile } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseCheckReport } from '../core/cliContract';
import type { CostBaseline } from '../core/costDelta';

/** The one seam this needs from NikaService (keeps the module testable). */
interface CheckRunner {
  runCli(args: string[], timeoutMs?: number): Promise<{ code: number | null; stdout: string; stderr: string }>;
}

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
  private seq = 0;

  constructor(private readonly service: CheckRunner) {}

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

    this.seq += 1;
    const digest = crypto.createHash('sha256').update(fsPath).digest('hex').slice(0, 12);
    const tmp = path.join(os.tmpdir(), `nika-base-${digest}-${process.pid}-${this.seq}.nika.yaml`);
    try {
      fs.writeFileSync(tmp, headText, 'utf-8');
      const res = await this.service.runCli(['check', tmp, '--json'], 20000);
      const report = parseCheckReport(res.stdout);
      if (!report) { return undefined; }
      return {
        usd: report.cost.bounded_total_usd,
        unbounded: report.cost.has_unbounded === true,
      };
    } catch {
      return undefined;
    } finally {
      fs.unlink(tmp, () => undefined);
    }
  }
}
