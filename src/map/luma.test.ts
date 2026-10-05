import { expect, test } from "bun:test"
import {
  ApiOrigins,
  apiUrl,
  excerpt,
  fromPayload,
  pageUrl,
  parseLink,
  proseMirrorText,
  readEmbedded,
  readMarkup,
  resolve,
} from "./luma.ts"

/** Luma's event JSON as its page embeds it, with a venue in Lisbon. */
function payload(event: Record<string, unknown> = {}) {
  return {
    api_id: "evt-AbCdEf0123456789",
    event: {
      api_id: "evt-AbCdEf0123456789",
      name: "  Base Batch Workshop, Lisbon  ",
      url: "lisbon-base-workshop",
      start_at: "2026-10-18T17:00:00.000Z",
      end_at: "2026-10-18T20:00:00.000Z",
      timezone: "Europe/Lisbon",
      cover_url: "https://images.lumacdn.com/cover.png",
      location_type: "offline",
      geo_address_visibility: "public",
      coordinate: {
        latitude: 38.7223,
        longitude: -9.1393,
      },
      geo_address_info: {
        address: "Rua do Grilo 1",
        city: "Lisbon",
        country: "Portugal",
        city_state: "Lisbon, Portugal",
        full_address: "Rua do Grilo 1, 1950-144 Lisbon, Portugal",
        description: "grow.inc SPACES",
        mode: "exact",
      },
      ...event,
    },
    hosts: [
      {
        name: "Rafi",
      },
      {
        name: " ",
      },
      {
        name: "Homebase",
      },
    ],
    calendar: {
      name: "Homebase",
    },
    description_mirror: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Build on Base ",
            },
            {
              type: "text",
              marks: [
                {
                  type: "bold",
                },
              ],
              text: "with us",
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Bring a laptop.",
            },
          ],
        },
      ],
    },
  }
}

const Lisbon = {
  slug: "lisbon-base-workshop",
  lumaId: "evt-AbCdEf0123456789",
  url: "https://luma.com/lisbon-base-workshop",
  title: "Base Batch Workshop, Lisbon",
  description: "Build on Base with us Bring a laptop.",
  start: "2026-10-18T17:00:00.000Z",
  end: "2026-10-18T20:00:00.000Z",
  timezone: "Europe/Lisbon",
  venue: "grow.inc SPACES",
  address: "Rua do Grilo 1, 1950-144 Lisbon, Portugal",
  city: "Lisbon, Portugal",
  lat: 38.7223,
  lng: -9.1393,
  placement: "venue",
  cover: "https://images.lumacdn.com/cover.png",
  hosts: [
    "Rafi",
    "Homebase",
  ],
  calendar: "Homebase",
}

const link = {
  kind: "slug",
  slug: "lisbon-base-workshop",
} as const

function pageHtml(initialData: unknown) {
  return `<!doctype html><html><head><meta property="og:title" content="x"></head><body>
<script id="__NEXT_DATA__" type="application/json">${
    JSON.stringify({
      props: {
        pageProps: {
          initialData,
        },
      },
    })
  }</script></body></html>`
}

const answer = (kind: string, data: unknown) => ({
  kind,
  data,
})

test("event links are read down to their slug or id", () => {
  expect(
    [
      parseLink("https://lu.ma/abc123"),
      parseLink("luma.com/abc123?tk=ticket-secret&utm_source=x#top"),
      parseLink("  https://www.luma.com/my-event.v2/  "),
      parseLink("https://luma.com/event/evt-AbCdEf0123456789"),
      parseLink("https://lu.ma/embed/event/evt-AbCdEf0123456789/simple"),
      parseLink("http://lu.ma/embed/event/abc123/simple"),
    ],
  )
    .toEqual([
      {
        kind: "slug",
        slug: "abc123",
      },
      {
        kind: "slug",
        slug: "abc123",
      },
      {
        kind: "slug",
        slug: "my-event.v2",
      },
      {
        kind: "id",
        id: "evt-AbCdEf0123456789",
      },
      {
        kind: "id",
        id: "evt-AbCdEf0123456789",
      },
      {
        kind: "slug",
        slug: "abc123",
      },
    ])
})

