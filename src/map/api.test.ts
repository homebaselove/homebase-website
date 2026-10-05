import { SqlClient } from "@effect/sql"
import * as SqliteClient from "@effect/sql-sqlite-bun/SqliteClient"
import { afterEach, beforeAll, expect, spyOn, test } from "bun:test"
import { ManagedRuntime } from "effect"
import * as AbiFunction from "ox/AbiFunction"
import * as Address from "ox/Address"
import * as Hex from "ox/Hex"
import * as PersonalMessage from "ox/PersonalMessage"
import * as Secp256k1 from "ox/Secp256k1"
import * as Signature from "ox/Signature"
import {
  type Context,
  handle,
  ListCacheControl,
  RefreshAfterMs,
} from "./api.ts"
import { sqlClientStore } from "./bun.ts"
import { apiUrl, pageUrl } from "./luma.ts"
import * as Repo from "./store.ts"
import type { Store } from "./store.ts"

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

const Rpc = "http://chain.test/rpc"

const LockContract = "0x1111111111111111111111111111111111111111"

const lockedBalanceOf = AbiFunction.from(
  "function lockedBalanceOf(address account) view returns (uint256)",
)

const lockWithEnd = AbiFunction.from(
  "function locks(address user) view returns (uint256 amount, uint256 start, uint256 end)",
)

/**
 * Stands in for the web: Luma pages by URL, and a Base node that validates
 * signatures and reads locks as told.
 */
function stubWeb(initial: {
  luma?: Record<string, () => Response>
  validator?:
    | "valid"
    | "invalid"
    | "revert"
    | "down"
  locked?: bigint
  lockEnd?: bigint
} = {}) {
  let mode = initial
  const calls: unknown[] = []
  const fetchFn =
    (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input)

      if (url === Rpc) {
        const { params } = JSON.parse(String(init?.body))
        const call = params[0]

        calls.push(call)

        if (mode.validator === "down") {
          return new Response("down", {
            status: 503,
          })
        }

        if (!call.to) {
          return Response.json({
            jsonrpc: "2.0",
            id: 1,
            ...(mode.validator === "revert"
              ? {
                error: {
                  code: 3,
                  message: "execution reverted",
                },
              }
              : {
                result: mode.validator === "valid" ? "0x01" : "0x00",
              }),
          })
        }

        if (call.to === LockContract) {
          const selector = call.data.slice(0, 10)
          const result = selector === AbiFunction.getSelector(lockedBalanceOf)
            ? AbiFunction.encodeResult(lockedBalanceOf, mode.locked ?? 0n)
            : selector === AbiFunction.getSelector(lockWithEnd)
            ? AbiFunction.encodeResult(lockWithEnd, [
              mode.locked ?? 0n,
              0n,
              mode.lockEnd ?? 0n,
            ])
            : "0x"

          return Response.json({
            jsonrpc: "2.0",
            id: 1,
            result,
          })
        }

        return Response.json({
          jsonrpc: "2.0",
          id: 1,
          result: "0x",
        })
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
    answer: (next: typeof initial) => {
      mode = {
        ...mode,
        ...next,
      }
    },
  }
}

const runtimes: ManagedRuntime.ManagedRuntime<any, any>[] = []

async function openStore(): Promise<Store> {
  const runtime = ManagedRuntime.make(
    SqliteClient.layer({
      filename: ":memory:",
    }),
  )

  runtimes.push(runtime)

  const store = sqlClientStore(await runtime.runPromise(SqlClient.SqlClient))

  await Repo.ensureSchema(store)

  return store
}

const AdminKey = "correct-horse-battery-staple"

const Now = new Date("2026-10-05T12:00:00.000Z")

async function site(options: {
  env?: Record<string, string | undefined>
  web?: ReturnType<typeof stubWeb>
  now?: () => Date
} = {}) {
  const store = await openStore()
  const web = options.web ?? stubWeb()
  const ctx: Context = {
    store,
    env: {
      HOMEBASE_MAP_ADMIN_KEY: AdminKey,
      HOMEBASE_BASE_RPC: Rpc,
      HOMEBASE_SITE_HOSTS: "homebase.test",
      ...options.env,
    },
    fetch: web.fetch,
    now: options.now ?? (() => Now),
  }

  return {
    ctx,
    store,
    web,
  }
}

