const USER_NAVIGATION_INTENT_TTL_MS = 30_000

interface NavigationIntent {
  expiresAt: number
  videoId: string | null
}

export interface LoopTargetController {
  configure: (enabled: boolean, currentVideoId: string | null) => void
  getTargetVideoId: () => string | null
  markUserNavigation: (videoId: string | null, now: number) => void
  resolveUnexpectedNavigation: (
    currentVideoId: string | null,
    now: number,
  ) => string | null
}

export function getWatchVideoId(url: string): string | null {
  try {
    const parsedUrl = new URL(url)
    const isYouTubeHost = parsedUrl.hostname === "youtube.com"
      || parsedUrl.hostname.endsWith(".youtube.com")

    if (!isYouTubeHost || parsedUrl.pathname !== "/watch") {
      return null
    }

    const videoId = parsedUrl.searchParams.get("v")?.trim() ?? ""
    return videoId || null
  } catch {
    return null
  }
}

export function createLoopTargetController(
  initialEnabled: boolean,
  initialVideoId: string | null,
): LoopTargetController {
  let isEnabled = initialEnabled
  let targetVideoId = initialEnabled ? initialVideoId : null
  let navigationIntent: NavigationIntent | null = null

  function configure(enabled: boolean, currentVideoId: string | null): void {
    if (!enabled) {
      isEnabled = false
      targetVideoId = null
      navigationIntent = null
      return
    }

    if (!isEnabled || !targetVideoId) {
      targetVideoId = currentVideoId
    }

    isEnabled = true
  }

  function markUserNavigation(videoId: string | null, now: number): void {
    if (!isEnabled) {
      return
    }

    navigationIntent = {
      expiresAt: now + USER_NAVIGATION_INTENT_TTL_MS,
      videoId,
    }
  }

  function resolveUnexpectedNavigation(
    currentVideoId: string | null,
    now: number,
  ): string | null {
    if (!isEnabled || !currentVideoId) {
      return null
    }

    if (!targetVideoId) {
      targetVideoId = currentVideoId
      navigationIntent = null
      return null
    }

    if (currentVideoId === targetVideoId) {
      if (navigationIntent?.videoId === currentVideoId) {
        navigationIntent = null
      }

      return null
    }

    const hasMatchingIntent = Boolean(
      navigationIntent
      && navigationIntent.expiresAt >= now
      && (
        navigationIntent.videoId === null
        || navigationIntent.videoId === currentVideoId
      ),
    )

    navigationIntent = null

    if (hasMatchingIntent) {
      targetVideoId = currentVideoId
      return null
    }

    return targetVideoId
  }

  return {
    configure,
    getTargetVideoId: () => targetVideoId,
    markUserNavigation,
    resolveUnexpectedNavigation,
  }
}
