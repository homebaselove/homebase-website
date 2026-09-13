/** @jsxImportSource preact */
import { type DotMap, DotPitch, DotRadius } from "./dots.ts"

interface DotMatrixProps {
  map: DotMap
  label?: string
}

export function DotMatrix(props: DotMatrixProps) {
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${props.map.columns * DotPitch} ${
        props.map.rows * DotPitch
      }`}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      role={props.label ? "img" : undefined}
      aria-label={props.label}
      aria-hidden={props.label ? undefined : "true"}
    >
      {props.map.dots.map((dot) => (
        <circle
          key={`${dot.x},${dot.y}`}
          cx={dot.x * DotPitch + DotPitch / 2}
          cy={dot.y * DotPitch + DotPitch / 2}
          r={DotRadius}
        />
      ))}
    </svg>
  )
}
