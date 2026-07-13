import {
  DEFAULT_SETTINGS,
  type YouTubeAutoResumeSettings,
} from "../core/settings.ts"
import {
  resolveActivePlayerContext,
  type YouTubePlayerContextResolver,
  type YouTubePlayerElement,
} from "./player.ts"

const SKIP_AD_SELECTOR = [
  ".ytp-ad-skip-button-modern",
  ".ytp-ad-skip-button",
  ".ytp-ad-skip-button-slot button",
  ".ytp-skip-ad-button",
  ".videoAdUiSkipButton",
  ".ytp-ad-text.ytp-ad-skip-button-text",
  "button[class*=\"skip-ad\"]",
].join(", ")

const AD_OVERLAY_CLOSE_SELECTOR = [
  ".ytp-ad-overlay-close-button",
  "button[class*=\"overlay-close\"]",
].join(", ")

const DEFAULT_COOLDOWN_MS = 750
const SEEK_END_MARGIN_SECONDS = 0.05

export interface AdUiSnapshot {
  canSkipAd: boolean
  canCloseAdOverlay: boolean
}

export interface AdSkipperOptions {
  getSettings?: () => Pick<YouTubeAutoResumeSettings, "autoSkipAds">
  getPlayerContext?: YouTubePlayerContextResolver
  onAction?: (message: string) => void
  document?: Document
  cooldownMs?: number
  now?: () => number
}

export interface AdUiSnapshotOptions {
  getPlayerContext?: YouTubePlayerContextResolver
  document?: Document
}

export interface AdSkipAttemptOptions {
  force?: boolean
}

export interface AdSkipResult {
  acted: boolean
  recheckAfterMs: number | null
}

export interface AdSkipper {
  trySkipAdsIfPossible(options?: AdSkipAttemptOptions): AdSkipResult
}

function isDisabled(element: HTMLElement): boolean {
  return (
    element.getAttribute("aria-disabled") === "true"
    || ("disabled" in element && Boolean(element.disabled))
  )
}

function hasInteractionBlocker(
  element: Element,
): boolean {
  const view = element.ownerDocument.defaultView

  if (!view) {
    return true
  }

  let current: Element | null = element

  while (current) {
    const style = view.getComputedStyle(current)

    if (
      current.hasAttribute("hidden")
      || current.hasAttribute("inert")
      || current.getAttribute("aria-disabled") === "true"
      || current.getAttribute("aria-hidden") === "true"
      || ("disabled" in current && Boolean(current.disabled))
      || style.display === "none"
      || style.visibility === "hidden"
      || style.visibility === "collapse"
      || Number(style.opacity) === 0
      || style.pointerEvents === "none"
    ) {
      return true
    }

    current = current.parentElement
  }

  return false
}

function findInteractiveElement(
  root: YouTubePlayerElement,
  selector: string,
): HTMLElement | null {
  const elements = Array.from(root.querySelectorAll<HTMLElement>(selector))

  for (const candidate of elements) {
    const closestControl = candidate.closest<HTMLElement>(
      "button, [role=\"button\"]",
    )
    const element = closestControl && root.contains(closestControl)
      ? closestControl
      : candidate

    if (
      typeof element.click === "function"
      && !isDisabled(element)
      && isElementVisible(element)
    ) {
      return element
    }
  }

  return null
}

export function findSkipAdButton(
  player: YouTubePlayerElement,
): HTMLElement | null {
  return findInteractiveElement(player, SKIP_AD_SELECTOR)
}

export function findAdOverlayCloseButton(
  player: YouTubePlayerElement,
): HTMLElement | null {
  return findInteractiveElement(player, AD_OVERLAY_CLOSE_SELECTOR)
}

