/** @jsxImportSource preact */
import { useEffect } from "preact"
import { useSignal, useSignalEffect } from "preact/signals"
import { call } from "../call.ts"
import {
  BasedHouseMumbaiApplyUrl,
  BaseRpcUrl,
  Campaign,
  DonationAddress,
  etherAmount,
  formatEth,
  HomeTokenUrl,
  nextMilestone,
  PresetsEth,
  SeedMeLockUrl,
  SeedMeUrl,
  segmentFills,
  TargetEth,
  transactionUrl,
} from "../funding.ts"
import { eas } from "../map/client.ts"
import {
  account,
  isFailure,
  sendEther,
  stageLabel,
} from "../wallet/client.ts"
import { Choices } from "./Choices.tsx"
import { Disclosure } from "./Disclosure.tsx"
import { OutIcon } from "./Icons.tsx"
import { Notice } from "./Notice.tsx"
import { Panel } from "./Panel.tsx"
import { Failed, useAction } from "./useAction.ts"
import { ConnectDialog } from "./wallet/ConnectDialog.tsx"

interface Funding {
  raisedEth: number
}

/** $home reads as a link wherever it appears in the bullets. */
function HomeToken() {
  return (
    <a
      href={HomeTokenUrl}
      target="_blank"
      class="underline hover:text-brand"
    >
      $home
    </a>
  )
}

/**
 * The funding card: what the raise stands at, a donation from the
 * connected wallet as its one primary action, and $home on SeedMe as the
 * other way to back it. Donate with no wallet opens the way in, and the
 * donation goes ahead once a wallet connects, with the wallet asking first.
 */
