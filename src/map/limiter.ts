/**
 * A fixed window per key, kept in memory. On the Bun server that is the whole
 * story; on Vercel each instance keeps its own, which still blunts a burst.
 */
export function createLimiter(options: {
  readonly limit: number
  readonly windowMs: number
}) {
  const windows = new Map<
    string,
    {
      count: number
      resetAt: number
    }
  >()

  return (key: string, now: number): boolean => {
    if (windows.size > 10_000) {
      windows.clear()
    }

    const window = windows.get(key)

    if (!window || window.resetAt <= now) {
      windows.set(key, {
        count: 1,
        resetAt: now + options.windowMs,
      })

      return true
    }

    window.count += 1

    return window.count <= options.limit
  }
}
