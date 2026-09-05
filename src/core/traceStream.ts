import { createTraceFold, type RunModel } from './traceFold';

/** An editor observation budget, not a limit on the engine's durable journal. */
export const LIVE_TRACE_MAX_BYTES = 16 * 1024 * 1024;

/** Decode each complete line once, with a bounded raw capture for local replay. */
export class TraceStream {
  private fold = createTraceFold();
  private capture = Buffer.alloc(0);
  private length = 0;
  private lineStart = 0;
  private ended = false;
  private exceeded = false;

  constructor(private readonly maxBytes = LIVE_TRACE_MAX_BYTES) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > LIVE_TRACE_MAX_BYTES) {
      throw new RangeError('invalid live trace observation limit');
    }
  }

  get limited(): boolean { return this.exceeded; }
  get retainedBytes(): number { return this.length; }

  /** Input is UTF-8 decoded by the owned stdout stream, not arbitrary bytes. */
  push(chunk: string): boolean {
    if (this.ended || this.exceeded) { return false; }
    const bytes = Buffer.byteLength(chunk, 'utf8');
    if (bytes > this.maxBytes - this.length) {
      this.exceeded = true;
      this.capture = Buffer.alloc(0);
      this.lineStart = 0;
      this.length = 0;
      this.fold = createTraceFold();
      return false;
    }
    const required = this.length + bytes;
    if (required > this.capture.length) {
      const capacity = Math.min(this.maxBytes, Math.max(required, this.capture.length * 2, 64 * 1024));
      const grown = Buffer.allocUnsafe(capacity);
      this.capture.copy(grown, 0, 0, this.length);
      this.capture = grown;
    }
    let start = this.length;
    this.length += this.capture.write(chunk, this.length, 'utf8');
    // Search only new initialized bytes. An incomplete line remains in the
    // bounded buffer, never a rope or an object retained for each tiny chunk.
    const initialized = this.capture.subarray(0, this.length);
    for (let end = initialized.indexOf(0x0a, start); end !== -1; end = initialized.indexOf(0x0a, start)) {
      this.fold.pushLine(initialized.toString('utf8', this.lineStart, end));
      this.lineStart = end + 1;
      start = this.lineStart;
    }
    return true;
  }

  finish(): void {
    if (this.ended || this.exceeded) { return; }
    this.ended = true;
    if (this.lineStart < this.length) {
      this.fold.pushLine(this.capture.toString('utf8', this.lineStart, this.length));
    }
    this.lineStart = this.length;
  }

  snapshot(): RunModel | undefined {
    return this.exceeded ? undefined : this.fold.snapshot();
  }

  text(): string | undefined {
    return this.exceeded ? undefined : this.capture.toString('utf8', 0, this.length);
  }
}
