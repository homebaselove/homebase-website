import { beforeEach, expect, test } from "bun:test"
import * as AbiParameters from "ox/AbiParameters"
import { HomebaseWallet, schemaUidOf } from "../map/attestations.ts"
import {
  CalendarSchemaText,
  type Context,
  forgetReadings,
  handle,
  ListCacheControl,
  ReadAgainAfterMs,
  RetryAfterMs,
  type Route,
} from "./api.ts"

/** Where the stub indexer answers, in place of base.easscan.org. */
const Indexer = "http://indexer.test/graphql"

const Schema = schemaUidOf(CalendarSchemaText)

const Admin = HomebaseWallet

const Other = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"

const LumaFeed = "https://api.lu.ma/ics/get?entity=calendar&id=cal-e2e"

const GoogleFeed =
  "https://calendar.google.com/calendar/ical/x%40group.calendar.google.com/public/basic.ics"

const Uid = (n: number) => `0x${n.toString(16).padStart(64, "0")}`

/** An attestation as the indexer lists it: the link ABI-encoded as a string. */
const attestation = (url: string, by: string, n: number) => ({
  id: Uid(n),
  attester: by,
  data: AbiParameters.encode(
    AbiParameters.from([
      "string",
    ]),
    [
      url,
    ],
  ),
  time: 1_700_000_000 + n,
})

interface Entry {
  uid: string
  start: string
  end: string
  summary: string
  url?: string
}

const ics = (name: string, entries: Entry[]) =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `X-WR-CALNAME:${name}`,
    ...entries.flatMap((entry) => [
      "BEGIN:VEVENT",
      `UID:${entry.uid}`,
      `DTSTART:${entry.start}`,
      `DTEND:${entry.end}`,
      `SUMMARY:${entry.summary}`,
      ...(entry.url
        ? [
          `URL:${entry.url}`,
        ]
        : []),
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ]
    .join("\r\n")

const LumaIcs = ics("Homebase on Luma", [
  {
    uid: "demo@luma",
    start: "20261120T180000Z",
    end: "20261120T190000Z",
    summary: "Demo day stream",
    url: "https://lu.ma/demo",
  },
  {
    uid: "gone@luma",
    start: "20260901T180000Z",
    end: "20260901T190000Z",
    summary: "Already happened",
  },
])

const GoogleIcs = ics("Workshops", [
  {
    uid: "ws@google",
    start: "20261112T170000Z",
    end: "20261112T180000Z",
    summary: "Workshop",
  },
])

interface World {
  attestations: ReturnType<typeof attestation>[]
  indexerDown: boolean
  feeds: Record<string, string | number>
  /** A content-length to claim for a feed, in place of the body's. */
  claimed: Record<string, number>
  asked: {
    schema?: string
  }
  fetched: string[]
}

let world: World

const Now = new Date("2026-11-01T12:00:00Z")

let now = Now

const stubFetch = (async (
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> => {
  const url = typeof input === "string" ? input : (input as Request).url

  if (url === Indexer) {
    if (world.indexerDown) {
      return new Response("down", {
        status: 502,
      })
    }

    const body = JSON.parse(String(init?.body)) as {
      variables: {
        schema: string
        attesters: string[]
      }
    }

    world.asked.schema = body.variables.schema

    // The real indexer only lists the attesters asked for.
    const attesters = body.variables.attesters.map((attester) =>
      attester.toLowerCase()
    )

    return Response.json({
      data: {
        attestations: world.attestations.filter((found) =>
          attesters.includes(found.attester.toLowerCase())
        ),
      },
    })
  }

  world.fetched.push(url)

  const feed = world.feeds[url]

  if (feed === undefined) {
    return new Response("not here", {
      status: 404,
    })
  }

  if (typeof feed === "number") {
    return new Response("nope", {
      status: feed,
    })
  }

  return new Response(feed, {
    headers: {
      "content-type": "text/calendar",
      ...(world.claimed[url]
        ? {
          "content-length": String(world.claimed[url]),
        }
        : {}),
    },
  })
}) as unknown as typeof fetch

const ctx: Context = {
  env: {
    HOMEBASE_EAS_INDEXER: Indexer,
  },
  fetch: stubFetch,
  now: () => now,
}

const get = (route: Route = "live") =>
  handle(
    new Request(`http://site.test/${route}.json`),
    route,
    ctx,
  )

const post = (body: unknown) =>
  handle(
    new Request("http://site.test/live/preview.json", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}`,
      },
      body: JSON.stringify(body),
    }),
    "preview",
    ctx,
  )

beforeEach(() => {
  forgetReadings()
  now = Now
  world = {
    attestations: [
      attestation(LumaFeed, Admin, 1),
      attestation(GoogleFeed, Admin, 2),
    ],
    indexerDown: false,
    feeds: {
      [LumaFeed]: LumaIcs,
      [GoogleFeed]: GoogleIcs,
    },
    claimed: {},
    asked: {},
    fetched: [],
  }
})

test("lists the calendars and the events ahead on them, in order of start", async () => {
  const response = await get()
  const body = await response.json()

  expect(
    response.status,
  )
    .toBe(200)
  expect(
    response.headers.get("cache-control"),
  )
    .toBe(ListCacheControl)
  expect(
    world.asked.schema,
  )
    .toBe(Schema)
  expect(
    body.calendars,
  )
    .toEqual([
      {
        uid: Uid(1),
        url: LumaFeed,
        name: "Homebase on Luma",
        addedBy: Admin,
        addedAt: new Date((1_700_000_000 + 1) * 1000).toISOString(),
        reachable: true,
        events: 1,
      },
      {
        uid: Uid(2),
        url: GoogleFeed,
        name: "Workshops",
        addedBy: Admin,
        addedAt: new Date((1_700_000_000 + 2) * 1000).toISOString(),
        reachable: true,
        events: 1,
      },
    ])
  expect(
    body.events.map((event: {
      title: string
      calendar: string
      link: string | null
    }) => [
      event.title,
      event.calendar,
      event.link,
    ]),
  )
    .toEqual([
      [
        "Workshop",
        Uid(2),
        null,
      ],
      [
        "Demo day stream",
        Uid(1),
        "https://lu.ma/demo",
      ],
    ])
  expect(
    body.eas.schemaText,
  )
    .toBe(CalendarSchemaText)
  expect(
    body.admins,
  )
    .toEqual([
      Admin,
    ])
})

test("a feed is read again only after a while, and a feed gone quiet keeps its last reading and says so", async () => {
  await get()
  world.feeds[GoogleFeed] = 503
  await get()
  expect(
    world.fetched,
  )
    .toEqual([
      LumaFeed,
      GoogleFeed,
    ])

  now = new Date(Now.getTime() + ReadAgainAfterMs + 1)

  const body = await (await get()).json()

  expect(
    world.fetched.length,
  )
    .toBe(4)
  expect(
    body.calendars.map((calendar: {
      name: string
      reachable: boolean
      events: number
    }) => [
      calendar.name,
      calendar.reachable,
      calendar.events,
    ]),
  )
    .toEqual([
      [
        "Homebase on Luma",
        true,
        1,
      ],
      [
        "Workshops",
        false,
        1,
      ],
    ])

  // The quiet feed is left alone for a minute, then tried again.
  await get()
  expect(
    world.fetched.length,
  )
    .toBe(4)

  now = new Date(now.getTime() + RetryAfterMs + 1)
  await get()
  expect(
    world.fetched,
  )
    .toEqual([
      LumaFeed,
      GoogleFeed,
      LumaFeed,
      GoogleFeed,
      GoogleFeed,
    ])
})

test("a feed that never answered is listed as not reachable, with no events", async () => {
  world.feeds[GoogleFeed] = 503

  const body = await (await get()).json()

  expect(
    body.calendars[1].reachable,
  )
    .toBe(false)
  expect(
    body.events.length,
  )
    .toBe(1)
})

test("a stranger's calendar, a link that is not a feed, and a feed attested twice", async () => {
  world.attestations = [
    attestation(LumaFeed, Admin, 1),
    attestation(LumaFeed, Admin, 3),
    attestation(GoogleFeed, Other, 2),
    attestation("http://api.lu.ma/ics/get?entity=calendar&id=plain", Admin, 4),
    attestation("https://evil.example/feed.ics", Admin, 5),
  ]

  const body = await (await get()).json()

  expect(
    body.calendars.map((calendar: {
      uid: string
    }) => calendar.uid),
  )
    .toEqual([
      Uid(1),
    ])
})

test("answers 503 when the indexer cannot be read", async () => {
  world.indexerDown = true

  const response = await get()

  expect(
    response.status,
  )
    .toBe(503)
})

test("the preview refuses a bad link, reports a host that does not answer, and reads a good one", async () => {
  expect(
    (await post({
      url: "https://evil.example/feed.ics",
    }))
      .status,
  )
    .toBe(400)
  expect(
    (await post({
      url: "https://api.lu.ma/ics/get?entity=calendar&id=cal-missing",
    }))
      .status,
  )
    .toBe(502)

  const response = await post({
    url: `webcal://api.lu.ma/ics/get?entity=calendar&id=cal-e2e`,
  })
  const body = await response.json()

  expect(
    response.status,
  )
    .toBe(200)
  expect(
    body.calendar,
  )
    .toEqual({
      url: LumaFeed,
      name: "Homebase on Luma",
      events: [
        {
          id: "demo@luma",
          title: "Demo day stream",
          description: null,
          link: "https://lu.ma/demo",
          start: "2026-11-20T18:00:00.000Z",
          end: "2026-11-20T19:00:00.000Z",
          allDay: false,
        },
      ],
      upcoming: 1,
    })
})

