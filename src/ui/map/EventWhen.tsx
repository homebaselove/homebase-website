/** @jsxImportSource preact */
import type { LumaEvent } from "../../map/MapEvent.ts"
import { describeWhen } from "../../map/time.ts"

/**
 * When an event is, the date in brand blue and the hours after it, the way
 * every row, card and preview of an event reads.
 */
export function EventWhen(props: {
  readonly event: Pick<LumaEvent, "start" | "end" | "timezone" | "placement">
  readonly next?: boolean
}) {
  const when = describeWhen(props.event)

  return (
    <p class="text-sm text-brand font-semibold">
      {props.next && <span class="hb-next">Next up</span>}
      {when.date}
      <span class="text-gray-500 font-normal">
        {" · "}
        {when.time}
      </span>
    </p>
  )
}
