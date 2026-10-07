/**
 * Preloaded into the server for the end-to-end run: answers Luma's hosts
 * from fixtures, so the suite needs no network and tests the same reader
 * the live site uses. Nothing in the site changes; only this process's
 * fetch does.
 */
const original = globalThis.fetch

interface Where {
  readonly latitude: number
  readonly longitude: number
  readonly address: string
  readonly city: string
  readonly full_address: string
  readonly description: string
}

const Lisbon: Where = {
  latitude: 38.7223,
  longitude: -9.1393,
  address: "Rua do Grilo 1",
  city: "Lisbon",
  full_address: "Rua do Grilo 1, 1950-144 Lisbon, Portugal",
  description: "grow.inc SPACES",
}

/** Close enough to Lisbon to share a badge at the world, far enough to split a few zooms in. */
const Porto: Where = {
  latitude: 41.1496,
  longitude: -8.611,
  address: "Rua de Cedofeita 112",
  city: "Porto",
  full_address: "Rua de Cedofeita 112, 4050-174 Porto, Portugal",
  description: "Porto i/o",
}

const venue = (
  slug: string,
  name: string,
  where: Where = Lisbon,
  day = "2026-11-20",
) => ({
  api_id: `evt-${slug}`,
  event: {
    api_id: `evt-${slug}`,
    name,
    url: slug,
    start_at: `${day}T18:00:00.000Z`,
    end_at: `${day}T21:00:00.000Z`,
    timezone: "Europe/Lisbon",
    cover_url: "https://images.lumacdn.com/cdn-cgi/image/e2e-cover.png",
    location_type: "offline",
    geo_address_visibility: "public",
    coordinate: {
      latitude: where.latitude,
      longitude: where.longitude,
    },
    geo_address_info: {
      address: where.address,
      city: where.city,
      country: "Portugal",
      city_state: `${where.city}, Portugal`,
      full_address: where.full_address,
      description: where.description,
      mode: "exact",
    },
  },
  hosts: [
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
            text: "Founders in residence demo what they built this season.",
          },
        ],
      },
    ],
  },
})

export const Fixtures: Record<string, Record<string, unknown>> = {
  "e2e-demo-day": venue("e2e-demo-day", "Based House Lisbon · Demo Day"),
  "e2e-build-night": venue("e2e-build-night", "Lisbon build night"),
  // A week later, up the coast, with a title that must stay text wherever it shows.
  "e2e-locker-night": venue(
    "e2e-locker-night",
    "Locker night <b>& more</b>",
    Porto,
    "2026-11-27",
  ),
}

/** The calendar feed the suite adds to Homebase Live, with two streams ahead. */
export const LiveFeed = "https://api.lu.ma/ics/get?entity=calendar&id=cal-e2e"

const Day = 24 * 60 * 60_000

/** A time as iCalendar writes it in UTC. */
const stamp = (at: number) =>
  new Date(at).toISOString().replace(/[-:]|\.\d{3}/g, String())

/** Noon UTC, a week and two weeks ahead, so a zone east of +12 sees the next day. */
const noonAhead = (days: number) => {
  const today = new Date()

  return Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate() + days,
    12,
  )
}

const liveIcs = () => {
  const soon = noonAhead(7)
  const later = noonAhead(14)

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Luma//EN",
    "X-WR-CALNAME:Homebase on Luma",
    "BEGIN:VEVENT",
    "UID:demo-stream@luma",
    `DTSTART:${stamp(soon)}`,
    `DTEND:${stamp(soon + 60 * 60_000)}`,
    "SUMMARY:Demo day stream",
    "DESCRIPTION:Founders demo what they built.",
    "URL:https://lu.ma/e2e-demo-stream",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:office-hours@luma",
    `DTSTART:${stamp(later)}`,
    `DTEND:${stamp(later + 60 * 60_000)}`,
    "SUMMARY:Office hours",
    "LOCATION:https://youtube.com/live/e2e",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .join("\r\n")
}

const page = (data: Record<string, unknown>) =>
  new Response(
    `<!doctype html><html><head><title>Luma</title></head><body><script id="__NEXT_DATA__" type="application/json">${
      JSON.stringify({
        props: {
          pageProps: {
            initialData: {
              kind: "event",
              data,
            },
          },
        },
      })
    }</script></body></html>`,
    {
      headers: {
        "content-type": "text/html",
      },
    },
  )

globalThis.fetch = (async (
  input: string | URL | Request,
  init?: RequestInit,
) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
      ? input.href
      : input.url,
  )

  if (url.href.startsWith(LiveFeed)) {
    return new Response(liveIcs(), {
      headers: {
        "content-type": "text/calendar",
      },
    })
  }

  if (/(^|\.)(lu\.ma|luma\.com)$/.test(url.hostname)) {
    const slug = url.pathname.split("/").filter(Boolean).at(-1) ?? ""
    const data = url.hostname.startsWith("api") ? undefined : Fixtures[slug]

    return data
      ? page(data)
      : new Response("not found", {
        status: 404,
      })
  }

  return original(input, init)
}) as typeof fetch
