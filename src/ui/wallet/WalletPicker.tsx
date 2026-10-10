/** @jsxImportSource preact */
import { type ComponentChildren, useEffect, useRef } from "preact"
import { useSignal } from "preact/signals"
import {
  account,
  connectWith,
  isAdmin,
  shortAddress,
  signOut,
  type Wallet,
  walletChoices,
} from "../../wallet/client.ts"
import { SpinnerIcon } from "../Icons.tsx"
import { Notice } from "../Notice.tsx"
import { Failed, useAction } from "../useAction.ts"

/**
 * The wallets this browser can offer, each a button that connects it. The
 * list comes up on its own and takes focus when it does, since nothing else
 * in the dialog is the next step; a wallet that refuses says why
 * underneath.
 */
export function WalletPicker(props: {
  /** Called once a wallet is connected. */
  readonly onConnected?: () => void
}) {
  const wallets = useSignal<Wallet[] | null>(null)
  const chosen = useSignal<string | null>(null)
  const offer = useAction(walletChoices)
  const connect = useAction(async (id: string) => await connectWith(id) ?? id)
  const first = useRef<HTMLButtonElement>(null)

  const list = async () => {
    const answer = await offer.run()

    if (answer !== Failed) {
      wallets.value = answer
    }
  }

  useEffect(() => {
    list()
  }, [])

  useEffect(() => {
    if (wallets.value) {
      first.current?.focus()
    }
  }, [wallets.value])

  const busy = offer.busy.value || connect.busy.value

  return (
    <div class="flex flex-col gap-3">
      {wallets.value
        ? (
          <ul
            class="flex flex-col gap-2"
            aria-label="Wallets"
          >
            {wallets.value.map((wallet, place) => (
              <li key={wallet.id}>
                <button
                  ref={place === 0 ? first : undefined}
                  type="button"
                  class="hb-focus flex w-full min-h-12 items-center gap-3 rounded-xl border-[1px] border-gray-200 bg-white px-3 py-2 text-left transition-colors hover:border-brand/40 hover:bg-brand/5 disabled:opacity-50"
                  disabled={busy}
                  onClick={async () => {
                    chosen.value = wallet.id

                    const done = await connect.run(wallet.id)

                    chosen.value = null

                    if (done !== Failed) {
                      props.onConnected?.()
                    }
                  }}
                >
                  {wallet.icon
                    ? (
                      <img
                        src={wallet.icon}
                        alt={String()}
                        class="h-7 w-7 rounded-md"
                      />
                    )
                    : (
                      <span
                        class="h-7 w-7 rounded-md bg-brand/10"
                        aria-hidden="true"
                      />
                    )}
                  <span class="font-semibold">
                    {wallet.name}
                  </span>
                  {chosen.value === wallet.id && (
                    <span class="ml-auto text-sm text-gray-500">
                      Check your wallet…
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )
        : offer.problem.value
        ? (
          <button
            type="button"
            class="btn btn-brand self-start"
            disabled={busy}
            onClick={list}
          >
            Try again
          </button>
        )
        : (
          <p class="flex items-center gap-2 text-sm text-gray-500">
            <SpinnerIcon
              size={16}
              class="animate-spin"
            />
            Finding wallets…
          </p>
        )}

      <Notice tone="error">
        {connect.problem.value ?? offer.problem.value}
      </Notice>
    </div>
  )
}

/**
 * The connected wallet, by its short address and, for an admin, its role,
 * with the way to disconnect it. Given children, they say what the wallet
 * may not do in place of that line.
 */
export function WalletIdentity(props: {
  /** How the line opens: Connected as, or Adding as. */
  readonly lead: string
  readonly onDisconnect?: () => void
  readonly children?: ComponentChildren
}) {
  const me = account.value

  if (!me) {
    return null
  }

  return (
    <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border-[1px] border-gray-200 bg-gray-50 p-3 text-sm">
      {props.children ?? (
        <span>
          {props.lead}{" "}
          <strong title={me.address}>
            {shortAddress(me.address)}
          </strong>
          {isAdmin.value ? " (admin)" : String()}
        </span>
      )}

      <button
        type="button"
        class="btn-text"
        onClick={async () => {
          await signOut()
          props.onDisconnect?.()
        }}
      >
        Disconnect
      </button>
    </div>
  )
}
