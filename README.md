# Homebase Website

A modern, responsive web application for the Base community - a platform for builders and creators to feel at home. Homebase.

## 🏠 Overview

The Homebase website serves as a hub for the Base community, featuring:

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
`/events.json` with a function in `api/` that parses the iCal feed per request
and lets the CDN cache it for five minutes.

`vercel.json` carries the build command and the routing, so the only project
setting needed is the environment variable:

- `HOMEBASE_LIVE_ICAL` — the calendar feed URL. Without it `/events.json`
  answers with a 500 and the site renders with no events.

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
