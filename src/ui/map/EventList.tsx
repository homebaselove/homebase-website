/** @jsxImportSource preact */
import {
  type ReadonlySignal,
  type Signal,
  useComputed,
  useSignalEffect,
} from "preact/signals"
import { hasPin, placeOf } from "../../map/event.ts"
import type { MapEvent } from "../../map/MapEvent.ts"
import { OutIcon } from "../Icons.tsx"
import { EventWhen } from "./EventWhen.tsx"

interface Props {
  readonly events: ReadonlySignal<MapEvent[]>
  readonly selected: Signal<string | null>
  readonly hovered: Signal<string | null>
  /** The soonest upcoming event, which wears a mark in the list and on the map. */
  readonly next: ReadonlySignal<string | null>
  readonly onSelect: (slug: string) => void
  readonly loading: boolean
  readonly failed: boolean
  readonly empty: string
}

const reducedMotion = () =>
  typeof matchMedia === "function"
  && matchMedia("(prefers-reduced-motion: reduce)").matches

/** The list is the other half of the map: the same events, readable by anyone. */
export function EventList(props: Props) {
  useSignalEffect(() => {
    const slug = props.selected.value

    if (slug) {
      document
        .getElementById(`event-${slug}`)
        ?.scrollIntoView({
          block: "nearest",
          behavior: reducedMotion() ? "auto" : "smooth",
        })
    }
  })

  if (props.loading) {
    return (
      <div class="flex flex-col gap-3 p-4">
        {[
          1,
          2,
          3,
        ]
          .map((row) => (
            <div
              key={row}
              class="h-20 rounded-lg bg-gray-100 animate-pulse"
            />
          ))}
      </div>
    )
  }

  if (props.failed && props.events.value.length === 0) {
    return (
      <p class="p-6 text-center text-gray-600">
        The events couldn’t be loaded. Refresh to try again.
      </p>
    )
  }

  if (props.events.value.length === 0) {
    return (
      <p class="p-6 text-center text-gray-600">
        {props.empty}
      </p>
    )
  }

  return (
    <ul class="flex flex-col divide-y divide-gray-100">
      {props.events.value.map((event) => (
        <EventRow
          key={event.slug}
          event={event}
          selected={props.selected}
          hovered={props.hovered}
          next={props.next}
          onSelect={() => props.onSelect(event.slug)}
        />
      ))}
    </ul>
  )
}

function EventRow(props: {
  event: MapEvent
  selected: Signal<string | null>
  hovered: Signal<string | null>
  next: ReadonlySignal<string | null>
  onSelect: () => void
}) {
  const { event } = props
  // Each row watches only its own answer, so a hover redraws two rows, not all.
  const selected = useComputed(() => props.selected.value === event.slug)
  const hovered = useComputed(() => props.hovered.value === event.slug)
  const next = useComputed(() => props.next.value === event.slug)

  // The row selects the event and its Luma link leaves for Luma; the two sit
  // side by side, since a link inside a button is neither for a screen
  // reader. Hovering either lights the row and its pin.
  return (
    <li
      id={`event-${event.slug}`}
      class={selected.value
        ? "flex items-center bg-brand/5"
        : hovered.value
        ? "flex items-center bg-gray-50"
        : "flex items-center bg-white"}
      onMouseEnter={() => {
        props.hovered.value = event.slug
      }}
      onMouseLeave={() => {
        props.hovered.value = null
      }}
    >
      <div
        class="flex min-w-0 flex-1 gap-3 py-4 pl-4 pr-2 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40"
        role="button"
        tabIndex={0}
        aria-pressed={selected.value}
        onClick={props.onSelect}
        onKeyDown={(key) => {
          if (key.key === "Enter" || key.key === " ") {
            key.preventDefault()
            props.onSelect()
          }
        }}
        onFocus={() => {
          props.hovered.value = event.slug
        }}
        onBlur={() => {
          props.hovered.value = null
        }}
      >
        {event.cover
          ? (
            <img
              src={event.cover}
              // An empty alt without an empty literal, which the class scanner
              // misreads, dropping classes from this file.
              alt={String()}
              loading="lazy"
              class="w-20 h-14 shrink-0 rounded-md object-cover bg-gray-100"
            />
          )
          : <div class="w-20 h-14 shrink-0 rounded-md bg-brand/10" />}

        <div class="min-w-0 flex-1">
          <EventWhen
            event={event}
            next={next.value}
          />

          <h3 class="font-bold leading-tight line-clamp-2">
            {event.title}
          </h3>

          <p class="text-sm text-gray-600 line-clamp-1">
            {placeOf(event, "short")}
            {!hasPin(event) && event.placement !== "online" && (
              <span class="text-gray-400">
                {" · "}
                not on the map yet
              </span>
            )}
          </p>
        </div>
      </div>

      <a
        href={event.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${event.title} on Luma`}
        class="hb-focus shrink-0 inline-flex items-center gap-0.5 min-h-11 px-2 mr-2 rounded-full text-sm font-semibold text-brand hover:underline"
      >
        Luma
        <OutIcon size={14} />
      </a>
    </li>
  )
}
