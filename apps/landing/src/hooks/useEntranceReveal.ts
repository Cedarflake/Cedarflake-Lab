import { useEffect, useRef } from "react"

const styleReadinessProperty = "--landing-style-readiness"

export function useEntranceReveal() {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current

    if (!root) {
      return
    }

    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"))
    let observer: IntersectionObserver | null = null
    let readinessFrame: number | null = null
    let revealFrame: number | null = null
    let isDisposed = false

    function revealAll() {
      for (const target of targets) {
        target.dataset["revealState"] = "visible"
      }
    }

    function startReveal() {
      if (isDisposed) {
        return
      }

      if (
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        typeof IntersectionObserver === "undefined"
      ) {
        revealAll()
        return
      }

      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) {
              continue
            }

            const target = entry.target as HTMLElement
            target.dataset["revealState"] = "visible"
            observer?.unobserve(target)
          }
        },
        {
          rootMargin: "0px 0px -48px 0px",
          threshold: 0,
        },
      )

      for (const target of targets) {
        observer.observe(target)
      }
    }

    function waitForStyles() {
      if (isDisposed) {
        return
      }

      const readiness = getComputedStyle(document.documentElement)
        .getPropertyValue(styleReadinessProperty)
        .trim()

      if (readiness !== "ready") {
        readinessFrame = requestAnimationFrame(waitForStyles)
        return
      }

      revealFrame = requestAnimationFrame(startReveal)
    }

    readinessFrame = requestAnimationFrame(waitForStyles)

    return () => {
      isDisposed = true

      if (readinessFrame !== null) {
        cancelAnimationFrame(readinessFrame)
      }

      if (revealFrame !== null) {
        cancelAnimationFrame(revealFrame)
      }

      observer?.disconnect()
    }
  }, [])

  return rootRef
}
