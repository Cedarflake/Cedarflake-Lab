/** @param {import("playwright").Page} page */
async function assertPausedMenu(page) {
  await page.waitForFunction(() => document.querySelector("main")?.dataset.status === "paused")
  const menu = await page.getByRole("dialog", { name: "Paused" }).evaluate((dialog) => {
    const panel = dialog.querySelector(".overlay__panel")
    return {
      opacity: getComputedStyle(dialog).opacity,
      panelOpacity: panel ? getComputedStyle(panel).opacity : null,
      pointerEvents: getComputedStyle(dialog).pointerEvents,
      isExiting: dialog.getAttribute("data-exiting"),
    }
  })
  if (
    menu.opacity !== "1" ||
    menu.panelOpacity !== "1" ||
    menu.pointerEvents === "none" ||
    menu.isExiting === "true"
  ) {
    throw new Error(
      `Paused menu must be visible without an animation tick: ${JSON.stringify(menu)}`,
    )
  }
}

/**
 * @param {import("playwright").Page} page
 * @param {boolean} isHidden
 */
async function setHidden(page, isHidden) {
  await page.evaluate((hidden) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (hidden ? "hidden" : "visible"),
    })
    document.dispatchEvent(new Event("visibilitychange"))
  }, isHidden)
}

/**
 * @param {import("playwright").Browser} browser
 * @param {string} url
 */
export async function checkBackgroundPause(browser, url) {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    const client = await context.newCDPSession(page)
    await page.goto(url, { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "Start driving" }).click()
    await page.keyboard.down("w")
    await page.waitForFunction(
      () => Number(document.querySelector(".hud__metric--speed strong")?.textContent) > 20,
    )
    const initialSpeed = Number(await page.locator(".hud__metric--speed strong").textContent())
    if (initialSpeed <= 0) throw new Error("Expected the car to move before backgrounding")

    // Background tabs can stop animation clocks while the visibility handler commits a pause.
    await client.send("Animation.enable")
    await client.send("Animation.setPlaybackRate", { playbackRate: 0 })
    await setHidden(page, true)
    await assertPausedMenu(page)
    const frozenDistance = await page.locator(".hud__metric--distance strong").textContent()
    await client.send("Page.setWebLifecycleState", { state: "frozen" })
    await new Promise((resolve) => setTimeout(resolve, 600))
    await client.send("Page.setWebLifecycleState", { state: "active" })
    await setHidden(page, false)
    await assertPausedMenu(page)
    if ((await page.locator(".hud__metric--distance strong").textContent()) !== frozenDistance) {
      throw new Error("The car advanced while the page was frozen")
    }

    // Interrupt the outgoing pause dialog before its fade completes, repeatedly.
    for (let index = 0; index < 3; index++) {
      await page.getByRole("button", { name: "Resume", exact: true }).click()
      await setHidden(page, true)
      await setHidden(page, false)
      await assertPausedMenu(page)
    }

    const pausedSpeed = Number(await page.locator(".hud__metric--speed strong").textContent())
    await client.send("Animation.setPlaybackRate", { playbackRate: 1 })
    await page.getByRole("button", { name: "Resume", exact: true }).click()
    await page.getByRole("button", { name: "Pause", exact: true }).waitFor()
    await page.waitForFunction(
      (speed) => Number(document.querySelector(".hud__metric--speed strong")?.textContent) < speed,
      pausedSpeed,
      { timeout: 15000 },
    )
    const coastingSpeed = Number(await page.locator(".hud__metric--speed strong").textContent())
    if (coastingSpeed >= pausedSpeed)
      throw new Error(`Hidden-page throttle remained pressed: ${pausedSpeed} -> ${coastingSpeed}`)
    await page.keyboard.up("w")
    await page.keyboard.down("w")
    await page.waitForFunction(
      (speed) =>
        Number(document.querySelector(".hud__metric--speed strong")?.textContent) > speed + 5,
      coastingSpeed,
    )
    await page.keyboard.up("w")
    console.log("background pause ok", { initialSpeed, pausedSpeed, coastingSpeed })
  } finally {
    await context.close()
  }
}