test("a feed that is not a calendar is refused by the preview", async () => {
  world.feeds[LumaFeed] = "<html>no</html>"

  const response = await post({
    url: LumaFeed,
  })

  expect(
    response.status,
  )
    .toBe(422)
})

test("HEAD is answered like GET and other methods are refused", async () => {
  expect(
    (await handle(
      new Request("http://site.test/live.json", {
        method: "HEAD",
      }),
      "live",
      ctx,
    ))
      .status,
  )
    .toBe(200)
  expect(
    (await handle(
      new Request("http://site.test/live.json", {
        method: "DELETE",
      }),
      "live",
      ctx,
    ))
      .status,
  )
    .toBe(405)
})

test("one event published on two calendars is listed once", async () => {
  world.feeds[GoogleFeed] = ics("Mirror", [
    {
      uid: "demo@luma",
      start: "20261120T180000Z",
      end: "20261120T190000Z",
      summary: "Demo day stream, mirrored",
    },
  ])

  const body = await (await get()).json()

  expect(
    body.events.map((event: {
      id: string
      calendar: string
    }) => [
      event.id,
      event.calendar,
    ]),
  )
    .toEqual([
      [
        "demo@luma",
        Uid(1),
      ],
    ])
})

test("a feed that claims to be huge is refused before it is read", async () => {
  world.claimed[LumaFeed] = 3_000_000

  const response = await post({
    url: LumaFeed,
  })

  expect(
    response.status,
  )
    .toBe(502)
  expect(
    (await response.json()).error,
  )
    .toBe("That feed is too large to be a calendar.")
})
