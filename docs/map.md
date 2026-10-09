# The Homebase map

The map shows where the community gathers: events pinned from their Luma
links. The Homebase wallet pastes a link and pins it with an attestation on
Base, and the pin appears for everyone within a minute. This document records
the design, the research behind each decision, and what is left to do.

## How it works

1. **Connect.** The one wallet button on the page, top right of the header,
   opens a dialog listing the wallets on the page and Coinbase's; the same
   connection serves Homebase Live and the Donate button
   ([docs/live.md](live.md)). A wallet whose pins count, the Homebase wallet
   today, sees the map's Add an event button; everyone else never sees it.
2. **Paste, preview, pin.** The wallet pastes a Luma link and looks it up.
   The server canonicalizes the link (host, slug, no tracking or ticket keys)
   and reads the event: title, start and end in UTC, the venue's IANA
   timezone, venue and address, coordinates, cover, hosts, and whether the
   address is public. The dialog shows what Luma said, including anything
   that changes how the event is shown: a guests-only address pins the city,
   an online event is listed but not pinned. "Pin it" attests the slug on
   Base from the wallet, through the Ethereum Attestation Service: one
   transaction, a few cents, two the very first time while the map's schema
   is registered.
3. **Read.** `/map.json` asks EAS's indexer for the live attestations under
   the map's schema by the wallets that count, looks each slug up on Luma,
   and is cached at the CDN for a minute, so the indexer and Luma are read
   about once a minute however many people look. The client splits events
   into upcoming and past, draws pins with clustering, and keeps the list
   and the map in step.
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

### From the world to an event

The map opens on the whole world, so a visitor sees at a glance where the
community is gathering, and a pin flies the camera down to its event. Closing
the event flies back out. The design was settled from MapLibre 6.12's own
typings and source, renders of the alternatives with the site's markers, and
what the maps people use every day do at their top level.

**Flat world rather than globe.** MapLibre 6 draws a globe with one style
property, and its `globe` projection is a sphere up to zoom 11 that turns into
the flat map by zoom 12, so a flight down to a street would cross over on its
own. Google Maps has shown a globe at its top level on desktop since 2018 and
Apple Maps since iOS 15, so a globe is the convention for a map you navigate.
This map is a map of pins, and a globe hides the half of them on its far side:
rendered at the map's desktop size with pins in San Francisco, New York,
London, Lisbon, Mumbai, Buenos Aires and Singapore, the globe centred on the
Atlantic showed five of seven, and MapLibre fades markers behind the horizon to
a fifth of their opacity by default. The flat world shows every pin at once,
reads as the familiar world map, and is what was asked for. The globe is one
line away (the style's `projection`, a `GlobeControl`, and markers with
`opacityWhenCovered: 0`) and would suit a phone, where a sphere fills the
width better than a strip; it is listed under Later.

**The overview is computed, not fitted.** MapLibre draws the world 512 pixels
wide at zoom zero and twice as wide per level, so the zoom that lays the whole
world across the map follows from the map's width: `src/ui/map/camera.ts`,
with tests. `fitBounds` on a box spanning the whole world came back a tenth of
a level out in either direction in the renders, with the padding ignored, so it
is not used for this. World copies are off, so one world sits edge to edge
with nothing rolling in at the sides, and the camera is centred between the
top of Greenland and the Antarctic coast, so a wide map crops the poles rather
than the people. The overview is also the floor under zooming out, set again
when the map resizes. `maxBounds` was weighed and dropped: it raises the floor
until the world fills the map and forbids panning up to the poles.

**Flights, not zooms.** Coming in from the world to a town is a change of some
eleven levels, and easing that is a zoom down a well. The camera flies instead:
MapLibre's `flyTo` follows van Wijk and Nuij's path, arcing out and back in,
with a curve of 1.42, the value the participants in their study chose on
average. The flight down takes 1.8 seconds and the flight back out 1.2, and the
arc may not dip below the overview. A move of three levels or fewer, such as a
cluster splitting or a second event in the same city, eases in the ordinary
way, and a shared link opens on its event at once, with no flight to sit
through. MapLibre turns every one of these into a jump when the viewer has
asked for reduced motion. Markers are placed at subpixel precision, since
whole pixels make a marker stutter along a flight.

