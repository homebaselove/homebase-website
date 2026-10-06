# The Homebase map

The map shows where the community gathers: events pinned from their Luma
links. A wallet the registry on Base lets in pastes a link and pins it with a
transaction, and the pin appears for everyone within a minute. This document
records the design, the research behind each decision, and what is left to do.

## How it works

1. **Connect.** "Connect wallet" opens a dialog listing the wallets on the
   page and Coinbase's. The connected wallet is put to the registry's
   `canPin`: the admin wallet passes, and later any wallet the gate vouches
   for. Everyone else is told so and never sees the form.
2. **Paste, preview, pin.** The wallet pastes a Luma link and looks it up.
   The server canonicalizes the link (host, slug, no tracking or ticket keys)
   and reads the event: title, start and end in UTC, the venue's IANA
   timezone, venue and address, coordinates, cover, hosts, and whether the
   address is public. The dialog shows what Luma said, including anything
   that changes how the event is shown: a guests-only address pins the city,
   an online event is listed but not pinned. "Pin it" sends `pin(slug)` to
   the registry from the wallet: one transaction, a few cents on Base.
3. **Read.** `/map.json` reads the registry's list with one `eth_call`, looks
   each slug up on Luma, and is cached at the CDN for a minute, so the chain
   and Luma are read about once a minute however many people look. The
   client splits events into upcoming and past, draws pins with clustering,
   and keeps the list and the map in step.
4. **Stay fresh.** What Luma said about a pin stands for thirty minutes, then
   it is read again on the next list. A rescheduled or relocated event moves;
   a cancelled one, which Luma deletes, drops off the map; Luma being down
   leaves the last reading in place. Nothing runs on a schedule.

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

### Where the pins live

The pins are Luma slugs in a contract on Base, `contracts/HomebaseMap.sol`:
`pin(slug)` and `unpin(slug)`, an `admin`, a `gate` the admin can point at
another contract, and `list()` for anyone. The site holds nothing else: no
database, no sessions, no secrets, and nothing to set on Vercel. The server
reads the registry through Base's public RPC (`HOMEBASE_BASE_RPC` names a
provider instead), and the browser reads and writes it through the connected
wallet's own provider, so it needs no RPC of its own.

Each pin costs its sender gas: `pin` writes a few storage slots, roughly
100k to 200k gas, one to ten cents at Base's usual 0.05 to 0.3 gwei; `unpin`
refunds some of it. The contract keeps the list in order and takes a pin off
by moving the last one into its place, so removal costs no more than a pin.
The admin may take any pin off, a pinner only their own.

Weighed against it, and why not: Turso or any hosted database (a credential
that has to live in Vercel's settings, which is where the first deploy of
this map stalled); committing a JSON file to the repository (a GitHub token
with write access, half a minute per change, and no wallet gate); Vercel
Blob, KV and Edge Config (tokens made in the dashboard, no atomic writes);
the Ethereum Attestation Service (no contract to deploy, but reads through
its indexer or log queries, and a gate that can only be applied when
reading); a Luma calendar's own iCal feed as the whole store (official and
free, with coordinates, but no wallet gate and no timezone); Fly behind
`vercel.json` rewrites (keeps a server store, adds a second platform to run
and pay for). The registry is the one route where "my wallet now, $home
lockers later" is enforced by the thing that holds the data.

### Who may add events

The registry decides, with `canPin(address)`:

- **The admin wallet.** The Homebase wallet,
  `0x3D140B892437dD7857701098415deB2daaE03A40`, given to the contract when
  it is deployed; `setAdmin` hands the role on. The admin may also take any
  pin off and point the registry at a gate.
- **$home lockers, next.** `contracts/LockGate.sol` answers `allowed(who)`
  with whether `lockedBalanceOf(who)` on a lock contract is at least a
  minimum. Once SeedMe's lock contract is known, deploy the gate with its
  address and the minimum, and have the admin call `setGate` on the
  registry: one transaction, no site deploy. A gate that reverts lets nobody
  through, and `setGate(0)` puts it aside. The suite proves the whole path
  with a stub lock on a local chain; LockGate's read is adjusted if SeedMe's
  interface turns out to differ.

What is not yet known is SeedMe's lock contract. It was not found in any
public repository, Doppler deployment list, or search. The quickest way to it:
ask the SeedMe team, or perform a small lock on seedme.xyz/lock and read the
"Interacted With" address and the emitted event on BaseScan, then copy the
view function's signature from the verified source. `$home` itself is
`0xB9A1E52f3ED678B01Ff5e256fDe43f26f9C01bA3` on Base.

