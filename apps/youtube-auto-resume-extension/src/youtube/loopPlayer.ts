import {
  getPlayerLoopVideo,
  isPlayerShowingAd,
  setPlayerLoopVideo,
  type YouTubePlayerElement,
} from "./player.ts"

export interface LoopPlayerController {
  setPlayer: (player: YouTubePlayerElement | null) => void
  stop: () => void
  sync: () => boolean
}

interface LoopPlayerControllerOptions {
  getEnabled: () => boolean
  onAdStateChange: (isShowingAd: boolean) => boolean
  onLoopReasserted: () => void
}

export function createLoopPlayerController(
  options: LoopPlayerControllerOptions,
): LoopPlayerController {
  let player: YouTubePlayerElement | null = null
  let originalLoopValue: boolean | null = null
  let wasShowingAd = false
  let isStopped = false

  const adObserver = new MutationObserver(handleAdStateChange)

  function release(): void {
    if (player && originalLoopValue !== null) {
      setPlayerLoopVideo(player, originalLoopValue)
    }

    originalLoopValue = null
  }

  function sync(): boolean {
    if (isStopped || !options.getEnabled() || !player) {
      release()
      return false
    }

    if (originalLoopValue === null) {
      originalLoopValue = getPlayerLoopVideo(player)

      if (originalLoopValue === null) {
        return false
      }
    }

    if (isPlayerShowingAd(player) || getPlayerLoopVideo(player) === true) {
      return false
    }

    return setPlayerLoopVideo(player, true)
  }

  function setPlayer(nextPlayer: YouTubePlayerElement | null): void {
    if (player === nextPlayer) {
      sync()
      return
    }

    adObserver.disconnect()
    release()
    player = nextPlayer
    wasShowingAd = Boolean(player && isPlayerShowingAd(player))

    if (!player) {
      return
    }

    adObserver.observe(player, {
      attributeFilter: ["class"],
      attributes: true,
    })

    if (wasShowingAd) {
      options.onAdStateChange(true)
    }

    sync()
  }

  function handleAdStateChange(): void {
    if (isStopped || !player) {
      return
    }

    const isShowingAd = isPlayerShowingAd(player)

    if (isShowingAd === wasShowingAd) {
      return
    }

    wasShowingAd = isShowingAd
    const shouldSync = options.onAdStateChange(isShowingAd)

    if (!isShowingAd && shouldSync && sync()) {
      options.onLoopReasserted()
    }
  }

  function stop(): void {
    if (isStopped) {
      return
    }

    isStopped = true
    adObserver.disconnect()
    release()
    player = null
  }

  return {
    setPlayer,
    stop,
    sync,
  }
}
