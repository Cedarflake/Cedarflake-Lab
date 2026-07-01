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
  const points = [
    [0.5, 0.5],
    [0.35, 0.55],
    [0.65, 0.55],
    [0.5, 0.72],
    [0.5, 0.28],
  ]
  const colors = points.map(([xRatio, yRatio]) => {
    const x = Math.floor(png.width * xRatio)
    const y = Math.floor(png.height * yRatio)
    const index = (png.width * y + x) * 4

    return [png.data[index], png.data[index + 1], png.data[index + 2], png.data[index + 3]].join(
      ",",
    )
  })
  const uniqueColors = new Set(colors)
  const hasVisiblePixels = colors.some((color) => color !== "0,0,0,0" && color !== "0,0,0,255")

  return {
    ok: hasVisiblePixels && uniqueColors.size > 1,
    colors,
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
  const canvas = page.locator("canvas")
  await canvas.waitFor()
  await page.waitForTimeout(1200)

  await page.screenshot({
    path: join(outputPath, `${viewport.name}.png`),
    fullPage: true,
  })

  const canvasBuffer = await canvas.screenshot({
    path: join(outputPath, `${viewport.name}-canvas.png`),
  })
  const sample = samplePng(canvasBuffer)

  await context.close()

  if (!sample.ok) {
    throw new Error(`${viewport.name} canvas check failed: ${JSON.stringify(sample)}`)
  }

  console.log(`${viewport.name} canvas ok`, sample)
}

await browser.close()
