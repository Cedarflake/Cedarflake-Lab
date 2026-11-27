import { cp, mkdir, readdir, copyFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const output = path.join(root, "dist")
await mkdir(output, { recursive: true })
for (const directory of ["src", "web", "capture", "tools", "scripts", "test"]) {
  await mkdir(path.join(output, directory), { recursive: true })
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    if (entry.isFile())
      await copyFile(
        path.join(root, directory, entry.name),
        path.join(output, directory, entry.name),
      )
  }
}
for (const file of [
  "server.mjs",
  "README.md",
  "package.json",
  "environment/start.ps1",
  "environment/guest-start.ps1",
  "environment/capture.ps1",
  "github/render-showcase.mjs",
]) {
  await mkdir(path.dirname(path.join(output, file)), { recursive: true })
  await cp(path.join(root, file), path.join(output, file))
}
console.log(
  "Built a source-only local app in dist; captures, libraries and runtime data are excluded.",
)
