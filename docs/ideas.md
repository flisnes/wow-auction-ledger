# Ideas and design notes

Future work, not implemented yet. Numbers come from the EU snapshot taken 2026-11-27.

## 1. Price verdict: how cheap or expensive is an item now

Goal: compare the current price (tooltip, or the item open in the AH window) with the 29-day history and tell the player how unusual it is.

### Polynomial fit: not worth it

- Daily medians are noisy (resets, one large cheap listing, price wars). Degree 2 to 4 only captures the trend. Degree 8 or more fits noise and swings at the window edges, where "today" is.
- Nothing above degree 2 or 3 is defensible for 29 points, and that is no better than a moving average plus a trend line.
- Size: about 30 bytes per item for 4 coefficients against about 150 bytes for the full series. Point 2 below makes the size question moot.

### Metrics to use instead

| Metric | Output | Per-item data |
|---|---|---|
| % from baseline | "23% below the 29-day median" | median |
| Robust z-score: (now - median) / (1.4826 * MAD) | separates a bargain from normal noise; resistant to spikes | median, MAD |
| Percentile rank | "cheaper than 90% of the last 29 days" | series or a few quantiles |
| Trend-adjusted deviation | compares with where the price is heading | slope, intercept, residual spread (degree 1 fit) |
| Bollinger band | moving average +/- k standard deviations | mean, std |

Preferred pair: robust z-score and percentile rank.

### Pitfalls

- Compare like with like. A live scan gives the lowest buyout, which is below the historical median. Compare it with the historical daily minimum (computed in the daily aggregates, not shipped yet), or compute the quantity-weighted median of the live listings.
- Thin markets. Ship quantity or the number of days with listings, and show no verdict when data is too sparse.

### Reading the player's AH search

Feasible (Auctionator does it). Unknown: which AH API the Forever client exposes. The web API splits items and commodities like retail, so the client probably uses `C_AuctionHouse` with `COMMODITY_SEARCH_RESULTS_UPDATED` and `ITEM_SEARCH_RESULTS_UPDATED`. Classic Era uses `QueryAuctionItems` and `GetAuctionItemInfo`. Check in game with `/dump C_AuctionHouse`.

### Feasibility

| Idea | Verdict |
|---|---|
| Polynomial compression | possible, not worth it |
| Median, MAD and slope per item | easy |
| Tooltip verdict | easy |
| Verdict on the item open in the AH window | feasible after the API check |
| Price prediction | not feasible with 29 noisy days |

## 2. Load only the character's auction houses

A Horde character on the Normal ruleset needs only that group's Horde and Blackwater houses.

- Split the data into one load-on-demand addon per house (`## LoadOnDemand: 1`). The main addon calls `C_AddOns.LoadAddOn` (or `LoadAddOn`) for the two houses it needs at login.
- Size: about 7,000 + 4,000 items, roughly 2 MB for 29 days, instead of about 11 MB for all houses.
- Blocker: the API does not map rulesets to house groups, and the client has no obvious realm-ruleset function. Options:
  1. Static realm-to-group table in the addon, once the groups are known.
  2. Auto-match on the first AH visit: compare visible commodity prices with each group's latest day, pick the closest, save it per realm.
  3. Manual override with `/ledger house` (exists).

  Plan: option 2 with option 3 as override. Until the group is known, load only the faction-wide medians.

House groups seen on EU (Alliance / Horde / Blackwater):

| Group | Houses | Item auctions |
|---|---|---|
| A | 110, 113, 116 | 122k / 122k / 13k |
| B | 111, 114, 117 | 123k / 108k / 17k |
| C | 112, 115, 118 | empty |
| D | 119, 120, 121 | 19k / 11k / 0.5k |
| E | 123, 124, 125 | 14k / 14k / 0.7k |

Four non-empty groups and four rulesets (PvP, Normal, RP, RP-PvP); the mapping is unconfirmed.

## 3. Detailed 2-hour data for development

- Size: one reduced snapshot is about 400 KB gzipped. 12 per day over 29 days is about 140 MB.
- Do not use a branch in this repository: if it is public, every branch is public. Use a separate private repository (for example `auction-ledger-data`). The collect job pushes each snapshot with a deploy key. The publish job deletes snapshots older than 30 days and replaces the history with one commit, as for the `data` branch.
- Actions still run in the public repository, so private-repository minute limits do not apply. Git contents do not count against the private storage quota (only artifacts and packages do).
- The current 4-day snapshot artifacts in a public repository can be downloaded by any signed-in GitHub user.
- Use: time-of-day patterns, how quickly cheap listings sell, and whether the addon would gain from more than one value per day.
