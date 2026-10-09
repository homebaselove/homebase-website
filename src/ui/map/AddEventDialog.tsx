/** @jsxImportSource preact */
import { pin, preview } from "../../map/client.ts"
import { placeOf } from "../../map/event.ts"
import type { MapEvent } from "../../map/MapEvent.ts"
import { LinkDialog } from "../LinkDialog.tsx"
import { EventWhen } from "./EventWhen.tsx"

/** What Luma gives no pin for, said before the event is pinned. */
const notes = {
  hidden: "The address is for guests only, so the pin lands on the city.",
  online: "An online event: it will be listed, not pinned.",
  unknown:
    "Luma has no coordinates for this one, so it will be listed, not pinned.",
  venue: null,
}

/** Paste a Luma link, see what Luma says about it and pin it. */
export function AddEventDialog(props: {
  readonly onClose: () => void
  readonly onPinned: (event: MapEvent) => void
}) {
  return (
    <LinkDialog
      title="Add a Luma event"
      description="Paste the event’s Luma link. Its time, place and cover come from Luma, and stay in step with it."
      things="events"
      field={{
        id: "luma-link",
        label: "Luma link",
        placeholder: "https://luma.com/your-event",
      }}
      lookUp={preview}
      preview={({ event }) => (
        <>
          {event.cover && (
            <img
              src={event.cover}
              // An empty alt without an empty literal, which the class
              // scanner misreads, dropping classes from this file.
              alt={String()}
              class="-mx-4 -mt-4 w-[calc(100%+2rem)] max-w-none aspect-[2/1] rounded-t-xl object-cover bg-gray-100"
            />
          )}

          <div class="flex flex-col gap-1">
            <EventWhen event={event} />

            <h3 class="text-lg font-bold leading-tight">
              {event.title}
            </h3>

            <p class="text-sm text-gray-600">
              {placeOf(event, "short")}
            </p>

            {notes[event.placement] && (
              <p class="text-sm text-gray-500">
                {notes[event.placement]}
              </p>
            )}
          </div>
        </>
      )}
      confirmLabel="Pin it to the map"
      confirm={({ event }) => pin(event)}
      onDone={props.onPinned}
      onClose={props.onClose}
    />
  )
}
