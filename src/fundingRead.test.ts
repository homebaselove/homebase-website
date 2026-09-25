import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test"
import { ConfigProvider, Effect, Logger, LogLevel } from "effect"
import handler, {
  CacheControl,
  createRaisedReader,
  creatorFeesUrl,
  FundingAddress,
} from "../api/funding.ts"
import { GET } from "./routes/funding.json/_server.ts"

const Earned = {
  lifetimeEarnedWeth: "4.62",
  totals: {
    claimedWeth: "0",
    claimableWeth: "4.62",
  },
}

/** Stands in for Bankr: answers as told, and counts what it was asked. */
function stubBankr(initial: {
  status?: number
  body?: unknown
  delayMs?: number
  hang?: boolean
}) {
  let mode = initial
  let requests = 0

  const server = Bun.serve({
    port: 0,
    async fetch() {
      requests++

      if (mode.hang) {
        return new Promise<Response>(() => {})
      }

      if (mode.delayMs) {
        await Bun.sleep(mode.delayMs)
      }

      return Response.json(mode.body ?? {}, {
        status: mode.status ?? 200,
      })
    },
  })

  stubs.push(server)

  return {
    api: `http://127.0.0.1:${server.port}`,
    answer: (next: typeof initial) => {
      mode = next
    },
    requests: () => requests,
  }
}

const stubs: ReturnType<typeof Bun.serve>[] = []

// Failed reads are logged by design; the assertions carry the outcome. Bun
// runs every test file in one process, so the real console comes back after.
const silenced = spyOn(console, "error")

beforeAll(() => {
  silenced.mockImplementation(() => {})
})

afterAll(() => {
  silenced.mockRestore()
})

afterEach(() => {
  stubs
    .splice(0)
    .forEach((server) => server.stop(true))
  delete process.env.HOMEBASE_BANKR_API
  delete process.env.HOMEBASE_FUNDING_ADDRESS
})

async function callHandler(api: string, address?: string) {
  process.env.HOMEBASE_BANKR_API = api

  if (address) {
    process.env.HOMEBASE_FUNDING_ADDRESS = address
  }

  const headers: Record<string, string | undefined> = {}
  let status = 200
  let body: unknown

  const response = {
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value
    },
    status(code: number) {
      status = code

      return response
    },
    json(value: unknown) {
      body = value
    },
  }

  await handler(null, response)

  return {
    status,
    body,
    cacheControl: headers["cache-control"],
  }
}

async function callRoute(api: string, address?: string) {
  const config = new Map([
    [
      "HOMEBASE_BANKR_API",
      api,
    ],
  ])

  if (address) {
    config.set("HOMEBASE_FUNDING_ADDRESS", address)
  }

  const response = await Effect.runPromise(
    GET.pipe(
      Effect.withConfigProvider(ConfigProvider.fromMap(config)),
      Logger.withMinimumLogLevel(LogLevel.None),
    ),
  )

  return {
    status: response.status,
    body: JSON.parse(new TextDecoder().decode((response.body as any).body)),
    cacheControl: response.headers["cache-control"],
  }
}

test("an answer under a minute old is served without Bankr", async () => {
  const bankr = stubBankr({
    body: Earned,
  })
  let clock = 0
  const read = createRaisedReader({
    now: () => clock,
  })
  const url = creatorFeesUrl(FundingAddress, bankr.api)

  await read(url)
  clock += 59_000

  expect(
    await read(url),
  )
    .toBe(4.62)

  // Long enough for a refresh to reach Bankr, had one been started.
  await Bun.sleep(50)

  expect(
    bankr.requests(),
  )
    .toBe(1)
})

test("a kept answer comes at once while one pass refreshes it", async () => {
  const bankr = stubBankr({
    body: Earned,
  })
  let clock = 0
  const read = createRaisedReader({
    now: () => clock,
    timeoutMs: 200,
  })
  const url = creatorFeesUrl(FundingAddress, bankr.api)

  await read(url)
  bankr.answer({
    hang: true,
  })
  clock += 120_000

  const started = performance.now()
  const answers = [
    await read(url),
    await read(url),
  ]

  expect(
    answers,
  )
    .toEqual([
      4.62,
      4.62,
    ])
  expect(
    performance.now() - started < 100,
  )
    .toBe(true)

  // Once the refresh has reached Bankr and timed out: one pass, not two.
  await Bun.sleep(250)

  expect(
    bankr.requests(),
  )
    .toBe(2)
})

