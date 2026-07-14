# Repository Agent Guide

Read [`docs/repository-rules.md`](./docs/repository-rules.md) before changing any tracked file. Frontend changes must also follow its “Frontend Engineering Defaults” section when the target project has no conflicting local rule.

## Quality Bar

- Work at an owner-level engineering standard: identify the root cause, affected owners, regression risk, and validation evidence before declaring a task complete.
- Do not stop at the first failed approach or claim that a task is impossible until safe in-scope source inspection, repository search, and alternative approaches have been exhausted.
- Do not ask the maintainer for information that can be discovered from the repository, configured tools, or read-only checks.
- Report completion only after running the checks required by the changed owner. If an external prerequisite blocks validation, report the exact command, failure, and remaining unverified behavior.

## Instruction Order

- Follow the closest `AGENTS.md` for the files being changed; nested instructions add to or override this guide.
- Read the target project's `README.md`, manifest, formatting configuration, and owning workflow before editing.
- Treat formatter, linter, framework, and compiler output as authoritative. Repository defaults apply only when those sources and the dominant style of comparable sibling files are silent.
- Treat checked-in configuration and scripts as the source of truth for current tool versions and commands. Fix stale documentation about the changed behavior in the same change; mention unrelated drift only in the final handoff without editing unrelated files or creating external records.
- Apply new defaults only to new or modified code. Do not mass-reformat legacy files or perform unrelated cross-workspace refactors.

## Repository Map

- `apps/` contains runnable applications, sites, and product-style demos.
- `packages/` contains reusable frontend packages.
- `workbench/<category>/` contains local Python utilities and small projects.
- `others/<category>/` contains userscripts, interface studies, retired experiments, and other material outside the apps, packages, and Python workbench taxonomy.

## Terminal and Local Resource Safety

- Run terminal commands sequentially by default. Parallelize only independent, read-only, low-cost checks; never overlap package installs, builds, browser suites, development servers, or repository-wide scans.
- Use short-lived, non-interactive task shells. Treat existing IDE terminals, browser windows, browser profiles, ports, and development servers as user-owned unless their task ownership is proven.
- Run browser automation in an isolated, project-owned context. Do not open, reuse, close, or kill the user's Edge, Chrome, Firefox, browser profiles, or their child processes without explicit authorization for that exact action.
- Before starting a server, watcher, browser, or background helper, check whether the required port or service is already active. Track every task-started process by a reliable handle, command, and port, and stop it when the task no longer needs it.
- Before stopping a process, verify its command line, parent process, and task ownership. Never kill processes by a generic name, guessed ownership, or resource usage alone.
- Start with the smallest owning validation and run at most one resource-intensive local command at a time. Do not repeatedly rerun a failed command without first identifying whether the cause is code, permissions, tooling, or host resources.
- Treat out-of-memory errors, insufficient system resources, process-spawn failures, repeated shell startup failures, or similar host instability as a stop condition. Cancel task-owned heavy work, start no new local heavy checks, preserve user-owned processes, and report the exact failure.
- When host instability prevents required comprehensive validation, use lightweight targeted checks locally and move the remaining validation to authorized remote CI. Report which checks ran where; never describe an unrun local check as passed.

## Working Rules

- Use pnpm for Node.js work and run package commands from the repository root with `pnpm --filter <package-name> <script>`.
- Use uv for Python environments and tools.
- Start with the smallest validation owned by the changed project. Run broader repository checks only when shared configuration or multiple projects changed.
- Do not edit generated output directly. Regenerate committed artifacts through their owning build script and verify that source and output match.
- Do not create, expose, or commit secrets, local environment files, downloads, caches, or runtime data.
- Preserve unrelated user changes in a dirty worktree.
- Choose branches by scope and risk, not merely because a tracked file will change. A small, self-contained, low-risk edit may remain on the current branch when no branch or pull request was requested. Create a tool-scoped agent branch before feature work, public behavior changes, security fixes, dependency or lockfile updates, workflow or release changes, multi-project work, destructive migrations, or any task intended for a pull request. Agents running through Codex use `codex/<short-slug>`; agents running through other tools, including Claude Code, follow their own branch-naming constraints.
- Commit or push only when the task explicitly requests it. Commit summaries must use English Conventional Commits and contain no more than 20 words.

Cross-project synchronization matrices, lifecycle rules, and CI naming policy live only in [`docs/repository-rules.md`](./docs/repository-rules.md). Keep project-specific architecture and validation requirements in the nearest `AGENTS.md` or project README.
