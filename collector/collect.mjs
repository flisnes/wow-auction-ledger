// Fetches every Forever auction house in a region and writes one reduced,
// gzipped snapshot: { ts, region, houses: { houseId: { name, items } } }.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { createClient, getToken, loadCredentials } from './lib/bnet.mjs';
import { discoverHouses, fetchHouseAuctions } from './lib/houses.mjs';
import { summarizeAuctions } from './lib/stats.mjs';

const { values: args } = parseArgs({
  options: {
    region: { type: 'string', default: 'eu' },
    out: { type: 'string', default: 'out' },
  },
});

const api = createClient({ region: args.region, token: await getToken(loadCredentials()) });
const houses = await discoverHouses(api);
const ts = new Date();
const snapshot = { ts: ts.toISOString(), region: args.region, houses: {} };

let failures = 0;
let itemTotal = 0;
for (const house of houses) {
  try {
    const raw = await fetchHouseAuctions(api, house);
    const items = summarizeAuctions(raw);
    snapshot.houses[house.id] = { name: house.name, items };
    itemTotal += Object.keys(items).length;
    console.log(`${house.id} ${house.name}: ${raw.items.length} item auctions, ` +
      `${raw.commodities.length} commodity auctions, ${Object.keys(items).length} items`);
  } catch (err) {
    failures++;
    console.error(`${house.id} ${house.name}: ${err.message}`);
  }
}

if (itemTotal === 0) {
  console.error(`No auction data collected (${failures} of ${houses.length} houses failed).`);
  process.exit(1);
}

// 2026-11-27T06:17:23.456Z -> 20261127T0617Z
const stamp = `${snapshot.ts.replace(/[-:]/g, '').slice(0, 13)}Z`;
const name = `snapshot-${args.region}-${stamp}`;
mkdirSync(args.out, { recursive: true });
const file = join(args.out, `${name}.json.gz`);
writeFileSync(file, gzipSync(JSON.stringify(snapshot)));
console.log(`Wrote ${file} (${houses.length - failures} houses, ${itemTotal} item entries)`);

if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `name=${name}\n`);
