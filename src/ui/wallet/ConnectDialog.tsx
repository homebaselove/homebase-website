/** @jsxImportSource preact */
import { account } from "../../wallet/client.ts"
import { Dialog } from "../Dialog.tsx"
import { WalletIdentity, WalletPicker } from "./WalletPicker.tsx"

/**
 * The way in, and the way out: the wallets to connect, or the connected one
 * with the way to disconnect it. A section that opens it for an action of
 * its own, as Donate does, says why, and carries on once a wallet is in.
 */
export function ConnectDialog(props: {
  readonly onClose: () => void
  /** Why this dialog opened, when an action is waiting on a wallet. */
  readonly reason?: string
}) {
  const me = account.value

  return (
    <Dialog
      title={me ? "Your wallet" : "Connect a wallet"}
      description={me
        ? "Connected on this page. Donations go from it, and the Homebase wallet adds events and calendars with it."
        : props.reason
          ?? "Donate to Based House from your wallet. The Homebase wallet also adds events to the map and calendars to Homebase Live; $home lockers will be able to soon."}
      onClose={props.onClose}
      // Connected, the first control would be Disconnect.
      initialFocus={me ? "close" : "first"}
    >
      {me
        ? (
          <WalletIdentity
            lead="Connected as"
            onDisconnect={props.onClose}
          />
        )
        : <WalletPicker onConnected={props.onClose} />}
    </Dialog>
  )
}
