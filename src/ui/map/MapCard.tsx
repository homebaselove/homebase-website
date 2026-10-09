/** @jsxImportSource preact */
import { useEffect, useRef } from "preact"
import { useComputed, useSignal, useSignalEffect } from "preact/signals"
import { events, loadEvents, loadFailed } from "../../map/client.ts"
import { hasPin, isUpcoming } from "../../map/event.ts"
import type { MapEvent } from "../../map/MapEvent.ts"
import { isAdmin } from "../../wallet/client.ts"
import { Choices } from "../Choices.tsx"
import { Panel, PanelHeader } from "../Panel.tsx"
import { AddEventDialog } from "./AddEventDialog.tsx"
import { EventDetails } from "./EventDetails.tsx"
import { EventList } from "./EventList.tsx"
import { MapView } from "./MapView.tsx"

type Filter =
  | "upcoming"
  | "past"

/** The query parameter that opens an event, so a pin can be linked to. */
const LinkParam = "event"

/**
 * The event a shared link names. The page reads it and never writes it: the
 * site is one page, and its address stays plain whatever is opened on it.
 */
function linkedSlug(): string | null {
  try {
    return new URL(location.href).searchParams.get(LinkParam)
  } catch {
    return null
  }
}

const byStart = (direction: 1 | -1) => (a: MapEvent, b: MapEvent) =>
  direction * (Date.parse(a.start) - Date.parse(b.start))

export function MapCard() {
  const filter = useSignal<Filter>("upcoming")
  const selected = useSignal<string | null>(linkedSlug())
  const hovered = useSignal<string | null>(null)
  const adding = useSignal(false)
  const mapUnavailable = useSignal(false)
  const now = useSignal(Date.now())
  const frame = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Who may pin comes with the list; the header picks the wallet back up.
    loadEvents()

    // A shared link lands on the map, not at the top of the page above it.
    if (selected.peek()) {
      frame.current?.closest("section")?.scrollIntoView({
        block: "start",
      })
    }

    const tick = setInterval(() => {
      now.value = Date.now()
    }, 60_000)

    return () => clearInterval(tick)
  }, [])

  const counts = useComputed(() => {
    const list = events.value ?? []
    const upcoming = list.filter((event) => isUpcoming(event, now.value)).length

    return {
      upcoming,
      past: list.length - upcoming,
    }
  })

  const shown = useComputed(() => {
    const upcoming = filter.value === "upcoming"

    return (events.value ?? [])
      .filter((event) => isUpcoming(event, now.value) === upcoming)
      .sort(byStart(upcoming ? 1 : -1))
  })

  const pinned = useComputed(() => shown.value.filter(hasPin))

  // The soonest upcoming event, first in the list, wears a mark there and on the map.
  const next = useComputed(() =>
    filter.value === "upcoming" ? shown.value[0]?.slug ?? null : null
  )

  const selectedEvent = useComputed(() =>
    shown.value.find((event) => event.slug === selected.value) ?? null
  )

  const sharingPin = useComputed(() => {
    const event = selectedEvent.value

    if (!event || !hasPin(event)) {
      return []
    }

    return shown.value.filter((other) =>
      other.slug !== event.slug
      && hasPin(other)
      && other.lat === event.lat
      && other.lng === event.lng
    )
  })

  const cardBox = useRef<HTMLDivElement>(null)

  // A linked event may sit on the other side of the filter, or be gone.
  useSignalEffect(() => {
    const slug = selected.value
    const list = events.value

    if (!slug || !list) {
      return
    }

    const event = list.find((candidate) => candidate.slug === slug)

    if (!event) {
      selected.value = null
    } else if (!shown.value.some((candidate) => candidate.slug === slug)) {
      filter.value = isUpcoming(event, now.value) ? "upcoming" : "past"
    }
  })

  const select = (slug: string | null) => {
    selected.value = slug
  }

  // On a phone the list sits under the map, so a chosen row brings the map back.
  const selectFromList = (slug: string | null) => {
    select(slug)

    const box = frame.current?.getBoundingClientRect()

    if (slug && box && (box.top < 0 || box.bottom > innerHeight)) {
      frame.current?.scrollIntoView({
        block: "nearest",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      })
    }
  }

  const count = (label: string, value: number) => (
    <>
      {label}{" "}
      {events.value && (
        <span class="text-gray-400 font-normal">
          {value}
        </span>
      )}
    </>
  )

  return (
    <Panel
      id="map"
      labelledBy="map-heading"
    >
      <PanelHeader
        titleId="map-heading"
        title="Homebase Map"
        lead="Where the community gathers next, straight from Luma."
      >
        <Choices
          label="Which events to show"
          value={filter.value}
          options={[
            {
              value: "upcoming",
              label: count("Upcoming", counts.value.upcoming),
            },
            {
              value: "past",
              label: count("Past", counts.value.past),
            },
          ]}
          onChange={(value: Filter) => {
            filter.value = value
            selected.value = null
          }}
        />

        {/* The form is for a wallet whose pins count; the way in is the button in the header. */}
        {isAdmin.value && (
          <button
            type="button"
            class="btn btn-brand"
            onClick={() => {
              adding.value = true
            }}
          >
            Add an event
          </button>
        )}
      </PanelHeader>

      <div class="grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div
          ref={frame}
          class={mapUnavailable.value
            ? "hidden"
            : "relative h-[60vh] min-h-[360px] lg:h-[560px]"}
        >
          <MapView
            events={pinned}
            selected={selected}
            hovered={hovered}
            next={next}
            onSelect={select}
            onUnavailable={() => {
              mapUnavailable.value = true
            }}
            covered={() =>
              cardBox.current?.firstElementChild?.getBoundingClientRect()
                ?? null}
          />

          {selectedEvent.value && (
            <div
              ref={cardBox}
              class="contents"
            >
              <EventDetails
                key={selectedEvent.value.slug}
                event={selectedEvent.value}
                others={sharingPin.value}
                floating={true}
                onSelect={select}
                onClose={() => select(null)}
              />
            </div>
          )}
        </div>

        <div class="lg:h-[560px] overflow-y-auto border-t-[1px] lg:border-t-0 lg:border-l-[1px] border-gray-200">
          <p
            class="sr-only"
            aria-live="polite"
          >
            {shown.value.length} events listed
          </p>

          {mapUnavailable.value && selectedEvent.value && (
            <div class="p-4 border-b-[1px] border-gray-200">
              <EventDetails
                key={selectedEvent.value.slug}
                event={selectedEvent.value}
                others={sharingPin.value}
                floating={false}
                onSelect={select}
                onClose={() => select(null)}
              />
            </div>
          )}

          <EventList
            events={shown}
            selected={selected}
            hovered={hovered}
            next={next}
            onSelect={selectFromList}
            loading={events.value === null}
            failed={loadFailed.value}
            empty={filter.value !== "upcoming"
              ? "No past events here yet."
              : isAdmin.value
              ? "No upcoming events pinned yet. Paste a Luma link to add one."
              : "No upcoming events pinned yet."}
          />
        </div>
      </div>

      {adding.value && (
        <AddEventDialog
          onClose={() => {
            adding.value = false
          }}
          onPinned={(event) => {
            adding.value = false
            filter.value = isUpcoming(event, now.value) ? "upcoming" : "past"
            select(event.slug)
          }}
        />
      )}
    </Panel>
  )
}
