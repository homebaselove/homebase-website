/** @jsxImportSource preact */
import type { ComponentChildren } from "preact"
import { ChevronIcon } from "./Icons.tsx"

/**
 * More about something, behind a short label that says what is there: the
 * native details element, so it opens with a click, a tap, Enter or Space
 * and a screen reader hears whether it is open.
 */
export function Disclosure(props: {
  readonly summary: string
  readonly open?: boolean
  readonly children: ComponentChildren
}) {
  return (
    <details
      class="group -my-2"
      open={props.open}
    >
      <summary class="list-none [&::-webkit-details-marker]:hidden inline-flex items-center gap-1.5 min-h-11 text-sm font-bold text-gray-600 cursor-pointer select-none rounded-full -mx-2 px-2 transition-colors hover:text-brand hb-focus">
        {props.summary}
        <ChevronIcon
          size={16}
          class="transition-transform duration-200 motion-reduce:transition-none group-open:rotate-180"
        />
      </summary>

      <div class="flex flex-col gap-4 pt-2 pb-2">
        {props.children}
      </div>
    </details>
  )
}
