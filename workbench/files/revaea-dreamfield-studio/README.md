# Revaea Dream Field Studio

Interactive desktop studio for adjusting the Revaea Dream Field icon's colors,
surface materials, and typography, then exporting icons or horizontal wordmarks.

## Status

Active local workbench project.

## Features

- Interactive hue control
- Nine individually editable gradient colors and eight reference color presets
- Persistent preview with separate Appearance, Material, Typography, and Export tabs
- Editable numeric controls, keyboard navigation, and scroll-safe settings
- Saturation and contrast adjustment
- Color, grayscale, pure-black, and pure-white modes with adjustable opacity
- Original, fine matte, fiber paper, and soft pearl surfaces with adjustable strength,
  texture scale, and reproducible texture seeds
- PNG/WebP imports into a persistent Studio-owned material library, plus a bundled
  watercolor texture from Focus Orb
- Image-driven color displacement with a fixed logo outline and center cutout
- Original-material comparison that affects only the preview
- Editable horizontal wordmarks with searchable local fonts, face/weight selection,
  size, tracking, icon spacing, and text color
- Text color follows the Logo palette by default, with an independent-color option
- Studio-managed TTF/OTF/TTC imports; Bauhaus 93 Regular is selected by default when available
- Outlined SVG lettering that renders independently of installed fonts
- Small-icon optimization
- SVG, PNG, WebP, AVIF, JPEG, ICO, TIFF, and BMP export
- Multi-size icon export
- JSON preset save/load
- File-by-file export progress with cancellation that retains completed files

## Workflow

1. In **外观 → Logo 渐变**, start with a project or color preset,
   or select another palette. Click a named region or a swatch below the preview to
   edit that gradient color. The hue strip shifts the entire palette.
2. In **材质**, select a surface or choose **导入纹理…** to add a PNG/WebP image.
   Adjust strength and texture size; **换一组** changes the reproducible texture
   variation. **仅看渐变** temporarily hides the material in the preview without
   changing exports.
3. Use the controls above the canvas to change the preview background or inspect a
   raster output size. The background is preview-only, except when explicitly chosen
   for JPEG/BMP export.
4. In **文字**, enable **添加文字标识**, edit the title, and choose a local font or
   **导入字体…**. Font names in the picker show their own typeface. Size and icon
   spacing are percentages of the icon's height; tracking is a percentage of the
   type size. **跟随 Logo 配色** keeps the text in the current Logo color family.
   Disable **添加文字标识** to return to an icon while retaining the text settings.
5. In **导出**, select formats and sizes. The file count and export action remain
   visible while scrolling. **停止导出** takes effect between files and retains
   files already written.

Open and save presets with `Ctrl+O` and `Ctrl+S`; `Ctrl+E` opens export settings.
The window supports sizes down to 860 × 620 logical pixels. Unfocused value controls
pass the mouse wheel to their scroll panel; focus a control to change it by wheel.

## Gradient editing

The original hue-only presets rotate one fixed palette and cannot independently
match a reference's peach, yellow, pink, violet, or blue regions. The reference
presets instead use separate region colors calibrated against the supplied artwork.
They approximate the color distribution in editable SVG; they do not reproduce the
fine texture baked into the original PNG artwork.

The project presets pair their gradients with these sampled wordmark colors:

| Preset | Text color |
| --- | --- |
| Lab 珊瑚渐变 | `#FF7675` |
| Grove 蓝紫渐变 | `#758FFF` |
| Ame 天蓝渐变 | `#75CBFF` |
| Nami 紫罗兰渐变 | `#9F75FF` |

Four additional icon references are named **青柠渐变**, **晴蓝渐变**, **柔紫渐变**,
and **薄荷渐变** until project names are supplied. Their linked text starts with the
main gradient color. No source images or editable source documents are needed at runtime.

Each region color contributes to overlapping soft gradient fields. Click **整体底色**,
**左上**, **右上**, **左侧**, **右侧**, **左下亮色**, **中下主色**, **右下**, or **底部**
to choose its color. Editing a region preserves the other current colors by folding
existing hue/saturation/contrast adjustments into the new palette; saturation and
contrast return to 100% as the neutral starting point for further adjustment.
Selecting a gradient preset preserves the text content, typeface, layout, material,
and logo geometry. Linked text color follows the selected palette.

Use **仅看渐变** to temporarily inspect colors without the material, or select
**材质 → 原始** to remove the material from both preview and exports. Version 5 and later
presets save the editable palette and its hue reference; earlier presets retain their
original color behavior.

## Texture library and exports

Imported textures are copied into `Cedarflake/DreamFieldStudio/materials` under the
platform's per-user data directory (`QStandardPaths.GenericDataLocation`; normally
`%LOCALAPPDATA%` on Windows). Imports accept static PNG and WebP files up to 32 MB,
with width and height up to 4096 pixels. The library normalizes images to PNG without
source metadata and assigns content-based IDs, so importing the same pixels again
reuses the existing asset. The source file is never changed and can subsequently
be moved or deleted. No library directory is created until the first import.

