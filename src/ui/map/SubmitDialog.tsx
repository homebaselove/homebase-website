/** @jsxImportSource preact */
import { useEffect, useRef } from "preact"
import { useSignal } from "preact/signals"
import {
  checkSession,
  isFailure,
  pin,
  type Preview,
  preview,
  session,
  signInWithWallet,
  signOut,
  useAdminKey,
  walletSignIn,
} from "../../map/client.ts"
import type { MapEvent } from "../../map/MapEvent.ts"
import { describeWhen } from "../../map/time.ts"
import { CloseIcon, SpinnerIcon } from "../Icons.tsx"

interface Props {
  readonly onClose: () => void
  readonly onPinned: (event: MapEvent) => void
}

type Busy =
  | "idle"
  | "looking"
  | "pinning"
  | "signing"

const shortAddress = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`

/** Paste a link, see what Luma says about it, pin it. */
export function SubmitDialog(props: Props) {
  // String() is an empty string without an empty literal, which the class
  // scanner misreads, dropping classes from this file.
  const url = useSignal(String())
  const found = useSignal<Preview | null>(null)
  const busy = useSignal<Busy>("idle")
  const problem = useSignal<string | null>(null)
  const key = useSignal(String())
  const keyOpen = useSignal(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    checkSession()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        props.onClose()
      }
    }

    addEventListener("keydown", onKey)

    return () => removeEventListener("keydown", onKey)
  }, [])

  const actor = session.value

  const lookUp = async () => {
    busy.value = "looking"
    problem.value = null
    found.value = null

    const answer = await preview(url.value)

    busy.value = "idle"

    if (isFailure(answer)) {
      problem.value = answer.error
    } else {
      found.value = answer
    }
  }

  const pinIt = async () => {
    busy.value = "pinning"
    problem.value = null

    const answer = await pin(url.value)

    busy.value = "idle"

    if (isFailure(answer)) {
      problem.value = answer.error
    } else {
      props.onPinned(answer)
    }
  }

  const withWallet = async () => {
    busy.value = "signing"
    problem.value = null

    const failure = await signInWithWallet()

    busy.value = "idle"

    if (failure) {
      problem.value = failure.error
    }
  }

  const withKey = async () => {
    busy.value = "signing"
    problem.value = null

    const failure = await useAdminKey(key.value)

    busy.value = "idle"
    key.value = String()

    if (failure) {
      problem.value = failure.error
    }
  }

  return (
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
        aria-labelledby="submit-heading"
        class="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 flex flex-col gap-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2
              id="submit-heading"
              class="text-2xl font-bold leading-tight"
            >
              Add a Luma event
            </h2>
            <p class="text-sm text-gray-500 mt-1">
              Paste the event’s Luma link. Its time, place and cover come from
              Luma, and stay in step with it.
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

        <div class="rounded-lg border-[1px] border-gray-200 bg-gray-50 p-3 text-sm flex flex-col gap-2">
          {actor
            ? (
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span>
                  Adding as{" "}
                  <strong>
                    {actor.address ? shortAddress(actor.address) : "admin"}
                  </strong>
                  {actor.role === "locker" && " ($home locker)"}
                </span>

                <button
                  type="button"
                  class="text-brand hover:underline"
                  onClick={() => signOut()}
                >
                  Sign out
                </button>
              </div>
            )
            : (
              <>
                <p class="text-gray-600">
                  Homebase admins can add events today. Once $home locking is
                  wired in, anyone who has locked $home will be able to as well.
                </p>

                <div class="flex flex-wrap items-center gap-2">
                  {walletSignIn.value && (
                    <button
                      type="button"
                      class="btn-brand"
                      disabled={busy.value === "signing"}
                      onClick={withWallet}
                    >
                      {busy.value === "signing"
                        ? "Check your wallet…"
                        : "Sign in with wallet"}
                    </button>
                  )}

                  <button
                    type="button"
                    class="text-brand hover:underline"
                    aria-expanded={keyOpen.value}
                    onClick={() => {
                      keyOpen.value = !keyOpen.value
                    }}
                  >
                    I have an admin key
                  </button>
                </div>

                {keyOpen.value && (
                  <form
                    class="flex gap-2"
                    onSubmit={(submit) => {
                      submit.preventDefault()
                      withKey()
                    }}
                  >
                    <input
                      type="password"
                      autoComplete="off"
                      placeholder="Admin key"
                      aria-label="Admin key"
                      value={key.value}
                      class="flex-1 min-w-0 rounded-full border-[1px] border-gray-200 bg-white px-3 py-2 focus:outline-none focus:border-brand/40"
                      onInput={(event) => {
                        key.value = (event.target as HTMLInputElement).value
                      }}
                    />
                    <button
                      type="submit"
                      class="btn-brand"
                      disabled={!key.value || busy.value === "signing"}
                    >
                      Use key
                    </button>
                  </form>
                )}
              </>
            )}
        </div>

        <form
          class="flex flex-col gap-2"
          onSubmit={(submit) => {
            submit.preventDefault()

            if (actor && url.value.trim()) {
              lookUp()
            }
          }}
        >
          <label
            for="luma-link"
            class="text-sm font-semibold"
          >
            Luma link
          </label>

          <div class="flex gap-2">
            <input
              id="luma-link"
              ref={input}
              type="text"
              inputMode="url"
              placeholder="https://luma.com/your-event"
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
              disabled={!actor || !url.value.trim() || busy.value !== "idle"}
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

        {problem.value && (
          <p
            role="alert"
            class="text-sm text-red-600"
          >
            {problem.value}
          </p>
        )}

        {found.value && (
          <PreviewCard
            found={found.value}
            busy={busy.value === "pinning"}
            onPin={pinIt}
          />
        )}
      </div>
    </div>
  )
}

function PreviewCard(props: {
  found: Preview
  busy: boolean
  onPin: () => void
}) {
  const { event } = props.found
  const when = describeWhen(event)
  const note = event.placement === "hidden"
    ? "The address is for guests only, so the pin lands on the city."
    : event.placement === "online"
    ? "An online event: it will be listed, not pinned."
    : event.placement === "unknown"
    ? "Luma has no coordinates for this one, so it will be listed, not pinned."
    : null

  return (
    <div class="rounded-lg border-[1px] border-gray-200 overflow-hidden">
      {event.cover && (
        <img
          src={event.cover}
          alt={String()}
          class="w-full aspect-[2/1] object-cover bg-gray-100"
        />
      )}

      <div class="p-4 flex flex-col gap-2">
        <p class="text-sm text-brand font-semibold">
          {when.date}
          <span class="text-gray-500 font-normal">
            {" · "}
            {when.time}
          </span>
        </p>

        <h3 class="text-lg font-bold leading-tight">
          {event.title}
        </h3>

        <p class="text-sm text-gray-600">
          {event.placement === "online"
            ? "Online"
            : [
              event.venue,
              event.city,
            ]
              .filter(Boolean)
              .join(" · ") || "No location given"}
        </p>

        {note && (
          <p class="text-sm text-gray-500">
            {note}
          </p>
        )}

        <button
          type="button"
          class="btn-brand self-start mt-1"
          disabled={props.busy}
          onClick={props.onPin}
        >
          {props.busy ? "Pinning…" : "Pin it to the map"}
        </button>
      </div>
    </div>
  )
}
