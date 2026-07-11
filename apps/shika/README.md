# Shika

Shika is a Next.js status-page prototype for publishing life sections, incidents, maintenance events, and uptime summaries. The current implementation uses mock domain data and provides English and Simplified Chinese routes.

## Stack

- Next.js 16 App Router and React 19
- TypeScript in strict mode
- `next-intl` locale routing
- Tailwind CSS 4
- React Compiler

## Development

Install dependencies from the monorepo root, then run Shika:

```powershell
pnpm install
pnpm dev:shika
```

Open `http://localhost:3000/zh-CN` or `http://localhost:3000/en`.

Run the project checks and production build from the monorepo root:

```powershell
pnpm --filter shika check
pnpm --filter shika build
```

## Project layout

- `src/app/[locale]` contains localized App Router pages and layouts.
- `src/components` contains feature, navigation, provider, and UI components.
- `src/lib/domain` contains status and incident calculations.
- `src/lib/mock` contains the prototype data source.
- `src/messages` contains English and Simplified Chinese translations.

The site currently renders static prototype data. Replace the mock layer behind the domain functions when connecting a persistent backend.
