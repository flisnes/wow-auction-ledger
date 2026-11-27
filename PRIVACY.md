# Privacy policy

Auction Ledger uses the Blizzard Battle.net Game Data API with application credentials only. No player logs in through it.

## What is collected

Public auction house listings for World of Warcraft: Forever: auction id, item id with bonus lists and modifiers, buyout, bid, quantity and time left. Seller names, character data, account data and other personal data are not requested, stored or published.

## What is stored and published

- Per item and auction house: the lowest price, the typical lowest price, the median price and the listed quantity for each day, and statistics derived from these over the 29-day window.
- Full scans (every listing, with the fields above) are kept as assets of the `scans` release for 29 days.
- Daily aggregates are kept for 30 days on the `data` branch and in the current addon release, then deleted.

## Who receives it

The data is published in this repository and in the Auction Ledger addon, free of charge, for players' personal use. It is not sold, licensed or transferred to anyone, and it is not used for advertising.

## The addon

The addon reads the bundled data file and stores only the selected auction house in its saved variables. It sends nothing over the network.

## Source

Data source: Blizzard Entertainment. This project is not affiliated with or endorsed by Blizzard Entertainment.
