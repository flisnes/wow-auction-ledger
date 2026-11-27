// Combines the scans (lib/scan.mjs) of each completed UTC day into
// <data>/daily/<region>/<YYYY-MM-DD>.json.gz with, per house and item,
// [minUnit, medianOfMedians, meanQuantity, samples, medianOfMins].
// Each scan is first reduced to [minUnit, medianUnit, quantity] per item
// (lib/stats.mjs). medianOfMins is the typical lowest listing, comparable
// with the lowest buyout of a live scan. A scan whose houses all have the
// same Last-Modified times as an earlier scan of the day repeats the same API
// data (for example a manual run shortly after a scheduled one) and is
// skipped. Days that already have a file are
// skipped unless --force is given. Today is skipped as incomplete.
// Daily files older than the retention window are deleted.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { gunzipSync, gzipSync } from 'node:zlib';
import { oldestKeptDay, utcToday } from './lib/retention.mjs';
import { FORMAT, decodeHouse } from './lib/scan.mjs';
import { median, summarizeAuctions } from './lib/stats.mjs';

const { values: args } = parseArgs({
  options: {
    region: { type: 'string', default: 'eu' },
    scans: { type: 'string', default: 'scans' },
    data: { type: 'string', default: 'data' },
    force: { type: 'boolean', default: false },
  },
});

const today = utcToday();
const oldest = oldestKeptDay();
const outDir = join(args.data, 'daily', args.region);
const byDay = new Map();
const scanName = new RegExp(String.raw`^scan-${args.region}-(\d{4})(\d{2})(\d{2})T\d{4}Z\.json\.gz$`);
const files = existsSync(args.scans) ? readdirSync(args.scans, { recursive: true }) : [];

for (const f of files) {
  const match = scanName.exec(basename(f));
  if (!match) continue;
  const day = `${match[1]}-${match[2]}-${match[3]}`;
  if (day >= today || day < oldest) continue;
  if (existsSync(join(outDir, `${day}.json.gz`)) && !args.force) continue;
  if (!byDay.has(day)) byDay.set(day, []);
  byDay.get(day).push(join(args.scans, f));
}

mkdirSync(outDir, { recursive: true });

// One day at a time: a backfill covers about 350 scans, too many to hold reduced in memory.
for (const [day, paths] of [...byDay].sort()) {
  const snaps = [];
  const seen = new Set();
  for (const path of paths.sort()) {
    const scan = JSON.parse(gunzipSync(readFileSync(path)));
    if (scan.format !== FORMAT) throw new Error(`${path}: unsupported scan format ${scan.format}`);
    const key = dataVersion(scan);
    if (key && seen.has(key)) {
      console.log(`${basename(path)}: same API data as an earlier scan, skipped`);
      continue;
    }
    if (key) seen.add(key);
    snaps.push(reduceScan(scan));
  }
  const file = join(outDir, `${day}.json.gz`);
  writeFileSync(file, gzipSync(JSON.stringify(aggregateDay(day, snaps))));
  console.log(`${day}: ${snaps.length} scans -> ${file}`);
}

for (const f of readdirSync(outDir)) {
  if (f.endsWith('.json.gz') && f.slice(0, 10) < oldest) {
    rmSync(join(outDir, f));
    console.log(`${f.slice(0, 10)}: older than the retention window, deleted`);
  }
}

// The houses' Last-Modified times, or null if any house lacks one.
function dataVersion(scan) {
  const entries = Object.entries(scan.houses).sort(([a], [b]) => a - b);
  if (entries.length === 0 || entries.some(([, h]) => !h.lastModified)) return null;
  return entries.map(([id, h]) => `${id}=${h.lastModified}`).join(';');
}

function reduceScan(scan) {
  const houses = {};
  for (const [houseId, house] of Object.entries(scan.houses)) {
    houses[houseId] = { name: house.name, items: summarizeAuctions(decodeHouse(house)) };
  }
  return { houses };
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
      items[itemId] = [Math.min(...mins), median(entries.map((e) => e[1])), Math.round(qty), entries.length, median(mins)];
    }
    houses[houseId] = { name: house.name, items };
  }
  return { date: day, region: args.region, scans: snaps.length, houses };
}
