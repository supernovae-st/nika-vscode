/** The one fact the Explorer badge decides on — pure, vitest-reachable. */
export function isNikaWorkflowPath(path: string): boolean {
  return /\.nika\.ya?ml$/i.test(path);
}
