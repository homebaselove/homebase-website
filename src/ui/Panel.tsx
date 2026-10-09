/** @jsxImportSource preact */
import type { ComponentChildren } from "preact"

/**
 * The card a section of tools sits on, the map, Homebase Live and the
 * funding card: white, rounded, lifted off the page. Given an id it is a
 * landmark section named by its heading, which a link on the page can land
 * on. It clips its corners without becoming a scroller, so a heading inside
 * can still stick to the top of the screen.
 */
export function Panel(props: {
  readonly id?: string
  readonly labelledBy?: string
  readonly children: ComponentChildren
}) {
  const Tag = props.id ? "section" : "div"

  return (
    <Tag
      id={props.id}
      aria-labelledby={props.labelledBy}
      class="relative scroll-mt-8 overflow-clip rounded-2xl border-[1px] border-gray-200 bg-white shadow-md"
    >
      {props.children}
    </Tag>
  )
}

/** The bar across the top of a panel: its name, a line on what it holds, and its controls. */
export function PanelHeader(props: {
  readonly titleId: string
  readonly title: string
  readonly lead?: string
  readonly children?: ComponentChildren
}) {
  return (
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b-[1px] border-gray-200 bg-gradient-to-b from-gray-100 to-white p-4">
      <div>
        <h2
          id={props.titleId}
          class="text-3xl max-sm:text-2xl font-bold leading-none"
        >
          {props.title}
        </h2>

        {props.lead && (
          <p class="text-gray-500 mt-1.5">
            {props.lead}
          </p>
        )}
      </div>

      {props.children && (
        <div class="flex flex-wrap items-center gap-2">
          {props.children}
        </div>
      )}
    </div>
  )
}
