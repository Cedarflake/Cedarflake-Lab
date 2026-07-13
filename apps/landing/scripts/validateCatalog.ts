import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { extname, isAbsolute, relative, resolve, sep } from "node:path"
import { inflateSync } from "node:zlib"

import { parse } from "parse5"
import type { DefaultTreeAdapterTypes, ParserError } from "parse5"

import { projectCatalog } from "../src/config/projects"
import { workbenchCategories } from "../src/config/projects/workbench"
import { siteConfig } from "../src/config/site"
import { validateProjectCatalog } from "../src/lib/projectCatalog"
import type { ProjectCover, ProjectEntry } from "../src/types/project"
import { appRoot, repositoryRoot, validationContext } from "./repositoryContext"
import { getVisibleMarkdownLines, isSvgDocument } from "./validationText"

interface DeploymentCopy {
  canonicalRelativePath: string
  deployedPath: string
  label: string
  mustBeSquare?: boolean
}

const publicRoot = resolve(appRoot, "public")
const projectPathRoot = repositoryRoot ?? appRoot
const errors: string[] = []
const projects: readonly ProjectEntry[] = projectCatalog
const workbenchCategoryKeys = new Set<string>()
const workbenchCategoryTitles = new Set<string>()
const referencedCoverSources = new Set<string>()
const coverProjectBySource = new Map<string, string>()
const catalogProjectPaths = new Set(projects.map((project) => project.path))
const catalogCoverageExclusions = new Set(["apps/landing"])
const projectPublicDirectories = new Map<string, string>([["apps/copilot-task", "assets"]])
const genericDocumentTitles = new Set(["app", "react app", "vite + react + ts"])
const genericDocumentDescriptions = new Set([
  "description",
  "website",
  "web site created using create-react-app",
  "a vite + react + typescript project",
])

function resolveWithin(root: string, relativePath: string, label: string) {
  const targetPath = resolve(root, relativePath)
  const pathFromRoot = relative(root, targetPath)

  if (pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
    errors.push(`${label} escapes its allowed root: ${relativePath}`)
    return null
  }

  return targetPath
}

function isFile(filePath: string) {
  return existsSync(filePath) && statSync(filePath).isFile()
}

function isDirectory(directoryPath: string) {
  return existsSync(directoryPath) && statSync(directoryPath).isDirectory()
}

interface HtmlDocumentSections {
  head: DefaultTreeAdapterTypes.Element
  htmlElement: DefaultTreeAdapterTypes.Element
}

interface HtmlDocumentAnalysis {
  parseErrors: readonly ParserError[]
  sections: HtmlDocumentSections | null
}

function isHtmlElement(
  node: DefaultTreeAdapterTypes.ChildNode,
): node is DefaultTreeAdapterTypes.Element {
  return "tagName" in node
}

function isHtmlTextNode(
  node: DefaultTreeAdapterTypes.ChildNode,
): node is DefaultTreeAdapterTypes.TextNode {
  return node.nodeName === "#text"
}

function getDirectHtmlElements(parent: DefaultTreeAdapterTypes.ParentNode, tagName: string) {
  return parent.childNodes
    .filter(isHtmlElement)
    .filter((element) => element.tagName.toLowerCase() === tagName.toLowerCase())
}

function readHtmlAttribute(element: DefaultTreeAdapterTypes.Element, name: string) {
  return element.attrs.find((attribute) => attribute.name.toLowerCase() === name.toLowerCase())
    ?.value
}

function analyzeHtmlDocument(html: string): HtmlDocumentAnalysis {
  const parseErrors: ParserError[] = []
  const document = parse(html, {
    onParseError: (error) => parseErrors.push(error),
    sourceCodeLocationInfo: true,
  })
  const htmlElements = getDirectHtmlElements(document, "html").filter(
    (element) => element.sourceCodeLocation,
  )

  if (htmlElements.length !== 1) {
    return { parseErrors, sections: null }
  }

  const htmlElement = htmlElements[0]

  if (!htmlElement) {
    return { parseErrors, sections: null }
  }

  const heads = getDirectHtmlElements(htmlElement, "head").filter(
    (element) => element.sourceCodeLocation,
  )
  const head = heads[0]

  if (heads.length !== 1 || !head) {
    return { parseErrors, sections: null }
  }

  return { parseErrors, sections: { head, htmlElement } }
}