let clients = 0

/** Each test comes from its own address, so the per-address limits stay out of its way. */
const client = () => `10.0.${Math.floor(clients / 250)}.${++clients % 250}`

interface Call {
  method?: string
  path?: string
  token?: string
  body?: unknown
  ip?: string
  host?: string
}

function request(call: Call): Request {
  return new Request(`https://homebase.test${call.path ?? "/map.json"}`, {
    method: call.method ?? "GET",
    headers: {
      "x-forwarded-host": call.host ?? "homebase.test",
      "x-forwarded-proto": "https",
      "x-forwarded-for": call.ip ?? client(),
      ...(call.token
        ? {
          authorization: `Bearer ${call.token}`,
        }
        : {}),
      ...(call.body !== undefined
        ? {
          "content-type": "application/json",
        }
        : {}),
    },
    body: call.body === undefined ? undefined : JSON.stringify(call.body),
  })
}

async function answer(response: Response) {
  return {
    status: response.status,
    body: await response.json(),
    cacheControl: response.headers.get("cache-control"),
  }
}

// Failed reads are logged by design; the assertions carry the outcome.
const silenced = spyOn(console, "error")

beforeAll(() => {
  silenced.mockImplementation(() => {})
})

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) {
    await runtime.dispose()
  }
})

test("the map starts empty and is cached for a minute", async () => {
  const { ctx } = await site()

  expect(
    await answer(await handle(request({}), "map", ctx)),
  )
    .toEqual({
      status: 200,
      body: {
        events: [],
        generatedAt: Now.toISOString(),
      },
      cacheControl: ListCacheControl,
    })
})

test("adding an event takes the admin key and nothing less", async () => {
  const { ctx } = await site()
  const body = {
    url: "https://luma.com/abc123",
  }

  expect(
    [
      (await handle(
        request({
          method: "POST",
          body,
        }),
        "map",
        ctx,
      ))
        .status,
      (await handle(
        request({
          method: "POST",
          token: "wrong-key",
          body,
        }),
        "map",
        ctx,
      ))
        .status,
      (await handle(
        request({
          method: "POST",
          token: "a".repeat(64),
          body,
        }),
        "map",
        ctx,
      ))
        .status,
    ],
  )
    .toEqual([
      401,
      401,
      401,
    ])
})

test("a pasted link becomes a pin, and pasting it again changes nothing", async () => {
  const web = stubWeb({
    luma: {
      [
        pageUrl({
          kind: "slug",
          slug: "abc123",
        })
      ]: () => pageFor(lumaEvent("abc123")),
    },
  })
  const { ctx } = await site({
    web,
  })
  const first = await answer(
    await handle(
      request({
        method: "POST",
        token: AdminKey,
        body: {
          url: "https://lu.ma/abc123?tk=secret",
        },
      }),
      "map",
      ctx,
    ),
  )

  expect(
    first,
  )
    .toEqual({
      status: 201,
      body: {
        source: "page",
        event: {
          slug: "abc123",
          lumaId: "evt-abc123",
          url: "https://luma.com/abc123",
          title: "Event abc123",
          description: null,
          start: "2026-11-01T18:00:00.000Z",
          end: "2026-11-01T21:00:00.000Z",
          timezone: "Europe/Lisbon",
          venue: "The venue",
          address: "Somewhere 1, Lisbon",
          city: "Lisbon, Portugal",
          lat: 38.7,
          lng: -9.1,
          placement: "venue",
          cover: null,
          hosts: [],
          calendar: null,
          status: "live",
          addedBy: "admin",
          addedAt: Now.toISOString(),
          checkedAt: Now.toISOString(),
        },
      },
      cacheControl: null,
    })

  const later = new Date(Now.getTime() + 60_000)
  const again = await answer(
    await handle(
      request({
        method: "POST",
        token: AdminKey,
        body: {
          url: "https://luma.com/abc123",
        },
      }),
      "map",
      {
        ...ctx,
        now: () => later,
      },
    ),
  )

  expect(
    [
      again.status,
      again.body.event.addedAt,
      again.body.event.checkedAt,
    ],
  )
    .toEqual([
      200,
      Now.toISOString(),
      later.toISOString(),
    ])
  expect(
    (await answer(await handle(request({}), "map", ctx))).body.events.length,
  )
    .toBe(1)
})

