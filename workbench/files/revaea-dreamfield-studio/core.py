from __future__ import annotations

import colorsys

SHAPE_PATH = "M1000.5 32C1091.62 32 1177.73 68.5982 1254.04 133.638C1304.28 176.46 1367.32 202.573 1433.13 207.818C1533.07 215.785 1619.84 250.793 1684.27 315.228C1748.71 379.662 1783.72 466.428 1791.68 566.373C1796.93 632.179 1823.04 695.22 1865.86 745.461C1930.9 821.767 1967.5 907.875 1967.5 999C1967.5 1090.12 1930.9 1176.23 1865.86 1252.54C1823.04 1302.78 1796.93 1365.82 1791.68 1431.62C1783.72 1531.57 1748.71 1618.34 1684.27 1682.77C1619.84 1747.21 1533.07 1782.22 1433.12 1790.18C1367.32 1795.43 1304.28 1821.54 1254.04 1864.36C1177.73 1929.4 1091.62 1966 1000.5 1966C909.375 1966 823.267 1929.4 746.962 1864.36C696.721 1821.54 633.68 1795.43 567.874 1790.18C467.928 1782.22 381.162 1747.21 316.727 1682.77C252.292 1618.34 217.284 1531.57 209.317 1431.62C204.072 1365.82 177.959 1302.78 135.137 1252.54C70.0979 1176.23 33.4999 1090.12 33.4999 999C33.4999 907.875 70.0975 821.768 135.137 745.462C177.959 695.221 204.072 632.18 209.317 566.374C217.284 466.428 252.293 379.662 316.727 315.228C381.162 250.793 467.928 215.784 567.874 207.817C633.68 202.572 696.722 176.459 746.963 133.637C823.268 68.5978 909.375 32 1000.5 32ZM1001.05 662C951.869 662 906.871 692.51 872.216 743.026C865.539 752.758 854.781 758.969 843.015 759.885C781.938 764.639 733.016 788.354 708.425 830.947C683.834 873.54 687.756 927.765 714.177 983.036C719.267 993.684 719.268 1006.11 714.178 1016.75C687.757 1072.03 683.834 1126.25 708.425 1168.84C733.016 1211.44 781.938 1235.15 843.015 1239.91C854.781 1240.82 865.539 1247.03 872.216 1256.76C906.871 1307.28 951.869 1337.79 1001.05 1337.79C1050.23 1337.79 1095.23 1307.28 1129.89 1256.76C1136.56 1247.03 1147.32 1240.82 1159.09 1239.91C1220.16 1235.15 1269.09 1211.44 1293.68 1168.84C1318.27 1126.25 1314.35 1072.03 1287.92 1016.75C1282.83 1006.11 1282.83 993.684 1287.92 983.036C1314.35 927.765 1318.27 873.54 1293.68 830.947C1269.09 788.355 1220.16 764.639 1159.09 759.885C1147.32 758.969 1136.56 752.758 1129.89 743.026C1095.23 692.509 1050.23 662 1001.05 662Z"

BASE_PALETTE = {
    "c0": "#F3D4FF",
    "c1": "#F0B6FF",
    "c2": "#DCD8FF",
    "c3": "#F398F7",
    "c4": "#CDB7FF",
    "c5": "#F03BFA",
    "c6": "#C52AF1",
    "c7": "#8A55F4",
    "c8": "#6A37EA",
}

BASE_ANCHOR_HUE = 286.73366834170855

PRESETS = {
    "原版粉紫": 287,
    "玫红": 335,
    "暖橙": 28,
    "嫩黄绿": 82,
    "绿色": 125,
    "青色": 180,
    "天蓝": 205,
    "月光蓝": 225,
    "蓝紫": 255,
}

EXPORT_SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256, 512, 1024]


def clamp(value, low=0.0, high=1.0):
    return max(low, min(high, value))


def hex_to_rgb(color):
    value = color.removeprefix("#")
    if len(value) != 6:
        raise ValueError(f"Expected #RRGGBB color, got {color!r}")

    return (
        int(value[0:2], 16) / 255,
        int(value[2:4], 16) / 255,
        int(value[4:6], 16) / 255,
    )


def rgb_to_hex(red, green, blue):
    red = round(clamp(red) * 255)
    green = round(clamp(green) * 255)
    blue = round(clamp(blue) * 255)
    return f"#{red:02X}{green:02X}{blue:02X}"


def rotate_color(color, hue_shift, saturation_scale, contrast_scale):
    red, green, blue = hex_to_rgb(color)
    hue, lightness, saturation = colorsys.rgb_to_hls(red, green, blue)

    hue = (hue + hue_shift / 360.0) % 1.0
    saturation = clamp(saturation * saturation_scale)
    lightness = clamp(0.5 + (lightness - 0.5) * contrast_scale)

    red, green, blue = colorsys.hls_to_rgb(hue, lightness, saturation)
    return rgb_to_hex(red, green, blue)


def build_palette(target_hue, saturation_scale, contrast_scale):
    hue_shift = ((float(target_hue) - BASE_ANCHOR_HUE + 180.0) % 360.0) - 180.0
    return {
        name: rotate_color(color, hue_shift, saturation_scale, contrast_scale)
        for name, color in BASE_PALETTE.items()
    }


