/** @jsxImportSource preact */
import { useEffect } from "preact"
import type { Signal } from "preact/signals"
import { hasPin } from "../../map/event.ts"
import type { MapEvent } from "../../map/MapEvent.ts"
import { describeWhen } from "../../map/time.ts"

interface Props {
  readonly events: Signal<MapEvent[]>
  readonly selected: Signal<string | null>
  readonly hovered: Signal<string | null>
  readonly onSelect: (slug: string) => void
  readonly loading: boolean
  readonly failed: boolean
  readonly empty: string
}

const reducedMotion = () =>
  typeof matchMedia === "function"
  && matchMedia("(prefers-reduced-motion: reduce)").matches

/** The list is the map's other half: the same events, readable by anyone. */
export function EventList(props: Props) {
  useEffect(() => {
    const slug = props.selected.value

    if (slug) {
      document
        .getElementById(`event-${slug}`)
        ?.scrollIntoView({
          block: "nearest",
          behavior: reducedMotion() ? "auto" : "smooth",
        })
    }
  }, [
    props.selected.value,
  ])

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
        The events couldn't be loaded. Refresh to try again.
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
          selected={props.selected.value === event.slug}
          hovered={props.hovered.value === event.slug}
          onSelect={() => props.onSelect(event.slug)}
          onHover={(on) => {
            props.hovered.value = on ? event.slug : null
          }}
        />
      ))}
    </ul>
  )
}

function EventRow(props: {
  event: MapEvent
  selected: boolean
  hovered: boolean
  onSelect: () => void
  onHover: (on: boolean) => void
}) {
  const { event } = props
  const when = describeWhen(event)
  const where = event.placement === "online"
    ? "Online"
    : [
      event.venue,
      event.city,
    ]
      .filter(Boolean)
      .join(" · ") || "Location to be announced"

  return (
    <li
      id={`event-${event.slug}`}
      class={props.selected
        ? "bg-brand/5"
        : props.hovered
        ? "bg-gray-50"
        : "bg-white"}
    >
      <div
        class="flex gap-3 p-4 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        role="button"
        tabIndex={0}
        aria-pressed={props.selected}
        onClick={props.onSelect}
        onKeyDown={(key) => {
          if (key.key === "Enter" || key.key === " ") {
            key.preventDefault()
            props.onSelect()
          }
        }}
        onMouseEnter={() => props.onHover(true)}
        onMouseLeave={() => props.onHover(false)}
        onFocus={() => props.onHover(true)}
        onBlur={() => props.onHover(false)}
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
          <p class="text-sm text-brand font-semibold">
            {when.date}
            <span class="text-gray-500 font-normal">
              {" · "}
              {when.time}
            </span>
          </p>

          <h3 class="font-bold leading-tight line-clamp-2">
            {event.title}
          </h3>

          <p class="text-sm text-gray-600 line-clamp-1">
            {where}
            {!hasPin(event) && event.placement !== "online" && (
              <span class="text-gray-400">
                {" · "}
                not on the map yet
              </span>
            )}
          </p>
        </div>

        <a
          href={event.url}
          target="_blank"
          rel="noopener noreferrer"
          class="self-center shrink-0 text-sm text-brand hover:underline"
          onClick={(click) => click.stopPropagation()}
        >
          Luma ↗
        </a>
      </div>
    </li>
  )
}
