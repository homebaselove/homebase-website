/** @jsxImportSource preact */
import {
  addCalendar,
  type Calendar,
  previewCalendar,
} from "../../live/client.ts"
import { LinkDialog } from "../LinkDialog.tsx"

const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })

/** Paste a calendar feed link, see what it holds and add it. */
export function AddCalendarDialog(props: {
  readonly onClose: () => void
  readonly onAdded: (calendar: Calendar) => void
}) {
  return (
    <LinkDialog
      title="Add a calendar"
      description="Paste the iCal link of a Luma calendar, a Google Calendar or an Outlook calendar. Its events are listed here and stay in step with it. On Luma, the link is under Add iCal Subscription on the calendar page."
      things="calendars"
      field={{
        id: "calendar-link",
        label: "Calendar feed link",
        placeholder: "https://api.lu.ma/ics/get?entity=calendar&id=cal-…",
      }}
      lookUp={previewCalendar}
      preview={(found) => (
        <div class="flex flex-col gap-2">
          <h3 class="text-lg font-bold leading-tight">
            {found.name ?? "Calendar"}
          </h3>

          <p class="text-sm text-gray-600">
            {found.upcoming === 0
              ? "Nothing ahead on it in the next four months."
              : found.upcoming === 1
              ? "1 event ahead."
              : `${found.upcoming} events ahead.`}
          </p>

          {found.events.length > 0 && (
            <ul class="text-sm flex flex-col gap-1">
              {found.events.slice(0, 5).map((event) => (
                <li key={event.id}>
                  <span class="text-brand font-semibold">
                    {dateOf(event.start)}
                  </span>
                  {" · "}
                  {event.title}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      confirmLabel="Add it to Homebase Live"
      confirm={addCalendar}
      onDone={props.onAdded}
      onClose={props.onClose}
    />
  )
}
