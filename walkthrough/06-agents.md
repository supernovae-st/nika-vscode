# Make your AI an expert

`Nika: Setup MCP + Agent Rules` runs the non-destructive repo scaffold
(`nika init`) when your binary supports it, then wires MCP for the current
editor. In a terminal, the same explicit flow is `nika init` followed by
`nika wire <client>`.

- **`.cursor/rules/nika.mdc`** · Cursor writes valid Nika instantly
- **`AGENTS.md`** · any agent (Claude, Codex…) gets the canon
- **MCP** · your agent can check workflows and explain failures through the
  real engine oracle

The full loop, without leaving the editor:
your agent **writes** a workflow → **checks** it (`nika check`) →
**runs** it (`nika run`) → **explains** failures (`nika explain NIKA-XXXX`).
