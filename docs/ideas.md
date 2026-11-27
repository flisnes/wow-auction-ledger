# Ideas and design notes

Future work and design notes. Numbers come from the EU scans taken 2026-11-27.

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

### Status

The data side is implemented: every metric above is computed for the daily median and the daily typical lowest listing, and shipped in `Data.lua` (see "Price statistics" in the README). Remaining addon work:

- Parse `statFields` into a name-to-index map, and parse each `stats` string on first use, as for the series.
- Show statistics only while the whole window is within 30 days by the player's clock (`DATA.days[1] >= cutoffDay()`). Unlike the series, the statistics cannot drop the expired days.
- Handle `mad` or `resMad` equal to 0 (stable prices): use a floor such as 1% of the median.
- Size: the statistics add about 9 MB unpacked to roughly 11 MB of series (29 days, all houses). Drop the fields that turn out not to be useful.

### Pitfalls

- Compare like with like. A live scan gives the lowest buyout, which is below the historical median. Compare it with the `low.*` statistics (the median of the scan minimums per day), or compute the quantity-weighted median of the live listings.
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

House groups and their sizes per region are in the README ("Auction houses"). EU and US have four non-empty groups and four rulesets; KR and TW have two of each. The group-to-ruleset mapping is unconfirmed.

## 3. Detailed 2-hour data for development

Implemented: full scans for all four regions are kept for 29 days as release assets in the private repository `auction-ledger-data` (see "Scans and backfill" in the README). About 7 MB per EU or US scan, 5.7 GB in total for 29 days. The workflows write there with a fine-grained token (secret `DATA_REPO_TOKEN`), which expires and must be renewed.
- Use: time-of-day patterns, how quickly cheap listings sell (auction ids are kept), whether the addon would gain from more than one value per day, and random-suffix prices (bonus lists are kept).

## 4. Automatic distribution through CurseForge or Wago

Goal: players get the daily data through the CurseForge app or WowUp, with no script or git.

- Wowhead does not host or distribute addons. CurseForge and Wago Addons do, and both have upload APIs. A project can publish to both.
- Mechanism: after building the zip, the publish workflow uploads it with the CurseForge upload API (`POST https://wow.curseforge.com/api/projects/{id}/upload-file`, API token as a repository secret) or with the BigWigs packager action, which also supports Wago. The project is created once by hand.
- Precedent: as far as known, Oribos Exchange shipped price data through frequent CurseForge releases.

### To check or handle

1. Forever support: a guide reports a WoW Forever file for TSM on CurseForge. Confirm that the CurseForge app finds a Forever install and offers Forever files.
2. Approval delay: CurseForge reviews uploaded files. If review takes hours, the daily update arrives late.
3. Old versions stay downloadable, which conflicts with the 30-day rule (API terms 2(t)). The upload API probably cannot delete files. Mitigations: the addon already hides days older than 30 days by the player's clock; archive or delete old files on the site periodically.
4. Opt the project out of CurseForge author rewards. The API terms forbid using the Data for monetization (2(i)) and ads attached to the application (2(c)).
5. Size: a daily download of 2 to 3 MB per player (about 11 MB unpacked). Per-house loading (section 2) does not reduce the download, only what the game loads.
6. Split into two projects: "Auction Ledger" (code, rare releases) and "Auction Ledger Data" (daily data releases, a dependency of the code addon). This keeps the code changelog readable.

The GitHub release and `tools/update-addon.ps1` stay as a fallback.

### Regions

All four regions are collected and aggregated, but the release ships `ADDON_REGION` only. A player needs one region. Options: one zip per region in each release (`update-addon.ps1` gets a `-Region` parameter), or one data addon per region next to the code addon, which fits point 6 and per-house loading (section 2).
