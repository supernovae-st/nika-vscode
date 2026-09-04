import type { CapabilitySet } from './capabilities';
import type { CliResult } from './spawn';

type CliReader = (args: string[], timeoutMs: number) => Promise<CliResult>;

/** Select the advertised schema operation once. A refused canonical read
 * never authorizes retrying a retired spelling. Older-only capabilities
 * remain supported until the extension declares a newer engine floor.
 */
export async function readSchema(
  caps: Pick<CapabilitySet, 'specSchema' | 'schema'>,
  run: CliReader,
): Promise<CliResult | undefined> {
  if (caps.specSchema) { return run(['spec', '--schema'], 10000); }
  if (caps.schema) { return run(['schema'], 10000); }
  return undefined;
}

export async function readToolCatalog(
  caps: Pick<CapabilitySet, 'commands' | 'catalogTools'>,
  run: CliReader,
): Promise<CliResult | undefined> {
  if (caps.catalogTools) { return run(['catalog', '--tools', '--json'], 10000); }
  if (caps.commands.has('tools')) { return run(['tools', '--json'], 10000); }
  return undefined;
}
