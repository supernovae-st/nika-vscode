# See the DAG

![the live canvas: the plan as a graph, run state on every card](./assets/canvas-poster.png)

The model, in two lines: `tasks` form a graph of TYPED edges · a `with:`
binding is a data edge (the binding IS the edge) · an `after:` entry is
a control edge carrying its predicate.

The DAG panel renders that graph live: click a node to jump to its
YAML, every save re-renders, and the terminal twin is
`nika inspect <file> --format mermaid`.

## One graph · five lenses

The canvas is a deck of projections over the same typed graph · one
key each, `Esc` always comes home:

| key | lens | what it renders |
|---|---|---|
| `X` | what if? | pick a task, press `X`: the run rules replay with it failed · dead paths dim, the paths that exist *only because of failure* light up (why `on_error` exists) |
| `T` | timeline | the recorded run as a Gantt: real clocks · retry ladders · the ghost ceiling (your recorded mean) behind each bar |
| `P` | audit | what this file CAN DO: capability hulls (network · programs · files · tools) and the one-line banner, honest about UNBOUNDED cost floors |
| `D` | dataflow | the control scaffolding sleeps · the typed data wires and their bindings carry the whole story |
| `H` | heatmap | where the time went, as a toggle |

Press `?` on the canvas: it teaches every gesture, including these.

## Composition

A task that calls another workflow (`invoke: workflow: ./sub.nika.yaml`)
is a **door**: its card shows the child's shape (hover peeks the
miniature) and its declared inputs as contract rows · the ⎘ chip opens
the file, and a breadcrumb trail brings you back up.