**Whose camera it is.** A drag, a wheel, a pinch, a key or a zoom button marks
the camera as the viewer's, after which closing a card and a refreshed list
leave it alone until something flies it. A world button under the zoom buttons
brings the whole world back; it only shows once the camera has left the world,
so the overview carries no control it does not need. The map is seen from
straight above: no tilt, and north stays up, so nothing a thumb does on a phone
leaves it askew. Page scrolling over the map never zooms it, and touch panning
takes two fingers, as before.

**A link lands on the map.** The map starts when it is near the viewport, so a
shared `?event=` link, which used to open at the top of the page with the map
below the fold, now scrolls the map into view and opens on its pin.

Kept in view for later rather than built: a "you are here" from the browser's
geolocation (a permission prompt on first visit, for a map that already shows
where to look); a slow turn of the globe while idle (motion for its own sake);
a dark style (the page is light).

### The badges, the preview, and the hand-off to Luma

The first Homebase map was a wall of round blue houses across a Google map,
and that boldness is worth keeping. What it lacked was any way to tell what a
marker was before clicking it, and anything to stop ten of them piling onto
Europe. The map now draws a round house badge on each event from the world
down to a region, and the pin on the exact spot from zoom 7 in, where a point
means something. Where events would overlap at a zoom, one badge carries a
count. Hovering any marker, on a device whose pointer can hover, opens a
preview with the title, the date in the event's timezone and a link to Luma;
a cluster's preview lists up to three of its events, each a link, and says how
many more a zoom would show. The card keeps Open on Luma, Add to calendar and
Directions under the place line, in view without scrolling; Add to calendar
opens Google Calendar or saves an .ics file for Apple Calendar, Outlook and
the rest, linking back to the event. An event held somewhere reads in its own
zone with the viewer's time beside it, and an online one in the viewer's
zone, as Luma shows them. The soonest
upcoming event wears a ring on its marker, breathing once every few seconds
and still for anyone who asked for less motion, with a Next up tag in the
list and the preview: the list is ordered by date and the map was not, and
one mark carries the order over.

What this rests on:

- **Target size.** WCAG 2.2's SC 2.5.8 asks for 24 CSS pixels at level AA
  and SC 2.5.5 for 44 at AAA; Apple's Human Interface Guidelines say 44
  points and Material 48 dp. The badge is 52 pixels, the pin a 36 by 44
  target, the list rows far larger, and clustering keeps neighbouring
  targets apart instead of overlapping.
- **What a hover may hold.** Nielsen Norman Group's tooltip guidelines:
  never hide information needed for a task solely behind a hover, since
  people may not hover long enough and touch devices cannot hover at all;
  mind timing, position and keyboard access. Everything in the preview is
  also in the card, which a tap or Enter opens; the preview only exists
  where `(hover: hover)` is true, lingers 160 ms after the pointer leaves so
  the link can be reached, and closes on click or when its marker is redrawn.
- **Previews that save a step.** Wikipedia's Page Previews, hover cards on
  links, were tested from 2015 to 2018 with surveys and A/B tests across
  several language editions; readers found them useful and not distracting,
  and reached context with fewer page loads. The preview here does the same
  for Luma: one hover and one click from the world to the RSVP page, with
  the card there for everything else.
- **Clusters.** Research on clustering markers (the PeerJ preprint
  "Rethinking the usage and experience of clustering markers in web mapping"
  and "The Marker Cluster: A Critical Analysis") finds clusters overused as
  a performance fix and poorly understood when a count hides what is inside,
  and best understood for precise point data, which events are. The map
  clusters only where markers would overlap (48 pixels), keeps the house
  with the count beside it, and lets the preview list what the cluster
  holds, so a cluster is never a dead end. With a few dozen events the HTML
  markers cost nothing; past a few hundred, MapLibre's symbol layers would
  take over.
