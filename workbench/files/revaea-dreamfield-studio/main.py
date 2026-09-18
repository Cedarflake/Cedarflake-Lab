from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageChops, features
from PySide6.QtCore import QRectF, QSize, Qt, Signal
from PySide6.QtGui import QBrush, QColor, QImage, QLinearGradient, QPainter, QPen
from PySide6.QtSvg import QSvgRenderer
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QComboBox,
    QFileDialog,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QSlider,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from core import (
    BASE_ANCHOR_HUE,
    BASE_PALETTE,
    EXPORT_SIZES,
    PRESETS,
    build_palette,
    build_svg,
    clamp,
)


APP_NAME = "Revaea Dream Field Studio"
COMMON_SIZES = {16, 32, 48, 64, 128, 256, 512, 1024}
COMMON_FORMATS = {"SVG", "PNG", "WebP", "ICO"}

FORMAT_OPTIONS = [
    ("SVG", True),
    ("PNG", True),
    ("WebP", True),
    ("AVIF", False),
    ("JPEG", False),
    ("ICO", True),
    ("TIFF", False),
    ("BMP", False),
]


class HueStrip(QWidget):
    valueChanged = Signal(float)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._value = 0.0
        self.setMinimumHeight(52)
        self.setMaximumHeight(52)
        self.setCursor(Qt.PointingHandCursor)
        self.setFocusPolicy(Qt.StrongFocus)

    def sizeHint(self):
        return QSize(430, 52)

    def setValue(self, value, emit=True):
        value = float(value) % 360.0
        if abs(value - self._value) < 0.001:
            return

        self._value = value
        self.update()

        if emit:
            self.valueChanged.emit(value)

    def valueFromX(self, x):
        padding = 14
        usable_width = max(1, self.width() - padding * 2)
        return clamp((x - padding) / usable_width) * 360.0

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self.setValue(self.valueFromX(event.position().x()))

    def mouseMoveEvent(self, event):
        if event.buttons() & Qt.LeftButton:
            self.setValue(self.valueFromX(event.position().x()))

    def keyPressEvent(self, event):
        step = 10 if event.modifiers() & Qt.ShiftModifier else 1

        if event.key() in (Qt.Key_Left, Qt.Key_Down):
            self.setValue(self._value - step)
            return

        if event.key() in (Qt.Key_Right, Qt.Key_Up):
            self.setValue(self._value + step)
            return

        super().keyPressEvent(event)

    def paintEvent(self, _event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)

        padding = 14
        bar = QRectF(padding, 11, self.width() - padding * 2, 30)
        gradient = QLinearGradient(bar.left(), 0, bar.right(), 0)

        for degree in range(0, 361, 30):
            gradient.setColorAt(
                degree / 360.0,
                QColor.fromHsv(degree % 360, 230, 245),
            )

        painter.setPen(Qt.NoPen)
        painter.setBrush(QBrush(gradient))
        painter.drawRoundedRect(bar, 15, 15)

        x = bar.left() + bar.width() * (self._value / 360.0)

        painter.setPen(QPen(QColor("#24252A"), 2))
        painter.setBrush(QColor("#FFFFFF"))
        painter.drawEllipse(QRectF(x - 11, bar.center().y() - 11, 22, 22))

        painter.setPen(Qt.NoPen)
        painter.setBrush(QColor.fromHsv(int(self._value) % 360, 220, 245))
        painter.drawEllipse(QRectF(x - 6, bar.center().y() - 6, 12, 12))


