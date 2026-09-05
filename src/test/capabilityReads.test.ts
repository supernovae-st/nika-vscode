import { describe, expect, it, vi } from 'vitest';
import { readSchema, readToolCatalog } from '../core/capabilityReads';
import { buildCapabilities, CAPABILITY_COMMANDS } from '../core/capabilities';

describe('capability-selected reads', () => {
  it.each([0, 2])('schema canonical result is final (exit %s)', async (code) => {
    const result = { code, stdout: 'original', stderr: 'refusal' };
    const run = vi.fn(async () => result);
    expect(await readSchema({ specSchema: true }, run)).toBe(result);
    expect(run).toHaveBeenCalledExactlyOnceWith(['spec', '--schema'], 10000);
  });

  it.each([0, 2])('tool catalog canonical result is final (exit %s)', async (code) => {
    const result = { code, stdout: 'original', stderr: 'refusal' };
    const run = vi.fn(async () => result);
    expect(await readToolCatalog({ catalogTools: true }, run)).toBe(result);
    expect(run).toHaveBeenCalledExactlyOnceWith(['catalog', '--tools', '--json'], 10000);
  });

  it('retired commands in help do not authorize a read', async () => {
    const run = vi.fn(async () => ({ code: 0, stdout: '{}', stderr: '' }));
    const caps = buildCapabilities('Commands:\n  schema Schema\n  tools Tools\n  context Workspace\n', 'nika 0.118.1');
    await readSchema(caps, run);
    await readToolCatalog(caps, run);
    expect(caps.welcome).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('absent capabilities execute nothing', async () => {
    const run = vi.fn(async () => ({ code: 0, stdout: '', stderr: '' }));
    expect(await readSchema({ specSchema: false }, run)).toBeUndefined();
    expect(await readToolCatalog({ catalogTools: false }, run)).toBeUndefined();
    expect(run).not.toHaveBeenCalled();
  });

  it('probes current commands omitted from human help and requires canonical flags', () => {
    expect(CAPABILITY_COMMANDS).toContain('catalog');
    for (const retired of ['schema', 'tools', 'context']) { expect(CAPABILITY_COMMANDS).not.toContain(retired); }
    const caps = buildCapabilities('nika  a plan from a file', 'nika 0.116.2', '', '', ['catalog', 'spec', 'welcome'], {
      spec: '  --schema  JSON Schema', catalog: '  --tools  Builtin tools',
    });
    expect(caps.commands.has('catalog')).toBe(true);
    expect(caps.specSchema).toBe(true);
    expect(caps.catalogTools).toBe(true);
    expect(caps.welcome).toBe(true);
    const missingFlags = buildCapabilities('', 'nika 0.118.1', '', '', ['catalog', 'spec']);
    expect(missingFlags.specSchema).toBe(false);
    expect(missingFlags.catalogTools).toBe(false);
  });
});
