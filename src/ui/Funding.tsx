/** @jsxImportSource preact */
import { useEffect } from "preact"
import { useSignal } from "preact/signals"
import {
  BasedHouseUrl,
  Campaign,
  formatEth,
  nextMilestone,
  PresetsEth,
  SeedMeUrl,
  segmentFills,
  TargetEth,
} from "../funding.ts"
import { HomeToken, InfoCard } from "./InfoCard.tsx"

interface Funding {
  raisedEth: number
}

export function FundingCard() {
  const raised = useSignal<number | null>(null)
  const loading = useSignal(true)
  const preset = useSignal<number | null>(PresetsEth[0])
  const custom = useSignal("")

  useEffect(() => {
    let cancelled = false

    const fetchFunding = async () => {
      try {
        const response = await fetch("/funding.json")

        if (!response.ok) {
          throw new Error(`/funding.json responded with ${response.status}`)
        }

        const funding: Funding = await response.json()

        if (!Number.isFinite(funding.raisedEth)) {
          throw new Error("/funding.json carried no balance")
        }

        if (!cancelled) {
          raised.value = funding.raisedEth
        }
      } catch (error) {
        console.error("Error fetching funding:", error)
      } finally {
        if (!cancelled) {
          loading.value = false
        }
      }
    }

    fetchFunding()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <InfoCard
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
            href={BasedHouseUrl}
            target="_blank"
            rel="noreferrer"
            class="underline hover:text-brand"
          >
            Based House Mumbai
          </a>
        </>,
        <>
          Lock $home to gain access to upcoming $seed claims
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
          const selected = custom.value.trim() === ""
            && preset.value === value

          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              class={`rounded-full border-[1px] py-2 text-sm font-medium transition-colors ${
                selected
                  ? "border-brand/40 bg-brand/10 text-brand"
                  : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
              }`}
              onClick={() => {
                preset.value = value
                custom.value = ""
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
          class="rounded-full border-[1px] border-gray-200 bg-gray-50 py-2 px-3 text-sm text-center w-full appearance-none placeholder:text-gray-400 focus:outline-none focus:border-brand/40 focus:bg-white"
          onInput={(e) => {
            custom.value = (e.target as HTMLInputElement).value
          }}
        />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <a
          href={SeedMeUrl}
          target="_blank"
          rel="noreferrer"
          class="btn-brand w-full max-sm:px-3"
        >
          Buy $home
        </a>

        <a
          href={SeedMeUrl}
          target="_blank"
          rel="noreferrer"
          class="btn-brand w-full max-sm:px-3"
        >
          Donate
        </a>
      </div>
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
              class="h-full rounded-full bg-brand transition-[width] duration-500"
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
