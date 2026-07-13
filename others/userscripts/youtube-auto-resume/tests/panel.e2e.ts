import assert from "node:assert/strict"
import test from "node:test"
import { resolve } from "node:path"

import { build } from "esbuild"
import { chromium } from "playwright"

import type { YouTubeAutoResumeApp } from "../src/app.ts"

const projectDirectory = resolve(import.meta.dirname, "..")
const userscriptPath = resolve(
  projectDirectory,
  "dist/youtube-auto-resume.user.js",
)
const hostId = "auto-chick-yt-auto-resume-host"

interface AppTestWindow extends Window {
  __playCount?: number
  __resolvePlay?: () => void
  __skipClickCount?: number
  __youtubeAutoResumeApp?: YouTubeAutoResumeApp
}

async function buildAppTestBundle(): Promise<string> {
  const result = await build({
    bundle: true,
    format: "iife",
    platform: "browser",
    stdin: {
      contents: `
        import { startYouTubeAutoResumeApp } from "./src/app.ts"
        window.__youtubeAutoResumeApp = startYouTubeAutoResumeApp()
      `,
      loader: "ts",
      resolveDir: projectDirectory,
    },
    target: ["chrome109", "firefox115"],
    write: false,
  })
  const output = result.outputFiles?.[0]

  if (!output) {
    throw new Error("esbuild did not produce the app test bundle")
  }

  return output.text
}

