/** @jsxImportSource preact */
import { useEffect, useRef } from "preact"
import { useSignal, useSignalEffect } from "preact/signals"
import { call } from "../call.ts"
import {
  BaseRpcUrl,
  Campaign,
  DonationAddress,
  etherAmount,
  formatEth,
  nextMilestone,
  PresetsEth,
  SeedMeLockUrl,
  SeedMeUrl,
  segmentFills,
  SustainableEcosystemUrl,
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
import { InfoIcon } from "./Icons.tsx"
import { Notice } from "./Notice.tsx"
import { Panel } from "./Panel.tsx"
import { Failed, useAction } from "./useAction.ts"
import { ConnectDialog } from "./wallet/ConnectDialog.tsx"

interface Funding {
  raisedEth: number
}

/**
 * The funding card: what the raise stands at, the deck on how the funding
 * works behind the info button in its corner, and three ways to back the
 * house side by side: Buy and Lock $home on SeedMe, and Donate from the
 * connected wallet. Donate with no wallet opens the way in, and the
 * donation goes ahead once a wallet connects, with the wallet asking first.
 */
export function FundingCard() {
  const raised = useSignal<number | null>(null)
  const loading = useSignal(true)
  const preset = useSignal(PresetsEth[0])
  // String() is an empty string without an empty literal, which the class
  // scanner misreads, dropping classes from this file.
  const custom = useSignal(String())
  // A number field reads as empty while it holds what it cannot take, such
  // as letters; that is not the same as no amount typed.
  const unreadable = useSignal(false)
  const customField = useRef<HTMLInputElement>(null)
  const connecting = useSignal(false)
  // A press of Donate that is waiting on a wallet to connect.
  const waiting = useSignal(false)
  const sent = useSignal<{
    hash: string
    amount: string
  } | null>(null)
  const problem = useSignal<string | null>(null)

  /** The amount to give, as typed or as chosen, the way the wallet gets it. */
  const amount = () =>
    unreadable.value
      ? null
      : etherAmount(custom.value.trim() || String(preset.value))

  const send = useAction((ether: string) =>
    sendEther(
      // The test chain, when the map was read on one; Base otherwise.
      eas.value?.rpc ?? BaseRpcUrl,
      DonationAddress,
      ether,
      send.progress,
    )
  )

  const donate = async () => {
    problem.value = null
    send.problem.value = null
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
        <div class="flex items-start justify-between gap-3">
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

          <a
            href={SustainableEcosystemUrl}
            target="_blank"
            aria-label="How funding works: Building a sustainable ecosystem (PDF)"
            title="Building a sustainable ecosystem"
            class="shrink-0 rounded-full border-[1px] border-gray-200 p-1.5 text-gray-400 transition-colors hover:border-gray-300 hover:text-gray-600 hb-focus"
          >
            <InfoIcon size={20} />
          </a>
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
              value={custom.value.trim() || unreadable.value
                ? null
                : preset.value}
              options={PresetsEth.map((option) => ({
                value: option,
                label: `${formatEth(option)} ETH`,
              }))}
              onChange={(option) => {
                preset.value = option
                custom.value = String()
                unreadable.value = false

                // The field already reads as empty while it holds what it
                // cannot take, so only clearing it here takes that away.
                if (customField.current) {
                  customField.current.value = String()
                }
              }}
            />

            <input
              ref={customField}
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder="Custom"
              aria-label="Custom amount in ETH"
              value={custom.value}
              class="field text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              onInput={(input) => {
                const field = input.target as HTMLInputElement

                custom.value = field.value
                unreadable.value = field.validity.badInput
              }}
            />
          </div>

          <div class="grid grid-cols-3 max-sm:grid-cols-2 gap-3">
            <a
              href={SeedMeUrl}
              target="_blank"
              class="btn btn-brand whitespace-nowrap px-4 max-sm:px-3"
            >
              Buy $home
            </a>

            <a
              href={SeedMeLockUrl}
              target="_blank"
              class="btn btn-brand whitespace-nowrap px-4 max-sm:px-3"
            >
              Lock $home
            </a>

            {/* A donation is ether from the connected wallet to the Based House wallet. */}
            <button
              type="submit"
              class="btn btn-brand px-4 max-sm:col-span-2 max-sm:px-3"
              disabled={send.busy.value}
            >
              {send.busy.value ? stageLabel(send.stage.value) : "Donate"}
            </button>
          </div>

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