function getMetaContents(
  head: DefaultTreeAdapterTypes.Element,
  attributeName: "name" | "property",
  attributeValue: string,
) {
  return getDirectHtmlElements(head, "meta")
    .filter(
      (element) =>
        readHtmlAttribute(element, attributeName)?.toLowerCase() === attributeValue.toLowerCase(),
    )
    .map((element) => readHtmlAttribute(element, "content"))
}

function getLinkHrefs(head: DefaultTreeAdapterTypes.Element, rel: string) {
  return getDirectHtmlElements(head, "link")
    .filter((element) =>
      (readHtmlAttribute(element, "rel") ?? "")
        .toLowerCase()
        .split(/\s+/)
        .includes(rel.toLowerCase()),
    )
    .map((element) => readHtmlAttribute(element, "href"))
}

function getDocumentTitles(head: DefaultTreeAdapterTypes.Element) {
  return getDirectHtmlElements(head, "title").map((title) =>
    title.childNodes
      .filter(isHtmlTextNode)
      .map((node) => node.value)
      .join("")
      .trim(),
  )
}

function readSingleValue(values: readonly (string | undefined)[], label: string) {
  const value = values[0]?.trim()

  if (values.length !== 1 || !value) {
    errors.push(`${label} must appear exactly once with a non-empty value`)
    return null
  }

  return value
}

function validateExactValue(
  values: readonly (string | undefined)[],
  expected: string,
  label: string,
) {
  if (values.length !== 1 || values[0] !== expected) {
    errors.push(`${label} must equal ${expected}`)
  }
}

function getProjectPublicDirectoryName(projectPath: string) {
  return projectPublicDirectories.get(projectPath) ?? "public"
}

interface RobotsGroup {
  policies: readonly ("allow" | "disallow")[]
  userAgents: readonly string[]
}

function parseRobotsGroups(robots: string) {
  const groups: RobotsGroup[] = []
  let userAgents: string[] = []
  let policies: ("allow" | "disallow")[] = []
  let hasDirective = false

  const flushGroup = () => {
    if (userAgents.length > 0) {
      groups.push({ policies, userAgents })
    }

    userAgents = []
    policies = []
    hasDirective = false
  }

  for (const rawLine of robots.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim()

    if (!line) {
      flushGroup()
      continue
    }

    const separatorIndex = line.indexOf(":")

    if (separatorIndex < 0) {
      hasDirective = userAgents.length > 0
      continue
    }

    const name = line.slice(0, separatorIndex).trim().toLowerCase()
    const value = line
      .slice(separatorIndex + 1)
      .trim()
      .toLowerCase()

    if (name === "user-agent") {
      if (hasDirective) {
        flushGroup()
      }

      if (value) {
        userAgents.push(value)
      }

      continue
    }

    if (userAgents.length === 0) {
      continue
    }

    hasDirective = true

    if (name === "allow" || name === "disallow") {
      policies.push(name)
    }
  }

  flushGroup()

  return groups
}

function validateRobotsFile(
  projectPath: string,
  projectDirectory: string,
  publicDirectoryName: string,
) {
  const robotsPath = resolve(projectDirectory, publicDirectoryName, "robots.txt")

  if (!isFile(robotsPath)) {
    errors.push(
      `Live project ${projectPath} must own ${publicDirectoryName}/robots.txt in its deployed public directory`,
    )
    return
  }

  const robots = readFileSync(robotsPath, "utf8")
  const wildcardGroups = parseRobotsGroups(robots).filter((group) => group.userAgents.includes("*"))

  if (wildcardGroups.length === 0 || wildcardGroups.every((group) => group.policies.length === 0)) {
    errors.push(`Live project ${projectPath} robots.txt must declare a public crawler policy`)
  }
}