test("a preview reads the event without pinning it", async () => {
  const web = stubWeb({
    luma: {
      [
        pageUrl({
          kind: "slug",
          slug: "abc123",
        })
      ]: () => pageFor(lumaEvent("abc123")),
    },
  })
  const { ctx } = await site({
    web,
  })
  const preview = await answer(
    await handle(
      request({
        method: "POST",
        path: "/map/preview.json",
        token: AdminKey,
        body: {
          url: "https://luma.com/abc123",
        },
      }),
      "preview",
      ctx,
    ),
  )

  expect(
    [
      preview.status,
      preview.body.event.title,
      "status" in preview.body.event,
      (await answer(await handle(request({}), "map", ctx))).body.events,
    ],
  )
    .toEqual([
      200,
      "Event abc123",
      false,
      [],
    ])
})

test("what Luma says about a link comes back as the reason", async () => {
  const slugUrls = (slug: string) => ({
    page: pageUrl({
      kind: "slug",
      slug,
    }),
    api: apiUrl({
      kind: "slug",
      slug,
    }),
  })
  const down = () =>
    new Response("down", {
      status: 500,
    })
  const web = stubWeb({
    luma: {
      [slugUrls("calendar1").page]: () =>
        pageFor({
          kind: "calendar",
          data: {},
        }),
      [slugUrls("flaky").page]: down,
      [slugUrls("flaky").api]: down,
    },
  })
  const { ctx } = await site({
    web,
  })
  const post = async (url: string) =>
    answer(
      await handle(
        request({
          method: "POST",
          token: AdminKey,
          body: {
            url,
          },
        }),
        "map",
        ctx,
      ),
    )

  expect(
    [
      await post("https://eventbrite.com/e/1"),
      await post("https://luma.com/calendar1"),
      await post("https://luma.com/missing1"),
      await post("https://luma.com/flaky"),
    ],
  )
    .toEqual([
      {
        status: 400,
        body: {
          error:
            "That link isn't on Luma. Paste a lu.ma or luma.com event link.",
        },
        cacheControl: null,
      },
      {
        status: 422,
        body: {
          error:
            "That link is a Luma calendar. Paste a link to a single event.",
        },
        cacheControl: null,
      },
      {
        status: 404,
        body: {
          error:
            "Luma shows no public event at that link. It may be private, cancelled, or mistyped.",
        },
        cacheControl: null,
      },
      {
        status: 502,
        body: {
          error: "Luma didn't answer. Try again in a minute.",
        },
        cacheControl: null,
      },
    ])
})

test("an admin can take an event off the map", async () => {
  const web = stubWeb({
    luma: {
      [
        pageUrl({
          kind: "slug",
          slug: "abc123",
        })
      ]: () => pageFor(lumaEvent("abc123")),
    },
  })
  const { ctx } = await site({
    web,
  })

  await handle(
    request({
      method: "POST",
      token: AdminKey,
      body: {
        url: "https://luma.com/abc123",
      },
    }),
    "map",
    ctx,
  )

  expect(
    [
      (await handle(
        request({
          method: "DELETE",
          path: "/map.json?slug=abc123",
        }),
        "map",
        ctx,
      ))
        .status,
      (await handle(
        request({
          method: "DELETE",
          path: "/map.json?slug=nope",
          token: AdminKey,
        }),
        "map",
        ctx,
      ))
        .status,
      await answer(
        await handle(
          request({
            method: "DELETE",
            path: "/map.json?slug=abc123",
            token: AdminKey,
          }),
          "map",
          ctx,
        ),
      ),
      (await answer(await handle(request({}), "map", ctx))).body.events,
    ],
  )
    .toEqual([
      401,
      404,
      {
        status: 200,
        body: {
          removed: "abc123",
        },
        cacheControl: null,
      },
      [],
    ])
})

