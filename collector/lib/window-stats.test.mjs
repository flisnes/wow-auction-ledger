import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MIN_DAYS, SERIES_FIELDS, formatStats, quantile, seriesStats } from './window-stats.mjs';

test('too few days give no statistics', () => {
  assert.equal(seriesStats([100, null, 120, null]), null);
  assert.equal(seriesStats(new Array(MIN_DAYS).fill(50)).median, 50);
});

test('quantiles interpolate linearly', () => {
  assert.equal(quantile([10, 20, 30, 40, 50], 0.5), 30);
  assert.equal(quantile([10, 20, 30, 40], 0.5), 25);
  assert.equal(quantile([10, 20, 30, 40, 50], 0.1), 14);
});

test('median and MAD ignore a single spike', () => {
  const s = seriesStats([100, 102, 98, 101, 99, 10000, 100]);
  assert.equal(s.median, 100);
  assert.equal(s.mad, 1);
  assert.ok(s.mean > 1000);
});

test('Theil-Sen trend follows a line through gaps and outliers', () => {
  const series = Array.from({ length: 10 }, (_, x) => 200 + 10 * x);
  series[3] = null;
  series[6] = 5000;
  const s = seriesStats(series);
  assert.equal(s.slope, 10);
  assert.equal(s.trend, 200 + 10 * series.length);
  assert.equal(s.resMad, 0);
});

test('a flat series has zero spread', () => {
  const s = seriesStats([500, 500, 500, 500]);
  assert.deepEqual([s.mad, s.std, s.slope, s.resMad], [0, 0, 0, 0]);
});

test('formatted values follow SERIES_FIELDS', () => {
  const values = formatStats(seriesStats([1, 2, 2, 3]));
  assert.equal(values.length, SERIES_FIELDS.length);
  assert.ok(values.every(Number.isFinite));
  assert.deepEqual(formatStats(null), SERIES_FIELDS.map(() => ''));
});
