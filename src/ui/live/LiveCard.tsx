/** @jsxImportSource preact */
import { useEffect } from "preact"
import { useComputed, useSignal } from "preact/signals"
import { createCalendarLinks } from "../../calendar.ts"
import {
  calendars,
  type ListedEvent,
  liveEvents,
  liveFailed,
  loadLive,
  removeCalendar,
} from "../../live/client.ts"
import { isAdmin } from "../../wallet/client.ts"
import { SpinnerIcon } from "../Icons.tsx"
import { AddCalendarDialog } from "./AddCalendarDialog.tsx"

interface DayData {
  readonly title: string
  readonly date: string
  readonly events: ListedEvent[]
}

/** The day an event falls on in the chosen zone; an all-day event keeps its own date in every zone. */
const dayOf = (event: ListedEvent, timeZone: string) =>
  event.allDay
    ? event.start.slice(0, 10)
    : new Date(event.start).toLocaleDateString("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })

function LocationPicker(props: {
  readonly selected: string
  readonly timezones: readonly string[]
  readonly onChange: (timezone: string) => void
}) {
  return (
    <div class="flex items-center gap-2">
      <span class="text-sm text-gray-600">
        Location:
      </span>
      <select
        value={props.selected}
        class="text-sm border border-gray-300 rounded px-2 py-1 appearance-none w-32"
        onChange={(event) => {
          props.onChange((event.target as HTMLSelectElement).value)
        }}
      >
        {props.timezones.map((timezone) => (
          <option
            key={timezone}
            value={timezone}
          >
            {timezone
              .split("/")
              .at(-1)!
              .replaceAll("_", " ")}
          </option>
        ))}
      </select>
    </div>
  )
}

function DayElement(props: {
  readonly day: DayData
  readonly timeZone: string
}) {
  const { day } = props
  const date = new Date(`${day.date}T12:00:00Z`)

  return (
    <div data-day={day.date}>
      <div class="flex items-center gap-2 my-1.5 select-none">
        <div class="w-12 h-12 bg-white rounded-lg shadow-sm flex flex-col overflow-hidden mb-2">
          <div class="bg-brand text-white text-xs font-semibold py-0.5 text-center">
            {date.toLocaleDateString("en-US", {
              month: "short",
              timeZone: "UTC",
            })}
          </div>
          <div class="flex-1 flex items-center justify-center text-md font-bold">
            {date.getUTCDate()}
          </div>
        </div>

        <div class="flex flex-col">
          <span class="text-lg">
            {day.title}
          </span>

          <span class="text-md text-gray-500">
            {date.toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              timeZone: "UTC",
            })}
          </span>
        </div>
      </div>

      <div class="flex flex-col ml-16 gap-4 mt-2">
        {day.events.map((event) => (
          <div
            key={`${event.calendar}:${event.id}`}
            class="flex border-t-[1px] border-gray-200 pt-2 w-full"
          >
            <div class="w-full">
              <div class="flex flex-wrap items-center w-full gap-1 text-gray-500 text-sm">
                <div class="flex items-center">
                  <ClockIcon size="16px" />
                  <span class="mx-1">
                    {event.allDay
                      ? "All day"
                      : new Date(event.start).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: props.timeZone,
                      })}
                  </span>
                </div>

                <div class="line-clamp-1">
                  🗓️{"  "}
                  <a
                    title="Add to Apple / iCalendar"
                    href={createCalendarLinks({
                      title: event.title,
                      start: new Date(event.start),
                      end: new Date(event.end),
                    })
                      .ical}
                    class="hover:underline"
                  >
                    iCalendar
                  </a>
                  {" • "}
                  <a
                    title="Add to Google Calendar"
                    target="_blank"
                    href={createCalendarLinks({
                      title: event.title,
                      start: new Date(event.start),
                      end: new Date(event.end),
                    })
                      .google}
                    class="hover:underline"
                  >
                    Google
                  </a>
                  {event.link && (
                    <>
                      {" • "}
                      <a
                        href={event.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="hover:underline"
                      >
                        Open event
                      </a>
                    </>
                  )}
                </div>
              </div>

              <div class="block font-semibold text-xl mt-1 mb-2">
                {event.title}
              </div>

              {event.description && (
                <div class="text-gray-600 line-clamp-3">
                  {event.description}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The calendars behind the list, for the admin: each with the way to take it off. */
function CalendarStrip() {
  const removing = useSignal<string | null>(null)
  const problem = useSignal<string | null>(null)
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
              class="text-red-600 hover:underline disabled:opacity-50"
              disabled={removing.value === calendar.uid}
              onClick={async () => {
                removing.value = calendar.uid
                problem.value = null

                const failure = await removeCalendar(calendar.uid)

                removing.value = null

                if (failure) {
                  problem.value = failure.error
                }
              }}
            >
              {removing.value === calendar.uid ? "Removing…" : "Remove"}
            </button>
          </span>
        ))}
      </div>

      {problem.value && (
        <p
          role="alert"
          class="text-red-600"
        >
          {problem.value}
        </p>
      )}
    </div>
  )
}

/** Homebase Live: what is streaming ahead, from the calendars the admin added. */
export function LiveCard() {
  const timezones = useSignal<string[]>([])
  const selectedTimezone = useSignal<string>("UTC")
  const loading = useSignal(true)
  const adding = useSignal(false)

  useEffect(() => {
    timezones.value = Intl.supportedValuesOf("timeZone")
    selectedTimezone.value = Intl.DateTimeFormat().resolvedOptions().timeZone

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
        title: new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
          weekday: "long",
          timeZone: "UTC",
        }),
        date,
        events: (byDay.get(date) ?? []).sort((a, b) =>
          a.start.localeCompare(b.start)
        ),
      }))
  })

  return (
    <section
      id="live"
      class="relative scroll-mt-8 bg-white w-full rounded-lg shadow-md border-[1px] border-gray-200"
      aria-labelledby="live-heading"
    >
      <div
        class="flex flex-wrap gap-x-4 gap-y-2 items-center justify-between border-b-[1px] border-gray-200 p-3"
        style="background: linear-gradient(to bottom, rgba(245, 245, 245, 1), rgba(255, 255, 255, 1))"
      >
        <h2
          id="live-heading"
          class="text-3xl max-sm:text-2xl font-bold p-1.5"
        >
          Homebase Live
        </h2>

        <div class="flex flex-wrap items-center gap-3">
          <LocationPicker
            selected={selectedTimezone.value}
            timezones={timezones.value}
            onChange={(timezone) => {
              selectedTimezone.value = timezone
            }}
          />

          {/* The way to add a calendar is for a wallet whose calendars count. */}
          {isAdmin.value && (
            <button
              type="button"
              class="btn-brand"
              onClick={() => {
                adding.value = true
              }}
            >
              Add a calendar
            </button>
          )}
        </div>
      </div>

      {isAdmin.value && !loading.value && <CalendarStrip />}

      <div class="flex flex-col gap-6 p-4">
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
    </section>
  )
}

function ClockIcon(props: {
  readonly size: string
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.size}
      height={props.size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
      />
      <path d="M12 6v6l4 2" />
    </svg>
  )
}
