// Loads the daily aggregates of one region inside the retention window into
// per-house daily series, for the addon data and the website.
//
// House names are not unique (each ruleset group has its own "Alliance
// Auction House"), so houses are keyed by id. Houses sharing a name are also
// combined into a group keyed "group:<name>": per day, the median across
// those houses (the minimum for "min"). Empty houses are left out.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { median } from './stats.mjs';

// Daily series per item: medianOfMedians, medianOfMins (typical lowest
// listing), meanQuantity, minUnit. Aggregates written before medianOfMins
// existed have null there.
export const SERIES = ['median', 'low', 'qty', 'min'];

// Returns { houses, daysFound }. houses maps a key (house id, or
// "group:<name>") to { id, name, items }, where id is null for groups and
// items maps an item id to { median, low, qty, min }, each an array with one
// value per date (null for days without listings).
export function loadWindow(dir, dates) {
  const houses = new Map();
  const getHouse = (key, id, name) => {
    if (!houses.has(key)) houses.set(key, { id, name, items: new Map() });
    const house = houses.get(key);
    house.name = name;
    return house;
  };
  const setValues = (house, itemId, dayIndex, values) => {
    if (!house.items.has(itemId)) {
      house.items.set(itemId, Object.fromEntries(SERIES.map((s) => [s, new Array(dates.length).fill(null)])));
    }
    const item = house.items.get(itemId);
    for (const s of SERIES) item[s][dayIndex] = values[s];
  };

  let daysFound = 0;
  dates.forEach((date, dayIndex) => {
    const file = join(dir, `${date}.json.gz`);
    if (!existsSync(file)) return;
    daysFound++;
    const day = JSON.parse(gunzipSync(readFileSync(file)));
    const groups = new Map();
    for (const [houseId, src] of Object.entries(day.houses)) {
      const entries = Object.entries(src.items);
      if (entries.length === 0) continue;
      const house = getHouse(Number(houseId), Number(houseId), src.name);
      if (!groups.has(src.name)) groups.set(src.name, new Map());
      const group = groups.get(src.name);
      for (const [itemId, [min, med, qty, , low = null]] of entries) {
        const values = { median: med, low, qty, min };
        setValues(house, Number(itemId), dayIndex, values);
        if (!group.has(itemId)) group.set(itemId, Object.fromEntries(SERIES.map((s) => [s, []])));
        const lists = group.get(itemId);
        for (const s of SERIES) if (values[s] != null) lists[s].push(values[s]);
      }
    }
    for (const [name, items] of groups) {
      const group = getHouse(`group:${name}`, null, name);
      for (const [itemId, lists] of items) {
        const values = Object.fromEntries(SERIES.map((s) => [s, median(lists[s])]));
        values.min = lists.min.length > 0 ? Math.min(...lists.min) : null;
        setValues(group, Number(itemId), dayIndex, values);
      }
    }
  });
  return { houses, daysFound };
}
