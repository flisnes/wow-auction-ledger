import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeHouse, encodeHouse } from './scan.mjs';

const items = [
  { id: 300, item: { id: 15150, bonus_lists: [12725], context: 11 }, buyout: 10098, quantity: 1, time_left: 'SHORT' },
  { id: 100, item: { id: 7963 }, buyout: 5640, bid: 4000, quantity: 1, time_left: 'VERY_LONG' },
  { id: 200, item: { id: 3781 }, bid: 100, quantity: 1, time_left: 'NEW_VALUE' },
];
const commodities = [
  { id: 50, item: { id: 13444 }, quantity: 51, unit_price: 9900, time_left: 'LONG' },
  { id: 40, item: { id: 1074 }, quantity: 1, unit_price: 491, time_left: 'MEDIUM' },
];
const byId = (a, b) => a.id - b.id;

test('a house survives encoding unchanged, sorted by auction id', () => {
  const encoded = encodeHouse({ name: 'House', lastModified: null, items, commodities });
  const decoded = decodeHouse(JSON.parse(JSON.stringify(encoded)));
  assert.deepEqual(decoded.items, [...items].sort(byId));
  assert.deepEqual(decoded.commodities, [...commodities].sort(byId));
});

test('rows store id deltas and leave out empty extras', () => {
  const encoded = encodeHouse({ name: 'House', lastModified: null, items, commodities });
  assert.deepEqual(encoded.items[0], [100, 7963, 5640, 4000, 1, 3]);
  assert.deepEqual(encoded.items[1], [100, 3781, 0, 100, 1, 'NEW_VALUE']);
  assert.deepEqual(encoded.commodities[1], [10, 13444, 9900, 51, 2]);
});
