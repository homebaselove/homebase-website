/** @jsxImportSource preact */
import { Loader2 } from "lucide-preact"
import { useEffect, useMemo } from "preact"
import {
  For,
  Show,
  Signal,
  useComputed,
  useSignal,
  useSignalEffect,
} from "preact/signals"
import { createCalendarLinks } from "../calendar.ts"

// Types
interface LiveEvent {
  title: string
  description?: string
  location?: string
  start: string
  end: string
}

interface ProcessedEvent extends Omit<LiveEvent, "start"> {
  start: string // This will be the localized time string
}

interface DayData {
  title: string
  date: string
  events: ProcessedEvent[]
}

const formatDate = (date: Date | string) =>
  new Date(date).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })

// Components
interface LocationPickerProps {
  selectedTimezone: string
  timezones: Signal<string[]>
  onTimezoneChange: (timezone: string) => void
}

function LocationPicker({
  selectedTimezone,
  timezones,
  onTimezoneChange,
}: LocationPickerProps) {
  return (
    <div
      class="flex items-center gap-2 mt-2"
      style="
        opacity: 0;
        animation: fade-in 0.2s ease-in-out forwards;
        animation-delay: 0.5s;
      "
    >
      <span class="text-sm text-gray-600">
        Location:
      </span>
      <select
        value={selectedTimezone}
        class={`text-sm border border-gray-300 rounded px-2 py-1 appearance-none w-32`}
        onChange={(e) => {
          onTimezoneChange((e.target as HTMLSelectElement).value)
        }}
      >
        {timezones.value.map((timezone) => (
          <option key={timezone} value={timezone}>
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

interface DayElementProps {
  day: DayData
}

function DayElement({ day }: DayElementProps) {
  return (
    <div>
      <div
        class="flex items-center gap-2 my-1.5"
        style={{
          userSelect: "none",
        }}
      >
        <div class="w-12 h-12 bg-white rounded-lg shadow-sm flex flex-col overflow-hidden mb-2">
          <div class="bg-brand text-white text-xs font-semibold py-0.5 text-center">
            {new Date(day.date).toLocaleDateString("en-US", {
              month: "short",
            })}
          </div>
          <div class="flex-1 flex items-center justify-center text-md font-bold">
            {new Date(day.date).getDate()}
          </div>
        </div>

        <div class="flex flex-col">
          <span class="text-lg">
            {day.title}
          </span>

          <span class="text-md text-gray-500">
            {new Date(day.date).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
            })}
          </span>
        </div>
      </div>

      <div class="flex flex-col ml-16 gap-4 mt-2">
        {day.events.map((event: ProcessedEvent, eventIndex: number) => (
          <div
            key={eventIndex}
            class="flex border-t-[1px] border-gray-200 pt-2 w-full"
          >
            <div class="w-full">
              <div class="flex items-center w-full gap-1 text-gray-500 text-sm">
                <div class="flex items-center">
                  <ClockIcon size="16px" />
                  <span class="mx-1">
                    {new Date(event.start).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
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
                      end: new Date(
                        new Date(event.start).getTime() + 1.5 * 60 * 60 * 1000,
                      ),
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
                      end: new Date(
                        new Date(event.start).getTime() + 1.5 * 60 * 60 * 1000,
                      ),
                    })
                      .google}
                    class="hover:underline"
                  >
                    Google
                  </a>
                  {event.location && (
                    <>
                      {" • "}
                      <a
                        href={event.location}
                        target="_blank"
                        class="hover:underline"
                      >
                        Event Link
                      </a>
                    </>
                  )}
                </div>
              </div>

              <div class="block font-semibold text-xl mt-1 mb-2">
                {event.title}
              </div>

              {event.description && (
                <div class="text-gray-600">
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

export function WorkshopListCard() {
  const timezones = useSignal<string[]>([])
  const selectedTimezone = useSignal<string | null>(null)
  const calendarEvents = useSignal<LiveEvent[]>([])
  const loading = useSignal(true)

  // Initialize timezones on client side
  useEffect(() => {
    const supportedTimezones = Intl.supportedValuesOf("timeZone")
    timezones.value = supportedTimezones
    const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    selectedTimezone.value = currentTimezone
  })

  // Fetch calendar events
  useEffect(() => {
    const fetchCalendarEvents = async () => {
      try {
        loading.value = true
        const response = await fetch("/events.json")
        const events: LiveEvent[] = await response.json()
        calendarEvents.value = events
      } catch (error) {
        console.error("Error fetching calendar events:", error)
        calendarEvents.value = []
      } finally {
        loading.value = false
      }
    }

    fetchCalendarEvents()
  }, [])

  const days = useComputed(() => {
    if (loading.value || calendarEvents.value.length === 0) {
      return []
    }

    const tz = selectedTimezone.value ?? "UTC"

    // Convert events to localized time
    const events = calendarEvents.value.map((event) => {
      return {
        ...event,
        start: new Date(event.start).toLocaleString("en-US", {
          timeZone: tz,
        }),
      }
    })

    // Group events by day
    const dayEvents = events.reduce((acc, event) => {
      const day = formatDate(event.start)
      acc[day] = [...(acc[day] || []), event]
      return acc
    }, {} as Record<string, typeof events>)

    // Sort days and create day data
    return Object
      .keys(dayEvents)
      .sort()
      .map((dateKey) => ({
        title: new Date(dateKey).toLocaleDateString("en-US", {
          weekday: "long",
        }),
        date: dateKey,
        events: dayEvents[dateKey].sort(
          (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
        ),
      }))
  })

  const handleTimezoneChange = (timezone: string) => {
    selectedTimezone.value = timezone
  }

  if (loading.value) {
    return (
      <div class="relative bg-white w-full rounded-lg shadow-md border-[1px] border-gray-200">
        <div
          class="flex flex-wrap gap-x-4 items-center justify-between border-b-[1px] border-gray-200 p-3"
          style="background: linear-gradient(to bottom, rgba(245, 245, 245, 1), rgba(255, 255, 255, 1))"
        >
          <h2 class="text-3xl max-sm:text-2xl font-bold p-1.5">
            Upcoming Livestreams
          </h2>
          <LocationPicker
            selectedTimezone={selectedTimezone.value ?? "UTC"}
            timezones={timezones}
            onTimezoneChange={handleTimezoneChange}
          />
        </div>

        <div class="flex flex-col gap-6 p-4">
          <div class="flex items-center justify-center py-12">
            <Loader2 class="w-8 h-8 text-brand animate-spin" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div class="relative bg-white w-full rounded-lg shadow-md border-[1px] border-gray-200">
      <div
        class="flex flex-wrap gap-x-4 items-center justify-between border-b-[1px] border-gray-200 p-3"
        style="background: linear-gradient(to bottom, rgba(245, 245, 245, 1), rgba(255, 255, 255, 1))"
      >
        <h2 class="text-3xl max-sm:text-2xl p-1.5 font-bold">
          Upcoming Livestreams
        </h2>
        <LocationPicker
          selectedTimezone={selectedTimezone.value ?? "UTC"}
          timezones={timezones}
          onTimezoneChange={handleTimezoneChange}
        />
      </div>

      <div class="flex flex-col gap-6 p-4">
        {days.value.length === 0
          ? (
            <div class="text-center py-12 text-gray-500">
              No upcoming events found.
            </div>
          )
          : (
            <For each={days}>
              {(day: DayData) => <DayElement day={day} />}
            </For>
          )}
      </div>
    </div>
  )
}

function ClockIcon(props: { size?: any; class?: any }) {
  return (
    <svg
      width={props.size ?? "100%"}
      height={props.size ?? "100%"}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 7V12H15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  )
}
