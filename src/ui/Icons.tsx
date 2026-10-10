/** @jsxImportSource preact */
import type { ComponentChildren } from "preact"

/**
 * Inlined rather than taken from lucide-preact. The bundler emits the module
 * body of that package as an empty initializer, so each of its icons reads as
 * an undeclared binding at runtime: rendering one throws, and the error
 * boundary drops the card around it without a word. Every icon is decoration
 * beside a label that names the control.
 */
interface IconProps {
  readonly size?: number
  readonly class?: string
}

function Icon(props: IconProps & {
  readonly children: ComponentChildren
  readonly filled?: boolean
}) {
  return (
    <svg
      width={props.size ?? 24}
      height={props.size ?? 24}
      class={props.class}
      viewBox="0 0 24 24"
      fill={props.filled ? "currentColor" : "none"}
      stroke={props.filled ? "none" : "currentColor"}
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {props.children}
    </svg>
  )
}

export function SpinnerIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </Icon>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Icon>
  )
}

export function ChevronIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  )
}

export function InfoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle
        cx="12"
        cy="12"
        r="10"
      />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </Icon>
  )
}

export function PlayIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      filled
    >
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11.04-6.86a1 1 0 0 0 0-1.72L9.5 4.28A1 1 0 0 0 8 5.14Z" />
    </Icon>
  )
}

/** Marks a link that leaves the page. */
export function OutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </Icon>
  )
}

export function CalendarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect
        x="3"
        y="4"
        width="18"
        height="18"
        rx="2"
      />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </Icon>
  )
}
