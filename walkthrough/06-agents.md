# Make your AI an expert

`Nika: Setup MCP + Agent Rules` wires the current editor. In a terminal,
`nika init` scaffolds repo-local schema + agent rules, and `nika wire <client>`
wires MCP clients explicitly.

- **`.cursor/rules/nika.mdc`** · Cursor writes valid Nika instantly
- **`AGENTS.md`** · any agent (Claude, Codex…) gets the canon
- **MCP** · your agent can check workflows and explain failures through the
  real engine oracle

The full loop, without leaving the editor:
your agent **writes** a workflow → **checks** it (`nika check`) →
**runs** it (`nika run`) → **explains** failures (`nika explain NIKA-XXXX`).
