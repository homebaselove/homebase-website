/** @jsxImportSource preact */

/**
 * Inlined rather than taken from lucide-preact. The bundler emits that
 * module body of that package as an empty initializer, so its icons all
 * reads as an undeclared binding at runtime: rendering one throws, and the
 * error boundary drops the card around it without a word.
 */
function Icon(props) {
  return (
    <svg
      width={props.size ?? 24}
      height={props.size ?? 24}
      class={props.class}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {props.children}
    </svg>
  )
}

export function InfoIcon(props) {
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

export function SpinnerIcon(props) {
  return (
    <Icon {...props}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </Icon>
  )
}

export function CloseIcon(props) {
  return (
    <Icon {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Icon>
  )
}

export function VideoIcon(props) {
  return (
    <Icon {...props}>
      <path d="m22 8-6 4 6 4V8Z" />
      <rect
        width="14"
        height="12"
        x="2"
        y="6"
        rx="2"
        ry="2"
      />
    </Icon>
  )
}
