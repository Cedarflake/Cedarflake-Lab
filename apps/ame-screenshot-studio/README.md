# Ame Screenshot Studio

A local workspace for capturing real Ame windows and composing Microsoft Store screenshots.
The editor and source code live in Cedarflake Lab, separately from the Ame product.

## Run

Requires Node.js 22 and the repository's pnpm version. From the repository root:

~~~powershell
pnpm install
pnpm dev:ame-screenshot-studio
~~~

Open http://127.0.0.1:4178. The server accepts loopback requests only. Import PNG screenshots,
choose a scene, adjust its text, background and layout, then export a 1920 × 1080 PNG below 50 MB.
The same renderer powers the editor and exports. Missing screenshots prevent export.
Project JSON can be imported and exported; edits save to projects/store.json.
No screenshots are uploaded and no third-party scripts, fonts or analytics are loaded.

## Local data

Keep captures, exports, projects, collections, library, runtime, logs and environment/state next to
server.mjs. These directories and native build outputs are ignored by Git. Source and data can be
moved together; collection provenance and saved projects remain local. STUDIO_DATA_DIR optionally
selects a different data directory for the server. STUDIO_PORT changes the default port.

The optional [collection tools](tools/README.md) prepare individually admitted public-domain/CC0
images with source records. They require uv and Python 3.12 or later and declare their own pinned
Python dependencies. They download only when explicitly invoked. Do not replace real collection
counts with artificial totals or distribute images without their corresponding rights evidence.

## Windows capture

Native capture requires Windows 10 version 2004 or later, Visual Studio C++ x64 Build Tools and
Windows SDK 10.0.26100.0. Follow [capture/README.md](capture/README.md), then select an Ame window in
the editor. Capture retains the client area's original pixels and never injects mouse or keyboard input.

The optional environment/start.ps1 launcher additionally requires Windows Sandbox and its wsb CLI.
Put a complete Ame runtime in runtime/app and the prepared images in library/images before launching.
It maps source images read-only, disables networking and clipboard sharing, and keeps its session
record in environment/session.json. Inspect an existing session before starting a new one.
Saved application data and source folders under environment/state are restored only into a fresh guest.
Close the guest before moving the workspace so its mapped paths cannot become stale.

## GitHub showcase

After preparing the six scene captures, run node apps/ame-screenshot-studio/github/render-showcase.mjs
from the repository root. It uses Google Chrome installed in its standard Windows location with an
isolated headless profile. It produces a 2400 × 2240 six-panel image under github, using the real
captures referenced by projects/store.json. Generated images, receipts and the browser profile stay
local. The app itself requires no browser download beyond an installed browser for the editor.

## Validation and build

From the repository root:

~~~powershell
pnpm --filter ame-screenshot-studio check
pnpm --filter ame-screenshot-studio build
~~~

The build copies the executable source to dist and excludes local images, catalogs, session state
and native binaries. Start the output with node apps/ame-screenshot-studio/dist/server.mjs; native
capture must be built in that output separately. Node checks cover project admission and an isolated
HTTP import/save/reopen workflow. The dedicated Windows workflow owns native geometry/identity
checks and the collection-tool tests.

## License

No reuse license is granted for this project's source code (UNLICENSED). Image rights are recorded
individually with the local collections; those records do not grant rights to the Studio code or
other application screenshots.
