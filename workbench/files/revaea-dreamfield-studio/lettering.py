from __future__ import annotations

import math
import re
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass

from core import monochrome_palette
from font_library import FONT_ID
from PySide6.QtCore import Qt
from PySide6.QtGui import QPainterPath, QTextLayout, QTransform

SVG_NS = "http://www.w3.org/2000/svg"
LEGACY_TEXT_COLOR = "#FF7075"
ET.register_namespace("", SVG_NS)
ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")


@dataclass(frozen=True)
class LetteringSettings:
    enabled: bool = False
    text: str = "Cedarflake - Lab"
    family: str = "Bauhaus 93"
    style: str = "Regular"
    asset_id: str | None = None
    size: float = 100
    tracking: float = 0
    gap: float = 20
    color: str = LEGACY_TEXT_COLOR
    follow_logo: bool = True

    def to_dict(self):
        return asdict(self)

    @classmethod
    def from_dict(cls, data):
        if not isinstance(data, dict):
            raise ValueError("方案中的文字设置格式无效。")
        values = cls().to_dict() | {
            key: value for key, value in data.items() if key in cls.__dataclass_fields__
        }
        for key, limit in (("text", 80), ("family", 200), ("style", 120)):
            if not isinstance(values[key], str) or len(values[key]) > limit:
                raise ValueError("文字内容或字体名称过长，请重新输入。")
        if any(character in values["text"] for character in ("\n", "\r", "\t", "\x00")):
            raise ValueError("文字标识只支持单行文字。")
        if type(values["enabled"]) is not bool:
            raise ValueError("文字开关必须为 true 或 false。")
        if values["asset_id"] is not None and (
            not isinstance(values["asset_id"], str) or not FONT_ID.fullmatch(values["asset_id"])
        ):
            raise ValueError("方案中的字体编号无效。")
        if not isinstance(values["color"], str) or not re.fullmatch(
            r"#[a-fA-F0-9]{6}", values["color"]
        ):
            raise ValueError("文字颜色必须是 #RRGGBB 格式。")
        if "follow_logo" not in data and "color" in data:
            values["follow_logo"] = values["color"].upper() == LEGACY_TEXT_COLOR
        if type(values["follow_logo"]) is not bool:
            raise ValueError("跟随 Logo 配色必须为 true 或 false。")
        for key, low, high in (("size", 30, 150), ("tracking", -10, 40), ("gap", 0, 100)):
            try:
                number = float(values[key])
            except (TypeError, ValueError) as error:
                raise ValueError("文字大小和间距必须为有效数字。") from error
            if not math.isfinite(number) or not low <= number <= high:
                raise ValueError("文字大小或间距超出可用范围。")
            values[key] = number
        return cls(**values)


def resolve_lettering_color(settings, linked_color, color_mode="color"):
    if color_mode in ("black", "white"):
        return "#000000" if color_mode == "black" else "#FFFFFF"
    color = linked_color if settings.follow_logo else settings.color
    if color_mode == "grayscale":
        return monochrome_palette({"text": color})["text"]
    return color.upper()


def text_path(settings, font):
    if not settings.text.strip():
        raise ValueError("输入文字后即可预览和导出文字标识。")
    layout = QTextLayout(settings.text, font)
    layout.beginLayout()
    line = layout.createLine()
    line.setLineWidth(1000000)
    layout.endLayout()
    if any(0 in run.glyphIndexes() for run in layout.glyphRuns()):
        raise ValueError("部分文字缺少字形，请选择或导入支持这些文字的字体。")
    path = QPainterPath()
    path.setFillRule(Qt.WindingFill)
    path.addText(0, 0, font, settings.text)
    bounds = path.boundingRect()
    if bounds.isEmpty():
        raise ValueError("这个字体没有可导出的文字轮廓，请选择其他字体。")
    # One design-space unit system keeps spacing independent of output resolution.
    height = max(1400, bounds.height() + 400)
    transform = QTransform.fromTranslate(
        1200 + settings.gap * 10 - bounds.left(), height / 2 - bounds.center().y()
    )
    path = transform.map(path)
    width = path.boundingRect().right() + 200
    return path, (width, height)


def path_data(path):
    commands = []
    index = 0
    while index < path.elementCount():
        element = path.elementAt(index)
        if element.isMoveTo():
            commands.append(f"M{element.x:.4f} {element.y:.4f}")
        elif element.isLineTo():
            commands.append(f"L{element.x:.4f} {element.y:.4f}")
        elif element.isCurveTo():
            control = path.elementAt(index + 1)
            end = path.elementAt(index + 2)
            commands.append(
                f"C{element.x:.4f} {element.y:.4f} {control.x:.4f} {control.y:.4f} {end.x:.4f} {end.y:.4f}"
            )
            index += 2
        index += 1
    return " ".join(commands)


def compose_lettering(icon_svg, settings, path, canvas, width, color, opacity):
    design_width, design_height = canvas
    height = max(1, round(width * design_height / design_width))
    root = ET.Element(
        f"{{{SVG_NS}}}svg",
        width=str(width),
        height=str(height),
        viewBox=f"0 0 {design_width:.4f} {design_height:.4f}",
    )
    ET.SubElement(root, f"{{{SVG_NS}}}title").text = settings.text
    icon = ET.fromstring(icon_svg)
    left, top, icon_width, icon_height = (float(value) for value in icon.attrib["viewBox"].split())
    group = ET.SubElement(
        root,
        f"{{{SVG_NS}}}g",
        id="logo",
        transform=(
            f"translate(200 {(design_height - 1000) / 2:.4f}) "
            f"scale({1000 / icon_width:.8f} {1000 / icon_height:.8f}) "
            f"translate({-left:.4f} {-top:.4f})"
        ),
    )
    # Qt SVG does not reliably render nested SVG viewports; transform their contents instead.
    group.extend(icon)
    ET.SubElement(
        root,
        f"{{{SVG_NS}}}path",
        id="wordmark",
        d=path_data(path),
        fill=color,
        opacity=f"{opacity:.4f}",
        attrib={"fill-rule": "nonzero"},
    )
    return ET.tostring(root, encoding="unicode"), (int(width), height)