function resolveProjectPublicAsset(
  projectDirectory: string,
  publicDirectoryName: string,
  publicUrl: string | undefined,
) {
  if (!publicUrl?.startsWith("/")) {
    return null
  }

  const encodedAssetPath = publicUrl.slice(1).split(/[?#]/, 1)[0]

  if (!encodedAssetPath) {
    return null
  }

  let relativeAssetPath: string

  try {
    relativeAssetPath = decodeURIComponent(encodedAssetPath)
  } catch {
    return null
  }

  const publicDirectory = resolve(projectDirectory, publicDirectoryName)
  const assetPath = resolve(publicDirectory, relativeAssetPath)
  const pathFromPublicDirectory = relative(publicDirectory, assetPath)

  if (
    pathFromPublicDirectory === ".." ||
    pathFromPublicDirectory.startsWith(`..${sep}`) ||
    isAbsolute(pathFromPublicDirectory) ||
    !isFile(assetPath)
  ) {
    return null
  }

  return assetPath
}

function isValidDocumentIcon(filePath: string) {
  const extension = extname(filePath).toLowerCase()
  const contents = readFileSync(filePath)

  if (extension === ".svg") {
    return isSvgDocument(contents.toString("utf8"))
  }

  if (extension === ".ico") {
    if (contents.length < 6) {
      return false
    }

    const imageCount = contents.readUInt16LE(4)

    return (
      contents.readUInt16LE(0) === 0 &&
      contents.readUInt16LE(2) === 1 &&
      imageCount > 0 &&
      contents.length >= 6 + imageCount * 16
    )
  }

  if (extension === ".png") {
    return contents.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"
  }

  if (extension === ".jpg" || extension === ".jpeg") {
    return (
      contents.length >= 4 &&
      contents.subarray(0, 2).toString("hex") === "ffd8" &&
      contents.subarray(-2).toString("hex") === "ffd9"
    )
  }

  if (extension === ".gif") {
    return ["GIF87a", "GIF89a"].includes(contents.subarray(0, 6).toString("ascii"))
  }

  if (extension === ".webp") {
    return (
      contents.length >= 12 &&
      contents.subarray(0, 4).toString("ascii") === "RIFF" &&
      contents.subarray(8, 12).toString("ascii") === "WEBP"
    )
  }

  return false
}

function validateLiveDocument(projectPath: string, projectDirectory: string, liveUrl: string) {
  const indexPath = resolve(projectDirectory, "index.html")
  const publicDirectoryName = getProjectPublicDirectoryName(projectPath)

  if (!isFile(indexPath)) {
    errors.push(`Live project ${projectPath} is missing its document metadata owner: index.html`)
    return
  }

  const html = readFileSync(indexPath, "utf8")
  const analysis = analyzeHtmlDocument(html)

  if (analysis.parseErrors.length > 0) {
    const errorCodes = [...new Set(analysis.parseErrors.map((error) => error.code))]

    errors.push(`Live project ${projectPath} HTML has parse errors: ${errorCodes.join(", ")}`)
  }

  if (!analysis.sections) {
    errors.push(
      `Live project ${projectPath} must contain exactly one rendered html element and head section`,
    )
    validateRobotsFile(projectPath, projectDirectory, publicDirectoryName)
    return
  }

  const { head, htmlElement } = analysis.sections
  const title = readSingleValue(getDocumentTitles(head), `${projectPath} document title`)
  const description = readSingleValue(
    getMetaContents(head, "name", "description"),
    `${projectPath} meta description`,
  )
  const language = readSingleValue(
    [readHtmlAttribute(htmlElement, "lang")],
    `${projectPath} document language`,
  )

  if (title && genericDocumentTitles.has(title.toLowerCase())) {
    errors.push(`${projectPath} document title is still a generic scaffold value`)
  }

  if (description && genericDocumentDescriptions.has(description.toLowerCase())) {
    errors.push(`${projectPath} meta description is still a generic scaffold value`)
  }

  if (language && !/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(language)) {
    errors.push(`${projectPath} document language is invalid: ${language}`)
  }

  validateExactValue(getLinkHrefs(head, "canonical"), liveUrl, `${projectPath} canonical URL`)
  const robotsMeta = readSingleValue(
    getMetaContents(head, "name", "robots"),
    `${projectPath} robots meta`,
  )

  if (robotsMeta) {
    const robotsDirectives = new Set(
      robotsMeta
        .toLowerCase()
        .split(",")
        .map((directive) => directive.trim()),
    )
    const indexingDirectives = ["index", "noindex"].filter((directive) =>
      robotsDirectives.has(directive),
    )
    const linkDirectives = ["follow", "nofollow"].filter((directive) =>
      robotsDirectives.has(directive),
    )

    if (indexingDirectives.length !== 1 || linkDirectives.length !== 1) {
      errors.push(`${projectPath} robots meta must declare indexing and link-following policy`)
    }
  }

  validateExactValue(
    getMetaContents(head, "property", "og:type"),
    "website",
    `${projectPath} og:type`,
  )
  validateExactValue(getMetaContents(head, "property", "og:url"), liveUrl, `${projectPath} og:url`)
  validateExactValue(
    getMetaContents(head, "name", "twitter:card"),
    "summary",
    `${projectPath} twitter:card`,
  )

  if (title) {
    validateExactValue(
      getMetaContents(head, "property", "og:title"),
      title,
      `${projectPath} og:title`,
    )
    validateExactValue(
      getMetaContents(head, "name", "twitter:title"),
      title,
      `${projectPath} twitter:title`,
    )
  }

  if (description) {
    validateExactValue(
      getMetaContents(head, "property", "og:description"),
      description,
      `${projectPath} og:description`,
    )
    validateExactValue(
      getMetaContents(head, "name", "twitter:description"),
      description,
      `${projectPath} twitter:description`,
    )
  }

  const hasValidIcon = getLinkHrefs(head, "icon").some((href) => {
    const iconPath = resolveProjectPublicAsset(projectDirectory, publicDirectoryName, href)

    return iconPath ? isValidDocumentIcon(iconPath) : false
  })

  if (!hasValidIcon) {
    errors.push(
      `Live project ${projectPath} must declare a valid icon from ${publicDirectoryName}/`,
    )
  }

  validateRobotsFile(projectPath, projectDirectory, publicDirectoryName)
}

function validateUserscriptInstallMetadata(projectPath: string, installUrl: string) {
  if (!repositoryRoot) {
    return
  }

  const rawMainPrefix = "https://raw.githubusercontent.com/Cedarflake/Cedarflake-Lab/main/"

  if (!installUrl.startsWith(rawMainPrefix)) {
    return
  }

  let artifactRelativePath: string

  try {
    artifactRelativePath = decodeURIComponent(installUrl.slice(rawMainPrefix.length))
  } catch {
    errors.push(`Project ${projectPath} Install URL contains invalid path encoding`)
    return
  }

  const projectArtifactPrefix = `${projectPath}/`

  if (
    !artifactRelativePath.startsWith(projectArtifactPrefix) ||
    !artifactRelativePath.endsWith(".user.js")
  ) {
    errors.push(`Project ${projectPath} Install URL must target an owned .user.js artifact`)
    return
  }

  const artifactProjectDirectory = resolveWithin(
    repositoryRoot,
    projectPath,
    `Project ${projectPath} Install owner`,
  )

  if (!artifactProjectDirectory) {
    return
  }

  const artifactPath = resolveWithin(
    artifactProjectDirectory,
    artifactRelativePath.slice(projectArtifactPrefix.length),
    `Project ${projectPath} Install artifact`,
  )

  if (!artifactPath || !isFile(artifactPath)) {
    errors.push(`Project ${projectPath} Install artifact is missing`)
    return
  }

  const artifact = readFileSync(artifactPath, "utf8")
  const artifactLines = artifact.split(/\r?\n/)
  const blockStarts = artifactLines.flatMap((line, index) =>
    /^\s*\/\/\s*==UserScript==\s*$/.test(line) ? [index] : [],
  )
  const blockEnds = artifactLines.flatMap((line, index) =>
    /^\s*\/\/\s*==\/UserScript==\s*$/.test(line) ? [index] : [],
  )
  const blockStart = blockStarts[0]
  const blockEnd = blockEnds[0]

  if (
    blockStarts.length !== 1 ||
    blockEnds.length !== 1 ||
    blockStart === undefined ||
    blockEnd === undefined ||
    blockStart >= blockEnd
  ) {
    errors.push(
      `Project ${projectPath} Install artifact must contain one userscript metadata block`,
    )
    return
  }

  const metadataLines = artifactLines.slice(blockStart + 1, blockEnd)

  for (const metadataName of ["downloadURL", "updateURL"]) {
    const metadataValues = metadataLines.flatMap((line) => {
      const match = line.match(new RegExp(`^\\s*//\\s*@${metadataName}\\s+(\\S+)\\s*$`))

      return match?.[1] ? [match[1]] : []
    })

    if (metadataValues.length !== 1 || metadataValues[0] !== installUrl) {
      errors.push(`Project ${projectPath} @${metadataName} does not match its Install URL`)
    }
  }
}

function getMarkdownUrls(markdown: string) {
  const visibleMarkdown = getVisibleMarkdownLines(markdown).join("\n")
  const urls = visibleMarkdown.match(/https:\/\/[^\s<>()\[\]`"'，。；、！？]+/g) ?? []

  return new Set(urls.map((url) => url.replace(/[.,;:!?]+$/, "")))
}

function splitMarkdownTableRow(line: string) {
  const trimmedLine = line.trim()

  if (!trimmedLine.startsWith("|")) {
    return null
  }

  const row = trimmedLine.endsWith("|") ? trimmedLine.slice(1, -1) : trimmedLine.slice(1)
  const cells: string[] = []
  let cell = ""
  let isEscaped = false

  for (const character of row) {
    if (isEscaped) {
      cell += character
      isEscaped = false
      continue
    }

    if (character === "\\") {
      isEscaped = true
      continue
    }

    if (character === "|") {
      cells.push(cell.trim())
      cell = ""
      continue
    }

    cell += character
  }

  cells.push(cell.trim())

  return cells
}

function getRootReadmeLiveCells(markdown: string, projectPath: string) {
  const lines = getVisibleMarkdownLines(markdown)

  for (const [lineIndex, line] of lines.entries()) {
    const header = splitMarkdownTableRow(line)

    if (!header) {
      continue
    }

    const normalizedHeader = header.map((cell) => cell.trim().toLowerCase())
    const pathColumn = normalizedHeader.indexOf("path")
    const liveColumn = normalizedHeader.indexOf("live")

    if (pathColumn < 0 || liveColumn < 0) {
      continue
    }

    const separator = splitMarkdownTableRow(lines[lineIndex + 1] ?? "")

    if (
      !separator ||
      separator.length !== header.length ||
      !separator.every((cell) => /^:?-{3,}:?$/.test(cell))
    ) {
      continue
    }

    const liveCells: string[] = []

    for (const projectLine of lines.slice(lineIndex + 2)) {
      const row = splitMarkdownTableRow(projectLine)

      if (!row) {
        break
      }

      if (row[pathColumn] === `\`${projectPath}\``) {
        const liveCell = row[liveColumn]

        if (liveCell !== undefined) {
          liveCells.push(liveCell)
        }
      }
    }

    return liveCells
  }

  return []
}

function validateExternalActionContract(project: ProjectEntry, projectDirectory: string) {
  const action = project.externalAction

  if (!repositoryRoot || !action) {
    return
  }

  const projectReadmePath = resolve(projectDirectory, "README.md")
  const projectReadmeUrls = isFile(projectReadmePath)
    ? getMarkdownUrls(readFileSync(projectReadmePath, "utf8"))
    : new Set<string>()

  if (!projectReadmeUrls.has(action.url)) {
    errors.push(`Project ${project.path} README does not document its ${action.kind} URL`)
  }

  if (action.kind === "live" && project.kind === "app") {
    const rootReadmePath = resolve(repositoryRoot, "README.md")
    const liveCells = isFile(rootReadmePath)
      ? getRootReadmeLiveCells(readFileSync(rootReadmePath, "utf8"), project.path)
      : []
    const liveCellUrls = getMarkdownUrls(liveCells[0] ?? "")
    const hasMatchingRootReadmeRow =
      liveCells.length === 1 && liveCellUrls.size === 1 && liveCellUrls.has(action.url)

    if (!hasMatchingRootReadmeRow) {
      errors.push(`Root README does not bind ${project.path} to its Live URL`)
    }

    validateLiveDocument(project.path, projectDirectory, action.url)
  }

  if (action.kind === "install" && project.path.startsWith("others/userscripts/")) {
    validateUserscriptInstallMetadata(project.path, action.url)
  }
}

function fileHash(filePath: string) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex")
}

