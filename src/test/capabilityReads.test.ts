import { describe, expect, it, vi } from 'vitest';
import { readSchema, readToolCatalog } from '../core/capabilityReads';
import { buildCapabilities, CAPABILITY_COMMANDS } from '../core/capabilities';

describe('capability-selected reads', () => {
  it.each([0, 2])('schema canonical result is final, even when old schema also advertises (exit %s)', async (code) => {
    const result = { code, stdout: 'original', stderr: 'refusal' };
    const run = vi.fn(async () => result);
    expect(await readSchema({ specSchema: true, schema: true }, run)).toBe(result);
    expect(run).toHaveBeenCalledExactlyOnceWith(['spec', '--schema'], 10000);
  });

  it.each([0, 2])('tool catalog canonical result is final (exit %s)', async (code) => {
    const result = { code, stdout: 'original', stderr: 'refusal' };
    const run = vi.fn(async () => result);
    expect(await readToolCatalog({ commands: new Set(['catalog', 'tools']), catalogTools: true }, run)).toBe(result);
    expect(run).toHaveBeenCalledExactlyOnceWith(['catalog', '--tools', '--json'], 10000);
  });

  it('supports proven older-only operations without executing missing canonical commands', async () => {
    const run = vi.fn(async () => ({ code: 0, stdout: '{}', stderr: '' }));
    await readSchema({ specSchema: false, schema: true }, run);
    await readToolCatalog({ commands: new Set(['catalog', 'tools']), catalogTools: false }, run);
    expect(run.mock.calls).toEqual([[['schema'], 10000], [['tools', '--json'], 10000]]);
  });

  it('absent capabilities execute nothing', async () => {
    const run = vi.fn(async () => ({ code: 0, stdout: '', stderr: '' }));
    expect(await readSchema({ specSchema: false, schema: false }, run)).toBeUndefined();
    expect(await readToolCatalog({ commands: new Set(), catalogTools: false }, run)).toBeUndefined();
    expect(run).not.toHaveBeenCalled();
  });

  it('probes catalog/tools omitted from the human help before selecting a read', () => {
    expect(CAPABILITY_COMMANDS).toContain('catalog');
    expect(CAPABILITY_COMMANDS).toContain('tools');
    const caps = buildCapabilities('nika  a plan from a file', 'nika 0.116.2', '', '', ['catalog', 'spec', 'welcome'], {
      spec: '  --schema  JSON Schema', catalog: '  --tools  Builtin tools',
    });
    expect(caps.commands.has('catalog')).toBe(true);
    expect(caps.specSchema).toBe(true);
    expect(caps.catalogTools).toBe(true);
    expect(caps.welcome).toBe(true);
    expect(caps.schema).toBe(false);
    expect(caps.context).toBe(false);
  });
});
