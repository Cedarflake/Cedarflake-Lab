import { readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const directories = ["src", "web", "scripts", "test", "github"]
const files = ["server.mjs"]
for (const directory of directories) {
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    if (entry.isFile() && /\.(mjs|js)$/.test(entry.name))
      files.push(path.join(directory, entry.name))
  }
}
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, file)], {
    stdio: "inherit",
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
console.log("Validated JavaScript syntax for " + files.length + " files.")
