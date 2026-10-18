# Others

Projects that do not belong to deployable apps, reusable packages, or the local Python workbench.

| Path                                      | Purpose                                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| `game-tools/refrain-trainer`              | Archived one-off Chinese Windows trainer for Labyrinth of Refrain.                       |
| `userscripts/bilibili-follow-cycle`       | Archived Bilibili browser userscript.                                                   |
| `userscripts/youtube-auto-resume`         | Archived YouTube userscript retained as the migration baseline for the extension app.   |
| `github-actions/star-cycle`               | Retired GitHub Star/Unstar workflow experiment.                                         |
| `interface-studies/google-ai-mode-aurora` | Forensic analysis and dependency-free reproduction of Google Search's Aurora edge glow. |

GitHub only executes workflow files from the repository-level `.github/workflows/` directory. The Star Cycle YAML stored here is intentionally inactive.

Refrain Trainer is an archived, standalone C#/.NET Framework tool, outside the pnpm workspace. Its [README](./game-tools/refrain-trainer/README.md) records Windows build, validation, packaging, and the explicit unlicensed status. The Windows workflow is manual-only for reproduction; ongoing maintenance is not planned. Generated binaries, archives, game data, and save files are not committed.
