import { describe, expect, it } from 'vitest';
import { extractArtifactsFromOutput, extractRunArtifacts, humanBytes } from '../core/artifacts';

// Real v0.94 output shapes (engine audit · image/mod.rs + tts/mod.rs).
const IMAGE_OUTPUT = JSON.stringify({
  provider: 'openai', model: 'gpt-image-1', mode: 'generate', prompt: 'a fox',
  count: 2,
  images: [
    { index: 0, path: 'assets/fox-openai-gptimage1-0-a1b2c3d4.png', mime_type: 'image/png', width: 1024, height: 1024, size_bytes: 412000, sha256: 'aa', provider: 'openai', model: 'gpt-image-1' },
    { index: 1, path: 'assets/fox-openai-gptimage1-1-e5f6a7b8.png', mime_type: 'image/png', size_bytes: 398000 },
  ],
  cost_usd: 0.08,
  manifest_path: 'assets/fox.manifest.json',
  output_dir: 'assets',
});

const TTS_OUTPUT = JSON.stringify({
  provider: 'elevenlabs', model: 'eleven_v3', voice: 'ana',
  audio: { path: 'out/hello-elevenlabs.mp3', format: 'mp3', duration_ms: 4200 },
  manifest_path: 'out/hello.manifest.json',
});

const ev = (kind: string, task: string, output?: string): string => JSON.stringify({
  id: { uuid: 'x' }, timestamp: 1, kind, run: null, correlation: null,
  fields: [
    { key: 'task', value: task },
    ...(output !== undefined ? [{ key: 'output', value: output }] : []),
    { key: 'note', value: 'invoke · nika:image_generate' },
  ],
});

describe('extractArtifactsFromOutput', () => {
  it('image_generate: per-image facts + provenance + manifest', () => {
    const a = extractArtifactsFromOutput('render', IMAGE_OUTPUT);
    expect(a).toHaveLength(3);
    expect(a[0]).toMatchObject({
      taskId: 'render', kind: 'image', mime: 'image/png',
      bytes: 412000, provider: 'openai', model: 'gpt-image-1', label: 'image 1/2',
    });
    expect(a[2]).toMatchObject({ kind: 'file', label: 'manifest' });
  });

  it('tts_generate: audio with duration + provenance from the top level', () => {
    const a = extractArtifactsFromOutput('speak', TTS_OUTPUT);
    expect(a[0]).toMatchObject({
      kind: 'audio', durationMs: 4200, provider: 'elevenlabs', model: 'eleven_v3',
    });
  });

  it('generic path output and bare-string paths count; prose does not', () => {
    expect(extractArtifactsFromOutput('w', '{"path":"report/summary.md"}')[0])
      .toMatchObject({ kind: 'file', path: 'report/summary.md' });
    expect(extractArtifactsFromOutput('w', '"shot.png"')[0]).toMatchObject({ kind: 'image' });
    expect(extractArtifactsFromOutput('w', '"a plain sentence about png files"')).toEqual([]);
    expect(extractArtifactsFromOutput('w', '{"title":"no artifacts here"}')).toEqual([]);
  });

  it('never throws on malformed JSON', () => {
    expect(extractArtifactsFromOutput('x', '{broken')).toEqual([]);
  });
});

describe('extractRunArtifacts', () => {
  it('scans the trace, keyed by task, cache-hit deduped', () => {
    const trace = [
      ev('task_started', 'render'),
      ev('task_completed', 'render', IMAGE_OUTPUT),
      ev('task_completed', 'speak', TTS_OUTPUT),
      ev('task_cache_hit', 'render', IMAGE_OUTPUT), // same recorded output — no dupes
      ev('task_completed', 'plain', '{"value": 42}'),
      '{corrupt line',
    ].join('\n');
    const m = extractRunArtifacts(trace);
    expect(m.get('render')).toHaveLength(3);
    expect(m.get('speak')).toHaveLength(2);
    expect(m.has('plain')).toBe(false);
  });
});

describe('humanBytes', () => {
  it('rounds like a list row', () => {
    expect(humanBytes(412000)).toBe('402 KB');
    expect(humanBytes(1400000)).toBe('1.3 MB');
    expect(humanBytes(90)).toBe('90 B');
  });
});
