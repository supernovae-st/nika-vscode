// artifacts.ts — media/file outputs recovered from a trace (pure · no vscode).
//
// The engine's media plane (v0.94 · image_generate/tts_generate) is
// assets-not-blobs: outputs carry PATHS, never bytes. The fold keeps only
// a one-line outputPreview — so artifacts are extracted from the RAW
// NDJSON (task_completed/task_cache_hit `output` fields), memory-light:
// only the artifact-shaped bits survive, the rest of the payload is
// dropped. Provenance rides along (producing task · provider · model) —
// the link nobody ships (media ↔ step ↔ origin).

export interface RunArtifact {
  taskId: string;
  path: string;
  kind: 'image' | 'audio' | 'file';
  mime?: string;
  bytes?: number;
  provider?: string;
  model?: string;
  /** Audio only — recorded duration. */
  durationMs?: number;
  /** Short role label (`manifest` · `image 1/4` · …) for list rows. */
  label?: string;
}

// svg is first-class: `nika:chart` writes byte-identical SVG artifacts
// (its `out` contract) — without it the flagship media builtin classed
// as `file` and never previewed (caught by the real-binary e2e).
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|svg)$/i;
const AUDIO_EXT = /\.(wav|mp3|flac|ogg|opus|m4a)$/i;

function kindOfPath(p: string): RunArtifact['kind'] {
  if (IMAGE_EXT.test(p)) { return 'image'; }
  if (AUDIO_EXT.test(p)) { return 'audio'; }
  return 'file';
}

const asStr = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;
const asNum = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/** Artifacts inside ONE task's recorded output (JSON text or bare string). */
export function extractArtifactsFromOutput(taskId: string, output: string): RunArtifact[] {
  const out: RunArtifact[] = [];
  const seen = new Set<string>();
  const push = (a: RunArtifact): void => {
    if (!a.path || seen.has(a.path)) { return; }
    seen.add(a.path);
    out.push(a);
  };

  let v: unknown;
  try {
    v = JSON.parse(output);
  } catch {
    // A bare-string output that IS a path (write/file builtins) still counts.
    const line = output.trim();
    if (/^\S+\.[A-Za-z0-9]{2,5}$/.test(line) && (IMAGE_EXT.test(line) || AUDIO_EXT.test(line))) {
      push({ taskId, path: line, kind: kindOfPath(line) });
    }
    return out;
  }
  if (typeof v === 'string') {
    if (IMAGE_EXT.test(v) || AUDIO_EXT.test(v)) { push({ taskId, path: v, kind: kindOfPath(v) }); }
    return out;
  }
  if (typeof v !== 'object' || v === null) { return out; }
  const obj = v as Record<string, unknown>;
  const topProvider = asStr(obj.provider);
  const topModel = asStr(obj.model);

  // image_generate: images[] with per-entry facts.
  if (Array.isArray(obj.images)) {
    const total = obj.images.length;
    obj.images.forEach((entry, i) => {
      if (typeof entry !== 'object' || entry === null) { return; }
      const img = entry as Record<string, unknown>;
      const p = asStr(img.path);
      if (!p) { return; }
      push({
        taskId,
        path: p,
        kind: 'image',
        mime: asStr(img.mime_type),
        bytes: asNum(img.size_bytes),
        provider: asStr(img.provider) ?? topProvider,
        model: asStr(img.model) ?? topModel,
        label: total > 1 ? `image ${i + 1}/${total}` : 'image',
      });
    });
  }

  // tts_generate: audio{ path · format · duration_ms }.
  if (typeof obj.audio === 'object' && obj.audio !== null) {
    const audio = obj.audio as Record<string, unknown>;
    const p = asStr(audio.path);
    if (p) {
      push({
        taskId,
        path: p,
        kind: 'audio',
        bytes: asNum(audio.size_bytes),
        durationMs: asNum(audio.duration_ms),
        provider: topProvider,
        model: topModel,
        label: 'audio',
      });
    }
  }

  // Provenance sidecar — openable, labeled for what it is.
  const manifest = asStr(obj.manifest_path);
  if (manifest) {
    push({ taskId, path: manifest, kind: 'file', provider: topProvider, model: topModel, label: 'manifest' });
  }

  // Generic single-file outputs (`{ path: … }` from file builtins).
  const generic = asStr(obj.path);
  if (generic && /[/.]/.test(generic)) {
    push({ taskId, path: generic, kind: kindOfPath(generic) });
  }

  return out;
}

