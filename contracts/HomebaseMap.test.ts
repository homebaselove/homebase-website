/**
 * The registry on a local chain. Needs anvil (Foundry) on the PATH or in
 * ANVIL_BIN; without it these tests are skipped, so `bun test` stays green on
 * a machine without it.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import {
  type Address,
  createPublicClient,
  createWalletClient,
  type Hex,
  http,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { foundry } from "viem/chains"
import stubs from "../e2e/contracts/artifacts.json" with { type: "json" }
import artifacts from "./artifacts.json" with { type: "json" }

const anvil = process.env.ANVIL_BIN ?? Bun.which("anvil")

const Port = 8546

const Rpc = `http://127.0.0.1:${Port}`

/** Anvil's well-known funded accounts. */
const Keys: Hex[] = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
]

const [admin, stranger, locker, next] = Keys.map((key) =>
  privateKeyToAccount(key)
)

const chain = {
  ...foundry,
  rpcUrls: {
    default: {
      http: [
        Rpc,
      ],
    },
  },
}

const reader = createPublicClient({
  chain,
  transport: http(Rpc),
})

const as = (account: typeof admin) =>
  createWalletClient({
    account,
    chain,
    transport: http(Rpc),
  })

const Map = artifacts.HomebaseMap

const Gate = artifacts.LockGate

const Lock = stubs.StubLock

let node: ReturnType<typeof Bun.spawn> | null = null

async function deploy(
  artifact: {
    abi: unknown
    bytecode: string
  },
  args: unknown[],
  by = admin,
): Promise<Address> {
  const hash = await as(by).deployContract({
    abi: artifact.abi as [],
    bytecode: artifact.bytecode as Hex,
    args: args as never,
  })
  const receipt = await reader.waitForTransactionReceipt({
    hash,
  })

  return receipt.contractAddress!
}

const write = async (
  by: typeof admin,
  address: Address,
  functionName: string,
  args: unknown[] = [],
) => {
  const { request } = await reader.simulateContract({
    account: by,
    address,
    abi: Map.abi as [],
    functionName: functionName as never,
    args: args as never,
  })
  const hash = await as(by).writeContract(request as never)

  return reader.waitForTransactionReceipt({
    hash,
  })
}

const read = (
  address: Address,
  functionName: string,
  args: unknown[] = [],
): Promise<unknown> =>
  reader.readContract({
    address,
    abi: Map.abi as [],
    functionName: functionName as never,
    args: args as never,
  })

const slugsOf = (pins: unknown) =>
  (pins as {
    slug: string
    by: Address
  }[])
    .map((pin) => pin.slug)

