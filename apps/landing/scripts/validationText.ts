function isDocumentWhitespace(character: string | undefined) {
  return (
    character === " " ||
    character === "\t" ||
    character === "\n" ||
    character === "\r" ||
    character === "\f"
  )
}

function skipDocumentWhitespace(source: string, start: number) {
  let cursor = start

  while (isDocumentWhitespace(source[cursor])) {
    cursor += 1
  }

  return cursor
}

function findTagEnd(source: string, start: number) {
  let quoteCharacter: '"' | "'" | null = null

  for (let cursor = start; cursor < source.length; cursor += 1) {
    const character = source[cursor]

    if (quoteCharacter) {
      if (character === quoteCharacter) {
        quoteCharacter = null
      }

      continue
    }

    if (character === '"' || character === "'") {
      quoteCharacter = character
      continue
    }

    if (character === ">") {
      return cursor
    }
  }

  return -1
}

export function isSvgDocument(source: string) {
  const document = source.trim()
  let cursor = 0

  if (document.startsWith("<?xml", cursor)) {
    const declarationBoundary = document[cursor + 5]

    if (!isDocumentWhitespace(declarationBoundary) && declarationBoundary !== "?") {
      return false
    }

    const declarationEnd = document.indexOf("?>", cursor + 5)

    if (declarationEnd === -1) {
      return false
    }

    cursor = skipDocumentWhitespace(document, declarationEnd + 2)
  }

  while (document.startsWith("<!--", cursor)) {
    const commentEnd = document.indexOf("-->", cursor + 4)

    if (commentEnd === -1) {
      return false
    }

    cursor = skipDocumentWhitespace(document, commentEnd + 3)
  }

  if (!document.startsWith("<svg", cursor)) {
    return false
  }

  const rootNameBoundary = document[cursor + 4]

  if (!isDocumentWhitespace(rootNameBoundary) && rootNameBoundary !== ">") {
    return false
  }

  const openingTagEnd = findTagEnd(document, cursor + 4)
  const closingTagStart = document.length - "</svg>".length

  return (
    openingTagEnd !== -1 &&
    openingTagEnd < closingTagStart &&
    document.startsWith("</svg>", closingTagStart)
  )
}

function appendMarkdownCharacter(lines: string[], character: string) {
  const lineIndex = lines.length - 1
  const currentLine = lines[lineIndex] ?? ""

  lines[lineIndex] = currentLine + character
}

function appendMarkdownCommentBoundary(lines: string[]) {
  const currentLine = lines.at(-1) ?? ""
  const finalCharacter = currentLine.at(-1)

  if (currentLine && finalCharacter !== " " && finalCharacter !== "\t") {
    appendMarkdownCharacter(lines, " ")
  }
}

function getMarkdownLinesWithoutHtmlComments(markdown: string) {
  const lines = [""]
  let cursor = 0
  let isInHtmlComment = false

  while (cursor < markdown.length) {
    if (!isInHtmlComment && markdown.startsWith("<!--", cursor)) {
      appendMarkdownCommentBoundary(lines)
      isInHtmlComment = true
      cursor += 4
      continue
    }

    if (isInHtmlComment && markdown.startsWith("-->", cursor)) {
      isInHtmlComment = false
      cursor += 3
      continue
    }

    const character = markdown[cursor]

    if (character === "\r" && markdown[cursor + 1] === "\n") {
      lines.push("")
      cursor += 2
      continue
    }

    if (character === "\n") {
      lines.push("")
      cursor += 1
      continue
    }

    if (!isInHtmlComment && character !== undefined) {
      appendMarkdownCharacter(lines, character)
    }

    cursor += 1
  }

  return lines
}

export function getVisibleMarkdownLines(markdown: string) {
  const lines = getMarkdownLinesWithoutHtmlComments(markdown)
  const visibleLines: string[] = []
  let fenceCharacter: "`" | "~" | null = null
  let fenceLength = 0

  for (const line of lines) {
    if (fenceCharacter) {
      const closingFence = line.match(/^\s{0,3}(`{3,}|~{3,})\s*$/)?.[1]

      if (closingFence?.startsWith(fenceCharacter) && closingFence.length >= fenceLength) {
        fenceCharacter = null
        fenceLength = 0
      }

      continue
    }

    const openingFence = line.match(/^\s{0,3}(`{3,}|~{3,})/)?.[1]

    if (openingFence) {
      fenceCharacter = openingFence[0] === "`" ? "`" : "~"
      fenceLength = openingFence.length
      continue
    }

    visibleLines.push(line)
  }

  return visibleLines
}
