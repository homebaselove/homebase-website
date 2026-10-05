# Homebase Website

A modern, responsive web application for the Base community - a platform for builders and creators to feel at home. Homebase.

## 🏠 Overview

The Homebase website serves as a hub for the Base community, featuring:

- Live funding card for Based House, read from the creator fees the $home
  position has earned
- Interactive map of community events, pinned from their Luma links
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

Events on the map come from Luma: an admin pastes an event's link, the server
reads the event from its public page, and the pin is up for everyone within a
minute. [docs/map.md](docs/map.md) has the design, the research it rests on, the
endpoints, and what is left to verify against live services.

Locally, set `HOMEBASE_MAP_ADMIN_KEY` before `bun run dev` and use the key in
the map's "Add an event" dialog. The map draws on OpenFreeMap's tiles and needs
no key of its own.

## 📦 Deployment

### Vercel

Vercel's functions run on Node here (its Bun runtime is still in beta), have no
persistent disk for SQLite and nowhere to run the sync loops, so it serves the
client as static files and answers the JSON endpoints with functions in `api/`.
The events function parses the iCal feed per request and lets the CDN cache it
for five minutes; the funding answer is cached for two; the map's list for one
minute. The map's pins live in Turso, and a daily cron re-reads aged pins from
Luma.

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

- `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` — the map's database, from the
  Turso integration on the Vercel Marketplace. Without them `/map.json`
  answers with a 503 and the site shows an empty map.
- `HOMEBASE_MAP_ADMIN_KEY` — the key that lets an admin add events on the map.
- `HOMEBASE_ADMIN_ADDRESSES` — optional. Wallets that may sign in to add
  events, comma-separated.
- `HOMEBASE_SITE_HOSTS` — the hostnames the site is served on, comma-separated,
  which wallet sign-in messages are bound to. Vercel's own hostnames are known
  without it; set it for a custom domain and on Fly. Unset, only `localhost`
  can sign in with a wallet.
- `CRON_SECRET` — optional. Lets Vercel's daily cron call `/api/map-refresh`.
- `HOMEBASE_LOCK_CONTRACT` and the other `HOMEBASE_LOCK_*` variables —
  optional, for the $home lock gate once SeedMe's contract is known; see
  [docs/map.md](docs/map.md).

An empty value counts as unset for every optional variable.

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

`bun start` runs the full Bun server — file router, SQLite, the calendar sync
job and the map's hourly refresh — which is what the Dockerfile and `fly.toml`
deploy. The map's pins live in the SQLite file under `DATA_PATH`, or in the
same Turso database as the Vercel deploy when `TURSO_DATABASE_URL` is set:

```bash
fly deploy
```

## 🧩 Farcaster Integration

The site integrates with Farcaster through the `@farcaster/frame-sdk` package, providing Frame support.

## 📄 License

[MIT](LICENSE)