describe.skipIf(!anvil)("HomebaseMap on a local chain", () => {
  let map: Address

  beforeAll(async () => {
    node = Bun.spawn([
      anvil!,
      "--port",
      String(Port),
      "--silent",
    ], {
      stdout: "ignore",
      stderr: "ignore",
    })

    for (let tries = 0; tries < 100; tries += 1) {
      if (await reader.getChainId().then(() => true, () => false)) {
        break
      }

      await Bun.sleep(100)
    }

    map = await deploy(Map, [
      admin.address,
    ])
  })

  afterAll(() => {
    node?.kill()
  })

  test("the admin pins and the list says who and when", async () => {
    await write(admin, map, "pin", [
      "demo-day",
    ])

    const pins = await read(map, "list") as {
      slug: string
      by: Address
      pinnedAt: bigint
    }[]

    expect(
      [
        pins.length,
        pins[0].slug,
        pins[0].by,
        pins[0].pinnedAt > 0n,
        await read(map, "count"),
        await read(map, "canPin", [
          admin.address,
        ]),
        await read(map, "canPin", [
          stranger.address,
        ]),
      ],
    )
      .toEqual([
        1,
        "demo-day",
        admin.address,
        true,
        1n,
        true,
        false,
      ])
  })

  test("a stranger cannot pin, and nobody pins twice or pins nothing", async () => {
    await expect(
      write(stranger, map, "pin", [
        "build-night",
      ]),
    )
      .rejects
      .toThrow("NotAllowed")
    await expect(
      write(admin, map, "pin", [
        "demo-day",
      ]),
    )
      .rejects
      .toThrow("AlreadyPinned")
    await expect(
      write(admin, map, "pin", [
        "",
      ]),
    )
      .rejects
      .toThrow("BadSlug")
    await expect(
      write(admin, map, "pin", [
        "x".repeat(65),
      ]),
    )
      .rejects
      .toThrow("BadSlug")
  })

  test("unpinning keeps the list whole, and only the admin or the pinner may", async () => {
    await write(admin, map, "pin", [
      "b",
    ])
    await write(admin, map, "pin", [
      "c",
    ])
    await expect(
      write(stranger, map, "unpin", [
        "demo-day",
      ]),
    )
      .rejects
      .toThrow("NotAllowed")
    await write(admin, map, "unpin", [
      "demo-day",
    ])

    const afterFirst = slugsOf(await read(map, "list"))

    await write(admin, map, "unpin", [
      "c",
    ])
    await write(admin, map, "pin", [
      "demo-day",
    ])
    await expect(
      write(admin, map, "unpin", [
        "never",
      ]),
    )
      .rejects
      .toThrow("NotPinned")

    expect(
      [
        afterFirst,
        slugsOf(await read(map, "list")),
      ],
    )
      .toEqual([
        [
          "c",
          "b",
        ],
        [
          "b",
          "demo-day",
        ],
      ])
  })

  test("a lock gate lets a wallet with enough $home locked pin, and take its own pins off", async () => {
    const lock = await deploy(Lock, [])
    const gate = await deploy(Gate, [
      lock,
      100n,
    ])

    await expect(
      write(stranger, map, "setGate", [
        gate,
      ]),
    )
      .rejects
      .toThrow("NotAdmin")
    await expect(
      write(admin, map, "setGate", [
        stranger.address,
      ]),
    )
      .rejects
      .toThrow("BadGate")
    await write(admin, map, "setGate", [
      gate,
    ])

    const setLocked = async (amount: bigint) => {
      const hash = await as(admin).writeContract({
        address: lock,
        abi: Lock.abi as [],
        functionName: "setLocked" as never,
        args: [
          locker.address,
          amount,
        ] as never,
      })

      await reader.waitForTransactionReceipt({
        hash,
      })
    }

    await setLocked(99n)

    const short = await read(map, "canPin", [
      locker.address,
    ])

    await expect(
      write(locker, map, "pin", [
        "locker-event",
      ]),
    )
      .rejects
      .toThrow("NotAllowed")
    await setLocked(100n)
    await write(locker, map, "pin", [
      "locker-event",
    ])
    await expect(
      write(locker, map, "unpin", [
        "b",
      ]),
    )
      .rejects
      .toThrow("NotAllowed")
    await write(locker, map, "unpin", [
      "locker-event",
    ])
    await write(locker, map, "pin", [
      "locker-event",
    ])
    await write(admin, map, "unpin", [
      "locker-event",
    ])

    expect(
      [
        short,
        slugsOf(await read(map, "list")),
      ],
    )
      .toEqual([
        false,
        [
          "b",
          "demo-day",
        ],
      ])
  })

  test("a gate that breaks lets nobody through, and the admin can set it aside", async () => {
    // A gate whose lock is no contract at all: its read fails, and the map treats that as no.
    const broken = await deploy(Gate, [
      stranger.address,
      1n,
    ])

    await write(admin, map, "setGate", [
      broken,
    ])

    const through = await read(map, "canPin", [
      locker.address,
    ])

    await write(admin, map, "setGate", [
      "0x0000000000000000000000000000000000000000",
    ])
    await write(admin, map, "setAdmin", [
      next.address,
    ])
    await expect(
      write(admin, map, "setAdmin", [
        admin.address,
      ]),
    )
      .rejects
      .toThrow("NotAdmin")

    expect(
      [
        through,
        await read(map, "canPin", [
          admin.address,
        ]),
        await read(map, "canPin", [
          next.address,
        ]),
        await read(map, "gate"),
      ],
    )
      .toEqual([
        false,
        false,
        true,
        "0x0000000000000000000000000000000000000000",
      ])
  })
})
