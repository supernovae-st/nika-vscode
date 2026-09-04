import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  EventEmitter: class {
    event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
  },
}));
vi.mock('../core/binaryVersion', async (original) => ({
  ...await original<typeof import('../core/binaryVersion')>(),
  probeBinaryVersion: vi.fn(),
}));
vi.mock('../core/spawn', async (original) => ({
  ...await original<typeof import('../core/spawn')>(),
  spawnCli: vi.fn(),
}));
import { NikaService } from '../nikaService';
import { probeBinaryVersion } from '../core/binaryVersion';
import { spawnCli } from '../core/spawn';
import { wireHostOnce } from '../core/hostWiring';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(spawnCli).mockImplementation(async (_bin, args) => ({
    code: 0,
    stdout: args[0] === '--help' ? 'Commands:\n  check Audit\n  run Run\n  lsp LSP\n  mcp MCP\n  wire Wire\n'
      : args[1] === '--help' ? '  --schema Schema\n  --tools Tools\n  --resume Trace\n  --from Task\n' : '{}',
    stderr: '',
  }));
});

describe('service admission before capabilities and effects', () => {
  it.each(['0.116.2', '0.118.0', '0.118.1', '0.118.2-rc.1', null])('rejects %s before help, workflow, or either host writer', async (version) => {
    vi.mocked(probeBinaryVersion).mockResolvedValue(version);
    const service = new NikaService();
    await service.setBinary('/selected/nika');
    expect(service.available).toBe(false);
    expect(service.binaryPath).toBeUndefined();
    expect(service.caps.commands.size).toBe(0);
    expect(service.supportError).toContain('0.118.2');
    const result = await service.runCli(['run', 'workflow.nika.yaml']);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toBe(service.supportError);
    const machineAbsolute = vi.fn();
    await wireHostOnce({ target: 'cursor', directory: '/workspace', mcp: service.caps.mcp, wire: service.caps.wire,
      binaryPath: service.binaryPath, portableBinaryMatches: false }, { runCli: service.runCli.bind(service), machineAbsolute });
    expect(spawnCli).not.toHaveBeenCalled();
    expect(machineAbsolute).not.toHaveBeenCalled();
  });
  it('accepts a supported selection, proves current operations, and permits execution', async () => {
    vi.mocked(probeBinaryVersion).mockResolvedValue('0.118.2');
    const service = new NikaService();
    await service.setBinary('/selected/nika');
    expect(service.available).toBe(true);
    expect(service.supportError).toBeUndefined();
    expect(service.caps.lsp).toBe(true);
    expect(service.caps.resume).toBe(true);
    await service.runCli(['run', 'workflow.nika.yaml']);
    expect(spawnCli).toHaveBeenLastCalledWith('/selected/nika', ['run', 'workflow.nika.yaml'], 30000, undefined, undefined);
    const verbs = vi.mocked(spawnCli).mock.calls.map((call) => call[1][0]);
    expect(verbs).not.toContain('schema');
    expect(verbs).not.toContain('tools');
    expect(verbs).not.toContain('context');
  });
  it('revokes the previous engine while restart admission is pending and after refusal', async () => {
    vi.mocked(probeBinaryVersion).mockResolvedValueOnce('0.118.2');
    const service = new NikaService();
    await service.setBinary('/supported/nika');
    let release!: (value: string | null) => void;
    vi.mocked(probeBinaryVersion).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const restart = service.setBinary('/old/nika');
    vi.mocked(spawnCli).mockClear();
    expect(service.available).toBe(false);
    expect(service.caps.lsp).toBe(false);
    expect(service.binaryPath).toBeUndefined();
    await service.runCli(['wire', 'cursor']);
    release('0.118.0');
    await restart;
    expect(service.available).toBe(false);
    expect(spawnCli).not.toHaveBeenCalled();
  });
  it('a stale successful version probe cannot restore a rejected later selection', async () => {
    let release!: (value: string | null) => void;
    vi.mocked(probeBinaryVersion).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const service = new NikaService();
    const stale = service.setBinary('/previous/nika');
    vi.mocked(probeBinaryVersion).mockResolvedValueOnce('0.118.0');
    await service.setBinary('/current/nika');
    release('0.118.2');
    await stale;
    expect(service.available).toBe(false);
    expect(service.supportError).toContain('0.118.0');
    expect(spawnCli).not.toHaveBeenCalled();
  });
  it('a supported version cannot invent absent canonical capabilities', async () => {
    vi.mocked(probeBinaryVersion).mockResolvedValue('0.118.2');
    vi.mocked(spawnCli).mockResolvedValue({ code: 2, stdout: '', stderr: 'unsupported' });
    const service = new NikaService();
    await service.setBinary('/minimal/nika');
    expect(service.available).toBe(false);
    expect(service.caps.specSchema).toBe(false);
    expect(service.caps.catalogTools).toBe(false);
    expect(service.caps.welcome).toBe(false);
  });

  it('a stale successful help probe cannot restore capabilities after a later refusal', async () => {
    vi.mocked(probeBinaryVersion).mockResolvedValueOnce('0.118.2');
    let release!: (value: { code: number; stdout: string; stderr: string }) => void;
    vi.mocked(spawnCli).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const service = new NikaService();
    const stale = service.setBinary('/previous/nika');
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    vi.mocked(probeBinaryVersion).mockResolvedValueOnce('0.118.0');
    await service.setBinary('/current/nika');
    vi.mocked(spawnCli).mockClear();
    release({ code: 0, stdout: 'Commands:\n  run Run\n  lsp LSP\n  wire Wire\n', stderr: '' });
    await stale;
    expect(service.available).toBe(false);
    expect(service.caps.lsp).toBe(false);
    expect(service.supportError).toContain('0.118.0');
    expect(spawnCli).not.toHaveBeenCalled();
  });

  it('workspace aggregation uses only welcome and preserves absence after refusal', async () => {
    vi.mocked(probeBinaryVersion).mockResolvedValue('0.118.2');
    const service = new NikaService();
    await service.setBinary('/selected/nika');
    vi.mocked(spawnCli).mockClear();
    vi.mocked(spawnCli).mockResolvedValue({ code: 2, stdout: '', stderr: 'original refusal' });
    expect(await service.welcomeDeep('/workspace')).toEqual({ kind: 'no-output' });
    expect(spawnCli).toHaveBeenCalledExactlyOnceWith('/selected/nika', ['welcome', '--deep', '--json'], 20000, undefined, '/workspace');
    vi.mocked(probeBinaryVersion).mockResolvedValue('0.118.0');
    await service.setBinary('/old/nika');
    vi.mocked(spawnCli).mockClear();
    expect(await service.welcomeDeep('/workspace')).toEqual({ kind: 'unsupported' });
    expect(spawnCli).not.toHaveBeenCalled();
  });
});
