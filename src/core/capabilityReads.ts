import type { CapabilitySet } from './capabilities';
import type { CliResult } from './spawn';

type CliReader = (args: string[], timeoutMs: number) => Promise<CliResult>;

/** Select the advertised canonical operation once; its refusal is final. */
export async function readSchema(
  caps: Pick<CapabilitySet, 'specSchema'>,
  run: CliReader,
): Promise<CliResult | undefined> {
  if (caps.specSchema) { return run(['spec', '--schema'], 10000); }
  return undefined;
}

export async function readToolCatalog(
  caps: Pick<CapabilitySet, 'catalogTools'>,
  run: CliReader,
): Promise<CliResult | undefined> {
  if (caps.catalogTools) { return run(['catalog', '--tools', '--json'], 10000); }
  return undefined;
}
