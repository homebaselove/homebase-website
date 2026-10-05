# The Homebase map

The map shows where the community gathers: events pinned from their Luma
links. An admin pastes a link, the server reads the event from Luma, and the
pin appears for everyone within a minute. This document records the design,
the research behind each decision, and what is left to do.

## How it works

1. **Paste.** "Add an event" opens a dialog. A signed-in admin pastes a Luma
   link and looks it up. The server canonicalizes the link (host, slug, no
   tracking or ticket keys) and reads the event: title, start and end in UTC,
   the venue's IANA timezone, venue and address, coordinates, cover, hosts,
   and whether the address is public.
2. **Preview, then pin.** The dialog shows what Luma said, including anything
   that changes how the event is shown: a guests-only address pins the city,
   an online event is listed but not pinned. "Pin it" stores the event.
3. **Read.** `/map.json` lists live events and is cached at the CDN for a
   minute, so the store is read about once a minute however many people look.
   The client splits events into upcoming and past, draws pins with
   clustering, and keeps the list and the map in step.
4. **Stay fresh.** Pins are read from Luma again once their reading is six
   hours old: hourly on the Bun server, daily from Vercel's cron, or on demand
   by an admin. A rescheduled or relocated event moves; a cancelled one, which
   Luma deletes, is retired from the map.

## Decisions, and what they were weighed against

### Reading Luma

Every way of getting an event out of Luma was weighed. The sandbox this was
built in could not reach any Luma host, so each row rests on Luma's published
API schema, its help pages as search engines index them, and the source of
open-source clients read directly from GitHub and npm, dated where it matters.

| Channel                                                                                                                                                                               | Needs                                                           | Any public link?                                                      | Coordinates, timezone, address visibility                                             | Standing                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The event page's embedded JSON (`__NEXT_DATA__`, `props.pageProps.initialData`)                                                                                                       | nothing                                                         | yes                                                                   | yes, yes, yes                                                                         | the public page, read as a browser reads it; a Next.js router change on Luma's side would drop it                                                                              |
| Luma's own endpoint behind the page: `api.lu.ma/url?url=<slug>`, `api.lu.ma/event/get?event_api_id=<id>`, also served on `api.luma.com`; `api2.luma.com` appears in October 2026 code | nothing                                                         | yes                                                                   | yes, yes, yes                                                                         | undocumented, unchanged in client code from 2024 to October 2026; Luma's terms say "you must not access the Service by any means other than our publicly supported interfaces" |
| The page's schema.org `Event` markup                                                                                                                                                  | nothing                                                         | yes                                                                   | sometimes, no, no                                                                     | the markup Luma publishes for search engines: the most defensible read and the thinnest                                                                                        |
| A calendar's iCal feed, `api.lu.ma/ics/get?entity=calendar&id=cal-…`                                                                                                                  | nothing                                                         | only events on that calendar                                          | `GEO` yes; no timezone (UTC times), no visibility; the link sits inside `DESCRIPTION` | official: every public calendar offers "Add iCal Subscription"                                                                                                                 |
| The discover feed, `api.luma.com/discover/get-paginated-events?discover_place_api_id=…`                                                                                               | nothing                                                         | no, by city or category                                               | yes                                                                                   | undocumented; sends no CORS headers, so servers only                                                                                                                           |
| The sitemap, `sitemap.luma.com/sitemap.xml`                                                                                                                                           | nothing                                                         | lists every public event and calendar, about 60k URLs, no details     | no                                                                                    | a public artifact; answers "does this slug exist"                                                                                                                              |
| Official API, `public-api.luma.com/v1/entity/lookup?slug=`                                                                                                                            | Luma Plus key, $59 a month billed yearly, 200 requests a minute | yes                                                                   | no location at all                                                                    | official                                                                                                                                                                       |
| Official API, `/v1/event/get`, `/v1/calendar/list-events`, webhooks                                                                                                                   | Luma Plus                                                       | only the key's own calendar                                           | yes: `geo_address_json`, `coordinate`, `timezone`, `location_visibility`              | official                                                                                                                                                                       |
| Official API, `/v1/calendar/add-event` and `/v1/calendar/lookup-event?url=`                                                                                                           | Luma Plus                                                       | adds any Luma event to your calendar; lookup says whether it is there | n/a                                                                                   | official                                                                                                                                                                       |
| Official MCP server, `mcp.luma.com`                                                                                                                                                   | OAuth with any Luma account, no Plus                            | "look up event and calendar links"                                    | not yet verified                                                                      | official, built for assistants; OAuth through Client ID Metadata Documents, no dynamic registration                                                                            |
| Third-party scrapers (Apify actors, parse.bot)                                                                                                                                        | their fees                                                      | yes                                                                   | yes                                                                                   | someone else's scraping, with the same terms question                                                                                                                          |
| Fetching from the admin's browser                                                                                                                                                     |                                                                 |                                                                       |                                                                                       | not possible: Luma sends no CORS headers for other origins                                                                                                                     |