class PaletteStrip(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.palette = BASE_PALETTE.copy()
        self.setMinimumHeight(74)
        self.setMaximumHeight(74)

    def setPalette(self, palette):
        self.palette = palette
        self.update()

    def paintEvent(self, _event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)

        count = 9
        gap = 5
        margin = 4
        swatch_width = max(
            12.0,
            (self.width() - margin * 2 - gap * (count - 1)) / count,
        )

        for index in range(count):
            x = margin + index * (swatch_width + gap)
            color = QColor(self.palette[f"c{index}"])

            painter.setPen(Qt.NoPen)
            painter.setBrush(color)
            painter.drawRoundedRect(QRectF(x, 8, swatch_width, 42), 8, 8)

            painter.setPen(QColor("#777"))
            painter.drawText(
                QRectF(x, 53, swatch_width, 18),
                Qt.AlignCenter,
                f"c{index}",
            )


class IconPreview(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.svg_bytes = b""
        self.background = "dark"
        self.pixel_size = None
        self.setMinimumSize(430, 430)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)

    def setSvg(self, svg_text):
        self.svg_bytes = svg_text.encode("utf-8")
        self.update()

    def setBackground(self, background):
        self.background = background
        self.update()

    def setPixelSize(self, size):
        self.pixel_size = size
        self.update()

    def drawCheckerboard(self, painter, rect):
        cell = 24
        first = QColor("#E6E6EA")
        second = QColor("#CACAD0")
        y = int(rect.top())
        row = 0

        while y < rect.bottom():
            x = int(rect.left())
            column = 0

            while x < rect.right():
                color = first if (row + column) % 2 == 0 else second
                painter.fillRect(x, y, cell, cell, color)
                x += cell
                column += 1

            y += cell
            row += 1

    def paintEvent(self, _event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)

        area = self.rect().adjusted(10, 10, -10, -10)

        if self.background == "dark":
            painter.fillRect(area, QColor("#101115"))
        elif self.background == "light":
            painter.fillRect(area, QColor("#F6F6F8"))
        else:
            self.drawCheckerboard(painter, area)

        if not self.svg_bytes:
            return

        renderer = QSvgRenderer(self.svg_bytes)
        side = min(area.width(), area.height())
        target = QRectF(
            area.center().x() - side / 2,
            area.center().y() - side / 2,
            side,
            side,
        )

        if self.pixel_size is None:
            renderer.render(painter, target)
            return

        size = int(self.pixel_size)
        image = QImage(size, size, QImage.Format_ARGB32)
        image.fill(Qt.transparent)

        buffer_painter = QPainter(image)
        buffer_painter.setRenderHint(QPainter.Antialiasing)
        renderer.render(buffer_painter, QRectF(0, 0, size, size))
        buffer_painter.end()

        painter.setRenderHint(QPainter.SmoothPixmapTransform, False)
        painter.drawImage(target, image)


class StudioWindow(QMainWindow):
    def __init__(self):
        super().__init__()

        self.hue = BASE_ANCHOR_HUE
        self.saturation = 1.0
        self.contrast = 1.0
        self.optical_scale = 1.0
        self.small_icon_enabled = True
        self.small_icon_threshold = 32
        self.small_icon_strength = 0.65
        self.preview_pixel_size = None
        self.applying_preset = False

        self.setWindowTitle(APP_NAME)
        self.resize(1180, 800)
        self.setMinimumSize(960, 690)

        self.buildUi()
        self.hue_strip.setValue(self.hue, emit=False)
        self.hue_spin.blockSignals(True)
        self.hue_spin.setValue(round(self.hue) % 360)
        self.hue_spin.blockSignals(False)
        self.refresh()

    def card(self):
        frame = QFrame()
        frame.setFrameShape(QFrame.StyledPanel)
        frame.setStyleSheet(
            "QFrame{border:1px solid palette(mid);border-radius:10px;}"
            "QLabel,QPushButton,QSlider,QCheckBox,QComboBox,QSpinBox{border:none;}"
        )
        return frame

    def buildUi(self):
        root = QWidget()
        self.setCentralWidget(root)

        layout = QHBoxLayout(root)
        layout.setContentsMargins(18, 18, 18, 18)
        layout.setSpacing(18)

        layout.addLayout(self.buildPreviewPanel(), 3)
        layout.addWidget(self.buildControlPanel(), 2)

    def buildPreviewPanel(self):
        panel = QVBoxLayout()
        panel.setSpacing(10)

        header = QHBoxLayout()
        title = QLabel("Revaea Dream Field")
        title.setStyleSheet("font-size:22px;font-weight:700;")
        header.addWidget(title)
        header.addStretch()

        self.background_combo = QComboBox()
        self.background_combo.addItems(["深色背景", "浅色背景", "透明棋盘"])
        self.background_combo.currentIndexChanged.connect(self.backgroundChanged)
        header.addWidget(self.background_combo)

        panel.addLayout(header)

        self.preview = IconPreview()
        panel.addWidget(self.preview, 1)

        self.palette_strip = PaletteStrip()
        panel.addWidget(self.palette_strip)

        self.status = QLabel()
        self.status.setStyleSheet("color:#777;")
        panel.addWidget(self.status)

        return panel

    def buildControlPanel(self):
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setMinimumWidth(390)
        scroll.setMaximumWidth(470)

        content = QWidget()
        scroll.setWidget(content)

        layout = QVBoxLayout(content)
        layout.setContentsMargins(4, 4, 8, 4)
        layout.setSpacing(14)

        layout.addWidget(self.buildColorCard())
        layout.addWidget(self.buildAdjustmentCard())
        layout.addWidget(self.buildSmallIconCard())
        layout.addWidget(self.buildExportCard())
        layout.addStretch()

        return scroll

    def buildColorCard(self):
        frame = self.card()
        layout = QVBoxLayout(frame)
        layout.setContentsMargins(14, 14, 14, 14)
        layout.setSpacing(8)

        title = QLabel("整体色相")
        title.setStyleSheet("font-size:16px;font-weight:650;")
        layout.addWidget(title)

        description = QLabel(
            "拖到哪种颜色，图标的核心主色 c6 就变成哪种颜色；"
            "其他区域保持原来的相对色相关系。"
        )
        description.setWordWrap(True)
        description.setStyleSheet("color:#777;")
        layout.addWidget(description)

        self.hue_strip = HueStrip()
        self.hue_strip.valueChanged.connect(self.hueChanged)
        layout.addWidget(self.hue_strip)

        hue_row = QHBoxLayout()
        hue_row.addWidget(QLabel("主色相（c6）"))

        self.hue_spin = QSpinBox()
        self.hue_spin.setRange(0, 359)
        self.hue_spin.setSuffix("°")
        self.hue_spin.valueChanged.connect(self.hueSpinChanged)
        hue_row.addWidget(self.hue_spin)
        hue_row.addStretch()
        layout.addLayout(hue_row)

        preset_row = QHBoxLayout()

        self.preset_combo = QComboBox()
        self.preset_combo.addItems([*PRESETS.keys(), "自定义"])
        self.preset_combo.currentTextChanged.connect(self.presetChanged)
        preset_row.addWidget(self.preset_combo, 1)

        reset_button = QPushButton("恢复原版")
        reset_button.clicked.connect(self.reset)
        preset_row.addWidget(reset_button)
        layout.addLayout(preset_row)

        file_row = QHBoxLayout()

        save_button = QPushButton("保存方案…")
        save_button.clicked.connect(self.savePreset)
        file_row.addWidget(save_button)

        load_button = QPushButton("载入方案…")
        load_button.clicked.connect(self.loadPreset)
        file_row.addWidget(load_button)

        layout.addLayout(file_row)
        return frame

    def buildAdjustmentCard(self):
        frame = self.card()
        layout = QGridLayout(frame)
        layout.setContentsMargins(14, 14, 14, 14)
        layout.setHorizontalSpacing(10)
        layout.setVerticalSpacing(12)

        title = QLabel("微调")
        title.setStyleSheet("font-size:16px;font-weight:650;")
        layout.addWidget(title, 0, 0, 1, 3)

        self.saturation_slider, self.saturation_label = self.addSliderRow(
            layout,
            1,
            "饱和度",
            40,
            160,
            100,
        )
        self.contrast_slider, self.contrast_label = self.addSliderRow(
            layout,
            2,
            "明暗层次",
            60,
            145,
            100,
        )
        self.scale_slider, self.scale_label = self.addSliderRow(
            layout,
            3,
            "图标占比",
            82,
            100,
            100,
        )

        self.saturation_slider.valueChanged.connect(self.adjustmentsChanged)
        self.contrast_slider.valueChanged.connect(self.adjustmentsChanged)
        self.scale_slider.valueChanged.connect(self.adjustmentsChanged)

        return frame

    def addSliderRow(self, layout, row, title, low, high, value):
        layout.addWidget(QLabel(title), row, 0)

        slider = QSlider(Qt.Horizontal)
        slider.setRange(low, high)
        slider.setValue(value)
        layout.addWidget(slider, row, 1)

        label = QLabel(f"{value}%")
        layout.addWidget(label, row, 2)

        return slider, label

    def buildSmallIconCard(self):
        frame = self.card()
        layout = QGridLayout(frame)
        layout.setContentsMargins(14, 14, 14, 14)
        layout.setHorizontalSpacing(10)
        layout.setVerticalSpacing(10)

        title = QLabel("小尺寸优化")
        title.setStyleSheet("font-size:16px;font-weight:650;")
        layout.addWidget(title, 0, 0, 1, 3)

        self.small_icon_check = QCheckBox("自动优化小尺寸")
        self.small_icon_check.setChecked(True)
        self.small_icon_check.toggled.connect(self.smallIconSettingsChanged)
        layout.addWidget(self.small_icon_check, 1, 0, 1, 3)

        layout.addWidget(QLabel("优化阈值"), 2, 0)

        self.small_icon_threshold_combo = QComboBox()
        self.small_icon_threshold_combo.addItems(["≤ 24 px", "≤ 32 px", "≤ 48 px"])
        self.small_icon_threshold_combo.setCurrentText("≤ 32 px")
        self.small_icon_threshold_combo.currentIndexChanged.connect(
            self.smallIconSettingsChanged
        )
        layout.addWidget(self.small_icon_threshold_combo, 2, 1, 1, 2)

        layout.addWidget(QLabel("优化强度"), 3, 0)

        self.small_icon_strength_slider = QSlider(Qt.Horizontal)
        self.small_icon_strength_slider.setRange(0, 100)
        self.small_icon_strength_slider.setValue(65)
        self.small_icon_strength_slider.valueChanged.connect(
            self.smallIconSettingsChanged
        )
        layout.addWidget(self.small_icon_strength_slider, 3, 1)

        self.small_icon_strength_label = QLabel("65%")
        layout.addWidget(self.small_icon_strength_label, 3, 2)

        layout.addWidget(QLabel("预览输出"), 4, 0)

        self.preview_size_combo = QComboBox()
        self.preview_size_combo.addItems(
            ["矢量母版", "16 px", "20 px", "24 px", "32 px", "48 px", "64 px"]
        )
        self.preview_size_combo.currentIndexChanged.connect(self.previewSizeChanged)
        layout.addWidget(self.preview_size_combo, 4, 1, 1, 2)

        description = QLabel(
            "选择实际像素尺寸后，左侧会先按该尺寸栅格化，再放大显示。"
        )
        description.setWordWrap(True)
        description.setStyleSheet("color:#777;")
        layout.addWidget(description, 5, 0, 1, 3)

        return frame

    def buildExportCard(self):
        frame = self.card()
        layout = QVBoxLayout(frame)
        layout.setContentsMargins(14, 14, 14, 14)
        layout.setSpacing(8)

        title = QLabel("导出")
        title.setStyleSheet("font-size:16px;font-weight:650;")
        layout.addWidget(title)

        description = QLabel(
            "可一次导出 SVG、PNG、WebP、AVIF、JPEG、ICO、TIFF、BMP。"
            "JPEG 和 BMP 会使用指定背景色。"
        )
        description.setWordWrap(True)
        description.setStyleSheet("color:#777;")
        layout.addWidget(description)

        layout.addWidget(QLabel("格式"))
        layout.addLayout(self.buildFormatGrid())

        format_buttons = QHBoxLayout()

        common_button = QPushButton("常用格式")
        common_button.clicked.connect(self.selectCommonFormats)
        format_buttons.addWidget(common_button)

        all_button = QPushButton("全选格式")
        all_button.clicked.connect(self.selectAllFormats)
        format_buttons.addWidget(all_button)

        format_buttons.addStretch()
        layout.addLayout(format_buttons)

        layout.addWidget(QLabel("尺寸"))
        layout.addLayout(self.buildSizeGrid())

        size_buttons = QHBoxLayout()

        common_size_button = QPushButton("只选常用")
        common_size_button.clicked.connect(self.selectCommonSizes)
        size_buttons.addWidget(common_size_button)

        all_size_button = QPushButton("全选尺寸")
        all_size_button.clicked.connect(self.selectAllSizes)
        size_buttons.addWidget(all_size_button)

        size_buttons.addStretch()
        layout.addLayout(size_buttons)

        options = QGridLayout()

        options.addWidget(QLabel("有损质量"), 0, 0)

        self.quality_spin = QSpinBox()
        self.quality_spin.setRange(50, 100)
        self.quality_spin.setValue(95)
        self.quality_spin.setSuffix("%")
        options.addWidget(self.quality_spin, 0, 1)

        self.webp_lossless_check = QCheckBox("WebP 无损")
        self.webp_lossless_check.setChecked(True)
        options.addWidget(self.webp_lossless_check, 0, 2)

        self.webp_compat_check = QCheckBox("WebP 透明兼容")
        self.webp_compat_check.setChecked(True)
        options.addWidget(self.webp_compat_check, 1, 0, 1, 3)

        options.addWidget(QLabel("JPEG/BMP 背景"), 2, 0)

        self.opaque_background_combo = QComboBox()
        self.opaque_background_combo.addItems(["白色", "黑色", "跟随预览"])
        options.addWidget(self.opaque_background_combo, 2, 1, 1, 2)

        layout.addLayout(options)

        export_button = QPushButton("一键导出所选格式…")
        export_button.setMinimumHeight(48)
        export_button.setStyleSheet("font-weight:700;")
        export_button.clicked.connect(self.exportSelected)
        layout.addWidget(export_button)

        return frame

    def buildFormatGrid(self):
        layout = QGridLayout()
        self.format_checks = {}

        for index, (format_name, checked) in enumerate(FORMAT_OPTIONS):
            checkbox = QCheckBox(format_name)
            checkbox.setChecked(checked)

            if format_name == "WebP" and not features.check("webp"):
                checkbox.setChecked(False)
                checkbox.setEnabled(False)

            if format_name == "AVIF":
                try:
                    supported = features.check("avif")
                except Exception:
                    supported = False

                if not supported:
                    checkbox.setChecked(False)
                    checkbox.setEnabled(False)

            self.format_checks[format_name] = checkbox
            layout.addWidget(checkbox, index // 4, index % 4)

        return layout

    def buildSizeGrid(self):
        layout = QGridLayout()
        self.size_checks = {}

        for index, size in enumerate(EXPORT_SIZES):
            checkbox = QCheckBox(f"{size}×{size}")
            checkbox.setChecked(size in COMMON_SIZES)
            self.size_checks[size] = checkbox
            layout.addWidget(checkbox, index // 3, index % 3)

        return layout

    def currentPalette(self):
        return build_palette(self.hue, self.saturation, self.contrast)

    def useSmallIconMode(self, size, master=False):
        return (
            not master
            and self.small_icon_enabled
            and int(size) <= self.small_icon_threshold
        )

    def currentSvg(self, size=1024, master=False):
        return build_svg(
            self.currentPalette(),
            width=size,
            height=size,
            optical_scale=self.optical_scale,
            small_icon=self.useSmallIconMode(size, master),
            small_strength=self.small_icon_strength,
        )

    def refresh(self):
        palette = self.currentPalette()
        self.palette_strip.setPalette(palette)

        if self.preview_pixel_size is None:
            self.preview.setSvg(self.currentSvg(1024, master=True))
            self.preview.setPixelSize(None)
            preview_text = "矢量母版"
        else:
            self.preview.setSvg(self.currentSvg(self.preview_pixel_size))
            self.preview.setPixelSize(self.preview_pixel_size)
            preview_text = f"{self.preview_pixel_size}px"

        if self.small_icon_enabled:
            small_text = (
                f"小尺寸 ≤{self.small_icon_threshold}px / "
                f"{round(self.small_icon_strength * 100)}%"
            )
        else:
            small_text = "小尺寸优化关闭"

        self.status.setText(
            f"主色相 {round(self.hue) % 360}° · "
            f"饱和度 {round(self.saturation * 100)}% · "
            f"明暗层次 {round(self.contrast * 100)}% · "
            f"图标占比 {round(self.optical_scale * 100)}% · "
            f"{small_text} · 预览 {preview_text}"
        )

    def backgroundChanged(self, index):
        modes = ["dark", "light", "checker"]
        self.preview.setBackground(modes[index])

    def hueChanged(self, value):
        self.hue = value

        self.hue_spin.blockSignals(True)
        self.hue_spin.setValue(round(value) % 360)
        self.hue_spin.blockSignals(False)

        if not self.applying_preset:
            self.setPresetName("自定义")

        self.refresh()

    def hueSpinChanged(self, value):
        self.hue = float(value)
        self.hue_strip.setValue(value, emit=False)
        self.setPresetName("自定义")
        self.refresh()

    def presetChanged(self, name):
        if name not in PRESETS:
            return

        self.applying_preset = True

        try:
            self.hue_strip.setValue(PRESETS[name])
            self.saturation_slider.setValue(100)
            self.contrast_slider.setValue(100)
        finally:
            self.applying_preset = False

    def setPresetName(self, name):
        self.preset_combo.blockSignals(True)
        self.preset_combo.setCurrentText(name)
        self.preset_combo.blockSignals(False)

    def adjustmentsChanged(self):
        self.saturation = self.saturation_slider.value() / 100.0
        self.contrast = self.contrast_slider.value() / 100.0
        self.optical_scale = self.scale_slider.value() / 100.0

        self.saturation_label.setText(f"{self.saturation_slider.value()}%")
        self.contrast_label.setText(f"{self.contrast_slider.value()}%")
        self.scale_label.setText(f"{self.scale_slider.value()}%")

        if not self.applying_preset:
            self.setPresetName("自定义")

        self.refresh()

    def smallIconSettingsChanged(self, *_args):
        self.small_icon_enabled = self.small_icon_check.isChecked()

        text = self.small_icon_threshold_combo.currentText()
        number = "".join(character for character in text if character.isdigit())
        self.small_icon_threshold = int(number) if number else 32

        self.small_icon_strength = self.small_icon_strength_slider.value() / 100.0
        self.small_icon_strength_label.setText(
            f"{self.small_icon_strength_slider.value()}%"
        )

        self.refresh()

    def previewSizeChanged(self, _index):
        text = self.preview_size_combo.currentText()

        if text == "矢量母版":
            self.preview_pixel_size = None
        else:
            number = "".join(character for character in text if character.isdigit())
            self.preview_pixel_size = int(number) if number else None

        self.refresh()

    def reset(self):
        self.applying_preset = True

        try:
            self.hue = BASE_ANCHOR_HUE
            self.hue_strip.setValue(self.hue, emit=False)

            self.hue_spin.blockSignals(True)
            self.hue_spin.setValue(round(self.hue) % 360)
            self.hue_spin.blockSignals(False)

            self.saturation_slider.setValue(100)
            self.contrast_slider.setValue(100)
            self.scale_slider.setValue(100)

            self.small_icon_check.setChecked(True)
            self.small_icon_threshold_combo.setCurrentText("≤ 32 px")
            self.small_icon_strength_slider.setValue(65)
            self.preview_size_combo.setCurrentText("矢量母版")

            self.setPresetName("原版粉紫")
        finally:
            self.applying_preset = False

        self.adjustmentsChanged()
        self.smallIconSettingsChanged()
        self.refresh()

    def presetData(self):
        return {
            "schema": "revaea-dream-field-preset",
            "version": 1,
            "visual": {
                "hue": float(self.hue),
                "saturation": float(self.saturation),
                "contrast": float(self.contrast),
                "optical_scale": float(self.optical_scale),
            },
            "small_icon": {
                "enabled": bool(self.small_icon_enabled),
                "threshold": int(self.small_icon_threshold),
                "strength": float(self.small_icon_strength),
            },
            "preview": {
                "background": self.background_combo.currentText(),
                "pixel_size": self.preview_pixel_size,
            },
            "export": {
                "formats": self.selectedFormats(),
                "sizes": self.selectedSizes(),
                "quality": int(self.quality_spin.value()),
                "webp_lossless": bool(self.webp_lossless_check.isChecked()),
                "webp_compat": bool(self.webp_compat_check.isChecked()),
                "opaque_background": self.opaque_background_combo.currentText(),
            },
        }

    def savePreset(self):
        path, _ = QFileDialog.getSaveFileName(
            self,
            "保存 Revaea 方案",
            "Revaea-preset.json",
            "Revaea Preset (*.json);;JSON (*.json)",
        )

        if not path:
            return

        if not path.lower().endswith(".json"):
            path += ".json"

        try:
            content = json.dumps(self.presetData(), ensure_ascii=False, indent=2)
            Path(path).write_text(content, encoding="utf-8")
        except Exception as error:
            QMessageBox.critical(self, "保存失败", str(error))
            return

        self.status.setText(f"方案已保存：{path}")

    def loadPreset(self):
        path, _ = QFileDialog.getOpenFileName(
            self,
            "载入 Revaea 方案",
            "",
            "Revaea Preset (*.json);;JSON (*.json)",
        )

        if not path:
            return

        try:
            data = json.loads(Path(path).read_text(encoding="utf-8"))
            self.applyPresetData(data)
        except Exception as error:
            QMessageBox.critical(
                self,
                "载入失败",
                f"无法载入这个方案：\n\n{error}",
            )
            return

        self.status.setText(f"方案已载入：{path}")

    def applyPresetData(self, data):
        if not isinstance(data, dict):
            raise ValueError("预设文件不是有效的 JSON 对象。")

        schema = data.get("schema")
        if schema not in (None, "revaea-dream-field-preset"):
            raise ValueError("这不是 Revaea Dream Field 预设。")

        visual = data.get("visual", {})
        small = data.get("small_icon", {})
        preview = data.get("preview", {})
        export = data.get("export", {})

        hue = float(visual.get("hue", BASE_ANCHOR_HUE)) % 360.0
        saturation = clamp(float(visual.get("saturation", 1.0)), 0.4, 1.6)
        contrast = clamp(float(visual.get("contrast", 1.0)), 0.6, 1.45)
        scale = clamp(float(visual.get("optical_scale", 1.0)), 0.82, 1.0)

        self.applying_preset = True

        try:
            self.hue = hue
            self.hue_strip.setValue(hue, emit=False)

            self.hue_spin.blockSignals(True)
            self.hue_spin.setValue(round(hue) % 360)
            self.hue_spin.blockSignals(False)

            self.saturation_slider.setValue(round(saturation * 100))
            self.contrast_slider.setValue(round(contrast * 100))
            self.scale_slider.setValue(round(scale * 100))
            self.setPresetName("自定义")

            enabled = bool(small.get("enabled", True))
            threshold = int(small.get("threshold", 32))
            strength = clamp(float(small.get("strength", 0.65)))

            if threshold not in (24, 32, 48):
                threshold = min((24, 32, 48), key=lambda value: abs(value - threshold))

            self.small_icon_check.setChecked(enabled)
            self.small_icon_threshold_combo.setCurrentText(f"≤ {threshold} px")
            self.small_icon_strength_slider.setValue(round(strength * 100))

            background = preview.get("background", "深色背景")
            if background in ("深色背景", "浅色背景", "透明棋盘"):
                self.background_combo.setCurrentText(background)

            pixel_size = preview.get("pixel_size")
            preview_name = "矢量母版" if not pixel_size else f"{int(pixel_size)} px"
            index = self.preview_size_combo.findText(preview_name)
            if index >= 0:
                self.preview_size_combo.setCurrentIndex(index)

            formats = set(export.get("formats", []))
            if formats:
                for name, checkbox in self.format_checks.items():
                    checkbox.setChecked(checkbox.isEnabled() and name in formats)

            sizes = {
                int(value)
                for value in export.get("sizes", [])
                if str(value).isdigit()
            }
            if sizes:
                for size, checkbox in self.size_checks.items():
                    checkbox.setChecked(size in sizes)

            self.quality_spin.setValue(
                max(50, min(100, int(export.get("quality", 95))))
            )
            self.webp_lossless_check.setChecked(
                bool(export.get("webp_lossless", True))
            )
            self.webp_compat_check.setChecked(
                bool(export.get("webp_compat", True))
            )

            opaque_background = export.get("opaque_background", "白色")
            if opaque_background in ("白色", "黑色", "跟随预览"):
                self.opaque_background_combo.setCurrentText(opaque_background)
        finally:
            self.applying_preset = False

        self.adjustmentsChanged()
        self.smallIconSettingsChanged()
        self.previewSizeChanged(self.preview_size_combo.currentIndex())

    def selectCommonSizes(self):
        for size, checkbox in self.size_checks.items():
            checkbox.setChecked(size in COMMON_SIZES)

    def selectAllSizes(self):
        for checkbox in self.size_checks.values():
            checkbox.setChecked(True)

    def selectedSizes(self):
        return [
            size
            for size, checkbox in self.size_checks.items()
            if checkbox.isChecked()
        ]

    def selectCommonFormats(self):
        for name, checkbox in self.format_checks.items():
            checkbox.setChecked(checkbox.isEnabled() and name in COMMON_FORMATS)

    def selectAllFormats(self):
        for checkbox in self.format_checks.values():
            if checkbox.isEnabled():
                checkbox.setChecked(True)

    def selectedFormats(self):
        return [
            name
            for name, checkbox in self.format_checks.items()
            if checkbox.isChecked()
        ]

    def renderImage(self, size):
        renderer = QSvgRenderer(self.currentSvg(size).encode("utf-8"))

        image = QImage(size, size, QImage.Format_RGBA8888)
        image.fill(Qt.transparent)

        painter = QPainter(image)
        painter.setRenderHint(QPainter.Antialiasing)
        painter.setRenderHint(QPainter.SmoothPixmapTransform)
        renderer.render(painter, QRectF(0, 0, size, size))
        painter.end()

        raw = bytes(image.constBits())

        return Image.frombuffer(
            "RGBA",
            (size, size),
            raw,
            "raw",
            "RGBA",
            image.bytesPerLine(),
            1,
        ).copy()

    def opaqueBackground(self):
        mode = self.opaque_background_combo.currentText()

        if mode == "黑色":
            return 16, 17, 21

        if mode == "跟随预览":
            if self.background_combo.currentIndex() == 0:
                return 16, 17, 21
            return 246, 246, 248

        return 255, 255, 255

    def flatten(self, image):
        background = Image.new("RGBA", image.size, self.opaqueBackground() + (255,))
        background.alpha_composite(image)
        return background.convert("RGB")

    def cleanTransparentPixels(self, image):
        rgba = image.convert("RGBA")

        if not self.webp_compat_check.isChecked():
            return rgba

        red, green, blue, alpha = rgba.split()
        zero = Image.new("L", rgba.size, 0)
        transparent = alpha.point(lambda value: 255 if value == 0 else 0)

        red.paste(zero, mask=transparent)
        green.paste(zero, mask=transparent)
        blue.paste(zero, mask=transparent)

        return Image.merge("RGBA", (red, green, blue, alpha))

    def verifyWebp(self, source, path, lossless):
        with Image.open(path) as file:
            decoded = file.convert("RGBA")
            decoded.load()

        if decoded.size != source.size:
            raise RuntimeError(
                f"WebP 回读尺寸异常：写入 {source.size}，读回 {decoded.size}"
            )

        if lossless and self.webp_compat_check.isChecked():
            difference = ImageChops.difference(source, decoded)
            if difference.getbbox() is not None:
                raise RuntimeError(
                    "WebP 无损回读校验失败：编码后像素与源 RGBA 不一致。"
                )

    def saveRaster(self, image, path, format_name):
        quality = int(self.quality_spin.value())

        if format_name == "PNG":
            image.save(path, "PNG", optimize=True)
            return

        if format_name == "WebP":
            self.saveWebp(image, path, quality)
            return

        if format_name == "AVIF":
            image.save(path, "AVIF", quality=quality, speed=6)
            return

        if format_name == "JPEG":
            self.flatten(image).save(
                path,
                "JPEG",
                quality=quality,
                subsampling=0,
                optimize=True,
            )
            return

        if format_name == "TIFF":
            image.save(path, "TIFF", compression="tiff_deflate")
            return

        if format_name == "BMP":
            self.flatten(image).save(path, "BMP")
            return

        raise ValueError(f"不支持的导出格式：{format_name}")

    def saveWebp(self, image, path, quality):
        webp = self.cleanTransparentPixels(image)
        lossless = self.webp_lossless_check.isChecked()
        exact = self.webp_compat_check.isChecked()

        if lossless:
            webp.save(
                path,
                "WEBP",
                lossless=True,
                quality=100,
                method=6,
                exact=exact,
            )
        else:
            webp.save(
                path,
                "WEBP",
                lossless=False,
                quality=quality,
                alpha_quality=100,
                method=6,
                exact=exact,
            )

        self.verifyWebp(webp, path, lossless)

    def saveIco(self, path, sizes):
        ico_sizes = sorted({size for size in sizes if size <= 256})

        if not ico_sizes:
            ico_sizes = [16, 32, 48, 64, 128, 256]

        frames = [self.renderImage(size) for size in ico_sizes]
        frames[-1].save(
            path,
            "ICO",
            sizes=[(size, size) for size in ico_sizes],
            append_images=frames[:-1],
            bitmap_format="png",
        )

    def exportSelected(self):
        formats = self.selectedFormats()
        sizes = self.selectedSizes()

        if not formats:
            QMessageBox.warning(self, "没有格式", "至少勾选一个导出格式。")
            return

        if any(name != "SVG" for name in formats) and not sizes:
            QMessageBox.warning(
                self,
                "没有尺寸",
                "导出位图或 ICO 时至少勾选一个尺寸。",
            )
            return

        folder = QFileDialog.getExistingDirectory(self, "选择输出文件夹")
        if not folder:
            return

        try:
            summary, count = self.writeExports(Path(folder), formats, sizes)
        except Exception as error:
            QMessageBox.critical(
                self,
                "导出失败",
                f"导出过程中发生错误：\n\n{error}",
            )
            return

        QMessageBox.information(
            self,
            "导出完成",
            f"已生成 {count} 个文件。\n\n{summary}\n\n输出位置：\n{folder}",
        )
        self.status.setText(f"已导出：{summary}")

    def writeExports(self, root, formats, sizes):
        root.mkdir(parents=True, exist_ok=True)

        extensions = {
            "PNG": ".png",
            "WebP": ".webp",
            "AVIF": ".avif",
            "JPEG": ".jpg",
            "TIFF": ".tiff",
            "BMP": ".bmp",
        }

        messages = []
        count = 0

        if "SVG" in formats:
            folder = root / "SVG"
            folder.mkdir(exist_ok=True)
            (folder / "Revaea.svg").write_text(
                self.currentSvg(1024, master=True),
                encoding="utf-8",
            )
            messages.append("SVG × 1")
            count += 1

        if "ICO" in formats:
            folder = root / "ICO"
            folder.mkdir(exist_ok=True)
            self.saveIco(folder / "Revaea.ico", sizes)
            messages.append("ICO × 1（多尺寸）")
            count += 1

        for format_name in formats:
            if format_name in ("SVG", "ICO"):
                continue

            folder = root / format_name
            folder.mkdir(exist_ok=True)
            extension = extensions[format_name]

            for size in sizes:
                image = self.renderImage(size)
                path = folder / f"Revaea-{size}{extension}"
                self.saveRaster(image, path, format_name)
                count += 1

            messages.append(f"{format_name} × {len(sizes)}")

        return " · ".join(messages), count


def main():
    app = QApplication(sys.argv)
    app.setApplicationName(APP_NAME)

    window = StudioWindow()
    window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
