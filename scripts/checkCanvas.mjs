import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { chromium, devices } from "playwright"
import { PNG } from "pngjs"

const url = process.argv.find((value) => value.startsWith("http")) ?? "http://localhost:5175/"
const outputDir = new URL("../artifacts/", import.meta.url)
const outputPath = fileURLToPath(outputDir)

await mkdir(outputDir, { recursive: true })

const viewports = [
  {
    name: "desktop",
    options: {
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    },
  },
  {
    name: "mobile",
    options: {
      ...devices["Pixel 7"],
    },
  },
]

function samplePng(buffer) {
  const png = PNG.sync.read(buffer)
  const points = Array.from({ length: 9 }, (_, yIndex) =>
    Array.from({ length: 9 }, (_, xIndex) => [
      0.15 + ((xIndex + 0.5) / 9) * 0.7,
      0.32 + ((yIndex + 0.5) / 9) * 0.44,
    ]),
  ).flat()
  const colors = points.map(([xRatio, yRatio]) => {
    const x = Math.floor(png.width * xRatio)
    const y = Math.floor(png.height * yRatio)
    const index = (png.width * y + x) * 4

    return {
      color: [
        png.data[index] ?? 0,
        png.data[index + 1] ?? 0,
        png.data[index + 2] ?? 0,
        png.data[index + 3] ?? 0,
      ].join(","),
      luminance:
        (png.data[index] ?? 0) * 0.2126 +
        (png.data[index + 1] ?? 0) * 0.7152 +
        (png.data[index + 2] ?? 0) * 0.0722,
      yRatio,
    }
  })
  const uniqueColors = new Set(colors.map((sample) => sample.color))
  const luminanceValues = colors.map((sample) => sample.luminance)
  const minLuminance = Math.min(...luminanceValues)
  const maxLuminance = Math.max(...luminanceValues)
  const hasVisiblePixels = colors.some(
    (sample) => sample.color !== "0,0,0,0" && sample.color !== "0,0,0,255",
  )
  const hasSceneContrast = maxLuminance - minLuminance > 8 || minLuminance < 242

  return {
    ok: hasVisiblePixels && uniqueColors.size > 18 && hasSceneContrast,
    colors: colors.slice(0, 8).map((sample) => sample.color),
    hasSceneContrast,
    minLuminance,
    maxLuminance,
    uniqueColorCount: uniqueColors.size,
    width: png.width,
    height: png.height,
  }
}

const browser = await chromium.launch()

for (const viewport of viewports) {
  const context = await browser.newContext(viewport.options)
  const page = await context.newPage()

  await page.goto(url, { waitUntil: "domcontentloaded" })
  await page.getByRole("button", { name: "Start driving" }).click()
  await page.locator("canvas").waitFor()
  await page.waitForTimeout(300)

  if (viewport.name === "mobile") {
    const goButton = page.getByRole("button", { name: "Go" })
    const box = await goButton.boundingBox()

    if (!box) {
      throw new Error("Expected Go button to be visible")
    }

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
  } else {
    await page.locator("body").focus()
    await page.keyboard.down("w")
  }

  await page.waitForTimeout(2600)
  await page.screenshot({
    path: join(outputPath, `${viewport.name}.png`),
    fullPage: true,
  })

  const screenshot = await page.screenshot()
  const sample = samplePng(screenshot)

  await context.close()

  if (!sample.ok) {
    throw new Error(`${viewport.name} canvas check failed: ${JSON.stringify(sample)}`)
  }

  console.log(`${viewport.name} canvas ok`, sample)
}

await browser.close()
