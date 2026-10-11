/** @jsxImportSource preact */
import { useEffect } from "preact"

/** Every page tells a Farcaster mini app host it is ready, so the splash screen lifts on any page a cast opens. */
export default function Layout(props) {
  useEffect(() => {
    import("@farcaster/frame-sdk").then((mod) => mod.sdk.actions.ready())
  }, [])

  return props.children
}
