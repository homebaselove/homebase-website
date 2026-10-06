/** @jsxImportSource preact */
import { useEffect } from "preact"
import { useSignal } from "preact/signals"
import { createCalendarLinks } from "../../calendar.ts"
import { account, unpin } from "../../map/client.ts"
import { endOf, hasPin } from "../../map/event.ts"
import type { MapEvent } from "../../map/MapEvent.ts"
import { describeWhen } from "../../map/time.ts"
import { CloseIcon } from "../Icons.tsx"

interface Props {
  readonly event: MapEvent
  /** Other listed events at the same spot, which share its pin. */
  readonly others: readonly MapEvent[]
  /** Over the lower edge of the map, or in the flow of the list when there is no map. */
  readonly floating: boolean
  readonly onSelect: (slug: string) => void
  readonly onClose: () => void
}

/** The selected event. */
export function EventDetails(props: Props) {
  const { event } = props
  const when = describeWhen(event)
  const removing = useSignal(false)
  const problem = useSignal<string | null>(null)
  const actor = account.value
  const mayRemove = actor !== null
    && (actor.isAdmin
      || actor.address.toLowerCase() === event.addedBy.toLowerCase())

  useEffect(() => {
    const onKey = (key: KeyboardEvent) => {
      if (
        key.key === "Escape"
        && !document.querySelector("[role=dialog][aria-modal=true]")
      ) {
        props.onClose()
      }
    }

    addEventListener("keydown", onKey)

    return () => removeEventListener("keydown", onKey)
  }, [])

  const calendar = createCalendarLinks({
    title: event.title,
    location: event.address ?? event.city ?? undefined,
    start: new Date(event.start),
    end: new Date(endOf(event)),
  })

  return (
    <article
      class={props.floating
        ? "absolute left-3 right-3 bottom-3 md:left-4 md:right-auto md:w-[380px] max-h-[75%] overflow-y-auto bg-white rounded-xl shadow-xl border-[1px] border-gray-200"
        : "relative bg-white rounded-xl shadow-md border-[1px] border-gray-200"}
      aria-label={event.title}
    >
      {event.cover && (
        <img
          src={event.cover}
          // An empty alt without an empty literal, which the class scanner
          // misreads, dropping classes from this file.
          alt={String()}
          class="w-full aspect-[2/1] object-cover rounded-t-xl bg-gray-100"
        />
      )}

      <button
        type="button"
        onClick={props.onClose}
        aria-label="Close"
        class="absolute top-2 right-2 rounded-full bg-white/90 text-gray-600 p-1.5 shadow hover:bg-white"
      >
        <CloseIcon size={18} />
      </button>

      <div class="flex flex-col gap-3 p-4">
        <div>
          <p class="text-sm text-brand font-semibold pr-8">
            {when.date}
            <span class="text-gray-500 font-normal">
              {" · "}
              {when.time}
            </span>
          </p>

          {when.yours && (
            <p class="text-sm text-gray-500">
              {when.yours}
            </p>
          )}

          <h3 class="text-xl font-bold leading-tight mt-1">
            {event.title}
          </h3>
        </div>

        <p class="text-sm text-gray-700">
          {event.placement === "online"
            ? "Online event"
            : event.placement === "hidden"
            ? `${
              event.city ?? "Somewhere near here"
            }. The exact address is shared with guests on Luma.`
            : [
              event.venue,
              event.address ?? event.city,
            ]
              .filter(Boolean)
              .join(", ") || "Location to be announced"}
        </p>

        <div class="flex flex-wrap gap-2">
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            class="btn-brand"
          >
            Open on Luma
          </a>

          <a
            href={calendar.google}
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-full border-[1px] border-gray-200 px-4 py-2 text-sm hover:bg-gray-50"
          >
            Add to calendar
          </a>

          {hasPin(event) && event.placement === "venue" && (
            // Google Maps URLs need no key and no billing, unlike the API behind
            // the old map, and on a phone they open the maps app.
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${event.lat},${event.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              class="rounded-full border-[1px] border-gray-200 px-4 py-2 text-sm hover:bg-gray-50"
            >
              Directions
            </a>
          )}
        </div>

        {event.description && (
          <p class="text-sm text-gray-600">
            {event.description}
          </p>
        )}

        {(event.hosts.length > 0 || event.calendar) && (
          <p class="text-sm text-gray-500">
            Hosted by {event.hosts.length > 0
              ? event.hosts.join(", ")
              : event.calendar}
          </p>
        )}

        {props.others.length > 0 && (
          <div class="text-sm border-t-[1px] border-gray-100 pt-3">
            <p class="text-gray-500 mb-1">
              Also at this spot
            </p>
            <ul class="flex flex-col gap-1">
              {props.others.map((other) => (
                <li key={other.slug}>
                  <button
                    type="button"
                    class="text-left text-brand hover:underline"
                    onClick={() =>
                      props.onSelect(other.slug)}
                  >
                    {other.title}
                  </button>
                  <span class="text-gray-500 whitespace-nowrap">
                    {" · "}
                    {describeWhen(other).date}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {mayRemove && (
          <div class="flex items-center gap-3 border-t-[1px] border-gray-100 pt-3 text-sm">
            <button
              type="button"
              disabled={removing.value}
              class="text-red-600 hover:underline disabled:opacity-50"
              onClick={async () => {
                removing.value = true
                problem.value = null

                const failure = await unpin(event.slug)

                removing.value = false

                if (failure) {
                  problem.value = failure.error
                } else {
                  props.onClose()
                }
              }}
            >
              {removing.value ? "Removing…" : "Remove from map"}
            </button>

            {problem.value && (
              <span class="text-red-600">
                {problem.value}
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
