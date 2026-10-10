/** @jsxImportSource preact */
import { type ComponentChildren, useEffect, useRef } from "preact"
import { useSignal } from "preact/signals"
import {
  account,
  type Failure,
  isAdmin,
  type Progress,
  shortAddress,
  stageLabel,
} from "../wallet/client.ts"
import { Dialog } from "./Dialog.tsx"
import { SpinnerIcon } from "./Icons.tsx"
import { Notice } from "./Notice.tsx"
import { Failed, useAction } from "./useAction.ts"
import { WalletIdentity, WalletPicker } from "./wallet/WalletPicker.tsx"

/**
 * How the admin adds anything the page lists by a link to it, an event to
 * the map or a calendar to Homebase Live: paste the link, look it up, see
 * what it holds, then confirm it in the wallet. Only a wallet whose
 * additions count gets the form; any other is told so, and with no wallet
 * the dialog offers the way in.
 */
export function LinkDialog<P, R>(props: {
  readonly title: string
  readonly description: string
  /** What the form adds, and where, for the wallet that may not. */
  readonly things: string
  readonly where: string
  readonly field: {
    readonly id: string
    readonly label: string
    readonly placeholder: string
  }
  readonly lookUp: (link: string) => Promise<P | Failure>
  readonly preview: (found: P) => ComponentChildren
  readonly confirmLabel: string
  readonly confirm: (found: P, progress: Progress) => Promise<R | Failure>
  readonly onDone: (result: R) => void
  readonly onClose: () => void
}) {
  // String() is an empty string without an empty literal, which the class
  // scanner misreads, dropping classes from this file.
  const link = useSignal(String())
  const found = useSignal<P | null>(null)
  const look = useAction(props.lookUp)
  const add = useAction((chosen: P) => props.confirm(chosen, add.progress))
  const input = useRef<HTMLInputElement>(null)
  const me = account.value
  const allowed = me !== null && isAdmin.value

  // The field takes focus when the dialog opens on it, and when a wallet
  // that may add connects inside the dialog.
  useEffect(() => {
    if (allowed) {
      input.current?.focus()
    }
  }, [allowed])

  const reset = () => {
    link.value = String()
    found.value = null
    look.problem.value = null
    add.problem.value = null
  }

  return (
    <Dialog
      title={allowed ? props.title : "Connect a wallet"}
      description={allowed
        ? props.description
        : `The Homebase wallet adds ${props.things} ${props.where}. Once $home locking is wired in, anyone who has locked $home will be able to as well.`}
      onClose={props.onClose}
    >
      {!me
        ? <WalletPicker />
        : !allowed
        ? (
          <WalletIdentity
            lead="Connected as"
            onDisconnect={reset}
          >
            <span role="alert">
              <strong title={me.address}>
                {shortAddress(me.address)}
              </strong>{" "}
              can’t add {props.things} yet. The Homebase wallet can now, and
              $home lockers will be able to soon.
            </span>
          </WalletIdentity>
        )
        : (
          <>
            <WalletIdentity
              lead="Adding as"
              onDisconnect={reset}
            />

            <form
              class="flex flex-col gap-2"
              onSubmit={async (submit) => {
                submit.preventDefault()

                if (!link.value.trim()) {
                  return
                }

                add.problem.value = null
                found.value = null

                const asked = link.value
                const answer = await look.run(asked)

                // A link edited while it was looked up gets its own look-up.
                if (answer !== Failed && link.value === asked) {
                  found.value = answer
                }
              }}
            >
              <label
                for={props.field.id}
                class="text-sm font-semibold"
              >
                {props.field.label}
              </label>

              <div class="flex gap-2">
                <input
                  id={props.field.id}
                  ref={input}
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  placeholder={props.field.placeholder}
                  value={link.value}
                  class="field flex-1"
                  onInput={(input) => {
                    link.value = (input.target as HTMLInputElement).value
                    found.value = null
                  }}
                />

                <button
                  type="submit"
                  class="btn btn-brand"
                  disabled={!link.value.trim() || look.busy.value
                    || add.busy.value}
                >
                  {look.busy.value
                    ? (
                      <>
                        <SpinnerIcon
                          size={18}
                          class="animate-spin"
                        />
                        <span class="sr-only">
                          Looking up
                        </span>
                      </>
                    )
                    : "Look up"}
                </button>
              </div>
            </form>

            {/* The form’s own messages; the wallet picker has its own. */}
            <Notice tone="error">
              {add.problem.value ?? look.problem.value}
            </Notice>
          </>
        )}

      {allowed && found.value !== null && (
        <div class="flex flex-col gap-3 rounded-xl border-[1px] border-gray-200 p-4">
          {props.preview(found.value)}

          <button
            type="button"
            class="btn btn-brand self-start"
            disabled={add.busy.value}
            onClick={async () => {
              const result = await add.run(found.value!)

              if (result !== Failed) {
                props.onDone(result)
              }
            }}
          >
            {add.busy.value ? stageLabel(add.stage.value) : props.confirmLabel}
          </button>
        </div>
      )}
    </Dialog>
  )
}
