import { describe, expect, it } from 'vitest';
import { auditByTask } from '../core/auditByTask';
import type { UnifiedFinding } from '../core/cliContract';

const f = (task: string | undefined, severity: 'error' | 'warning' | 'info'): UnifiedFinding => ({
  source: 'conformance', code: 'NIKA-X', message: 'm', severity, task,
});

describe('auditByTask (per-card check rollup)', () => {
  it('counts findings per task', () => {
    const m = auditByTask([f('a', 'error'), f('a', 'warning'), f('b', 'info')]);
    expect(m.get('a')?.count).toBe(2);
    expect(m.get('b')?.count).toBe(1);
  });

  it('keeps the WORST severity per task (error < warning < info)', () => {
    expect(auditByTask([f('a', 'info'), f('a', 'error'), f('a', 'warning')]).get('a')?.worst).toBe('error');
    expect(auditByTask([f('b', 'info'), f('b', 'warning')]).get('b')?.worst).toBe('warning');
    expect(auditByTask([f('c', 'info')]).get('c')?.worst).toBe('info');
  });

  it('drops findings with no task (workflow-level, not a card)', () => {
    const m = auditByTask([f(undefined, 'error'), f('a', 'warning')]);
    expect(m.has('a')).toBe(true);
    expect([...m.keys()]).toEqual(['a']);
  });

  it('is empty on a clean report', () => {
    expect(auditByTask([]).size).toBe(0);
  });

  it('normalizes unknown severity strings to info', () => {
    const weird = { source: 'hint', code: 'x', message: 'm', severity: 'note' as unknown as 'info', task: 'a' };
    expect(auditByTask([weird]).get('a')?.worst).toBe('info');
  });
});
