import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test"
import { ConfigProvider, Effect } from "effect"
import * as AbiFunction from "ox/AbiFunction"
import type * as Hex from "ox/Hex"
import handler, {
  BaseRpcUrl,
  CacheControl,
  createRaisedReader,
  FundingAddress,
  HomePoolId,
} from "../api/funding.ts"
import { GET } from "./routes/funding.json/_server.ts"

/**
 * $home's fee ledger as recorded on Base: the address's share, with the
 * pool's fees sized so it comes to the 1.061413 WETH Bankr's terminal showed.
 */
const Recorded = {
  shares: 482758620689655174n,
  cumulatedFees0: 0n,
  beneficiaryFees0: 2198641214285714279n,
}

/**
 * Multicall3's and Doppler's interfaces, written out here and matched on the
 * selectors both publish rather than taken from the code under test, so a
 * wrong address, signature or argument in the read gets a different answer.
 */
const Chain = {
  multicall3: "0xca11bde05977b3631167028862be2a173976ca11",
  ledger: "0x9982538f41f2ae29ddb9d3d9307010052984fdbb",
  aggregate3: AbiFunction.from(
    "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
  ),
  getShares: AbiFunction.from(
    "function getShares(bytes32 poolId, address beneficiary) view returns (uint256)",
  ),
  getCumulatedFees0: AbiFunction.from(
    "function getCumulatedFees0(bytes32 poolId) view returns (uint256)",
  ),
  getHookFees: AbiFunction.from(
    "function getHookFees(bytes32 poolId) view returns (uint128 fees0, uint128 fees1, uint128 beneficiaryFees0, uint128 beneficiaryFees1, uint128 airlockOwnerFees0, uint128 airlockOwnerFees1, uint24 customFee)",
  ),
}

/** The blocks a node reads at: a tag or a number. */
const BlockTag = /^(latest|pending|safe|finalized|earliest|0x[0-9a-f]+)$/

/**
 * What the ledger answers for one call, as the contract would: storage it
 * does not hold reads as zero, and a function it does not have reverts.
 */
function ledgerReply(callData: Hex.Hex, ledger: typeof Recorded) {
  const ours = (poolId: string) => poolId === HomePoolId

  switch (callData.slice(0, 10)) {
    case "0x5ebb58fb": {
      const [poolId, holder] = AbiFunction.decodeData(
        Chain.getShares,
        callData,
      )
      const holds = ours(poolId)
        && holder.toLowerCase() === FundingAddress.toLowerCase()

      return AbiFunction.encodeResult(
        Chain.getShares,
        holds ? ledger.shares : 0n,
      )
    }
    case "0xcb7dd8f2": {
      const [poolId] = AbiFunction.decodeData(Chain.getCumulatedFees0, callData)

      return AbiFunction.encodeResult(
        Chain.getCumulatedFees0,
        ours(poolId) ? ledger.cumulatedFees0 : 0n,
      )
    }
    case "0x6f174dca": {
      const [poolId] = AbiFunction.decodeData(Chain.getHookFees, callData)

      return AbiFunction.encodeResult(Chain.getHookFees, [
        0n,
        0n,
        ours(poolId) ? ledger.beneficiaryFees0 : 0n,
        0n,
        0n,
        0n,
        0,
      ])
    }
  }
}

/**
 * Base's answer to an eth_call. A call to an address with no code comes back
 * empty, and a failed call inside Multicall3 reverts the whole batch.
 */
function answerCall(
  call: {
    to: string
    data: Hex.Hex
  },
  ledger: typeof Recorded,
) {
  if (
    call.to.toLowerCase() !== Chain.multicall3
    || call.data.slice(0, 10) !== "0x82ad56cb"
  ) {
    return {
      result: "0x",
    }
  }

  const [calls] = AbiFunction.decodeData(Chain.aggregate3, call.data)
  const results: {
    success: boolean
    returnData: Hex.Hex
  }[] = []

  for (const { target, callData } of calls) {
    const returnData = target.toLowerCase() === Chain.ledger
      ? ledgerReply(callData, ledger)
      : "0x"

    if (returnData === undefined) {
      return {
        error: {
          code: 3,
          message: "execution reverted: Multicall3: call failed",
        },
      }
    }

    results.push({
      success: true,
      returnData,
    })
  }

  return {
    result: AbiFunction.encodeResult(Chain.aggregate3, results),
  }
}

let stubsStarted = 0

