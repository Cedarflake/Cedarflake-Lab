const ignoredWarnings = [
  "THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.",
]
const originalWarn = console.warn.bind(console)

console.warn = (...values: unknown[]) => {
  const [firstValue] = values

  if (typeof firstValue === "string" && ignoredWarnings.includes(firstValue)) {
    return
  }

  originalWarn(...values)
}
