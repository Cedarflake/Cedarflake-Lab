import assert from "node:assert/strict"
import test from "node:test"
import { resolve } from "node:path"

import { chromium, type Locator, type Page } from "playwright"

const projectDirectory = resolve(import.meta.dirname, "..")
const userscriptPath = resolve(
  projectDirectory,
  "dist/youtube-auto-resume.user.js",
)

interface VideoFixtureState {
  paused: boolean
  playCalls: number
  resolvePlay: (() => void) | null
}

async function installVideoFixture(
  video: Locator,
  shouldHoldPlay: boolean,
): Promise<void> {
  await video.evaluate((element, holdPlay) => {
    const videoElement = element as HTMLVideoElement
    const state: VideoFixtureState = {
      paused: true,
      playCalls: 0,
      resolvePlay: null,
    }

    Object.defineProperties(videoElement, {
      currentTime: {
        configurable: true,
        get: () => 10,
      },
      ended: {
        configurable: true,
        get: () => false,
      },
      paused: {
        configurable: true,
        get: () => state.paused,
      },
      readyState: {
        configurable: true,
        get: () => 4,
      },
    })
    videoElement.play = () => {
      state.playCalls += 1

      return new Promise<void>((resolvePlay) => {
        const finish = (): void => {
          state.paused = false
          state.resolvePlay = null
          videoElement.dispatchEvent(new Event("play"))
          resolvePlay()
        }

        if (holdPlay) {
          state.resolvePlay = finish
        } else {
          finish()
        }
      })
    }
    Reflect.set(videoElement, "runtimeFixtureState", state)
  }, shouldHoldPlay)
}

async function getPlayCalls(video: Locator): Promise<number> {
  return video.evaluate((element) => {
    const state = Reflect.get(element, "runtimeFixtureState") as
      | VideoFixtureState
      | undefined

    return state?.playCalls ?? 0
  })
}

async function resolvePendingPlay(page: Page): Promise<void> {
  await page.evaluate(() => {
    const element = Reflect.get(window, "pendingRuntimeVideo") as
      | HTMLVideoElement
      | undefined

    if (!element) {
      throw new Error("pending runtime video missing")
    }

    const state = Reflect.get(element, "runtimeFixtureState") as
      | VideoFixtureState
      | undefined

    state?.resolvePlay?.()
  })
}

async function openFixture(page: Page, pathname: string): Promise<void> {
  await page.route("https://www.youtube.com/**", async (route) => {
    await route.fulfill({
      body: `<!doctype html>
        <html lang="zh-CN">
          <body>
            <ytd-watch-flexy>
              <main id="movie_player" class="html5-video-player">
                <video id="primary-video" class="html5-main-video"></video>
              </main>
            </ytd-watch-flexy>
          </body>
        </html>`,
      contentType: "text/html",
      status: 200,
    })
  })
  await page.goto(`https://www.youtube.com${pathname}`)
  await page.evaluate(() => {
    localStorage.setItem(
      "autoChick.ytAutoResume.settings",
      JSON.stringify({
        autoSkipAds: false,
        avoidEnded: true,
        avoidTyping: true,
        collapsed: true,
        enabled: true,
        intervalMs: 10_000,
        minPausedSeconds: 0.5,
      }),
    )
  })
}

test("homepage previews are ignored by the runtime", async () => {
  const browser = await chromium.launch({ headless: true })

  try {
    const page = await browser.newPage()
    await openFixture(page, "/")
    const video = page.locator("#primary-video")
    await installVideoFixture(video, false)
    await page.addScriptTag({ path: userscriptPath })
    await page.waitForTimeout(700)

    assert.equal(await getPlayCalls(video), 0)
  } finally {
    await browser.close()
  }
})

test("scheduled loop resolves the active player once", async () => {
  const browser = await chromium.launch({ headless: true })

  try {
    const page = await browser.newPage()
    await openFixture(page, "/watch?v=single-resolution")
    await page.evaluate(() => {
      const querySelectorAll = document.querySelectorAll.bind(document)
      Reflect.set(window, "activePlayerQueryCount", 0)
      Reflect.set(document, "querySelectorAll", (selector: string) => {
        if (selector === "#movie_player, .html5-video-player") {
          const count = Number(
            Reflect.get(window, "activePlayerQueryCount") ?? 0,
          )
          Reflect.set(window, "activePlayerQueryCount", count + 1)
        }

        return querySelectorAll(selector)
      })
    })
    await page.addScriptTag({ path: userscriptPath })
    await page.waitForFunction(() => (
      Number(Reflect.get(window, "activePlayerQueryCount") ?? 0) >= 1
    ))
    await page.waitForTimeout(100)

    assert.equal(
      await page.evaluate(() => (
        Number(Reflect.get(window, "activePlayerQueryCount") ?? 0)
      )),
      1,
    )
  } finally {
    await browser.close()
  }
})