/** Stands in for a Base node: answers as told, and counts what it was asked. */
function stubChain(initial: {
  ledger?: typeof Recorded
  status?: number
  refuse?: boolean
  garble?: boolean
  delayMs?: number
  hang?: boolean
}) {
  let mode = initial
  let requests = 0

  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      requests++

      if (mode.hang) {
        return new Promise<Response>(() => {})
      }

      if (mode.delayMs) {
        await Bun.sleep(mode.delayMs)
      }

      if (mode.status) {
        return new Response(null, {
          status: mode.status,
        })
      }

      // As geth does: anything but JSON is turned away.
      if (request.headers.get("content-type") !== "application/json") {
        return new Response("invalid content type", {
          status: 415,
        })
      }

      const { jsonrpc, id, method, params } = await request.json()

      // A request without an id is a notification, which gets no answer.
      if (id === undefined) {
        return new Response(null)
      }

      return Response.json({
        jsonrpc: "2.0",
        id,
        ...(jsonrpc !== "2.0"
          ? {
            error: {
              code: -32600,
              message: "invalid request",
            },
          }
          : !BlockTag.test(params?.[1])
          ? {
            error: {
              code: -32602,
              message: "invalid argument 1",
            },
          }
          : mode.refuse
          ? {
            error: {
              code: -32016,
              message: "over rate limit",
            },
          }
          : mode.garble
          ? {
            result: "0x1234",
          }
          : method === "eth_call"
          ? answerCall(params[0], mode.ledger ?? Recorded)
          : {
            error: {
              code: -32601,
              message: "method not found",
            },
          }),
      })
    },
  })

  stubs.push(server)

  return {
    // A path of its own, so a port handed out again cannot reach an answer an
    // earlier stub left in the shared reader.
    rpc: `http://127.0.0.1:${server.port}/${++stubsStarted}`,
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
  delete process.env.HOMEBASE_BASE_RPC
  delete process.env.HOMEBASE_FUNDING_ADDRESS
})

