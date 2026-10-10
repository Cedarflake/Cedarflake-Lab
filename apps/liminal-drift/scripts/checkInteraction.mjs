import { chromium, devices } from "playwright"

import { browserLaunchOptions } from "./browserLaunchOptions.mjs"
import { measureSceneDifference, screenshotCanvas } from "./browserVisualChecks.mjs"
import { checkBackgroundPause } from "./checkBackgroundPause.mjs"

const url = process.argv.find((value) => value.startsWith("http")) ?? "http://localhost:5173/"

/**
 * @param {string} baseUrl
 * @param {Record<string, string>} params
 */
function withSearchParams(baseUrl, params) {
  const nextUrl = new URL(baseUrl)

  for (const [key, value] of Object.entries(params)) {
    nextUrl.searchParams.set(key, value)
  }

  return nextUrl.toString()
}

/**
 * @param {string} text
 * @param {string} label
 */
function readMetric(text, label) {
  const match = text.match(new RegExp(`${label}\\s+(\\d+)`, "i"))
  return match ? Number(match[1]) : 0
}

/**
 * @param {import("playwright").Page} page
 * @param {string} label
 */
async function readProgressValue(page, label) {
  const value = Number(
    await page.getByRole("progressbar", { name: label }).getAttribute("aria-valuenow"),
  )

  if (!Number.isFinite(value)) {
    throw new Error(`Invalid progress value for ${label}`)
  }

  return value
}

/**
 * @param {import("playwright").Page} page
 * @param {number} limit
 */
async function waitForSpeedAbove(page, limit) {
  await page.waitForFunction(
    (speed) => Number(document.querySelector(".hud__metric--speed strong")?.textContent) > speed,
    limit,
    { timeout: 15000 },
  )
  return Number(await page.locator(".hud__metric--speed strong").textContent())
}

/**
 * @param {import("playwright").Page} page
 * @param {string} label
 * @param {number} timeoutMs
 */
async function waitForProgressAboveZero(page, label, timeoutMs) {
  const startedAt = Date.now()
  let value = 0

  while (Date.now() - startedAt < timeoutMs) {
    value = await readProgressValue(page, label)

    if (value > 0) {
      return value
    }

    await page.waitForTimeout(120)
  }

  return value
}

/**
 * @param {import("playwright").Page} page
 * @param {string} label
 * @param {number} limit
 * @param {number} timeoutMs
 */
async function waitForMetricBelow(page, label, limit, timeoutMs) {
  const startedAt = Date.now()
  let value = readMetric(await page.locator("body").innerText(), label)

  while (Date.now() - startedAt < timeoutMs) {
    if (value < limit) {
      return value
    }

    await page.waitForTimeout(120)
    value = readMetric(await page.locator("body").innerText(), label)
  }

  return value
}

/**
 * @param {import("playwright").Page} page
 */
async function installMockGamepad(page) {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 16 }, () => ({
      pressed: false,
      value: 0,
    }))
    const gamepad = {
      axes: [0, 0, 0, 0],
      buttons,
      connected: true,
      id: "Mock Xbox Controller",
      index: 0,
      mapping: "standard",
      timestamp: 0,
    }

    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [gamepad],
    })

    /**
     * @param {{ axes?: number[], buttons?: Record<string, number> }} [state]
     */
    function setMockGamepad(state = {}) {
      const axes = state.axes ?? []
      const nextButtons = state.buttons ?? {}

      gamepad.axes = [0, 0, 0, 0]

      for (const [index, value] of axes.entries()) {
        gamepad.axes[index] = value
      }

      for (const button of buttons) {
        button.pressed = false
        button.value = 0
      }

      for (const [index, value] of Object.entries(nextButtons)) {
        const button = buttons[Number(index)]

        if (!button) {
          continue
        }

        button.pressed = value > 0
        button.value = value
      }

      gamepad.timestamp += 1
    }

    Reflect.set(window, "__setMockGamepad", setMockGamepad)
  })
}

/**
 * @param {import("playwright").Page} page
 * @param {{ axes?: number[], buttons?: Record<string, number> }} state
 */
async function setMockGamepad(page, state) {
  await page.evaluate((nextState) => {
    const setMockGamepadState = Reflect.get(window, "__setMockGamepad")

    if (typeof setMockGamepadState !== "function") {
      throw new Error("Mock gamepad setter is not installed")
    }

    setMockGamepadState(nextState)
  }, state)
}

const browser = await chromium.launch(browserLaunchOptions())
let keyboardSceneDifference = 0