test("a refresh reads aged pins again and retires the ones Luma dropped", async () => {
  const slug = (name: string) => ({
    kind: "slug" as const,
    slug: name,
  })
  const web = stubWeb({
    luma: {
      [pageUrl(slug("stays"))]: () => pageFor(lumaEvent("stays")),
      [pageUrl(slug("moves"))]: () => pageFor(lumaEvent("moves")),
      [pageUrl(slug("leaves"))]: () => pageFor(lumaEvent("leaves")),
    },
  })
  const { ctx, store } = await site({
    web,
    env: {
      CRON_SECRET: "cron-secret",
    },
  })
  const add = (name: string) =>
    handle(
      request({
        method: "POST",
        token: AdminKey,
        body: {
          url: `https://luma.com/${name}`,
        },
      }),
      "map",
      ctx,
    )

  await add("stays")
  await add("moves")
  await add("leaves")

  web.answer({
    luma: {
      [pageUrl(slug("stays"))]: () => pageFor(lumaEvent("stays")),
      [pageUrl(slug("moves"))]: () =>
        pageFor(
          lumaEvent("moves", {
            name: "Event moves, now in Porto",
            coordinate: {
              latitude: 41.15,
              longitude: -8.61,
            },
          }),
        ),
      [pageUrl(slug("leaves"))]: () =>
        new Response("gone", {
          status: 404,
        }),
    },
  })

  const later = new Date(Now.getTime() + RefreshAfterMs + 1)
  const aged = {
    ...ctx,
    now: () => later,
  }

  expect(
    [
      (await handle(
        request({
          method: "POST",
          path: "/map/refresh.json",
        }),
        "refresh",
        aged,
      ))
        .status,
      await answer(
        await handle(
          request({
            method: "POST",
            path: "/map/refresh.json",
            token: "cron-secret",
          }),
          "refresh",
          aged,
        ),
      ),
      (await answer(await handle(request({}), "map", aged)))
        .body
        .events
        .map((event: {
          slug: string
          title: string
          lat: number
          checkedAt: string
        }) => [
          event.slug,
          event.title,
          event.lat,
          event.checkedAt,
        ]),
      (await Repo.getEvent(store, "leaves"))?.status,
    ],
  )
    .toEqual([
      401,
      {
        status: 200,
        body: {
          checked: 3,
          updated: 2,
          gone: 1,
          failed: 0,
          remaining: 0,
        },
        cacheControl: null,
      },
      [
        [
          "stays",
          "Event stays",
          38.7,
          later.toISOString(),
        ],
        [
          "moves",
          "Event moves, now in Porto",
          41.15,
          later.toISOString(),
        ],
      ],
      "gone",
    ])

  // Pins just read are left alone until they age again.
  expect(
    (await answer(
      await handle(
        request({
          method: "POST",
          path: "/map/refresh.json",
          token: "cron-secret",
        }),
        "refresh",
        aged,
      ),
    ))
      .body
      .checked,
  )
    .toBe(0)
})

const privateKey = Secp256k1.randomPrivateKey()

const wallet = Address.checksum(
  Address.fromPublicKey(Secp256k1.getPublicKey({
    privateKey,
  })),
)

const sign = (message: string) =>
  Signature.toHex(
    Secp256k1.sign({
      payload: PersonalMessage.getSignPayload(Hex.fromString(message)),
      privateKey,
    }),
  )

async function signIn(
  ctx: Context,
  address = wallet,
  signer: (message: string) => string = sign,
) {
  const issued = await answer(
    await handle(
      request({
        method: "POST",
        path: "/auth/nonce.json",
        body: {
          address,
        },
      }),
      "nonce",
      ctx,
    ),
  )

  if (issued.status !== 200) {
    return {
      issued,
    }
  }

  const message: string = issued.body.message
  const verified = await answer(
    await handle(
      request({
        method: "POST",
        path: "/auth/verify.json",
        body: {
          message,
          signature: signer(message),
        },
      }),
      "verify",
      ctx,
    ),
  )

  return {
    issued,
    message,
    verified,
  }
}

test("wallet sign-in is closed until a wallet is allowed in", async () => {
  const { ctx } = await site()

  expect(
    await answer(
      await handle(
        request({
          method: "POST",
          path: "/auth/nonce.json",
          body: {
            address: wallet,
          },
        }),
        "nonce",
        ctx,
      ),
    ),
  )
    .toEqual({
      status: 404,
      body: {
        error: "Wallet sign-in isn't open yet.",
      },
      cacheControl: null,
    })
})