- **The list.** The pattern Airbnb made familiar: a list and a map of the
  same things, hovering one highlighting the other, choosing one moving the
  other. The hover sync now runs both ways.
- **Durations.** Material's guidance puts screen transitions at 300 to 400
  ms. A map flight is a different thing, the camera travelling, where the
  time conveys the distance; van Wijk and Nuij's study of zoom-and-pan
  animation is behind the curve of 1.42 and the 1.8-second flight, and the
  card appears at once, so nothing waits on it.
- **Scrolling.** Google added cooperative gesture handling to embedded maps
  in 2016 because people got stuck on a map that caught their swipe and had
  to reload the page; two fingers pan and ctrl with the wheel zooms. On
  since the first version of this map.

Beyond the common pattern: one hover to Luma from the world, clusters
included; the world as the home view with a flight down and a flight back,
the world button appearing only when away; a card that shows at once with the
flight behind it; the pin kept clear of its card by measuring the card; links
that land on the map; reduced motion honoured by MapLibre itself.

Weighed and left out, with what would bring each back:

- A single click on a marker opening Luma: refused, since one badge can
  hold several events, a map click leaving the site surprises and a thumb
  taps by accident while panning, and the card carries the time in the
  viewer's zone, the calendar, directions and the admin's remove.
- City names under the badges at the world: fewer hovers, but clutter in a
  crowded region; try with the real pins.
- Ordering the list by the viewer's part of the world, read from the
  browser's timezone with no permission prompt: research on map views notes
  that people expect proximity ordering, but an events list promises date
  order, Luma's own included, and a timezone misplaces anyone travelling. The
  list stays in date order, with the ring marking what is next.

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

The pins are attestations on Base through the Ethereum Attestation Service
(EAS), a contract Base ships at a fixed address on every chain it runs,
`0x4200000000000000000000000000000000000021`, with its schema registry one
below it. Each pin is one attestation under the map's schema, `string slug`,
made by a wallet whose pins count; taking it off revokes it, which only its
attester can. The site holds nothing: no database, no sessions, no secrets,
nothing deployed and nothing set on Vercel. The server reads the
attestations through EAS's own indexer for Base, `base.easscan.org`, which
is free and takes no key, the way Coinbase's OnchainKit reads the identity
badges it shows. The browser reads the chain, tries each call first and
waits for receipts through Base's public RPC, and hands the wallet only the
transaction to sign and send: a wallet's own relay may answer a refused
call without the reason, where the public RPC answers with EAS's own name
for it, which the dialog then shows.

The schema's UID is the hash the registry computes for it, so the site
knows it before anyone has registered it; the first pin ever registers it,
one transaction more, after which every pin is one. Each costs its sender
gas, roughly 100k to 150k for an attestation and less for a revocation, one
to five cents at Base's usual 0.05 to 0.3 gwei.

Weighed against it, and why not: Turso or any hosted database (a credential
that has to live in Vercel's settings, which is where the first deploy of
this map stalled); a registry contract of our own (cleaner reads, a gate the
chain enforces, but a deployment first, which is kept in this branch's
history as commit 87a817d for when one is wanted); committing a JSON file
to the repository (a GitHub token with write access, half a minute per
change, no wallet gate); Vercel Blob, KV and Edge Config (tokens made in the
dashboard, no atomic writes); a Luma calendar's own iCal feed as the whole
store (official and free, with coordinates, but no wallet gate and no
timezone); Fly behind `vercel.json` rewrites (keeps a server store, adds a
second platform to run and pay for). EAS is the one route with a wallet
gate, nothing to deploy and nothing to configure.

What it leans on: EAS's indexer. If it is slow or down, the CDN keeps the
last list for an hour, and the server can read a chain's logs instead,
which the suite does on its local chain; Base's public endpoint does not
serve log ranges that wide, so that path waits on a provider URL if the
indexer ever has to be replaced.

### Who may add events

