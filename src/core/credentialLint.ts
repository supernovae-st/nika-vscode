// credentialLint.ts — literal-credential lint for workflow YAML (pure · local).
//
// The engine's IFC analysis (check --json) proves where DECLARED secrets
// flow; this complements it on the other side: credentials pasted as
// LITERALS never even reach the masking boundary. Pure pattern scan,
// zero network, zero telemetry — findings carry a `${{ env.VAR }}`
// rewrite suggestion (the sovereign form).

export interface SecretFinding {
  line: number;       // 0-based
  startCol: number;   // 0-based, UTF-16 units
  endCol: number;
  kind: string;       // e.g. "anthropic-api-key"
  /** Suggested env var name, derived from the YAML key when present. */
  envVar: string;
}

interface SecretPattern {
  kind: string;
  re: RegExp;
  defaultEnv: string;
}

// Shapes chosen for precision over recall — a linter that cries wolf gets
// disabled. Each pattern anchors on a vendor-stable prefix; the lookbehind
// rejects prefixes embedded in longer words ("risk-…" must not read as
// an sk- key, "lighp_…" must not read as a GitHub token).
const B = '(?<![A-Za-z0-9_-])';
const PATTERNS: SecretPattern[] = [
  { kind: 'anthropic-api-key', re: new RegExp(`${B}sk-ant-[A-Za-z0-9_-]{20,}`, 'g'), defaultEnv: 'ANTHROPIC_API_KEY' },
  { kind: 'openai-api-key', re: new RegExp(`${B}(?:sk-proj-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{32,})`, 'g'), defaultEnv: 'OPENAI_API_KEY' },
  { kind: 'github-token', re: new RegExp(`${B}gh[pousr]_[A-Za-z0-9]{30,}`, 'g'), defaultEnv: 'GITHUB_TOKEN' },
  { kind: 'aws-access-key-id', re: new RegExp(`${B}AKIA[0-9A-Z]{16}`, 'g'), defaultEnv: 'AWS_ACCESS_KEY_ID' },
  { kind: 'google-api-key', re: new RegExp(`${B}AIza[0-9A-Za-z_-]{35}`, 'g'), defaultEnv: 'GOOGLE_API_KEY' },
  { kind: 'slack-token', re: new RegExp(`${B}xox[baprs]-[A-Za-z0-9-]{10,}`, 'g'), defaultEnv: 'SLACK_TOKEN' },
  { kind: 'private-key-block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, defaultEnv: 'PRIVATE_KEY' },
];

const YAML_KEY_RE = /^\s*(?:-\s+)?([A-Za-z0-9_-]+)\s*:/;

function envVarFromKey(lineText: string, fallback: string): string {
  const m = lineText.match(YAML_KEY_RE);
  if (!m) { return fallback; }
  const name = m[1].replace(/-/g, '_').toUpperCase();
  // A generic key like "value" or "args" names nothing — keep the vendor default.
  return name.length >= 3 && !['VALUE', 'ARGS', 'WITH', 'ENV'].includes(name)
    ? name
    : fallback;
}

export function scanSecrets(text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    // Comments and already-templated lines are not literals.
    if (trimmed.startsWith('#')) { continue; }
    if (line.includes('${{')) { continue; }

    for (const p of PATTERNS) {
      p.re.lastIndex = 0;
      for (const m of line.matchAll(p.re)) {
        const start = m.index ?? 0;
        findings.push({
          line: i,
          startCol: start,
          endCol: start + m[0].length,
          kind: p.kind,
          envVar: envVarFromKey(line, p.defaultEnv),
        });
      }
    }
  }
  return findings;
}
