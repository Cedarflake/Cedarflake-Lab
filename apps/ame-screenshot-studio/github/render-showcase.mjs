import http from "node:http"
import path from "node:path"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"

import { markPath } from "../web/brand.mjs"

const outputDirectory = path.dirname(fileURLToPath(import.meta.url))
const studioDirectory = path.dirname(outputDirectory)
const project = JSON.parse(
  await readFile(path.join(studioDirectory, "projects/store.json"), "utf8"),
)
const width = 2400
const height = 2240
const panels = [
  {
    id: "gallery",
    label: "Gallery",
    x: 64,
    y: 104,
    width: 1116,
    height: 627.75,
    crop: [0, 0, 1584, 891],
  },
  {
    id: "viewer",
    label: "Viewer",
    x: 1220,
    y: 104,
    width: 1116,
    height: 627.75,
    crop: [0, 0, 1584, 891],
  },
  {
    id: "search",
    label: "Search",
    x: 64,
    y: 824,
    width: 1116,
    height: 627.75,
    crop: [0, 0, 1584, 891],
  },
  {
    id: "albums",
    label: "Albums",
    x: 1220,
    y: 824,
    width: 1116,
    height: 627.75,
    crop: [0, 0, 1584, 891],
  },
  {
    id: "duplicates",
    label: "Duplicates",
    x: 64,
    y: 1544,
    width: 1116,
    height: 627.75,
    crop: [0, 0, 1584, 891],
  },
  {
    id: "organize",
    label: "Organize files",
    x: 1220,
    y: 1544,
    width: 1116,
    height: 627.75,
    crop: [0, 0, 1584, 891],
  },
]
for (const panel of panels) {
  const scene = project.scenes.find((scene) => scene.id === panel.id)
  if (!scene?.images[0]) throw new Error(`Missing source for ${panel.id}`)
  panel.file = scene.images[0]
}

async function render(configuration) {
  const canvas = document.querySelector("canvas")
  canvas.width = configuration.width
  canvas.height = configuration.height
  const ctx = canvas.getContext("2d", { alpha: false })
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  await document.fonts.ready
  const images = new Map()
  await Promise.all(
    configuration.panels.map(async (panel) => {
      const image = new Image()
      image.src = `/captures/${panel.file}`
      await image.decode()
      if (image.naturalWidth !== 1584 || image.naturalHeight !== 891)
        throw new Error("Unexpected capture dimensions")
      images.set(panel.id, image)
    }),
  )

  const background = ctx.createLinearGradient(0, 0, configuration.width, configuration.height)
  background.addColorStop(0, "#eaf3ff")
  background.addColorStop(0.55, "#f2fbff")
  background.addColorStop(1, "#e3faf5")
  ctx.fillStyle = background
  ctx.fillRect(0, 0, configuration.width, configuration.height)
  const mark = new Path2D(configuration.markPath)
  for (const shape of [
    { x: -460, y: 900, size: 1500 },
    { x: 1900, y: -350, size: 1000 },
  ]) {
    ctx.save()
    ctx.translate(shape.x, shape.y)
    ctx.scale(shape.size / 2000, shape.size / 2000)
    ctx.globalAlpha = 0.12
    const color = ctx.createLinearGradient(140, 360, 1800, 1700)
    color.addColorStop(0, "#3181ff")
    color.addColorStop(0.55, "#199aff")
    color.addColorStop(1, "#1ffff3")
    ctx.fillStyle = color
    ctx.fill(mark, "evenodd")
    ctx.restore()
  }

  for (const panel of configuration.panels) {
    ctx.fillStyle = "#253942"
    ctx.textBaseline = "alphabetic"
    ctx.font = '400 38px "Segoe UI", sans-serif'
    ctx.fillText(panel.label, panel.x + 4, panel.y - 24)
    ctx.save()
    ctx.shadowColor = "#18435b28"
    ctx.shadowBlur = 28
    ctx.shadowOffsetY = 12
    ctx.fillStyle = "#f4f7fb"
    ctx.beginPath()
    ctx.roundRect(panel.x, panel.y, panel.width, panel.height, 28)
    ctx.fill()
    ctx.restore()
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(panel.x, panel.y, panel.width, panel.height, 28)
    ctx.clip()
    ctx.drawImage(images.get(panel.id), ...panel.crop, panel.x, panel.y, panel.width, panel.height)
    ctx.restore()
  }

  const encode = (type, quality) =>
    new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Canvas export failed"))),
        type,
        quality,
      )
    })
  const png = await encode("image/png")
  await fetch("/output/ame-showcase.png", { method: "POST", body: png })
  let webp
  let quality
  for (quality of [1, 0.98, 0.96, 0.94, 0.92, 0.9]) {
    webp = await encode("image/webp", quality)
    if (webp.size <= 1500000) break
  }
  if (webp.size > 1500000) throw new Error("WebP exceeds the agreed size budget")
  await fetch("/output/ame-showcase.webp", { method: "POST", body: webp })
  const preview = document.createElement("canvas")
  preview.width = 900
  preview.height = Math.round((900 * configuration.height) / configuration.width)
  preview.getContext("2d").drawImage(canvas, 0, 0, preview.width, preview.height)
  const previewBlob = await new Promise((resolve) => preview.toBlob(resolve, "image/png"))
  await fetch("/output/readme-size-check.png", { method: "POST", body: previewBlob })
  const receipt = {
    width: canvas.width,
    height: canvas.height,
    pngBytes: png.size,
    webpBytes: webp.size,
    webpQuality: quality,
    panels: configuration.panels,
  }
  await fetch("/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(receipt),
  })
  document.body.dataset.complete = "true"
}