test("a failed refresh leaves the kept answer standing", async () => {
  const bankr = stubBankr({
    body: Earned,
  })
  let clock = 0
  const read = createRaisedReader({
    now: () => clock,
  })
  const url = creatorFeesUrl(FundingAddress, bankr.api)

  await read(url)
  bankr.answer({
    status: 503,
  })
  clock += 120_000
  await read(url)
  await Bun.sleep(50)
  clock += 120_000

  expect(
    await read(url),
  )
    .toBe(4.62)
})

test("an answer over an hour old is not served", async () => {
  const bankr = stubBankr({
    body: Earned,
  })
  let clock = 0
  const read = createRaisedReader({
    now: () => clock,
  })
  const url = creatorFeesUrl(FundingAddress, bankr.api)

  await read(url)
  bankr.answer({
    status: 503,
  })
  clock += 2 * 60 * 60_000

  await expect(
    read(url),
  )
    .rejects
    .toThrow("Bankr responded with 503")
})

test("callers arriving together share one pass", async () => {
  const bankr = stubBankr({
    body: Earned,
    delayMs: 50,
  })
  const read = createRaisedReader()
  const url = creatorFeesUrl(FundingAddress, bankr.api)

  expect(
    await Promise.all([
      read(url),
      read(url),
      read(url),
    ]),
  )
    .toEqual([
      4.62,
      4.62,
      4.62,
    ])
  expect(
    bankr.requests(),
  )
    .toBe(1)
})

test("a Bankr that never answers is cut off at the timeout", async () => {
  const bankr = stubBankr({
    hang: true,
  })
  const read = createRaisedReader({
    timeoutMs: 200,
  })
  const started = performance.now()

  await expect(
    read(creatorFeesUrl(FundingAddress, bankr.api)),
  )
    .rejects
    .toThrow()
  expect(
    performance.now() - started < 1_000,
  )
    .toBe(true)
})

test("both runtimes give the same healthy answer", async () => {
  const bankr = stubBankr({
    body: Earned,
  })
  const expected = {
    status: 200,
    body: {
      address: FundingAddress,
      raisedEth: 4.62,
    },
    cacheControl: CacheControl,
  }

  expect(
    await callHandler(bankr.api),
  )
    .toEqual(expected)
  expect(
    await callRoute(bankr.api),
  )
    .toEqual(expected)
})

test("both runtimes pass on what Bankr said went wrong", async () => {
  const refusing = stubBankr({
    status: 503,
  })
  const garbled = stubBankr({
    body: {
      foo: 1,
    },
  })

  for (const call of [callHandler, callRoute]) {
    expect(
      [
        await call(refusing.api),
        await call(garbled.api),
      ],
    )
      .toEqual([
        {
          status: 502,
          body: {
            error: "Bankr responded with 503",
          },
          cacheControl: undefined,
        },
        {
          status: 502,
          body: {
            error: "Bankr returned no creator fees",
          },
          cacheControl: undefined,
        },
      ])
  }
})

test("a failed connection answers without the request url", async () => {
  const unreachable = "http://127.0.0.1:1/v2/SECRET_KEY"

  for (const call of [callHandler, callRoute]) {
    const answer = await call(unreachable)

    expect(
      answer.status,
    )
      .toBe(502)
    expect(
      JSON.stringify(answer.body).includes("SECRET_KEY"),
    )
      .toBe(false)
  }
})

test("a malformed address override is refused before any read", async () => {
  const bankr = stubBankr({
    body: Earned,
  })

  for (const call of [callHandler, callRoute]) {
    expect(
      (await call(bankr.api, "not-an-address")).status,
    )
      .toBe(500)
  }
  expect(
    bankr.requests(),
  )
    .toBe(0)
})