test("links that are not event pages are turned away with a reason", () => {
  expect(
    [
      parseLink(""),
      parseLink("not a link at all"),
      parseLink("https://eventbrite.com/e/123"),
      parseLink("https://luma.com/user/usr-123/events"),
      parseLink("https://luma.com/discover"),
      parseLink("javascript:alert(1)"),
    ]
      .map((result) => result.kind === "invalid" ? result.message : result),
  )
    .toEqual([
      "Paste a link to a Luma event.",
      "That doesn't look like a link.",
      "That link isn't on Luma. Paste a lu.ma or luma.com event link.",
      "Paste the link to a single event page, like luma.com/abc123.",
      "Paste the link to a single event page, like luma.com/abc123.",
      "That doesn't look like a link.",
    ])
})

test("a slug is read from the page and an id from the event endpoint", () => {
  expect(
    [
      pageUrl(link),
      apiUrl(link),
      pageUrl({
        kind: "id",
        id: "evt-1",
      }),
      apiUrl({
        kind: "id",
        id: "evt-1",
      }),
    ],
  )
    .toEqual([
      "https://luma.com/lisbon-base-workshop",
      "https://api.lu.ma/url?url=lisbon-base-workshop",
      "https://luma.com/event/evt-1",
      "https://api.lu.ma/event/get?event_api_id=evt-1",
    ])
})

test("a venue event carries everything the map shows", () => {
  expect(
    fromPayload(payload(), link),
  )
    .toEqual(Lisbon)
})

test("a hidden address keeps the city pin and drops the street", () => {
  expect(
    fromPayload(
      payload({
        geo_address_visibility: "guests-only",
        geo_address_info: {
          city_state: "Lisbon, Portugal",
          mode: "obfuscated",
        },
      }),
      link,
    ),
  )
    .toMatchObject({
      placement: "hidden",
      venue: null,
      address: null,
      city: "Lisbon, Portugal",
      lat: 38.7223,
      lng: -9.1393,
    })
})

test("an online event has no pin, whatever coordinates came along", () => {
  expect(
    fromPayload(
      payload({
        location_type: "zoom",
      }),
      link,
    ),
  )
    .toMatchObject({
      placement: "online",
      lat: null,
      lng: null,
    })
})

test("an event Luma could not place is kept without a pin", () => {
  expect(
    fromPayload(
      payload({
        coordinate: null,
        geo_address_info: null,
      }),
      link,
    ),
  )
    .toMatchObject({
      placement: "unknown",
      lat: null,
      lng: null,
      city: null,
    })
})

test("legacy string coordinates still place the event", () => {
  expect(
    fromPayload(
      payload({
        coordinate: undefined,
        geo_latitude: "38.7223",
        geo_longitude: "-9.1393",
      }),
      link,
    ),
  )
    .toMatchObject({
      placement: "venue",
      lat: 38.7223,
      lng: -9.1393,
    })
})

test("an unreadable date or title means no event", () => {
  expect(
    [
      fromPayload(
        payload({
          start_at: "soon",
        }),
        link,
      ),
      fromPayload(
        payload({
          name: "   ",
        }),
        link,
      ),
      fromPayload(
        {
          event: {
            name: "x",
          },
        },
        link,
      ),
    ],
  )
    .toEqual([
      null,
      null,
      null,
    ])
})

test("descriptions read as text and stop at card length", () => {
  expect(
    [
      proseMirrorText(payload().description_mirror),
      excerpt(`${"word ".repeat(80)}end`),
      excerpt(null),
    ],
  )
    .toEqual([
      "Build on Base with us\nBring a laptop.",
      `${"word ".repeat(56).trim()}…`,
      null,
    ])
})

