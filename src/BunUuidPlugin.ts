import type { BunPlugin } from "bun"

/**
 * uuid's browser entry re-exports each helper with `export { default as x }
 * from`, and the bundler emits the namespace without the bodies behind it, so
 * every one of its exports reads as an undeclared binding. jayson reaches for
 * v4 while the Farcaster SDK loads, which took `sdk.actions.ready()` down with
 * it and left the mini app sitting on its splash screen.
 *
 * jayson's browser client is the only thing that reads from that namespace,
 * and it reads only v4, so only v4 is replaced. The rest of the module is
 * passed through as it was.
 */
export function make(): BunPlugin {
  return {
    name: "Bun uuid v4 plugin",
    setup(builder) {
      builder.onLoad({
        filter: /uuid[\\/]dist[\\/]esm-browser[\\/]index\.js$/,
      }, async (args) => {
        const source = await Bun.file(args.path).text()

        if (!V4Reexport.test(source)) {
          return undefined
        }

        return {
          contents: source.replace(V4Reexport, V4Source),
          loader: "js",
        }
      })
    },
  }
}

const V4Reexport = /export\s*\{\s*default as v4\s*\}\s*from\s*["'][^"']+["'];?/

const V4Source = `
export function v4() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16))

  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-")
}
`
