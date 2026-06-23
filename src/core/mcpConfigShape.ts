// mcpConfigShape.ts — pure MCP JSON shaping for editor config writers.

export const NIKA_MCP_COMMAND = 'nika';
export const NIKA_MCP_ARGS = ['mcp'] as const;

export interface NikaMcpServer {
  command: string;
  args: string[];
  type?: 'stdio';
}

export type JsonObject = Record<string, unknown>;

export function nikaMcpServer(command = NIKA_MCP_COMMAND, includeType = false): NikaMcpServer {
  const server: NikaMcpServer = { command, args: [...NIKA_MCP_ARGS] };
  if (includeType) {
    server.type = 'stdio';
  }
  return server;
}

export function isStaleNikaMcpServer(value: unknown): boolean {
  if (!isObject(value)) {
    return false;
  }
  const args = value.args;
  return Array.isArray(args)
    && args.length === 3
    && args[0] === 'mcp'
    && args[1] === 'serve'
    && args[2] === '--stdio';
}

export function patchCursorLikeConfig(input: JsonObject | undefined, command = NIKA_MCP_COMMAND): {
  config: JsonObject;
  changed: boolean;
  migrated: boolean;
} {
  const config: JsonObject = { ...(input ?? {}) };
  const servers = isObject(config.mcpServers) ? { ...config.mcpServers } : {};
  const existing = servers.nika;
  const desired = nikaMcpServer(command);
  const migrated = isStaleNikaMcpServer(existing);
  const changed = !serverEquals(existing, desired);
  servers.nika = desired;
  config.mcpServers = servers;
  return { config, changed, migrated };
}

export function patchVscodeConfig(input: JsonObject | undefined, command = NIKA_MCP_COMMAND): {
  config: JsonObject;
  changed: boolean;
  migrated: boolean;
} {
  const config: JsonObject = { ...(input ?? {}) };
  const servers = isObject(config.servers) ? { ...config.servers } : {};
  const existing = servers.nika;
  const desired = nikaMcpServer(command, true);
  const migrated = isStaleNikaMcpServer(existing);
  const changed = !serverEquals(existing, desired);
  servers.nika = desired;
  config.servers = servers;
  return { config, changed, migrated };
}

function serverEquals(existing: unknown, desired: NikaMcpServer): boolean {
  if (!isObject(existing)) {
    return false;
  }
  return existing.command === desired.command
    && Array.isArray(existing.args)
    && existing.args.length === desired.args.length
    && existing.args.every((arg, idx) => arg === desired.args[idx])
    && existing.type === desired.type;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
