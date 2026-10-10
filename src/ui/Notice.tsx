/** @jsxImportSource preact */
import type { ComponentChildren } from "preact"

/**
 * A message after an action: an error, read out at once, or a confirmation,
 * read out when the reader is free. The region is on the page before the
 * message, as a live region has to be for every screen reader to announce
 * it, and takes no room while it is empty.
 */
export function Notice(props: {
  readonly tone: "error" | "done"
  readonly children?: ComponentChildren
}) {
  return (
    <p
      role={props.tone === "error" ? "alert" : "status"}
      class={props.tone === "error"
        ? "text-sm text-red-600 empty:absolute empty:size-0 empty:overflow-hidden"
        : "text-sm text-gray-600 empty:absolute empty:size-0 empty:overflow-hidden"}
    >
      {props.children || null}
    </p>
  )
}
