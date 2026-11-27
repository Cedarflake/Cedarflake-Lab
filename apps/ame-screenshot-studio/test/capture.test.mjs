import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { createCaptureService } from "../src/capture.mjs"

const original = {
  id: "0x123",
  pid: 111,
  started: "133100000000000000",
  title: "Ame",
  process: "cedarflake_ame.exe",
}

for (const replacement of [
  { ...original, pid: 222 },
  { ...original, started: "133200000000000000" },
]) {
  test(
    "stale window selection does not adopt replacement identity " +
      replacement.pid +
      "/" +
      replacement.started,
    async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "ame-capture-"))
      let current = original
      let captured = false
      const execute = async (_file, args) => {
        if (args[0] === "enumerate") return JSON.stringify([current])
        if (
          args[1] !== current.id ||
          args[2] !== String(current.pid) ||
          args[3] !== current.started
        )
          throw new Error("Selected process no longer owns the window")
        captured = true
        return "{}"
      }
      try {
        const service = createCaptureService(root, root, execute)
        const [selected] = await service.windows()
        current = replacement
        await assert.rejects(
          service.capture(selected),
          /Selected process no longer owns the window/,
        )
        assert.equal(captured, false)
        const [fresh] = await service.windows()
        assert.match((await service.capture(fresh)).id, /^ame-.*\.png$/)
        assert.equal(captured, true)
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
  )
}

test("capture rejects a replaced sandbox session before executing commands", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ame-session-"))
  const sessionPath = path.join(root, "environment", "session.json")
  const oldId = "11111111-1111-1111-1111-111111111111"
  const newId = "22222222-2222-2222-2222-222222222222"
  const execute = async (_file, args) => {
    assert.equal(args[0], "enumerate", "A replaced session must not execute capture")
    return "[]"
  }
  try {
    await mkdir(path.dirname(sessionPath))
    await writeFile(sessionPath, JSON.stringify({ id: oldId, purpose: "ame-screenshot-studio" }))
    const service = createCaptureService(root, root, execute)
    const [selected] = await service.windows()
    await writeFile(sessionPath, JSON.stringify({ id: newId, purpose: "ame-screenshot-studio" }))
    await assert.rejects(service.capture(selected))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
