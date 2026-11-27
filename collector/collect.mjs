// Fetches every Forever auction house in a region and writes one gzipped
// full scan (format in lib/scan.mjs) to <out>/scan-<region>-<stamp>.json.gz.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { createClient, getToken, loadCredentials } from './lib/bnet.mjs';
import { discoverHouses, fetchHouseAuctions } from './lib/houses.mjs';
import { FORMAT, encodeHouse } from './lib/scan.mjs';

const { values: args } = parseArgs({
  options: {
    region: { type: 'string', default: 'eu' },
    out: { type: 'string', default: 'out' },
  },
});

const api = createClient({ region: args.region, token: await getToken(loadCredentials()) });
const houses = await discoverHouses(api);
const scan = { format: FORMAT, ts: new Date().toISOString(), region: args.region, houses: {} };

let failures = 0;
let auctionTotal = 0;
for (const house of houses) {
  try {
    const raw = await fetchHouseAuctions(api, house);
    scan.houses[house.id] = encodeHouse({ name: house.name, ...raw });
    auctionTotal += raw.items.length + raw.commodities.length;
    console.log(`${house.id} ${house.name}: ${raw.items.length} item auctions, ${raw.commodities.length} commodity auctions`);
  } catch (err) {
    failures++;
    console.error(`${house.id} ${house.name}: ${err.message}`);
  }
}

if (auctionTotal === 0) {
  console.error(`No auction data collected (${failures} of ${houses.length} houses failed).`);
  process.exit(1);
}

// 2026-11-27T06:17:23.456Z -> 20261127T0617Z
const stamp = `${scan.ts.replace(/[-:]/g, '').slice(0, 13)}Z`;
const file = join(args.out, `scan-${args.region}-${stamp}.json.gz`);
mkdirSync(args.out, { recursive: true });
const gz = gzipSync(JSON.stringify(scan), { level: 9 });
writeFileSync(file, gz);
console.log(`Wrote ${file}: ${houses.length - failures} houses, ${auctionTotal} auctions, ${(gz.length / 1e6).toFixed(1)} MB`);

if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `file=${file}\n`);
