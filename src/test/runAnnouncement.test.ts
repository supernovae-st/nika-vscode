import { describe, expect, it } from 'vitest';
import { runAnnouncementStream, type RunAnnouncement } from '../core/runAnnouncement';

const head = '0123456789abcdef'.repeat(4);
const line = `nika run: trace: .nika/traces/a space.ndjson · 7 events · chain ${head} · sealed`;
function reader() {
  const seen: RunAnnouncement[] = [];
  return { seen, stream: runAnnouncementStream((value) => seen.push(value)) };
}

describe('current engine trace announcement', () => {
  it('preserves the full 64-hex head and spaces in a path', () => {
    const { seen, stream } = reader();
    stream.push(`${line}\n`);
    expect(seen).toEqual([{ path: '.nika/traces/a space.ndjson', events: '7', head }]);
  });
  it('is independent of every possible two-chunk boundary', () => {
    for (let i = 0; i <= line.length; i++) {
      const { seen, stream } = reader();
      stream.push(line.slice(0, i));
      stream.push(line.slice(i));
      expect(seen).toEqual([]);
      stream.push('\n');
      expect(seen).toHaveLength(1);
      expect(seen[0].head).toBe(head);
    }
  });
  it('accepts CRLF and an unsealed complete announcement at close only once', () => {
    const { seen, stream } = reader();
    stream.push(`${line}\r\n${line.replace(' · sealed', '')}`);
    expect(seen).toHaveLength(1);
    stream.finish();
    stream.finish();
    stream.push(`${line}\n`);
    expect(seen).toHaveLength(2);
  });
  it.each([head.slice(0, 32), `${head}a`, head.toUpperCase(), 'g'.repeat(64)])(
    'never promotes malformed or truncated head %s', (bad) => {
      const { seen, stream } = reader();
      stream.push(`${line.replace(head, bad)}\n`);
      stream.finish();
      expect(seen).toEqual([]);
    },
  );
  it('does not mistake embedded text, retired prefixes, or a torn suffix for an announcement', () => {
    for (const bad of [`log says ${line}`, line.replace('nika run: ', ''), `${line} garbage`]) {
      const { seen, stream } = reader();
      stream.push(`${bad}\n`);
      expect(seen).toEqual([]);
    }
  });
  it('drops an oversized line as a whole and recovers only at a newline', () => {
    const { seen, stream } = reader();
    stream.push('x'.repeat(5000));
    stream.push(line);
    stream.push(`\n${line}\n`);
    expect(seen).toHaveLength(1);
  });
  it('does not publish a 64-character prefix before the next chunk invalidates it', () => {
    const { seen, stream } = reader();
    stream.push(line.replace(' · sealed', ''));
    stream.push('a\n');
    expect(seen).toEqual([]);
  });
});