Removed, in turn: the shared admin key the first cut took (no per-person
identity, one more secret to keep), then Sign-In with Ethereum sessions with
an admin list in the environment (a database for nonces and sessions, and a
deployment setting to carry, both of which the registry makes unnecessary).
Rejected: Sign In with Farcaster as the primary identity (it proves a
Farcaster account, not the wallet that holds $home, and the Base app no
longer invokes it).

### Connecting a wallet

The page runs on Preact, which rules out every connect kit: `wagmi` (the
hooks), RainbowKit, ConnectKit and OnchainKit all require React 18 and
TanStack Query. `@wagmi/core` 3.6.5 is the framework-free layer beneath them:
it peers on `viem` 2.x alone (its other peers, `@tanstack/query-core`, the
Tempo `accounts` SDK and `typescript`, are optional) and depends on `mipd`,
`zustand` and `eventemitter3`. It gives `connect`, `reconnect` and
`disconnect` over any EIP-1193 provider; viem's actions on the connected
wallet's client do the rest, `readContract` for `canPin` and `admin`,
`simulateContract` so a pin the registry would refuse fails before the wallet
opens, then `writeContract` and `waitForTransactionReceipt`. After a reload
the page picks the last wallet back up with `reconnect`, without a prompt,
when the wallet still allows it; the wallet's id is all that is remembered.

Every wallet reaches it through its `injected` connector with a provider
handed in:

- wallets that announce themselves on the page (EIP-6963), which wagmi lists
  with their own names and icons, and a `window.ethereum` fallback for one
  that only does that;
- Coinbase's smart wallet through `@coinbase/wallet-sdk` 4.4.0, which opens a
  passkey flow for people with no extension, so a Base user needs nothing
  installed; offered unless an announced wallet is already Coinbase's;
- inside a Farcaster mini app, the host's wallet from
  `sdk.wallet.getEthereumProvider()`, through the `@farcaster/frame-sdk` the
  page already carries for its ready call; there it is the only wallet
  offered.

Not used: `@wagmi/connectors`, whose optional peers (every wallet SDK it
wraps) the bundler would have had to resolve; WalletConnect, which needs a
Reown project id and its relay; the Farcaster wagmi connector packages,
written for wagmi v2's connector shape.

The wallet code is a bundle of its own at `/wallet/wagmi.js`, built by
`Bun.build` with code splitting from `src/wallet/wagmi.ts`: the page fetches
it the first time Connect is pressed, and the Coinbase SDK is a chunk inside
it, fetched only when that wallet is chosen. On Vercel the build writes it to
`dist/wallet`; the Bun server builds it in memory as it starts and serves it
from the same path (`src/wallet/walletRoute.ts`). Bundled into the page
instead, wagmi's config module was dropped by effect-start's in-memory
bundler, and turning on splitting there pulled the server routes into the
client through the route manifest. Minified sizes:

| Fetched                                | Raw    | Gzipped |
| -------------------------------------- | ------ | ------- |
| the page, as before                    | 496 KB | 147 KB  |
| the wallet entry and its shared chunks | 180 KB | 56 KB   |
| the Coinbase chunk, on choosing it     | 109 KB | 35 KB   |

### The experience

- The list is the map's other half: hovering a row lifts its pin, selecting
  one opens its details and brings its pin into the part of the map the card
  leaves open, beside it on a wide screen and above it on a phone, where the
  map also scrolls back into view; selecting a pin scrolls its row into view.
  Every event is in the list, pinned or not.
- Times read in the event's timezone, the way Luma shows them, with the
  viewer's own time alongside when it differs.
- Clusters show a count and split when zoomed; a cluster that will not split
  is one venue, and opens its first event instead. Opening an event zooms
  until its pin stands on its own, and its card links the other events at
  the same spot.
- A guests-only address pins the city and says so. Online events are listed
  under their own label.
- Scrolling the page over the map never zooms it; touch panning takes two
  fingers. Animations honour reduced-motion.
- `?event=<slug>` on the home page opens an event, so a pin can be shared.
- The add form is for a wallet the registry lets in. Everyone else has a
  connect button, and a wallet the registry does not know is told so without
  ever seeing the form.
- Mobile gets the map above the list and the details over the map's lower
  edge; desktop gets them side by side.

