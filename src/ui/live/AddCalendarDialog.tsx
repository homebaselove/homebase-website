/** @jsxImportSource preact */
import { useEffect, useRef } from "preact"
import { createPortal } from "preact/compat"
import { useSignal } from "preact/signals"
import {
  addCalendar,
  type Calendar,
  type CalendarPreview,
  previewCalendar,
} from "../../live/client.ts"
import { isFailure } from "../../wallet/client.ts"
import { account, isAdmin, shortAddress, signOut } from "../../wallet/client.ts"
import { CloseIcon, SpinnerIcon } from "../Icons.tsx"
import { WalletPicker } from "../wallet/WalletPicker.tsx"

interface Props {
  readonly onClose: () => void
  readonly onAdded: (calendar: Calendar) => void
}

type Busy =
  | "idle"
  | "looking"
  | "adding"

const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })

/**
 * Paste a calendar feed link, see what it holds and add it. The form is only
 * there for a wallet whose calendars count; without a wallet the dialog
 * offers the way in.
 */
export function AddCalendarDialog(props: Props) {
  // String() is an empty string without an empty literal, which the class
  // scanner misreads, dropping classes from this file.
  const url = useSignal(String())
  const found = useSignal<CalendarPreview | null>(null)
  const busy = useSignal<Busy>("idle")
  const problem = useSignal<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        props.onClose()
      }
    }

    addEventListener("keydown", onKey)

    return () => removeEventListener("keydown", onKey)
  }, [])

  const actor = account.value
  const allowed = actor !== null && isAdmin.value

  useEffect(() => {
    if (allowed) {
      input.current?.focus()
    }
  }, [allowed])

  const lookUp = async () => {
    busy.value = "looking"
    problem.value = null
    found.value = null

    const answer = await previewCalendar(url.value)

    busy.value = "idle"

    if (isFailure(answer)) {
      problem.value = answer.error
    } else {
      found.value = answer
    }
  }

  const addIt = async () => {
    const chosen = found.value

    if (!chosen) {
      return
    }

    busy.value = "adding"
    problem.value = null

    const answer = await addCalendar(chosen)

    busy.value = "idle"

    if (isFailure(answer)) {
      problem.value = answer.error
    } else {
      props.onAdded(answer)
    }
  }

  return createPortal(
    <div
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4"
      onClick={(click) => {
        if (click.target === click.currentTarget) {
          props.onClose()
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-heading"
        class="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 flex flex-col gap-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2
              id="calendar-heading"
              class="text-2xl font-bold leading-tight"
            >
              {allowed ? "Add a calendar" : "Connect a wallet"}
            </h2>
            <p class="text-sm text-gray-500 mt-1">
              {allowed
                ? "Paste the iCal link of a Luma calendar, a Google Calendar or an Outlook calendar. Its events are listed here and stay in step with it. On Luma, the link is under Add iCal Subscription on the calendar page."
                : "The Homebase wallet adds calendars to Homebase Live. Once $home locking is wired in, anyone who has locked $home will be able to as well."}
            </p>
          </div>

          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close"
            class="rounded-full p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        {actor && allowed
          ? (
            <>
              <div class="rounded-lg border-[1px] border-gray-200 bg-gray-50 p-3 text-sm flex flex-wrap items-center justify-between gap-2">
                <span>
                  Adding as{" "}
                  <strong title={actor.address}>
                    {shortAddress(actor.address)}
                  </strong>
                  {" (admin)"}
                </span>

                <button
                  type="button"
                  class="text-brand hover:underline"
                  onClick={async () => {
                    url.value = String()
                    found.value = null
                    problem.value = null
                    await signOut()
                  }}
                >
                  Disconnect
                </button>
              </div>

              <form
                class="flex flex-col gap-2"
                onSubmit={(submit) => {
                  submit.preventDefault()

                  if (url.value.trim()) {
                    lookUp()
                  }
                }}
              >
                <label
                  for="calendar-link"
                  class="text-sm font-semibold"
                >
                  Calendar feed link
                </label>

                <div class="flex gap-2">
                  <input
                    id="calendar-link"
                    ref={input}
                    type="text"
                    inputMode="url"
                    placeholder="https://api.lu.ma/ics/get?entity=calendar&id=cal-…"
                    value={url.value}
                    class="flex-1 min-w-0 rounded-full border-[1px] border-gray-200 bg-gray-50 px-4 py-2 focus:outline-none focus:border-brand/40 focus:bg-white"
                    onInput={(event) => {
                      url.value = (event.target as HTMLInputElement).value
                      found.value = null
                    }}
                  />

                  <button
                    type="submit"
                    class="btn-brand"
                    disabled={!url.value.trim() || busy.value !== "idle"}
                  >
                    {busy.value === "looking"
                      ? (
                        <SpinnerIcon
                          size={18}
                          class="animate-spin"
                        />
                      )
                      : "Look up"}
                  </button>
                </div>
              </form>
            </>
          )
          : actor
          ? (
            <div class="rounded-lg border-[1px] border-gray-200 bg-gray-50 p-3 text-sm flex flex-wrap items-center justify-between gap-2">
              <span role="alert">
                <strong title={actor.address}>
                  {shortAddress(actor.address)}
                </strong>{" "}
                can’t add calendars yet. The Homebase wallet can now, and $home
                lockers will be able to soon.
              </span>

              <button
                type="button"
                class="text-brand hover:underline"
                onClick={() => signOut()}
              >
                Disconnect
              </button>
            </div>
          )
          : <WalletPicker />}

        {problem.value && (
          <p
            role="alert"
            class="text-sm text-red-600"
          >
            {problem.value}
          </p>
        )}

        {allowed && found.value && (
          <div class="rounded-lg border-[1px] border-gray-200 p-4 flex flex-col gap-2">
            <h3 class="text-lg font-bold leading-tight">
              {found.value.name ?? "Calendar"}
            </h3>

            <p class="text-sm text-gray-600">
              {found.value.upcoming === 0
                ? "Nothing ahead on it in the next four months."
                : found.value.upcoming === 1
                ? "1 event ahead."
                : `${found.value.upcoming} events ahead.`}
            </p>

            {found.value.events.length > 0 && (
              <ul class="text-sm flex flex-col gap-1">
                {found.value.events.slice(0, 5).map((event) => (
                  <li key={event.id}>
                    <span class="text-brand font-semibold">
                      {dateOf(
                        event
                          .start,
                      )}
                    </span>
                    {" · "}
                    {event
                      .title}
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              class="btn-brand self-start mt-1"
              disabled={busy.value === "adding"}
              onClick={addIt}
            >
              {busy.value === "adding"
                ? "Confirm in your wallet…"
                : "Add it to Homebase Live"}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
