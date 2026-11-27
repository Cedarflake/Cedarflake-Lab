import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
  "base64",
)

async function start(data) {
  const child = spawn(process.execPath, [path.join(root, "server.mjs")], {
    env: { ...process.env, STUDIO_DATA_DIR: data, STUDIO_PORT: "0" },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  })
  let output = ""
  let errors = ""
  child.stderr.on("data", (chunk) => {
    errors += chunk
  })
  const origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error("Server did not start: " + errors))
    }, 10000)
    child.once("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once("exit", (code) => {
      clearTimeout(timer)
      reject(new Error("Server exited: " + code + " " + errors))
    })
    child.stdout.on("data", (chunk) => {
      output += chunk
      const match = /http:\/\/127\.0\.0\.1:\d+/.exec(output)
      if (match) {
        clearTimeout(timer)
        resolve(match[0])
      }
    })
  })
  return {
    origin,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return
      const exited = once(child, "exit")
      child.kill()
      await exited
    },
  }
}

test("moved workspace retains imported captures and saved scenes across restart", async () => {
  const data = await mkdtemp(path.join(os.tmpdir(), "ame-studio-"))
  let server
  try {
    server = await start(data)
    const url = server.origin
    assert.equal((await fetch(url)).status, 200)
    assert.equal((await fetch(url + "/app.js")).status, 200)
    assert.equal((await fetch(url + "/api/import", { method: "POST", body: image })).status, 403)
    const imported = await fetch(url + "/api/import", {
      method: "POST",
      headers: { Origin: url },
      body: image,
    })
    assert.equal(imported.status, 201)
    const capture = await imported.json()
    assert.deepEqual(
      Buffer.from(await (await fetch(url + "/captures/" + capture.id)).arrayBuffer()),
      image,
    )
    const project = await (await fetch(url + "/api/project")).json()
    project.scenes[0].images = [capture.id]
    const saved = await fetch(url + "/api/project", {
      method: "PUT",
      headers: { Origin: url },
      body: JSON.stringify(project),
    })
    assert.equal(saved.status, 200)
    assert.deepEqual(
      JSON.parse(await readFile(path.join(data, "projects/store.json"), "utf8")),
      project,
    )
    await server.stop()
    server = await start(data)
    assert.deepEqual(await (await fetch(server.origin + "/api/project")).json(), project)
    assert.equal((await (await fetch(server.origin + "/api/captures")).json()).length, 1)
    assert.equal((await fetch(server.origin + "/projects/store.json")).status, 404)
  } finally {
    if (server) await server.stop()
    await rm(data, { recursive: true, force: true })
  }
})