Whose attestations count, which the server filters by and the dialog shows
the form for:

- **The Homebase wallet.** `0x3D140B892437dD7857701098415deB2daaE03A40`, in
  the code; `HOMEBASE_ADMIN_ADDRESSES` replaces the list for a test on a
  chain of its own. Anyone can attest under the schema, since EAS is open,
  and nobody else's attestations are read.
- **$home lockers, next.** The same filter gains a second rule: a wallet
  whose locked $home on SeedMe's contract is at least a minimum, read with
  one call through Base's RPC on the server and through the wallet in the
  browser. Once the contract is known that is a constant in the code and a
  read, no deployment.

What is not yet known is SeedMe's lock contract. It was not found in any
public repository, Doppler deployment list, or search. The quickest way to it:
ask the SeedMe team, or perform a small lock on seedme.xyz/lock and read the
"Interacted With" address and the emitted event on BaseScan, then copy the
view function's signature from the verified source. `$home` itself is
`0xB9A1E52f3ED678B01Ff5e256fDe43f26f9C01bA3` on Base.

Removed, in turn: the shared admin key the first cut took (no per-person
identity, one more secret to keep), then Sign-In with Ethereum sessions with
an admin list in the environment (a database for nonces and sessions, and a
deployment setting to carry, both of which an on-chain store makes
unnecessary). Rejected: Sign In with Farcaster as the primary identity (it
proves a Farcaster account, not the wallet that holds $home, and the Base
app no longer invokes it).

### Connecting a wallet

The page runs on Preact, which rules out every connect kit: `wagmi` (the
hooks), RainbowKit, ConnectKit and OnchainKit all require React 18 and
TanStack Query. `@wagmi/core` 3.6.5 is the framework-free layer beneath them:
it peers on `viem` 2.x alone (its other peers, `@tanstack/query-core`, the
Tempo `accounts` SDK and `typescript`, are optional) and depends on `mipd`,
`zustand` and `eventemitter3`. It gives `connect`, `reconnect`, `switchChain`
and `disconnect` over any EIP-1193 provider; viem does the rest on a public
client over Base's RPC, `readContract` to see whether the schema is
registered, `simulateContract` so a call the chain would refuse fails before
the wallet opens, and `waitForTransactionReceipt`, with `writeContract` on
the wallet's client in between.
After a reload the page picks the last wallet back up with `reconnect`,
without a prompt, when the wallet still allows it; the wallet's id is all
that is remembered. Connecting never asks the wallet to switch chains; a pin
does, since the attestation has to land on Base.

wagmi's own `coinbaseWallet` connector, read from the wagmi repository
(`@wagmi/connectors` 8.2.0), does the same as the code here: it makes the SDK
with `createCoinbaseWalletSDK`, `preference.options` `"all"` and the config's
chain ids, connects with `eth_requestAccounts`, and tells the SDK to
disconnect on disconnect. The one difference is deliberate: no
`wallet_requestPermissions` before the accounts, which that SDK does not
answer. wagmi's newer `baseAccount` connector wraps `@base-org/account`,
which is the passkey smart wallet alone; the Coinbase Wallet app and
extension, which report Ethereum mainnet until switched, only come through
the SDK used here.

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

- The map opens on the whole world, each event a round house badge, a count
  on a badge where events would overlap, and a pin on the exact spot once
  the camera is near a street. A badge flies the camera down to its event
  and opens the card; closing the card flies back out; a world button under
  the zoom buttons brings the world back whenever the viewer has wandered.
- Hovering a marker, on a pointer that hovers, previews the event, or up to
  three of a cluster's events, each a link to Luma. The card keeps Open on
  Luma, Add to calendar and Directions right under the place line.
- The soonest upcoming event wears a ring on its marker and a Next up tag in
  the list and in the preview, so the map carries the order the list has.
- The list is the map's other half: hovering a row lifts its pin, selecting
  one opens its details and brings its pin into the part of the map the card
  leaves open, beside it on a wide screen and above it on a phone, where the
  map also scrolls back into view; selecting a pin scrolls its row into view.
  Every event is in the list, pinned or not.
