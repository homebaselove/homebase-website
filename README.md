# Homebase Website

A modern, responsive web application for the Base community - a platform for builders and creators to feel at home. Homebase.

## 🏠 Overview

The Homebase website serves as a hub for the Base community, featuring:

- Live funding card for Based House, read from the creator fees the $home
  position has earned
- Interactive map of community events, pinned from their Luma links
- The Based House story: a scroll-snapped reel of every house, the Base Batches
  workshops and the Homebase Map, with each chapter's figures and sources
- Homebase Live: what is streaming ahead, from calendars the Homebase wallet
  adds, in any timezone
- Video gallery of past events and workshops
- Farcaster Frame integration

## 🚀 Tech Stack

- **UI**: [Preact](https://preactjs.com/) with signals, served by
  [effect-start](https://github.com/nounder/effect-start)
- **Styling**: [TailwindCSS](https://tailwindcss.com/) v4
- **Runtime**: [Bun](https://bun.sh/)

## 🧱 UI building blocks

Every section is built from the same few pieces, so a control looks and
behaves the same wherever it appears:

- `src/client.css`: the button kinds (`btn-brand` for the one primary action
  of a card or dialog, `btn-quiet` for the rest, `btn-text` inline), `chip`,
  `field`, and the dialog sheet, with one focus ring for all of them.
- `Dialog`: the native modal dialog behind every dialog on the page.
- `LinkDialog`: paste a link, look it up, confirm it in the wallet; the map's
  Add an event and Live's Add a calendar are both one.
- `Panel`, `PanelHeader`, `Band`, `SectionHeading`: the cards and the page's
  rhythm.
- `Choices` (native radios as chips), `Disclosure` (`details`), `Notice`
  (live region), `AddToCalendar` (Google Calendar or an .ics file).
- `useAction`: the pending and error state of anything a button starts, and
  `transact` in `src/wallet/client.ts`: every wallet transaction, whose
  stage every such button reads.

## 🛠️ Development

### Prerequisites

- Node.js 22.x or later
- Bun 1.2 or later

### Installation

1. Clone the repository

```bash
git clone https://github.com/yourusername/homebase-website.git
cd homebase-website
```

2. Install dependencies

```bash
bun install
```

3. Start the development server

```bash
bun run dev
```

## 👛 Wallet

One Connect wallet button, top right of the page, serves the map, Homebase
Live and the Donate button. Any wallet may connect; the add buttons appear
only for the Homebase wallet. [docs/live.md](docs/live.md) describes the
wallet and Homebase Live.

## 🗺️ Map

Events on the map come from Luma, and the list of them lives on Base: the
Homebase wallet pastes an event's link, pins it as an attestation through the
Ethereum Attestation Service, a contract Base ships, and the pin is up for
everyone within a minute. Only a wallet whose pins count sees the add form;
everyone else sees a connect button. Nothing is deployed and nothing is
configured: the site reads the attestations through EAS's free indexer and
writes them through the connected wallet. [docs/map.md](docs/map.md) has the
design, the research it rests on, the endpoints, and what is left to verify
against live services. The map opens on the whole world, flies down to an
event on its pin and back out when the card closes; it draws on OpenFreeMap's
tiles and needs no key of its own.

`bun run e2e` drives the whole flow in a real browser: a local chain with EAS
on it, the server with Luma answered from fixtures, a wallet the run holds
the keys to, connecting, pinning, removing, disconnecting and a wallet that
is turned away. It needs anvil (Foundry), port 3000 free and, once,
`bunx playwright install chromium`. With `E2E_TARGET=vercel` it runs the same
flow against the Vercel layout instead: the built `dist/`, the rewrites and
the functions in `api/` under Node.

```bash
bun run build
E2E_TARGET=vercel bun run e2e
```

## 📦 Deployment

### Vercel

Vercel's functions run on Node here (its Bun runtime is still in beta), so it
serves the client as static files and answers the JSON endpoints with functions
in `api/`.
The funding answer is cached for two minutes, the map's list for one and
Homebase Live's for five. The map's pins and Live's calendars are attestations
on Base, read per request through EAS's indexer; the pins are looked up on
Luma and the calendars fetched as iCal feeds.

`vercel.json` carries the build command and the routing, so the only project
settings are the environment variables:

- `HOMEBASE_FUNDING_ADDRESS` — optional. The Bankr address holding the
  creator's share of the $home fees. It defaults to the address in
  `api/funding.ts`, so this only needs setting to point the card somewhere
  else.
- `HOMEBASE_BASE_RPC` — optional. The Base JSON-RPC endpoint the fees are read
  from, defaulting to Base's public, rate-limited `https://mainnet.base.org`,
  which each instance reads at most once a minute. A provider's URL works the
  same way, and a key in it never appears in an answer.

An empty value counts as unset for every optional variable.

Neither the map nor Homebase Live needs a setting: a 503 from `/map.json` or
`/live.json` means EAS's indexer could not be reached, and the CDN keeps the
last list for an hour while that lasts.

$home's creator fees accrue in its pool's fee ledger, a Doppler hook on Base,
and only reach the address when someone claims them. The card reads that
ledger: the address's share of every WETH fee the pool has taken, collected or
still waiting, which claiming does not lower. The address's balance shows only
what has been claimed, and Bankr's API is no substitute: its lifetime total for
the address read 0 while more than 1 WETH sat unclaimed.

`api/funding.ts` is the one fee read: the Bun route imports it rather than
keeping a copy. It keeps its last good answer for an hour and serves it at once
while it refreshes, and the CDN keeps serving the last answer for an hour when a
read fails, so a slow or failing read costs the card nothing until that hour
runs out. A read that takes over five seconds counts as failed.

The same build runs locally:

```bash
bun run build   # writes dist/
```

### Fly.io

`bun start` runs the full Bun server, which is what the Dockerfile and
`fly.toml` deploy. It reads the same attestations on Base as the Vercel deploy
and keeps nothing on disk:

```bash
fly deploy
```

## 🧩 Farcaster Integration

The site integrates with Farcaster through the `@farcaster/frame-sdk` package, providing Frame support.

## 📄 License

[MIT](LICENSE)
