// The user's journey, computed ONCE — the single source of truth four
// surfaces used to re-derive independently (the status menu's findFiles,
// the init nudge's equipped probe, New Session's picks, the welcome
// views). Pure: facts in, stage out; the extension seam gathers facts
// and posts the stage as the `nika.journey` context key.
export type JourneyStage = 'noBinary' | 'unequipped' | 'empty' | 'working';

export interface JourneyFacts {
  /** The engine binary resolved and answers. */
  binaryAvailable: boolean;
  /** A workspace folder is open (init/equip have a target). */
  workspaceOpen: boolean;
  /** The repo carries the `nika init` scaffold (see [`SCAFFOLD_MARKERS`]). */
  equipped: boolean;
  /** At least one `*.nika.yaml` lives in the workspace. */
  hasWorkflows: boolean;
}

export interface Journey extends JourneyFacts {
  stage: JourneyStage;
}

/**
 * Workspace-root files whose presence means « `nika init` ran here » —
 * the ONE marker list (both prior copies checked exactly these two).
 */
export const SCAFFOLD_MARKERS = ['.cursor/rules/nika.mdc', 'AGENTS.md'] as const;

/**
 * The stage precedence, told as the user's story:
 * 1. no binary → nothing else can light up: Finish Setup leads;
 * 2. workflows exist → the user is WORKING — equipping is an
 *    improvement, never a blocker (the Author section keeps Init);
 * 3. a folder without the scaffold → Init this project leads;
 * 4. otherwise (equipped, or no folder to equip) → the empty stage:
 *    prove the engine offline, then author.
 */
export function journeyStage(f: JourneyFacts): JourneyStage {
  if (!f.binaryAvailable) {
    return 'noBinary';
  }
  if (f.hasWorkflows) {
    return 'working';
  }
  if (f.workspaceOpen && !f.equipped) {
    return 'unequipped';
  }
  return 'empty';
}

/** Facts + stage in one value (what the surfaces consume). */
export function journey(f: JourneyFacts): Journey {
  return { ...f, stage: journeyStage(f) };
}

/** The status-menu placeholder, per stage — one voice with the head row. */
export function journeyPlaceholder(stage: JourneyStage, activeFile?: string): string {
  switch (stage) {
    case 'noBinary':
      return 'Install the engine — everything else lights up after';
    case 'unequipped':
      return 'This repo is not equipped yet — Init wires everything in one gesture';
    case 'empty':
      return 'No workflows yet — prove the engine offline, then author';
    case 'working':
      return activeFile
        ? `${activeFile} — run · check · graph, or browse below`
        : 'What next — author, prove, understand?';
  }
}
