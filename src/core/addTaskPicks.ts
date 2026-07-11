// addTaskPicks.ts — the editor-side Add Task pick list (pure).
//
// `nika.addTask` shows ONE QuickPick speaking the task palette's exact
// vocabulary (verbPalette.ts · the canvas ⌘-palette): the 4 verbs first,
// then every builtin as an `invoke` task pre-wired to it — typing "jq"
// from the editor lands the same skeleton the canvas palette would.
// Capability-honest: with no binary catalog the FALLBACK_TOOL_BLURBS
// vocabulary stands (names + blurbs, category unknown), so the command
// works offline the day the binary is missing.
//
// Pure and tested — the extension maps these rows onto vscode.QuickPick
// items (the `separator` row becomes QuickPickItemKind.Separator).

import { FALLBACK_TOOL_BLURBS, VERB_ITEMS } from './verbPalette';
import type { ToolMeta } from './cliContract';

export interface AddTaskPick {
  kind: 'verb' | 'tool' | 'separator';
  /** QuickPick label (glyph + name) — also the filter target. */
  label: string;
  /** QuickPick description (blurb · category). */
  description: string;
  verb?: 'infer' | 'exec' | 'invoke' | 'agent';
  /** Full tool ref (`nika:jq`) when the row pins a builtin. */
  tool?: string;
}

/**
 * Build the Add Task rows: verbs (canonical order) · separator · builtins
 * (category, then name — the register's reading order). `toolCats` is the
 * binary's `nika tools --json` projection when present.
 */
export function buildAddTaskPicks(
  toolCats: Record<string, ToolMeta> | undefined,
): AddTaskPick[] {
  const picks: AddTaskPick[] = VERB_ITEMS.map((v) => ({
    kind: 'verb',
    label: `${v.glyph} ${v.verb}`,
    description: v.blurb,
    verb: v.verb,
  }));

  const bares = toolCats ? Object.keys(toolCats) : Object.keys(FALLBACK_TOOL_BLURBS);
  if (bares.length === 0) { return picks; }

  picks.push({ kind: 'separator', label: 'builtins · an invoke task, pre-wired', description: '' });

  const rows = bares.map((bare) => {
    const meta = toolCats?.[bare];
    const desc = meta?.desc ?? FALLBACK_TOOL_BLURBS[bare] ?? '';
    const cat = meta?.cat ?? '';
    return { bare, cat, desc };
  });
  rows.sort((a, b) => (a.cat < b.cat ? -1 : a.cat > b.cat ? 1 : a.bare < b.bare ? -1 : 1));

  for (const r of rows) {
    picks.push({
      kind: 'tool',
      label: `◆ ${r.bare}`,
      description: [r.cat, r.desc].filter(Boolean).join(' · '),
      verb: 'invoke',
      tool: `nika:${r.bare}`,
    });
  }
  return picks;
}
