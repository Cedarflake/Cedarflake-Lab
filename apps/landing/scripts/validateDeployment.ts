import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { appRoot, repositoryRoot, validationContext } from "./repositoryContext"

const configPath = resolve(appRoot, "vercel.json")
const appPackagePath = resolve(appRoot, "package.json")
const appWorkspacePath = resolve(appRoot, "pnpm-workspace.yaml")
const typescriptConfigPath = resolve(appRoot, "tsconfig.json")
const rootPackagePath = repositoryRoot ? resolve(repositoryRoot, "package.json") : null
const expectedSchema = "https://openapi.vercel.sh/vercel.json"
const packageManagerPattern = /^pnpm@\d+\.\d+\.\d+$/
const errors: string[] = []

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function readJsonObject(filePath: string, label: string) {
  try {
    const parsedValue: unknown = JSON.parse(readFileSync(filePath, "utf8"))

    if (isRecord(parsedValue)) {
      return parsedValue
    }

    errors.push(`${label} must contain a JSON object`)
  } catch {
    errors.push(`${label} must contain valid JSON`)
  }

  return null
}

function readTextFile(filePath: string, label: string) {
  try {
    return readFileSync(filePath, "utf8")
  } catch {
    errors.push(`${label} must be readable`)
    return null
  }
}

function allowsDependencyBuild(config: string, packageName: string) {
  const lines = config.split(/\r?\n/)
  let isInAllowBuilds = false

  for (const line of lines) {
    const trimmedLine = line.trim()

    if (trimmedLine.length === 0 || trimmedLine.startsWith("#")) {
      continue
    }

    if (line === trimmedLine) {
      isInAllowBuilds = trimmedLine === "allowBuilds:"
      continue
    }

    if (isInAllowBuilds && trimmedLine === `${packageName}: true`) {
      return true
    }
  }

  return false
}

function readPackageManager(packageJson: Record<string, unknown>, label: string) {
  const packageManager = packageJson["packageManager"]

  if (typeof packageManager !== "string" || !packageManagerPattern.test(packageManager)) {
    errors.push(`${label} must pin a semantic pnpm packageManager version`)
    return null
  }

  return packageManager
}

function readNodeEngine(packageJson: Record<string, unknown>, label: string) {
  const engines = packageJson["engines"]
  const nodeEngine = isRecord(engines) ? engines["node"] : null

  if (typeof nodeEngine !== "string" || nodeEngine.trim().length === 0) {
    errors.push(`${label} must declare a Node.js engine range`)
    return null
  }

  return nodeEngine
}

const config = readJsonObject(configPath, "vercel.json")
const appPackage = readJsonObject(appPackagePath, "Landing package.json")
const appWorkspaceConfig = readTextFile(appWorkspacePath, "Landing pnpm-workspace.yaml")
const typescriptConfig = readJsonObject(typescriptConfigPath, "Landing tsconfig.json")
const rootPackage = rootPackagePath ? readJsonObject(rootPackagePath, "Root package.json") : null

if (config) {
  if (config["$schema"] !== expectedSchema) {
    errors.push(`vercel.json must use the official schema: ${expectedSchema}`)
  }

  if (config["installCommand"] !== "pnpm install") {
    errors.push("Vercel installCommand must remain a direct pnpm install")
  }

  const buildConfig = config["build"]
  const buildEnvironment = isRecord(buildConfig) ? buildConfig["env"] : null

  if (!isRecord(buildEnvironment)) {
    errors.push("Vercel build environment configuration is missing")
  } else if (buildEnvironment["ENABLE_EXPERIMENTAL_COREPACK"] !== "1") {
    errors.push("Vercel must enable Corepack for the workspace pnpm version")
  }
}

if (typescriptConfig) {
  if (typescriptConfig["extends"] !== undefined) {
    errors.push("Landing tsconfig.json must be self-contained for isolated Vercel builds")
  }

  const compilerOptions = typescriptConfig["compilerOptions"]

  if (!isRecord(compilerOptions)) {
    errors.push("Landing tsconfig.json compilerOptions are missing")
  } else {
    if (compilerOptions["jsx"] !== "react-jsx") {
      errors.push("Landing tsconfig.json must use the automatic React JSX runtime")
    }

    if (compilerOptions["moduleResolution"] !== "Bundler") {
      errors.push("Landing tsconfig.json must use Bundler module resolution")
    }

    if (compilerOptions["strict"] !== true || compilerOptions["noEmit"] !== true) {
      errors.push("Landing tsconfig.json must keep strict no-emit type checking")
    }
  }
}

const rootPackageManager = rootPackage ? readPackageManager(rootPackage, "Root package.json") : null
const appPackageManager = appPackage ? readPackageManager(appPackage, "Landing package.json") : null
const rootNodeEngine = rootPackage ? readNodeEngine(rootPackage, "Root package.json") : null
const appNodeEngine = appPackage ? readNodeEngine(appPackage, "Landing package.json") : null

if (rootPackageManager && appPackageManager && rootPackageManager !== appPackageManager) {
  errors.push("Landing package.json must use the root pnpm packageManager version")
}

if (rootNodeEngine && appNodeEngine && rootNodeEngine !== appNodeEngine) {
  errors.push("Landing package.json must use the root Node.js engine range")
}

if (appWorkspaceConfig && !allowsDependencyBuild(appWorkspaceConfig, "esbuild")) {
  errors.push("Landing pnpm-workspace.yaml must allow esbuild dependency scripts")
}

if (errors.length > 0) {
  throw new Error(`Landing deployment validation failed:\n- ${errors.join("\n- ")}`)
}

console.log(
  `Validated Vercel deployment config in ${validationContext} context, app runtime, dependency builds, and direct pnpm install command.`,
)
