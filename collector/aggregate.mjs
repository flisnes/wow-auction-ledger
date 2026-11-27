// Combines the snapshots of each completed UTC day into
// <data>/daily/<region>/<YYYY-MM-DD>.json.gz with, per house and item,
// [minUnit, medianOfMedians, meanQuantity, samples]. Days that already have a
// file are skipped unless --force is given. Today is skipped as incomplete.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { gunzipSync, gzipSync } from 'node:zlib';
import { median } from './lib/stats.mjs';

const { values: args } = parseArgs({
  options: {
    region: { type: 'string', default: 'eu' },
    snapshots: { type: 'string', default: 'snapshots' },
    data: { type: 'string', default: 'data' },
    force: { type: 'boolean', default: false },
  },
});

const today = new Date().toISOString().slice(0, 10);
const byDay = new Map();
const files = existsSync(args.snapshots)
  ? readdirSync(args.snapshots, { recursive: true }).filter((f) => f.endsWith('.json.gz'))
  : [];

for (const f of files) {
  const snap = JSON.parse(gunzipSync(readFileSync(join(args.snapshots, f))));
  if (snap.region !== args.region) continue;
  const day = snap.ts.slice(0, 10);
  if (day >= today) continue;
  if (!byDay.has(day)) byDay.set(day, []);
  byDay.get(day).push(snap);
}

const outDir = join(args.data, 'daily', args.region);
mkdirSync(outDir, { recursive: true });

for (const [day, snaps] of [...byDay].sort()) {
  const file = join(outDir, `${day}.json.gz`);
  if (existsSync(file) && !args.force) continue;
  writeFileSync(file, gzipSync(JSON.stringify(aggregateDay(day, snaps))));
  console.log(`${day}: ${snaps.length} snapshots -> ${file}`);
}

function aggregateDay(day, snaps) {
  const collected = {};
  for (const snap of snaps) {
    for (const [houseId, house] of Object.entries(snap.houses)) {
      const dst = (collected[houseId] ??= { name: house.name, items: {} });
      for (const [itemId, entry] of Object.entries(house.items)) {
        (dst.items[itemId] ??= []).push(entry);
      }
    }
  }

  const houses = {};
  for (const [houseId, house] of Object.entries(collected)) {
    const items = {};
    for (const [itemId, entries] of Object.entries(house.items)) {
      const mins = entries.map((e) => e[0]);
      const qty = entries.reduce((sum, e) => sum + e[2], 0) / entries.length;
      items[itemId] = [Math.min(...mins), median(entries.map((e) => e[1])), Math.round(qty), entries.length];
    }
    houses[houseId] = { name: house.name, items };
  }
  return { date: day, region: args.region, snapshots: snaps.length, houses };
}