Evidence, by row: the page JSON and the endpoint are read by knod-events,
luma-event-scanner, omarchyevents (`geo_address_visibility`, `coordinate`,
`description_mirror`), luma-cal-mcp (`/url`, `/calendar/get-items`, the
`/discover` page's embedded JSON) and Luma-Discover (committed 2026-10-01,
whose worker forwards to `api2.luma.com`); the iCal feed by london-hackathons
(`GEO`, `ORGANIZER;CN`, the link in `DESCRIPTION`) and musenmingle, which
cites it as the "publicly supported interface" Luma's terms allow; the discover
feed and the sitemap by luma-monitor (committed 2026-10-05); the official API
by Luma's own OpenAPI document (61 paths) and the recorded response schema in
n8n-nodes-luma; the MCP server and the plan requirement by Luma's help pages;
CORS by Luma-Discover's README.

So an arbitrary pasted link can only be read the way a browser reads it. The
resolver tries, in order:

1. the event page's embedded JSON;
2. the same JSON from Luma's endpoint, on each host it answers on;
3. the page's schema.org markup.

Every field is checked with Effect Schema before it is trusted, since none of
these is a documented interface. A 404 from the page means Luma no longer
shows the event: cancelling deletes it, and private events answer the same
way. The endpoint only gets to say so when every host agrees and no page
exists to contradict it, so a host Luma retires cannot retire the pins.

Two officially supported paths are worth keeping in view:

