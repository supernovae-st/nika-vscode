// extractModes.ts — the fetch modes' teaching register.
//
// The MODE LIST is engine truth (embedded canon via schemaIntel — the
// completion never invents a mode the binary refuses). What the canon
// list cannot carry is the TEACHING: what each mode returns and when
// to reach for it. That knowledge is spec SSOT
// (nika-spec stdlib/extract-modes-v0.1.md — 9 canonical + raw) and is
// mirrored here as facts keyed by mode name; an engine mode this
// register does not know still completes, bare (list = engine ·
// teaching = spec · neither invents for the other).

export interface ExtractModeFact {
  /** What lands downstream (`${{ tasks.x.output }}` shape). */
  output: string;
  /** When to reach for it — one line, the spec table's voice. */
  use: string;
}

/** Canonical order = the spec table's order (markdown leads: the
 *  content-scraping default). Completion ranking follows it. */
export const EXTRACT_MODE_FACTS: ReadonlyMap<string, ExtractModeFact> = new Map([
  ['markdown', { output: 'string · Markdown', use: 'LLM input — article content stripped of nav/ads' }],
  ['article', { output: 'string · Markdown (Readability)', use: 'news and blog articles' }],
  ['text', { output: 'string · plain text', use: 'all HTML stripped, headers/footers preserved' }],
  ['selector', { output: 'string · raw HTML', use: 'one specific element via a CSS selector' }],
  ['jq', { output: 'JSON value', use: 'API responses — structured data via a jq expression' }],
  ['metadata', { output: 'object', use: '<meta> tags · OpenGraph · Twitter cards' }],
  ['links', { output: 'array of strings', use: 'every outbound <a href> link' }],
  ['feed', { output: 'object · parsed feed', use: 'RSS · Atom · JSON Feed' }],
  ['sitemap', { output: 'array of URLs', use: 'sitemap.xml and sitemap indexes' }],
  ['raw', { output: 'string · UTF-8 body', use: 'no extraction — text only (binary is file-mediated)' }],
]);

/** Sort key: spec order for known modes, engine order after. */
export function extractModeRank(mode: string): number {
  const i = [...EXTRACT_MODE_FACTS.keys()].indexOf(mode);
  return i === -1 ? EXTRACT_MODE_FACTS.size : i;
}
