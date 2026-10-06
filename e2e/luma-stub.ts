/**
 * Preloaded into the server for the end-to-end run: answers Luma's hosts
 * from fixtures, so the suite needs no network and tests the same reader
 * the live site uses. Nothing in the site changes; only this process's
 * fetch does.
 */
const original = globalThis.fetch

const venue = (slug: string, name: string) => ({
  api_id: `evt-${slug}`,
  event: {
    api_id: `evt-${slug}`,
    name,
    url: slug,
    start_at: "2026-11-20T18:00:00.000Z",
    end_at: "2026-11-20T21:00:00.000Z",
    timezone: "Europe/Lisbon",
    cover_url: "https://images.lumacdn.com/cdn-cgi/image/e2e-cover.png",
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
  "e2e-locker-night": venue("e2e-locker-night", "Locker night"),
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
