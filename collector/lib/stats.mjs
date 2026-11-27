// Reduces one house's raw auctions to { itemId: [minUnit, medianUnit, quantity] },
// prices in copper per unit. The median is weighted by quantity, so one cheap
// single item does not outweigh a large stack.
//
// Item auctions are assumed to carry the stack total in `buyout`, as in the
// Classic Era API. Verify this with `npm run probe` before trusting stack prices.
export function summarizeAuctions({ items, commodities }) {
  const byItem = new Map();
  const add = (itemId, unitPrice, quantity) => {
    if (!itemId || !(unitPrice > 0) || !(quantity > 0)) return;
    let list = byItem.get(itemId);
    if (!list) byItem.set(itemId, (list = []));
    list.push([unitPrice, quantity]);
  };

  // Bid-only auctions have no buyout and are skipped.
  for (const a of items) add(a.item?.id, a.buyout / a.quantity, a.quantity);
  for (const a of commodities) add(a.item?.id, a.unit_price, a.quantity);

  const out = {};
  for (const [itemId, list] of byItem) {
    list.sort((x, y) => x[0] - y[0]);
    const total = list.reduce((sum, [, q]) => sum + q, 0);
    let acc = 0;
    let median = list[list.length - 1][0];
    for (const [unit, q] of list) {
      acc += q;
      if (acc * 2 >= total) {
        median = unit;
        break;
      }
    }
    out[itemId] = [Math.round(list[0][0]), Math.round(median), total];
  }
  return out;
}

export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
