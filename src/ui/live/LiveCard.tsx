/** @jsxImportSource preact */
import { useEffect } from "preact"
import { useComputed, useSignal } from "preact/signals"
import {
  calendars,
  type ListedEvent,
  liveEvents,
  liveFailed,
  loadLive,
  removeCalendar,
} from "../../live/client.ts"
import { timeOf, zoneName } from "../../map/time.ts"
import { isAdmin, stageLabel } from "../../wallet/client.ts"
import { AddToCalendar } from "../AddToCalendar.tsx"
import { OutIcon, SpinnerIcon } from "../Icons.tsx"
import { Notice } from "../Notice.tsx"
import { Panel, PanelHeader } from "../Panel.tsx"
import { useAction } from "../useAction.ts"
import { AddCalendarDialog } from "./AddCalendarDialog.tsx"

interface DayData {
  readonly date: string
  readonly events: ListedEvent[]
}

interface Zone {
  readonly id: string
  readonly label: string
}

/** The day an event falls on in the chosen zone; an all-day event keeps its own date in every zone. */
const dayOf = (event: Pick<ListedEvent, "allDay" | "start">, timeZone: string) =>
  event.allDay
    ? event.start.slice(0, 10)
    : new Date(event.start).toLocaleDateString("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })

function viewerZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

/** Kiritimati, Pacific · GMT+14: the city, its region and its offset now. */
function zoneLabel(id: string, now: Date): string {
  if (id === "UTC") {
    return "UTC"
  }

  const parts = id.split("/")
  const city = parts.at(-1)!.replaceAll("_", " ")
  let offset: string | undefined

  try {
    offset = new Intl.DateTimeFormat("en-US", {
      timeZone: id,
      timeZoneName: "shortOffset",
    })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")
      ?.value
  } catch {
    // An older browser without offsets names the zone alone.
  }

  return [
    parts.length > 1 ? `${city}, ${parts[0].replaceAll("_", " ")}` : city,
    offset,
  ]
    .filter(Boolean)
    .join(" · ")
}

/**
 * Every zone the browser knows, the viewer's own always among them, by city
 * in alphabetical order, so typing the first letters of a city in the open
 * list lands on it.
 */
function zoneList(viewer: string): Zone[] {
  let known: string[] = []

  try {
    known = Intl.supportedValuesOf("timeZone")
  } catch {
    // Without the list, the viewer's zone and UTC are still offered.
  }

  const now = new Date()

  return [
    ...new Set([
      viewer,
      "UTC",
      ...known,
    ]),
  ]
    .map((id) => ({
      id,
      label: zoneLabel(id, now),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** Saturday, October 10, with Today or Tomorrow ahead of it when it is. */
function dayTitle(date: string, zone: string): string {
  const now = Date.now()
  const today = dayOf({
    allDay: false,
    start: new Date(now).toISOString(),
  }, zone)
  const tomorrow = dayOf({
    allDay: false,
    start: new Date(now + 24 * 60 * 60_000).toISOString(),
  }, zone)
  const name = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })

  return date === today
    ? `Today · ${name}`
    : date === tomorrow
    ? `Tomorrow · ${name}`
    : name
}

function DayElement(props: {
  readonly day: DayData
  readonly timeZone: string
}) {
  const { day } = props

  return (
    <div data-day={day.date}>
      <h3 class="sticky top-0 z-10 -mx-4 bg-white/95 px-4 py-2 text-sm font-bold uppercase tracking-wide text-brand backdrop-blur">
        {dayTitle(day.date, props.timeZone)}
      </h3>

      <ul class="flex flex-col divide-y divide-gray-100">
        {day.events.map((event) => {
          const start = new Date(event.start)

          return (
            <li
              key={`${event.calendar}:${event.id}`}
              class="flex gap-4 py-3"
            >
              <div class="w-[4.5rem] shrink-0 pt-0.5">
                <div class="text-sm font-bold">
                  {event.allDay ? "All day" : timeOf(start, props.timeZone)}
                </div>

                {!event.allDay && (
                  <div class="text-xs text-gray-500">
                    {zoneName(start, props.timeZone)}
                  </div>
                )}
              </div>

              <div class="min-w-0 flex-1 flex flex-col gap-1">
                <h4 class="text-lg font-bold leading-tight">
                  {event.title}
                </h4>

                {event.description && (
                  <p class="text-gray-600 line-clamp-3">
                    {event.description}
                  </p>
                )}

                <div class="flex flex-wrap gap-2 mt-1">
                  {event.link && (
                    <a
                      href={event.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="btn btn-quiet btn-small"
                    >
                      Open event
                      <OutIcon size={14} />
                    </a>
                  )}

                  <AddToCalendar
                    event={{
                      title: event.title,
                      start,
                      end: new Date(event.end),
                      allDay: event.allDay,
                      description: event.description,
                      url: event.link,
                    }}
                  />
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** The calendars behind the list, for the admin: each with the way to take it off. */
function CalendarStrip() {
  const removing = useSignal<string | null>(null)
  const remove = useAction(removeCalendar)
  const list = calendars.value ?? []

  return (
    <div class="flex flex-col gap-2 border-b-[1px] border-gray-200 bg-gray-50 px-4 py-3 text-sm">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span class="text-gray-500">
          {list.length === 0
            ? "No calendars yet."
            : list.length === 1
            ? "1 calendar:"
            : `${list.length} calendars:`}
        </span>

        {list.map((calendar) => (
          <span
            key={calendar.uid}
            class="flex items-center gap-2"
            data-calendar={calendar.url}
          >
            <a
              href={calendar.url}
              target="_blank"
              rel="noopener noreferrer"
              class="font-semibold hover:underline"
              title={calendar.url}
            >
              {calendar.name ?? "Calendar"}
            </a>
            <span class="text-gray-400">
              {calendar.reachable
                ? `${calendar.events} ahead`
                : "not answering"}
            </span>
            <button
              type="button"
              class="btn-text btn-danger"
              disabled={remove.busy.value}
              onClick={async () => {
                removing.value = calendar.uid
                await remove.run(calendar.uid)
                removing.value = null
              }}
            >
              {removing.value === calendar.uid ? stageLabel() : "Remove"}
            </button>
          </span>
        ))}
      </div>

      <Notice tone="error">
        {remove.problem.value}
      </Notice>
    </div>
  )
}

/** Homebase Live: what is streaming ahead, from the calendars the admin added, in the viewer’s time or any other. */
export function LiveCard() {
  const timezones = useSignal<Zone[]>([])
  const selectedTimezone = useSignal<string>("UTC")
  const loading = useSignal(true)
  const adding = useSignal(false)

  useEffect(() => {
    const viewer = viewerZone()

    selectedTimezone.value = viewer
    timezones.value = zoneList(viewer)

    loadLive().then(() => {
      loading.value = false
    })
  }, [])

  const days = useComputed<DayData[]>(() => {
    const now = Date.now()
    const zone = selectedTimezone.value
    const byDay = new Map<string, ListedEvent[]>()

    for (const event of liveEvents.value) {
      if (Date.parse(event.end) < now) {
        continue
      }

      const day = dayOf(event, zone)

      byDay.set(day, [
        ...(byDay.get(day) ?? []),
        event,
      ])
    }

    return [
      ...byDay.keys(),
    ]
      .sort()
      .map((date) => ({
        date,
        events: (byDay.get(date) ?? []).sort((a, b) =>
          a.start.localeCompare(b.start)
        ),
      }))
  })

  return (
    <Panel
      id="live"
      labelledBy="live-heading"
    >
      <PanelHeader
        titleId="live-heading"
        title="Homebase Live"
        lead="What is streaming next, in your time."
      >
        <label class="flex min-w-0 items-center gap-2 text-sm text-gray-600 whitespace-nowrap">
          Times in
          <select
            value={selectedTimezone.value}
            class="field w-auto min-w-0 max-w-[16rem] text-sm"
            onChange={(event) => {
              selectedTimezone.value = (event.target as HTMLSelectElement).value
            }}
          >
            {timezones.value.map((zone) => (
              <option
                key={zone.id}
                value={zone.id}
              >
                {zone.label}
              </option>
            ))}
          </select>
        </label>

        {/* The way to add a calendar is for a wallet whose calendars count. */}
        {isAdmin.value && (
          <button
            type="button"
            class="btn btn-brand"
            onClick={() => {
              adding.value = true
            }}
          >
            Add a calendar
          </button>
        )}
      </PanelHeader>

      {isAdmin.value && !loading.value && <CalendarStrip />}

      <div class="flex flex-col gap-4 px-4 pb-4 pt-2">
        {loading.value
          ? (
            <div class="flex items-center justify-center py-12">
              <SpinnerIcon class="w-8 h-8 text-brand animate-spin" />
            </div>
          )
          : liveFailed.value && days.value.length === 0
          ? (
            <p class="py-12 text-center text-gray-600">
              Homebase Live couldn’t be loaded. Refresh to try again.
            </p>
          )
          : days.value.length === 0
          ? (
            <p class="py-12 text-center text-gray-600">
              {isAdmin.value
                ? "Nothing streaming ahead. Add a calendar to list what is coming."
                : "Nothing streaming ahead right now."}
            </p>
          )
          : days.value.map((day) => (
            <DayElement
              key={day.date}
              day={day}
              timeZone={selectedTimezone.value}
            />
          ))}
      </div>

      {adding.value && (
        <AddCalendarDialog
          onClose={() => {
            adding.value = false
          }}
          onAdded={() => {
            adding.value = false
          }}
        />
      )}
    </Panel>
  )
}