test("an admin wallet signs a message the server wrote and gets a session", async () => {
  const web = stubWeb({
    luma: {
      [
        pageUrl({
          kind: "slug",
          slug: "abc123",
        })
      ]: () => pageFor(lumaEvent("abc123")),
    },
  })
  const { ctx } = await site({
    web,
    env: {
      HOMEBASE_ADMIN_ADDRESSES:
        ` ${wallet.toLowerCase()} , 0x000000000000000000000000000000000000dEaD`,
    },
  })
  const { message, verified } = await signIn(ctx)

  expect(
    message,
  )
    .toContain("homebase.test wants you to sign in with your Ethereum account:")
  expect(
    message,
  )
    .toContain("Chain ID: 8453")
  expect(
    verified,
  )
    .toEqual({
      status: 200,
      body: {
        token: expect.stringMatching(/^[0-9a-f]{64}$/),
        role: "admin",
        address: wallet,
        via: "wallet",
        expiresAt: "2026-10-06T12:00:00.000Z",
      },
      cacheControl: null,
    })

  const token = verified!.body.token
  const pinned = await answer(
    await handle(
      request({
        method: "POST",
        token,
        body: {
          url: "https://luma.com/abc123",
        },
      }),
      "map",
      ctx,
    ),
  )

  expect(
    [
      pinned.status,
      pinned.body.event.addedBy,
      (await answer(
        await handle(
          request({
            path: "/auth/session.json",
            token,
          }),
          "session",
          ctx,
        ),
      ))
        .body,
    ],
  )
    .toEqual([
      201,
      wallet,
      {
        actor: {
          role: "admin",
          address: wallet,
          via: "wallet",
          expiresAt: "2026-10-06T12:00:00.000Z",
        },
        walletSignIn: true,
      },
    ])

  await handle(
    request({
      method: "DELETE",
      path: "/auth/session.json",
      token,
    }),
    "session",
    ctx,
  )

  expect(
    (await answer(
      await handle(
        request({
          path: "/auth/session.json",
          token,
        }),
        "session",
        ctx,
      ),
    ))
      .body
      .actor,
  )
    .toBeNull()
})

test("a signed message is good once, and web calls never reach the chain for a plain wallet", async () => {
  const web = stubWeb()
  const { ctx } = await site({
    web,
    env: {
      HOMEBASE_ADMIN_ADDRESSES: wallet,
    },
  })
  const { message, verified } = await signIn(ctx)
  const replay = await answer(
    await handle(
      request({
        method: "POST",
        path: "/auth/verify.json",
        body: {
          message,
          signature: sign(message!),
        },
      }),
      "verify",
      ctx,
    ),
  )

  expect(
    [
      verified!.status,
      replay,
      web.calls.length,
    ],
  )
    .toEqual([
      200,
      {
        status: 401,
        body: {
          error: "That sign-in request expired. Try again.",
        },
        cacheControl: null,
      },
      0,
    ])
})

test("a request naming another host gets no message and no session, so a page elsewhere cannot have one written in its name", async () => {
  const { ctx } = await site({
    env: {
      HOMEBASE_ADMIN_ADDRESSES: wallet,
    },
  })
  const { message } = await signIn(ctx)
  const forHost = async (host: string, path: string, body: unknown) =>
    answer(
      await handle(
        request({
          method: "POST",
          path,
          host,
          body,
        }),
        path === "/auth/nonce.json" ? "nonce" : "verify",
        ctx,
      ),
    )
  const refused = {
    status: 400,
    body: {
      error:
        "Wallet sign-in isn't set up for this address of the site. Add its hostname to HOMEBASE_SITE_HOSTS.",
    },
    cacheControl: null,
  }

  expect(
    [
      await forHost("evil.test", "/auth/nonce.json", {
        address: wallet,
      }),
      await forHost("evil.test", "/auth/verify.json", {
        message,
        signature: sign(message!),
      }),
      await forHost("homebase.test:443", "/auth/nonce.json", {
        address: wallet,
      }),
    ],
  )
    .toEqual([
      refused,
      refused,
      refused,
    ])
})

