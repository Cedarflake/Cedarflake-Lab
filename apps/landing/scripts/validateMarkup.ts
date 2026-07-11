import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { App } from "../src/App"

const html = renderToStaticMarkup(createElement(App))
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1] ?? "")
const idSet = new Set(ids)
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))]
const fragmentTargets = [...html.matchAll(/\shref="#([^"]+)"/g)].map((match) => match[1] ?? "")
const labelledByTargets = [...html.matchAll(/\saria-labelledby="([^"]+)"/g)].flatMap((match) =>
  (match[1] ?? "").split(" "),
)
const describedByTargets = [...html.matchAll(/\saria-describedby="([^"]+)"/g)].flatMap((match) =>
  (match[1] ?? "").split(" "),
)
const imageTags = [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0])
const buttonMatches = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
const externalLinkTags = [...html.matchAll(/<a\b[^>]*\starget="_blank"[^>]*>/g)].map(
  (match) => match[0],
)
const headingLevels = [...html.matchAll(/<h([1-6])\b/g)].map((match) =>
  Number.parseInt(match[1] ?? "0", 10),
)
const errors: string[] = []

function findMissingTargets(targets: readonly string[]) {
  return [...new Set(targets.filter((target) => target && !idSet.has(target)))]
}

const missingFragments = findMissingTargets(fragmentTargets)
const missingLabels = findMissingTargets(labelledByTargets)
const missingDescriptions = findMissingTargets(describedByTargets)
const imagesWithoutAlt = imageTags.filter((tag) => !/\salt="[^"]*"/.test(tag))
const unnamedButtons = buttonMatches.filter((match) => {
  const attributes = match[1] ?? ""
  const textContent = (match[2] ?? "").replace(/<[^>]+>/g, "").trim()

  return !/\saria-label="[^"]+"/.test(attributes) && !textContent
})
const untypedButtons = buttonMatches.filter(
  (match) => !/\stype="(?:button|submit|reset)"/.test(match[1] ?? ""),
)
const unsafeExternalLinks = externalLinkTags.filter(
  (tag) => !/\srel="[^"]*\bnoreferrer\b[^"]*"/.test(tag),
)
const headingJumps = headingLevels.filter((level, index) => {
  const previousLevel = headingLevels[index - 1]

  return previousLevel !== undefined && level > previousLevel + 1
})

if (duplicateIds.length > 0) {
  errors.push(`Duplicate IDs: ${duplicateIds.join(", ")}`)
}

if (missingFragments.length > 0) {
  errors.push(`Missing fragment targets: ${missingFragments.join(", ")}`)
}

if (missingLabels.length > 0) {
  errors.push(`Missing aria-labelledby targets: ${missingLabels.join(", ")}`)
}

if (missingDescriptions.length > 0) {
  errors.push(`Missing aria-describedby targets: ${missingDescriptions.join(", ")}`)
}

if (imagesWithoutAlt.length > 0) {
  errors.push(`${imagesWithoutAlt.length} images are missing alt text`)
}

if (headingLevels.filter((level) => level === 1).length !== 1) {
  errors.push("Static markup must contain exactly one h1")
}

if (headingJumps.length > 0) {
  errors.push(`${headingJumps.length} heading levels skip their expected hierarchy`)
}

if (unnamedButtons.length > 0) {
  errors.push(`${unnamedButtons.length} buttons are missing an accessible name`)
}

if (untypedButtons.length > 0) {
  errors.push(`${untypedButtons.length} buttons are missing an explicit type`)
}

if (unsafeExternalLinks.length > 0) {
  errors.push(`${unsafeExternalLinks.length} external links are missing noreferrer`)
}

if (errors.length > 0) {
  throw new Error(`Landing markup validation failed:\n- ${errors.join("\n- ")}`)
}

console.log(
  `Validated static markup with ${ids.length} IDs, ${fragmentTargets.length} fragment links, ${headingLevels.length} headings, ${buttonMatches.length} buttons, and ${imageTags.length} images.`,
)
