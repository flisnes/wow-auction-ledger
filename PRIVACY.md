# Privacy policy

Auction Ledger uses the Blizzard Battle.net Game Data API with application credentials only. No player logs in through it.

## What is collected

Public auction house listings for World of Warcraft: Forever: auction id, item id with bonus lists and modifiers, buyout, bid, quantity and time left. Seller names, character data, account data and other personal data are not requested, stored or published.

## What is stored and published

- Per item and auction house: the lowest price, the typical lowest price, the median price and the listed quantity for each day, and statistics derived from these over the 29-day window.
- Full scans (every listing, with the fields above) are kept in a private repository for 29 days, to compute the daily aggregates and for development. They are not published.
- Daily aggregates are kept for 30 days on the `data` branch, in the current addon release and on the website, then deleted.
- Item names, quality, type and icon ids from the Game Data API are fetched for each website build and published with it. They are not stored elsewhere.

## Who receives it

The data is published in this repository, on the website and in the Auction Ledger addon, free of charge, for players' personal use. It is not sold, licensed or transferred to anyone, and it is not used for advertising.

## The website

The website is a static page on GitHub Pages. It sets no cookies, uses no analytics and loads no third-party scripts. It loads item icons from Blizzard's render server (render.worldofwarcraft.com), which receives the visitor's IP address like any web request. It stores the last selected region and auction house in the browser's local storage. GitHub, which hosts the page, may log visitors' IP addresses; see the GitHub Privacy Statement.

## The addon

The addon reads the bundled data file and stores only the selected auction house in its saved variables. It sends nothing over the network.

## Source

Data source: Blizzard Entertainment. This project is not affiliated with or endorsed by Blizzard Entertainment.