try {
  await checkBackgroundPause(browser, url)
  {
    const context = await browser.newContext({ ...devices["Pixel 7"] })
    const page = await context.newPage()

    await page.goto(url, { waitUntil: "domcontentloaded" })
    await page.getByRole("heading", { name: "Desktop required" }).waitFor()

    if ((await page.locator("canvas").count()) > 0) {
      throw new Error("Expected mobile view to avoid loading the 3D canvas")
    }

    await context.close()
  }

  {
    const context = await browser.newContext({ viewport: { width: 960, height: 540 } })
    const page = await context.newPage()

    await page.goto(url, { waitUntil: "domcontentloaded" })
    const startButton = page.getByRole("button", { name: "Start driving" })
    await startButton.waitFor()
    await Promise.all([startButton.click(), page.keyboard.down("w")])
    await page.locator("canvas").waitFor()
    await waitForSpeedAbove(page, 5)

    const startupText = await page.locator("body").innerText()
    const startupSpeed = readMetric(startupText, "SPEED")

    if (startupSpeed <= 0) {
      throw new Error(`Expected immediate W input after start to drive, got ${startupSpeed}`)
    }

    await page.evaluate(() => {
      window.dispatchEvent(new Event("blur"))
    })
    await waitForSpeedAbove(page, startupSpeed + 3)

    const runningBlurText = await page.locator("body").innerText()
    const runningBlurSpeed = readMetric(runningBlurText, "SPEED")

    if (runningBlurSpeed <= startupSpeed + 3) {
      throw new Error(
        `Expected held W to survive visible running blur, got ${startupSpeed} -> ${runningBlurSpeed}`,
      )
    }

    await page.keyboard.up("w")
    await page.waitForTimeout(500)
    await page.evaluate(() => {
      window.dispatchEvent(new Event("blur"))
    })
    await page.waitForTimeout(300)

    if (await page.getByRole("dialog", { name: "Paused" }).isVisible()) {
      throw new Error("Expected startup blur to avoid opening the pause dialog")
    }

    const beforeKeyboardMotion = await screenshotCanvas(page)
    const beforeMotionSpeed = readMetric(await page.locator("body").innerText(), "SPEED")
    await page.keyboard.down("w")
    await waitForSpeedAbove(page, beforeMotionSpeed + 5)
    const afterKeyboardMotion = await screenshotCanvas(page)
    keyboardSceneDifference = measureSceneDifference(beforeKeyboardMotion, afterKeyboardMotion)

    if (keyboardSceneDifference < 1.2) {
      throw new Error(`Expected W input to visibly move the scene, got ${keyboardSceneDifference}`)
    }

    await page.keyboard.up("w")
    await page.keyboard.down("s")
    await page.getByRole("dialog", { name: "Race ended" }).waitFor({ timeout: 240000 })
    await page.keyboard.up("s")
    await page.waitForTimeout(400)
    const endedSignal = await page.locator(".signal-interference").evaluate((element) => ({
      intensity: element.getAttribute("data-intensity"),
      animation: getComputedStyle(element).animationPlayState,
    }))
    if (endedSignal.intensity !== "1.000" || endedSignal.animation !== "running") {
      throw new Error(
        `Expected persistent interference on the end dialog: ${JSON.stringify(endedSignal)}`,
      )
    }
    const endedColors = await page.locator(".screen-surface").evaluate((element) => {
      const style = getComputedStyle(element)
      const block = element.querySelector(".signal-block")
      if (!block) throw new Error("Missing signal dropout blocks")
      return {
        negative: Number(style.getPropertyValue("--signal-negative")),
        blocks: Number(style.getPropertyValue("--signal-block-opacity")),
        blockAnimation: getComputedStyle(block).animationPlayState,
      }
    })
    if (
      endedColors.negative !== 0 ||
      endedColors.blocks < 0.4 ||
      endedColors.blockAnimation !== "running"
    ) {
      throw new Error(
        `Expected colored dropouts to persist without whitening the black field: ${JSON.stringify(endedColors)}`,
      )
    }
    await page.getByRole("button", { name: "Drive again", exact: true }).click()
    await page.waitForTimeout(800)
    if ((await page.locator('[role="dialog"]').count()) !== 0) {
      throw new Error("Expected one Drive again click to dismiss the end dialog")
    }
    if ((await page.locator(".signal-interference").getAttribute("data-intensity")) !== "0.060") {
      throw new Error("Expected restart to reset interference to its mild baseline")
    }
    if (
      (await page.locator(".screen-color").getAttribute("data-corruption")) !== "false" ||
      (await page
        .locator(".signal-blocks")
        .evaluate((element) => Number(getComputedStyle(element).opacity))) !== 0
    ) {
      throw new Error("Expected restart to clear damage color filters and colored dropouts")
    }
    await page.keyboard.down("w")
    await waitForSpeedAbove(page, 5)
    await page.keyboard.up("w")
    console.log("road-end restart ok", { singleClick: true, resetIntensity: "0.060" })
    await context.close()
  }

  {
    const context = await browser.newContext()
    const page = await context.newPage()

    // A real reverse input must darken the edges, freeze on pause, and clear when driving forward.
    await page.goto(url, { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "Start driving" }).click()
    await page.keyboard.down("s")
    await page.waitForFunction(
      () =>
        Number(document.querySelector(".reverse-vignette")?.getAttribute("data-darkness")) > 0.08,
      undefined,
      { timeout: 30000 },
    )
    await page.keyboard.up("s")
    await page.keyboard.press("Escape")
    await page.getByRole("dialog", { name: "Paused" }).waitFor()
    const pausedDarkness = await page.locator(".reverse-vignette").getAttribute("data-darkness")
    await page.waitForTimeout(700)
    if ((await page.locator(".reverse-vignette").getAttribute("data-darkness")) !== pausedDarkness)
      throw new Error("Reverse darkness changed while paused")
    await page.getByRole("button", { name: "Resume", exact: true }).click()
    await page.keyboard.down("w")
    await page.waitForFunction(
      () =>
        Number(document.querySelector(".reverse-vignette")?.getAttribute("data-darkness")) < 0.01,
      undefined,
      { timeout: 15000 },
    )
    await page.keyboard.up("w")
    await context.close()
  }

  {
    const context = await browser.newContext()
    const page = await context.newPage()

    // Keep input retention on the opening straight, before collisions or a
    // previous drift can change speed independently of the held throttle.
    await page.goto(url, { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "Start driving" }).click()
    await page.getByRole("button", { name: "Pause", exact: true }).waitFor()
    await page.keyboard.down("w")
    await waitForSpeedAbove(page, 25)
    await page.keyboard.down("Escape")
    await page.getByRole("dialog", { name: "Paused" }).waitFor()
    await page.keyboard.up("Escape")
    const pausedSpeed = Number(await page.locator(".hud__metric--speed strong").textContent())

    if (pausedSpeed <= 0) {
      throw new Error(`Expected the car to be moving before pause, got ${pausedSpeed}`)
    }

    await page.getByRole("button", { name: "Resume" }).click()
    await waitForSpeedAbove(page, pausedSpeed + 3)

    const heldResumeText = await page.locator("body").innerText()
    const heldResumeSpeed = readMetric(heldResumeText, "SPEED")

    if (heldResumeSpeed <= pausedSpeed + 3) {
      throw new Error(
        `Expected held W to survive pause and resume, got ${pausedSpeed} -> ${heldResumeSpeed}`,
      )
    }

    await page.keyboard.up("w")
    const resumedSpeed = await waitForMetricBelow(page, "SPEED", heldResumeSpeed - 4, 15000)

    if (resumedSpeed >= heldResumeSpeed - 4) {
      throw new Error(
        `Expected released W to decelerate after resume, got ${heldResumeSpeed} -> ${resumedSpeed}`,
      )
    }

    await context.close()
  }

  {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto(url, { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "Start driving" }).click()
    await page.getByRole("button", { name: "Pause", exact: true }).waitFor()
    await page.keyboard.down("w")
    await waitForSpeedAbove(page, 59)
    await page.keyboard.down("d")
    await page.keyboard.down("Space")
    const driftCharge = await waitForProgressAboveZero(page, "Drift charge", 15000)

    if (driftCharge <= 0) {
      throw new Error(`Expected keyboard drifting to build charge, got ${driftCharge}`)
    }

    await page.keyboard.up("Space")
    await page.keyboard.up("d")
    await page.keyboard.up("w")
    await context.close()
  }

  {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto(withSearchParams(url, { debug: "no-obstacles" }), {
      waitUntil: "domcontentloaded",
    })
    await page.getByRole("button", { name: "Start driving" }).waitFor()

    const debugMode = await page.locator(".game-shell").getAttribute("data-debug-mode")

    if (debugMode !== "No obstacles") {
      throw new Error(`Expected no-obstacles debug mode marker, got ${debugMode}`)
    }

    await page.getByRole("button", { name: "Start driving" }).click()
    await page.keyboard.down("w")
    await page.waitForTimeout(5600)
    await page.keyboard.up("w")

    const integrity = await readProgressValue(page, "Vehicle integrity")

    if (integrity !== 100) {
      throw new Error(
        `Expected no-obstacles debug mode to avoid collision damage, got ${integrity}`,
      )
    }

    await context.close()
  }

  {
    const context = await browser.newContext()
    const page = await context.newPage()

    await installMockGamepad(page)
    await page.goto(url, { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "Start driving" }).waitFor()
    await setMockGamepad(page, { buttons: { 0: 1 } })
    await page.waitForTimeout(160)
    await setMockGamepad(page, { buttons: {} })
    await page.locator("canvas").waitFor()
    await page.locator(".race-control-button[aria-label='Pause']").waitFor()
    await page.waitForTimeout(350)
    await setMockGamepad(page, { buttons: { 7: 1 } })
    await waitForSpeedAbove(page, 5)

    const text = await page.locator("body").innerText()
    const gamepadSpeed = readMetric(text, "SPEED")

    if (gamepadSpeed <= 0) {
      throw new Error(`Expected Xbox RT input to drive, got ${gamepadSpeed}`)
    }

    await setMockGamepad(page, { buttons: { 9: 1 } })
    await page.getByRole("dialog", { name: "Paused" }).waitFor()
    await setMockGamepad(page, { buttons: {} })
    await context.close()
  }
} finally {
  await browser.close()
}

console.log("interaction ok", { keyboardSceneDifference })