test("the page's embedded JSON answers for the event or the calendar", () => {
  expect(
    [
      readEmbedded(pageHtml(answer("event", payload())), link),
      readEmbedded(pageHtml(answer("calendar", {})), link),
      readEmbedded(pageHtml(answer("profile", {})), link),
      readEmbedded("<html>no data</html>", link),
    ],
  )
    .toEqual([
      {
        kind: "event",
        event: Lisbon,
        source: "page",
      },
      {
        kind: "calendar",
      },
      null,
      null,
    ])
})

test("schema.org markup stands in with what it has", () => {
  const html = `<html><head><script type="application/ld+json">${
    JSON.stringify([
      {
        "@context": "https://schema.org",
        "@type": "Event",
        name: "Lisbon meetup",
        startDate: "2026-10-18T18:00:00+01:00",
        endDate: "2026-10-18T21:00:00+01:00",
        description: "Bring a laptop.",
        image: [
          "https://images.lumacdn.com/cover.png",
        ],
        location: {
          "@type": "Place",
          name: "grow.inc SPACES",
          address: {
            "@type": "PostalAddress",
            streetAddress: "Rua do Grilo 1",
            addressLocality: "Lisbon",
            addressCountry: "PT",
          },
          geo: {
            "@type": "GeoCoordinates",
            latitude: 38.7223,
            longitude: -9.1393,
          },
        },
      },
    ])
  }</script></head></html>`

  expect(
    readMarkup(html, link),
  )
    .toEqual({
      kind: "event",
      source: "markup",
      event: {
        slug: "lisbon-base-workshop",
        lumaId: null,
        url: "https://luma.com/lisbon-base-workshop",
        title: "Lisbon meetup",
        description: "Bring a laptop.",
        start: "2026-10-18T17:00:00.000Z",
        end: "2026-10-18T20:00:00.000Z",
        timezone: null,
        venue: "grow.inc SPACES",
        address: "Rua do Grilo 1, Lisbon, PT",
        city: "Lisbon, PT",
        lat: 38.7223,
        lng: -9.1393,
        placement: "venue",
        cover: "https://images.lumacdn.com/cover.png",
        hosts: [],
        calendar: null,
      },
    })
})

test("markup marks online and cancelled events as such", () => {
  const markup = (node: Record<string, unknown>) =>
    `<script type="application/ld+json">${
      JSON.stringify({
        "@type": "Event",
        name: "x",
        startDate: "2026-10-18T18:00:00Z",
        ...node,
      })
    }</script>`

  expect(
    [
      readMarkup(
        markup({
          eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
          location: {
            "@type": "VirtualLocation",
            url: "https://zoom.us/j/1",
          },
        }),
        link,
      ),
      readMarkup(
        markup({
          eventStatus: "https://schema.org/EventCancelled",
        }),
        link,
      ),
    ],
  )
    .toEqual([
      {
        kind: "event",
        source: "markup",
        event: expect.objectContaining({
          placement: "online",
          lat: null,
        }),
      },
      {
        kind: "not-found",
      },
    ])
})

/** Stands in for Luma: answers each URL as told, and counts what was asked. */
function stubLuma(
  answers: Record<string, () => Response | Promise<Response>>,
) {
  const asked: string[] = []
  const fetchFn = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input)

    asked.push(url)

    const reply = answers[url]

    if (!reply) {
      throw new TypeError(`unexpected ${url}`)
    }

    return reply()
  }) as typeof fetch

  return {
    fetch: fetchFn,
    asked,
  }
}

const page = pageUrl(link)

const api = apiUrl(link)

const html = (body: string) =>
  new Response(body, {
    headers: {
      "content-type": "text/html",
    },
  })

test("the page answers first, and nothing else is asked", async () => {
  const luma = stubLuma({
    [page]: () => html(pageHtml(answer("event", payload()))),
  })

  expect(
    await resolve(link, luma),
  )
    .toEqual({
      kind: "event",
      event: Lisbon,
      source: "page",
    })
  expect(
    luma.asked,
  )
    .toEqual([
      page,
    ])
})

