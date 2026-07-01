import { create } from "zustand"

import type { PlayerInput } from "@/shared/types"

const emptyInput: PlayerInput = {
  steer: 0,
  throttle: 0,
  brake: 0,
  isDrifting: false,
}

interface InputState {
  input: PlayerInput
  setInput: (input: Partial<PlayerInput>) => void
  resetInput: () => void
}

export const useInputStore = create<InputState>((set) => ({
  input: emptyInput,
  setInput: (input) =>
    set((state) => ({
      input: {
        ...state.input,
        ...input,
      },
    })),
  resetInput: () => set({ input: emptyInput }),
}))
