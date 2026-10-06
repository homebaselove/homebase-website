/** @jsxImportSource preact */
import { useEffect, useRef } from "preact"
import { useSignal } from "preact/signals"
import {
  account,
  connectWith,
  isFailure,
  pin,
  type Preview,
  preview,
  signOut,
  type Wallet,
  walletChoices,
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

/**
 * Connect a wallet, then paste a link, see what Luma says about it and pin
 * it. The form is only there for a wallet whose pins count.
 */
export function SubmitDialog(props: Props) {
  // String() is an empty string without an empty literal, which the class
  // scanner misreads, dropping classes from this file.
  const url = useSignal(String())
  const found = useSignal<Preview | null>(null)
  const busy = useSignal<Busy>("idle")
  const problem = useSignal<string | null>(null)
  const wallets = useSignal<Wallet[] | null>(null)
  const chosen = useSignal<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const offerWallets = async () => {
    busy.value = "signing"
    problem.value = null

    const answer = await walletChoices()

    busy.value = "idle"

    if (isFailure(answer)) {
      problem.value = answer.error
    } else {
      wallets.value = answer
    }
  }

  useEffect(() => {
    // Without a wallet the dialog is the way in, so the wallets come up at once.
    if (!account.peek()) {
      offerWallets()
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        props.onClose()
      }
    }

    addEventListener("keydown", onKey)

    return () => removeEventListener("keydown", onKey)
  }, [])

  const actor = account.value

  useEffect(() => {
    if (actor) {
      input.current?.focus()
    }
  }, [actor !== null])

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

    const chosen = found.value

    if (!chosen) {
      busy.value = "idle"

      return
    }

    const answer = await pin(chosen.event)

    busy.value = "idle"

    if (isFailure(answer)) {
      problem.value = answer.error
    } else {
      props.onPinned(answer)
    }
  }

  const withWallet = async (id: string) => {
    busy.value = "signing"
    chosen.value = id
    problem.value = null

    const failure = await connectWith(id)

    busy.value = "idle"
    chosen.value = null

    if (failure) {
      problem.value = failure.error
    } else {
      wallets.value = null
    }
  }

  const leave = async () => {
    url.value = String()
    found.value = null
    problem.value = null
    await signOut()
    offerWallets()
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
              {actor ? "Add a Luma event" : "Connect a wallet"}
            </h2>
            <p class="text-sm text-gray-500 mt-1">
              {actor
                ? "Paste the event’s Luma link. Its time, place and cover come from Luma, and stay in step with it."
                : "The Homebase wallet adds events to the map. Once $home locking is wired in, anyone who has locked $home will be able to as well."}
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

        {actor
          ? (
            <>
              <div class="rounded-lg border-[1px] border-gray-200 bg-gray-50 p-3 text-sm flex flex-wrap items-center justify-between gap-2">
                <span>
                  Adding as{" "}
                  <strong title={actor.address}>
                    {shortAddress(actor.address)}
                  </strong>
                  {actor.isAdmin ? " (admin)" : " ($home locker)"}
                </span>

                <button
                  type="button"
                  class="text-brand hover:underline"
                  onClick={leave}
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
          : wallets.value
          ? (
            <ul
              class="flex flex-col gap-2"
              aria-label="Wallets"
            >
              {wallets.value.map((wallet) => (
                <li key={wallet.id}>
                  <button
                    type="button"
                    class="flex w-full items-center gap-3 rounded-lg border-[1px] border-gray-200 bg-white px-3 py-2 text-left hover:bg-gray-100 disabled:opacity-50"
                    disabled={busy.value === "signing"}
                    onClick={() => withWallet(wallet.id)}
                  >
                    {wallet.icon
                      ? (
                        <img
                          src={wallet.icon}
                          alt={String()}
                          class="h-6 w-6 rounded"
                        />
                      )
                      : (
                        <span
                          class="h-6 w-6 rounded bg-brand/10"
                          aria-hidden="true"
                        />
                      )}
                    <span class="font-semibold">
                      {wallet.name}
                    </span>
                    {chosen.value === wallet.id && (
                      <span class="ml-auto text-gray-500">
                        Check your wallet…
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )
          : (
            <button
              type="button"
              class="btn-brand self-start"
              disabled={busy.value === "signing"}
              onClick={offerWallets}
            >
              {busy.value === "signing" ? "One moment…" : "Connect wallet"}
            </button>
          )}

        {problem.value && (
          <p
            role="alert"
            class="text-sm text-red-600"
          >
            {problem.value}
          </p>
        )}

        {actor && found.value && (
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
          {props.busy ? "Confirm in your wallet…" : "Pin it to the map"}
        </button>
      </div>
    </div>
  )
}
