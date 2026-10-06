# Homebase Website

A modern, responsive web application for the Base community - a platform for builders and creators to feel at home. Homebase.

## 🏠 Overview

The Homebase website serves as a hub for the Base community, featuring:

- Live funding card for Based House, read from the creator fees the $home
  position has earned
- Interactive map of community events, pinned from their Luma links
- The Based House story: a scroll-snapped reel of every house, the Base Batches
  workshops and the Homebase Map, with each chapter's figures and sources
- Upcoming workshops and events with timezone support
- Video gallery of past events and workshops
- Farcaster Frame integration

## 🚀 Tech Stack

- **Framework**: [SolidJS](https://www.solidjs.com/) with [SolidStart](https://start.solidjs.com/)
- **Styling**: [TailwindCSS](https://tailwindcss.com/)
- **Build Tool**: [Vinxi](https://github.com/nksaraf/vinxi)
- **Runtime**: [Bun](https://bun.sh/)

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

## 🗺️ Map

Events on the map come from Luma, and the list of them lives on Base: the
Homebase wallet pastes an event's link, pins it as an attestation through the
Ethereum Attestation Service, a contract Base ships, and the pin is up for
everyone within a minute. Only a wallet whose pins count sees the add form;
everyone else sees a connect button. Nothing is deployed and nothing is
configured: the site reads the attestations through EAS's free indexer and
writes them through the connected wallet. [docs/map.md](docs/map.md) has the
design, the research it rests on, the endpoints, and what is left to verify
against live services. The map draws on OpenFreeMap's tiles and needs no key
of its own.

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

Vercel's functions run on Node here (its Bun runtime is still in beta), have no
persistent disk for SQLite and nowhere to run the sync loops, so it serves the
client as static files and answers the JSON endpoints with functions in `api/`.
The events function parses the iCal feed per request and lets the CDN cache it
for five minutes; the funding answer is cached for two; the map's list for one
minute. The map's pins are attestations on Base, read per request through
EAS's indexer and looked up on Luma.

`vercel.json` carries the build command and the routing, so the only project
settings are the environment variables:

- `HOMEBASE_LIVE_ICAL` — the calendar feed URL. Without it `/events.json`
  answers with a 500 and the site renders with no events.
- `HOMEBASE_FUNDING_ADDRESS` — optional. The Bankr address holding the
  creator's share of the $home fees. It defaults to the address in
  `api/funding.ts`, so this only needs setting to point the card somewhere
  else.
- `HOMEBASE_BASE_RPC` — optional. The Base JSON-RPC endpoint the fees are read
  from, defaulting to Base's public, rate-limited `https://mainnet.base.org`,
  which each instance reads at most once a minute. A provider's URL works the
  same way, and a key in it never appears in an answer.

An empty value counts as unset for every optional variable.

The deploy reads its own gaps back: `/events.json` answering 500 means
`HOMEBASE_LIVE_ICAL` is missing, and a variable added for Production alone is
not there on a preview deployment of a branch. The map needs no setting: a
503 from `/map.json` means EAS's indexer could not be reached, and the CDN
keeps the last list for an hour while that lasts.

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

`bun start` runs the full Bun server — file router, the calendar sync job and
its SQLite file under `DATA_PATH` — which is what the Dockerfile and `fly.toml`
deploy. The map reads the same attestations on Base as the Vercel deploy:

```bash
fly deploy
```

## 🧩 Farcaster Integration

The site integrates with Farcaster through the `@farcaster/frame-sdk` package, providing Frame support.

## 📄 License

[MIT](LICENSE)
