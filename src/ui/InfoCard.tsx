/** @jsxImportSource preact */
import { InfoIcon } from "./Icons.tsx"
import { useSignal } from "preact/signals"
import { HomeTokenUrl } from "../funding.ts"

/**
 * The card shell both funding cards share: a header row with an info button
 * that discloses the bullets SeedMe shows behind the same button.
 */
export function InfoCard(props) {
  const open = useSignal(false)

  return (
    <div class="relative bg-white w-full rounded-lg shadow-md border-[1px] border-gray-200">
      <div class="flex flex-col gap-5 p-5 max-sm:p-4">
        <div class="flex items-start justify-between gap-3">
          {props.header}

          <button
            type="button"
            aria-expanded={open.value}
            aria-label={open.value ? "Hide details" : "Show details"}
            class={open.value
              ? "shrink-0 rounded-full border-[1px] p-1.5 transition-colors border-brand/40 bg-brand/10 text-brand"
              : "shrink-0 rounded-full border-[1px] p-1.5 transition-colors border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600"}
            onClick={() => {
              open.value = !open.value
            }}
          >
            <InfoIcon size={20} />
          </button>
        </div>

        {open.value && (
          <ul class="flex flex-col gap-2 list-disc pl-5 text-gray-600">
            {props.bullets.map((bullet, index) => (
              <li key={index}>
                {bullet}
              </li>
            ))}
          </ul>
        )}

        {props.children}
      </div>
    </div>
  )
}

/** $home reads as a link wherever it appears in the bullets. */
export function HomeToken() {
  return (
    <a
      href={HomeTokenUrl}
      target="_blank"
      rel="noreferrer"
      class="underline hover:text-brand"
    >
      $home
    </a>
  )
}
