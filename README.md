# Forever AH History

Auction house price history for World of Warcraft: Forever. GitHub Actions collects prices from the Battle.net Game Data API every two hours, whether or not anyone is playing. A daily release ships the last 30 days to an in-game addon.

## How it works

| Step | Where | Schedule |
|---|---|---|
| Fetch every auction house, reduce to `[min, median, quantity]` per item, upload as an artifact (kept 4 days) | `.github/workflows/collect.yml` | every 2 hours at :17 UTC |
| Aggregate completed UTC days, commit them to the `data` branch | `.github/workflows/publish.yml` | daily at 00:47 UTC |
| Generate `Data.lua`, zip the addon, publish a GitHub Release (last 7 kept) | same workflow | daily |

Prices are in copper per unit. The daily value per item is the median of the snapshot medians, and the median within a snapshot is weighted by quantity.

Forever lists auction houses under rulesets instead of connected realms (`dynamic-forever-{region}`, `/data/wow/ruleset/{id}/auctions/{houseId}` plus `/commodities`). This comes from community testing, not Blizzard documentation.

## Setup

1. Create an API client at <https://develop.battle.net/access/clients> and copy the client ID and secret.
2. Copy `.env.example` to `.env` and fill in the two values.
3. Run `npm run probe` (Node 22 or later) and check the output against the items under "To verify".
4. Push the repository to GitHub and add the repository secrets `BNET_CLIENT_ID` and `BNET_CLIENT_SECRET`.
5. Optional repository variables: `REGION` (default `eu`), `HISTORY_DAYS` (default `30`).
6. Run "Collect auction snapshot" manually once to confirm it works. The first release appears the day after the first full UTC day of collection.

## Installing the addon

Download the zip from the latest release and extract it into `<WoW folder>\_forever_\Interface\AddOns`, or run:

```powershell
.\tools\update-addon.ps1 -AddOnsPath "<WoW folder>\_forever_\Interface\AddOns"
```

The script and release downloads need the repository to be public, or friends need read access and a token.

In game:

- Item tooltips show the latest daily median and the 7-day and 30-day averages.
- `/fah <item link or id>` opens a bar graph of the daily medians.
- `/fah house` lists auction houses, `/fah house <n>` selects one, `/fah house auto` detects it from realm and faction. When no house matches, the region-wide median (`All houses`) is used.

## To verify

- **Stack buyouts.** `collector/lib/stats.mjs` assumes `buyout` on item auctions is the stack total. Compare a stacked auction from `npm run probe` with the in-game price.
- **House names.** Auto-detection expects names containing realm and faction. Check the names `npm run probe` prints.
- **Interface number.** The TOC uses `16001`. In game, `/dump select(4, GetBuildInfo())` prints the correct value. The AddOns folder name (`_forever_`) is also unconfirmed.
- **Random suffixes.** Items are keyed by item id only, so "of the Bear" and "of the Eagle" variants share one price.

## Local commands

```sh
npm run probe                                    # inspect the live API
npm run collect -- --region eu --out out         # one snapshot to out/
npm run aggregate -- --snapshots out --data data # aggregate completed days
npm run build-lua -- --data data                 # write addon/ForeverAHHistory/Data.lua
```

## Limits

- GitHub may delay scheduled runs or skip them under load. A skipped collect run leaves a two-hour gap. A skipped publish run is caught up the next day, since artifacts are kept for 4 days.
- GitHub disables scheduled workflows in public repositories after 60 days without activity. The daily commits to `data` should prevent this, but check the Actions tab if releases stop.
