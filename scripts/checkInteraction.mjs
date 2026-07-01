import { chromium, devices } from "playwright"

const url = process.argv.find((value) => value.startsWith("http")) ?? "http://localhost:5175/"

function readMetric(text, label) {
  const match = text.match(new RegExp(`${label}\\s+(\\d+)`, "i"))
  return match ? Number(match[1]) : 0
}

const browser = await chromium.launch()
const context = await browser.newContext({ ...devices["Pixel 7"] })
const page = await context.newPage()

await page.goto(url, { waitUntil: "domcontentloaded" })
await page.getByRole("button", { name: "Start driving" }).click()
await page.locator("canvas").waitFor()
await page.waitForTimeout(500)

const goButton = page.getByRole("button", { name: "Go" })
const box = await goButton.boundingBox()

if (!box) {
  throw new Error("Expected Go button to be visible")
}

await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()
await page.waitForTimeout(1600)

const text = await page.locator("body").innerText()
const speed = readMetric(text, "SPEED")
const distance = readMetric(text, "DISTANCE")

await browser.close()

if (speed <= 0 || distance <= 0) {
  throw new Error(`Expected touch driving to advance, got speed=${speed} distance=${distance}`)
}

console.log("interaction ok", { speed, distance })
