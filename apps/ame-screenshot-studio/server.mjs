import http from "node:http"
import { readFile, writeFile, readdir, mkdir, rename, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { randomUUID } from "node:crypto"

import { createCaptureService } from "./src/capture.mjs"
import { createProject, normalizeProject, pngSize } from "./src/project.mjs"

const root = path.dirname(fileURLToPath(import.meta.url))
const dataRoot = path.resolve(process.env.STUDIO_DATA_DIR || root)
const port = Number(process.env.STUDIO_PORT || 4178)
for (const dir of ["captures", "exports", "projects", "library", "logs"])
  await mkdir(path.join(dataRoot, dir), { recursive: true })
const projectPath = path.join(dataRoot, "projects", "store.json")
const json = (res, status, value) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  })
  res.end(JSON.stringify(value))
}
async function body(req, limit = 50 * 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size >= limit) throw new Error("文件需要小于 50 MB")
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}
const validFile = (name) =>
  typeof name === "string" && /^[a-zA-Z0-9_.-]+$/.test(name) && name !== "." && name !== ".."
async function atomic(file, data) {
  const temp = file + "." + randomUUID() + ".tmp"
  await writeFile(temp, data, { flag: "wx" })
  await rename(temp, file)
}
async function captureList() {
  const names = (await readdir(path.join(dataRoot, "captures"))).filter(
    (name) => validFile(name) && /\.png$/i.test(name),
  )
  const result = []
  for (const name of names) {
    try {
      const bytes = await readFile(path.join(dataRoot, "captures", name))
      const info = await stat(path.join(dataRoot, "captures", name))
      result.push({
        id: name,
        ...pngSize(bytes),
        bytes: info.size,
        modified: info.mtime.toISOString(),
        url: "/captures/" + name,
      })
    } catch {}
  }
  return result.sort((a, b) => b.modified.localeCompare(a.modified))
}
const capture = createCaptureService(root, dataRoot)
const staticFiles = new Map([
  ["/", "web/index.html"],
  ["/app.js", "web/app.js"],
  ["/styles.css", "web/styles.css"],
  ["/render.mjs", "web/render.mjs"],
  ["/brand.mjs", "web/brand.mjs"],
  ["/project.mjs", "src/project.mjs"],
])
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
}
const server = http.createServer(async (req, res) => {
  try {
    const requestOrigin = `http://127.0.0.1:${server.address().port}`
    if (req.headers.host !== `127.0.0.1:${server.address().port}`)
      return json(res, 403, { error: "仅允许本机访问" })
    if (req.method !== "GET" && req.headers.origin !== requestOrigin)
      return json(res, 403, { error: "请求来源不正确" })
    const url = new URL(req.url, requestOrigin)
    if (req.method === "GET" && url.pathname === "/api/project") {
      try {
        return json(res, 200, normalizeProject(JSON.parse(await readFile(projectPath, "utf8"))))
      } catch (error) {
        if (error.code !== "ENOENT") throw error
        return json(res, 200, createProject())
      }
    }
    if (req.method === "PUT" && url.pathname === "/api/project") {
      const project = normalizeProject(JSON.parse((await body(req, 1024 * 1024)).toString("utf8")))
      await atomic(projectPath, JSON.stringify(project, null, 2) + "\n")
      return json(res, 200, { saved: true })
    }
    if (req.method === "GET" && url.pathname === "/api/captures")
      return json(res, 200, await captureList())
    if (req.method === "POST" && url.pathname === "/api/import") {
      const bytes = await body(req)
      const size = pngSize(bytes)
      if (size.width > 16384 || size.height > 16384 || size.width < 1 || size.height < 1)
        throw new Error("图片尺寸不支持")
      const id = "capture-" + randomUUID() + ".png"
      await writeFile(path.join(dataRoot, "captures", id), bytes, { flag: "wx" })
      return json(res, 201, { id, ...size })
    }
    if (req.method === "POST" && url.pathname === "/api/export") {
      const id = url.searchParams.get("scene")
      if (!id || !/^[a-z0-9-]{1,48}$/.test(id)) throw new Error("场景标识不正确")
      const bytes = await body(req)
      const size = pngSize(bytes)
      if (size.width !== 1920 || size.height !== 1080) throw new Error("商店图片必须为 1920 × 1080")
      const name = id + "-" + new Date().toISOString().replace(/[:.]/g, "-") + ".png"
      await writeFile(path.join(dataRoot, "exports", name), bytes, { flag: "wx" })
      return json(res, 201, { url: "/exports/" + name, name, ...size, bytes: bytes.length })
    }
    if (req.method === "GET" && url.pathname === "/api/windows") {
      return json(res, 200, await capture.windows())
    }
    if (req.method === "POST" && url.pathname === "/api/capture") {
      const request = JSON.parse((await body(req, 4096)).toString("utf8"))
      return json(res, 201, await capture.capture(request.source))
    }
    if (req.method === "GET" && url.pathname === "/api/library") {
      try {
        const collection = JSON.parse(
          await readFile(path.join(dataRoot, "projects", "collection.json"), "utf8"),
        )
        if (typeof collection.name !== "string" || !/^[-\p{L}\p{N}_]{1,64}$/u.test(collection.name))
          throw new Error("素材库名称不正确")
        return json(
          res,
          200,
          JSON.parse(
            await readFile(
              path.join(dataRoot, "collections", collection.name, "status.json"),
              "utf8",
            ),
          ),
        )
      } catch (error) {
        if (error.code !== "ENOENT") throw error
        return json(res, 200, { status: "not-prepared", admitted: 0 })
      }
    }
    let relative = staticFiles.get(url.pathname)
    if (!relative) {
      const match = /^\/(captures|exports)\/([^/]+)$/.exec(url.pathname)
      if (match && validFile(match[2]) && match[2].endsWith(".png"))
        relative = match[1] + "/" + match[2]
    }
    if (req.method !== "GET" || !relative) return json(res, 404, { error: "没有找到" })
    const data = await readFile(
      path.join(staticFiles.has(url.pathname) ? root : dataRoot, relative),
    )
    res.writeHead(200, {
      "Content-Type": mime[path.extname(relative)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    })
    res.end(data)
  } catch (error) {
    json(res, error.code === "ENOENT" ? 404 : 400, { error: error.message })
  }
})
server.listen(port, "127.0.0.1", () =>
  console.log(`Ame Screenshot Studio: http://127.0.0.1:${server.address().port}`),
)
