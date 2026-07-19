# See the DAG

![the live canvas: the plan as a graph, run state on every card](./assets/canvas-poster.png)

`tasks` form a graph of TYPED edges — a `with:` binding is a data edge
(the binding IS the edge), an `after:` entry is a control edge with its
predicate. The DAG panel renders it live:

- click a node → jump to its YAML
- re-renders on save
- same renderer as `nika inspect <file> --format mermaid` in your terminal

## One graph · five lenses

The canvas is a deck of projections over the same typed graph — one
key each, `Esc` always comes home:

- **X · what if?** — pick a task, press X: admission replays with it
  failed. Dead paths dim; the paths that exist *only because of
  failure* light up — why `on_error` exists, before any token is spent.
- **T · timeline** — the recorded run as a Gantt (real clocks · retry
  ladders · the ghost ceiling = your recorded mean behind each bar).
- **P · audit** — what this file CAN DO: capability hulls (network ·
  programs · files · tools) and the one-line banner, honest about
  UNBOUNDED cost floors.
- **D · dataflow** — the control scaffolding sleeps; the typed data
  wires and their bindings carry the whole story.
- **H · heatmap** — where the time went, as a toggle.

Press `?` on the canvas — it teaches every gesture, including these.

## Composition

A task that calls another workflow (`invoke: workflow: ./sub.nika.yaml`)
is a **door**: its card shows the child's shape (hover for the
miniature), its declared inputs as contract rows, and the ⎘ chip opens
the file — a breadcrumb trail brings you back up.
