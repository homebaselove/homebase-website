/**
 * Deploys the registry to Base from a funded wallet's key and prints the
 * address to put into RegistryAddress in src/map/registry.ts. The key never
 * leaves this machine; the admin can be any address, the Homebase wallet by
 * default.
 *
 *   DEPLOYER_KEY=0x… bun scripts/deploy-registry.ts [--admin 0x…] [--rpc https://…]
 *
 * The same contract deploys with Foundry, for those who have it:
 *
 *   forge create contracts/HomebaseMap.sol:HomebaseMap --rpc-url https://mainnet.base.org \
 *     --private-key $DEPLOYER_KEY --broadcast --constructor-args 0x3D140B892437dD7857701098415deB2daaE03A40
 */
import { parseArgs } from "node:util"
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  type Hex,
  http,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { base } from "viem/chains"
import artifacts from "../contracts/artifacts.json" with { type: "json" }
import { HomebaseWallet } from "../src/map/registry.ts"

const { values } = parseArgs({
  options: {
    admin: {
      type: "string",
      default: HomebaseWallet,
    },
    rpc: {
      type: "string",
      default: "https://mainnet.base.org",
    },
  },
})

const key = process.env.DEPLOYER_KEY

if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  console.error(
    "Set DEPLOYER_KEY to the private key of a wallet with a little ETH on Base.",
  )
  process.exit(1)
}

if (!/^0x[0-9a-fA-F]{40}$/.test(values.admin!)) {
  console.error("--admin must be an address.")
  process.exit(1)
}

const account = privateKeyToAccount(key as Hex)
const chain = {
  ...base,
  rpcUrls: {
    default: {
      http: [
        values.rpc!,
      ],
    },
  },
}
const reader = createPublicClient({
  chain,
  transport: http(values.rpc),
})
const balance = await reader.getBalance({
  address: account.address,
})

console.log(
  `Deploying from ${account.address}, which holds ${
    formatEther(balance)
  } ETH on chain ${await reader.getChainId()}.`,
)

if (balance === 0n) {
  console.error(
    "That wallet has no ETH to pay for the deployment; a few cents' worth is enough.",
  )
  process.exit(1)
}

const hash = await createWalletClient({
  account,
  chain,
  transport: http(values.rpc),
})
  .deployContract({
    abi: artifacts.HomebaseMap.abi as [],
    bytecode: artifacts.HomebaseMap.bytecode as Hex,
    args: [
      values.admin,
    ] as never,
  })

console.log(`Sent ${hash}; waiting for it to land…`)

const receipt = await reader.waitForTransactionReceipt({
  hash,
})

if (receipt.status !== "success" || !receipt.contractAddress) {
  console.error("The deployment was reverted.")
  process.exit(1)
}

console.log(`
The registry is at ${receipt.contractAddress}, with ${values.admin} as its admin.
Put that address into RegistryAddress in src/map/registry.ts, commit, and deploy the site.
`)
