import { existsSync, readFileSync } from "node:fs"
import { isAbsolute, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

import { siteConfig } from "../src/config/site"
import { seoConfig } from "../src/config/seo"
import {
  canonicalSiteUrl,
  createRobotsTxt,
  createSitemapXml,
  createStructuredData,
  renderSeoTemplate,
  sitemapUrl,
  socialImageUrl,
} from "../src/lib/seo"

const appRoot = fileURLToPath(new URL("../", import.meta.url))
const htmlTemplate = readFileSync(resolve(appRoot, "index.html"), "utf8")
const html = renderSeoTemplate(htmlTemplate)
const doctypeMatches = [...html.matchAll(/<!doctype\s+html\s*>/gi)]
const errors: string[] = []

function getTags(tagName: string) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "gi"))].map((match) => match[0])
}

function getAttribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`, "i"))

  return match?.[1] ?? match?.[2]
}

function findTagsByAttribute(tags: readonly string[], name: string, value: string) {
  return tags.filter((tag) => getAttribute(tag, name)?.toLowerCase() === value.toLowerCase())
}

function validateMetadata(
  tags: readonly string[],
  attributeName: string,
  attributeValue: string,
  expectedContent: string,
) {
  const matches = findTagsByAttribute(tags, attributeName, attributeValue)

  if (matches.length !== 1 || getAttribute(matches[0] ?? "", "content") !== expectedContent) {
    errors.push(
      `Document metadata ${attributeName}=${attributeValue} must equal: ${expectedContent}`,
    )
  }
}

function readPngDimensions(filePath: string) {
  const header = readFileSync(filePath).subarray(0, 24)

  if (header.length < 24 || header.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    return null
  }

  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20),
  }
}

const htmlTags = getTags("html")
const headTags = getTags("head")
const bodyTags = getTags("body")
const htmlTag = htmlTags[0]
const titleMatches = [...html.matchAll(/<title>([\s\S]*?)<\/title>/gi)]
const title = titleMatches[0]?.[1]?.trim() ?? ""
const metaTags = getTags("meta")
const linkTags = getTags("link")
const scriptTags = getTags("script")
const rootTags = getTags("div").filter((tag) => getAttribute(tag, "id") === "root")
const charsetMetas = metaTags.filter((tag) => getAttribute(tag, "charset") !== undefined)
const descriptionMetas = findTagsByAttribute(metaTags, "name", "description")
const viewportMetas = findTagsByAttribute(metaTags, "name", "viewport")
const themeColorMetas = findTagsByAttribute(metaTags, "name", "theme-color")
const canonicalLinks = linkTags.filter((tag) =>
  (getAttribute(tag, "rel") ?? "").toLowerCase().split(/\s+/).includes("canonical"),
)
const faviconLinks = linkTags.filter((tag) =>
  (getAttribute(tag, "rel") ?? "").toLowerCase().split(/\s+/).includes("icon"),
)
const heroPreloads = linkTags.filter(
  (tag) =>
    (getAttribute(tag, "rel") ?? "").toLowerCase().split(/\s+/).includes("preload") &&
    getAttribute(tag, "as")?.toLowerCase() === "image" &&
    getAttribute(tag, "href") === siteConfig.hero.brand.src,
)
const entryScripts = scriptTags.filter((tag) => getAttribute(tag, "src") === "/src/main.tsx")
const structuredDataMatches = [
  ...html.matchAll(
    /<script\s+type=(?:"application\/ld\+json"|'application\/ld\+json')>([\s\S]*?)<\/script>/gi,
  ),
]
const styleGuardMatches = [
  ...html.matchAll(/<style\b[^>]*\bdata-landing-style-guard\b[^>]*>([\s\S]*?)<\/style>/gi),
]
const descriptionMeta = descriptionMetas[0]
const viewportMeta = viewportMetas[0]
const themeColorMeta = themeColorMetas[0]
const faviconLink = faviconLinks[0]
const heroPreload = heroPreloads[0]
const entryScript = entryScripts[0]

if (doctypeMatches.length !== 1 || !/^\s*<!doctype\s+html\s*>/i.test(html)) {
  errors.push("Document must begin with exactly one HTML5 doctype")
}

if (htmlTags.length !== 1 || !htmlTag || getAttribute(htmlTag, "lang") !== siteConfig.locale) {
  errors.push(`Document language must match the site locale: ${siteConfig.locale}`)
}

if (headTags.length !== 1 || bodyTags.length !== 1) {
  errors.push("Document must contain exactly one head and one body")
}

if (titleMatches.length !== 1 || title !== seoConfig.title) {
  errors.push(`Document must contain the configured SEO title: ${seoConfig.title}`)
}

if (
  charsetMetas.length !== 1 ||
  getAttribute(charsetMetas[0] ?? "", "charset")?.toLowerCase() !== "utf-8"
) {
  errors.push("Document must contain exactly one UTF-8 charset declaration")
}

if (
  descriptionMetas.length !== 1 ||
  getAttribute(descriptionMeta ?? "", "content") !== seoConfig.description
) {
  errors.push("Document description metadata must match the SEO configuration")
}

if (
  viewportMetas.length !== 1 ||
  !getAttribute(viewportMeta ?? "", "content")?.includes("width=device-width")
) {
  errors.push("Document must contain exactly one responsive viewport metadata tag")
}

if (
  themeColorMetas.length !== 1 ||
  getAttribute(themeColorMeta ?? "", "content") !== seoConfig.themeColor
) {
  errors.push("Document theme color metadata must match the SEO configuration")
}

if (
  canonicalLinks.length !== 1 ||
  getAttribute(canonicalLinks[0] ?? "", "href") !== canonicalSiteUrl
) {
  errors.push(`Document canonical link must reference: ${canonicalSiteUrl}`)
}

validateMetadata(metaTags, "name", "robots", seoConfig.robots)
validateMetadata(metaTags, "property", "og:type", "website")
validateMetadata(metaTags, "property", "og:site_name", seoConfig.name)
validateMetadata(metaTags, "property", "og:title", seoConfig.title)
validateMetadata(metaTags, "property", "og:description", seoConfig.description)
validateMetadata(metaTags, "property", "og:url", canonicalSiteUrl)
validateMetadata(metaTags, "property", "og:locale", seoConfig.openGraphLocale)
validateMetadata(metaTags, "property", "og:image", socialImageUrl)
validateMetadata(metaTags, "property", "og:image:type", seoConfig.socialImage.type)
validateMetadata(metaTags, "property", "og:image:width", String(seoConfig.socialImage.width))
validateMetadata(metaTags, "property", "og:image:height", String(seoConfig.socialImage.height))
validateMetadata(metaTags, "property", "og:image:alt", seoConfig.socialImage.alt)
validateMetadata(metaTags, "name", "twitter:card", "summary")
validateMetadata(metaTags, "name", "twitter:title", seoConfig.title)
validateMetadata(metaTags, "name", "twitter:description", seoConfig.description)
validateMetadata(metaTags, "name", "twitter:image", socialImageUrl)
validateMetadata(metaTags, "name", "twitter:image:alt", seoConfig.socialImage.alt)

if (
  faviconLinks.length !== 1 ||
  !faviconLink ||
  getAttribute(faviconLink, "href") !== "/favicon.png" ||
  getAttribute(faviconLink, "type") !== "image/png"
) {
  errors.push("Document favicon link must reference /favicon.png as image/png")
}

if (
  heroPreloads.length !== 1 ||
  !heroPreload ||
  getAttribute(heroPreload, "type") !== "image/png" ||
  getAttribute(heroPreload, "fetchpriority") !== "high"
) {
  errors.push(`Document must preload the hero artwork: ${siteConfig.hero.brand.src}`)
}

if (rootTags.length !== 1) {
  errors.push("Document must contain exactly one #root mount point")
}

if (
  styleGuardMatches.length !== 1 ||
  !/visibility\s*:\s*var\(\s*--landing-root-visibility\s*,\s*hidden\s*\)/.test(
    styleGuardMatches[0]?.[1] ?? "",
  )
) {
  errors.push("Document must hide the application root until the landing stylesheet is ready")
}

if (structuredDataMatches.length !== 1) {
  errors.push("Document must contain exactly one JSON-LD structured data block")
} else {
  try {
    const structuredData: unknown = JSON.parse(structuredDataMatches[0]?.[1] ?? "")

    if (JSON.stringify(structuredData) !== JSON.stringify(createStructuredData())) {
      errors.push("Document JSON-LD must match the generated structured data")
    }
  } catch {
    errors.push("Document JSON-LD must contain valid JSON")
  }
}

const publicRoot = resolve(appRoot, "public")
const socialImagePath = resolve(publicRoot, `.${seoConfig.socialImage.src}`)
const socialImageFromPublicRoot = relative(publicRoot, socialImagePath)
const socialImageEscapesPublicRoot =
  socialImageFromPublicRoot === ".." ||
  socialImageFromPublicRoot.startsWith(`..${sep}`) ||
  isAbsolute(socialImageFromPublicRoot)

if (!seoConfig.socialImage.src.startsWith("/") || socialImageEscapesPublicRoot) {
  errors.push(`SEO social image must use a safe public-root path: ${seoConfig.socialImage.src}`)
} else if (!existsSync(socialImagePath)) {
  errors.push(`SEO social image is missing: ${seoConfig.socialImage.src}`)
} else {
  const dimensions = readPngDimensions(socialImagePath)

  if (
    seoConfig.socialImage.type !== "image/png" ||
    !dimensions ||
    dimensions.width !== seoConfig.socialImage.width ||
    dimensions.height !== seoConfig.socialImage.height
  ) {
    errors.push(
      `SEO social image must be a ${seoConfig.socialImage.width}x${seoConfig.socialImage.height} PNG`,
    )
  }
}

const robotsTxt = createRobotsTxt()
const sitemapXml = createSitemapXml()

if (!robotsTxt.includes(`Sitemap: ${sitemapUrl}`)) {
  errors.push("Generated robots.txt must reference the canonical sitemap URL")
}

if (!sitemapXml.includes(`<loc>${canonicalSiteUrl}</loc>`)) {
  errors.push("Generated sitemap.xml must include the canonical site URL")
}

if (entryScripts.length !== 1 || !entryScript || getAttribute(entryScript, "type") !== "module") {
  errors.push("Document must contain exactly one module entry script")
}

if (errors.length > 0) {
  throw new Error(`Landing document validation failed:\n- ${errors.join("\n- ")}`)
}

console.log(
  "Validated document language, SEO metadata, structured data, crawl assets, resources, application mount point, and style readiness guard.",
)
