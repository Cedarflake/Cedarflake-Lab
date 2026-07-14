# Focus Orb Demo

Interactive Vite playground for the reusable [`@cedarflake/focus-orb`](../../packages/focus-orb/README.md) React component. The demo exposes the package's appearance, state, interaction, motion, audio, rendering, and shader-material options for visual tuning.

## Development

Run commands from the repository root:

```bash
pnpm dev:focus-orb
pnpm --filter @cedarflake/focus-orb-demo check
pnpm --filter @cedarflake/focus-orb-demo build
pnpm check:focus-orb-package
```

`pnpm check:focus-orb-package` builds the package and verifies that the demo's package-consumer fixture can type-check against its public API.

## License

BSD-3-Clause. See [`LICENSE`](./LICENSE).
