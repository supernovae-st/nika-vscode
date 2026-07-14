# See the DAG

![the live canvas: the plan as a graph, run state on every card](./assets/canvas-poster.png)

`tasks` form a graph of TYPED edges — a `with:` binding is a data edge
(the binding IS the edge), an `after:` entry is a control edge with its
predicate. The DAG panel renders it live:

- click a node → jump to its YAML
- re-renders on save
- same renderer as `nika inspect <file> --format mermaid` in your terminal
