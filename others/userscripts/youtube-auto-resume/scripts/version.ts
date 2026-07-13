import semver from "semver"

export interface ReleaseVersionCheck {
  baseVersion: unknown
  currentVersion: unknown
  hasGeneratedOutputChanged: boolean
}

export function assertValidSemVer(value: unknown, label: string): string {
  if (typeof value !== "string" || semver.valid(value) === null) {
    throw new TypeError(`${label} must be valid SemVer`)
  }

  return value
}

export function assertReleaseVersion({
  baseVersion: baseVersionInput,
  currentVersion: currentVersionInput,
  hasGeneratedOutputChanged,
}: ReleaseVersionCheck): void {
  const baseVersion = assertValidSemVer(baseVersionInput, "Base @version")
  const currentVersion = assertValidSemVer(
    currentVersionInput,
    "package.json version",
  )

  if (
    hasGeneratedOutputChanged
    && !semver.gt(currentVersion, baseVersion)
  ) {
    throw new Error(
      `Generated userscript changed but version ${currentVersion} is not greater than ${baseVersion}`,
    )
  }
}
