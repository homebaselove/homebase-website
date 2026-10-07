/** @jsxImportSource preact */
import { useEffect } from "preact"
import { useSignal } from "preact/signals"
import {
  connectWith,
  isFailure,
  type Wallet,
  walletChoices,
} from "../../wallet/client.ts"

interface Props {
  /** Called once a wallet is connected. */
  readonly onConnected?: () => void
}

/**
 * The wallets this browser can offer, each a button that connects it. The
 * list comes up on its own; a wallet that refuses says why underneath.
 */
export function WalletPicker(props: Props) {
  const wallets = useSignal<Wallet[] | null>(null)
  const chosen = useSignal<string | null>(null)
  const busy = useSignal(false)
  const problem = useSignal<string | null>(null)

  const offer = async () => {
    busy.value = true
    problem.value = null

    const answer = await walletChoices()

    busy.value = false

    if (isFailure(answer)) {
      problem.value = answer.error
    } else {
      wallets.value = answer
    }
  }

  useEffect(() => {
    offer()
  }, [])

  const withWallet = async (id: string) => {
    busy.value = true
    chosen.value = id
    problem.value = null

    const failure = await connectWith(id)

    busy.value = false
    chosen.value = null

    if (failure) {
      problem.value = failure.error
    } else {
      props.onConnected?.()
    }
  }

  return (
    <div class="flex flex-col gap-3">
      {wallets.value
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
                  disabled={busy.value}
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
            disabled={busy.value}
            onClick={offer}
          >
            {busy.value ? "One moment…" : "Connect wallet"}
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
    </div>
  )
}
