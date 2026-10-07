/** @jsxImportSource preact */
import { useEffect } from "preact"
import { useSignal } from "preact/signals"
import {
  BasedHouseMumbaiUrl,
  BaseRpcUrl,
  Campaign,
  DonationAddress,
  formatEth,
  nextMilestone,
  PresetsEth,
  SeedMeUrl,
  segmentFills,
  TargetEth,
  transactionUrl,
} from "../funding.ts"
import { eas } from "../map/client.ts"
import { account, isFailure, sendEther } from "../wallet/client.ts"
import { HomeToken, InfoCard } from "./InfoCard.tsx"
import { ConnectDialog } from "./wallet/ConnectDialog.tsx"

interface Funding {
  raisedEth: number
}

export function FundingCard() {
  const raised = useSignal<number | null>(null)
  const loading = useSignal(true)
  const preset = useSignal(PresetsEth[0])
  // String() is an empty string without an empty literal, which the class
  // scanner misreads, dropping classes from this file.
  const custom = useSignal(String())
  const connecting = useSignal(false)
  const sending = useSignal(false)
  const sent = useSignal<string | null>(null)
  const problem = useSignal<string | null>(null)

  /** The amount to give, as typed or as chosen. */
  const amount = () => (custom.value.trim() || String(preset.value)).trim()

  const donate = async () => {
    problem.value = null
    sent.value = null

    if (!account.value) {
      connecting.value = true

      return
    }

    const value = Number(amount())

    if (!Number.isFinite(value) || value <= 0) {
      problem.value = "Enter an amount above zero."

      return
    }

    sending.value = true

    // The test chain, when the map was read on one; Base otherwise.
    const answer = await sendEther(
      eas.value?.rpc ?? BaseRpcUrl,
      DonationAddress,
      amount(),
    )

    sending.value = false

    if (isFailure(answer)) {
      problem.value = answer.error
    } else {
      sent.value = answer
    }
  }

  useEffect(() => {
    const fetchFunding = async () => {
      try {
        // Longer than the five seconds the endpoint gives the chain read, so
        // the endpoint answers first. Browsers without AbortSignal.timeout
        // (Safari before 16) wait on the endpoint instead.
        const response = await fetch("/funding.json", {
          signal: AbortSignal.timeout?.(10_000),
        })

        if (!response.ok) {
          throw new Error(`/funding.json responded with ${response.status}`)
        }

        const funding: Funding = await response.json()

        if (!Number.isFinite(funding.raisedEth)) {
          throw new Error("/funding.json carried no balance")
        }

        raised.value = funding.raisedEth
      } catch (error) {
        console.error("Error fetching funding:", error)
      } finally {
        loading.value = false
      }
    }

    fetchFunding()
  }, [])

  return (
    <InfoCard
      label={`${Campaign} funding details`}
      header={
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {loading.value
            ? <div class="h-11 w-44 rounded-lg bg-gray-100 animate-pulse" />
            : raised.value === null
            ? (
              <h2 class="text-4xl max-sm:text-3xl font-bold leading-none">
                Fund {Campaign}
              </h2>
            )
            : (
              <>
                <span class="text-5xl max-sm:text-4xl font-bold leading-none">
                  {formatEth(raised.value)} ETH
                </span>

                <span class="text-gray-500">
                  Raised for {Campaign}
                </span>
              </>
            )}
        </div>
      }
      bullets={[
        <>
          100% of <HomeToken /> creator fees are allocated to{" "}
          <a
            href={BasedHouseMumbaiUrl}
            target="_blank"
            class="underline hover:text-brand"
          >
            Based House Mumbai
          </a>
        </>,
        <>
          Lock <HomeToken /> to gain access to upcoming $seed claims
        </>,
        <>
          The more tokens locked over a longer period of time shows commitment,
          potentially earning you more privileges from founders launching on
          SeedMe
        </>,
        <>
          Homebase has been incubating SeedMe since Based House ETHDenver to
          support the founders in residence
        </>,
      ]}
    >
      {raised.value !== null && <MilestoneBar raised={raised.value} />}

      <div class="grid grid-cols-4 max-sm:grid-cols-2 gap-2">
        {PresetsEth.map((value) => {
          const selected = !custom.value && preset.value === value

          return (
            <button
              key={value}
              aria-pressed={selected}
              class={selected
                ? "rounded-full border-[1px] py-2 text-sm transition-colors border-brand/40 bg-brand/10 text-brand"
                : "rounded-full border-[1px] py-2 text-sm transition-colors border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"}
              onClick={() => {
                preset.value = value
                custom.value = String()
              }}
            >
              {formatEth(value)} ETH
            </button>
          )
        })}

        <input
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          placeholder="Custom"
          value={custom.value}
          class="rounded-full border-[1px] border-gray-200 bg-gray-50 py-2 px-3 text-sm text-center w-full [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none placeholder:text-gray-400 focus:outline-none focus:border-brand/40 focus:bg-white"
          onInput={(e) => {
            custom.value = (e.target as HTMLInputElement).value
          }}
        />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <a
          href={SeedMeUrl}
          target="_blank"
          class="btn-brand max-sm:px-3!"
        >
          Buy $home
        </a>

        {/* A donation is ether from the connected wallet to the Based House wallet. */}
        <button
          type="button"
          class="btn-brand max-sm:px-3!"
          disabled={sending.value}
          onClick={donate}
        >
          {sending.value ? "Confirm in your wallet…" : "Donate"}
        </button>
      </div>

      {sent.value && (
        <p
          role="status"
          class="text-sm text-gray-600"
        >
          Thank you! Your donation is on Base.{" "}
          <a
            href={transactionUrl(sent.value)}
            target="_blank"
            rel="noopener noreferrer"
            class="text-brand underline"
          >
            See the transaction
          </a>
        </p>
      )}

      {problem.value && (
        <p
          role="alert"
          class="text-sm text-red-600"
        >
          {problem.value}
        </p>
      )}

      {connecting.value && (
        <ConnectDialog
          onClose={() => {
            connecting.value = false
          }}
        />
      )}
    </InfoCard>
  )
}

function MilestoneBar(props: { raised: number }) {
  const milestone = nextMilestone(props.raised)

  return (
    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap justify-between gap-x-4 text-sm text-gray-500">
        <span>
          next milestone: {formatEth(milestone)} ETH
        </span>

        <span>
          target: {formatEth(TargetEth)} ETH
        </span>
      </div>

      <div class="flex gap-1.5">
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
