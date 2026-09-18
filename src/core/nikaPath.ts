import { isCanonicalWorkflowPath } from './workflowName';

/** The one fact the Explorer badge decides on — pure, vitest-reachable. */
export function isNikaWorkflowPath(path: string): boolean {
  return isCanonicalWorkflowPath(path);
}
