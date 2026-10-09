/** @jsxImportSource preact */
import type { ComponentChildren } from "preact"
import { useMemo } from "preact"

let made = 0

/**
 * One of a few options, as chips: native radios under a group name, so Tab
 * reaches the group once, the arrow keys move between the options and a
 * screen reader counts them. The amount to give and the events to show both
 * use it. Nothing is chosen when the value matches no option, as when an
 * amount is typed instead.
 */
export function Choices<T extends string | number>(props: {
  readonly label: string
  readonly value: T | null
  readonly options: readonly {
    readonly value: T
    readonly label: ComponentChildren
  }[]
  readonly onChange: (value: T) => void
  readonly class?: string
}) {
  const name = useMemo(() => `choice-${++made}`, [])

  return (
    <div
      role="radiogroup"
      aria-label={props.label}
      class={props.class ?? "flex flex-wrap gap-2"}
    >
      {props.options.map((option) => (
        <label
          key={option.value}
          class="chip"
        >
          <input
            type="radio"
            name={name}
            checked={option.value === props.value}
            onChange={() => props.onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </div>
  )
}
