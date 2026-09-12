// Refuse a legacy redirect while either canonical listing is absent or stale.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const canonicalTag = 'v' + version;
execFileSync('git', ['rev-parse', '--verify', canonicalTag + '^{commit}'], { stdio: 'pipe' });
const allowed = new Set(['.github/workflows/legacy-release.yml', 'scripts/check-canonical-listings.mjs', 'scripts/prepare-legacy-release.mjs', 'PUBLISHING.md', 'scripts/release-proof.test.mjs']);
const changed = execFileSync('git', ['diff', '--name-only', canonicalTag, 'HEAD'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
assert(changed.every(path => allowed.has(path)), 'Legacy source must retain the canonical tagged code and manifest');
const open = await fetch('https://open-vsx.org/api/supernovae/nika/' + version);
assert.equal(open.status, 200, 'Canonical Open VSX version must be public');
const ovsx = await open.json();
assert.equal(ovsx.namespace, 'supernovae');
assert.equal(ovsx.name, 'nika');
assert.equal(ovsx.version, version);
const market = await fetch('https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery?api-version=7.2-preview.1', {
  method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json;api-version=7.2-preview.1' },
  body: JSON.stringify({ filters: [{ criteria: [{ filterType: 7, value: 'supernovae.nika' }] }], flags: 1 })
});
assert.equal(market.status, 200, 'Marketplace query must succeed');
const result = await market.json();
const extension = result.results?.[0]?.extensions?.find(e => e.publisher?.publisherName === 'supernovae' && e.extensionName === 'nika');
assert(extension?.versions?.some(v => v.version === version), 'Canonical Marketplace version must be public');
console.log('Both canonical listings contain supernovae.nika@' + version);
