# Revaea Dream Field Studio

Interactive desktop studio for creating color variants of the Revaea Dream Field icon
and exporting them to common image and icon formats.

## Status

Active local workbench project.

## Features

- Interactive hue control
- Saturation and contrast adjustment
- Small-icon optimization
- SVG, PNG, WebP, AVIF, JPEG, ICO, TIFF, and BMP export
- Multi-size icon export
- JSON preset save/load

## Requirements

- Python 3.11+
- uv
- Desktop environment supported by PySide6

## Run

uv run --frozen python main.py

## Validation

uvx ruff check .
uvx ruff format --check .
uv run --frozen python -m unittest discover -s tests -p "test_*.py" -v

## License

BSD 3-Clause, inherited from `workbench/LICENSE`.
