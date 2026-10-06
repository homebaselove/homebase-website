import { beforeEach, expect, test } from "bun:test"
import * as AbiParameters from "ox/AbiParameters"
import {
  type Context,
  forgetReadings,
  handle,
  ListCacheControl,
  ReadAgainAfterMs,
  type Route,
} from "./api.ts"
import {
  EasAddress,
  HomebaseWallet,
  SchemaRegistryAddress,
  SchemaText,
  SchemaUid,
} from "./attestations.ts"

/** Where the stub indexer answers, in place of base.easscan.org. */
const Indexer = "http://indexer.test/graphql"

const Admin = HomebaseWallet

const Other = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"

const Uid = (n: number) => `0x${n.toString(16).padStart(64, "0")}`

interface Pin {
  slug: string
  by: string
  pinnedAt: bigint
}

/** An attestation as the indexer lists it: the slug ABI-encoded as a string. */
const attestation = (pin: Pin, n: number) => ({
  id: Uid(n),
  attester: pin.by,
  data: AbiParameters.encode(
    AbiParameters.from([
      "string",
    ]),
    [
      pin.slug,
    ],
  ),
  time: Number(pin.pinnedAt),
})

/** Luma's answer for a venue event, as its page embeds it. */
function lumaEvent(slug: string, event: Record<string, unknown> = {}) {
  return {
    kind: "event",
    data: {
      api_id: `evt-${slug}`,
      event: {
        api_id: `evt-${slug}`,
        name: `Event ${slug}`,
        url: slug,
        start_at: "2026-11-01T18:00:00.000Z",
        end_at: "2026-11-01T21:00:00.000Z",
        timezone: "Europe/Lisbon",
        cover_url: null,
        location_type: "offline",
        geo_address_visibility: "public",
        coordinate: {
          latitude: 38.7,
          longitude: -9.1,
        },
        geo_address_info: {
          city_state: "Lisbon, Portugal",
          full_address: "Somewhere 1, Lisbon",
          description: "The venue",
        },
        ...event,
      },
      hosts: [],
      calendar: null,
    },
  }
}

const pageFor = (answer: unknown) =>
  new Response(
    `<html><script id="__NEXT_DATA__" type="application/json">${
      JSON.stringify({
        props: {
          pageProps: {
            initialData: answer,
          },
        },
      })
    }</script></html>`,
    {
      headers: {
        "content-type": "text/html",
      },
    },
  )

const page = (slug: string) => `https://luma.com/${slug}`

/**
 * Stands in for the web: EAS's indexer answering the attestations under the
 * map's schema by the allowed wallets, and Luma pages by URL, with either
 * able to be down.
 */
function stubWeb(initial: {
  pins?: Pin[] | "down"
  luma?: Record<string, () => Response> | "down"
} = {}) {
  let mode = initial
  const calls: string[] = []
  const asked: unknown[] = []
  const fetchFn =
    (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input)

      if (url === Indexer) {
        calls.push("indexer")

        if (mode.pins === "down") {
          return new Response("down", {
            status: 503,
          })
        }

        const { variables } = JSON.parse(String(init?.body)) as {
          variables: {
            schema: string
            attesters: string[]
          }
        }

        asked.push(variables)

        const allowed = new Set(
          variables.attesters.map((address) => address.toLowerCase()),
        )

        return Response.json({
          data: {
            attestations: variables.schema === SchemaUid
              ? (mode.pins ?? [])
                .map(attestation)
                .filter((item) => allowed.has(item.attester.toLowerCase()))
              : [],
          },
        })
      }

      calls.push(url)

      if (mode.luma === "down") {
        throw new TypeError("fetch failed")
      }

      const reply = mode.luma?.[url]

      return reply
        ? reply()
        : new Response("not found", {
          status: 404,
        })
    }) as typeof fetch

  return {
    fetch: fetchFn,
    calls,
    asked,
    answer: (next: typeof initial) => {
      mode = {
        ...mode,
        ...next,
      }
    },
  }
}

const Now = new Date("2026-10-05T12:00:00.000Z")

