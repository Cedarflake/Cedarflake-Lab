from __future__ import annotations

import colorsys
import math
import re

from core import BASE_ANCHOR_HUE, BASE_PALETTE, hex_to_rgb, rgb_to_hex, rotate_color

GRADIENT_REGIONS = {
    "c0": "整体底色",
    "c1": "左上",
    "c2": "右上",
    "c3": "左侧",
    "c4": "右侧",
    "c5": "左下亮色",
    "c6": "中下主色",
    "c7": "右下",
    "c8": "底部",
}

# Calibrated against the color fields in the Lab/Grove reference banners.
GRADIENT_PRESETS = {
    "Lab 珊瑚渐变": {
        "c0": "#FFB595",
        "c1": "#FFC3B1",
        "c2": "#FFC1BD",
        "c3": "#FFD9AD",
        "c4": "#FFCFCA",
        "c5": "#FFFFC0",
        "c6": "#FC6E31",
        "c7": "#FF7499",
        "c8": "#EA1649",
    },
    "Grove 蓝紫渐变": {
        "c0": "#9B93FF",
        "c1": "#B5B0FF",
        "c2": "#BAC2FF",
        "c3": "#C6AEFF",
        "c4": "#CED2FF",
        "c5": "#FFBCFF",
        "c6": "#4634FC",
        "c7": "#79B8FF",
        "c8": "#1A74EA",
    },
    "Ame 天蓝渐变": {
        "c0": "#9AC1FF",
        "c1": "#AFCBFF",
        "c2": "#BCDEFF",
        "c3": "#AFB8FF",
        "c4": "#C9E8FF",
        "c5": "#B095FF",
        "c6": "#487FFD",
        "c7": "#72DEFF",
        "c8": "#26CAE8",
    },
    "Nami 紫罗兰渐变": {
        "c0": "#D89AFF",
        "c1": "#D8AEFF",
        "c2": "#D5BCFF",
        "c3": "#F3AEFF",
        "c4": "#DBC9FF",
        "c5": "#FFADFF",
        "c6": "#BF48FD",
        "c7": "#8A70FF",
        "c8": "#3426E8",
    },
    "青柠渐变": {
        "c0": "#84FF19",
        "c1": "#B9FF77",
        "c2": "#CBFF7C",
        "c3": "#A4FF7F",
        "c4": "#DBFF93",
        "c5": "#7DFF72",
        "c6": "#95F540",
        "c7": "#CEFF52",
        "c8": "#B8D92F",
    },
    "晴蓝渐变": {
        "c0": "#3572FE",
        "c1": "#84B1FE",
        "c2": "#8DB1FE",
        "c3": "#89B4FE",
        "c4": "#A0C0FE",
        "c5": "#80A6FF",
        "c6": "#479EFD",
        "c7": "#58B3FF",
        "c8": "#2FA9F0",
    },
    "柔紫渐变": {
        "c0": "#6F59E4",
        "c1": "#A29CED",
        "c2": "#ACA3EE",
        "c3": "#A7A0ED",
        "c4": "#B8B1F1",
        "c5": "#A497ED",
        "c6": "#6D70E3",
        "c7": "#7781EB",
        "c8": "#5B71D5",
    },
    "薄荷渐变": {
        "c0": "#9AFFF8",
        "c1": "#AFFFF9",
        "c2": "#BCFFF0",
        "c3": "#AFF9FF",
        "c4": "#C9FFF0",
        "c5": "#AEE8FF",
        "c6": "#4AFFF8",
        "c7": "#73FFD4",
        "c8": "#24E894",
    },
}

# Solid lettering sampled from the supplied project banners.
GRADIENT_TEXT_COLORS = {
    "Lab 珊瑚渐变": "#FF7675",
    "Grove 蓝紫渐变": "#758FFF",
    "Ame 天蓝渐变": "#75CBFF",
    "Nami 紫罗兰渐变": "#9F75FF",
}


def palette_anchor(palette):
    return colorsys.rgb_to_hls(*hex_to_rgb(palette["c6"]))[0] * 360


def default_text_color(palette):
    for name, preset in GRADIENT_PRESETS.items():
        if palette == preset:
            return GRADIENT_TEXT_COLORS.get(name, palette["c6"])
    return rotate_color(
        "#FF7675", palette_anchor(palette) - palette_anchor(GRADIENT_PRESETS["Lab 珊瑚渐变"]), 1, 1
    )


def retint_text_color(color, previous_main, current_main):
    if previous_main.upper() == current_main.upper():
        return color
    hue, lightness, saturation = colorsys.rgb_to_hls(*hex_to_rgb(color))
    old_hue, old_lightness, old_saturation = colorsys.rgb_to_hls(*hex_to_rgb(previous_main))
    new_hue, new_lightness, new_saturation = colorsys.rgb_to_hls(*hex_to_rgb(current_main))
    distance = lightness - old_lightness
    available = 1 - old_lightness if distance >= 0 else old_lightness
    room = 1 - new_lightness if distance >= 0 else new_lightness
    tint = distance / available if available else 0
    return rgb_to_hex(
        *colorsys.hls_to_rgb(
            (hue + new_hue - old_hue) % 1,
            new_lightness + tint * room,
            min(1, saturation * new_saturation / old_saturation)
            if old_saturation
            else new_saturation,
        )
    )


def validate_text_color(data, palette):
    color = data.get("text_color", default_text_color(palette))
    if not isinstance(color, str) or not re.fullmatch(r"#[a-fA-F0-9]{6}", color):
        raise ValueError("配色中的文字颜色必须是 #RRGGBB 格式。")
    return color.upper()


def validate_gradient(data):
    if not isinstance(data, dict):
        raise ValueError("方案中的渐变设置格式无效。")
    palette = data.get("palette", BASE_PALETTE)
    if not isinstance(palette, dict) or set(palette) != set(BASE_PALETTE):
        raise ValueError("渐变需要完整的 9 个区域颜色。")
    if any(
        not isinstance(value, str) or not re.fullmatch(r"#[a-fA-F0-9]{6}", value)
        for value in palette.values()
    ):
        raise ValueError("渐变颜色必须是 #RRGGBB 格式。")
    try:
        anchor = float(data.get("anchor_hue", BASE_ANCHOR_HUE))
    except (ValueError, TypeError) as error:
        raise ValueError("渐变色相必须是有效数字。") from error
    if not math.isfinite(anchor):
        raise ValueError("渐变色相必须是有效数字。")
    return {key: palette[key].upper() for key in BASE_PALETTE}, anchor % 360
