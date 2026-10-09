/** @jsxImportSource preact */
import { useMemo } from "preact"
import { useSignal } from "preact/signals"
import {
  type CalendarEvent,
  googleCalendarUrl,
  icsFile,
  icsName,
} from "../calendar.ts"
import { CalendarIcon, ChevronIcon } from "./Icons.tsx"

let made = 0

/**
 * Saves the file as a download rather than opening it: Safari on iPhone
 * will not open a calendar written into a data: link, but it hands a
 * downloaded one to Calendar.
 */
function download(event: CalendarEvent) {
  const file = new Blob([
    icsFile(event),
  ], {
    type: "text/calendar;charset=utf-8",
  })
  const href = URL.createObjectURL(file)
  const link = document.createElement("a")

  link.href = href
  link.download = icsName(event)
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(href), 10_000)
}

/**
 * Add to calendar, for any event on the page: Google Calendar in a new
 * tab, or a file for Apple Calendar, Outlook and the rest. The two choices
 * open under the button, in the flow of the card, so nothing is clipped by
 * the card around them.
 */
export function AddToCalendar(props: {
  readonly event: CalendarEvent
}) {
  const open = useSignal(false)
  const id = useMemo(() => `calendar-${++made}`, [])

  return (
    <div class="contents">
      <button
        type="button"
        class="btn btn-quiet btn-small"
        aria-expanded={open.value}
        aria-controls={id}
        onClick={() => {
          open.value = !open.value
        }}
      >
        <CalendarIcon size={16} />
        Add to calendar
        <ChevronIcon
          size={14}
          class={open.value ? "rotate-180 transition-transform" : "transition-transform"}
        />
      </button>

      {open.value && (
        <div
          id={id}
          class="basis-full flex flex-wrap gap-2"
        >
          <a
            href={googleCalendarUrl(props.event)}
            target="_blank"
            rel="noopener noreferrer"
            class="chip"
            onClick={() => {
              open.value = false
            }}
          >
            Google Calendar
          </a>

          <button
            type="button"
            class="chip"
            onClick={() => {
              download(props.event)
              open.value = false
            }}
          >
            Apple, Outlook and others (.ics)
          </button>
        </div>
      )}
    </div>
  )
}