test("launcher remains visible and follows the active mount target", async () => {
  const browser = await chromium.launch({ headless: true })

  try {
    const context = await browser.newContext()
    await context.addInitScript(() => {
      localStorage.setItem(
        "autoChick.ytAutoResume.settings",
        JSON.stringify({
          collapsed: true,
          intervalMs: 10_000,
          showPanel: false,
        }),
      )
    })

    const page = await context.newPage()
    await page.route("https://www.youtube.com/**", async (route) => {
      await route.fulfill({
        body: `<!doctype html>
          <html lang="zh-CN">
            <body>
              <main id="movie_player" class="html5-video-player">
                <video class="html5-main-video"></video>
              </main>
            </body>
          </html>`,
        contentType: "text/html",
        status: 200,
      })
    })

    await page.goto("https://www.youtube.com/watch?v=panel-fixture")
    await page.addScriptTag({ path: userscriptPath })

    const host = page.locator(`#${hostId}`)
    await host.waitFor({ state: "attached" })
    await page.waitForTimeout(100)

    const launcher = page.getByRole("button", {
      name: "打开 YouTube Auto Resume 面板",
    })
    const closeButton = page.getByRole("button", { name: "最小化面板" })
    await launcher.waitFor({ state: "visible" })

    const launcherState = await launcher.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)

      return {
        height: rect.height,
        opacity: style.opacity,
        visibility: style.visibility,
        width: rect.width,
      }
    })

    assert.ok(launcherState.width >= 48)
    assert.ok(launcherState.height >= 48)
    assert.equal(launcherState.opacity, "1")
    assert.equal(launcherState.visibility, "visible")

    await launcher.click()
    await page.getByRole("dialog", { name: "YouTube Auto Resume" }).waitFor({
      state: "visible",
    })
    assert.match(
      await host.locator(".status").textContent() ?? "",
      /检测到活动视频：否/,
    )
    assert.equal(await launcher.isVisible(), false)
    assert.equal(
      await closeButton.evaluate((element) => {
        const root = element.getRootNode()
        return root instanceof ShadowRoot && root.activeElement === element
      }),
      true,
    )

    await page.keyboard.press("Tab")
    const enabledSwitch = page.getByRole("checkbox", { name: "自动恢复" })
    assert.equal(
      await enabledSwitch.evaluate((element) => {
        const root = element.getRootNode()
        return root instanceof ShadowRoot && root.activeElement === element
      }),
      true,
    )
    const switchFocusIndicator = await enabledSwitch.evaluate((element) => {
      const track = element.nextElementSibling

      if (!(track instanceof HTMLElement)) {
        return null
      }

      const style = getComputedStyle(track)
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      }
    })
    assert.deepEqual(switchFocusIndicator, {
      outlineStyle: "solid",
      outlineWidth: "2px",
    })
    assert.ok(await enabledSwitch.getAttribute("aria-describedby"))
    await page.getByRole("status").waitFor({ state: "attached" })

    await page.keyboard.press("Escape")
    await launcher.waitFor({ state: "visible" })
    assert.equal(
      await launcher.evaluate((element) => {
        const root = element.getRootNode()
        return root instanceof ShadowRoot && root.activeElement === element
      }),
      true,
    )

    await launcher.click()
    await page.getByRole("dialog", { name: "YouTube Auto Resume" }).waitFor({
      state: "visible",
    })

    const intervalInput = page.getByRole("spinbutton", { name: "检测间隔" })
    await intervalInput.focus()
    await intervalInput.evaluate((element) => {
      const input = element as HTMLInputElement
      input.value = "50"
      input.dispatchEvent(new Event("change", { bubbles: true }))
    })
    assert.equal(await intervalInput.inputValue(), "200")

    await enabledSwitch.focus()
    await page.evaluate(() => {
      const key = "autoChick.ytAutoResume.settings"
      const settings = JSON.parse(localStorage.getItem(key) ?? "{}") as
        Record<string, unknown>
      const value = JSON.stringify({ ...settings, collapsed: true })
      localStorage.setItem(key, value)
      window.dispatchEvent(new StorageEvent("storage", {
        key,
        newValue: value,
        storageArea: localStorage,
        url: location.href,
      }))
    })
    await launcher.waitFor({ state: "visible" })
    assert.equal(
      await launcher.evaluate((element) => {
        const root = element.getRootNode()
        return root instanceof ShadowRoot && root.activeElement === element
      }),
      true,
    )

    await launcher.click()
    await page.getByRole("dialog", { name: "YouTube Auto Resume" }).waitFor({
      state: "visible",
    })
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException("storage unavailable", "QuotaExceededError")
      }
    })
    await closeButton.click()
    await launcher.click()
    await page.waitForFunction(() => (
      document
        .getElementById("auto-chick-yt-auto-resume-host")
        ?.shadowRoot
        ?.querySelector(".last-action")
        ?.textContent
        ?.includes("面板显示状态已应用，但浏览器未能持久化") === true
    ))

    await host.evaluate((element) => element.remove())
    await page.waitForFunction(
      (id) => document.getElementById(id)?.isConnected === true,
      hostId,
    )

    await page.evaluate((id) => {
      const fullscreenTarget = document.createElement("section")
      fullscreenTarget.id = id
      document.body.appendChild(fullscreenTarget)
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        value: fullscreenTarget,
      })
      document.dispatchEvent(new Event("fullscreenchange"))
    }, "fixture-fullscreen-target")
    await page.waitForFunction(
      (id) => document.fullscreenElement?.querySelector(`#${id}`) !== null,
      hostId,
    )

    await page.evaluate(() => {
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        value: null,
      })
      document.dispatchEvent(new Event("fullscreenchange"))
    })
    await page.waitForFunction(
      (id) => document.body.querySelector(`#${id}`) !== null,
      hostId,
    )

    await context.close()
  } finally {
    await browser.close()
  }
})

