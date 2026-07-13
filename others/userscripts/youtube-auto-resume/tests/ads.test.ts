import assert from "node:assert/strict"
import test from "node:test"

import {
  createAdSkipper,
  findSkipAdButton,
  getAdUiSnapshot,
} from "../src/youtube/ads.ts"
import type { ActiveYouTubePlayerContext } from "../src/youtube/player.ts"
import { asElement, FakeDocument, FakeElement } from "./youtubeTestDom.ts"

function createContext(
  player: FakeElement,
  video: FakeElement,
): ActiveYouTubePlayerContext {
  return {
    player: asElement(player),
    video: asElement(video) as HTMLVideoElement,
  }
}

test("ad lookup skips hidden and disabled candidates", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const hiddenButton = new FakeElement(documentRef)
  const disabledButton = new FakeElement(documentRef)
  const visibleButton = new FakeElement(documentRef)

  hiddenButton.style.display = "none"
  disabledButton.disabled = true
  player.append(hiddenButton)
  player.append(disabledButton)
  player.append(visibleButton)
  player.queryResults = [hiddenButton, disabledButton, visibleButton]

  assert.equal(findSkipAdButton(asElement(player)), visibleButton)
})

test("ad lookup rejects controls hidden by an ancestor", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const hiddenContainer = new FakeElement(documentRef)
  const hiddenButton = new FakeElement(documentRef)
  const visibleButton = new FakeElement(documentRef)

  hiddenContainer.style.opacity = "0"
  player.append(hiddenContainer)
  hiddenContainer.append(hiddenButton)
  player.append(visibleButton)
  player.queryResults = [hiddenButton, visibleButton]

  assert.equal(findSkipAdButton(asElement(player)), visibleButton)
})

for (const [name, block] of [
  ["aria-hidden", (element: FakeElement) => element.setAttribute("aria-hidden", "true")],
  ["inert", (element: FakeElement) => element.setAttribute("inert", "")],
  ["opacity", (element: FakeElement) => { element.style.opacity = "0" }],
  ["pointer-events", (element: FakeElement) => { element.style.pointerEvents = "none" }],
] as const) {
  test(`ad lookup rejects a player hidden by outer ${name}`, () => {
    const documentRef = new FakeDocument()
    const outer = new FakeElement(documentRef)
    const player = new FakeElement(documentRef)
    const button = new FakeElement(documentRef)

    block(outer)
    outer.append(player)
    player.append(button)
    player.queryResults = [button]

    assert.equal(findSkipAdButton(asElement(player)), null)
  })
}

test("ad lookup promotes matched text to its interactive control", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const button = new FakeElement(documentRef, { control: true })
  const label = new FakeElement(documentRef)

  player.append(button)
  button.append(label)
  player.queryResults = [label]

  assert.equal(findSkipAdButton(asElement(player)), button)
})

test("ad skipper only searches the injected active player", () => {
  const documentRef = new FakeDocument()
  const inactivePlayer = new FakeElement(documentRef)
  const activePlayer = new FakeElement(documentRef)
  const inactiveButton = new FakeElement(documentRef)
  const video = new FakeElement(documentRef)

  inactivePlayer.append(inactiveButton)
  inactivePlayer.queryResults = [inactiveButton]

  const skipper = createAdSkipper({
    getPlayerContext: () => createContext(activePlayer, video),
    getSettings: () => ({ autoSkipAds: true }),
  })

  assert.equal(skipper.trySkipAdsIfPossible().acted, false)
  assert.equal(inactiveButton.clickCount, 0)
})

test("forced skip bypasses cooldown while automatic attempts remain throttled", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const button = new FakeElement(documentRef)
  const video = new FakeElement(documentRef)

  player.append(button)
  player.queryResults = [button]

  const skipper = createAdSkipper({
    cooldownMs: 1200,
    getPlayerContext: () => createContext(player, video),
    getSettings: () => ({ autoSkipAds: true }),
    now: () => 1000,
  })

  assert.equal(skipper.trySkipAdsIfPossible().acted, true)
  assert.equal(skipper.trySkipAdsIfPossible().acted, false)
  assert.equal(skipper.trySkipAdsIfPossible({ force: true }).acted, true)
  assert.equal(button.clickCount, 2)
})