function listFiles(directoryPath: string): string[] {
  return readdirSync(directoryPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directoryPath, entry.name)

    if (entry.isDirectory()) {
      return listFiles(entryPath)
    }

    return entry.isFile() ? [entryPath] : []
  })
}

function listDirectories(directoryPath: string) {
  if (!isDirectory(directoryPath)) {
    errors.push(`Project collection directory is missing: ${directoryPath}`)
    return []
  }

  return readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(directoryPath, entry.name))
}

function toRepositoryPath(directoryPath: string) {
  return relative(projectPathRoot, directoryPath).split(sep).join("/")
}

function discoverProjectPaths() {
  const discoveredPaths: string[] = []

  if (!repositoryRoot) {
    return discoveredPaths
  }

  for (const collection of ["apps", "packages"]) {
    discoveredPaths.push(
      ...listDirectories(resolve(repositoryRoot, collection)).map(toRepositoryPath),
    )
  }

  for (const collection of ["workbench", "others"]) {
    for (const categoryPath of listDirectories(resolve(repositoryRoot, collection))) {
      discoveredPaths.push(...listDirectories(categoryPath).map(toRepositoryPath))
    }
  }

  return discoveredPaths
}

function readPngDimensions(filePath: string) {
  const header = readFileSync(filePath).subarray(0, 24)
  const pngSignature = "89504e470d0a1a0a"

  if (header.length < 24 || header.subarray(0, 8).toString("hex") !== pngSignature) {
    return null
  }

  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20),
  }
}