/**
 * Scan a whole trace: every task_completed / task_cache_hit output is
 * inspected, artifact bits kept, everything else dropped. Corrupt lines
 * never throw — the flight recorder outlives crashes.
 */
export function extractRunArtifacts(ndjson: string): Map<string, RunArtifact[]> {
  const byTask = new Map<string, RunArtifact[]>();
  for (const raw of ndjson.split('\n')) {
    const line = raw.trim();
    if (line.length === 0) { continue; }
    let ev: unknown;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof ev !== 'object' || ev === null) { continue; }
    const e = ev as Record<string, unknown>;
    if (e.kind !== 'task_completed' && e.kind !== 'task_cache_hit') { continue; }
    if (!Array.isArray(e.fields)) { continue; }
    let task: string | undefined;
    let output: string | undefined;
    for (const f of e.fields as unknown[]) {
      if (typeof f !== 'object' || f === null) { continue; }
      const kv = f as Record<string, unknown>;
      if (kv.key === 'task' && typeof kv.value === 'string') { task = kv.value; }
      if (kv.key === 'output' && typeof kv.value === 'string') { output = kv.value; }
    }
    if (!task || !output) { continue; }
    const found = extractArtifactsFromOutput(task, output);
    if (found.length === 0) { continue; }
    const list = byTask.get(task) ?? [];
    // Cache-hit replays the same recorded output — dedupe on path.
    const known = new Set(list.map((a) => a.path));
    for (const a of found) { if (!known.has(a.path)) { list.push(a); } }
    byTask.set(task, list);
  }
  return byTask;
}

/** The ONE preview a card carries (pure pick + label — the caller
 *  resolves the path to disk and mints the webview URI). */
export interface CardArtifactPick {
  kind: 'image' | 'audio' | 'file';
  /** As recorded in the trace (relative or absolute). */
  path: string;
  name: string;
  tip?: string;
  /** Siblings of the same kind this task recorded (label `1/N`). */
  count?: number;
  durationMs?: number;
}

/** Basename without any directory walk (pure — no path module). */
const baseNameOf = (p: string): string => p.split(/[\\/]/).pop() ?? p;

/**
 * Pick a task's card preview from its recorded artifacts: the first
 * image, else the first audio — a card is a card, not a gallery.
 */
export function pickCardArtifact(list: RunArtifact[]): CardArtifactPick | undefined {
  const pick = list.find((a) => a.kind === 'image')
    ?? list.find((a) => a.kind === 'audio')
    ?? list.find((a) => a.kind === 'file');
  if (!pick) { return undefined; }
  const siblings = list.filter((a) => a.kind === pick.kind).length;
  const facts = [
    pick.provider && pick.model ? `${pick.provider}/${pick.model}` : pick.provider ?? pick.model,
    pick.bytes !== undefined ? humanBytes(pick.bytes) : undefined,
    pick.durationMs !== undefined ? `${(pick.durationMs / 1000).toFixed(1)}s` : undefined,
  ].filter((s): s is string => Boolean(s));
  return {
    kind: pick.kind,
    path: pick.path,
    name: baseNameOf(pick.path),
    tip: facts.length > 0 ? facts.join(' · ') : undefined,
    count: siblings > 1 ? siblings : undefined,
    durationMs: pick.durationMs,
  };
}

/** `412 KB` · `1.3 MB` — list-row size chip. */
export function humanBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) { return `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
  if (bytes >= 1024) { return `${Math.round(bytes / 1024)} KB`; }
  return `${bytes} B`;
}