Patterns kept from the first map: house markers in Homebase blue, a card per
marker with the Luma link, clusters that open into a list. Dropped: the
hand-written location array, the per-city contracts and their mapping bugs,
the fake loading screen, and the Google dependency.

## Data

The chain holds `(slug, by, pinnedAt)` per pin and nothing more: the slug is
the path on luma.com, which is also the public id in `?event=`. Everything
shown comes from Luma at read time, kept per server process for thirty
minutes: `lat` and `lng` are null for online events and for events Luma
could not place, and `placement` says which; `addedBy` and `addedAt` come
from the chain. A renamed link keeps its pin under the slug it was pinned
with, which Luma redirects; the newer link pins alongside until one is taken
off.

## Endpoints

| Path                | Method         | Who                    | What                                                            |
| ------------------- | -------------- | ---------------------- | --------------------------------------------------------------- |
| `/map.json`         | GET            | anyone                 | the pins, read from the chain and Luma, CDN-cached for a minute |
| `/map/preview.json` | POST `{ url }` | anyone, within a limit | reads the link without pinning                                  |

Pinning and removing are transactions to the registry, not requests to the
site. `src/map/api.ts` answers both routes against the web's `Request` and
`Response`; `api/*.ts` hands Vercel's requests to it and `src/map/bun.ts`
hands the Bun server's. The preview is rate limited per address.

## Configuration

| Variable                | Where          | Meaning                                                                                                           |
| ----------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `HOMEBASE_BASE_RPC`     | both, optional | the Base RPC the server reads the registry with, and the funding card its fees; Base's public endpoint unless set |
| `HOMEBASE_MAP_REGISTRY` | tests only     | the registry's address on another chain; the site carries the real one in `src/map/registry.ts`                   |
| `DATA_PATH`             | Fly            | where the calendar sync's SQLite file lives                                                                       |

Nothing about the map needs a setting on Vercel: the registry's address is in
the code, the admin is in the contract, and the form is shown to a wallet the
registry lets in. Until the address is in the code, `/map.json` answers an
empty list with `registry: null`, and the dialog says the registry is not
deployed yet.

## Validation

The design was checked three ways before this was called done.

**Rendered from the code.** Headless Chromium drove the built site against a
seeded database, an offline basemap in place of OpenFreeMap and a stub in
place of Luma, through eleven screens: the page, the overview, a pin whose
address is guests-only, the card closed, a one-venue cluster, the past view,
the dialog signed out, signed in, a look-up, the pin it made, and the phone
layout with and without a card. What that found, and what changed:

- The details card had lost its width and position: the Tailwind plugin in
  effect-start pairs every quote character in a component file, and an
  apostrophe in a comment had shifted the pairing. The components are now
  written without stray quotes, and `bun run check:classes` reports a file
  at risk before it reaches a build.
- The chosen pin sat under its own card, at the card's edge on a wide screen
  and behind it on a phone. The camera now measures the card and keeps the
  pin beside it, or above it when there is no room beside.
- A one-venue cluster opened an event but kept the count on the map and said
  nothing of the others; it now zooms until the pin is its own marker and the
  card lists the events at the same spot.
- A newly pinned event was listed but the map stayed where it was; it now
  moves to the pin.
- The list refreshes every minute to move events from upcoming to past, and
  each refresh reset the view; the map now ignores a list whose pins have
  not changed.
- On a phone, a row chosen from the list opened a card out of sight above;
  the map now scrolls back into view.

**Reviewed for security.** The site now holds no secret and no session, so
the surface is small: the registry decides who writes, and enforces that a
pin is removed by the admin or the wallet that added it; the server only
reads the chain, with the response decoded against a fixed ABI and every
slug checked against the shape Luma uses before it is looked up; the resolver
only ever fetches Luma's own hosts and drops a redirect elsewhere; no Luma
text reaches `innerHTML`; the vendor route serves an exact allow-list of
files; the preview is rate limited per address. An earlier review of the
sign-in design found the host a message was bound to coming from request
headers, which was fixed then and is moot now that nothing is signed. One
trade-off stands: `addedBy` in the public list names the wallets that pinned
events, which are public on the chain anyway.

**Tested.** Sixty tests under `bun test`: the resolver against Luma's three
page shapes and its endpoints; the API over a stub chain and a stub Luma
(the list with who pinned what, a pin Luma has lost, a slug the contract
should not have let in, readings that stand in while Luma is down, no
registry, a chain that does not answer, the preview and its limit); and,
when anvil is on the PATH or in `ANVIL_BIN`, the contract itself on a local
chain: who may pin, double pins and bad slugs, removal keeping the list
whole, the lock gate letting a locker through and no further, a gate that
breaks, and handing the admin on.

