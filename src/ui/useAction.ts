import { useSignal } from "preact/signals"
import {
  type Failure,
  isFailure,
  type Progress,
  type Stage,
} from "../wallet/client.ts"

/** What a run hands back when it failed, as opposed to a result of null. */
export const Failed = Symbol("failed")

/**
 * One action a person starts with a button: a look-up, a pin, a removal, a
 * donation. It keeps whether the action is under way and what went wrong,
 * ignores a second press while the first is running, and turns a Failure
 * into the sentence to show. Every button on the page that waits on the
 * network or the wallet goes through one of these. An action that sends a
 * transaction hands progress to it, and stage says where its own one is.
 */
export function useAction<A extends unknown[], R>(
  act: (...args: A) => Promise<R | Failure>,
) {
  const busy = useSignal(false)
  const problem = useSignal<string | null>(null)
  const stage = useSignal<Stage | null>(null)

  const progress: Progress = (next) => {
    stage.value = next
  }

  const run = async (...args: A): Promise<R | typeof Failed> => {
    if (busy.peek()) {
      return Failed
    }

    busy.value = true
    problem.value = null

    try {
      const answer = await act(...args)

      if (isFailure(answer)) {
        problem.value = answer.error

        return Failed
      }

      return answer
    } catch (error) {
      console.error("An action failed:", error)
      problem.value = "Something went wrong. Try again."

      return Failed
    } finally {
      busy.value = false
      stage.value = null
    }
  }

  return {
    run,
    busy,
    problem,
    stage,
    progress,
  }
}
