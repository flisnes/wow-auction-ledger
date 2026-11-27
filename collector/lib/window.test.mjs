import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { loadWindow } from './window.mjs';

function writeDay(dir, date, houses) {
  writeFileSync(join(dir, `${date}.json.gz`), gzipSync(JSON.stringify({ date, houses })));
}

test('houses, groups and gaps', () => {
  const dir = mkdtempSync(join(tmpdir(), 'window-'));
  try {
    // [minUnit, medianOfMedians, meanQuantity, samples, medianOfMins]
    writeDay(dir, '2026-11-01', {
      110: { name: 'Alliance Auction House', items: { 2589: [10, 30, 100, 12, 20] } },
      111: { name: 'Alliance Auction House', items: { 2589: [8, 50, 300, 12, 40] } },
      112: { name: 'Alliance Auction House', items: {} },
    });
    // Written before medianOfMins existed: four fields.
    writeDay(dir, '2026-11-03', {
      110: { name: 'Alliance Auction House', items: { 2589: [12, 32, 90, 12] } },
    });
    const { houses, daysFound } = loadWindow(dir, ['2026-11-01', '2026-11-02', '2026-11-03']);

    assert.equal(daysFound, 2);
    assert.deepEqual([...houses.keys()].sort(), [110, 111, 'group:Alliance Auction House'].sort());
    assert.deepEqual(houses.get(110).items.get(2589), {
      median: [30, null, 32], low: [20, null, null], qty: [100, null, 90], min: [10, null, 12],
    });
    const group = houses.get('group:Alliance Auction House');
    assert.equal(group.id, null);
    assert.deepEqual(group.items.get(2589), {
      median: [40, null, 32], low: [30, null, null], qty: [200, null, 90], min: [8, null, 12],
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