test("stopped app remains terminal after pending and stale callbacks", async () => {
  const browser = await chromium.launch({ headless: true })

  try {
    const context = await browser.newContext()
    await context.addInitScript(() => {
      localStorage.setItem(
        "autoChick.ytAutoResume.settings",
        JSON.stringify({
          collapsed: false,
          intervalMs: 10_000,
          minPausedSeconds: 30,
        }),
      )
    })

    const page = await context.newPage()
    await page.route("https://www.youtube.com/**", async (route) => {
      await route.fulfill({
        body: `<!doctype html>
          <html lang="zh-CN">
            <body>
              <ytd-watch-flexy>
                <main id="movie_player" class="html5-video-player">
                  <video class="html5-main-video"></video>
                  <button class="ytp-ad-skip-button-modern">Skip</button>
                </main>
              </ytd-watch-flexy>
            </body>
          </html>`,
        contentType: "text/html",
        status: 200,
      })
    })

    await page.goto("https://www.youtube.com/watch?v=stop-fixture")
    await page.evaluate(() => {
      const testWindow = window as AppTestWindow
      const video = document.querySelector("video")
      const skipButton = document.querySelector(".ytp-ad-skip-button-modern")

      if (!(video instanceof HTMLVideoElement) || !(skipButton instanceof HTMLElement)) {
        throw new TypeError("stop fixture is incomplete")
      }

      testWindow.__playCount = 0
      testWindow.__skipClickCount = 0
      let resolvePlay: (() => void) | null = null

      Object.defineProperty(video, "play", {
        configurable: true,
        value: () => {
          testWindow.__playCount = (testWindow.__playCount ?? 0) + 1
          return new Promise<void>((resolvePromise) => {
            resolvePlay = resolvePromise
          })
        },
      })
      testWindow.__resolvePlay = () => resolvePlay?.()
      skipButton.addEventListener("click", () => {
        testWindow.__skipClickCount = (testWindow.__skipClickCount ?? 0) + 1
      })
    })
    await page.addScriptTag({ content: await buildAppTestBundle() })

    const host = page.locator(`#${hostId}`)
    await host.waitFor({ state: "attached" })

    const resumeButton = await page.getByRole("button", {
      name: "立即恢复",
    }).elementHandle()
    const skipButton = await page.getByRole("button", {
      name: "跳过广告",
    }).elementHandle()
    const enabledSwitch = await page.getByRole("checkbox", {
      name: "自动恢复",
    }).elementHandle()
    const staleFab = await host.locator(".fab").elementHandle()
    const staleCloseButton = await host.locator(".icon-button").elementHandle()

    assert.ok(resumeButton)
    assert.ok(skipButton)
    assert.ok(enabledSwitch)
    assert.ok(staleFab)
    assert.ok(staleCloseButton)

    await resumeButton.evaluate((element) => (element as HTMLElement).click())
    await page.waitForFunction(() => (
      (window as AppTestWindow).__playCount === 1
    ))
    const storedSettings = await page.evaluate(() => (
      localStorage.getItem("autoChick.ytAutoResume.settings")
    ))

    await page.evaluate(() => {
      const app = (window as AppTestWindow).__youtubeAutoResumeApp

      if (!app) {
        throw new TypeError("test app is unavailable")
      }

      const resolvePlay = (window as AppTestWindow).__resolvePlay
      app.stop()
      resolvePlay?.()
    })
    await page.waitForTimeout(0)

    await page.evaluate(() => {
      const app = (window as AppTestWindow).__youtubeAutoResumeApp

      if (!app) {
        throw new TypeError("test app is unavailable")
      }

      app.openPanel()
      app.resetSettings()
    })
    await resumeButton.evaluate((element) => (element as HTMLElement).click())
    await skipButton.evaluate((element) => (element as HTMLElement).click())
    await staleCloseButton.evaluate((element) => (
      element as HTMLElement
    ).click())
    await staleFab.evaluate((element) => (element as HTMLElement).click())
    await enabledSwitch.evaluate((element) => {
      const input = element as HTMLInputElement
      input.checked = false
      input.dispatchEvent(new Event("change", { bubbles: true }))
    })
    await page.waitForTimeout(0)

    assert.equal(await host.count(), 0)
    assert.deepEqual(
      await page.evaluate(() => {
        const testWindow = window as AppTestWindow

        return {
          playCount: testWindow.__playCount,
          settings: localStorage.getItem("autoChick.ytAutoResume.settings"),
          skipClickCount: testWindow.__skipClickCount,
        }
      }),
      {
        playCount: 1,
        settings: storedSettings,
        skipClickCount: 0,
      },
    )

    await context.close()
  } finally {
    await browser.close()
  }
})
