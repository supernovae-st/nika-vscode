// armorEdit.ts — « make it resilient » (pure): the spec's three error
// walls as insertable shapes. The REGISTER is spec truth (SSOT
// stdlib/authoring-shapes-v0.1.yaml · oracle-proven at projection
// time · authoringShapes.generated); this module is only the editor
// mechanics — where a body lands (canonical key order), what refuses
// (worn armor · moved anchors), and the recover-ref substitution. The
// recover reference is NOT an execution edge (the spec's carve-out)
// but acyclicity still binds (NIKA-DAG-004) — candidates come from
// upstreamCandidates, so the picker cannot write the deadlock.

import { NIKA_ARMOR_SHAPES, type ArmorShape } from './authoringShapes.generated';
import { findTaskKey, taskBlockInsert, taskKeyRewrite, type TaskRange } from './flowEdit';

export type { ArmorShape };

/** The register — one row per wall, offered only where the key is absent. */
export const ARMOR_SHAPES: readonly ArmorShape[] = NIKA_ARMOR_SHAPES;

export type ArmorKind = (typeof NIKA_ARMOR_SHAPES)[number]['id'];

/** Armor keys already worn by the task — those rows leave the picker. */
export function wornArmor(lines: readonly string[], task: TaskRange): Set<'retry' | 'on_error' | 'timeout'> {
  const worn = new Set<'retry' | 'on_error' | 'timeout'>();
  for (const key of ['retry', 'on_error', 'timeout'] as const) {
    if (findTaskKey(lines, task, key)) { worn.add(key); }
  }
  return worn;
}

/** Write a shape's SSOT body at the canonical position. `recover`
 * substitutes the picked ref over the body's SLOT value; `timeout`
 * (an inline key) replaces in place rather than refusing. */
export function armorWrite(
  text: string,
  task: TaskRange,
  kind: ArmorKind,
  recoverRef?: string,
): string | undefined {
  const shape = NIKA_ARMOR_SHAPES.find((s) => s.id === kind);
  if (!shape) { return undefined; }
  let body = shape.body;
  if (kind === 'recover' && recoverRef !== undefined) {
    body = body.replace(/recover: .*$/m, `recover: ${recoverRef}`);
  }
  if (shape.key === 'timeout') {
    const value = body.replace(/^timeout:\s*/, '').replace(/\n$/, '');
    return taskKeyRewrite(text, task, 'timeout', value);
  }
  return taskBlockInsert(text, task, shape.key, body);
}