function site(options: {
  web?: ReturnType<typeof stubWeb>
  env?: Record<string, string | undefined>
  now?: () => Date
} = {}) {
  const web = options.web ?? stubWeb()
  const ctx: Context = {
    env: {
      HOMEBASE_EAS_INDEXER: Indexer,
      ...options.env,
    },
    fetch: web.fetch,
    now: options.now ?? (() => Now),
  }

  return {
    ctx,
    web,
  }
}

let clients = 0

/** Each test comes from its own address, so the per-address limits stay out of its way. */
const client = () => `10.0.${Math.floor(clients / 250)}.${++clients % 250}`

interface Call {
  method?: string
  path?: string
  body?: unknown
  ip?: string
}

const request = ({
  method = "GET",
  path = "/map.json",
  body,
  ip,
}: Call = {}) =>
  new Request(`https://homebase.test${path}`, {
    method,
    headers: {
      ...(body !== undefined
        ? {
          "content-type": "application/json",
        }
        : {}),
      "x-forwarded-for": ip ?? client(),
    },
    ...(body !== undefined
      ? {
        body: typeof body === "string" ? body : JSON.stringify(body),
      }
      : {}),
  })

async function answer(response: Response) {
  return {
    status: response.status,
    body: await response.json().catch(() => null),
    cacheControl: response.headers.get("cache-control"),
  }
}

const ask = async (ctx: Context, route: Route = "map", call: Call = {}) =>
  answer(await handle(request(call), route, ctx))

const pinned = (slug: string, by = Admin, pinnedAt = 1_700_000_000n): Pin => ({
  slug,
  by,
  pinnedAt,
})

beforeEach(() => {
  forgetReadings()
})

test("the map lists the attested slugs, read from Luma, with who pinned each and when", async () => {
  const web = stubWeb({
    pins: [
      pinned("demo-day"),
      pinned("build-night", Other.toLowerCase(), 1_700_003_600n),
    ],
    luma: {
      [page("demo-day")]: () => pageFor(lumaEvent("demo-day")),
      [page("build-night")]: () => pageFor(lumaEvent("build-night")),
    },
  })
  const { ctx } = site({
    web,
    env: {
      HOMEBASE_ADMIN_ADDRESSES: `${Admin},${Other}`,
    },
  })
  const listed = await ask(ctx)

  expect(
    [
      listed.status,
      listed.cacheControl,
      listed.body.eas,
      listed.body.admins,
      web.asked,
      listed.body.events.map((event: Record<string, unknown>) => [
        event.slug,
        event.uid,
        event.title,
        event.lat,
        event.addedBy,
        event.addedAt,
      ]),
    ],
  )
    .toEqual([
      200,
      ListCacheControl,
      {
        chainId: 8453,
        address: EasAddress,
        schemaRegistry: SchemaRegistryAddress,
        schema: SchemaUid,
        schemaText: SchemaText,
      },
      [
        Admin,
        Other,
      ],
      [
        {
          schema: SchemaUid,
          attesters: [
            Admin,
            Admin.toLowerCase(),
            Other,
            Other.toLowerCase(),
          ],
        },
      ],
      [
        [
          "demo-day",
          Uid(0),
          "Event demo-day",
          38.7,
          Admin,
          "2023-11-14T22:13:20.000Z",
        ],
        [
          "build-night",
          Uid(1),
          "Event build-night",
          38.7,
          Other,
          "2023-11-14T23:13:20.000Z",
        ],
      ],
    ])
})

test("a pin Luma has no event for is left out, a slug that is not one is skipped, and a stranger's attestation does not count", async () => {
  const web = stubWeb({
    pins: [
      pinned("gone"),
      pinned("not a slug!"),
      pinned("stranger-pin", Other),
      pinned("demo-day"),
    ],
    luma: {
      [page("demo-day")]: () => pageFor(lumaEvent("demo-day")),
      [page("stranger-pin")]: () => pageFor(lumaEvent("stranger-pin")),
    },
  })
  const { ctx } = site({
    web,
  })
  const listed = await ask(ctx)

  expect(
    [
      listed.status,
      listed.body.events.map((event: Record<string, unknown>) => event.slug),
      web
        .calls
        .filter((call) =>
          call.includes("not%20a%20slug") || call.includes("stranger-pin")
        )
        .length,
    ],
  )
    .toEqual([
      200,
      [
        "demo-day",
      ],
      0,
    ])
})

