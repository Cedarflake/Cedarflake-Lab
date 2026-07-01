import { useEffect, useRef } from "react"

import type { PlayerInput } from "@/shared/types"

const initialInput: PlayerInput = {
  steer: 0,
  throttle: 0,
  brake: 0,
  isDrifting: false,
}

export function useInput() {
  const inputRef = useRef<PlayerInput>({ ...initialInput })
  const keysRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    function updateInput() {
      const keys = keysRef.current
      const steerLeft = keys.has("arrowleft") || keys.has("a")
      const steerRight = keys.has("arrowright") || keys.has("d")
      const throttle = keys.has("arrowup") || keys.has("w")
      const brake = keys.has("arrowdown") || keys.has("s")

      inputRef.current = {
        steer: Number(steerRight) - Number(steerLeft),
        throttle: Number(throttle),
        brake: Number(brake),
        isDrifting: keys.has(" ") || keys.has("shift"),
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      keysRef.current.add(event.key.toLowerCase())
      updateInput()
    }

    function handleKeyUp(event: KeyboardEvent) {
      keysRef.current.delete(event.key.toLowerCase())
      updateInput()
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    }
  }, [])

  return inputRef
}
