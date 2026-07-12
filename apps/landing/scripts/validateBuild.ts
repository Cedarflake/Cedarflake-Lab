import { existsSync, readFileSync } from "node:fs"
import { isAbsolute, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

import { seoConfig } from "../src/config/seo"
import { canonicalSiteUrl, createRobotsTxt, createSitemapXml } from "../src/lib/seo"

const appRoot = fileURLToPath(new URL("../", import.meta.url))
const distRoot = resolve(appRoot, "dist")
const indexPath = resolve(distRoot, "index.html")
const robotsPath = resolve(distRoot, "robots.txt")
const sitemapPath = resolve(distRoot, "sitemap.xml")
const errors: string[] = []

function readBuildFile(filePath: string, label: string) {
  if (!existsSync(filePath)) {
    errors.push(`Build output is missing ${label}: ${filePath}`)
    return null
  }

  return readFileSync(filePath, "utf8")
}

function getAttribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`, "i"))

  return match?.[1] ?? match?.[2]
}

const html = readBuildFile(indexPath, "index.html")
const robotsTxt = readBuildFile(robotsPath, "robots.txt")
const sitemapXml = readBuildFile(sitemapPath, "sitemap.xml")

if (html) {
  if (/%SEO_[A-Z_]+%/.test(html)) {
    errors.push("Built index.html contains unresolved SEO template tokens")
  }

  if (/<div\s+id="root">\s*<\/div>/.test(html)) {
    errors.push("Built index.html contains an empty application root")
  }

  if (!/<div\s+id="root">[\s\S]*<h1\b/.test(html)) {
    errors.push("Built index.html is missing pre-rendered primary content")
  }

  if (!html.includes(`<link rel="canonical" href="${canonicalSiteUrl}"`)) {
    errors.push("Built index.html is missing the canonical site URL")
  }

  if (!html.includes(`<title>${seoConfig.title}</title>`)) {
    errors.push("Built index.html is missing the configured SEO title")
  }

  if (!html.includes('type="application/ld+json"')) {
    errors.push("Built index.html is missing JSON-LD structured data")
  }

  if (
    !/<style\b[^>]*\bdata-landing-style-guard\b[^>]*>[\s\S]*?visibility\s*:\s*var\(\s*--landing-root-visibility\s*,\s*hidden\s*\)[\s\S]*?<\/style>/i.test(
      html,
    )
  ) {
    errors.push("Built index.html is missing the default-hidden style readiness guard")
  }

  const stylesheetTags = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) =>
      (getAttribute(tag, "rel") ?? "").toLowerCase().split(/\s+/).includes("stylesheet"),
    )
  const stylesheetSources = stylesheetTags.flatMap((tag) => {
    const href = getAttribute(tag, "href")

    if (!href || !href.startsWith("/") || href.includes("?") || href.includes("#")) {
      errors.push(`Built stylesheet must use a local root-relative URL: ${href ?? "missing href"}`)
      return []
    }

    const stylesheetPath = resolve(distRoot, `.${href}`)
    const stylesheetFromDistRoot = relative(distRoot, stylesheetPath)
    const stylesheetEscapesDistRoot =
      stylesheetFromDistRoot === ".." ||
      stylesheetFromDistRoot.startsWith(`..${sep}`) ||
      isAbsolute(stylesheetFromDistRoot)

    if (stylesheetEscapesDistRoot) {
      errors.push(`Built stylesheet escapes the output directory: ${href}`)
      return []
    }

    const source = readBuildFile(stylesheetPath, `stylesheet ${href}`)

    return source === null ? [] : [source]
  })

  if (stylesheetSources.length === 0) {
    errors.push("Built index.html is missing its compiled stylesheet")
  } else if (
    !stylesheetSources.some(
      (source) =>
        /--landing-root-visibility\s*:\s*visible\s*;?/.test(source) &&
        /--landing-style-readiness\s*:\s*ready\s*;?/.test(source),
    )
  ) {
    errors.push("Built stylesheet does not reveal the root and unlock entrance motion")
  }
}

if (robotsTxt !== null && robotsTxt !== createRobotsTxt()) {
  errors.push("Built robots.txt does not match the generated crawl policy")
}

if (sitemapXml !== null && sitemapXml !== createSitemapXml()) {
  errors.push("Built sitemap.xml does not match the generated sitemap")
}

if (errors.length > 0) {
  throw new Error(`Landing build validation failed:\n- ${errors.join("\n- ")}`)
}

console.log(
  "Validated pre-rendered build markup, style readiness, canonical metadata, structured data, robots.txt, and sitemap.xml.",
)