- Times read the way Luma shows them: an event held somewhere in its own
  timezone, with the viewer's own time alongside when it differs, and an
  online event in the viewer's timezone, since that is where they join from.
- Clusters show a count and split when zoomed; a cluster that will not split
  is one venue, and opens its first event instead. Opening an event zooms
  until its pin stands on its own, and its card links the other events at
  the same spot.
- A guests-only address pins the city and says so. Online events are listed
  under their own label.
- Scrolling the page over the map never zooms it; touch panning takes two
  fingers. Animations honour reduced-motion.
- `?event=<slug>` on the home page scrolls the map into view and opens the
  event on its pin. The page only reads it: opening a pin never writes the
  address, which stays plain, as do the buttons that scroll the page.
- The add form is for a wallet whose pins count. The way in is the wallet
  button in the header, and a wallet the map does not know never sees the
  form.
- The dialog is rendered at the document's root, since each section of the
  page paints in its own layer and a later one would otherwise cover it.
- Mobile gets the map above the list and the details over the map's lower
  edge; desktop gets them side by side.

Patterns kept from the first map: house markers in Homebase blue, a card per
marker with the Luma link, clusters that open into a list. Dropped: the
hand-written location array, the per-city contracts and their mapping bugs,
the fake loading screen, and the Google dependency.

## Data

The chain holds one attestation per pin, `string slug` under the map's
schema, with the attester and the time EAS records; the slug is the path on
luma.com, which is also the public id in `?event=`. Everything shown comes
from Luma at read time, kept per server process for thirty minutes: `lat`
and `lng` are null for online events and for events Luma could not place,
and `placement` says which; `uid`, `addedBy` and `addedAt` come from the
attestation. A renamed link keeps its pin under the slug it was pinned with,
which Luma redirects; the newer link pins alongside until one is taken off.

## Endpoints

| Path                | Method         | Who                    | What                                                                |
| ------------------- | -------------- | ---------------------- | ------------------------------------------------------------------- |
| `/map.json`         | GET            | anyone                 | the pins, read from EAS's indexer and Luma, CDN-cached for a minute |
| `/map/preview.json` | POST `{ url }` | anyone, within a limit | reads the link without pinning                                      |

Pinning and removing are attestations and revocations from the wallet, not
requests to the site. `src/map/api.ts` answers both routes against the web's
`Request` and `Response`; `api/*.ts` hands Vercel's requests to it and
`src/map/bun.ts` hands the Bun server's. The preview is rate limited per
address. The list also carries where to attest (EAS, the registry, the
schema) and whose attestations count, so the page has one source for both.

## Configuration

Nothing. The addresses of EAS and its registry, the schema, the indexer and
the Homebase wallet are in `src/map/attestations.ts`; the site's hostnames
no longer matter, since nothing is signed for the site. A few variables
exist for the tests, so the suite can point the site at a chain of its own,
and are never needed on a deployment:

| Variable                                | Meaning                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| `HOMEBASE_EAS`, `HOMEBASE_EAS_REGISTRY` | EAS and its schema registry on another chain                                                  |
| `HOMEBASE_EAS_INDEXER`                  | another indexer's URL, or `logs` to read the chain's logs through `HOMEBASE_BASE_RPC` instead |
| `HOMEBASE_ADMIN_ADDRESSES`              | comma-separated wallets whose attestations count, in place of the Homebase wallet             |
| `HOMEBASE_BASE_RPC`                     | the Base RPC, already used by the funding card; Base's public endpoint unless set             |

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

**Rendered again for the overview and the badges.** OpenFreeMap being unreachable from the
sandbox, the flat world and the globe were rendered over Natural Earth's
outlines with the site's own markers, at the map's desktop size (1060 by 560)
and a phone's (390 by 430), and the flight down to an event with the card in
place on each. That is where the globe lost two of seven pins behind its
horizon, where `fitBounds` proved a tenth of a level out, and where the card
and pin were seen to clear each other on both sizes. The first map's
round badges were then rendered against today's pins at twenty-four cities,
on a light and a dark basemap, which showed the pile-ups that clustering has
to stop and settled the light basemap. The suite's screenshots then showed the
same on the built site: the world with its badge, the hover preview, the pin
flown to with its card beside it, and the phone deep link with the pin above
the card.