test("with no hosts configured, sign-in serves the local host alone", async () => {
  const { ctx } = await site({
    env: {
      HOMEBASE_ADMIN_ADDRESSES: wallet,
      HOMEBASE_SITE_HOSTS: undefined,
    },
  })
  const ask = (host: string) =>
    handle(
      request({
        method: "POST",
        path: "/auth/nonce.json",
        host,
        body: {
          address: wallet,
        },
      }),
      "nonce",
      ctx,
    )
  const local = await ask("localhost:3000")
  const remote = await ask("homebase.test")

  expect(
    [
      local.status,
      (await local.json() as {
        message: string
      })
        .message
        .split("\n")[0],
      remote.status,
    ],
  )
    .toEqual([
      200,
      "localhost:3000 wants you to sign in with your Ethereum account:",
      400,
    ])
})

test("a stranger's wallet, a forged signature and another site's message are all turned away", async () => {
  const web = stubWeb({
    validator: "invalid",
  })
  const { ctx } = await site({
    web,
    env: {
      HOMEBASE_ADMIN_ADDRESSES: wallet,
    },
  })
  const otherKey = Secp256k1.randomPrivateKey()
  const stranger = Address.checksum(
    Address.fromPublicKey(Secp256k1.getPublicKey({
      privateKey: otherKey,
    })),
  )
  const forged = await signIn(ctx, wallet, (message) =>
    Signature.toHex(
      Secp256k1.sign({
        payload: PersonalMessage.getSignPayload(Hex.fromString(message)),
        privateKey: otherKey,
      }),
    ))
  const unknown = await signIn(ctx, stranger, (message) =>
    Signature.toHex(
      Secp256k1.sign({
        payload: PersonalMessage.getSignPayload(Hex.fromString(message)),
        privateKey: otherKey,
      }),
    ))
  const issued = await answer(
    await handle(
      request({
        method: "POST",
        path: "/auth/nonce.json",
        body: {
          address: wallet,
        },
      }),
      "nonce",
      ctx,
    ),
  )
  const elsewhere = (issued.body.message as string).replace(
    "homebase.test",
    "evil.test",
  )

  expect(
    [
      forged.verified,
      unknown.verified,
      await answer(
        await handle(
          request({
            method: "POST",
            path: "/auth/verify.json",
            body: {
              message: elsewhere,
              signature: sign(elsewhere),
            },
          }),
          "verify",
          ctx,
        ),
      ),
    ],
  )
    .toEqual([
      {
        status: 401,
        body: {
          error: "The signature doesn't match the wallet.",
        },
        cacheControl: null,
      },
      {
        status: 403,
        body: {
          error:
            "This wallet can't add events yet. Homebase admins can now, and $home lockers will be able to soon.",
        },
        cacheControl: null,
      },
      {
        status: 400,
        body: {
          error: "That sign-in message was issued for another site.",
        },
        cacheControl: null,
      },
    ])
})

test("a smart wallet's signature is put to Base's universal validator", async () => {
  const web = stubWeb({
    validator: "valid",
  })
  const { ctx } = await site({
    web,
    env: {
      HOMEBASE_ADMIN_ADDRESSES: wallet,
    },
  })
  // What a smart wallet returns bears no relation to the key behind an EOA.
  const contractSignature = () => `0x${"ab".repeat(100)}`
  const accepted = await signIn(ctx, wallet, contractSignature)

  web.answer({
    validator: "revert",
  })

  const refused = await signIn(ctx, wallet, contractSignature)

  web.answer({
    validator: "down",
  })

  const unreachable = await signIn(ctx, wallet, contractSignature)
  const validatorCalls = web.calls.filter((call) =>
    !(call as {
      to?: string
    })
      .to
  )

  expect(
    [
      accepted.verified!.status,
      accepted.verified!.body.role,
      refused.verified,
      unreachable.verified,
      validatorCalls.length,
      (validatorCalls[0] as {
        data: string
      })
        .data
        .startsWith("0x60"),
    ],
  )
    .toEqual([
      200,
      "admin",
      {
        status: 401,
        body: {
          error: "The signature doesn't match the wallet.",
        },
        cacheControl: null,
      },
      {
        status: 502,
        body: {
          error: "Couldn't reach Base to check the signature. Try again.",
        },
        cacheControl: null,
      },
      3,
      true,
    ])
})

