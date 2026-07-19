import {
  TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
  EventEmitter,
  Event,
  workspace,
  Uri,
  ThemeIcon,
  ThemeColor,
  MarkdownString,
  Command,
} from 'vscode';
import * as fs from 'fs';
import { parseWorkflowTasks } from './workflowParser';
import { NIKA_VERB_CODICON, type NikaVerbName } from './design-tokens.generated';

/** Cached-check reader — wired to NikaService.peekCheck (zero spawns). */
export type BadgeReader = (uriString: string) => CheckBadge;

type WorkflowItem = WorkflowFileItem | WorkflowTaskItem;

/** Check verdict for the file badge (derived from the cached report). */
export type CheckBadge = { kind: 'clean' } | { kind: 'findings'; count: number } | undefined;

class WorkflowFileItem extends TreeItem {
  constructor(
    public readonly uri: Uri,
    public readonly tasks: { id: string; line: number; verb: string }[],
    badge: CheckBadge,
  ) {
    super(
      uri.path.split('/').pop() ?? uri.fsPath,
      tasks.length > 0
        ? TreeItemCollapsibleState.Expanded
        : TreeItemCollapsibleState.None,
    );
    this.resourceUri = uri;
    this.iconPath = badge?.kind === 'clean'
      ? new ThemeIcon('pass-filled', new ThemeColor('testing.iconPassed'))
      : badge?.kind === 'findings'
        ? new ThemeIcon('warning', new ThemeColor('list.warningForeground'))
        : new ThemeIcon('file');
    this.contextValue = 'workflowFile';
    const taskPart = `${tasks.length} task${tasks.length !== 1 ? 's' : ''}`;
    this.description = badge?.kind === 'findings'
      ? `${taskPart} · ${badge.count} finding${badge.count !== 1 ? 's' : ''}`
      : taskPart;

    const verbs = new Map<string, number>();
    for (const t of tasks) { verbs.set(t.verb, (verbs.get(t.verb) ?? 0) + 1); }
    const md = new MarkdownString(undefined, true);
    md.appendMarkdown(`**${uri.path.split('/').pop()}**\n\n`);
    md.appendMarkdown(`${taskPart}`);
    if (verbs.size > 0) {
      md.appendMarkdown(` — ${[...verbs.entries()].map(([v, n]) => `${n}× \`${v}\``).join(' · ')}`);
    }
    md.appendMarkdown('\n\n');
    if (badge?.kind === 'clean') {
      md.appendMarkdown('$(pass-filled) `nika check` — clean\n\n');
    } else if (badge?.kind === 'findings') {
      md.appendMarkdown(`$(warning) \`nika check\` — ${badge.count} finding${badge.count !== 1 ? 's' : ''}\n\n`);
    }
    md.appendMarkdown(`_${uri.fsPath}_`);
    this.tooltip = md;
    this.command = {
      command: 'vscode.open',
      title: 'Open Workflow',
      arguments: [uri],
    };
  }
}

class WorkflowTaskItem extends TreeItem {
  constructor(
    public readonly taskId: string,
    public readonly uri: Uri,
    public readonly line: number,
    public readonly verb: string,
  ) {
    super(taskId, TreeItemCollapsibleState.None);
    this.iconPath = WorkflowTaskItem.verbIcon(verb);
    this.contextValue = 'workflowTask';
    this.description = verb;
    this.tooltip = `${taskId} (${verb}) — line ${line + 1}`;
    this.command = {
      command: 'nika.openTaskLocation',
      title: 'Go to Task',
      arguments: [uri, line],
    } as Command;
  }

  /** Codicon + canonical hue, both from the design SSOT — the tree
   *  carries the same verb band as the canvas and the gutter. */
  private static verbIcon(verb: string): ThemeIcon {
    if (verb in NIKA_VERB_CODICON) {
      const known = verb as NikaVerbName;
      return new ThemeIcon(NIKA_VERB_CODICON[known], new ThemeColor(`nika.verb.${known}`));
    }
    return new ThemeIcon('circle-outline');
  }
}

export class WorkflowTreeProvider implements TreeDataProvider<WorkflowItem> {
  private _onDidChangeTreeData = new EventEmitter<WorkflowItem | undefined | void>();
  readonly onDidChangeTreeData: Event<WorkflowItem | undefined | void> =
    this._onDidChangeTreeData.event;

  constructor(private readonly badgeOf?: BadgeReader) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: WorkflowItem): TreeItem {
    return element;
  }

  async getChildren(element?: WorkflowItem): Promise<WorkflowItem[]> {
    if (!element) {
      // Root: list all .nika.yaml files
      const files = await workspace.findFiles('**/*.nika.yaml', '**/node_modules/**', 100);
      files.sort((a, b) => a.fsPath.localeCompare(b.fsPath));

      return files.map((uri) => {
        const badge = this.badgeOf?.(uri.toString());
        try {
          const content = fs.readFileSync(uri.fsPath, 'utf-8');
          const tasks = parseWorkflowTasks(content);
          return new WorkflowFileItem(uri, tasks, badge);
        } catch {
          return new WorkflowFileItem(uri, [], badge);
        }
      });
    }

    if (element instanceof WorkflowFileItem) {
      return element.tasks.map(
        (t) => new WorkflowTaskItem(t.id, element.uri, t.line, t.verb),
      );
    }

    return [];
  }
}
