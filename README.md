# Homebase Website

A modern, responsive web application for the Base community - a platform for builders and creators to feel at home. Homebase.

## 🏠 Overview

The Homebase website serves as a hub for the Base community, featuring:

- Live funding card for Based House, read from the creator fees the $home
  position has earned
- Interactive map of Homebase physical locations (Based Houses)
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

## 📦 Deployment

### Vercel

Vercel has no Bun runtime, no persistent disk for SQLite and nowhere to run the
calendar sync loop, so it serves the client as static files and answers
`/events.json` and `/funding.json` with functions in `api/`. The events function
parses the iCal feed per request and lets the CDN cache it for five minutes; the
funding answer is cached for two.

`vercel.json` carries the build command and the routing, so the only project
settings are the environment variables:

- `HOMEBASE_LIVE_ICAL` — the calendar feed URL. Without it `/events.json`
  answers with a 500 and the site renders with no events.
- `HOMEBASE_FUNDING_ADDRESS` — optional. The Bankr address that collects 100%
  of the $home creator fees. It defaults to the address in `api/funding.ts`, so
  this only needs setting to point the card somewhere else.
- `HOMEBASE_BANKR_API` — optional. Bankr's read API, defaulting to
  `https://api.bankr.bot`. Its creator-fee endpoints need no key.

An empty value counts as unset for both optional variables.

The fees accrue inside Bankr and only reach the address once someone claims
them, so the card shows Bankr's lifetime total of what the address has earned —
claimed and unclaimed together — rather than what the address is holding.
Reading the balance instead shows only what has already been withdrawn. The
endpoint reads every position the address earns fees from.

`api/funding.ts` is the one fee read: the Bun route imports it rather than
keeping a copy. It keeps its last good answer for an hour and serves it at once
while it refreshes, and the CDN keeps serving the last answer for an hour when a
read fails, so a slow or failing Bankr costs the card nothing until that hour
runs out. A read that takes over five seconds counts as failed.

The same build runs locally:

```bash
bun run build   # writes dist/
```

### Fly.io

`bun start` runs the full Bun server — file router, SQLite and the calendar sync
job — which is what the Dockerfile and `fly.toml` deploy:

```bash
fly deploy
```

## 🧩 Farcaster Integration

The site integrates with Farcaster through the `@farcaster/frame-sdk` package, providing Frame support.

## 📄 License

[MIT](LICENSE)
