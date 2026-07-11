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
const externalLinkTags = [...html.matchAll(/<a\b[^>]*\starget="_blank"[^>]*>/g)].map(
  (match) => match[0],
)
const errors: string[] = []

function findMissingTargets(targets: readonly string[]) {
  return [...new Set(targets.filter((target) => target && !idSet.has(target)))]
}

const missingFragments = findMissingTargets(fragmentTargets)
const missingLabels = findMissingTargets(labelledByTargets)
const missingDescriptions = findMissingTargets(describedByTargets)
const imagesWithoutAlt = imageTags.filter((tag) => !/\salt="[^"]*"/.test(tag))
const unsafeExternalLinks = externalLinkTags.filter(
  (tag) => !/\srel="[^"]*\bnoreferrer\b[^"]*"/.test(tag),
)

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

if (unsafeExternalLinks.length > 0) {
  errors.push(`${unsafeExternalLinks.length} external links are missing noreferrer`)
}

if (errors.length > 0) {
  throw new Error(`Landing markup validation failed:\n- ${errors.join("\n- ")}`)
}

console.log(
  `Validated static markup with ${ids.length} IDs, ${fragmentTargets.length} fragment links, and ${imageTags.length} images.`,
)
