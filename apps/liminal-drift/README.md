# Liminal Drift

A dreamcore 3D driving game built with React 19, TypeScript, Vite, Three.js, React Three Fiber, Drei, and Zustand.

Drive an endless, curving desert highway through empty buildings, roofless colonnades, dry pools, dunes, and floating dream relics. Memory shards, signal boost gates, and checkpoints mark exits that never arrive.

Play online: [https://4po7.test.i0c.cc/](https://4po7.test.i0c.cc/)

## Project Notes

- [An agent's project notes on Liminal Drift](docs/agent-project-summary.md) records the technical decisions, product iterations, rendering choices, and remaining limitations behind the game.

## Gameplay

- Steer through gentle bends, long turns, and S bends. The car has its own position, heading, and momentum; missing a turn hits the guardrail.
- Brake before tighter bends. Solid guardrails contain the entire car, slow impacts, and let it slide along a glancing contact without damaging integrity. Head-on walls and pillars stop and damage it; holding the accelerator cannot drive through them. Hold the brake after stopping to reverse out.
- Travelling back along the road, in reverse gear or after a U-turn, shrinks the visible opening according to the distance to the rear road boundary. Stopping preserves it; moving away reopens it. The view closes completely before the boundary can enter view, then the end-of-road dialog appears without collision damage.
- Chase checkpoints to score and repair the car.
- Hit signal boost gates for speed bursts and score pulses.
- Collect memory shards for small score pulses between bigger hazards.
- Hold drift while turning to reduce grip and build charge from actual sideways slip, then release to cash out. Holding drift while driving straight adds neither speed nor charge.
- Slip past obstacles for near-miss rewards, but collisions damage integrity.
- Below 32 integrity, the sparse, small sky eyes grow, multiply, and jump between positions across the surrounding sky. Pictures scatter across a broad area of sand near the road with irregular depths, lateral offsets, angles, and sizes. Their low-integrity jumps reject buildings, dunes, obstructed views, and overlapping pictures. Lower integrity shortens the intervals. Repairing stops the jumps, and pausing freezes their clock.
- Keep a local best score across runs.

## Scripts

Requires Node.js 22 through 24 and pnpm 11.

```txt
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm format
pnpm format:check
pnpm check
pnpm check:bundle
pnpm check:canvas -- <server-url>
pnpm check:interaction -- <server-url>
pnpm check:licenses
pnpm check:rules
```

## Verification

- `pnpm check` runs formatting checks, lint, procedural generation checks, game-rule checks, license policy checks, production build, and bundle budget checks.
- `pnpm check:bundle` verifies the built JS/CSS assets stay within raw and gzip size budgets.
- `pnpm check:canvas -- <url>` captures desktop and mobile screenshots, checks the 3D scene is visible and moving, verifies modal focus / telemetry / progress semantics, and covers blocked local storage, invalid best-score storage, reduced-motion CSS, and repeated Escape input.
- `pnpm check:interaction -- <url>` verifies keyboard driving, drifting, reverse darkness, single-click restart at the road end, interference reset, pause/resume, background freezing with interrupted menu transitions, gamepad input, and the mobile desktop-required fallback.
- `pnpm check:licenses` blocks strong copyleft and commercial-restriction licenses from the dependency tree.
- `pnpm check:rules` includes the world-driving simulation: guardrail containment without automatic steering, persistent solid contacts, reverse recovery, braking and slip, swept collisions and checkpoint crossings, 30/60/120 FPS consistency, continuous road seams, scenery in all four world quadrants, stable tile anchors, and bounded streaming storage.

Install Chromium once with `pnpm --filter liminal-drift exec playwright install chromium` before browser checks. On machines with an unstable GPU driver, set `LIMINAL_SOFTWARE_RENDERING=1` to use Chromium's software renderer for both browser scripts. This mode verifies behavior and images, not hardware frame rate.

## Controls

- Accelerate: `W` / `Up`; brake: `S` / `Down`. Hold the brake at a stop for 0.35 seconds to engage low-speed reverse.
- Steer: `A` / `D` or `Left` / `Right`
- Drift: `Space` or `Shift`
- Pause: `Esc`
- Gamepad: left stick / D-pad to steer, triggers to drive and brake, shoulders to drift
- Desktop keyboard or gamepad required; small/coarse-pointer viewports show a desktop-required message.

## Driving World

`trackPath.ts` generates an arc-length centerline with smooth heading and curvature transitions. Each new run, including Drive Again, receives a fresh random seed. After a short 48–80 m opening straight, the first turn and subsequent bend directions, angles, lengths, and straight sections vary by seed. The seed stays fixed through pause, backtracking, and streaming; tests can supply one to reproduce a route. Bounded headings prevent the road from crossing itself, and longer transitions keep larger turns drivable. Road strips, guardrails, shoulders, lane markings, and hazards use this path. The road extends 672 m ahead and behind, beyond the 320 m fog range even on bends. World positions use a shared floating origin so long runs retain rendering precision.

`vehicle.ts` integrates velocity and heading at 120 Hz with limited tire grip. `solidCollision.ts` sweeps the vehicle footprint against oriented boxes, separates contacts, and removes inward velocity while preserving sliding. Damage cooldowns never disable physical blocking. `drivingSimulation.ts` owns contacts, route projection, checkpoint crossings, and drift events. The follow camera preserves the car's facing direction while reversing.

`environment.ts` streams a 15 × 15 grid of 56 m world tiles around the vehicle in every direction. Buildings, ruins, pools, and rocks share their placement data with solid colliders; decorative facade parts use instanced meshes. Dunes sit on a continuous ground plane. Ground, sky, and fog meet beyond visibility, and tile recycling happens outside it. Roadside signs, graves, and frames also register their model bounds as colliders. Low-integrity picture jumps keep the frame grounded outside the guardrail and move its colliders in the same frame. Eyes use world anchors distributed around the vehicle at different elevations, independent of the road's centerline.

## Interface

The menu overlays the live 3D scene with low-resolution textures from ROHHSA's PSX UI pack and the bundled Not Jam Faithless 9 / UI 12 fonts. Buttons have distinct idle, hover/focus, and pressed artwork. Controls expand inside the start menu; driving information stays at the screen edges. The assets are served locally, with no system-font dependency or separate background artwork. See [UI asset sources and licenses](docs/ui-assets.md).

A display layer covers the scene and interface with fine scanlines, a faint RGB phosphor grid, monochrome grain, and shaded glass edges. A very light tracking disturbance affects the whole image, including menus. Lower integrity progressively adds stronger interference, separated color channels, negative-image pulses, and flickering rectangular color dropouts; checkpoint repairs ease them again. Damaging impacts add a 480 ms negative/color burst, including the final hit of a run. Guardrail impacts only strengthen tracking for 360 ms and never trigger that damage burst.

Approaching the rear road boundary continuously strengthens the interference and color dropouts with the closing vignette. Full-image inversion fades out as the opening closes, keeping the black field black while localized colored blocks remain visible. These effects persist through the end dialog until restarting restores the normal low intensity. The effects do not intercept input or request external artwork. Reduced-motion mode uses subdued static color and blocks instead of negative flashes, image displacement, or moving interference. Backgrounding pauses the run and clears driving input, including the moving interference; the pause menu appears immediately even when the browser suspends animation clocks.

## Project Structure

```txt
src/
  app/       React app shell, scene frame, and app-level styling
  entities/ 3D game entities such as the car, track, obstacles, and checkpoints
  game/     Input handling, state store, generation rules, and numeric helpers
  scenes/   React Three Fiber scene composition and frame loop
  shared/   Shared TypeScript types
  ui/       HUD, menu overlays, touch controls, and component-level styles
scripts/
  checkBundleBudget.mjs  Production bundle size budget check
  checkCanvas.mjs       Playwright screenshot and canvas pixel verification
  checkGameRules.ts     Gameplay rule boundary checks
  checkDriving.ts       World driving, road geometry, and streaming regression checks
  checkInteraction.mjs  Playwright keyboard and gamepad driving checks
  checkLicenses.mjs     Dependency license policy check
public/
  fonts/                Bundled UI font subset and license
```

## Notes

- The project targets React 19 and the current React Three Fiber 9 / Drei 10 line.
- UI text uses bundled Not Jam fonts under CC0, with bundled Space Grotesk under SIL OFL for additional glyph coverage.
- `pnpm-workspace.yaml` contains the pnpm 11 project settings, including engine checks against Node 22.22.2, strict 24-hour release-age checks, and the `use-sync-external-store` override used to keep peer dependencies clean.
- Desktop rendering and the mobile fallback are verified with Playwright. The scene keeps canvas DPR at `1` to limit rendering cost.
