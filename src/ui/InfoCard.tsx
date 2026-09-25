/** @jsxImportSource preact */
import { useSignal } from "preact/signals"
import { HomeTokenUrl } from "../funding.ts"
import { InfoIcon } from "./Icons.tsx"

/**
 * The card shell the funding and lock cards share: a header row with an info
 * button that discloses the bullets SeedMe shows behind the same button. The
 * button keeps one label and lets aria-expanded carry whether it is open.
 */
export function InfoCard(props) {
  const open = useSignal(false)

  return (
    <div class="relative bg-white rounded-lg shadow-md border-[1px] border-gray-200">
      <div class="flex flex-col gap-5 p-5 max-sm:p-4">
        <div class="flex items-start justify-between gap-3">
          {props.header}

          <button
            aria-expanded={open.value}
            aria-label={props.label}
            class={open.value
              ? "rounded-full border-[1px] p-1.5 transition-colors border-brand/40 bg-brand/10 text-brand"
              : "rounded-full border-[1px] p-1.5 transition-colors border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600"}
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
      class="underline hover:text-brand"
    >
      $home
    </a>
  )
}
