// Builds the GitHub Pages site: copies site/ and writes JSON data for every
// region with daily aggregates in the retention window (lib/window.mjs).
//
// <out>/data/regions.json            regions, icon URL base, retention days, bucket
//                                    count, repository (owner/name) for links
// <out>/data/<region>/meta.json      window days, houses, item classes
// <out>/data/<region>/items.json     [id, name, localName, quality, classId, subclass, icon] per listed item
// <out>/data/<region>/houses/<key>.json
//                                    [id, latestMedian, latestLow, latestQty, latestDay, windowMedian, days]
//                                    per item listed in that house; latestDay indexes meta.days
// <out>/data/<region>/series/<n>.json
//                                    { itemId: { houseKey: [median[], low[], qty[], min[]] } }
//                                    for item ids with id % BUCKETS == n
//
// The item catalog (fetch-catalog.mjs) is optional: without it, items are
// shown by id. The site is always written, with no regions when there is no
// data, so a deploy also removes data that left the window.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { RETENTION_DAYS, windowDays } from './lib/retention.mjs';
import { median } from './lib/stats.mjs';
import { SERIES, loadWindow } from './lib/window.mjs';

const { values: args } = parseArgs({
  options: {
    data: { type: 'string', default: 'data' },
    catalog: { type: 'string', default: 'out/catalog.json.gz' },
    site: { type: 'string', default: 'site' },
    out: { type: 'string', default: '_site' },
  },
});

const BUCKETS = 256;
// Local item names shown next to the English name.
const LOCAL_NAME = { kr: 'ko_KR', tw: 'zh_TW' };
const REGION_ORDER = ['eu', 'us', 'kr', 'tw'];

const catalog = existsSync(args.catalog) ? JSON.parse(gunzipSync(readFileSync(args.catalog))) : null;
if (!catalog) console.log(`No catalog at ${args.catalog}: items are shown by id`);

rmSync(args.out, { recursive: true, force: true });
cpSync(args.site, args.out, { recursive: true });
mkdirSync(join(args.out, 'data'), { recursive: true });
cpSync(new URL('./lib/window-stats.mjs', import.meta.url), join(args.out, 'window-stats.mjs'));

const dates = windowDays();
const dailyRoot = join(args.data, 'daily');
const available = existsSync(dailyRoot) ? readdirSync(dailyRoot) : [];
const regions = [];
const summary = [];

for (const region of available.sort((a, b) => rank(a) - rank(b))) {
  const { houses, daysFound } = loadWindow(join(dailyRoot, region), dates);
  if (daysFound === 0) continue;
  regions.push(region);
  const dir = join(args.out, 'data', region);
  mkdirSync(join(dir, 'houses'), { recursive: true });
  mkdirSync(join(dir, 'series'), { recursive: true });

  const houseList = [];
  const listed = new Set();
  const buckets = Array.from({ length: BUCKETS }, () => ({}));
  for (const house of houses.values()) {
    const key = house.id == null ? slug(house.name) : String(house.id);
    houseList.push({ key, id: house.id, name: house.name, items: house.items.size });
    const rows = [];
    for (const [itemId, series] of [...house.items].sort((a, b) => a[0] - b[0])) {
      listed.add(itemId);
      (buckets[itemId % BUCKETS][itemId] ??= {})[key] = SERIES.map((s) => series[s]);
      rows.push(summaryRow(itemId, series));
    }
    writeJson(join(dir, 'houses', `${key}.json`), rows);
  }
  buckets.forEach((bucket, n) => writeJson(join(dir, 'series', `${n}.json`), bucket));

  const items = [...listed].sort((a, b) => a - b).map((id) => itemRow(id, LOCAL_NAME[region]));
  writeJson(join(dir, 'items.json'), items);
  writeJson(join(dir, 'meta.json'), {
    region,
    days: dates,
    houses: houseList.sort(compareHouses),
    classes: catalog?.classes ?? {},
  });
  const named = items.filter((row) => row[1] != null).length;
  summary.push(`${region}: ${daysFound} days, ${houseList.length} houses, ${items.length} items (${named} named)`);
}

writeJson(join(args.out, 'data', 'regions.json'), {
  generated: new Date().toISOString(),
  retentionDays: RETENTION_DAYS,
  buckets: BUCKETS,
  iconBase: catalog?.iconBase ?? null,
  repository: process.env.GITHUB_REPOSITORY ?? null,
  regions,
});
const text = `Site in ${args.out}, window ${dates[0]} to ${dates.at(-1)}. ${summary.join('; ') || 'No data.'}`;
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`, { flag: 'a' });

function summaryRow(itemId, series) {
  let latest = -1;
  for (let i = series.median.length - 1; i >= 0; i--) {
    if (series.median[i] != null) {
      latest = i;
      break;
    }
  }
  const values = series.median.filter((v) => v != null);
  if (latest < 0) return [itemId, null, null, null, null, null, 0];
  return [itemId, series.median[latest], series.low[latest], series.qty[latest], latest, median(values), values.length];
}

function itemRow(id, localLocale) {
  const item = catalog?.items[id];
  if (!item) return [id, null, null, null, null, null, null];
  const local = localLocale ? item.name[localLocale] ?? null : null;
  return [id, item.name.en_US ?? null, local, item.quality, item.classId, item.subclass, item.icon];
}

// Groups first, then houses by id; groups and houses in Alliance, Horde, other order.
function compareHouses(a, b) {
  if ((a.id == null) !== (b.id == null)) return a.id == null ? -1 : 1;
  if (a.id == null) return factionRank(a.name) - factionRank(b.name) || a.name.localeCompare(b.name);
  return a.id - b.id;
}

function factionRank(name) {
  if (/^alliance/i.test(name)) return 0;
  if (/^horde/i.test(name)) return 1;
  return 2;
}

function rank(region) {
  const i = REGION_ORDER.indexOf(region);
  return i < 0 ? REGION_ORDER.length : i;
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value));
}
