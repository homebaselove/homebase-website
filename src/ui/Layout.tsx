/** @jsxImportSource preact */
import type { ComponentChildren } from "preact"

/** Each width, written out whole so the class scanner finds it. */
const Bands = {
  wide:
    "relative z-10 mx-auto flex w-full max-w-[1140px] flex-col gap-8 px-4 pt-16 max-sm:pt-12",
  medium:
    "relative z-10 mx-auto flex w-full max-w-[960px] flex-col gap-8 px-4 pt-16 max-sm:pt-12",
  narrow:
    "relative z-10 mx-auto flex w-full max-w-[840px] flex-col gap-8 px-4 pt-16 max-sm:pt-12",
  // Above its neighbors, so the blueprint carried out of it lies over them.
  raised:
    "relative z-20 mx-auto flex w-full max-w-[960px] flex-col gap-8 px-4 pt-16 max-sm:pt-12",
}

/** One band of the page, at the width its content reads best at, all spaced alike. */
export function Band(props: {
  readonly width: keyof typeof Bands
  readonly children: ComponentChildren
}) {
  return (
    <div class={Bands[props.width]}>
      {props.children}
    </div>
  )
}

/** The centered heading a section of the story opens with. */
export function SectionHeading(props: {
  readonly kicker?: string
  readonly title: string
  readonly lead?: string
}) {
  return (
    <div class="max-w-[640px] mx-auto text-center">
      {props.kicker && (
        <div class="text-sm font-bold uppercase tracking-wide text-brand">
          {props.kicker}
        </div>
      )}

      <h2 class="text-4xl max-sm:text-3xl font-bold mt-1">
        {props.title}
      </h2>

      {props.lead && (
        <p class="mt-3 text-gray-600">
          {props.lead}
        </p>
      )}
    </div>
  )
}
