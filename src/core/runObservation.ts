import type { RunModel } from './traceFold';

/** A process capture is observation, not a substitute for a sealed journal. */
export function runObservationError(model: RunModel, code: number | null, err?: string): string | undefined {
  if (err) { return `Run observation incomplete: ${err}. Inspect the engine journal.`; }
  if (model.unknownLines > 0
    || !['completed', 'failed', 'cancelled', 'paused'].includes(model.workflowStatus)
    || (model.workflowStatus === 'completed'
      && (code !== 0 || [...model.tasks.values()].some((task) => task.status === 'failed')))) {
    return `Run observation is incomplete or contradicts exit ${code ?? 'signal'}. Inspect the engine journal.`;
  }
  return undefined;
}