def strengthen_small_palette(palette, strength):
    amount = clamp(float(strength))
    result = {}

    for name, color in palette.items():
        red, green, blue = hex_to_rgb(color)
        hue, lightness, saturation = colorsys.rgb_to_hls(red, green, blue)

        saturation = clamp(saturation * (1.0 + 0.20 * amount))
        lightness = clamp(0.5 + (lightness - 0.5) * (1.0 + 0.16 * amount))

        red, green, blue = colorsys.hls_to_rgb(hue, lightness, saturation)
        result[name] = rgb_to_hex(red, green, blue)

    return result


def radial_gradient(name, color, center_opacity=1.0, middle_opacity=0.72):
    return f"""
    <radialGradient id="{name}" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="{color}" stop-opacity="{center_opacity:.3f}"/>
      <stop offset="0.42" stop-color="{color}" stop-opacity="{middle_opacity:.3f}"/>
      <stop offset="0.72" stop-color="{color}" stop-opacity="{middle_opacity * 0.42:.3f}"/>
      <stop offset="1" stop-color="{color}" stop-opacity="0"/>
    </radialGradient>"""


def build_svg(
    palette,
    width=1024,
    height=1024,
    optical_scale=1.0,
    small_icon=False,
    small_strength=0.65,
):
    strength = clamp(float(small_strength))

    if small_icon:
        palette = strengthen_small_palette(palette, strength)
        optical_scale *= 1.0 - 0.055 * strength
        haze_top = 0.54 * (1.0 - 0.62 * strength)
        haze_middle = 0.22 * (1.0 - 0.72 * strength)
    else:
        haze_top = 0.54
        haze_middle = 0.22

    gradients = "\n".join(
        [
            radial_gradient("f1", palette["c1"], 0.95, 0.72),
            radial_gradient("f2", palette["c2"], 0.92, 0.66),
            radial_gradient("f3", palette["c3"], 0.96, 0.76),
            radial_gradient("f4", palette["c4"], 0.95, 0.72),
            radial_gradient("f5", palette["c5"], 1.00, 0.88),
            radial_gradient("f6", palette["c6"], 1.00, 0.90),
            radial_gradient("f7", palette["c7"], 0.99, 0.84),
            radial_gradient("f8", palette["c8"], 1.00, 0.92),
        ]
    )

    return f"""<svg xmlns="http://www.w3.org/2000/svg"
 width="{width}" height="{height}" viewBox="0 0 2000 2000"
 preserveAspectRatio="xMidYMid meet">
  <title>Revaea Dream Field</title>
  <defs>
    <mask id="shape" maskUnits="userSpaceOnUse" x="0" y="0" width="2000" height="2000">
      <rect width="2000" height="2000" fill="#000"/>
      <path d="{SHAPE_PATH}" fill="#fff" fill-rule="evenodd" clip-rule="evenodd"/>
    </mask>

    <linearGradient id="base" gradientUnits="userSpaceOnUse"
                    x1="620" y1="60" x2="1370" y2="1940">
      <stop offset="0" stop-color="{palette["c0"]}"/>
      <stop offset=".58" stop-color="{palette["c0"]}"/>
      <stop offset="1" stop-color="{palette["c4"]}" stop-opacity=".48"/>
    </linearGradient>

    {gradients}

    <radialGradient id="white-haze">
      <stop offset="0" stop-color="#fff" stop-opacity="{haze_top:.4f}"/>
      <stop offset=".48" stop-color="#fff" stop-opacity=".18"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <g transform="translate(1000 1000) scale({optical_scale:.5f}) translate(-1000 -1000)">
    <g mask="url(#shape)">
      <rect width="2000" height="2000" fill="url(#base)"/>
      <ellipse cx="430" cy="500" rx="930" ry="790" fill="url(#f1)" transform="rotate(-12 430 500)"/>
      <ellipse cx="1570" cy="420" rx="930" ry="820" fill="url(#f2)" transform="rotate(13 1570 420)"/>
      <ellipse cx="280" cy="1060" rx="900" ry="830" fill="url(#f3)" transform="rotate(8 280 1060)"/>
      <ellipse cx="1710" cy="1080" rx="900" ry="860" fill="url(#f4)" transform="rotate(-10 1710 1080)"/>
      <ellipse cx="250" cy="1610" rx="910" ry="700" fill="url(#f5)" transform="rotate(-17 250 1610)"/>
      <ellipse cx="900" cy="1670" rx="950" ry="730" fill="url(#f6)" transform="rotate(5 900 1670)"/>
      <ellipse cx="1640" cy="1570" rx="900" ry="710" fill="url(#f7)" transform="rotate(14 1640 1570)"/>
      <ellipse cx="1030" cy="2030" rx="920" ry="570" fill="url(#f8)"/>
      <ellipse cx="1010" cy="120" rx="1040" ry="630" fill="url(#white-haze)"/>
      <ellipse cx="1290" cy="720" rx="960" ry="720" fill="url(#white-haze)" opacity="{haze_middle:.4f}"/>
    </g>
  </g>
</svg>"""
