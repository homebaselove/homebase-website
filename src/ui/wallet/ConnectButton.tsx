/** @jsxImportSource preact */
import { useEffect } from "preact"
import { useSignal } from "preact/signals"
import { account, isAdmin, restore, shortAddress } from "../../wallet/client.ts"
import { ConnectDialog } from "./ConnectDialog.tsx"

/**
 * The one wallet button on the page, in the top right corner of the header.
 * It reads Connect wallet, or the connected address; either opens the
 * dialog. It also picks the last wallet back up after a reload.
 */
export function ConnectButton() {
  const open = useSignal(false)

  useEffect(() => {
    restore()
  }, [])

  const me = account.value

  return (
    <>
      <button
        type="button"
        data-wallet={me ? "connected" : "none"}
        class="flex min-h-10 max-sm:min-h-9 items-center gap-2 rounded-full border-[1px] border-white/60 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/20 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white/70 max-sm:px-3 max-sm:py-1.5 max-sm:text-xs"
        onClick={() => {
          open.value = true
        }}
      >
        {me
          ? (
            <>
              <span
                class="h-2 w-2 rounded-full bg-green-300"
                aria-hidden="true"
              />
              <span title={me.address}>
                {shortAddress(me.address)}
              </span>
              {isAdmin.value && (
                <span class="rounded-full bg-white/20 px-1.5 text-[11px] uppercase tracking-wide">
                  admin
                </span>
              )}
            </>
          )
          : "Connect wallet"}
      </button>

      {open.value && (
        <ConnectDialog
          onClose={() => {
            open.value = false
          }}
        />
      )}
    </>
  )
}