test("ignored ad button is rechecked before the normal interval", async () => {
  const browser = await chromium.launch({ headless: true })

  try {
    const page = await browser.newPage()
    await openFixture(page, "/watch?v=ad-recheck")
    await page.evaluate(() => {
      const key = "autoChick.ytAutoResume.settings"
      const settings = JSON.parse(localStorage.getItem(key) ?? "{}") as
        Record<string, unknown>
      localStorage.setItem(
        key,
        JSON.stringify({ ...settings, autoSkipAds: true }),
      )

      const player = document.querySelector("#movie_player")
      const video = document.querySelector("#primary-video")

      if (!(player instanceof HTMLElement) || !(video instanceof HTMLVideoElement)) {
        throw new TypeError("ad recheck fixture is incomplete")
      }

      const skipButton = document.createElement("button")
      skipButton.className = "ytp-ad-skip-button-modern"
      skipButton.textContent = "Skip"
      player.classList.add("ad-showing")
      player.appendChild(skipButton)
      Reflect.set(window, "adSkipClickCount", 0)
      Reflect.set(window, "adSeekTime", 0)
      skipButton.addEventListener("click", () => {
        const count = Number(Reflect.get(window, "adSkipClickCount") ?? 0)
        Reflect.set(window, "adSkipClickCount", count + 1)
      })
      Object.defineProperties(video, {
        currentTime: {
          configurable: true,
          get: () => Number(Reflect.get(window, "adSeekTime") ?? 0),
          set: (value: number) => Reflect.set(window, "adSeekTime", value),
        },
        duration: {
          configurable: true,
          get: () => 15,
        },
        seekable: {
          configurable: true,
          get: () => ({
            end: () => 15,
            length: 1,
            start: () => 0,
          }),
        },
      })
    })
    await page.addScriptTag({ path: userscriptPath })
    await page.waitForFunction(() => (
      Number(Reflect.get(window, "adSeekTime") ?? 0) >= 14
    ), null, { timeout: 5_000 })

    assert.deepEqual(
      await page.evaluate(() => ({
        clickCount: Number(Reflect.get(window, "adSkipClickCount") ?? 0),
        seekTime: Number(Reflect.get(window, "adSeekTime") ?? 0),
      })),
      { clickCount: 1, seekTime: 14.95 },
    )
  } finally {
    await browser.close()
  }
})

test("SPA replacement resets pause timing and invalidates an old play promise", async () => {
  const browser = await chromium.launch({ headless: true })

  try {
    const page = await browser.newPage()
    await openFixture(page, "/watch?v=first")
    const firstVideo = page.locator("#primary-video")
    await installVideoFixture(firstVideo, true)
    await page.addScriptTag({ path: userscriptPath })
    await page.waitForFunction(
      () => {
        const video = document.querySelector("#primary-video")
        const state = video
          ? Reflect.get(video, "runtimeFixtureState") as
              | VideoFixtureState
              | undefined
          : undefined
        return state?.playCalls === 1
      },
      undefined,
      { timeout: 3_000 },
    )
    await page.waitForTimeout(300)
    assert.equal(await getPlayCalls(firstVideo), 1)

    await page.evaluate(() => {
      document.dispatchEvent(new Event("yt-navigate-start"))
      history.pushState({}, "", "/watch?v=second")
      const player = document.querySelector("#movie_player")
      const firstVideoElement = document.querySelector("#primary-video")

      if (!player || !firstVideoElement) {
        throw new Error("fixture player or video missing")
      }

      Reflect.set(window, "pendingRuntimeVideo", firstVideoElement)
      player.replaceChildren()
      const secondVideo = document.createElement("video")
      secondVideo.id = "second-video"
      secondVideo.className = "html5-main-video"
      player.appendChild(secondVideo)
    })
    const secondVideo = page.locator("#second-video")
    await installVideoFixture(secondVideo, false)
    await page.evaluate(() => {
      document.dispatchEvent(new Event("yt-navigate-finish"))
    })
    await resolvePendingPlay(page)
    await page.waitForTimeout(200)

    assert.equal(await getPlayCalls(secondVideo), 0)
    const lastActionBeforeThreshold = await page
      .locator("#auto-chick-yt-auto-resume-host .last-action")
      .textContent()
    assert.doesNotMatch(lastActionBeforeThreshold ?? "", /已恢复播放/)

    await page.waitForFunction(
      () => {
        const video = document.querySelector("#second-video")
        const state = video
          ? Reflect.get(video, "runtimeFixtureState") as
              | VideoFixtureState
              | undefined
          : undefined
        return state?.playCalls === 1
      },
      undefined,
      { timeout: 3_000 },
    )
  } finally {
    await browser.close()
  }
})
