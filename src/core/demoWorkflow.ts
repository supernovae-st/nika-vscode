// The demo sandbox — a runnable hello-canvas workflow that `nika.tryDemo`
// writes into the workspace (or tmp), then opens beside the canvas. Four
// waves on mock/echo: brief → two angles in parallel → weave → a receipt
// on disk. Zero key · zero network · nothing to spend (alignment Rule 6 ·
// sovereign by construction — the sandbox IS the first-run aha).
//
// The YAML below is validated `nika check` rc=0 against engine main
// (0.105.0) before shipping — an embedded workflow never lands unproven.
// The `${{ … }}` interpolations are escaped for the template literal
// (`\${{`); demoWorkflow.roundtrip.test verifies the emitted bytes.

import * as path from 'path';

/** The canonical filename the demo lands under (skip-if-exists suffixes). */
export const DEMO_WORKFLOW_FILE = 'hello-canvas.nika.yaml';

/** Where the demo lands: the open workspace root, or a scratch dir under
 *  the OS temp root when no folder is open (still a real file · file
 *  scheme · runnable · never an untitled buffer). Pure — the caller
 *  resolves a free name, makes the dir when `scratch`, and writes. */
export function demoTargetDir(
  workspaceRoot: string | undefined,
  tmpRoot: string,
): { dir: string; scratch: boolean } {
  return workspaceRoot === undefined
    ? { dir: path.join(tmpRoot, 'nika-demo'), scratch: true }
    : { dir: workspaceRoot, scratch: false };
}

/** The hello-canvas workflow · four waves · mock/echo · runs offline. */
export const DEMO_WORKFLOW = `# yaml-language-server: $schema=https://nika.sh/spec/v1/workflow.schema.json
#
# HELLO CANVAS · the demo sandbox — brief → two angles → weave → receipt.
# Four waves on mock/echo · zero key · zero network · nothing to spend.
# Press the play button on the canvas to watch it light up wave by wave.
nika: v1
workflow:
  id: hello-canvas
  description: "brief · two angles in parallel · weave · write a receipt"

model: mock/echo

vars:
  topic: "local-first AI"

tasks:
  brief:
    infer:
      max_tokens: 120
      prompt: |
        Write a one-line brief for a short post about \${{ vars.topic }}.

  angle_practical:
    with:
      brief: \${{ tasks.brief.output }}
    infer:
      max_tokens: 200
      prompt: |
        Take a practical angle on this brief:
        \${{ with.brief }}

  angle_skeptical:
    with:
      brief: \${{ tasks.brief.output }}
    infer:
      max_tokens: 200
      prompt: |
        Take a skeptical angle on this brief:
        \${{ with.brief }}

  weave:
    with:
      practical: \${{ tasks.angle_practical.output }}
      skeptical: \${{ tasks.angle_skeptical.output }}
    infer:
      max_tokens: 300
      prompt: |
        Weave these two angles into one balanced paragraph:
        \${{ with.practical }}
        \${{ with.skeptical }}

  receipt:
    with:
      post: \${{ tasks.weave.output }}
    exec:
      command: ["printf", "%s", "hello-canvas: the post is ready"]

  # break_me — uncomment to watch a red teach you the feed (the walkthrough's
  # "break it on purpose" step). A failing exec stops the run at this wave.
  # break_me:
  #   after: { receipt: succeeded }
  #   exec:
  #     command: ["false"]

outputs:
  post: \${{ tasks.weave.output }}
`;