export function FundingCard() {
  const raised = useSignal<number | null>(null)
  const loading = useSignal(true)
  const preset = useSignal(PresetsEth[0])
  // String() is an empty string without an empty literal, which the class
  // scanner misreads, dropping classes from this file.
  const custom = useSignal(String())
  const connecting = useSignal(false)
  // A press of Donate that is waiting on a wallet to connect.
  const waiting = useSignal(false)
  const sent = useSignal<{
    hash: string
    amount: string
  } | null>(null)
  const problem = useSignal<string | null>(null)

  /** The amount to give, as typed or as chosen, the way the wallet gets it. */
  const amount = () => etherAmount(custom.value.trim() || String(preset.value))

  const send = useAction((ether: string) =>
    sendEther(
      // The test chain, when the map was read on one; Base otherwise.
      eas.value?.rpc ?? BaseRpcUrl,
      DonationAddress,
      ether,
    )
  )

  const donate = async () => {
    problem.value = null
    sent.value = null

    const ether = amount()

    if (ether === null) {
      problem.value = "Enter an amount above zero."

      return
    }

    if (!account.value) {
      waiting.value = true
      connecting.value = true

      return
    }

    const hash = await send.run(ether)

    if (hash !== Failed) {
      sent.value = {
        hash,
        amount: ether,
      }
    }
  }

  // However the wallet connects, through this card or the header, a
  // donation that was waiting on it goes ahead.
  useSignalEffect(() => {
    if (waiting.value && account.value) {
      waiting.value = false
      connecting.value = false
      queueMicrotask(donate)
    }
  })

  useEffect(() => {
    // Longer than the five seconds the endpoint gives the chain read, so
    // the endpoint answers first.
    call<Funding>("/funding.json", {}, 10_000).then((funding) => {
      if (!isFailure(funding) && Number.isFinite(funding?.raisedEth)) {
        raised.value = funding.raisedEth
      } else {
        console.error("Error fetching funding:", funding)
      }

      loading.value = false
    })
  }, [])

  const ether = amount()

  return (
    <Panel>
      <div class="flex flex-col gap-5 p-5 max-sm:p-4">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {loading.value
            ? <div class="h-11 w-44 rounded-lg bg-gray-100 animate-pulse" />
            : raised.value === null
            ? (
              <h3 class="text-4xl max-sm:text-3xl font-bold leading-none">
                Fund {Campaign}
              </h3>
            )
            : (
              <>
                <span class="text-5xl max-sm:text-4xl font-bold leading-none">
                  {formatEth(raised.value)} ETH
                </span>

                <span class="text-gray-500">
                  raised for {Campaign}
                </span>
              </>
            )}
        </div>

        {raised.value !== null && <MilestoneBar raised={raised.value} />}

        <form
          class="flex flex-col gap-3"
          onSubmit={(submit) => {
            submit.preventDefault()
            donate()
          }}
        >
          <div class="grid gap-2 sm:grid-cols-[3fr_1fr]">
            <Choices
              label="Amount to donate"
              class="grid grid-cols-3 gap-2"
              value={custom.value.trim() ? null : preset.value}
              options={PresetsEth.map((option) => ({
                value: option,
                label: `${formatEth(option)} ETH`,
              }))}
              onChange={(option) => {
                preset.value = option
                custom.value = String()
              }}
            />

            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder="Custom"
              aria-label="Custom amount in ETH"
              value={custom.value}
              class="field text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              onInput={(input) => {
                custom.value = (input.target as HTMLInputElement).value
              }}
            />
          </div>

          {/* A donation is ether from the connected wallet to the Based House wallet. */}
          <button
            type="submit"
            class="btn btn-brand w-full"
            disabled={send.busy.value}
          >
            {send.busy.value
              ? stageLabel()
              : ether
              ? `Donate ${ether} ETH`
              : "Donate"}
          </button>

          <Notice tone="done">
            {sent.value && (
              <>
                Thank you! Your {sent.value.amount} ETH donation is on
                Base.{" "}
                <a
                  href={transactionUrl(sent.value.hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-brand underline"
                >
                  See the transaction
                </a>
              </>
            )}
          </Notice>

          <Notice tone="error">
            {problem.value ?? send.problem.value}
          </Notice>
        </form>

        <div class="flex flex-col gap-2">
          <p class="text-sm text-gray-500">
            Or back the house with <HomeToken /> on SeedMe
          </p>

          <div class="grid grid-cols-2 gap-3">
            <a
              href={SeedMeUrl}
              target="_blank"
              class="btn btn-quiet whitespace-nowrap max-sm:gap-1.5 max-sm:px-3"
            >
              Buy $home
              <OutIcon size={14} />
            </a>

            <a
              href={SeedMeLockUrl}
              target="_blank"
              class="btn btn-quiet whitespace-nowrap max-sm:gap-1.5 max-sm:px-3"
            >
              Lock $home
              <OutIcon size={14} />
            </a>
          </div>
        </div>

        <Disclosure summary="How funding works">
          <ul class="flex flex-col gap-2 list-disc pl-5 text-gray-600">
            <li>
              100% of <HomeToken /> creator fees are allocated to{" "}
              <a
                href={BasedHouseMumbaiApplyUrl}
                target="_blank"
                class="underline hover:text-brand"
              >
                Based House
              </a>
            </li>
            <li>
              Homebase has been incubating{" "}
              <a
                href={SeedMeUrl}
                target="_blank"
                class="underline hover:text-brand"
              >
                SeedMe
              </a>{" "}
              since Based House ETHDenver to support the founders in residence
            </li>
            <li>
              Lock <HomeToken /> to access SeedMe claims
            </li>
            <li>
              The more tokens locked over a longer period of time shows
              commitment, potentially earning you more privileges from founders
              launching on SeedMe
            </li>
          </ul>
        </Disclosure>
      </div>

      {connecting.value && (
        <ConnectDialog
          reason={ether
            ? `Connect a wallet to donate ${ether} ETH to Based House. Your wallet asks you to confirm before anything is sent.`
            : undefined}
          onClose={() => {
            connecting.value = false
            waiting.value = false
          }}
        />
      )}
    </Panel>
  )
}

function MilestoneBar(props: { raised: number }) {
  const milestone = nextMilestone(props.raised)

  return (
    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap justify-between gap-x-4 text-sm text-gray-500">
        <span>
          Next milestone {formatEth(milestone)} ETH
        </span>

        <span>
          Target {formatEth(TargetEth)} ETH
        </span>
      </div>

      <div
        role="img"
        aria-label={`${formatEth(props.raised)} of ${
          formatEth(TargetEth)
        } ETH raised`}
        class="flex gap-1.5"
      >
        {segmentFills(props.raised).map((fill, index) => (
          <div
            key={index}
            class="h-2 flex-1 rounded-full bg-gray-200 overflow-hidden"
          >
            <div
              class="h-full rounded-full bg-brand"
              style={{
                width: `${fill * 100}%`,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
