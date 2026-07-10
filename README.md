# cedarflake-lab

Personal monorepo for Cedarflake experiments, apps, packages, and utility tools.

## Workspaces

| Path | Project |
| --- | --- |
| `apps/copilot-task` | Vite/React AI Agent preview site. |
| `apps/focus-orb-demo` | Demo app for the Focus Orb package. |
| `apps/liminal-drift` | Vite/React game project. |
| `apps/maimai-transition` | Vite/React transition experience. |
| `apps/shika` | Next.js status-page prototype. |
| `packages/focus-orb` | Reusable Focus Orb React package. |
| `tools/personal-email` | React Email templates and mail scripts. |

## Commands

```bash
pnpm install
pnpm check
pnpm build
pnpm dev:shika
pnpm dev:focus-orb
```

Use `pnpm --filter <package-name> <script>` for project-specific commands.