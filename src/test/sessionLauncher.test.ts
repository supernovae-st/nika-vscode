import { describe, expect, it } from 'vitest';
import { buildSessionPicks } from '../core/sessionLauncher';

const base = { hasFolder: true, equipped: false, binary: true, capNew: true, capExamples: true };

describe('buildSessionPicks', () => {
  it('unequipped workspace leads with setup, then the wizard', () => {
    const picks = buildSessionPicks(base);
    expect(picks[0].command).toBe('nika.initProject');
    expect(picks[1].terminal).toBe('new');
  });

  it('equipped workspace stops advertising setup', () => {
    const picks = buildSessionPicks({ ...base, equipped: true });
    expect(picks.some((p) => p.command === 'nika.initProject')).toBe(false);
    expect(picks[0].terminal).toBe('new');
  });

  it('binary-less session leads with install and hides the wizard', () => {
    const picks = buildSessionPicks({ ...base, binary: false, capNew: false });
    expect(picks[0].command).toBe('nika.restartServer');
    expect(picks.some((p) => p.terminal === 'new')).toBe(false);
    expect(picks.some((p) => p.command === 'nika.generateWorkflow')).toBe(true);
  });

  it('the full menu stays one row away, after a separator', () => {
    const picks = buildSessionPicks(base);
    const sep = picks.findIndex((p) => p.kind === 'separator');
    expect(sep).toBeGreaterThan(0);
    expect(picks[sep + 1].command).toBe('nika.showMenu');
  });
});
