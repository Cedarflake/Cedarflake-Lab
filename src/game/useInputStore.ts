import { create } from "zustand"

import type { PlayerInput } from "@/shared/types"

const emptyInput: PlayerInput = {
  steer: 0,
  throttle: 0,
  brake: 0,
  isDrifting: false,
}

interface InputState {
  keyboardInput: PlayerInput
  touchInput: PlayerInput
  setKeyboardInput: (input: PlayerInput) => void
  setTouchInput: (input: Partial<PlayerInput>) => void
  resetKeyboardInput: () => void
  resetTouchInput: () => void
}

export const useInputStore = create<InputState>((set) => ({
  keyboardInput: emptyInput,
  touchInput: emptyInput,
  setKeyboardInput: (input) => set({ keyboardInput: input }),
  setTouchInput: (input) =>
    set((state) => ({
      touchInput: {
        ...state.touchInput,
        ...input,
      },
    })),
  resetKeyboardInput: () => set({ keyboardInput: emptyInput }),
  resetTouchInput: () => set({ touchInput: emptyInput }),
}))