function paethPredictor(left: number, above: number, upperLeft: number) {
  const estimate = left + above - upperLeft
  const leftDistance = Math.abs(estimate - left)
  const aboveDistance = Math.abs(estimate - above)
  const upperLeftDistance = Math.abs(estimate - upperLeft)

  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
    return left
  }

  return aboveDistance <= upperLeftDistance ? above : upperLeft
}

function getPngFilterPredictor(filterType: number, left: number, above: number, upperLeft: number) {
  switch (filterType) {
    case 0:
      return 0
    case 1:
      return left
    case 2:
      return above
    case 3:
      return Math.floor((left + above) / 2)
    case 4:
      return paethPredictor(left, above, upperLeft)
    default:
      return null
  }
}

function hasTransparentRgbaPixel(filePath: string) {
  try {
    const source = readFileSync(filePath)
    const pngSignature = "89504e470d0a1a0a"

    if (
      source.length < 33 ||
      source.subarray(0, 8).toString("hex") !== pngSignature ||
      source.toString("ascii", 12, 16) !== "IHDR"
    ) {
      return false
    }

    const width = source.readUInt32BE(16)
    const height = source.readUInt32BE(20)
    const bitDepth = source.readUInt8(24)
    const colorType = source.readUInt8(25)
    const interlaceMethod = source.readUInt8(28)

    if (width === 0 || height === 0 || bitDepth !== 8 || colorType !== 6 || interlaceMethod !== 0) {
      return false
    }

    const imageDataChunks: Buffer[] = []
    let chunkOffset = 8

    while (chunkOffset + 12 <= source.length) {
      const chunkLength = source.readUInt32BE(chunkOffset)
      const chunkType = source.toString("ascii", chunkOffset + 4, chunkOffset + 8)
      const dataStart = chunkOffset + 8
      const dataEnd = dataStart + chunkLength

      if (dataEnd + 4 > source.length) {
        return false
      }

      if (chunkType === "IDAT") {
        imageDataChunks.push(source.subarray(dataStart, dataEnd))
      }

      chunkOffset = dataEnd + 4

      if (chunkType === "IEND") {
        break
      }
    }

    if (imageDataChunks.length === 0) {
      return false
    }

    const bytesPerPixel = 4
    const rowLength = width * bytesPerPixel
    const inflated = inflateSync(Buffer.concat(imageDataChunks))
    const expectedLength = (rowLength + 1) * height

    if (inflated.length !== expectedLength) {
      return false
    }

    let previousRow = Buffer.alloc(rowLength)
    let currentRow = Buffer.alloc(rowLength)
    let sourceOffset = 0

    for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
      const filterType = inflated.readUInt8(sourceOffset)
      sourceOffset += 1

      for (let byteIndex = 0; byteIndex < rowLength; byteIndex += 1) {
        const encodedValue = inflated.readUInt8(sourceOffset)
        const left =
          byteIndex >= bytesPerPixel ? currentRow.readUInt8(byteIndex - bytesPerPixel) : 0
        const above = previousRow.readUInt8(byteIndex)
        const upperLeft =
          byteIndex >= bytesPerPixel ? previousRow.readUInt8(byteIndex - bytesPerPixel) : 0
        const predictor = getPngFilterPredictor(filterType, left, above, upperLeft)

        if (predictor === null) {
          return false
        }

        currentRow.writeUInt8((encodedValue + predictor) & 0xff, byteIndex)
        sourceOffset += 1
      }

      for (let alphaIndex = 3; alphaIndex < rowLength; alphaIndex += bytesPerPixel) {
        if (currentRow.readUInt8(alphaIndex) < 255) {
          return true
        }
      }

      const completedRow = previousRow
      previousRow = currentRow
      currentRow = completedRow
    }

    return false
  } catch {
    return false
  }
}

