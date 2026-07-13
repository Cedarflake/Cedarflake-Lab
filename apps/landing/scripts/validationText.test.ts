import assert from "node:assert/strict"
import test from "node:test"

import { getVisibleMarkdownLines, isSvgDocument } from "./validationText"

test("recognizes SVG documents without backtracking across the full source", () => {
  assert.equal(isSvgDocument('<svg xmlns="http://www.w3.org/2000/svg"><path /></svg>'), true)
  assert.equal(
    isSvgDocument(
      '\ufeff <?xml version="1.0"?>\n<!-- first --><!-- second -->\n<svg data-value=">"></svg> ',
    ),
    true,
  )
})

test("rejects malformed or additional SVG document roots", () => {
  assert.equal(isSvgDocument("<svgx></svgx>"), false)
  assert.equal(isSvgDocument("<svg-foo></svg-foo>"), false)
  assert.equal(isSvgDocument('<?xml version="1.0"<svg></svg>'), false)
  assert.equal(isSvgDocument("<!-- unclosed <svg></svg>"), false)
  assert.equal(isSvgDocument("<svg"), false)
  assert.equal(isSvgDocument("<svg></svg><script></script>"), false)
})

test("rejects long malformed SVG comment prefixes in linear scans", () => {
  const malformedPrefix = "<!--".repeat(10_000)

  assert.equal(isSvgDocument(`${malformedPrefix}<svg></svg>`), false)
})

test("removes Markdown comments without joining visible tokens", () => {
  assert.deepEqual(getVisibleMarkdownLines("alpha<!-- hidden -->beta"), ["alpha beta"])
  assert.deepEqual(getVisibleMarkdownLines("https://exa<!-- hidden -->mple.com"), [
    "https://exa mple.com",
  ])
  assert.deepEqual(getVisibleMarkdownLines("alpha<!-- unclosed\nbeta"), ["alpha ", ""])
  assert.deepEqual(getVisibleMarkdownLines("alpha --> beta"), ["alpha --> beta"])
})

test("preserves Markdown line boundaries around multiline comments", () => {
  assert.deepEqual(getVisibleMarkdownLines("| first |\r\n<!-- hidden\r\nrow -->\r\n| second |"), [
    "| first |",
    "",
    "",
    "| second |",
  ])
})

test("excludes fenced Markdown blocks after comment scanning", () => {
  assert.deepEqual(
    getVisibleMarkdownLines(
      [
        "visible",
        "```text",
        "https://example.com/hidden",
        "```",
        "~~~",
        "also hidden",
        "~~~",
        "visible again",
      ].join("\n"),
    ),
    ["visible", "visible again"],
  )
})

test("does not create a new comment delimiter while scanning malformed input", () => {
  assert.deepEqual(getVisibleMarkdownLines("<!<!-- hidden -->--> visible"), ["<! --> visible"])
})
