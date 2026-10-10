/** @jsxImportSource preact */
import {
  type ComponentChildren,
  useLayoutEffect,
  useMemo,
  useRef,
} from "preact"
import { CloseIcon } from "./Icons.tsx"

let made = 0

interface Props {
  readonly title: ComponentChildren
  readonly description?: ComponentChildren
  readonly onClose: () => void
  /** How wide it may grow from the sm breakpoint up, in rem; 32 if not given. */
  readonly width?: number
  /**
   * Where focus starts: the first control, or the close button when the
   * first control would be the wrong place, such as Disconnect, or a player
   * that keeps the keys to itself.
   */
  readonly initialFocus?: "first" | "close"
  readonly children?: ComponentChildren
}

/** Whether a pointer event happened outside the dialog’s own box, on the backdrop. */
function outside(dialog: HTMLDialogElement, event: MouseEvent) {
  const box = dialog.getBoundingClientRect()

  return event.clientX < box.left
    || event.clientX > box.right
    || event.clientY < box.top
    || event.clientY > box.bottom
}

/**
 * Every dialog on the page: the native modal dialog, open while it renders.
 * The browser lifts it above every section, makes the page behind it inert,
 * keeps focus inside it and hands focus back to whatever opened it. Escape,
 * the close button and a press on the backdrop all close it. Focus starts on
 * a control marked autofocus, else on the first control in the dialog, which
 * is why the close button comes last in the markup though it shows first.
 * The heading and the close button stay in view; the rest scrolls.
 */
export function Dialog(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useMemo(() => `dialog-${++made}`, [])
  const onClose = useRef(props.onClose)
  const open = useRef(true)
  // Only a press that both starts and ends on the backdrop closes the
  // dialog: not one that selects text inside and ends outside, not one that
  // starts outside and ends inside, and not one on its scrollbar.
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

    // A control that disappears while it has focus, as a wallet button
    // does once the wallet connects, leaves focus on the page without any
    // event saying so; the dialog takes it back after each change to its
    // content. Focus that left for the browser itself, past the last
    // control, is left there.
    const watch = new MutationObserver(() => {
      if (
        element.open
        && document.hasFocus()
        && !element.contains(document.activeElement)
      ) {
        element.focus()
      }
    })

    watch.observe(element, {
      childList: true,
      subtree: true,
    })

    return () => {
      open.current = false
      watch.disconnect()
      element.close()
    }
  }, [])

  return (
    <dialog
      ref={dialog}
      class="hb-dialog"
      tabIndex={-1}
      aria-labelledby={`${id}-title`}
      aria-describedby={props.description ? `${id}-description` : undefined}
      style={props.width ? `--dialog-width: ${props.width}rem` : undefined}
      onClose={close}
      onPointerDown={(press) => {
        pressed.current = press.target === press.currentTarget
          && outside(press.currentTarget, press)
      }}
      onClick={(click) => {
        if (
          pressed.current
          && click.target === click.currentTarget
          && outside(click.currentTarget, click)
        ) {
          close()
        }

        pressed.current = false
      }}
    >
      <div class="shrink-0 px-5 pt-5 pr-16">
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

      <div class="hb-dialog-body flex flex-col gap-4 px-5 pt-4 pb-5">
        {props.children}
      </div>

      <button
        type="button"
        aria-label="Close"
        autoFocus={props.initialFocus === "close"}
        class="btn-icon absolute top-3 right-3"
        onClick={close}
      >
        <CloseIcon size={20} />
      </button>
    </dialog>
  )
}
