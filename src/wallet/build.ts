import * as NUrl from "node:url"

/**
 * The wallet code is bundled apart from the page: wagmi, viem and the wallet
 * SDKs weigh more than the rest of the site, and only someone adding an event
 * needs them. The page fetches the entry when Connect is pressed; the Coinbase
 * SDK is a chunk of its own inside, fetched only when that wallet is chosen.
 */
export const WalletDir = "/wallet"

/** The stable name the page imports; chunks beside it carry a hash. */
export const WalletEntry = "wagmi.js"

const entrypoint = NUrl.fileURLToPath(new URL("./wagmi.ts", import.meta.url))

/** Builds the wallet bundle, to disk when given a directory, else in memory. */
export async function buildWallet(
  outdir?: string,
): Promise<Bun.BuildArtifact[]> {
  const result = await Bun.build({
    entrypoints: [
      entrypoint,
    ],
    ...(outdir
      ? {
        outdir,
      }
      : {}),
    target: "browser",
    format: "esm",
    minify: true,
    splitting: true,
    naming: {
      entry: WalletEntry,
      chunk: "chunk-[hash].js",
      asset: "[name]-[hash].[ext]",
    },
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
  })

  if (!result.success) {
    throw new AggregateError(result.logs, "The wallet bundle failed to build")
  }

  return result.outputs
}