const configuration = { width, height, markPath, panels }
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Ame GitHub showcase</title><style>html,body{margin:0;background:#eaf3ff}canvas{display:block;width:100%;height:auto}</style><canvas aria-label="Ame gallery, viewer, search, albums, duplicates, and file organization"></canvas><script>(${render.toString()})(${JSON.stringify(configuration)}).catch(error=>fetch('/failed',{method:'POST',body:error.stack}))</script></html>`
await writeFile(path.join(outputDirectory, "showcase.html"), html, "utf8")
const files = new Set(panels.map((panel) => panel.file))
const outputs = new Set(["ame-showcase.png", "ame-showcase.webp", "readme-size-check.png"])
let finish
let fail
const completion = new Promise((resolve, reject) => {
  finish = resolve
  fail = reject
})
const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      response.end(html)
      return
    }
    if (request.method === "GET" && request.url.startsWith("/captures/")) {
      const name = request.url.slice("/captures/".length)
      if (!files.has(name)) throw new Error("Unknown source")
      response.writeHead(200, { "Content-Type": "image/png" })
      response.end(await readFile(path.join(studioDirectory, "captures", name)))
      return
    }
    if (request.method === "POST") {
      const chunks = []
      let size = 0
      for await (const chunk of request) {
        size += chunk.length
        if (size > 25 * 1024 * 1024) throw new Error("Output too large")
        chunks.push(chunk)
      }
      const body = Buffer.concat(chunks)
      if (request.url === "/complete") finish(JSON.parse(body.toString("utf8")))
      else if (request.url === "/failed") fail(new Error(body.toString("utf8")))
      else {
        const name = request.url.slice("/output/".length)
        if (!request.url.startsWith("/output/") || !outputs.has(name))
          throw new Error("Unknown output")
        await writeFile(path.join(outputDirectory, name), body)
      }
      response.writeHead(200)
      response.end("OK")
      return
    }
    response.writeHead(404)
    response.end()
  } catch (error) {
    response.writeHead(400, {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    })
    response.end(error.message)
    fail(error)
  }
})
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
const address = `http://127.0.0.1:${server.address().port}`
const browser = "C:/Program Files/Google/Chrome/Application/chrome.exe"
const profile = path.join(outputDirectory, ".render-profile")
await mkdir(profile, { recursive: true })
const child = spawn(
  browser,
  [
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--force-color-profile=srgb",
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=0",
    address,
  ],
  { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
)
child.on("error", fail)
child.stderr.on("data", (data) => process.stderr.write(data))
child.stdout.resume()
child.on("exit", (code) => {
  if (code !== 0) fail(new Error(`Browser exited: ${code}`))
})
const timeout = setTimeout(() => fail(new Error("Rendering timed out")), 45000)
try {
  const receipt = await completion
  receipt.sha256 = createHash("sha256")
    .update(await readFile(path.join(outputDirectory, "ame-showcase.webp")))
    .digest("hex")
  await writeFile(
    path.join(outputDirectory, "receipt.json"),
    JSON.stringify(receipt, null, 2) + "\n",
    "utf8",
  )
  console.log(JSON.stringify(receipt, null, 2))
} finally {
  clearTimeout(timeout)
  server.close()
  if (child.exitCode === null) child.kill()
}
