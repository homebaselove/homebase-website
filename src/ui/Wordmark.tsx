/** @jsxImportSource preact */
import { word } from "./dots.ts"
import { DotMatrix } from "./DotMatrix.tsx"

const Homebase = word("HOMEBASE")

export function Wordmark() {
  return (
    <DotMatrix
      map={Homebase}
      label="Homebase"
    />
  )
}
