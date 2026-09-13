/** @jsxImportSource preact */
import { House } from "./dots.ts"
import { DotMatrix } from "./DotMatrix.tsx"

export function HouseLogo() {
  return <DotMatrix map={House} />
}