function validateCover(projectPath: string, cover: ProjectCover) {
  if (!cover.src.startsWith("/covers/")) {
    errors.push(`Project ${projectPath} cover must use the public covers directory: ${cover.src}`)
    return
  }

  const existingProjectPath = coverProjectBySource.get(cover.src)

  if (existingProjectPath) {
    errors.push(
      `Projects ${existingProjectPath} and ${projectPath} reuse the same cover: ${cover.src}`,
    )
  } else {
    coverProjectBySource.set(cover.src, projectPath)
  }

  referencedCoverSources.add(cover.src)

  const coverPath = resolveWithin(publicRoot, cover.src.slice(1), `Project ${projectPath} cover`)

  if (!coverPath) {
    return
  }

  if (!isFile(coverPath)) {
    errors.push(`Project ${projectPath} cover is missing: ${cover.src}`)
    return
  }

  if (extname(coverPath).toLowerCase() !== ".png") {
    errors.push(`Project ${projectPath} cover must be a PNG: ${cover.src}`)
    return
  }

  const dimensions = readPngDimensions(coverPath)

  if (!dimensions) {
    errors.push(`Project ${projectPath} cover is not a valid PNG: ${cover.src}`)
    return
  }

  if (dimensions.width !== cover.width || dimensions.height !== cover.height) {
    errors.push(
      `Project ${projectPath} cover dimensions are ${dimensions.width}x${dimensions.height}, expected ${cover.width}x${cover.height}`,
    )
  }
}

