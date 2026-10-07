/** @jsxImportSource preact */
import { useEffect } from "preact"
import { createPortal } from "preact/compat"
import { account, isAdmin, shortAddress, signOut } from "../../wallet/client.ts"
import { CloseIcon } from "../Icons.tsx"
import { WalletPicker } from "./WalletPicker.tsx"

interface Props {
  readonly onClose: () => void
}

/**
 * The way in, and the way out: the wallets to connect, or the connected one
 * with the way to disconnect it. Rendered at the document root, over every
 * section of the page.
 */
export function ConnectDialog(props: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        props.onClose()
      }
    }

    addEventListener("keydown", onKey)

    return () => removeEventListener("keydown", onKey)
  }, [])

  const me = account.value

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
        aria-labelledby="connect-heading"
        class="w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 flex flex-col gap-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2
              id="connect-heading"
              class="text-2xl font-bold leading-tight"
            >
              {me ? "Your wallet" : "Connect a wallet"}
            </h2>
            <p class="text-sm text-gray-500 mt-1">
              {me
                ? "Connected on this page. Donations go from it, and the Homebase wallet adds events and calendars with it."
                : "Donate to Based House from your wallet. The Homebase wallet also adds events to the map and calendars to Homebase Live; $home lockers will be able to soon."}
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

        {me
          ? (
            <div class="rounded-lg border-[1px] border-gray-200 bg-gray-50 p-3 text-sm flex flex-wrap items-center justify-between gap-2">
              <span>
                Connected as{" "}
                <strong title={me.address}>
                  {shortAddress(me.address)}
                </strong>
                {isAdmin.value ? " (admin)" : String()}
              </span>

              <button
                type="button"
                class="text-brand hover:underline"
                onClick={async () => {
                  await signOut()
                  props.onClose()
                }}
              >
                Disconnect
              </button>
            </div>
          )
          : <WalletPicker onConnected={props.onClose} />}
      </div>
    </div>,
    document.body,
  )
}