**Driven end to end.** `bun run e2e` starts a local chain (anvil), deploys
the registry on it with the suite's own admin wallet, starts the Bun server,
or with `E2E_TARGET=vercel` the Vercel layout under Node (`e2e/vercel.ts`:
the built `dist/`, the rewrites in `vercel.json`, the functions in `api/`),
pointed at that chain with Luma answered from fixtures, and opens the site in
Chromium. A wallet whose keys the run holds is announced to the page the way
extensions are (EIP-6963); it answers accounts and the chain itself, signs
and sends the transactions the page asks for, and passes every other request
on to the chain. The run walks through a visitor seeing only the way in, the
admin connecting and getting the form, a look-up, a pin as one transaction
found on the chain and on the map, the wallet picked back up after a reload,
removal, disconnecting, a stranger turned away without the form, a lock gate
set on the registry over a stub lock, a locker pinning under its own wallet,
allowed to remove its own pin and not the admin's, and a deep link on a
phone-sized screen: fifteen checks, a screenshot of each step. Only Luma,
the tiles and the chain's distance are stubbed. A failed run leaves a
screenshot, the page's text and the server's log.

## What still needs a hand

The sandbox this was built in could not reach Luma, Base or OpenFreeMap, so
these were verified against documentation, Luma's published API schema,
open-source clients, and local stand-ins rather than live services:

1. **Deploy the registry.** From a machine with a wallet that holds a few
   cents of ETH on Base:

   ```sh
   DEPLOYER_KEY=0x… bun scripts/deploy-registry.ts
   ```

   It deploys `contracts/HomebaseMap.sol` with the Homebase wallet as admin
   (`--admin` for another) and prints the address. Put it into
   `RegistryAddress` in `src/map/registry.ts`, commit, and deploy the site.
   `forge create` does the same for those who have Foundry; the deploy
   script's header has the command. Verifying the source on BaseScan or
   Sourcify is optional and needs no key.
2. **Luma's page shape.** Run, from any machine, for a public event slug:

   ```sh
   SLUG=some-public-event
   curl -sL -A "Mozilla/5.0" https://luma.com/$SLUG | grep -o '<script id="__NEXT_DATA__"' && echo "embedded JSON present"
   curl -s "https://api.lu.ma/url?url=$SLUG" | head -c 600
   ```

   Then connect the Homebase wallet on the deployed site, paste the link,
   and pin it. `source` in the preview answer says which reader answered.
3. **A real wallet.** Coinbase Smart Wallet (its passkey popup, and that its
   `eth_sendTransaction` answers with the transaction hash the page waits
   on), an extension, and the host's wallet inside the Farcaster mini app.
   The suite covers the flow with a wallet it holds the keys to; a connect or
   transaction a real wallet refuses is reported with the wallet's own
   reason, in the dialog and in the browser console.
4. **Base's public RPC** under real traffic: the server reads the registry
   once a minute per CDN region, the same endpoint the funding card already
   uses. If it ever rate limits, `HOMEBASE_BASE_RPC` takes a provider's URL;
   nothing else changes.
5. **Tiles** in Safari, Chrome and the Base app's web view.
6. **The MCP server.** The sandbox's network policy refused every Luma host,
   `mcp.luma.com` included, so its lookup is untested here. From Claude Code:
   `claude mcp add --transport http luma https://mcp.luma.com`, sign in, then
   ask it to look up a third-party event link and see whether the answer
   carries coordinates and a timezone. Third-party write-ups show a lookup
   returning the name, cover and times; none shows coordinates. If they are
   there, the server could read links through it with a Luma account instead
   of the page.

## Later

- Wire the $home lock once SeedMe's contract is known: deploy
  `contracts/LockGate.sol` with its address and a minimum, and have the admin
  call `setGate` on the registry. No site deploy.
- Read a Homebase calendar's official iCal feed as a second sync path, so
  events added to the calendar on Luma appear without pinning.
- Check-ins: the first map minted a soulbound token per city. The registry
  already keys events by slug; a check-in contract keyed the same way would
  revive the idea without the per-city deployments.
- Seed history: the first map's fifty-two Base Batch Workshop cities and
  their links are in the research notes and could be pinned as past events.
