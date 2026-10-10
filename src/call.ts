/**
 * The page's one way to ask its own endpoints for JSON: a failure comes back
 * as a value with a sentence to show, never as a thrown error, so every
 * section handles it the same way.
 */
import { type Failure, store, stored } from "./wallet/client.ts"

export async function call<A>(
  path: string,
  init: RequestInit = {},
  // Past the server's own worst case: a slow page and slow endpoints.
  timeoutMs = 30_000,
): Promise<A | Failure> {
  try {
    const response = await fetch(path, {
      ...init,
      headers: init.body
        ? {
          "content-type": "application/json",
        }
        : {},
      // Browsers without AbortSignal.timeout (Safari before 16) wait on the
      // endpoint instead.
      signal: AbortSignal.timeout?.(timeoutMs),
    })
    const body = await response.json().catch(() => ({}))

    if (!response.ok) {
      return {
        error: typeof body.error === "string"
          ? body.error
          : "Something went wrong. Try again.",
        status: response.status,
      }
    }

    return body as A
  } catch {
    return {
      error: "The site didn't answer. Check your connection and try again.",
      status: 0,
    }
  }
}

/**
 * The path to read a list from: past the cache for a while after this
 * browser changed the list, so the change shows on a reload.
 */
export function freshPath(path: string, key: string, freshForMs: number) {
  const changed = Number(stored(key) ?? 0)

  return Date.now() - changed < freshForMs ? `${path}?fresh=${changed}` : path
}

/** Notes that this browser just changed the list read from a path. */
export function markChanged(key: string) {
  store(key, String(Date.now()))
}
