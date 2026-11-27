// Writes the item catalog (lib/catalog.mjs) to a gzipped JSON file for
// build-site.mjs. The file is a build input only: it is not committed or
// published as is.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { createClient, getToken, loadCredentials } from './lib/bnet.mjs';
import { fetchCatalog } from './lib/catalog.mjs';

const { values: args } = parseArgs({
  options: {
    region: { type: 'string', default: 'eu' },
    out: { type: 'string', default: 'out/catalog.json.gz' },
  },
});

const api = createClient({ region: args.region, token: await getToken(loadCredentials()) });
const catalog = await fetchCatalog(api);
const count = Object.keys(catalog.items).length;
const withIcon = Object.values(catalog.items).filter((i) => i.icon != null).length;
if (count === 0) throw new Error('Item search returned no items');

mkdirSync(dirname(args.out), { recursive: true });
writeFileSync(args.out, gzipSync(JSON.stringify({ region: args.region, ...catalog })));
console.log(`Wrote ${args.out}: ${count} items, ${withIcon} with icons, ${Object.keys(catalog.classes).length} classes`);
