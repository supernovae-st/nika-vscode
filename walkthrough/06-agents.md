# Make your AI an expert

`Nika: Setup MCP + Agent Rules` (or `nika init` in a terminal) wires:

- **`.cursor/rules/nika.mdc`** · Cursor writes valid Nika instantly
- **`AGENTS.md`** · any agent (Claude, Codex…) gets the canon
- **MCP** · your agent can *run* workflows, not just write them

The full loop, without leaving the editor:
your agent **writes** a workflow → **checks** it (`nika check`) →
**runs** it (MCP) → **explains** failures (`nika explain NIKA-XXXX`).
