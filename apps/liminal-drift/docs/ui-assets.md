# UI assets

All assets below are bundled with the application. No system font or remote image is required at runtime. Source pages were checked on 2026-10-10; both authors mark their releases as made without generative AI.

## Interface textures

[COMPLETE AND FREE PSX UI by ROHHSA ASSET STORE](https://rohhsa.itch.io/free-psx-ui), released under [CC0 1.0](../public/ui/psx/CC0.txt).

Only these assets from `FREEPSXUI.zip` are distributed:

| Application file                     | Upstream file in `trueres_240p/`       | Use                                                      |
| ------------------------------------ | -------------------------------------- | -------------------------------------------------------- |
| `public/ui/psx/button-idle.png`      | `Skin04-Cropped_Text-Block.png`        | Idle buttons and panel borders                           |
| `public/ui/psx/button-selected.png`  | `Skin02-Cropped_Text-Block.png`        | Pointer hover and keyboard focus                         |
| `public/ui/psx/button-pressed.png`   | `Skin01-Cropped_Text-Block.png`        | Pressed buttons                                          |
| `public/ui/psx/selection-marker.png` | `Skin01-Selection_Solo_Pause-Menu.png` | Focus marker, cropped at x=30, y=71, width=25, height=16 |

The three backplates are unchanged originals, scaled with CSS border slices. The marker is a crop from the author's selection graphic. Live HTML supplies all labels and input behavior.

## Fonts

[Not Jam Font Pack by Not Jam](https://not-jam.itch.io/not-jam-font-pack), released under [CC0](../public/fonts/not-jam-CC0.txt).

- `public/fonts/not-jam-faithless-9.ttf`: original `NotJamFontPack/Not Jam Faithless 9/NotJamFaithless9.ttf`; used for menu titles at multiples of 9 pixels.
- `public/fonts/not-jam-ui-12.ttf`: original `NotJamFontPack/Not Jam UI 12/Not Jam UI 12.ttf`; used for controls and telemetry.
- Existing `public/fonts/space-grotesk-latin.woff2`: bundled additional-glyph fallback under [SIL OFL](../public/fonts/space-grotesk-OFL.txt).

Font faces load only application files; there are no `local()` sources or system-family entries in the font stacks.
