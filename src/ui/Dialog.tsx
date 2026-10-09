/** @jsxImportSource preact */
import type { ComponentChildren } from "preact"
import { useLayoutEffect, useMemo, useRef } from "preact"
import { CloseIcon } from "./Icons.tsx"

let made = 0

interface Props {
  readonly title: ComponentChildren
  readonly description?: ComponentChildren
  readonly onClose: () => void
  /** How wide it may grow from the sm breakpoint up, in rem; 32 if not given. */
  readonly width?: number
  readonly children?: ComponentChildren
}

/**
 * Every dialog on the page: the native modal dialog, open while it renders.
 * The browser lifts it above every section, makes the page behind it inert,
 * keeps focus inside it and hands focus back to whatever opened it. Escape,
 * the close button and a press on the backdrop all close it. Focus starts on
 * a control marked autofocus, else on the first control in the dialog, which
 * is why the close button comes last in the markup though it shows first.
 */
export function Dialog(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useMemo(() => `dialog-${++made}`, [])
  const onClose = useRef(props.onClose)
  const open = useRef(true)
  // A press that starts inside, as when selecting text, and ends on the
  // backdrop is not a press on the backdrop.
  const pressed = useRef(false)

  onClose.current = props.onClose

  const close = () => {
    if (open.current) {
      onClose.current()
    }
  }

  useLayoutEffect(() => {
    const element = dialog.current!

    element.showModal()

    return () => {
      open.current = false
      element.close()
    }
  }, [])

  return (
    <dialog
      ref={dialog}
      class="hb-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={props.description ? `${id}-description` : undefined}
      style={props.width ? `--dialog-width: ${props.width}rem` : undefined}
      onClose={close}
      onPointerDown={(press) => {
        pressed.current = press.target === press.currentTarget
      }}
      onClick={(click) => {
        if (pressed.current && click.target === click.currentTarget) {
          close()
        }
      }}
    >
      <div class="relative flex flex-col gap-4 p-5">
        <div class="pr-10">
          <h2
            id={`${id}-title`}
            class="text-2xl font-bold leading-tight"
          >
            {props.title}
          </h2>

          {props.description && (
            <p
              id={`${id}-description`}
              class="text-sm text-gray-500 mt-1"
            >
              {props.description}
            </p>
          )}
        </div>

        {props.children}

        <button
          type="button"
          aria-label="Close"
          class="btn-icon absolute top-3 right-3"
          onClick={close}
        >
          <CloseIcon size={20} />
        </button>
      </div>
    </dialog>
  )
}