function validateWorkbenchExternalActionGuard() {
  const invalidWorkbenchProject = {
    title: "Invalid Workbench Action Fixture",
    path: "workbench/fixtures/invalid-external-action",
    updatedAt: "2026-07-13T00:00:00Z",
    summary: "Exercises the runtime guard for source-only workbench entries.",
    kind: "workbench",
    presentation: "workbench",
    section: "workbench",
    category: "fixtures",
    externalAction: {
      kind: "live",
      url: "https://example.com/",
    },
  } as const

  try {
    validateProjectCatalog([invalidWorkbenchProject as unknown as ProjectEntry])
    errors.push("Workbench externalAction guard accepted an invalid fixture")
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.startsWith("Workbench project cannot define externalAction:")
    ) {
      errors.push("Workbench externalAction guard returned an unexpected validation error")
    }
  }
}

validateProjectCatalog(projects)
validateWorkbenchExternalActionGuard()

const discoveredProjectPaths = discoverProjectPaths()

for (const projectPath of discoveredProjectPaths) {
  if (!catalogProjectPaths.has(projectPath) && !catalogCoverageExclusions.has(projectPath)) {
    errors.push(`Unlisted project directory: ${projectPath}`)
  }
}

for (const category of workbenchCategories) {
  const normalizedTitle = category.title.trim().toLowerCase()

  if ([category.key, category.title].some((value) => !value.trim())) {
    errors.push(`Workbench category has missing text: ${category.key || "unknown category"}`)
  }

  if (workbenchCategoryKeys.has(category.key)) {
    errors.push(`Duplicate workbench category key: ${category.key}`)
  }

  if (workbenchCategoryTitles.has(normalizedTitle)) {
    errors.push(`Duplicate workbench category title: ${category.title}`)
  }

  workbenchCategoryKeys.add(category.key)
  workbenchCategoryTitles.add(normalizedTitle)
}

for (const project of projects) {
  const resolvedProjectPath = resolveWithin(
    projectPathRoot,
    project.path,
    `Project ${project.path} path`,
  )

  if (repositoryRoot && resolvedProjectPath && !isDirectory(resolvedProjectPath)) {
    errors.push(`Project path is missing: ${project.path}`)
  }

  if (resolvedProjectPath && isDirectory(resolvedProjectPath)) {
    validateExternalActionContract(project, resolvedProjectPath)
  }

  if (project.showcase) {
    validateCover(project.path, project.showcase.cover)
  }

  if (project.presentation === "workbench" && !workbenchCategoryKeys.has(project.category)) {
    errors.push(`Project ${project.path} uses an unknown workbench category: ${project.category}`)
  }
}

