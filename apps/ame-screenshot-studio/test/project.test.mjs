import test from "node:test"
import assert from "node:assert/strict"
import { createProject, normalizeProject, pngSize } from "../src/project.mjs"
test("projects preserve scene settings and reject duplicate identifiers", () => {
  const project = createProject()
  project.scenes[0].images = ["sample.png"]
  project.scenes[0].offsetX = 23
  assert.deepEqual(normalizeProject(project), project)
  project.scenes[1].id = project.scenes[0].id
  assert.throws(() => normalizeProject(project), /标识/)
})
test("imported projects cannot introduce external assets or unbounded geometry", () => {
  const project = createProject()
  project.scenes[0].images = ["../../private.png", "https://example.com/a.png", "sample.png"]
  project.scenes[0].scale = 300
  const accepted = normalizeProject(project)
  assert.deepEqual(accepted.scenes[0].images, ["sample.png"])
  assert.equal(accepted.scenes[0].scale, 1.4)
})
test("export dimensions are read from PNG bytes", () => {
  const bytes = Buffer.alloc(24)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes)
  bytes.writeUInt32BE(1920, 16)
  bytes.writeUInt32BE(1080, 20)
  assert.deepEqual(pngSize(bytes), { width: 1920, height: 1080 })
  assert.throws(() => pngSize(Buffer.from("not png")))
})
