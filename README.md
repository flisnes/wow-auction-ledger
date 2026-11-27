# Auction Ledger

Auction house price history for World of Warcraft: Forever. GitHub Actions collects prices from the Battle.net Game Data API every two hours, whether or not anyone is playing. A daily release ships the last 29 days to an in-game addon.

Data source: Blizzard Entertainment. This project is not affiliated with or endorsed by Blizzard Entertainment. See [PRIVACY.md](PRIVACY.md) for what is collected and how long it is kept.

## How it works

| Step | Where | Schedule |
|---|---|---|
| Fetch every auction house, upload the full scan to the `scans` release, delete scans older than 29 days | `.github/workflows/collect.yml` | every 2 hours at :17 UTC |
| Reduce each scan to `[min, median, quantity]` per item, aggregate completed UTC days, delete days outside the window, replace the `data` branch with one commit | `.github/workflows/publish.yml` | daily at 00:47 UTC |
| Generate `Data.lua` with daily series and price statistics, zip the addon, publish today's release, delete all older releases | same workflow | daily |
| Run the collector unit tests | `.github/workflows/test.yml` | on push and pull request |

Prices are in copper per unit. The daily value per item is the median of the scan medians, and the median within a scan is weighted by quantity.

## Scans and backfill

Each collection run stores the full scan as an asset of the `scans` pre-release: every listing with auction id, item id, bonus lists and modifiers, buyout, bid, quantity and time left (format in `collector/lib/scan.mjs`). A scan is about 7 MB gzipped, about 2.5 GB for 29 days. Release assets have no total size limit; Actions artifacts would count against a 500 MB quota on the free plan.

After a change to how scans are reduced or aggregated, run "Publish daily data and addon release" manually with **backfill** checked. It rebuilds every daily aggregate that still has scans. The oldest window day can miss its first scans, since scans are deleted 29 days after collection.

## Price statistics

The daily aggregates hold, per house and item, `[minUnit, medianOfMedians, meanQuantity, samples, medianOfMins]`. `medianOfMins` is the typical lowest listing of the day, comparable with the lowest buyout of a live scan.

`collector/build-lua.mjs` adds a `stats` table to each house in `Data.lua` for items listed on at least 3 days of the window. Each entry is a comma-separated string, with field names in `AuctionLedger_Data.statFields`:

| Field | Meaning |
|---|---|
| `days` | days with listings |
| `quantity` | median of the daily mean quantity |
| `median.*` | statistics of the daily median series |
| `low.*` | statistics of the daily typical lowest listing series |

Statistics per series (`collector/lib/window-stats.mjs`):

| Field | Meaning | Used for |
|---|---|---|
| `median`, `mad` | median, median absolute deviation (unscaled) | % from baseline, robust z-score `(now - median) / (1.4826 * mad)` |
| `p10`, `p25`, `p75`, `p90` | quantiles with linear interpolation | percentile rank |
| `mean`, `std` | population mean and standard deviation | Bollinger band |
| `slope`, `trend`, `resMad` | Theil-Sen slope in copper per day, fitted value for today, median absolute residual | trend-adjusted deviation |

To drop a statistic, remove it from `SERIES_FIELDS`. The addon looks fields up by name, so the remaining ones keep working.

Forever lists auction houses under rulesets instead of connected realms (`dynamic-forever-{region}`, `/data/wow/ruleset/{id}/auctions/{houseId}` plus `/commodities`). This comes from community testing, not Blizzard documentation.

## Data retention

The [Blizzard Developer API Terms of Use](https://www.blizzard.com/en-us/legal/a2989b50-5f16-43b1-abec-2ae17cc09dd6/blizzard-developer-api-terms-of-use), section 2(t), limit retention of API data to 30 days. This project keeps the 29 complete UTC days before today (`collector/lib/retention.mjs`):

- Daily aggregates older than the window are deleted, and the `data` branch is rewritten as a single commit, so its history holds no older days.
- Only the release published today is kept.
- The addon hides any day older than 30 days by the player's clock, so an outdated install stops showing expired data.
- Full scans are deleted from the `scans` release 29 days after collection, by both workflows.

## Setup

1. Create an API client at <https://develop.battle.net/access/clients> and copy the client ID and secret.
2. Copy `.env.example` to `.env` and fill in the two values.
3. Run `npm run probe` (Node 22 or later) and check the output against the items under "To verify".
4. Push the repository to GitHub and add the repository secrets `BNET_CLIENT_ID` and `BNET_CLIENT_SECRET`.
5. Optional repository variable: `REGION` (default `eu`).
6. Run "Collect auction scan" manually once to confirm it works. The first release appears the day after the first full UTC day of collection.

## Installing the addon

Download the zip from the latest release and extract it into `<WoW folder>\_forever_\Interface\AddOns`, or run:

```powershell
.\tools\update-addon.ps1 -AddOnsPath "<WoW folder>\_forever_\Interface\AddOns"
```

The script and release downloads need the repository to be public, or friends need read access and a token.

In game:

- Item tooltips show the latest daily median and the 7-day and 29-day averages.
- `/ledger <item link or id>` opens a bar graph of the daily medians.
- `/ledger house` lists auction houses, `/ledger house <n>` selects one for the current realm and faction, and `/ledger house auto` returns to the default: the median across all houses of your faction.

## Auction houses

The EU API lists 15 houses in five groups of Alliance, Horde and Blackwater (neutral): 110/113/116, 111/114/117, 112/115/118 (empty), 119/120/121 and 123/124/125. House names do not include a realm, and every ruleset lists all 15 houses, so the API does not say which group a realm uses. The four non-empty groups probably match the four rulesets (PvP, Normal, RP, RP-PvP). Compare a price in game with `/ledger house` to find yours.

Stackable goods are commodities with a `unit_price`. Item auctions are single items (none had quantity above 1 in a 122,000-auction sample).

## To verify

- **Interface number.** The TOC uses `16001`. In game, `/dump select(4, GetBuildInfo())` prints the correct value. The AddOns folder name (`_forever_`) is also unconfirmed.
- **Random suffixes.** Items are keyed by item id only, so "of the Bear" and "of the Eagle" variants share one price.

## Local commands

```sh
npm run probe                                    # inspect the live API
npm run collect -- --region eu --out out         # one full scan to out/
npm run aggregate -- --scans out --data data     # aggregate completed days
npm run build-lua -- --data data                 # write addon/AuctionLedger/Data.lua
npm test                                         # unit tests
```

## Limits

- GitHub may delay scheduled runs or skip them under load. A skipped collect run leaves a two-hour gap. A skipped publish run is caught up by the next one, since scans are kept for 29 days.
- GitHub disables scheduled workflows in public repositories after 60 days without activity. The daily pushes to `data` should prevent this, but check the Actions tab if releases stop.
