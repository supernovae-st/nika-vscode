# icons/ · vendored from the Nika brand kit

Source of truth: the Nika brand kit, published at
[nika.sh/brand](https://nika.sh/brand/nika-logo-dark.svg) (usage doc:
[`BRAND.md`](https://github.com/supernovae-st/nika.sh/blob/main/BRAND.md)).
Paths here are pinned by `package.json` and `src/dagPanel.ts` — sync contents,
never rename.

| File | Kit source | Used by |
|---|---|---|
| `nika-icon.png` | `nika-tile-256.png` | `package.json#icon` — the Marketplace/OpenVSX tile |
| `nika-icon.svg` | `nika-tile.svg` | reference copy of the tile |
| `nika-dark.svg` | `nika-glyph-16` inked glow `#cfe6ff` | activity bar · language icon (dark themes) · DAG panel tab |
| `nika-light.svg` | `nika-glyph-16` inked ink `#04050d` | language icon (light themes) · DAG panel tab |
| — (path data) | the ontology's 4 verb glyphs | `src/webview/verbGlyphs.ts` — keycap · cmdk · palette (safe-DOM · sync from [nika.sh/brand/icons](https://nika.sh/brand/icons.json)) |

The glyph (not the full mark) drives every ≤24 px surface: the full
butterfly-supernova doesn't survive 16 px, so tabs/explorer/activity-bar use
the hand-traced teardrop glyph. The full mark lives only in the tile.

Editor file/folder icon themes (Material · vscode-icons · Seti): see
[`contrib/`](../contrib/README.md).