test("a wallet with enough $home locked gets an hour as a locker", async () => {
  const web = stubWeb({
    locked: 5n * 10n ** 18n,
  })
  const { ctx } = await site({
    web,
    env: {
      HOMEBASE_LOCK_CONTRACT: LockContract,
      HOMEBASE_LOCK_MIN: (10n ** 18n).toString(),
    },
  })
  const locker = await signIn(ctx)

  web.answer({
    locked: 10n ** 17n,
  })

  const short = await signIn(ctx)

  expect(
    [
      locker.verified!.status,
      locker.verified!.body.role,
      locker.verified!.body.expiresAt,
      short.verified,
    ],
  )
    .toEqual([
      200,
      "locker",
      "2026-10-05T13:00:00.000Z",
      {
        status: 403,
        body: {
          error: "This wallet hasn't locked enough $home to add events.",
        },
        cacheControl: null,
      },
    ])
})

test("a locker can remove the pins they added, and no others", async () => {
  const web = stubWeb({
    locked: 5n * 10n ** 18n,
    luma: {
      [
        pageUrl({
          kind: "slug",
          slug: "mine",
        })
      ]: () => pageFor(lumaEvent("mine")),
      [
        pageUrl({
          kind: "slug",
          slug: "theirs",
        })
      ]: () => pageFor(lumaEvent("theirs")),
    },
  })
  const { ctx } = await site({
    web,
    env: {
      HOMEBASE_LOCK_CONTRACT: LockContract,
      HOMEBASE_LOCK_MIN: "1",
    },
  })
  const locker: string = (await signIn(ctx)).verified!.body.token
  const post = (token: string, name: string) =>
    handle(
      request({
        method: "POST",
        token,
        body: {
          url: `https://luma.com/${name}`,
        },
      }),
      "map",
      ctx,
    )
  const remove = (token: string, name: string) =>
    handle(
      request({
        method: "DELETE",
        path: `/map.json?slug=${name}`,
        token,
      }),
      "map",
      ctx,
    )

  await post(locker, "mine")
  await post(AdminKey, "theirs")

  expect(
    [
      await answer(await remove(locker, "theirs")),
      (await remove(locker, "mine")).status,
      (await remove(AdminKey, "theirs")).status,
    ],
  )
    .toEqual([
      {
        status: 403,
        body: {
          error:
            "Only the wallet that added an event, or an admin, can remove it.",
        },
        cacheControl: null,
      },
      200,
      200,
    ])
})

test("a refresh keeps a pin Luma is silent about, and keeps the venue of one only the markup answers for", async () => {
  const slug = (name: string) => ({
    kind: "slug" as const,
    slug: name,
  })
  const web = stubWeb({
    luma: {
      [pageUrl(slug("silent"))]: () => pageFor(lumaEvent("silent")),
      [pageUrl(slug("marked"))]: () => pageFor(lumaEvent("marked")),
    },
  })
  const { ctx, store } = await site({
    web,
    env: {
      CRON_SECRET: "cron-secret",
    },
  })
  const add = (name: string) =>
    handle(
      request({
        method: "POST",
        token: AdminKey,
        body: {
          url: `https://luma.com/${name}`,
        },
      }),
      "map",
      ctx,
    )

  await add("silent")
  await add("marked")

  // The endpoint hosts answer 404 by default, which never retires a pin.
  web.answer({
    luma: {
      [pageUrl(slug("silent"))]: () =>
        new Response("busy", {
          status: 503,
        }),
      [pageUrl(slug("marked"))]: () =>
        new Response(
          `<html><script type="application/ld+json">${
            JSON.stringify({
              "@type": "Event",
              name: "Event marked, renamed",
              startDate: "2026-11-02T18:00:00Z",
            })
          }</script></html>`,
          {
            headers: {
              "content-type": "text/html",
            },
          },
        ),
    },
  })

  const later = new Date(Now.getTime() + RefreshAfterMs + 1)
  const report = await answer(
    await handle(
      request({
        method: "POST",
        path: "/map/refresh.json",
        token: "cron-secret",
      }),
      "refresh",
      {
        ...ctx,
        now: () => later,
      },
    ),
  )
  const silent = await Repo.getEvent(store, "silent")
  const marked = await Repo.getEvent(store, "marked")

  expect(
    [
      report.body,
      silent && [
        silent.status,
        silent.checkedAt,
        silent.title,
      ],
      marked && [
        marked.title,
        marked.start,
        marked.lumaId,
        marked.timezone,
        marked.venue,
        marked.lat,
        marked.placement,
      ],
    ],
  )
    .toEqual([
      {
        checked: 2,
        updated: 1,
        gone: 0,
        failed: 1,
        remaining: 0,
      },
      [
        "live",
        later.toISOString(),
        "Event silent",
      ],
      [
        "Event marked, renamed",
        "2026-11-02T18:00:00.000Z",
        "evt-marked",
        "Europe/Lisbon",
        "The venue",
        38.7,
        "venue",
      ],
    ])
})

