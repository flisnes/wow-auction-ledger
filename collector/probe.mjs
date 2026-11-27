// One-off check of the Forever auction endpoints. Prints the ruleset index, the
// auction houses, and sample auctions, and saves the raw samples to out/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createClient, getToken, loadCredentials } from './lib/bnet.mjs';
import { discoverHouses, fetchHouseAuctions } from './lib/houses.mjs';
import { summarizeAuctions } from './lib/stats.mjs';

const { values: args } = parseArgs({
  options: { region: { type: 'string', default: 'eu' } },
});

const api = createClient({ region: args.region, token: await getToken(loadCredentials()) });

const { body: index } = await api.get('/data/wow/ruleset/index', 'dynamic');
console.log('Ruleset index (truncated):');
console.log(JSON.stringify(index, null, 2).slice(0, 1500));

const houses = await discoverHouses(api);
console.log(`\n${houses.length} auction houses:`);
for (const h of houses) console.log(`  ${h.id}\t${h.name}\t(ruleset ${h.rulesetId})`);

let sample = null;
for (const house of houses) {
  const raw = await fetchHouseAuctions(api, house);
  if (raw.items.length + raw.commodities.length === 0) continue;
  sample = { house, raw };
  break;
}
if (!sample) {
  console.log('\nNo house returned any auctions.');
  process.exit(1);
}

const { house, raw } = sample;
console.log(`\nSample house ${house.id} "${house.name}": ${raw.items.length} item auctions, ` +
  `${raw.commodities.length} commodity auctions, Last-Modified: ${raw.lastModified ?? 'not sent'}`);

const stacks = raw.items.filter((a) => a.quantity > 1 && a.buyout).slice(0, 3);
console.log('\nItem auctions with quantity > 1 (check in game whether buyout is per stack or per unit):');
console.log(JSON.stringify(stacks, null, 2));
console.log('\nCommodity auctions:');
console.log(JSON.stringify(raw.commodities.slice(0, 3), null, 2));

const summary = Object.entries(summarizeAuctions(raw)).slice(0, 10);
console.log('\nSummary [minUnit, medianUnit, quantity] for the first 10 items:');
for (const [id, s] of summary) console.log(`  ${id}\t${s.join('\t')}`);

mkdirSync('out', { recursive: true });
const file = join('out', `probe-${args.region}.json`);
writeFileSync(file, JSON.stringify({
  index,
  houses,
  sampleHouse: house,
  items: raw.items.slice(0, 200),
  commodities: raw.commodities.slice(0, 200),
}, null, 2));
console.log(`\nRaw samples written to ${file}`);