export function isElementVisible(
  element: Element | null,
): boolean {
  if (!element) {
    return false
  }

  if (
    !element.isConnected
    || hasInteractionBlocker(element)
  ) {
    return false
  }

  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function isPlayerShowingAd(player: YouTubePlayerElement): boolean {
  return (
    player.classList.contains("ad-showing")
    || player.classList.contains("ad-interrupting")
  )
}

function getAdSeekTarget(
  context: ReturnType<YouTubePlayerContextResolver>,
): number | null {
  if (!context || !isPlayerShowingAd(context.player)) {
    return null
  }

  if (
    !isElementVisible(context.player)
    || !isElementVisible(context.video)
  ) {
    return null
  }

  const { video } = context
  const duration = video.duration

  if (!Number.isFinite(duration) || duration <= 0) {
    return null
  }

  try {
    const seekable = video.seekable

    if (seekable.length === 0) {
      return null
    }

    const rangeIndex = seekable.length - 1
    const rangeStart = seekable.start(rangeIndex)
    const rangeEnd = Math.min(duration, seekable.end(rangeIndex))
    const rangeLength = rangeEnd - rangeStart

    if (
      !Number.isFinite(rangeStart)
      || !Number.isFinite(rangeEnd)
      || rangeLength <= 0
    ) {
      return null
    }

    const margin = Math.min(SEEK_END_MARGIN_SECONDS, rangeLength / 2)
    const target = Math.max(rangeStart, rangeEnd - margin)

    if (
      !Number.isFinite(target)
      || target <= 0
      || (Number.isFinite(video.currentTime) && target <= video.currentTime)
    ) {
      return null
    }

    return target
  } catch {
    return null
  }
}

function seekAdToEnd(
  context: ReturnType<YouTubePlayerContextResolver>,
): boolean {
  const target = getAdSeekTarget(context)

  if (target === null || !context) {
    return false
  }

  try {
    context.video.currentTime = target
    return true
  } catch {
    return false
  }
}

export function getAdUiSnapshot(
  options: AdUiSnapshotOptions = {},
): AdUiSnapshot {
  const context = (
    options.getPlayerContext
    ?? (() => resolveActivePlayerContext(options.document ?? document))
  )()

  if (!context) {
    return {
      canSkipAd: false,
      canCloseAdOverlay: false,
    }
  }

  return {
    canSkipAd:
      findSkipAdButton(context.player) !== null
      || getAdSeekTarget(context) !== null,
    canCloseAdOverlay: findAdOverlayCloseButton(context.player) !== null,
  }
}

export function createAdSkipper(options: AdSkipperOptions = {}): AdSkipper {
  const getSettings =
    options.getSettings ??
    (() => ({ autoSkipAds: DEFAULT_SETTINGS.autoSkipAds }))
  const onAction = options.onAction ?? (() => undefined)
  const getPlayerContext =
    options.getPlayerContext
    ?? (() => resolveActivePlayerContext(options.document ?? document))
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS
  const getNow = options.now ?? Date.now
  let lastAdActionAt = Number.NEGATIVE_INFINITY
  let canContinueDisabledPending = false
  let pendingSeekVideo: HTMLVideoElement | null = null

  function clearPendingSeek(): void {
    canContinueDisabledPending = false
    pendingSeekVideo = null
  }

  function createResult(
    acted: boolean,
    recheckAfterMs: number | null = null,
  ): AdSkipResult {
    return { acted, recheckAfterMs }
  }

  function trySkipAdsIfPossible(
    attemptOptions: AdSkipAttemptOptions = {},
  ): AdSkipResult {
    const force = Boolean(attemptOptions.force)
    const settings = getSettings()
    const isDisabledPendingContinuation = (
      !settings.autoSkipAds
      && !force
      && canContinueDisabledPending
      && pendingSeekVideo !== null
    )

    if (!settings.autoSkipAds && !force && !isDisabledPendingContinuation) {
      clearPendingSeek()
      return createResult(false)
    }

    const currentTime = getNow()
    const cooldownRemaining = cooldownMs - (currentTime - lastAdActionAt)

    if (!force && cooldownRemaining > 0) {
      return createResult(false, cooldownRemaining)
    }

    const context = getPlayerContext()

    if (!context) {
      clearPendingSeek()

      if (force) {
        onAction("手动跳过：未检测到正在播放的广告")
      }

      return createResult(false)
    }

    if (pendingSeekVideo && pendingSeekVideo !== context.video) {
      clearPendingSeek()

      if (!settings.autoSkipAds && !force) {
        return createResult(false)
      }
    }

    const isShowingAd = isPlayerShowingAd(context.player)

    if (!isShowingAd) {
      clearPendingSeek()
    }

    if (
      !settings.autoSkipAds
      && !force
      && !canContinueDisabledPending
    ) {
      return createResult(false)
    }

    if (pendingSeekVideo === context.video && seekAdToEnd(context)) {
      clearPendingSeek()
      lastAdActionAt = currentTime
      onAction("跳过按钮未生效，已将广告推进到末尾")
      return createResult(true)
    }

    if (isDisabledPendingContinuation) {
      return createResult(false, isShowingAd ? cooldownMs : null)
    }

    const skipButton = findSkipAdButton(context.player)

    if (skipButton) {
      skipButton.click()
      pendingSeekVideo = context.video
      canContinueDisabledPending = force && !settings.autoSkipAds
      lastAdActionAt = currentTime
      onAction("检测到可跳过广告，已点击“跳过”")
      return createResult(true, cooldownMs)
    }

    const overlayCloseButton = findAdOverlayCloseButton(context.player)

    if (overlayCloseButton) {
      overlayCloseButton.click()
      lastAdActionAt = currentTime
      onAction("检测到广告遮罩，已点击关闭")
      return createResult(true)
    }

    if (seekAdToEnd(context)) {
      clearPendingSeek()
      lastAdActionAt = currentTime
      onAction("检测到无法点击的广告，已将广告推进到末尾")
      return createResult(true)
    }

    if (force) {
      onAction("手动跳过：未检测到正在播放的广告")
    }

    if (force && !settings.autoSkipAds && isShowingAd) {
      pendingSeekVideo = context.video
      canContinueDisabledPending = true
    }

    return createResult(false, isShowingAd ? cooldownMs : null)
  }

  return { trySkipAdsIfPossible }
}