test("a lock that has ended no longer counts, under a multi-value read", async () => {
  const env = {
    HOMEBASE_LOCK_CONTRACT: LockContract,
    HOMEBASE_LOCK_READ:
      "function locks(address user) view returns (uint256 amount, uint256 start, uint256 end)",
    HOMEBASE_LOCK_AMOUNT_INDEX: "0",
    HOMEBASE_LOCK_END_INDEX: "2",
    HOMEBASE_LOCK_MIN: "1",
  }
  const nowSeconds = BigInt(Math.floor(Now.getTime() / 1000))
  const running = await site({
    web: stubWeb({
      locked: 1n,
      lockEnd: nowSeconds + 3600n,
    }),
    env,
  })
  const ended = await site({
    web: stubWeb({
      locked: 1n,
      lockEnd: nowSeconds - 1n,
    }),
    env,
  })

  expect(
    [
      (await signIn(running.ctx)).verified!.body.role,
      (await signIn(ended.ctx)).verified!.status,
    ],
  )
    .toEqual([
      "locker",
      403,
    ])
})

test("sign-in attempts are limited per address", async () => {
  const { ctx } = await site({
    env: {
      HOMEBASE_ADMIN_ADDRESSES: wallet,
    },
  })
  const ip = client()
  const statuses: number[] = []

  for (let attempt = 0; attempt < 11; attempt++) {
    statuses.push(
      (await handle(
        request({
          method: "POST",
          path: "/auth/nonce.json",
          ip,
          body: {
            address: wallet,
          },
        }),
        "nonce",
        ctx,
      ))
        .status,
    )
  }

  expect(
    statuses,
  )
    .toEqual([
      ...Array(10).fill(200),
      429,
    ])
})

test("a body that is not what the endpoint expects is refused before anything else", async () => {
  const { ctx } = await site()

  expect(
    [
      (await handle(
        new Request("https://homebase.test/map.json", {
          method: "POST",
          headers: {
            authorization: `Bearer ${AdminKey}`,
            "x-forwarded-for": client(),
          },
          body: "not json",
        }),
        "map",
        ctx,
      ))
        .status,
      (await handle(
        request({
          method: "POST",
          token: AdminKey,
          body: {
            link: "https://luma.com/abc123",
          },
        }),
        "map",
        ctx,
      ))
        .status,
      (await handle(
        request({
          method: "PUT",
        }),
        "map",
        ctx,
      ))
        .status,
    ],
  )
    .toEqual([
      400,
      400,
      405,
    ])
})

test("rows survive the trip through a libSQL result set", async () => {
  const rows = [
    [
      "abc",
      1.5,
      null,
    ],
  ]
  const store = Repo.libsqlStore({
    execute: async (statement) => ({
      columns: [
        "slug",
        "lat",
        "end",
      ],
      rows: statement.args.length ? rows : [],
    }),
  })

  expect(
    [
      await store.run("select 1 where ? = 1", [
        1,
      ]),
      await store.run("select 1"),
    ],
  )
    .toEqual([
      [
        {
          slug: "abc",
          lat: 1.5,
          end: null,
        },
      ],
      [],
    ])
})
