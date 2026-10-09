/** @jsxImportSource preact */
import { useEffect } from "preact"
import { unpin } from "../../map/client.ts"
import { endOf, hasPin, placeOf } from "../../map/event.ts"
import type { MapEvent } from "../../map/MapEvent.ts"
import { describeWhen } from "../../map/time.ts"
import { account, isAdmin, stageLabel } from "../../wallet/client.ts"
import { AddToCalendar } from "../AddToCalendar.tsx"
import { CloseIcon } from "../Icons.tsx"
import { Notice } from "../Notice.tsx"
import { Failed, useAction } from "../useAction.ts"
import { EventWhen } from "./EventWhen.tsx"

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
  const remove = useAction(() => unpin(event.slug))
  const actor = account.value
  const mayRemove = actor !== null
    && (isAdmin.value
      || actor.address.toLowerCase() === event.addedBy.toLowerCase())

  useEffect(() => {
    // Escape inside an open dialog closes the dialog, not the card under it.
    const onKey = (key: KeyboardEvent) => {
      if (key.key === "Escape" && !document.querySelector("dialog[open]")) {
        props.onClose()
      }
    }

    addEventListener("keydown", onKey)

    return () => removeEventListener("keydown", onKey)
  }, [])

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
        class="btn-icon absolute top-2 right-2 bg-white/90 shadow hover:bg-white"
      >
        <CloseIcon size={18} />
      </button>

      <div class="flex flex-col gap-3 p-4">
        <div class="pr-8">
          <EventWhen event={event} />

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
          {placeOf(event, "full")}
        </p>

        <div class="flex flex-wrap gap-2">
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-brand btn-small"
          >
            Open on Luma
          </a>

          {hasPin(event) && event.placement === "venue" && (
            // Google Maps URLs need no key and no billing, unlike the API behind
            // the old map, and on a phone they open the maps app.
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${event.lat},${event.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              class="btn btn-quiet btn-small"
            >
              Directions
            </a>
          )}

          <AddToCalendar
            event={{
              title: event.title,
              start: new Date(event.start),
              end: new Date(endOf(event)),
              description: event.description,
              url: event.url,
              location: event.placement === "online"
                ? null
                : event.address ?? event.city,
            }}
          />
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
                    class="btn-text"
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
          <div class="flex flex-col gap-1 border-t-[1px] border-gray-100 pt-3 text-sm">
            <button
              type="button"
              disabled={remove.busy.value}
              class="btn-text btn-danger self-start"
              onClick={async () => {
                if (await remove.run() !== Failed) {
                  props.onClose()
                }
              }}
            >
              {remove.busy.value ? stageLabel() : "Remove from map"}
            </button>

            <Notice tone="error">
              {remove.problem.value}
            </Notice>
          </div>
        )}
      </div>
    </article>
  )
}
