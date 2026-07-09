# contrib/ · Nika icons for file-icon themes

`*.nika.yaml` files and `.nika/` folders (the engine's flight-recorder home)
deserve the butterfly in YOUR file tree. VS Code has **no extension API for
per-file/folder icons** — those belong to the active *file icon theme* — so
this directory ships ready-made artwork + the wiring for the three big themes.
The glyph is the brand kit's 16 px teardrop mark
([nika.sh/brand](https://nika.sh/brand/nika-glyph-16.svg)).

## Seti (VS Code's default) — nothing to do

This extension already contributes a **language icon** (`contributes.languages[].icon`),
so `*.nika.yaml` shows the butterfly in any theme that honors language default
icons (Seti does since VS Code 1.65). Folder icons are not part of that API.

## Material Icon Theme — today, via settings

Until the upstream icons land, map the `.nika` folder to Material's existing
`flow` folder (semantically right — the folder holds workflow traces):

```jsonc
// settings.json
"material-icon-theme.folders.associations": {
  ".nika": "flow"
}
```

`*.nika.yaml` keeps Material's YAML icon until the upstream PR merges.

## Material Icon Theme — the upstream contribution (ready to submit)

`material-icon-theme/` follows their CONTRIBUTING spec (16×16 viewBox ·
Material palette only · folder = `id="folder"` canonical path + `id="motive"` ·
closed variant only, open is auto-generated):

| File | Palette |
|---|---|
| `nika.svg` (file icon) | blue-200 `#90caf9` strokes |
| `folder-nika.svg` | folder blue-700 `#1976d2` · motive blue-100 `#bbdefb` |

Associations to add in their `src/core/icons/`:

```ts
// fileIcons.ts
{ name: 'nika', fileExtensions: ['nika.yaml', 'nika.yml'] },

// folderIcons.ts
{ name: 'nika', folderNames: ['.nika'] },
```

## vscode-icons — today, via custom icons

vscode-icons supports user-provided icons. Copy `vscode-icons/*.svg`
(`file_type_nika.svg` · `folder_type_nika.svg` · `folder_type_nika_opened.svg`)
into `<customIconFolderPath>/vsicons-custom-icons/`, then:

```jsonc
// settings.json
"vsicons.customIconFolderPath": "~/.config",
"vsicons.associations.files": [
  { "icon": "nika", "extensions": ["nika.yaml", "nika.yml"], "format": "svg" }
],
"vsicons.associations.folders": [
  { "icon": "nika", "extensions": [".nika"], "format": "svg" }
]
```

Then run `vscode-icons: Apply Icons Customization` from the command palette.

---

This directory is excluded from the packaged `.vsix` (`.vscodeignore`) — it
exists for humans and upstream PRs, not the runtime.