test("button click remains the first action for a seekable ad", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const button = new FakeElement(documentRef)
  const video = new FakeElement(documentRef)

  player.classList.add("ad-showing")
  player.append(button)
  player.queryResults = [button]
  video.duration = 30
  video.seekRanges = [[0, 30]]

  const result = createAdSkipper({
    getPlayerContext: () => createContext(player, video),
    getSettings: () => ({ autoSkipAds: true }),
  }).trySkipAdsIfPossible()

  assert.equal(result.acted, true)
  assert.equal(result.recheckAfterMs, 750)
  assert.equal(button.clickCount, 1)
  assert.equal(video.currentTime, 0)
})

test("ignored button falls back to seeking on the next ad check", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const button = new FakeElement(documentRef)
  const video = new FakeElement(documentRef)
  let currentTime = 1000

  player.classList.add("ad-showing")
  player.append(button)
  player.queryResults = [button]
  video.duration = 30
  video.seekRanges = [[0, 30]]

  const skipper = createAdSkipper({
    getPlayerContext: () => createContext(player, video),
    getSettings: () => ({ autoSkipAds: true }),
    now: () => currentTime,
  })

  assert.equal(skipper.trySkipAdsIfPossible().acted, true)
  player.queryResults = []
  currentTime += 750

  assert.equal(skipper.trySkipAdsIfPossible().acted, true)
  assert.equal(button.clickCount, 1)
  assert.ok(video.currentTime > 29.9)
})

test("seekable ad without buttons advances to its end", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const video = new FakeElement(documentRef)

  player.classList.add("ad-interrupting")
  video.duration = 15
  video.seekRanges = [[0, 15]]

  const result = createAdSkipper({
    getPlayerContext: () => createContext(player, video),
    getSettings: () => ({ autoSkipAds: true }),
  }).trySkipAdsIfPossible()

  assert.equal(result.acted, true)
  assert.ok(video.currentTime > 14.9)
})

test("non-ad media is never seeked even when force is used", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const video = new FakeElement(documentRef)

  video.duration = 120
  video.seekRanges = [[0, 120]]

  const result = createAdSkipper({
    getPlayerContext: () => createContext(player, video),
    getSettings: () => ({ autoSkipAds: false }),
  }).trySkipAdsIfPossible({ force: true })

  assert.equal(result.acted, false)
  assert.equal(video.currentTime, 0)
})

test("ad hidden by an outer owner is never seeked", () => {
  const documentRef = new FakeDocument()
  const outer = new FakeElement(documentRef)
  const player = new FakeElement(documentRef)
  const video = new FakeElement(documentRef)

  outer.setAttribute("aria-hidden", "true")
  outer.append(player)
  player.classList.add("ad-showing")
  player.append(video)
  video.duration = 30
  video.seekRanges = [[0, 30]]

  const result = createAdSkipper({
    getPlayerContext: () => createContext(player, video),
    getSettings: () => ({ autoSkipAds: true }),
  }).trySkipAdsIfPossible()

  assert.equal(result.acted, false)
  assert.equal(video.currentTime, 0)
})

test("ad without a seekable range is not seeked", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const video = new FakeElement(documentRef)

  player.classList.add("ad-showing")
  video.duration = 30

  const result = createAdSkipper({
    getPlayerContext: () => createContext(player, video),
    getSettings: () => ({ autoSkipAds: true }),
  }).trySkipAdsIfPossible()

  assert.equal(result.acted, false)
  assert.equal(video.currentTime, 0)
})

for (const duration of [Number.NaN, Number.POSITIVE_INFINITY]) {
  test(`ad with ${String(duration)} duration is not seeked`, () => {
    const documentRef = new FakeDocument()
    const player = new FakeElement(documentRef)
    const video = new FakeElement(documentRef)

    player.classList.add("ad-showing")
    video.duration = duration
    video.seekRanges = [[0, 30]]

    const result = createAdSkipper({
      getPlayerContext: () => createContext(player, video),
      getSettings: () => ({ autoSkipAds: true }),
    }).trySkipAdsIfPossible()

    assert.equal(result.acted, false)
    assert.equal(video.currentTime, 0)
  })
}