The bundled watercolor texture and imported images drive displacement of the icon's
color field, following Focus Orb's texture-sampling approach. They do not paint
their own colors over the icon. The original alpha mask is retained pixel for pixel;
the outer silhouette, opacity, and center cutout stay intact. Pure-black and
pure-white modes temporarily hide materials; small-icon optimization attenuates them.

Presets store only the texture's library ID and material parameters, not image bytes
or the original file path. Versions 1–5 remain supported by the current version 6 format.
A preset moved to another computer needs the same texture imported into that
computer's Studio library. Missing or modified assets show a recovery message and
block textured export until the image is reimported or another material is selected.

Exports contain only finished artwork, with no texture sidecar or link to the local
library. Procedural surfaces retain vector SVG export. Image-driven materials produce
a self-contained SVG containing the final 1024 px raster artwork, rather than the
source texture; the export panel states this resolution. Raster formats and previews
use the same rendering path. See [bundled texture attribution](assets/README.md).

## Fonts and wordmarks

The Typography tab starts with `Cedarflake - Lab` and prefers **Bauhaus 93 Regular**
when it is installed. This font is not redistributed with Studio. On other systems,
Studio selects an available local family. Text is single-line, up to 80 characters.
The face/weight picker lists the styles available to Qt for the selected family.

**跟随 Logo 配色** is enabled by default. Each palette carries its own linked text
color. The whole-palette hue, saturation, and contrast controls transform the Logo
and text together, matching the shared correction layer in the supplied CSP source.
Editing the main region retints the linked text; editing other regions preserves it.
The color swatch, preview, and
exports use the same resolved color. Unchecking the option freezes the current color;
choosing a color directly also switches to independent color. Recheck the option to
resume following the Logo. Monochrome modes temporarily override both Logo and text.

Version 6 presets store this choice and the palette's linked text color.
Earlier presets using the old default text color
become linked; custom text colors remain independent.

Import static TrueType/OpenType fonts or TrueType collections through **导入字体…**.
Files up to 64 MB are copied into the `fonts` directory next to the material library,
identified by content hash, and loaded only into the Studio process. Importing a font
does not install it system-wide. Reimporting the same bytes reuses the existing file;
the original may then be moved or deleted. Collection imports offer their font families
in the family picker. Variable fonts use their default face; individual variation axes
are not exposed in this version.

Presets from version 4 onward retain text, family, face, size, spacing, color, and the imported
font's library ID, without embedding a font or saving its original path. A missing or
modified font, unavailable face, or missing glyph produces an inline message and
pauses wordmark export until corrected. Moving an editable preset to another computer
requires the matching system fonts or the same font imported into that Studio library.
Older presets open in icon-only mode.

Wordmarks use a transparent canvas with automatic width and fixed proportional padding.
Raster size choices (512–4096 px, including 3500 and 3800 px) specify the complete
wordmark's width; height is computed from the content. Filenames use
`Cedarflake-wordmark`. SVG text is exported as vector paths and requires no external
font. An image material embeds the rendered icon alongside those paths, never the
source texture or font. Pure-black/white, grayscale, and opacity affect the complete
wordmark. ICO always retains the standalone icon and its existing small-size treatment.

## Requirements

- Python 3.11+
- uv
- Desktop environment supported by PySide6

## Run

```powershell
uv run --frozen python main.py
```

## Validation

The raster export tests use Qt's offscreen platform. Linux runners still need
the EGL and OpenGL runtime libraries; on Ubuntu, install `libegl1 libopengl0`
before running the tests. CI installs these packages explicitly.

```powershell
uvx ruff check .
uvx ruff format --check .
uv run --frozen python -m unittest discover -s tests -p "test_*.py" -v
```

Widget tests select Qt's `offscreen` platform before creating the application and do
not open a desktop window. They exercise material switching, numeric entry, keyboard
navigation, scroll behavior, preset compatibility, actual SVG/PNG/WebP/ICO export,
and export cancellation in addition to the core color and SVG checks. Texture tests
use isolated temporary libraries and check deduplication, source-file independence,
reference-only presets, missing-asset recovery, alpha preservation, and finished-only
exports without writing to the user's Studio library.

Typography checks load a local outline font from standard Windows, Linux, or macOS
font locations and use temporary libraries. They cover import persistence, invalid
files and presets, missing fonts/glyphs, keyboard editing, outlined SVG, logo visibility,
wide raster output, and standalone ICO. Color checks cover palette/hue linkage,
independent colors, preset migration, and matching preview/SVG/PNG output.
The font-specific suite reports a skip when
no fixture font is installed; it never downloads or installs a font.

## License

BSD 3-Clause, inherited from `workbench/LICENSE`.
