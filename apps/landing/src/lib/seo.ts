import { seoConfig } from "../config/seo"

export const canonicalSiteUrl = new URL("/", seoConfig.siteUrl).href
export const socialImageUrl = new URL(seoConfig.socialImage.src, canonicalSiteUrl).href
export const sitemapUrl = new URL("sitemap.xml", canonicalSiteUrl).href

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

export function createStructuredData() {
  const websiteId = `${canonicalSiteUrl}#website`
  const webpageId = `${canonicalSiteUrl}#webpage`

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": websiteId,
        url: canonicalSiteUrl,
        name: seoConfig.name,
        alternateName: seoConfig.shortName,
        description: seoConfig.description,
        inLanguage: seoConfig.language,
      },
      {
        "@type": "CollectionPage",
        "@id": webpageId,
        url: canonicalSiteUrl,
        name: seoConfig.title,
        description: seoConfig.description,
        inLanguage: seoConfig.language,
        isPartOf: { "@id": websiteId },
        primaryImageOfPage: {
          "@type": "ImageObject",
          url: socialImageUrl,
          width: seoConfig.socialImage.width,
          height: seoConfig.socialImage.height,
        },
      },
    ],
  }
}

function serializeStructuredData() {
  return JSON.stringify(createStructuredData()).replaceAll("<", "\\u003c")
}

const seoTemplateValues = {
  "%SEO_TITLE%": escapeHtml(seoConfig.title),
  "%SEO_DESCRIPTION%": escapeHtml(seoConfig.description),
  "%SEO_ROBOTS%": escapeHtml(seoConfig.robots),
  "%SEO_THEME_COLOR%": escapeHtml(seoConfig.themeColor),
  "%SEO_SITE_NAME%": escapeHtml(seoConfig.name),
  "%SEO_SITE_URL%": escapeHtml(canonicalSiteUrl),
  "%SEO_LOCALE%": escapeHtml(seoConfig.openGraphLocale),
  "%SEO_SOCIAL_IMAGE_URL%": escapeHtml(socialImageUrl),
  "%SEO_SOCIAL_IMAGE_ALT%": escapeHtml(seoConfig.socialImage.alt),
  "%SEO_SOCIAL_IMAGE_WIDTH%": String(seoConfig.socialImage.width),
  "%SEO_SOCIAL_IMAGE_HEIGHT%": String(seoConfig.socialImage.height),
  "%SEO_SOCIAL_IMAGE_TYPE%": escapeHtml(seoConfig.socialImage.type),
  "%SEO_JSON_LD%": serializeStructuredData(),
} as const

const seoTokenPattern = /%SEO_[A-Z_]+%/g

export function renderSeoTemplate(html: string) {
  return html.replace(seoTokenPattern, (token) => {
    const replacement = seoTemplateValues[token as keyof typeof seoTemplateValues]

    if (replacement === undefined) {
      throw new Error(`Unknown SEO template token: ${token}`)
    }

    return replacement
  })
}

export function createRobotsTxt() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`
}

export function createSitemapXml() {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    "  <url>",
    `    <loc>${escapeXml(canonicalSiteUrl)}</loc>`,
    "  </url>",
    "</urlset>",
    "",
  ].join("\n")
}