test("manual force can seek an explicit ad when automatic skipping is disabled", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const video = new FakeElement(documentRef)

  player.classList.add("ad-showing")
  video.duration = 20
  video.seekRanges = [[0, 20]]

  const result = createAdSkipper({
    getPlayerContext: () => createContext(player, video),
    getSettings: () => ({ autoSkipAds: false }),
  }).trySkipAdsIfPossible({ force: true })

  assert.equal(result.acted, true)
  assert.ok(video.currentTime > 19.9)
})

test("manual button attempt completes its scheduled fallback while auto is disabled", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const button = new FakeElement(documentRef)
  const video = new FakeElement(documentRef)
  let currentTime = 1000

  player.classList.add("ad-showing")
  player.append(button)
  player.queryResults = [button]
  video.duration = 30
  video.seekRanges = [[0, 30]]

  const skipper = createAdSkipper({
    getPlayerContext: () => createContext(player, video),
    getSettings: () => ({ autoSkipAds: false }),
    now: () => currentTime,
  })
  const manualResult = skipper.trySkipAdsIfPossible({ force: true })

  assert.equal(manualResult.acted, true)
  assert.equal(manualResult.recheckAfterMs, 750)
  assert.equal(button.clickCount, 1)

  player.queryResults = []
  currentTime += 750

  assert.equal(skipper.trySkipAdsIfPossible().acted, true)
  assert.ok(video.currentTime > 29.9)
})

test("disabled pending attempt cannot cross into a replacement video", () => {
  const documentRef = new FakeDocument()
  const firstPlayer = new FakeElement(documentRef)
  const firstButton = new FakeElement(documentRef)
  const firstVideo = new FakeElement(documentRef)
  const secondPlayer = new FakeElement(documentRef)
  const secondButton = new FakeElement(documentRef)
  const secondVideo = new FakeElement(documentRef)
  let currentContext = createContext(firstPlayer, firstVideo)
  let currentTime = 1000

  firstPlayer.classList.add("ad-showing")
  firstPlayer.append(firstButton)
  firstPlayer.queryResults = [firstButton]
  firstVideo.duration = 30
  firstVideo.seekRanges = [[0, 30]]
  secondPlayer.classList.add("ad-showing")
  secondPlayer.append(secondButton)
  secondPlayer.queryResults = [secondButton]
  secondVideo.duration = 45
  secondVideo.seekRanges = [[0, 45]]

  const skipper = createAdSkipper({
    getPlayerContext: () => currentContext,
    getSettings: () => ({ autoSkipAds: false }),
    now: () => currentTime,
  })

  assert.equal(
    skipper.trySkipAdsIfPossible({ force: true }).acted,
    true,
  )

  currentContext = createContext(secondPlayer, secondVideo)
  currentTime += 750

  assert.equal(skipper.trySkipAdsIfPossible().acted, false)
  assert.equal(secondButton.clickCount, 0)
  assert.equal(secondVideo.currentTime, 0)
})

test("disabled automatic skipping does nothing without a manual pending attempt", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const video = new FakeElement(documentRef)

  player.classList.add("ad-showing")
  video.duration = 30
  video.seekRanges = [[0, 30]]

  const result = createAdSkipper({
    getPlayerContext: () => createContext(player, video),
    getSettings: () => ({ autoSkipAds: false }),
  }).trySkipAdsIfPossible()

  assert.equal(result.acted, false)
  assert.equal(result.recheckAfterMs, null)
  assert.equal(video.currentTime, 0)
})

test("ad snapshot uses the injected active player context", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const button = new FakeElement(documentRef)
  const video = new FakeElement(documentRef)

  player.append(button)
  player.queryResults = [button]

  assert.deepEqual(
    getAdUiSnapshot({
      getPlayerContext: () => createContext(player, video),
    }),
    {
      canCloseAdOverlay: true,
      canSkipAd: true,
    },
  )
})

test("ad snapshot reports a safe seek fallback as skippable", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const video = new FakeElement(documentRef)

  player.classList.add("ad-showing")
  video.duration = 10
  video.seekRanges = [[0, 10]]

  assert.equal(
    getAdUiSnapshot({
      getPlayerContext: () => createContext(player, video),
    }).canSkipAd,
    true,
  )
})
