import { useEffect, useState } from "react"

type ImageLoadState = "loading" | "ready" | "error"

interface ImageLoadResult {
  src: string
  state: ImageLoadState
}

export function useImageLoadState(src: string): ImageLoadState {
  const [result, setResult] = useState<ImageLoadResult>({ src, state: "loading" })

  useEffect(() => {
    let isActive = true
    let isSettled = false
    const image = new Image()

    image.decoding = "async"

    function finish(state: ImageLoadState) {
      if (!isActive || isSettled) {
        return
      }

      isSettled = true
      setResult({ src, state })
    }

    async function decodeImage() {
      if (typeof image.decode === "function") {
        try {
          await image.decode()
        } catch {
          // A loaded image remains usable when an optional async decode rejects.
        }
      }

      finish(image.naturalWidth > 0 ? "ready" : "error")
    }

    function handleLoad() {
      void decodeImage()
    }

    function handleError() {
      finish("error")
    }

    image.addEventListener("load", handleLoad)
    image.addEventListener("error", handleError)
    image.src = src

    if (image.complete) {
      if (image.naturalWidth > 0) {
        handleLoad()
      } else {
        handleError()
      }
    }

    return () => {
      isActive = false
      image.removeEventListener("load", handleLoad)
      image.removeEventListener("error", handleError)
    }
  }, [src])

  return result.src === src ? result.state : "loading"
}