test("what Luma said stands for a while, and stands in when Luma is down", async () => {
  const web = stubWeb({
    pins: [
      pinned("demo-day"),
    ],
    luma: {
      [page("demo-day")]: () => pageFor(lumaEvent("demo-day")),
    },
  })
  let now = Now
  const { ctx } = site({
    web,
    now: () => now,
  })

  await ask(ctx)

  const lumaReads = () => web.calls.filter((call) => call !== "indexer").length
  const afterFirst = lumaReads()

  await ask(ctx)

  const afterSecond = lumaReads()

  now = new Date(Now.getTime() + ReadAgainAfterMs + 1)
  web.answer({
    luma: "down",
    pins: [
      pinned("demo-day"),
      pinned("new-one"),
    ],
  })

  const whileDown = await ask(ctx)

  web.answer({
    luma: {
      [page("demo-day")]: () =>
        pageFor(lumaEvent("demo-day", {
          name: "Renamed",
        })),
      [page("new-one")]: () => pageFor(lumaEvent("new-one")),
    },
  })

  const afterBack = await ask(ctx)

  expect(
    [
      afterFirst,
      afterSecond,
      whileDown.status,
      whileDown.body.events.map((event: Record<string, unknown>) =>
        event.title
      ),
      afterBack.body.events.map((event: Record<string, unknown>) =>
        event.title
      ),
    ],
  )
    .toEqual([
      1,
      1,
      200,
      [
        "Event demo-day",
      ],
      [
        "Renamed",
        "Event new-one",
      ],
    ])
})

test("with nothing configured the Homebase wallet is the one whose pins count, and a list replaces it", async () => {
  const { ctx } = site()
  const listed = await ask(ctx)
  const { ctx: other } = site({
    env: {
      HOMEBASE_ADMIN_ADDRESSES: `${Other}, not-an-address`,
    },
  })
  const replaced = await ask(other)

  expect(
    [
      listed.body.admins,
      replaced.body.admins,
    ],
  )
    .toEqual([
      [
        HomebaseWallet,
      ],
      [
        Other,
      ],
    ])
})

test("an indexer that does not answer is a 503, which the CDN rides out with its last answer", async () => {
  const { ctx } = site({
    web: stubWeb({
      pins: "down",
    }),
  })

  expect(
    await ask(ctx),
  )
    .toEqual({
      status: 503,
      body: {
        error: "The map's pins couldn't be read. Try again in a minute.",
      },
      cacheControl: null,
    })
})

test("a HEAD is answered like the GET it stands for, and other methods are not served", async () => {
  const { ctx } = site()
  const head = await ask(ctx, "map", {
    method: "HEAD",
  })
  const post = await ask(ctx, "map", {
    method: "POST",
    body: {
      url: "https://luma.com/demo-day",
    },
  })

  expect(
    [
      head.status,
      head.cacheControl,
      post.status,
    ],
  )
    .toEqual([
      200,
      ListCacheControl,
      405,
    ])
})

test("a preview reads the event behind a link for anyone, within a limit", async () => {
  const web = stubWeb({
    luma: {
      [page("demo-day")]: () => pageFor(lumaEvent("demo-day")),
    },
  })
  const { ctx } = site({
    web,
  })
  const ip = client()
  const found = await ask(ctx, "preview", {
    method: "POST",
    body: {
      url: "https://lu.ma/demo-day?tk=secret",
    },
    ip,
  })
  const missing = await ask(ctx, "preview", {
    method: "POST",
    body: {
      url: "https://luma.com/nowhere",
    },
    ip,
  })
  const notALink = await ask(ctx, "preview", {
    method: "POST",
    body: {
      url: "https://example.com/demo-day",
    },
    ip,
  })
  const notJson = await ask(ctx, "preview", {
    method: "POST",
    body: "not json",
    ip,
  })

  let last = found

  for (let sent = 4; sent <= 31; sent += 1) {
    last = await ask(ctx, "preview", {
      method: "POST",
      body: {
        url: "https://luma.com/demo-day",
      },
      ip,
    })
  }

  expect(
    [
      found.status,
      found.body.event.title,
      found.body.source,
      missing.status,
      notALink.status,
      notJson.status,
      last.status,
    ],
  )
    .toEqual([
      200,
      "Event demo-day",
      "page",
      404,
      400,
      400,
      429,
    ])
})