async function callHandler(rpc: string, address?: string) {
  process.env.HOMEBASE_BASE_RPC = rpc

  if (address !== undefined) {
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

async function callRoute(rpc: string, address?: string) {
  const config = new Map([
    [
      "HOMEBASE_BASE_RPC",
      rpc,
    ],
  ])

  if (address !== undefined) {
    config.set("HOMEBASE_FUNDING_ADDRESS", address)
  }

  const response = await Effect.runPromise(
    GET.pipe(
      Effect.withConfigProvider(ConfigProvider.fromMap(config)),
    ),
  )

  return {
    status: response.status,
    body: JSON.parse(new TextDecoder().decode((response.body as any).body)),
    cacheControl: response.headers["cache-control"],
  }
}

test("an answer under a minute old is served without reading the chain", async () => {
  const chain = stubChain({})
  let clock = 1_000_000
  const read = createRaisedReader({
    now: () => clock,
  })

  await read(FundingAddress, chain.rpc)
  clock += 59_000

  expect(
    await read(FundingAddress, chain.rpc),
  )
    .toBe(1.061413)

  // Long enough for a refresh to reach the chain, had one been started.
  await Bun.sleep(50)

  expect(
    chain.requests(),
  )
    .toBe(1)
})

test("a kept answer comes at once while one pass refreshes it", async () => {
  const chain = stubChain({})
  let clock = 1_000_000
  const read = createRaisedReader({
    now: () => clock,
    timeoutMs: 200,
  })

  await read(FundingAddress, chain.rpc)
  chain.answer({
    hang: true,
  })
  clock += 120_000

  const started = performance.now()
  const answers = [
    await read(FundingAddress, chain.rpc),
    await read(FundingAddress, chain.rpc),
  ]

  expect(
    answers,
  )
    .toEqual([
      1.061413,
      1.061413,
    ])
  expect(
    performance.now() - started < 100,
  )
    .toBe(true)

  // Once the refresh has reached the chain and timed out: one pass, not two.
  await Bun.sleep(250)

  expect(
    chain.requests(),
  )
    .toBe(2)
})

test("a failed refresh leaves the kept answer standing", async () => {
  const chain = stubChain({})
  let clock = 1_000_000
  const read = createRaisedReader({
    now: () => clock,
  })

  await read(FundingAddress, chain.rpc)
  chain.answer({
    status: 503,
  })
  clock += 120_000
  await read(FundingAddress, chain.rpc)
  await Bun.sleep(50)
  clock += 120_000

  expect(
    await read(FundingAddress, chain.rpc),
  )
    .toBe(1.061413)
})

test("an answer over an hour old is not served", async () => {
  const chain = stubChain({})
  let clock = 1_000_000
  const read = createRaisedReader({
    now: () => clock,
  })

  await read(FundingAddress, chain.rpc)
  chain.answer({
    status: 503,
  })
  clock += 2 * 60 * 60_000

  await expect(
    read(FundingAddress, chain.rpc),
  )
    .rejects
    .toThrow("Base RPC responded with 503")
})

test("an answer kept for one address is not served for another", async () => {
  const chain = stubChain({})
  const read = createRaisedReader()

  await read(FundingAddress, chain.rpc)

  await expect(
    read("0x000000000000000000000000000000000000dEaD", chain.rpc),
  )
    .rejects
    .toThrow("The address holds no share of the $home fees")
})

test("callers arriving together share one pass", async () => {
  const chain = stubChain({
    delayMs: 50,
  })
  const read = createRaisedReader()

  expect(
    await Promise.all([
      read(FundingAddress, chain.rpc),
      read(FundingAddress, chain.rpc),
      read(FundingAddress, chain.rpc),
    ]),
  )
    .toEqual([
      1.061413,
      1.061413,
      1.061413,
    ])
  expect(
    chain.requests(),
  )
    .toBe(1)
})

test("a chain that never answers is cut off at the timeout", async () => {
  const chain = stubChain({
    hang: true,
  })
  const read = createRaisedReader({
    timeoutMs: 200,
  })
  const started = performance.now()

  await expect(
    read(FundingAddress, chain.rpc),
  )
    .rejects
    .toThrow()
  expect(
    performance.now() - started < 1_000,
  )
    .toBe(true)
})

test("both runtimes give the same healthy answer", async () => {
  const chain = stubChain({})
  const expected = {
    status: 200,
    body: {
      address: FundingAddress,
      raisedEth: 1.061413,
    },
    cacheControl: CacheControl,
  }

  expect(
    await callHandler(chain.rpc),
  )
    .toEqual(expected)
  expect(
    await callRoute(chain.rpc),
  )
    .toEqual(expected)
})

test("fees already collected count as much as fees waiting for it", async () => {
  const chain = stubChain({
    ledger: {
      shares: Recorded.shares,
      cumulatedFees0: Recorded.beneficiaryFees0,
      beneficiaryFees0: 0n,
    },
  })

  expect(
    (await callHandler(chain.rpc)).body,
  )
    .toEqual({
      address: FundingAddress,
      raisedEth: 1.061413,
    })
})

test("both runtimes pass on what went wrong with the read", async () => {
  const refusing = stubChain({
    status: 503,
  })
  const limited = stubChain({
    refuse: true,
  })
  const garbled = stubChain({
    garble: true,
  })
  const stranger = stubChain({})

  for (const call of [callHandler, callRoute]) {
    expect(
      [
        await call(refusing.rpc),
        await call(limited.rpc),
        await call(garbled.rpc),
        await call(stranger.rpc, "0x000000000000000000000000000000000000dEaD"),
      ],
    )
      .toEqual([
        {
          status: 502,
          body: {
            error: "Base RPC responded with 503",
          },
          cacheControl: undefined,
        },
        {
          status: 502,
          body: {
            error: "Base RPC refused the read",
          },
          cacheControl: undefined,
        },
        {
          status: 502,
          body: {
            error: "Could not read the funding balance",
          },
          cacheControl: undefined,
        },
        {
          status: 502,
          body: {
            error: "The address holds no share of the $home fees",
          },
          cacheControl: undefined,
        },
      ])
  }
})

test("a failed read answers without the request url", async () => {
  const unreachable = "http://127.0.0.1:1/v2/SECRET_KEY"
  // Node's fetch names a url it cannot parse; Bun's never does.
  const fetched = spyOn(globalThis, "fetch")
    .mockRejectedValue(
      new TypeError(`Failed to parse URL from ${unreachable}`),
    )

  try {
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
  } finally {
    fetched.mockRestore()
  }
})

test("an empty override falls back to the defaults in both runtimes", async () => {
  const fetched = spyOn(globalThis, "fetch")
    .mockResolvedValue(
      Response.json({
        jsonrpc: "2.0",
        id: 1,
        ...answerCall(
          {
            to: Chain.multicall3,
            data: AbiFunction.encodeData(Chain.aggregate3, [
              [
                AbiFunction.encodeData(Chain.getShares, [
                  HomePoolId,
                  FundingAddress,
                ]),
                AbiFunction.encodeData(Chain.getCumulatedFees0, [HomePoolId]),
                AbiFunction.encodeData(Chain.getHookFees, [HomePoolId]),
              ]
                .map((callData) => ({
                  target: Chain.ledger as Hex.Hex,
                  allowFailure: false,
                  callData,
                })),
            ]),
          },
          Recorded,
        ),
      }),
    )

  try {
    const expected = {
      status: 200,
      body: {
        address: FundingAddress,
        raisedEth: 1.061413,
      },
      cacheControl: CacheControl,
    }

    expect(
      [
        await callHandler("", ""),
        await callRoute("", ""),
      ],
    )
      .toEqual([
        expected,
        expected,
      ])
    expect(
      fetched.mock.calls.map(([input]) => String(input)),
    )
      .toEqual([
        BaseRpcUrl,
      ])
  } finally {
    fetched.mockRestore()
  }
})

test("a malformed address override is refused before any read", async () => {
  const chain = stubChain({})

  const hex = FundingAddress.slice(2)
  const malformed = [
    "not-an-address",
    `0x${hex.slice(1)}`,
    `${FundingAddress}0`,
    `x${FundingAddress}`,
    `${FundingAddress}/x`,
  ]

  for (const address of malformed) {
    for (const call of [callHandler, callRoute]) {
      expect(
        await call(chain.rpc, address),
      )
        .toEqual({
          status: 500,
          body: {
            error: "HOMEBASE_FUNDING_ADDRESS is not an address",
          },
          cacheControl: undefined,
        })
    }
  }
  expect(
    chain.requests(),
  )
    .toBe(0)
})