**Reviewed for security.** The site now holds no secret and no session, so
the surface is small: the server only reads, with the indexer's answer
filtered to the wallets that count and every slug checked against the shape
Luma uses before it is looked up; the resolver only ever fetches Luma's own
hosts and drops a redirect elsewhere; no Luma text reaches `innerHTML`; the
vendor route serves an exact allow-list of files; the preview is rate
limited per address. EAS being open to anyone is by design: a stranger's
attestation costs them gas and is never read. An earlier review of the
sign-in design found the host a message was bound to coming from request
headers, which was fixed then and is moot now that nothing is signed for the
site. One trade-off stands: `addedBy` in the public list names the wallets
that pinned events, which are public on the chain anyway.

**Tested.** Sixty-six tests under `bun test`: the overview camera (the zoom
that lays the world across a width, the latitude it is centred on, the
Mercator arithmetic both ways), the story reel, the resolver against Luma's
three page shapes and its endpoints, and the API over a stub indexer and a
stub Luma (the list with who pinned what and what the page needs to attest,
the indexer asked for the schema and the wallets that count in both
spellings, a pin Luma has lost, a slug that is not one, a stranger's
attestation left out, readings that stand in while Luma is down, the
Homebase wallet as the default and a list replacing it, an indexer that does
not answer, the preview and its limit).

**Validated claim by claim.** Each finding above has a check in the suite,
with a second city pinned a week later and up the coast so the two share a
badge at the world: the card shows within a second of the click and the
flight settles after more than 1.5 seconds; the shared badge carries the
count and the ring for the soonest; its preview lists both events as links,
tags the soonest, keeps a title written as markup as text, and stays while
the pointer is on it; pressing it flies in until the cities stand apart with
the ring on the right one; hovering a row lifts its badge and hovering a
badge lights its row; Enter on a focused badge opens the card with the
title, the date and the Luma link; two presses of the zoom button bring the
world button, which takes the camera back; the wheel scrolls the page over
the map and zooms it only with the key held; every control in the map and
the list measures at least 24 pixels each way and a badge over 44; with
reduced motion asked for, the same flight settles within a second; and on a
touchscreen a tap splits the shared badge, a tap opens the card, and no
preview appears. Writing the camera's zoom on the container only once it is
at rest came out of this: the first version wrote it as a flight began, and
a check read a camera in mid-air as settled.

**Driven end to end.** `bun run e2e` starts a local chain (anvil), deploys
EAS and its schema registry on it from the artifacts EAS publishes, starts
the Bun server, or with `E2E_TARGET=vercel` the Vercel layout under Node
(`e2e/vercel.ts`: the built `dist/`, the rewrites in `vercel.json`, the
functions in `api/`), pointed at that chain and reading its logs in place of
the indexer, with Luma answered from fixtures, and opens the site in
Chromium. A wallet whose keys the run holds is announced to the page the way
extensions are (EIP-6963); it answers accounts and the chain itself, signs
and sends the transactions the page asks for, and passes every other request
on to the chain. The run walks through a visitor seeing only the way in, the
admin connecting from the header and getting the form, a look-up, the first pin as two
transactions, the schema and then the attestation, found on the chain and
on the map, the map opening on the whole world after a reload with the event a round
badge, the badge's hover preview with its link to Luma and the preview going
once the pointer leaves, the card showing at once and the badge flying the
camera in to a pin over 1.5 seconds with the card clear of it, the card closing and the world coming
back, the wallet picked back up after a reload, a revocation taking the pin
off the chain and the map, a later pin as one transaction, disconnecting, a
stranger turned away without the form, and a deep link on a phone-sized
screen landing straight on its pin, with the wallet button clear of the
house there, and the story reel standing on its dots with every card at one
height and its numbers inside What happened; with the Homebase Live and Donate
steps in docs/live.md and the funding card's three buttons and the blueprint picked
up by mouse and by finger and dropped back into place, with the interview opening
the reel on its poster and a finger moving up the blueprint scrolling the page,
fifty-four checks, a
screenshot of each step. Only Luma,
the tiles, the indexer and the chain's distance are stubbed. A failed run
leaves a screenshot, the page's text and the server's log.

