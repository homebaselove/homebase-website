# Homebase Live

What is streaming ahead, read from calendars an admin attests on Base, the
same way the map's pins are: nothing deployed, nothing configured, and one
wallet for the whole page.

## How it works

- An admin connects the Homebase wallet with the button in the top right of
  the page, opens Homebase Live, presses Add a calendar and pastes a
  calendar's iCal feed link: a Luma calendar's, from Add iCal Subscription
  on its page (`https://api.lu.ma/ics/get?entity=calendar&id=cal-…`), a
  Google Calendar's public address
  (`https://calendar.google.com/calendar/ical/…/public/basic.ics`), or an
  Outlook calendar's. A `webcal://` link is taken as the https one.
- The page reads the feed through the server first, so the admin sees the
  calendar's name and what is ahead on it before anything is signed. Adding
  it is one attestation from the wallet under Live's own schema,
  `string calendar`, on the Ethereum Attestation Service Base ships; the
  first calendar ever also registers that schema, one transaction more.
  Removing a calendar revokes its attestation.
- The server lists the calendars attested by the admin wallets through EAS's
  free indexer, or from a local chain's logs for the suite, fetches each
  feed, expands repeating events over the next four months, drops what has
  passed, and merges the rest in order of start. Each feed is read again
  after five minutes; a feed that stops answering keeps its last reading.
  The CDN keeps the list for five minutes and, while the indexer or a feed
  is down, serves the last answer for an hour.
- Only Luma's, Google's and Outlook's hosts are fetched, over https, without
  following redirects: an admin chooses the links, but the server fetches
  them and the preview fetches whatever a visitor pastes, so the hosts are a
  fixed list. A feed past two megabytes is refused.
- Every event carries a link where the feed has one: the URL field first,
  which Luma fills with the event page, else a link in the location, which
  is where a stream usually sits, else the first link in the description.
  The card lists events by day in the zone the Location picker names, with
  iCalendar and Google Calendar links and the event's own.

## The wallet

One button, top right of the page, connects a wallet for everything: the
map's pins, Live's calendars and the donation button. Any wallet may
connect; what it may do follows from whether the server names it as an
admin with each list. The map and Live show their add buttons only to an
admin, and an admin's add dialog, opened before connecting, offers the same
wallets the header does. A reload picks the last wallet back up without a
prompt, on every card at once.

Donate sends the chosen amount of ether from the connected wallet to the
Based House wallet, the address whose $home fees the funding card counts,
and shows the transaction on BaseScan once it has landed. Without a wallet,
Donate opens the way in. Direct donations do not yet show in the amount
raised, which reads the pool's fee ledger; counting them would mean reading
the wallet's transfers as well, which is a later step.

Buy $home still goes to SeedMe. $home trades in a Uniswap v4 pool behind a
Doppler hook, and a swap written here would need the pool's key, a quote
with slippage and a test against a fork of Base before it could touch real
funds; none of that is available from the sandbox this was built in, and
SeedMe's own page does it today. Lock $home goes to SeedMe by design.

## What was weighed

- **Calendars over single streams.** A YouTube or Twitch schedule needs an
  API key to read; a calendar's iCal feed is public and keyless, and Luma,
  Google and Outlook all publish one. Attesting the feed once means the
  admin keeps scheduling where they already do, and the list follows.
- **Attested feeds over a setting.** The first version read one feed from
  `HOMEBASE_LIVE_ICAL`, which no deployment had set, so the card said it
  could not load. A feed attested by the Homebase wallet needs no setting
  on Vercel and no redeploy to change, and the map already worked this way.
- **The old pipeline.** The Bun server synced the feed into SQLite every few
  seconds and Vercel parsed it per request; the two could drift. Both now
  run the same handler, as the map does, and the SQLite layer, its
  migration and the sync job are gone.
- **Events on the map from calendars.** A calendar's events could also feed
  the map, which the map's own notes list under Later; the feeds carry an
  address but no coordinates, so each event would still be read from Luma.

## Endpoints

- `GET /live.json`: the calendars and the events ahead, with the schema and
  the admin wallets the page attests with.
- `POST /live/preview.json` with `{ "url": "…" }`: the calendar's name and
  its events, without adding it. Rate limited per address.

## Validation

- `bun test`: the feed link rules, the iCalendar reader (name, order,
  repeats with an exception and an exclusion, links from each field, an
  all-day event, the horizon and the limit, a page that is not a calendar),
  the Live API over a stub indexer and stub feeds (the list with its cache
  header, a feed read again only after a while and kept when it goes quiet,
  a feed that never answered, a stranger's calendar left out, a link that is
  not a feed left out, a feed attested twice as one, the indexer down, the
  preview's refusals and its answer), and the donation address against the
  funding card's.
- `bun run e2e`, against the Bun server and the Vercel layout: the admin
  connects from the header and the map offers Add an event; Homebase Live
  opens empty and offers the admin a calendar; the feed's preview names it
  and counts what is ahead; adding it is two transactions the first time
  and its events are listed for everyone; removing it takes them off; Donate
  sends the chosen amount to the Based House wallet; Donate without a wallet
  opens the way in; a wallet that is nobody connects and sees no way to add
  anything.

## What still needs a hand

1. The first calendar on the live site: connect the Homebase wallet, open
   Homebase Live, Add a calendar, paste the Luma calendar's iCal link. The
   wallet asks twice the first time, for the schema and the attestation.
2. A real feed's shape: Luma's ICS was read from its documentation and
   third-party descriptions, not fetched, since the sandbox could not reach
   it. The reader takes the URL, LOCATION and DESCRIPTION fields in that
   order, which covers what Luma writes; the preview shows what it made of
   the feed before anything is signed.
3. A real donation of a small amount, and the BaseScan link it shows.