const coverDirectory = resolve(publicRoot, "covers")

if (!isDirectory(coverDirectory)) {
  errors.push(`Public cover directory is missing: ${coverDirectory}`)
} else {
  for (const coverPath of listFiles(coverDirectory)) {
    const coverSource = `/${relative(publicRoot, coverPath).split(sep).join("/")}`

    if (!referencedCoverSources.has(coverSource)) {
      errors.push(`Unreferenced cover asset: ${coverSource}`)
    }
  }
}

const heroBrand = siteConfig.hero.brand
const brandPath = heroBrand.src.startsWith("/")
  ? resolveWithin(publicRoot, heroBrand.src.slice(1), "Hero brand image")
  : null

if (!brandPath) {
  errors.push(`Hero brand image must use a public-root path: ${heroBrand.src}`)
} else if (!isFile(brandPath)) {
  errors.push(`Hero brand image is missing: ${heroBrand.src}`)
} else {
  const dimensions = readPngDimensions(brandPath)

  if (!dimensions) {
    errors.push(`Hero brand image is not a valid PNG: ${heroBrand.src}`)
  } else if (
    !Number.isInteger(heroBrand.width) ||
    !Number.isInteger(heroBrand.height) ||
    heroBrand.width <= 0 ||
    heroBrand.height <= 0 ||
    dimensions.width !== heroBrand.width ||
    dimensions.height !== heroBrand.height
  ) {
    errors.push(
      `Hero brand image dimensions are ${dimensions.width}x${dimensions.height}, expected ${heroBrand.width}x${heroBrand.height}`,
    )
  } else if (!hasTransparentRgbaPixel(brandPath)) {
    errors.push(`Hero brand image must contain transparent pixels: ${heroBrand.src}`)
  }
}

const deploymentCopies: readonly DeploymentCopy[] = [
  {
    canonicalRelativePath: "assets/Lab.png",
    deployedPath: resolve(publicRoot, "Lab.png"),
    label: "Canonical Lab artwork",
  },
  {
    canonicalRelativePath: "assets/favicon.png",
    deployedPath: resolve(publicRoot, "favicon.png"),
    label: "Favicon",
    mustBeSquare: true,
  },
]

for (const copy of deploymentCopies) {
  if (!isFile(copy.deployedPath)) {
    errors.push(`${copy.label} deployment copy is missing: ${copy.deployedPath}`)
    continue
  }

  const deployedDimensions = readPngDimensions(copy.deployedPath)

  if (!deployedDimensions) {
    errors.push(`${copy.label} deployment copy is not a valid PNG`)
  }

  if (copy.mustBeSquare && deployedDimensions?.width !== deployedDimensions?.height) {
    errors.push(`${copy.label} deployment copy must be square`)
  }

  if (!repositoryRoot) {
    continue
  }

  const canonicalPath = resolve(repositoryRoot, copy.canonicalRelativePath)

  if (!isFile(canonicalPath)) {
    errors.push(`${copy.label} canonical asset is missing: ${canonicalPath}`)
    continue
  }

  const canonicalDimensions = readPngDimensions(canonicalPath)

  if (!canonicalDimensions) {
    errors.push(`${copy.label} canonical asset is not a valid PNG`)
  }

  if (copy.mustBeSquare && canonicalDimensions?.width !== canonicalDimensions?.height) {
    errors.push(`${copy.label} canonical asset must be square`)
  }

  if (fileHash(canonicalPath) !== fileHash(copy.deployedPath)) {
    errors.push(`${copy.label} deployment copy does not match its canonical asset`)
  }
}

if (errors.length > 0) {
  throw new Error(`Landing catalog validation failed:\n- ${errors.join("\n- ")}`)
}

const coverCount = projects.filter((project) => project.showcase).length

console.log(
  `Validated ${projects.length} catalog projects in ${validationContext} context across ${discoveredProjectPaths.length} repository directories, ${workbenchCategories.length} workbench categories, ${coverCount} covers, and ${deploymentCopies.length} deployment assets.`,
)
