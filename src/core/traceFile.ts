import * as fs from 'fs';
import { TRACE_MAX_BYTES } from './traceLimits';

export class TraceReadError extends Error {
  constructor(readonly reason: 'too-large' | 'not-file') {
    super(reason === 'too-large'
      ? 'journal exceeds the 16 MiB editor observation limit; no partial preview was loaded'
      : 'journal is not a regular file');
    this.name = 'TraceReadError';
  }
}

/** Read one bounded observation, not an atomic snapshot or integrity proof.
 * Check the opened descriptor before allocation, then count actual bytes so
 * appends cannot evade the limit. Never return an oversized file's prefix. */
export function readTraceFile(fsPath: string, maxBytes = TRACE_MAX_BYTES): string {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > TRACE_MAX_BYTES) {
    throw new RangeError('invalid trace observation limit');
  }
  const admit = (stat: fs.Stats): void => {
    if (!stat.isFile()) { throw new TraceReadError('not-file'); }
    if (stat.size > maxBytes) { throw new TraceReadError('too-large'); }
  };
  admit(fs.statSync(fsPath));
  // POSIX nonblocking open also prevents a raced FIFO from waiting for a
  // writer. Windows does not expose this flag; descriptor admission remains.
  const fd = fs.openSync(fsPath, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0));
  try {
    const stat = fs.fstatSync(fd);
    admit(stat);
    let buffer = Buffer.allocUnsafe(Math.min(maxBytes, Math.max(stat.size, 64 * 1024)));
    let length = 0;
    for (;;) {
      if (length === buffer.length) {
        const probe = Buffer.allocUnsafe(1);
        if (fs.readSync(fd, probe, 0, 1, null) === 0) { break; }
        if (length === maxBytes) { throw new TraceReadError('too-large'); }
        const grown = Buffer.allocUnsafe(Math.min(maxBytes, buffer.length * 2));
        buffer.copy(grown, 0, 0, length);
        grown[length++] = probe[0];
        buffer = grown;
      }
      const read = fs.readSync(fd, buffer, length, buffer.length - length, null);
      if (read === 0) { break; }
      length += read;
    }
    return buffer.toString('utf8', 0, length);
  } finally {
    fs.closeSync(fd);
  }
}
