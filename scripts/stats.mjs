#!/usr/bin/env node
// stats.mjs — the market-signal watcher (post-publish · zero deps).
//
//   node scripts/stats.mjs
//
// Prints what the two registries report for supernovae.nika-lang:
// VS Marketplace installs + rating (gallery API) and Open VSX version +
// downloads. This is the first real feedback loop on the canvas wave —
// run it by hand or from a cron; it never mutates anything.

const EXT = 'supernovae.nika-lang';

async function vsMarketplace() {
  const res = await fetch(
    'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json;api-version=3.0-preview.1',
      },
      body: JSON.stringify({
        filters: [{ criteria: [{ filterType: 7, value: EXT }] }],
        // IncludeVersions | IncludeStatistics | IncludeLatestVersionOnly
        flags: 1 | 256 | 512,
      }),
    },
  );
  const data = await res.json();
  const ext = data.results?.[0]?.extensions?.[0];
  if (!ext) { return 'VS Marketplace · not indexed'; }
  const stat = (name) => ext.statistics?.find((s) => s.statisticName === name)?.value;
  const installs = stat('install');
  const rating = stat('averagerating');
  const ratings = stat('ratingcount');
  const parts = [
    `v${ext.versions?.[0]?.version ?? '?'}`,
    installs !== undefined ? `${installs} installs` : 'installs n/a',
  ];
  if (rating !== undefined) { parts.push(`★ ${rating.toFixed(2)} (${ratings ?? 0})`); }
  return `VS Marketplace · ${parts.join(' · ')}`;
}

async function openVsx() {
  const res = await fetch(`https://open-vsx.org/api/${EXT.replace('.', '/')}`);
  if (!res.ok) { return 'Open VSX · not indexed'; }
  const data = await res.json();
  const parts = [
    `v${data.version ?? '?'}`,
    `${data.downloadCount ?? 0} downloads`,
  ];
  if (data.averageRating != null) { parts.push(`★ ${data.averageRating.toFixed(2)} (${data.reviewCount ?? 0})`); }
  return `Open VSX      · ${parts.join(' · ')}`;
}

const results = await Promise.allSettled([vsMarketplace(), openVsx()]);
for (const r of results) {
  console.log(r.status === 'fulfilled' ? r.value : `error: ${r.reason?.message ?? r.reason}`);
}
