import { describe, expect, it } from 'vitest';
import {
  NIKA_MCP_ARGS,
  isStaleNikaMcpServer,
  patchCursorLikeConfig,
  patchVscodeConfig,
} from '../core/mcpConfigShape';

describe('mcpConfigShape', () => {
  it('uses the shipped in-binary MCP contract', () => {
    expect(NIKA_MCP_ARGS).toEqual(['mcp']);
  });

  it('creates Cursor-style configs without clobbering other servers', () => {
    const result = patchCursorLikeConfig({
      mcpServers: {
        github: { command: 'gh', args: ['mcp'] },
      },
    });

    expect(result.changed).toBe(true);
    expect(result.config).toMatchObject({
      mcpServers: {
        github: { command: 'gh', args: ['mcp'] },
        nika: { command: 'nika', args: ['mcp'] },
      },
    });
  });

  it('migrates stale mcp serve --stdio configs', () => {
    const stale = { command: 'nika', args: ['mcp', 'serve', '--stdio'] };
    expect(isStaleNikaMcpServer(stale)).toBe(true);

    const result = patchCursorLikeConfig({ mcpServers: { nika: stale } });
    expect(result.migrated).toBe(true);
    expect(result.config).toMatchObject({
      mcpServers: {
        nika: { command: 'nika', args: ['mcp'] },
      },
    });
  });

  it('keeps current Cursor-style configs idempotent', () => {
    const result = patchCursorLikeConfig({
      mcpServers: {
        nika: { command: 'nika', args: ['mcp'] },
      },
    });

    expect(result.changed).toBe(false);
    expect(result.migrated).toBe(false);
  });

  it('creates VS Code stdio configs with the right shape', () => {
    const result = patchVscodeConfig(undefined);

    expect(result.config).toEqual({
      servers: {
        nika: {
          type: 'stdio',
          command: 'nika',
          args: ['mcp'],
        },
      },
    });
  });
});
