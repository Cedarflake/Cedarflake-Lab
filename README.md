# Liminal Drift

A dreamcore 3D driving game prototype built with React 19, TypeScript, Vite, Three.js, React Three Fiber, Drei, and Zustand.

Drive through a soft, empty highway made of pastel road plates, pool-blue edges, floating mall signs, and checkpoints that feel like half-remembered exits.

## Scripts

```txt
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm format
pnpm check
pnpm check:canvas -- http://localhost:5175/
pnpm check:interaction -- http://localhost:5175/
```

## Controls

- Steer: `WASD` or arrow keys
- Drift: `Space` or `Shift`
- Pause: `Esc`
- Touch: on-screen buttons on mobile viewports

## Project Structure

```txt
src/
  app/       React app shell and global game UI styling
  entities/ 3D game entities such as the car, track, obstacles, and checkpoints
  game/     Input handling, state store, generation rules, and numeric helpers
  scenes/   React Three Fiber scene composition and frame loop
  shared/   Shared TypeScript types
  ui/       HUD and menu overlays
scripts/
  checkCanvas.mjs       Playwright screenshot and canvas pixel verification
  checkInteraction.mjs  Playwright mobile touch driving smoke check
```

## Notes

- The project targets React 19 and the current React Three Fiber 9 / Drei 10 line.
- `pnpm-workspace.yaml` contains the pnpm 11 project settings, including the `use-sync-external-store` override used to keep peer dependencies clean.
- Mobile rendering is verified with Playwright. The scene keeps the canvas DPR at `1` for stable headless mobile WebGL output.
