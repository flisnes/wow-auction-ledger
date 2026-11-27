import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCatalog, searchAll } from './catalog.mjs';

const item = (id, en, extra = {}) => ({
  id,
  name: { en_US: en, ko_KR: `${en} (ko)`, de_DE: `${en} (de)` },
  quality: { type: 'COMMON' },
  item_class: { id: 7, name: { en_US: 'Trade Goods' } },
  item_subclass: { id: 5, name: { en_US: 'Cloth' } },
  media: { id },
  ...extra,
});
const media = (id, file) => ({
  id,
  assets: [{ key: 'icon', file_data_id: file, value: `https://render.example/forever-eu/icons/56/${file}.jpg` }],
});

test('the first source wins and later sources fill missing ids', () => {
  const catalog = buildCatalog([
    { items: [item(2589, 'Linen Cloth')], media: [media(2589, 132889)] },
    { items: [item(2589, 'Old Linen'), item(647, 'Destiny', { quality: { type: 'EPIC' } })], media: [media(647, 135317)] },
  ]);
  assert.deepEqual(catalog.items[2589], {
    name: { en_US: 'Linen Cloth', ko_KR: 'Linen Cloth (ko)' },
    quality: 'COMMON',
    classId: 7,
    subclass: 'Cloth',
    icon: 132889,
  });
  assert.equal(catalog.items[647].name.en_US, 'Destiny');
  assert.equal(catalog.items[647].quality, 'EPIC');
  assert.equal(catalog.items[647].icon, 135317);
  assert.equal(catalog.iconBase, 'https://render.example/forever-eu/icons/56/');
  assert.deepEqual(catalog.classes, { 7: 'Trade Goods' });
});

test('an item without media has no icon', () => {
  const catalog = buildCatalog([{ items: [item(25, 'Worn Shortsword')], media: [] }]);
  assert.equal(catalog.items[25].icon, null);
  assert.equal(catalog.iconBase, null);
});

test('search pages by id range until a short page', async () => {
  const ids = Array.from({ length: 2500 }, (_, i) => i * 2 + 1);
  const queries = [];
  const api = {
    async get(path, kind) {
      queries.push([path, kind]);
      const [, from, to] = /id=\[(\d+),(\d+)\]/.exec(path).map(Number);
      const results = ids.filter((id) => id >= from && id <= to).slice(0, 1000).map((id) => ({ data: { id } }));
      return { body: { results } };
    },
  };
  const results = await searchAll(api, 'item', { kind: 'static-classic1x' });
  assert.deepEqual(results.map((r) => r.id), ids);
  assert.equal(queries.length, 3);
  assert.match(queries[1][0], /id=\[2000,/);
  assert.equal(queries[0][1], 'static-classic1x');
});