- **A Homebase calendar on Luma.** Adding each pinned event to the community's
  own calendar (free, from Luma's UI) puts it on that calendar's official iCal
  feed, which the site can poll the way it already polls the workshop feed:
  times, `GEO`, the organizer and the link, with cancellations simply
  disappearing. The page read would still supply the cover, the timezone and
  the address visibility.
- **The MCP server.** If its link lookup returns coordinates for third-party
  events, it is the one officially supported way to resolve an arbitrary link
  without Luma Plus, at the cost of an OAuth session the server must keep.

Rejected: the official API as the primary source (paid, and blind to
third-party venues); geocoding addresses ourselves (Luma already provides
coordinates, and a geocoder adds a key and a terms-of-use question); scrapers
for hire (the same read, bought); fetching from the browser (no CORS).

### The map

**MapLibre GL JS 6 with OpenFreeMap's vector tiles.** No key, no quotas,
commercial use allowed, attribution added automatically, street-level zoom.
Markers are DOM buttons (supercluster groups them), so they take keyboard
focus and read aloud, and a synchronized list carries every event for anyone
who cannot use the map. MapLibre needs WebGL2; when it is missing the map
hides and the list stands alone.

Rejected: **Google Maps** (a billing account is required even inside the free
tier, usage above it is billed, and the old map's "for development purposes
only" watermark is exactly what a missing billing account looks like);
**Leaflet with raster tiles** (lighter and WebGL-free, but CARTO's tiles now
need a key, OpenStreetMap's own tile servers are not meant for production
sites, and Leaflet 2 is still alpha with its cluster plugin unported); a
**static SVG world map** (no network at all, but no street-level zoom).

MapLibre is served as the files its package ships rather than bundled: Bun's
bundler does not carry a library's worker across, and MapLibre finds its
worker next to its own module. `src/map/vendor.ts` names the version, the
build copies the files into `dist/vendor/`, and the Bun server serves them
from the package. The tile style is one constant in `src/ui/map/MapView.tsx`,
so a move to Protomaps or self-hosted tiles is a one-line change.

### Google Maps

Nothing to set up. The new map does not use Google Maps, and a search of the
new code finds no reference to it. The old map's watermark had a cause that
can be read in its source: it rendered `<APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_API_KEY || ""}>`
with a hard-coded `mapId="8c78d816c97d148e"`, and its `.env.example` names no
Google key, so the deploy ran with an empty key. Google's error documentation
lists a missing or invalid key and billing not being enabled as the conditions
that produce "This page can't load Google Maps correctly" and the "for
development purposes only" watermark. Since 1 March 2025 Google's Dynamic Maps
SKU gives 10,000 free map loads a month and bills $7 per 1,000 beyond, and a
Cloud billing account with a payment method is required even to use the free
allowance. MapLibre with OpenFreeMap has no key, no quota and no bill.

The one Google thing kept is free by design: the Directions button opens
Google's Maps URLs (`google.com/maps/dir/?api=1&destination=lat,lng`), which
Google documents as needing no API key at any volume, and which hand off to
the phone's maps app. Luma's page JSON also carries the venue's
`geo_address_info.place_id`, which those URLs accept as `destination_place_id`
for door-exact directions; storing it is a one-column follow-up.

### Storage

Vercel's functions have no disk, so the Vercel deploy keeps pins in
**Turso** (libSQL, SQLite's dialect, reached over HTTP) and the Bun server
keeps them in its SQLite file, or in the same Turso database when told to.
One set of SQL statements serves both, behind a `Store` that only runs a
statement and returns rows. The functions use `@libsql/client/web`, which is
plain `fetch`; the package's native binding is never loaded.

Rejected: committing a JSON file to the repository and redeploying (about
thirty seconds per write, a token that can also write code, and a second data
path for the Bun server); Vercel Blob (no atomic writes, sixty seconds of
cache staleness); Edge Config (a flags store with a small monthly write
allowance); Postgres (a second dialect to maintain next to SQLite).

### Who may add events

Two ways in today, with one design for what comes next:

- **Admin key.** `HOMEBASE_MAP_ADMIN_KEY`, pasted once into the dialog and
  kept in the browser. Compared in constant time.
- **Admin wallets.** Addresses in `HOMEBASE_ADMIN_ADDRESSES` sign in with
  Ethereum (ERC-4361): the server writes the message, binds it to the site's
  host, a single-use nonce and Base's chain id, and checks the signature by
  recovery for plain wallets or through ERC-6492's universal validator for
  smart wallets (Base Account, Safe), in one deployless call on Base. A
  session is a random token stored hashed, sent as a bearer header, which
  also works inside the Farcaster mini app's frame where cookies do not.
- **$home lockers, next.** The same sign-in gains a second rule: a wallet
  with enough $home locked gets the `locker` role for an hour. The read is
  configured, not coded: `HOMEBASE_LOCK_CONTRACT`, `HOMEBASE_LOCK_READ` (the
  view function's signature), `HOMEBASE_LOCK_MIN`, and the output indexes of
  the amount and the unlock time. It is tested against a stub chain and
  switches on the moment the contract is known.

What is not yet known is SeedMe's lock contract. It was not found in any
public repository, Doppler deployment list, or search. The quickest way to it:
ask the SeedMe team, or perform a small lock on seedme.xyz/lock and read the
"Interacted With" address and the emitted event on BaseScan, then copy the
view function's signature from the verified source. `$home` itself is
`0xB9A1E52f3ED678B01Ff5e256fDe43f26f9C01bA3` on Base.

Rejected: a shared key alone (no per-person identity, nothing to build the
lock gate on); Sign In with Farcaster as the primary identity (it proves a
Farcaster account, not the wallet that holds $home, and the Base app no
longer invokes it); cookies as the session transport (third-party inside the
mini app).

### The experience

- The list is the map's other half: hovering a row lifts its pin, selecting
  one opens its details and centers it; selecting a pin scrolls its row into
  view. Every event is in the list, pinned or not.
- Times read in the event's timezone, the way Luma shows them, with the
  viewer's own time alongside when it differs.
- Clusters show a count and split when zoomed; a cluster that will not split
  is one venue, and opens its first event instead.
- A guests-only address pins the city and says so. Online events are listed
  under their own label.
- Scrolling the page over the map never zooms it; touch panning takes two
  fingers. Animations honour reduced-motion.
- `?event=<slug>` on the home page opens an event, so a pin can be shared.
- Mobile gets the map above the list and the details over the map's lower
  edge; desktop gets them side by side.

Patterns kept from the first map: house markers in Homebase blue, a card per
marker with the Luma link, clusters that open into a list. Dropped: the
hand-written location array, the per-city contracts and their mapping bugs,
the fake loading screen, and the Google dependency.

## Data

One table, `MapEvent`, keyed by the Luma slug (the path on luma.com, which is
also the public id in `?event=`), with Luma's event id kept unique when known
so a renamed link replaces its older self. `lat` and `lng` are null for
online events and for events Luma could not place; `placement` says which.
`addedBy` is the wallet that pinned the event, or `admin` for the key. Two
small tables, `AuthNonce` and `AuthSession`, carry sign-ins.

## Endpoints

| Path                 | Method                        | Who                                 | What                                                   |
| -------------------- | ----------------------------- | ----------------------------------- | ------------------------------------------------------ |
| `/map.json`          | GET                           | anyone                              | live events, CDN-cached for a minute                   |
| `/map.json`          | POST `{ url }`                | admin or locker                     | reads the link and pins it; 201 new, 200 already there |
| `/map.json?slug=`    | DELETE                        | admin, or the wallet that pinned it | removes the pin                                        |
| `/map/preview.json`  | POST `{ url }`                | admin or locker                     | reads the link without pinning                         |
| `/map/refresh.json`  | POST or GET                   | admin, locker, or Vercel's cron     | reads Luma again for aged pins                         |
| `/auth/nonce.json`   | POST `{ address }`            | anyone, when wallet sign-in is open | the message to sign                                    |
| `/auth/verify.json`  | POST `{ message, signature }` | anyone                              | a session token and role                               |
| `/auth/session.json` | GET, DELETE                   | bearer                              | who the token is; sign out                             |

`src/map/api.ts` answers all of them against the web's `Request` and
`Response`; `api/*.ts` hands Vercel's requests to it and `src/map/bun.ts`
hands the Bun server's. Sign-in and write endpoints are rate limited per
address.

## Configuration

| Variable                                                                                                                     | Where                             | Meaning                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`                                                                                     | Vercel (required), Fly (optional) | the hosted database; `https://<db>-<org>.turso.io`. Install Turso from the Vercel Marketplace or create one at turso.tech. The Bun server uses it too when set, otherwise its SQLite file. |
| `HOMEBASE_MAP_ADMIN_KEY`                                                                                                     | both                              | the shared admin key; unset means no key sign-in                                                                                                                                           |
| `HOMEBASE_ADMIN_ADDRESSES`                                                                                                   | both                              | comma-separated wallets that may sign in as admins                                                                                                                                         |
| `HOMEBASE_LOCK_CONTRACT`, `HOMEBASE_LOCK_READ`, `HOMEBASE_LOCK_MIN`, `HOMEBASE_LOCK_AMOUNT_INDEX`, `HOMEBASE_LOCK_END_INDEX` | both                              | the $home lock gate; unset until the contract is known                                                                                                                                     |
| `HOMEBASE_BASE_RPC`                                                                                                          | both                              | already used by the funding card; also checks smart-wallet signatures and locks                                                                                                            |
| `CRON_SECRET`                                                                                                                | Vercel                            | lets the daily cron call `/api/map-refresh`                                                                                                                                                |
| `DATA_PATH`                                                                                                                  | Fly                               | where the SQLite file lives                                                                                                                                                                |

Without any of the admin settings the map is read-only and the dialog says so.

## What still needs a hand

The sandbox this was built in could not reach Luma, Base, OpenFreeMap or
Turso, so these were verified against documentation, Luma's published API
schema, open-source clients, and stub servers rather than live services:

1. **Luma's page shape.** Run, from any machine, for a public event slug:

   ```sh
   SLUG=some-public-event
   curl -sL -A "Mozilla/5.0" https://luma.com/$SLUG | grep -o '<script id="__NEXT_DATA__"' && echo "embedded JSON present"
   curl -s "https://api.lu.ma/url?url=$SLUG" | head -c 600
   ```

   Then paste the link into the dialog on a deploy with the admin key set.
   `source` in the preview answer says which reader answered.
2. **Wallet sign-in** with a plain wallet, with Coinbase Smart Wallet (which
   exercises the ERC-6492 path), and inside the Farcaster mini app.
3. **Tiles** in Safari, Chrome and the Base app's web view.
4. **Turso** on the Vercel deploy: install it from the Marketplace, set the
   admin key, pin an event.
5. **The MCP server.** From Claude Code: `claude mcp add --transport http luma https://mcp.luma.com`,
   sign in, then ask it to look up a third-party event link and see whether
   the answer carries coordinates and a timezone.

## Later

- Wire the $home lock once SeedMe's contract is known: five environment
  variables, no code.
- Read a Homebase calendar's official iCal feed as a second sync path, so
  events added to the calendar on Luma appear without pasting.
- Check-ins: the first map minted a soulbound token per city. A single
  contract keyed by event, with the pinned coordinates, would revive the idea
  without the per-city deployments.
- Seed history: the first map's fifty-two Base Batch Workshop cities and
  their links are in the research notes and could be pinned as past events.
