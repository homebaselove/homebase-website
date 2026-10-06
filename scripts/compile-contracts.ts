/**
 * Compiles the contracts with solc and writes their ABI and bytecode next to
 * them, so the site, the deploy script and the suite need no compiler.
 *
 *   SOLC_BIN=/path/to/solc bun scripts/compile-contracts.ts
 */
import * as NFs from "node:fs/promises"

const solc = process.env.SOLC_BIN ?? "solc"

const Sources = {
  "contracts/artifacts.json": [
    "contracts/HomebaseMap.sol:HomebaseMap",
    "contracts/LockGate.sol:LockGate",
  ],
  "e2e/contracts/artifacts.json": [
    "e2e/contracts/StubLock.sol:StubLock",
  ],
}

const files = [
  ...new Set(
    Object.values(Sources).flat().map((entry) => entry.split(":")[0]),
  ),
]
const output = await Bun
  .$`${solc} --optimize --optimize-runs 200 --combined-json abi,bin --base-path . ${files}`
  .json() as {
    contracts: Record<string, {
      abi: unknown
      bin: string
    }>
    version: string
  }

for (const [path, entries] of Object.entries(Sources)) {
  const artifacts: Record<string, unknown> = {
    compiler: output.version,
  }

  for (const entry of entries) {
    const compiled = output.contracts[entry]
    const name = entry.split(":")[1]

    artifacts[name] = {
      abi: typeof compiled.abi === "string"
        ? JSON.parse(compiled.abi)
        : compiled.abi,
      bytecode: `0x${compiled.bin}`,
    }
  }

  await NFs.writeFile(path, `${JSON.stringify(artifacts, null, 2)}\n`)
  console.log(
    `${path}: ${entries.map((entry) => entry.split(":")[1]).join(", ")}`,
  )
}
