# YouTube Auto Resume

A userscript for recovering paused YouTube playback and handling ads from a resilient panel.

## Status

Active. Version 0.3.0 focuses on playback recovery, guarded ad handling, and panel resilience; automatic quality selection is no longer included.

## Features

- Resumes playback after a configurable pause threshold
- Handles ads with visible controls first, then a finite seekable fallback only for the active player YouTube explicitly marks as an ad
- Provides a YouTube-inspired control panel isolated with Shadow DOM
- Reattaches the panel when YouTube's single-page navigation replaces page content
- Exposes userscript menu commands for opening and resetting the panel

## Install

Install [Tampermonkey](https://www.tampermonkey.net/) or another compatible userscript manager, then open the installable script:

[Install YouTube Auto Resume](https://raw.githubusercontent.com/Cedarflake/Cedarflake-Lab/main/others/userscripts/youtube-auto-resume/dist/youtube-auto-resume.user.js)

Automatic ad handling is disabled by default. Enable it from the floating launcher. The script tries visible skip and overlay-close controls first. For a video ad, an unavailable or ineffective skip control can fall back to advancing finite seekable media only while the active player has YouTube's `ad-showing` or `ad-interrupting` state.

## Support

The supported page scope is the top-level desktop site at `https://www.youtube.com/*`. YouTube Music, mobile YouTube, embedded players, and framed playback are outside the current scope.

| Userscript manager | Browser | Support status |
| --- | --- | --- |
| Tampermonkey | Chrome and Edge 109+ | Primary installation target |
| Violentmonkey | Chrome, Edge 109+, and Firefox 115+ | Expected to work with the APIs used; not covered by automated manager tests |
| Other managers | Any browser | Not verified |

The build targets Chrome and Edge 109+ and Firefox 115+. Automated browser coverage runs panel and runtime fixtures against Chromium without a userscript-manager sandbox.

## Limitations

- YouTube's private DOM selectors and internal player behavior can change without notice.
- Ad handling cannot guarantee every YouTube ad format. Its seek fallback is limited to finite seekable media in the explicitly marked active ad player and never runs on ordinary playback.
- Browser autoplay policy can reject a programmatic resume until the user interacts with the page.
- Settings are stored in page-local storage for the current browser profile.

## Development

The project uses Node.js 22, pnpm, TypeScript, and esbuild.

Run these commands from the repository root. Chromium installation is required once on a new machine because `pnpm check` includes the Playwright panel and runtime tests.

```bash
pnpm install
pnpm --dir others/userscripts/youtube-auto-resume exec playwright install chromium
pnpm --filter @cedarflake/youtube-auto-resume build
pnpm --filter @cedarflake/youtube-auto-resume check
```

`pnpm --filter @cedarflake/youtube-auto-resume build` writes the installable userscript to `dist/youtube-auto-resume.user.js`. Do not edit the generated file directly. `pnpm --filter @cedarflake/youtube-auto-resume build:check` verifies that the committed build matches the TypeScript source.

Every change that alters the generated userscript must also increase `package.json`'s SemVer precedence before release. Pull-request and non-initial main-branch push CI compare the generated output with the base revision and reject equal, downgraded, invalid, or build-metadata-only version changes.

## Structure

```text
scripts/build.ts        esbuild configuration and userscript metadata
src/core/settings.ts    normalized persistent settings
src/ui/panel.ts         isolated and resilient panel view
src/youtube/            YouTube player and ad-control integrations
src/app.ts              application state and scheduling
src/entry.ts            userscript API registration and application startup
tests/                  Node.js unit tests and Playwright panel/runtime fixtures
```

## License

[MIT](./LICENSE)