## What still needs a hand

The sandbox this was built in could not reach Luma, Base, EAS's indexer or
OpenFreeMap, so these were verified against documentation, source code and
local stand-ins rather than live services:

1. **The first pin on the live site.** Connect the Homebase wallet, paste a
   Luma link, pin it. The wallet will ask twice the first time: once to
   register the map's schema, once for the attestation. The pin appears for
   everyone within a minute. Nothing has to be set up first.
2. **EAS's indexer** answering the list's query as the docs and OnchainKit's
   source say it does: `base.easscan.org/graphql`, keyless. The query
   mirrors OnchainKit's; the one thing unverified is latency between a
   transaction landing and the indexer listing it, which the page covers by
   showing a pin it made at once.
3. **Luma's page shape.** Run, from any machine, for a public event slug:

   ```sh
   SLUG=some-public-event
   curl -sL -A "Mozilla/5.0" https://luma.com/$SLUG | grep -o '<script id="__NEXT_DATA__"' && echo "embedded JSON present"
   curl -s "https://api.lu.ma/url?url=$SLUG" | head -c 600
   ```

   `source` in the preview answer says which reader answered.
4. **A real wallet.** The Coinbase Wallet app, which reports mainnet until a
   pin asks it to switch to Base; Coinbase's passkey smart wallet, and that
   its `eth_sendTransaction` answers with the transaction hash the page
   waits on; an extension; and the host's wallet inside the Farcaster mini
   app. The suite covers the flow with a wallet it holds the keys to; a
   connect or transaction a real wallet refuses is reported with the
   wallet's own reason, in the dialog and in the browser console.
5. **Tiles** in Safari, Chrome and the Base app's web view.
6. **The MCP server.** The sandbox's network policy refused every Luma host,
   `mcp.luma.com` included, so its lookup is untested here. From Claude Code:
   `claude mcp add --transport http luma https://mcp.luma.com`, sign in, then
   ask it to look up a third-party event link and see whether the answer
   carries coordinates and a timezone. Third-party write-ups show a lookup
   returning the name, cover and times; none shows coordinates. If they are
   there, the server could read links through it with a Luma account instead
   of the page.
7. **The world on the live tiles.** The overview was rendered over Natural
   Earth's outlines, not OpenFreeMap's Positron. On the live site, look at
   the overview on a desktop and a phone for what Positron labels at that
   zoom and how its ocean sits against the page, and watch one flight down to
   an event and back on a phone for smoothness; the parent tiles MapLibre
   shows while finer ones arrive should carry it. Hover a badge for the
   preview, and open the card on a phone, where there is no hover.

## Later

- Wire the $home lock once SeedMe's contract is known: a constant and a
  read, on the server and in the page. No deployment.
- Let the Homebase wallet hide another wallet's pin, with an attestation of
  its own that the list honours, once lockers can pin.
- Read a Homebase calendar's official iCal feed as a second sync path, so
  events added to the calendar on Luma appear without pinning.
- Check-ins: the first map minted a soulbound token per city. An attestation
  referencing a pin's UID would be the same idea with nothing deployed.
- Seed history: the first map's fifty-two Base Batch Workshop cities and
  their links are in the research notes and could be pinned as past events.
- A globe at the top level, on phones at least, where a sphere fills the
  width better than the strip of the flat world: the style's `projection`,
  a `GlobeControl` and `opacityWhenCovered: 0` on the markers, with the
  flight down crossing over to the flat map on its own past zoom 11.
