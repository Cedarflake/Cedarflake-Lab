import { existsSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const appRoot = fileURLToPath(new URL("../", import.meta.url))

const repositoryRootCandidate = resolve(appRoot, "../..")
const repositoryLandingManifest = resolve(repositoryRootCandidate, "apps/landing/package.json")

function isFile(filePath: string) {
  return existsSync(filePath) && statSync(filePath).isFile()
}

export const repositoryRoot = isFile(repositoryLandingManifest) ? repositoryRootCandidate : null

export const validationContext = repositoryRoot ? "monorepo" : "standalone"
