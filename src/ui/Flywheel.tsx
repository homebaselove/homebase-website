/** @jsxImportSource preact */
import { useEffect, useRef } from "preact"

/** The flywheel document, served from public as it is. */
export const FlywheelUrl = "/flywheel.html"

/**
 * The Based House flywheel: one self-contained document, built for SeedMe,
 * with its own styles, drawing and script, so it sits in a frame where the
 * page styles cannot reach it. The frame takes the height of the content
 * inside, shrinking as well as growing, so the page scrolls as one. The
 * document hides its own heading and phone bar; the page gives the heading.
 */
export function Flywheel() {
  const frame = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const element = frame.current

    if (!element) {
      return
    }

    let observer: ResizeObserver | undefined

    // The content rather than the document: a document is never shorter
    // than its frame, so measuring it would only ever let the frame grow.
    const fit = () => {
      const content = element.contentDocument?.querySelector(".wrap")
      const scrolled = element.contentWindow?.scrollY ?? 0

      if (content) {
        element.style.height = `${
          Math.ceil(content.getBoundingClientRect().bottom + scrolled)
        }px`
      }
    }

    const loaded = () => {
      fit()

      const content = element.contentDocument?.querySelector(".wrap")

      observer?.disconnect()

      if (content && "ResizeObserver" in window) {
        observer = new ResizeObserver(fit)
        observer.observe(content)
      }
    }

    element.addEventListener("load", loaded)

    if (element.contentDocument?.readyState === "complete") {
      loaded()
    }

    return () => {
      element.removeEventListener("load", loaded)
      observer?.disconnect()
    }
  }, [])

  return (
    <iframe
      ref={frame}
      src={FlywheelUrl}
      title="The Based House flywheel"
      class="block w-full border-0"
      style={{
        height: "1200px",
      }}
    />
  )
}
