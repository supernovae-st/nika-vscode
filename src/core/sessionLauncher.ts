// sessionLauncher.ts — the « new Nika session » picks (pure).
//
// Cursor's Agents panel offers « New Agent » with big intent choices —
// nika cannot join that proprietary list, so the extension ships its own
// session launcher: INTENTS first (set up · wizard · describe · template
// · examples · canvas · tour), state-aware (an equipped workspace stops
// advertising setup; a binary-less one leads with install), with the
// full 24-command menu one row away. Pure and tested — the extension
// maps rows onto QuickPick items.

export interface SessionState {
  /** a workspace folder is open */
  hasFolder: boolean;
  /** the workspace carries the scaffold (.cursor/rules/nika.mdc or AGENTS.md) */
  equipped: boolean;
  /** the nika binary resolves */
  binary: boolean;
  /** `nika new` guided wizard needs a real run surface */
  capNew: boolean;
  /** embedded examples available */
  capExamples: boolean;
}

export interface SessionPick {
  label: string;
  description: string;
  command: string;
  /** run in a terminal at the workspace root instead of a command */
  terminal?: string;
  kind?: 'separator';
}

export function buildSessionPicks(s: SessionState): SessionPick[] {
  const picks: SessionPick[] = [];
  if (!s.binary) {
    picks.push({
      label: '$(cloud-download) Install the nika engine',
      description: 'brew · PATH · bundled · verified download — everything below needs it',
      command: 'nika.restartServer',
    });
  }
  if (s.hasFolder && !s.equipped) {
    picks.push({
      label: '$(rocket) Set up this project',
      description: 'scaffold 7 files (rules · MCP · AGENTS.md) + wire this editor',
      command: 'nika.initProject',
    });
  }
  if (s.binary && s.capNew) {
    picks.push({
      label: '$(comment-discussion) Guided wizard — build a workflow step by step',
      description: 'the binary asks, you answer — a chat in your terminal, a checked file out',
      command: '',
      terminal: 'new',
    });
  }
  picks.push({
    label: '$(sparkle) Describe it — generate a workflow',
    description: 'one sentence in, an oracle-checked .nika.yaml out',
    command: 'nika.generateWorkflow',
  });
  picks.push({
    label: '$(new-file) Start from a template',
    description: 'the embedded skeletons (chain · fanout · agent-loop · …)',
    command: 'nika.newWorkflow',
  });
  if (s.capExamples) {
    picks.push({
      label: '$(book) Learn by example',
      description: 'runnable embedded examples, zero keys',
      command: 'nika.browseExamples',
    });
  }
  picks.push({
    label: '$(type-hierarchy) Open the canvas',
    description: 'the live DAG — run state on every card',
    command: 'nika.showDag',
  });
  picks.push({
    label: '$(mortar-board) Take the 5-minute tour',
    description: 'the walkthrough, with pictures',
    command: 'nika.openWalkthrough',
  });
  picks.push({ label: '', description: '', command: '', kind: 'separator' });
  picks.push({
    label: '$(tools) All commands…',
    description: 'the full Nika menu',
    command: 'nika.showMenu',
  });
  return picks;
}
