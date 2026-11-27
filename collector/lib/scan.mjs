// Full auction scan format, kept for 29 days so daily aggregates can be
// rebuilt with new metrics. One file per collection run:
//
// { format: 1, ts, region, houses: { houseId: { name, lastModified, items, commodities } } }
//
// items:       [[idDelta, itemId, buyout, bid, quantity, timeLeft, extra?], ...]
// commodities: [[idDelta, itemId, unitPrice, quantity, timeLeft], ...]
//
// Rows are sorted by auction id and store the difference from the previous
// id (the first from 0), which cuts the gzipped size by about a fifth.
// buyout and bid are 0 when absent. timeLeft is an index into TIME_LEFT, or
// the API string if it is not listed. extra holds the item fields other than
// id (bonus_lists, modifiers, context) and is left out when there are none.
// Seller data is not sent by the API.

export const FORMAT = 1;
const TIME_LEFT = ['SHORT', 'MEDIUM', 'LONG', 'VERY_LONG'];

export function encodeHouse({ name, lastModified, items, commodities }) {
  return {
    name,
    lastModified,
    items: encodeRows(items, (a) => {
      const { id, ...extra } = a.item;
      const row = [id, a.buyout ?? 0, a.bid ?? 0, a.quantity, encodeTimeLeft(a.time_left)];
      if (Object.keys(extra).length > 0) row.push(extra);
      return row;
    }),
    commodities: encodeRows(commodities, (a) => [a.item.id, a.unit_price, a.quantity, encodeTimeLeft(a.time_left)]),
  };
}

// Returns auctions in the API's shape, as summarizeAuctions expects.
export function decodeHouse({ items, commodities }) {
  return {
    items: decodeRows(items, (id, [itemId, buyout, bid, quantity, timeLeft, extra]) => {
      const a = { id, item: { id: itemId, ...extra }, quantity, time_left: decodeTimeLeft(timeLeft) };
      if (buyout) a.buyout = buyout;
      if (bid) a.bid = bid;
      return a;
    }),
    commodities: decodeRows(commodities, (id, [itemId, unitPrice, quantity, timeLeft]) => (
      { id, item: { id: itemId }, quantity, unit_price: unitPrice, time_left: decodeTimeLeft(timeLeft) })),
  };
}

function encodeRows(auctions, toRow) {
  let prev = 0;
  return [...auctions].sort((a, b) => a.id - b.id).map((a) => {
    const row = [a.id - prev, ...toRow(a)];
    prev = a.id;
    return row;
  });
}

function decodeRows(rows, fromRow) {
  let id = 0;
  return rows.map(([delta, ...rest]) => fromRow((id += delta), rest));
}

function encodeTimeLeft(value) {
  const i = TIME_LEFT.indexOf(value);
  return i >= 0 ? i : value;
}

function decodeTimeLeft(value) {
  return typeof value === 'number' ? TIME_LEFT[value] : value;
}
