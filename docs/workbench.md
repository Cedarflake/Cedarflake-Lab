# Workbench

`workbench/` contains local scripts and small projects that are useful to keep with the lab, but are not deployable frontend apps or reusable packages.

Use `uv` for Python tools. Each larger tool keeps its own dependency file, such as `requirements.txt` or `pyproject.toml`.

```powershell
uvx ruff format workbench
uvx ruff check workbench
```

Local configuration, API keys, logs, downloaded files, build output, and virtual environments are intentionally ignored. GitHub workflow files stored below `workbench/` are examples or archives and are not executed by GitHub Actions.

## License

`workbench/LICENSE` provides the default BSD 3-Clause license. A project-level `LICENSE` takes precedence for that project, preserving licenses from imported repositories.
