/** A displayed engine announcement, not a verification of its trace. */
export interface RunAnnouncement { path: string; events: string; head: string }

/**
 * Frame the current CLI's stderr line before reading its complete identity.
 * Keep at most 4096 UTF-16 code units; an oversized line is discarded whole,
 * never treated as a valid truncated path/head. Missing evidence stays absent.
 */
export function runAnnouncementStream(onAnnouncement: (value: RunAnnouncement) => void): {
  push(chunk: string): void;
  finish(): void;
} {
  let pending = '';
  let oversized = false;
  let closed = false;
  const consume = (): void => {
    if (!oversized) {
      const line = pending.endsWith('\r') ? pending.slice(0, -1) : pending;
      const match = /^nika run: trace: (.+\.ndjson) · ([0-9]+) events · chain ([0-9a-f]{64})(?: · sealed)?$/.exec(line);
      if (match) { onAnnouncement({ path: match[1], events: match[2], head: match[3] }); }
    }
    pending = '';
    oversized = false;
  };
  return {
    push(chunk) {
      if (closed) { return; }
      let start = 0;
      while (start < chunk.length) {
        const newline = chunk.indexOf('\n', start);
        const end = newline === -1 ? chunk.length : newline;
        if (!oversized) {
          if (pending.length + end - start > 4096) {
            pending = '';
            oversized = true;
          } else { pending += chunk.slice(start, end); }
        }
        if (newline === -1) { break; }
        consume();
        start = newline + 1;
      }
    },
    finish() {
      if (closed) { return; }
      closed = true;
      consume();
    },
  };
}