test("a page Luma no longer shows is gone, with no second guess", async () => {
  const luma = stubLuma({
    [page]: () =>
      new Response("gone", {
        status: 404,
      }),
  })

  expect(
    await resolve(link, luma),
  )
    .toEqual({
      kind: "not-found",
    })
  expect(
    luma.asked,
  )
    .toEqual([
      page,
    ])
})

test("the endpoint stands in when the page cannot be read", async () => {
  const luma = stubLuma({
    [page]: () =>
      new Response("busy", {
        status: 503,
      }),
    [api]: () => Response.json(answer("event", payload())),
  })

  expect(
    await resolve(link, luma),
  )
    .toEqual({
      kind: "event",
      event: Lisbon,
      source: "api",
    })
})

test("an id is read from the event endpoint's bare answer", async () => {
  const byId = {
    kind: "id",
    id: "evt-AbCdEf0123456789",
  } as const
  const luma = stubLuma({
    [pageUrl(byId)]: () => html("<html>moved</html>"),
    [apiUrl(byId)]: () => Response.json(payload()),
  })

  expect(
    await resolve(byId, luma),
  )
    .toEqual({
      kind: "event",
      event: Lisbon,
      source: "api",
    })
})

test("a host that has retired the endpoint does not make the event gone", async () => {
  const luma = stubLuma({
    [page]: () =>
      new Response("busy", {
        status: 503,
      }),
    [api]: () =>
      Response.json(
        {
          message: "Not found.",
        },
        {
          status: 404,
        },
      ),
    [apiUrl(link, ApiOrigins[1])]: () =>
      Response.json(answer("event", payload())),
  })

  expect(
    await resolve(link, luma),
  )
    .toEqual({
      kind: "event",
      event: Lisbon,
      source: "api",
    })
})

test("every host saying gone is gone, unless the page says otherwise", async () => {
  const gone = () =>
    new Response("gone", {
      status: 404,
    })
  const busy = () =>
    new Response("busy", {
      status: 503,
    })

  expect(
    [
      await resolve(
        link,
        stubLuma({
          [page]: busy,
          [api]: gone,
          [apiUrl(link, ApiOrigins[1])]: gone,
        }),
      ),
      await resolve(
        link,
        stubLuma({
          [page]: () => html("<html>app shell</html>"),
          [api]: gone,
          [apiUrl(link, ApiOrigins[1])]: gone,
        }),
      ),
    ],
  )
    .toEqual([
      {
        kind: "not-found",
      },
      {
        kind: "unavailable",
        message:
          "Luma's event page changed shape and couldn't be read. Try again later.",
      },
    ])
})

test("a calendar link is named as one", async () => {
  const luma = stubLuma({
    [page]: () => html("<html>app shell</html>"),
    [api]: () => Response.json(answer("calendar", {})),
  })

  expect(
    await resolve(link, luma),
  )
    .toEqual({
      kind: "calendar",
    })
})

test("markup is the last resort, and silence is reported as such", async () => {
  const markup = `<script type="application/ld+json">${
    JSON.stringify({
      "@type": "Event",
      name: "From markup",
      startDate: "2026-10-18T18:00:00Z",
    })
  }</script>`
  const down = () =>
    new Response("down", {
      status: 500,
    })

  expect(
    [
      await resolve(
        link,
        stubLuma({
          [page]: () => html(markup),
          [api]: down,
        }),
      ),
      await resolve(
        link,
        stubLuma({
          [page]: down,
          [api]: down,
        }),
      ),
      await resolve(
        link,
        stubLuma({
          [page]: () => html("<html>app shell</html>"),
          [api]: () => Response.json(answer("event", {})),
        }),
      ),
    ],
  )
    .toEqual([
      {
        kind: "event",
        source: "markup",
        event: expect.objectContaining({
          title: "From markup",
          placement: "unknown",
        }),
      },
      {
        kind: "unavailable",
        message: "Luma didn't answer. Try again in a minute.",
      },
      {
        kind: "unavailable",
        message:
          "Luma's event page changed shape and couldn't be read. Try again later.",
      },
    ])
})
