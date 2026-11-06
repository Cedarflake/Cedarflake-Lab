from __future__ import annotations

import json
import math
import sys
from pathlib import Path

from core import (
    BASE_ANCHOR_HUE,
    BASE_PALETTE,
    EXPORT_SIZES,
    MATERIALS,
    PRESETS,
    build_palette,
    build_svg,
    clamp,
    monochrome_palette,
)
from font_library import FontLibrary
from gradient import (
    GRADIENT_PRESETS,
    GRADIENT_REGIONS,
    default_text_color,
    palette_anchor,
    retint_text_color,
    validate_gradient,
    validate_text_color,
)
from lettering import LetteringSettings, compose_lettering, resolve_lettering_color, text_path
from PIL import Image, ImageChops, features
from PySide6.QtCore import QEvent, QRectF, QSize, Qt, QTimer, Signal
from PySide6.QtGui import (
    QBrush,
    QColor,
    QIcon,
    QImage,
    QKeySequence,
    QLinearGradient,
    QPainter,
    QPen,
    QPixmap,
)
from PySide6.QtSvg import QSvgRenderer
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QColorDialog,
    QComboBox,
    QDoubleSpinBox,
    QFileDialog,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMessageBox,
    QProgressDialog,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QSlider,
    QSpinBox,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)
from texture_library import TextureLibrary
from texture_renderer import apply_texture, image_to_qimage, render_svg, rendered_svg
from typography_panel import TypographyPanel

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
        self.setAccessibleName("主色相")
        self.setToolTip("拖动选择颜色，方向键微调，Shift + 方向键调整 10°")

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
    colorRequested = Signal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.palette = BASE_PALETTE.copy()
        self.setFixedHeight(48)
        self.setAccessibleName("点击色块编辑渐变颜色")
        layout = QHBoxLayout(self)
        layout.setContentsMargins(4, 8, 4, 8)
        layout.setSpacing(5)
        self.buttons = {}
        for key, name in GRADIENT_REGIONS.items():
            button = QPushButton()
            button.setMinimumWidth(0)
            button.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
            button.setAccessibleName(f"编辑{name}颜色")
            button.clicked.connect(lambda _checked=False, key=key: self.colorRequested.emit(key))
            layout.addWidget(button, 1)
            self.buttons[key] = button

    def setPalette(self, palette):
        self.palette = palette
        for key, button in self.buttons.items():
            button.setToolTip(f"{GRADIENT_REGIONS[key]} · {palette[key]} · 点击编辑")
            button.setStyleSheet(
                f"QPushButton{{background:{palette[key]};border:1px solid transparent;border-radius:6px;}}"
                "QPushButton:focus{border:2px solid palette(text);}"
            )


class IconPreview(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.svg_bytes = b""
        self.image = None
        self.renderer = QSvgRenderer(self)
        self.background = "light"
        self.pixel_size = None
        self.setMinimumSize(280, 260)
        self.setAccessibleName("图标实时预览")
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)

    def setSvg(self, svg_text):
        self.image = None
        self.svg_bytes = svg_text.encode("utf-8")
        self.renderer.load(self.svg_bytes)
        self.update()

    def setImage(self, image):
        self.image = image
        self.svg_bytes = b""
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

        if not self.svg_bytes and self.image is None:
            return

        renderer = self.renderer
        source_size = self.image.size() if self.image is not None else renderer.defaultSize()
        ratio = source_size.width() / max(1, source_size.height())
        width = min(area.width() - 48, (area.height() - 48) * ratio)
        height = width / ratio
        target = QRectF(
            area.center().x() - width / 2,
            area.center().y() - height / 2,
            width,
            height,
        )

        if self.image is not None:
            painter.setRenderHint(QPainter.SmoothPixmapTransform, self.pixel_size is None)
            painter.drawImage(target, self.image)
            return

        if self.pixel_size is None:
            renderer.render(painter, target)
            return

        size = int(self.pixel_size)
        image = QImage(size, max(1, round(size / ratio)), QImage.Format_ARGB32)
        image.fill(Qt.transparent)

        buffer_painter = QPainter(image)
        buffer_painter.setRenderHint(QPainter.Antialiasing)
        renderer.render(buffer_painter, QRectF(image.rect()))
        buffer_painter.end()

        painter.setRenderHint(QPainter.SmoothPixmapTransform, False)
        painter.drawImage(target, image)


class StudioWindow(QMainWindow):
    def __init__(self, texture_library=None, font_library=None):
        super().__init__()

        self.hue = BASE_ANCHOR_HUE
        self.gradient_palette = BASE_PALETTE.copy()
        self.gradient_anchor = BASE_ANCHOR_HUE
        self.gradient_text_color = default_text_color(BASE_PALETTE)
        self.saturation = 1.0
        self.contrast = 1.0
        self.optical_scale = 1.0
        self.color_mode = "color"
        self.opacity = 1.0
        self.material = "none"
        self.material_strength = 0.45
        self.material_scale = 1.0
        self.material_seed = 42
        self.texture_library = texture_library if texture_library is not None else TextureLibrary()
        self.texture_id = None
        self.texture_error = ""
        self.font_library = font_library if font_library is not None else FontLibrary()
        self.font_error = ""
        self.small_icon_enabled = True
        self.small_icon_threshold = 32
        self.small_icon_strength = 0.65
        self.preview_pixel_size = None
        self.applying_preset = False

        self.setWindowTitle(APP_NAME)
        self.resize(1180, 800)
        self.setMinimumSize(860, 620)

        self.preview_timer = QTimer(self)
        self.preview_timer.setSingleShot(True)
        self.preview_timer.setInterval(32)
        self.preview_timer.timeout.connect(self.refresh)

        self.buildUi()
        self.hue_strip.setValue(self.hue, emit=False)
        self.hue_spin.blockSignals(True)
        self.hue_spin.setValue(round(self.hue) % 360)
        self.hue_spin.blockSignals(False)
        self.refresh()
        self.updateExportSummary()

    def card(self):
        frame = QFrame()
        frame.setObjectName("section")
        frame.setFrameShape(QFrame.StyledPanel)
        frame.setStyleSheet("QFrame#section{border:1px solid palette(mid);border-radius:10px;}")
        return frame

    def buildUi(self):
        root = QWidget()
        self.setCentralWidget(root)

        layout = QVBoxLayout(root)
        layout.setContentsMargins(18, 18, 18, 18)
        layout.setSpacing(16)

        toolbar = QHBoxLayout()
        heading = QVBoxLayout()
        title = QLabel("Dream Field Studio")
        title.setStyleSheet("font-size:22px;font-weight:700;")
        heading.addWidget(title)
        heading.addWidget(QLabel("配色、材质与文字标识"))
        toolbar.addLayout(heading)
        toolbar.addStretch()
        for label, shortcut, callback in (
            ("打开方案…", "Ctrl+O", self.loadPreset),
            ("保存方案…", "Ctrl+S", self.savePreset),
            ("恢复原版", "", self.reset),
            ("导出…", "Ctrl+E", self.showExportPanel),
        ):
            button = QPushButton(label)
            button.setMinimumHeight(34)
            if shortcut:
                button.setShortcut(QKeySequence(shortcut))
                button.setToolTip(f"{label}（{shortcut}）")
            button.clicked.connect(callback)
            toolbar.addWidget(button)
        layout.addLayout(toolbar)

        workspace = QHBoxLayout()
        workspace.setSpacing(18)
        workspace.addLayout(self.buildPreviewPanel(), 1)
        workspace.addWidget(self.buildControlPanel())
        layout.addLayout(workspace, 1)
        self.statusBar().showMessage("调整即时预览；保存方案可继续编辑。")

        for widget in self.findChildren(QWidget):
            if isinstance(widget, (QComboBox, QSpinBox, QDoubleSpinBox)):
                widget.setMinimumHeight(28)
                widget.setFocusPolicy(Qt.StrongFocus)
            if isinstance(widget, (QSpinBox, QDoubleSpinBox)):
                widget.setKeyboardTracking(False)
            if isinstance(widget, (QComboBox, QSpinBox, QDoubleSpinBox, QSlider)):
                widget.installEventFilter(self)

    def eventFilter(self, watched, event):
        if event.type() == QEvent.Wheel and not watched.hasFocus():
            parent = watched.parentWidget()
            while parent is not None and not isinstance(parent, QScrollArea):
                parent = parent.parentWidget()
            if parent is not None:
                QApplication.sendEvent(parent.viewport(), event)
            else:
                event.ignore()
            return True
        return super().eventFilter(watched, event)

    def showExportPanel(self):
        self.tabs.setCurrentWidget(self.export_page)
        self.export_button.setFocus()

    def buildPreviewPanel(self):
        panel = QVBoxLayout()
        panel.setSpacing(10)

        header = QHBoxLayout()
        header.addWidget(QLabel("背景"))
        self.background_combo = QComboBox()
        self.background_combo.addItems(["深色背景", "浅色背景", "透明棋盘"])
        self.background_combo.setCurrentIndex(1)
        self.background_combo.setAccessibleName("预览背景")
        self.background_combo.setToolTip("仅改变预览画布，不会为透明格式添加背景。")
        self.background_combo.currentIndexChanged.connect(self.backgroundChanged)
        header.addWidget(self.background_combo)
        header.addStretch()
        header.addWidget(QLabel("查看"))
        self.preview_size_combo = QComboBox()
        self.preview_size_combo.addItems(
            [
                "完整预览",
                "16 px",
                "20 px",
                "24 px",
                "32 px",
                "48 px",
                "64 px",
                "128 px",
                "256 px",
                "512 px",
            ]
        )
        self.preview_size_combo.setAccessibleName("预览尺寸")
        self.preview_size_combo.setToolTip("选择像素尺寸可放大检查实际导出细节。")
        self.preview_size_combo.currentIndexChanged.connect(self.previewSizeChanged)
        header.addWidget(self.preview_size_combo)
        panel.addLayout(header)

        self.preview = IconPreview()
        panel.addWidget(self.preview, 1)

        self.palette_strip = PaletteStrip()
        self.palette_strip.colorRequested.connect(self.editGradientColor)
        panel.addWidget(self.palette_strip)

        footer = QHBoxLayout()
        self.compare_button = QPushButton("仅看渐变")
        self.compare_button.setCheckable(True)
        self.compare_button.setMinimumHeight(32)
        self.compare_button.setToolTip("暂时隐藏材质，便于检查渐变颜色；不改变方案或导出结果。")
        self.compare_button.toggled.connect(self.refresh)
        footer.addWidget(self.compare_button)
        self.status = QLabel()
        self.status.setWordWrap(True)
        footer.addWidget(self.status, 1)
        panel.addLayout(footer)

        return panel

    def buildControlPanel(self):
        self.tabs = QTabWidget()
        self.tabs.setAccessibleName("图标设置")
        self.tabs.setMinimumWidth(370)
        self.tabs.setMaximumWidth(430)
        self.tabs.tabBar().setExpanding(True)
        self.tabs.setStyleSheet("QTabBar::tab{padding:10px 18px;}")
        self.tabs.addTab(self.scrollPage(self.buildColorCard(), self.buildAdjustmentCard()), "外观")
        self.tabs.addTab(self.scrollPage(self.buildMaterialCard()), "材质")
        self.typography = TypographyPanel(self.font_library)
        self.typography.changed.connect(self.scheduleRefresh)
        self.tabs.addTab(self.scrollPage(self.typography), "文字")

        export_page = QWidget()
        self.export_page = export_page
        export_layout = QVBoxLayout(export_page)
        export_layout.setContentsMargins(0, 0, 0, 0)
        export_layout.addWidget(
            self.scrollPage(self.buildExportCard(), self.buildSmallIconCard()), 1
        )
        footer = QVBoxLayout()
        footer.setContentsMargins(12, 8, 12, 12)
        self.export_summary = QLabel()
        self.export_summary.setWordWrap(True)
        footer.addWidget(self.export_summary)
        self.export_button = QPushButton("导出到文件夹…")
        self.export_button.setMinimumHeight(40)
        self.export_button.clicked.connect(self.exportSelected)
        footer.addWidget(self.export_button)
        export_layout.addLayout(footer)
        self.tabs.addTab(export_page, "导出")
        for widget in (
            *self.format_checks.values(),
            *self.size_checks.values(),
            *self.banner_size_checks.values(),
        ):
            widget.toggled.connect(self.updateExportSummary)
        return self.tabs

    def scrollPage(self, *cards):
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        content = QWidget()
        scroll.setWidget(content)
        layout = QVBoxLayout(content)
        layout.setContentsMargins(10, 12, 10, 12)
        layout.setSpacing(12)
        for card in cards:
            layout.addWidget(card)
        layout.addStretch()
        return scroll

    def buildColorCard(self):
        frame = self.card()
        layout = QVBoxLayout(frame)
        layout.setContentsMargins(14, 14, 14, 14)
        layout.setSpacing(8)

        title = QLabel("Logo 渐变")
        title.setStyleSheet("font-size:16px;font-weight:650;")
        layout.addWidget(title)

        description = QLabel("先选参考配色，再点击区域色块修改；色带同步调整 Logo 和关联文字。")
        description.setWordWrap(True)
        layout.addWidget(description)
        reference_row = QGridLayout()
        for index, name in enumerate(GRADIENT_PRESETS):
            button = QPushButton(name)
            button.setMinimumHeight(32)
            icon = render_svg(build_svg(GRADIENT_PRESETS[name]), (32, 32))
            button.setIcon(QIcon(QPixmap.fromImage(image_to_qimage(icon))))
            button.setIconSize(QSize(24, 24))
            button.setToolTip("应用渐变及关联文字颜色；保留文字内容、字体和材质。")
            button.clicked.connect(lambda _checked=False, name=name: self.presetChanged(name))
            reference_row.addWidget(button, index // 2, index % 2)
        layout.addLayout(reference_row)

        self.hue_strip = HueStrip()
        self.hue_strip.valueChanged.connect(self.hueChanged)
        layout.addWidget(self.hue_strip)

        hue_row = QHBoxLayout()
        hue_row.addWidget(QLabel("整体色相"))

        self.hue_spin = QSpinBox()
        self.hue_spin.setRange(0, 359)
        self.hue_spin.setSuffix("°")
        self.hue_spin.setAccessibleName("整体色相角度")
        self.hue_spin.valueChanged.connect(self.hueSpinChanged)
        hue_row.addWidget(self.hue_spin)
        hue_row.addStretch()
        layout.addLayout(hue_row)

        preset_row = QHBoxLayout()

        self.preset_combo = QComboBox()
        self.preset_combo.addItems([*PRESETS.keys(), *GRADIENT_PRESETS.keys(), "自定义"])
        self.preset_combo.setAccessibleName("配色预设")
        self.preset_combo.currentTextChanged.connect(self.presetChanged)
        preset_row.addWidget(self.preset_combo, 1)

        layout.addLayout(preset_row)
        regions = QGridLayout()
        regions.setSpacing(6)
        self.gradient_buttons = {}
        for index, (key, name) in enumerate(GRADIENT_REGIONS.items()):
            button = QPushButton(name)
            button.setMinimumHeight(48)
            button.setAccessibleName(f"编辑{name}渐变颜色")
            button.clicked.connect(lambda _checked=False, key=key: self.editGradientColor(key))
            self.gradient_buttons[key] = button
            regions.addWidget(button, index // 3, index % 3)
        layout.addLayout(regions)
        note = QLabel("渐变颜色在花形内相互叠加；细纹和颗粒在“材质”中调整。")
        note.setWordWrap(True)
        layout.addWidget(note)
        return frame

    def editGradientColor(self, key):
        color = QColorDialog.getColor(
            QColor(self.currentPalette()[key]), self, f"{GRADIENT_REGIONS[key]} · 渐变颜色"
        )
        if color.isValid():
            self.applyGradientColor(key, color.name())

    def applyGradientColor(self, key, color):
        palette = self.currentPalette()
        palette[key] = color
        self.setGradientPalette(palette)

    def setGradientPalette(self, palette, name="自定义", text_color=None):
        palette, anchor = validate_gradient(
            {"palette": palette, "anchor_hue": palette_anchor(palette)}
        )
        if text_color is None:
            text_color = retint_text_color(
                self.linkedLetteringColor(), self.currentPalette()["c6"], palette["c6"]
            )
        # Fold current whole-palette adjustments into the editable colors, preserving other regions.
        self.applying_preset = True
        try:
            self.gradient_palette = palette
            self.gradient_anchor = anchor
            self.gradient_text_color = text_color
            self.hue = anchor
            self.hue_strip.setValue(anchor, emit=False)
            self.hue_spin.blockSignals(True)
            self.hue_spin.setValue(round(anchor) % 360)
            self.hue_spin.blockSignals(False)
            self.saturation_slider.setValue(100)
            self.contrast_slider.setValue(100)
            self.saturation = 1.0
            self.contrast = 1.0
            self.setPresetName(name)
        finally:
            self.applying_preset = False
        self.refresh()

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
        layout.addWidget(QLabel("颜色模式"), 4, 0)

        self.color_mode_combo = QComboBox()
        self.color_mode_combo.setAccessibleName("颜色模式")
        self.color_mode_combo.addItem("彩色", "color")
        self.color_mode_combo.addItem("灰度黑白", "grayscale")
        self.color_mode_combo.addItem("纯黑", "black")
        self.color_mode_combo.addItem("纯白", "white")
        self.color_mode_combo.currentIndexChanged.connect(self.adjustmentsChanged)
        layout.addWidget(self.color_mode_combo, 4, 1, 1, 2)

        self.opacity_slider, self.opacity_label = self.addSliderRow(
            layout,
            5,
            "透明度",
            0,
            100,
            100,
        )

        self.saturation_slider.valueChanged.connect(self.adjustmentsChanged)
        self.contrast_slider.valueChanged.connect(self.adjustmentsChanged)
        self.scale_slider.valueChanged.connect(self.adjustmentsChanged)
        self.opacity_slider.valueChanged.connect(self.adjustmentsChanged)

        return frame

    def addSliderRow(self, layout, row, title, low, high, value):
        label = QLabel(title)
        layout.addWidget(label, row, 0)

        slider = QSlider(Qt.Horizontal)
        slider.setRange(low, high)
        slider.setValue(value)
        slider.setAccessibleName(title)
        layout.addWidget(slider, row, 1)

        number = QSpinBox()
        number.setRange(low, high)
        number.setValue(value)
        number.setSuffix("%")
        number.setAccessibleName(f"{title}数值")
        number.setKeyboardTracking(False)
        label.setBuddy(number)
        slider.valueChanged.connect(number.setValue)
        number.valueChanged.connect(slider.setValue)
        layout.addWidget(number, row, 2)

        return slider, number

    def buildMaterialCard(self):
        frame = self.card()
        layout = QVBoxLayout(frame)
        layout.setContentsMargins(14, 14, 14, 14)
        layout.setSpacing(14)
        header = QHBoxLayout()
        title = QLabel("材质库")
        title.setStyleSheet("font-size:16px;font-weight:650;")
        header.addWidget(title)
        header.addStretch()
        self.import_texture_button = QPushButton("导入纹理…")
        self.import_texture_button.setToolTip("导入 PNG 或 WebP，素材由 Studio 保存和管理。")
        self.import_texture_button.clicked.connect(self.importTexture)
        header.addWidget(self.import_texture_button)
        layout.addLayout(header)
        self.material_list = QListWidget()
        self.material_list.setAccessibleName("材质库")
        self.material_list.setViewMode(QListWidget.IconMode)
        self.material_list.setResizeMode(QListWidget.Adjust)
        self.material_list.setMovement(QListWidget.Static)
        self.material_list.setIconSize(QSize(112, 72))
        self.material_list.setGridSize(QSize(148, 104))
        self.material_list.setSpacing(4)
        self.material_list.setWordWrap(False)
        self.material_list.setTextElideMode(Qt.ElideRight)
        self.material_list.setFixedHeight(240)
        layout.addWidget(self.material_list)
        self.material_description = QLabel()
        self.material_description.setWordWrap(True)
        self.material_description.setMinimumHeight(42)
        layout.addWidget(self.material_description)

        self.material_controls = QWidget()
        controls = QGridLayout(self.material_controls)
        controls.setContentsMargins(0, 0, 0, 0)
        controls.setVerticalSpacing(12)
        self.material_strength_slider, self.material_strength_spin = self.addSliderRow(
            controls, 0, "材质强度", 0, 100, 45
        )
        self.material_scale_slider, self.material_scale_spin = self.addSliderRow(
            controls, 1, "纹理大小", 50, 200, 100
        )
        self.material_strength_slider.valueChanged.connect(self.materialChanged)
        self.material_scale_slider.valueChanged.connect(self.materialChanged)
        controls.addWidget(QLabel("纹理编号"), 2, 0)
        self.material_seed_spin = QSpinBox()
        self.material_seed_spin.setRange(0, 999999)
        self.material_seed_spin.setValue(42)
        self.material_seed_spin.setAccessibleName("纹理编号")
        self.material_seed_spin.setToolTip("相同编号会生成相同纹理，保存方案时一并保留。")
        self.material_seed_spin.valueChanged.connect(self.materialChanged)
        controls.addWidget(self.material_seed_spin, 2, 1)
        shuffle = QPushButton("换一组")
        shuffle.clicked.connect(
            lambda: self.material_seed_spin.setValue((self.material_seed + 1) % 1000000)
        )
        controls.addWidget(shuffle, 2, 2)
        layout.addWidget(self.material_controls)
        note = QLabel("材质只作用于图标内部；小尺寸优化会减弱纹理。")
        note.setWordWrap(True)
        layout.addWidget(note)
        self.material_thumbnail_palette = None
        self.reloadMaterialList()
        self.material_list.currentItemChanged.connect(self.materialSelected)
        return frame

    def reloadMaterialList(self):
        self.material_list.blockSignals(True)
        self.material_list.clear()
        self.material_items = {}
        for key, (name, description) in MATERIALS.items():
            item = QListWidgetItem(name)
            item.setData(Qt.UserRole, key)
            item.setToolTip(description)
            self.material_list.addItem(item)
            self.material_items[key] = item
        try:
            assets = self.texture_library.assets()
        except OSError as error:
            assets = [self.texture_library.builtin]
            self.material_description.setText(f"无法读取已导入的材质：{error}")
        for asset in assets:
            item = QListWidgetItem(asset.name)
            item.setData(Qt.UserRole, asset.id)
            item.setToolTip(f"{asset.name} · {'内置图片纹理' if asset.builtin else '已导入纹理'}")
            try:
                thumbnail = self.texture_library.load(asset.id).copy()
                thumbnail.thumbnail((224, 144), Image.Resampling.LANCZOS)
                pixmap = QPixmap.fromImage(image_to_qimage(thumbnail))
                pixmap.setDevicePixelRatio(2)
                item.setIcon(QIcon(pixmap))
            except (OSError, ValueError):
                item.setToolTip(f"{asset.name} · 素材无法读取，请重新导入。")
            self.material_list.addItem(item)
            self.material_items[asset.id] = item
        self.material_thumbnail_palette = None
        self.syncMaterialSelection()
        self.material_list.blockSignals(False)

    def syncMaterialSelection(self):
        key = self.texture_id if self.material == "texture" else self.material
        was_blocked = self.material_list.blockSignals(True)
        if key not in self.material_items:
            item = QListWidgetItem("未找到的纹理")
            item.setData(Qt.UserRole, key)
            self.material_list.addItem(item)
            self.material_items[key] = item
        self.material_list.setCurrentItem(self.material_items[key])
        self.material_list.scrollToItem(self.material_items[key])
        self.material_list.blockSignals(was_blocked)

    def importTexture(self):
        path, _ = QFileDialog.getOpenFileName(self, "导入纹理", "", "纹理图片 (*.png *.webp)")
        if not path:
            return
        try:
            asset = self.importTexturePath(path)
        except (OSError, ValueError) as error:
            QMessageBox.critical(self, "无法导入纹理", str(error))
            return
        self.statusBar().showMessage(f"已加入 Studio 素材库：{asset.name}", 10000)

    def importTexturePath(self, path):
        asset = self.texture_library.import_texture(path)
        self.material = "texture"
        self.texture_id = asset.id
        self.compare_button.setChecked(False)
        self.reloadMaterialList()
        self.refresh()
        return asset

    def updateMaterialThumbnails(self):
        palette = self.currentPalette()
        if palette == self.material_thumbnail_palette:
            return
        self.material_thumbnail_palette = palette
        for material in MATERIALS:
            svg = build_svg(palette, material=material, material_strength=0.75)
            pixmap = QPixmap(200, 152)
            pixmap.fill(Qt.transparent)
            painter = QPainter(pixmap)
            QSvgRenderer(svg.encode("utf-8")).render(painter, QRectF(24, 0, 152, 152))
            painter.end()
            pixmap.setDevicePixelRatio(2)
            self.material_items[material].setIcon(QIcon(pixmap))

    def materialSelected(self, item, _previous=None):
        if item is None:
            return
        key = item.data(Qt.UserRole)
        self.material = key if key in MATERIALS else "texture"
        self.texture_id = key if self.material == "texture" else None
        self.compare_button.setChecked(False)
        self.materialChanged()

    def materialName(self):
        if self.material == "texture":
            return self.texture_library.asset(self.texture_id).name
        return MATERIALS[self.material][0]

    def materialChanged(self, *_args):
        self.material_strength = self.material_strength_slider.value() / 100
        self.material_scale = self.material_scale_slider.value() / 100
        self.material_seed = self.material_seed_spin.value()
        self.scheduleRefresh()

    def scheduleRefresh(self):
        if not self.applying_preset and not self.preview_timer.isActive():
            self.preview_timer.start()

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
        self.small_icon_threshold_combo.setAccessibleName("小尺寸优化阈值")
        self.small_icon_threshold_combo.addItems(["≤ 24 px", "≤ 32 px", "≤ 48 px"])
        self.small_icon_threshold_combo.setCurrentText("≤ 32 px")
        self.small_icon_threshold_combo.currentIndexChanged.connect(self.smallIconSettingsChanged)
        layout.addWidget(self.small_icon_threshold_combo, 2, 1, 1, 2)

        self.small_icon_strength_slider, self.small_icon_strength_label = self.addSliderRow(
            layout, 3, "优化强度", 0, 100, 65
        )
        self.small_icon_strength_slider.valueChanged.connect(self.smallIconSettingsChanged)
        description = QLabel("增强小图标的颜色层次。可在预览区选择像素尺寸，检查实际细节。")
        description.setWordWrap(True)
        layout.addWidget(description, 4, 0, 1, 3)

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
            "可一次导出 SVG、PNG、WebP、AVIF、JPEG、ICO、TIFF、BMP。JPEG 和 BMP 会使用指定背景色。"
        )
        description.setWordWrap(True)
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

        self.size_heading = QLabel("尺寸")
        layout.addWidget(self.size_heading)
        self.icon_sizes_widget = QWidget()
        self.icon_sizes_widget.setLayout(self.buildSizeGrid())
        layout.addWidget(self.icon_sizes_widget)
        self.banner_sizes_widget = QWidget()
        banner_sizes = QGridLayout(self.banner_sizes_widget)
        banner_sizes.setContentsMargins(0, 0, 0, 0)
        self.banner_size_checks = {}
        for index, size in enumerate((512, 1024, 2048, 3500, 3800, 4096)):
            check = QCheckBox(f"{size} px")
            check.setChecked(size in (1024, 3500))
            self.banner_size_checks[size] = check
            banner_sizes.addWidget(check, index // 3, index % 3)
        layout.addWidget(self.banner_sizes_widget)

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
        self.quality_spin.setAccessibleName("有损图片质量")
        options.addWidget(self.quality_spin, 0, 1)

        self.webp_lossless_check = QCheckBox("WebP 无损")
        self.webp_lossless_check.setChecked(True)
        self.webp_lossless_check.toggled.connect(self.updateExportSummary)
        options.addWidget(self.webp_lossless_check, 0, 2)

        self.webp_compat_check = QCheckBox("WebP 透明兼容")
        self.webp_compat_check.setChecked(True)
        options.addWidget(self.webp_compat_check, 1, 0, 1, 3)

        options.addWidget(QLabel("JPEG/BMP 背景"), 2, 0)

        self.opaque_background_combo = QComboBox()
        self.opaque_background_combo.setAccessibleName("JPEG 和 BMP 背景色")
        self.opaque_background_combo.addItems(["白色", "黑色", "跟随预览"])
        options.addWidget(self.opaque_background_combo, 2, 1, 1, 2)

        layout.addLayout(options)

        return frame

    def updateExportSummary(self):
        if not hasattr(self, "export_summary"):
            return
        formats = self.selectedFormats()
        sizes = self.selectedSizes()
        lettering = self.typography.settings().enabled
        self.size_heading.setText("标识宽度（高度按比例计算）" if lettering else "尺寸")
        self.icon_sizes_widget.setVisible(not lettering)
        self.banner_sizes_widget.setVisible(lettering)
        valid = (
            bool(formats)
            and (formats == ["SVG"] or bool(sizes))
            and not self.texture_error
            and not self.font_error
        )
        self.export_button.setEnabled(valid)
        if self.font_error:
            summary = "请在“文字”中修正字体或文字内容后再导出。"
        elif self.texture_error:
            summary = "重新导入纹理或选择其他材质后再导出。"
        elif not formats:
            summary = "选择至少一种导出格式。"
        elif not valid:
            summary = "选择至少一个图片尺寸。"
        else:
            count = sum(1 if name in ("SVG", "ICO") else len(sizes) for name in formats)
            summary = f"将生成 {count} 个文件 · 按格式存入子文件夹"
            if lettering:
                summary += "\n文字已转为轮廓；ICO 只导出图标。"
            if "ICO" in formats and not any(size <= 256 for size in sizes):
                summary += "\nICO 使用 16–256 px 常用尺寸。"
            if "SVG" in formats and self.usesImageTexture():
                summary += "\n图片纹理的 SVG 内含 1024 px 图标图像。"
        self.export_summary.setText(summary)
        self.webp_lossless_check.setEnabled("WebP" in formats)
        self.webp_compat_check.setEnabled("WebP" in formats)
        self.quality_spin.setEnabled(
            bool({"JPEG", "AVIF"}.intersection(formats))
            or ("WebP" in formats and not self.webp_lossless_check.isChecked())
        )
        self.opaque_background_combo.setEnabled(bool({"JPEG", "BMP"}.intersection(formats)))

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
        return build_palette(
            self.hue, self.saturation, self.contrast, self.gradient_palette, self.gradient_anchor
        )

    def useSmallIconMode(self, size, master=False):
        return not master and self.small_icon_enabled and int(size) <= self.small_icon_threshold

    def usesImageTexture(self):
        return (
            self.material == "texture"
            and self.material_strength > 0
            and self.color_mode not in ("black", "white")
        )

    def currentSvg(self, size=1024, master=False, compare=False):
        settings = self.typography.settings()
        if not settings.enabled:
            return self.iconSvg(size, master=master, compare=compare)
        font = self.font_library.resolve(
            settings.asset_id,
            settings.family,
            settings.style,
            settings.size * 10,
            settings.tracking,
        )
        path, canvas = text_path(settings, font)
        icon_size = 1024 if master else max(16, math.ceil(size * 1000 / canvas[0]))
        icon = self.iconSvg(icon_size, master=True, compare=compare)
        color = self.letteringColor()
        svg, _ = compose_lettering(icon, settings, path, canvas, size, color, self.opacity)
        return svg

    def letteringColor(self):
        return resolve_lettering_color(
            self.typography.settings(), self.linkedLetteringColor(), self.color_mode
        )

    def linkedLetteringColor(self):
        return build_palette(
            self.hue,
            self.saturation,
            self.contrast,
            {"text": self.gradient_text_color},
            self.gradient_anchor,
        )["text"]

    def iconSvg(self, size=1024, master=False, compare=False):
        if self.usesImageTexture() and not compare:
            return rendered_svg(self.renderIconImage(size, master=master))
        return self.vectorSvg(size, master=master, compare=compare)

    def vectorSvg(self, size=1024, master=False, compare=False, unmasked=False):
        return build_svg(
            self.currentPalette(),
            width=size,
            height=size,
            optical_scale=self.optical_scale,
            small_icon=self.useSmallIconMode(size, master),
            small_strength=self.small_icon_strength,
            color_mode=self.color_mode,
            opacity=self.opacity,
            material="none" if compare or self.material == "texture" else self.material,
            material_strength=self.material_strength,
            material_scale=self.material_scale,
            material_seed=self.material_seed,
            unmasked=unmasked,
        )

    def refresh(self):
        if self.applying_preset:
            return
        self.preview_timer.stop()
        palette = self.currentPalette()
        self.typography.setPreviewColor(self.letteringColor(), self.color_mode)
        if self.color_mode == "grayscale":
            palette = monochrome_palette(palette)
        elif self.color_mode == "black":
            palette = {name: "#000000" for name in palette}
        elif self.color_mode == "white":
            palette = {name: "#FFFFFF" for name in palette}
        self.palette_strip.setPalette(palette)
        self.palette_strip.setEnabled(self.color_mode == "color")
        for key, button in self.gradient_buttons.items():
            color = palette[key]
            foreground = "#17171B" if QColor(color).lightnessF() > 0.6 else "#FFFFFF"
            button.setText(f"{GRADIENT_REGIONS[key]}\n{color}")
            button.setToolTip(f"点击修改{GRADIENT_REGIONS[key]}颜色")
            button.setStyleSheet(
                f"QPushButton{{background:{color};color:{foreground};border:1px solid palette(mid);border-radius:6px;}}"
                "QPushButton:focus{border:2px solid palette(text);}"
            )
            button.setEnabled(self.color_mode == "color")

        master = self.preview_pixel_size is None
        size = self.preview_pixel_size or 1024
        preview_text = "完整预览" if master else f"{size}px"
        self.preview.setPixelSize(self.preview_pixel_size)
        self.texture_error = ""
        self.font_error = ""
        lettering_enabled = self.typography.settings().enabled
        if self.usesImageTexture():
            try:
                self.texture_library.load(self.texture_id)
                if not lettering_enabled:
                    if self.compare_button.isChecked():
                        self.preview.setSvg(self.vectorSvg(size, master=master, compare=True))
                    else:
                        self.preview.setImage(
                            image_to_qimage(self.renderIconImage(size, master=master))
                        )
            except (OSError, ValueError) as error:
                self.texture_error = str(error)
                self.preview.setSvg(self.vectorSvg(size, master=master, compare=True))
        elif not lettering_enabled:
            self.preview.setSvg(
                self.vectorSvg(size, master=master, compare=self.compare_button.isChecked())
            )

        if lettering_enabled:
            try:
                svg = self.currentSvg(
                    size, compare=self.compare_button.isChecked() or bool(self.texture_error)
                )
                self.preview.setSvg(svg)
            except (OSError, ValueError) as error:
                self.font_error = str(error)
                self.preview.setSvg(self.vectorSvg(size, master=master, compare=True))
        self.typography.message.setText(self.font_error)

        solid = self.color_mode in ("black", "white")
        has_material = self.material != "none" and not solid
        self.material_controls.setEnabled(has_material)
        self.compare_button.setEnabled(has_material and not self.texture_error)
        if not has_material and self.compare_button.isChecked():
            self.compare_button.blockSignals(True)
            self.compare_button.setChecked(False)
            self.compare_button.blockSignals(False)
        description = (
            "纹理驱动内部颜色变化；素材由 Studio 管理，不随成品导出。"
            if self.material == "texture"
            else MATERIALS[self.material][1]
        )
        if solid:
            description = "纯黑、纯白模式暂时隐藏材质；切回彩色后恢复。"
        if self.texture_error:
            description = f"{self.texture_error}\n当前显示纯渐变。"
        self.material_description.setText(description)
        self.status.setText(
            f"{preview_text} · "
            + ("仅预览渐变" if self.compare_button.isChecked() else self.materialName())
            + ("（纯色模式已隐藏）" if solid and self.material != "none" else "")
        )
        if self.typography.settings().enabled:
            if self.font_error:
                self.status.setText("文字标识暂不可用 · 请检查“文字”设置")
            else:
                dimensions = self.preview.renderer.defaultSize()
                self.status.setText(
                    f"文字标识 · {dimensions.width()} × {dimensions.height()} px"
                    + (" · 仅预览渐变" if self.compare_button.isChecked() else "")
                )
        self.hue_strip.setEnabled(self.color_mode == "color")
        self.hue_spin.setEnabled(self.color_mode == "color")
        self.preset_combo.setEnabled(self.color_mode == "color")
        self.saturation_slider.setEnabled(not solid)
        self.saturation_label.setEnabled(not solid)
        self.contrast_slider.setEnabled(not solid)
        self.contrast_label.setEnabled(not solid)
        self.small_icon_threshold_combo.setEnabled(self.small_icon_enabled)
        self.small_icon_strength_slider.setEnabled(self.small_icon_enabled)
        self.small_icon_strength_label.setEnabled(self.small_icon_enabled)
        self.updateMaterialThumbnails()
        self.updateExportSummary()

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

        self.scheduleRefresh()

    def hueSpinChanged(self, value):
        self.hue = float(value)
        self.hue_strip.setValue(value, emit=False)
        self.setPresetName("自定义")
        self.scheduleRefresh()

    def presetChanged(self, name):
        if name in GRADIENT_PRESETS:
            palette = GRADIENT_PRESETS[name]
            self.setGradientPalette(palette, name, default_text_color(palette))
            return
        if name not in PRESETS:
            return

        self.applying_preset = True

        try:
            self.gradient_palette = BASE_PALETTE.copy()
            self.gradient_anchor = BASE_ANCHOR_HUE
            self.gradient_text_color = default_text_color(BASE_PALETTE)
            self.hue = float(PRESETS[name])
            self.hue_strip.setValue(self.hue, emit=False)
            self.hue_spin.blockSignals(True)
            self.hue_spin.setValue(round(self.hue))
            self.hue_spin.blockSignals(False)
            self.saturation_slider.setValue(100)
            self.contrast_slider.setValue(100)
        finally:
            self.applying_preset = False
        self.saturation = 1.0
        self.contrast = 1.0
        self.scheduleRefresh()

    def setPresetName(self, name):
        self.preset_combo.blockSignals(True)
        self.preset_combo.setCurrentText(name)
        self.preset_combo.blockSignals(False)

    def adjustmentsChanged(self):
        self.saturation = self.saturation_slider.value() / 100.0
        self.contrast = self.contrast_slider.value() / 100.0
        self.optical_scale = self.scale_slider.value() / 100.0
        self.color_mode = self.color_mode_combo.currentData()
        self.opacity = self.opacity_slider.value() / 100.0

        if not self.applying_preset:
            self.setPresetName("自定义")

        self.scheduleRefresh()

    def smallIconSettingsChanged(self, *_args):
        self.small_icon_enabled = self.small_icon_check.isChecked()

        text = self.small_icon_threshold_combo.currentText()
        number = "".join(character for character in text if character.isdigit())
        self.small_icon_threshold = int(number) if number else 32

        self.small_icon_strength = self.small_icon_strength_slider.value() / 100.0
        self.scheduleRefresh()

    def previewSizeChanged(self, _index):
        text = self.preview_size_combo.currentText()

        if text == "完整预览":
            self.preview_pixel_size = None
        else:
            number = "".join(character for character in text if character.isdigit())
            self.preview_pixel_size = int(number) if number else None

        self.refresh()

    def reset(self):
        self.applying_preset = True

        try:
            self.gradient_palette = BASE_PALETTE.copy()
            self.gradient_anchor = BASE_ANCHOR_HUE
            self.gradient_text_color = default_text_color(BASE_PALETTE)
            self.hue = BASE_ANCHOR_HUE
            self.hue_strip.setValue(self.hue, emit=False)

            self.hue_spin.blockSignals(True)
            self.hue_spin.setValue(round(self.hue) % 360)
            self.hue_spin.blockSignals(False)

            self.saturation_slider.setValue(100)
            self.contrast_slider.setValue(100)
            self.scale_slider.setValue(100)
            self.color_mode_combo.setCurrentIndex(0)
            self.opacity_slider.setValue(100)
            self.material = "none"
            self.texture_id = None
            self.syncMaterialSelection()
            self.material_strength_slider.setValue(45)
            self.material_scale_slider.setValue(100)
            self.material_seed_spin.setValue(42)
            self.compare_button.setChecked(False)
            self.typography.applySettings(self.typography.defaultSettings())

            self.small_icon_check.setChecked(True)
            self.small_icon_threshold_combo.setCurrentText("≤ 32 px")
            self.small_icon_strength_slider.setValue(65)
            self.preview_size_combo.setCurrentText("完整预览")

            self.setPresetName("原版粉紫")
        finally:
            self.applying_preset = False

        self.adjustmentsChanged()
        self.smallIconSettingsChanged()
        self.materialChanged()
        self.setPresetName("原版粉紫")
        self.refresh()

    def presetData(self):
        return {
            "schema": "revaea-dream-field-preset",
            "version": 6,
            "visual": {
                "hue": float(self.hue),
                "saturation": float(self.saturation),
                "contrast": float(self.contrast),
                "optical_scale": float(self.optical_scale),
                "color_mode": self.color_mode,
                "opacity": float(self.opacity),
            },
            "material": {
                "type": self.material,
                "strength": float(self.material_strength),
                "scale": float(self.material_scale),
                "seed": int(self.material_seed),
                **({"asset_id": self.texture_id} if self.material == "texture" else {}),
            },
            "gradient": {
                "palette": self.gradient_palette.copy(),
                "anchor_hue": self.gradient_anchor,
                "text_color": self.gradient_text_color,
            },
            "small_icon": {
                "enabled": bool(self.small_icon_enabled),
                "threshold": int(self.small_icon_threshold),
                "strength": float(self.small_icon_strength),
            },
            "lettering": self.typography.settings().to_dict(),
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

        self.statusBar().showMessage(f"方案已保存：{path}", 10000)

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

        self.statusBar().showMessage(f"方案已载入：{path}", 10000)

    def applyPresetData(self, data):
        if not isinstance(data, dict):
            raise ValueError("预设文件不是有效的 JSON 对象。")

        schema = data.get("schema")
        if schema not in (None, "revaea-dream-field-preset"):
            raise ValueError("这不是 Revaea Dream Field 预设。")
        if data.get("version", 1) not in (1, 2, 3, 4, 5, 6):
            raise ValueError("这个方案使用了较新的格式，请使用支持该格式的 Studio 打开。")

        for section in (
            "visual",
            "gradient",
            "material",
            "lettering",
            "small_icon",
            "preview",
            "export",
        ):
            if not isinstance(data.get(section, {}), dict):
                raise ValueError(f"方案中的 {section} 设置格式无效。")

        visual = data.get("visual", {})
        gradient_palette, gradient_anchor = validate_gradient(data.get("gradient", {}))
        gradient_text_color = validate_text_color(data.get("gradient", {}), gradient_palette)
        small = data.get("small_icon", {})
        preview = data.get("preview", {})
        export = data.get("export", {})
        material = data.get("material", {})
        lettering = LetteringSettings.from_dict(
            data.get("lettering", self.typography.defaultSettings().to_dict())
        )
        material_type = material.get("type", "none")
        if material_type not in (*MATERIALS, "texture"):
            raise ValueError("这个方案使用了不支持的材质。")
        texture_id = material.get("asset_id") if material_type == "texture" else None
        if material_type == "texture":
            self.texture_library.asset(texture_id)
        material_strength = float(material.get("strength", 0.45))
        material_scale = float(material.get("scale", 1.0))
        if not all(math.isfinite(value) for value in (material_strength, material_scale)):
            raise ValueError("材质强度和纹理大小必须是有效数字。")
        material_seed = max(0, min(999999, int(material.get("seed", 42))))

        hue = float(visual.get("hue", BASE_ANCHOR_HUE))
        saturation = float(visual.get("saturation", 1.0))
        contrast = float(visual.get("contrast", 1.0))
        scale = float(visual.get("optical_scale", 1.0))
        opacity = float(visual.get("opacity", 1.0))
        strength = float(small.get("strength", 0.65))
        if not all(
            math.isfinite(value) for value in (hue, saturation, contrast, scale, opacity, strength)
        ):
            raise ValueError("方案包含无效数值，请检查后重新打开。")
        hue %= 360.0
        saturation = clamp(saturation, 0.4, 1.6)
        contrast = clamp(contrast, 0.6, 1.45)
        scale = clamp(scale, 0.82, 1.0)
        opacity = clamp(opacity)
        strength = clamp(strength)
        color_mode = visual.get("color_mode")
        if color_mode not in ("color", "grayscale", "black", "white"):
            color_mode = "grayscale" if visual.get("monochrome", False) else "color"

        enabled = bool(small.get("enabled", True))
        threshold = int(small.get("threshold", 32))
        if threshold not in (24, 32, 48):
            threshold = min((24, 32, 48), key=lambda value: abs(value - threshold))
        background = preview.get("background", "深色背景")
        pixel_size = preview.get("pixel_size")
        preview_name = "完整预览" if not pixel_size else f"{int(pixel_size)} px"
        formats = set(export.get("formats", []))
        sizes = {int(value) for value in export.get("sizes", []) if str(value).isdigit()}
        quality = max(50, min(100, int(export.get("quality", 95))))
        opaque_background = export.get("opaque_background", "白色")

        self.applying_preset = True

        try:
            self.gradient_palette = gradient_palette
            self.gradient_anchor = gradient_anchor
            self.gradient_text_color = gradient_text_color
            self.hue = hue
            self.hue_strip.setValue(hue, emit=False)

            self.hue_spin.blockSignals(True)
            self.hue_spin.setValue(round(hue) % 360)
            self.hue_spin.blockSignals(False)

            self.saturation_slider.setValue(round(saturation * 100))
            self.contrast_slider.setValue(round(contrast * 100))
            self.scale_slider.setValue(round(scale * 100))
            self.color_mode_combo.setCurrentIndex(self.color_mode_combo.findData(color_mode))
            self.opacity_slider.setValue(round(opacity * 100))
            self.material = material_type
            self.texture_id = texture_id
            self.syncMaterialSelection()
            self.material_strength_slider.setValue(round(clamp(material_strength) * 100))
            self.material_scale_slider.setValue(round(clamp(material_scale, 0.5, 2.0) * 100))
            self.material_seed_spin.setValue(material_seed)
            self.compare_button.setChecked(False)
            self.setPresetName("自定义")
            self.typography.applySettings(lettering)

            self.small_icon_check.setChecked(enabled)
            self.small_icon_threshold_combo.setCurrentText(f"≤ {threshold} px")
            self.small_icon_strength_slider.setValue(round(strength * 100))

            if background in ("深色背景", "浅色背景", "透明棋盘"):
                self.background_combo.setCurrentText(background)

            index = self.preview_size_combo.findText(preview_name)
            if index >= 0:
                self.preview_size_combo.setCurrentIndex(index)

            if "formats" in export:
                for name, checkbox in self.format_checks.items():
                    checkbox.setChecked(checkbox.isEnabled() and name in formats)

            if "sizes" in export:
                for size, checkbox in self.activeSizeChecks().items():
                    checkbox.setChecked(size in sizes)

            self.quality_spin.setValue(quality)
            self.webp_lossless_check.setChecked(bool(export.get("webp_lossless", True)))
            self.webp_compat_check.setChecked(bool(export.get("webp_compat", True)))

            if opaque_background in ("白色", "黑色", "跟随预览"):
                self.opaque_background_combo.setCurrentText(opaque_background)
        finally:
            self.applying_preset = False

        self.adjustmentsChanged()
        self.smallIconSettingsChanged()
        self.materialChanged()
        self.previewSizeChanged(self.preview_size_combo.currentIndex())
        self.updateExportSummary()

    def selectCommonSizes(self):
        common = {1024, 3500} if self.typography.settings().enabled else COMMON_SIZES
        for size, checkbox in self.activeSizeChecks().items():
            checkbox.setChecked(size in common)

    def selectAllSizes(self):
        for checkbox in self.activeSizeChecks().values():
            checkbox.setChecked(True)

    def selectedSizes(self):
        return [size for size, checkbox in self.activeSizeChecks().items() if checkbox.isChecked()]

    def activeSizeChecks(self):
        return self.banner_size_checks if self.typography.settings().enabled else self.size_checks

    def selectCommonFormats(self):
        for name, checkbox in self.format_checks.items():
            checkbox.setChecked(checkbox.isEnabled() and name in COMMON_FORMATS)

    def selectAllFormats(self):
        for checkbox in self.format_checks.values():
            if checkbox.isEnabled():
                checkbox.setChecked(True)

    def selectedFormats(self):
        return [name for name, checkbox in self.format_checks.items() if checkbox.isChecked()]

    def renderImage(self, size, master=False):
        if self.typography.settings().enabled:
            svg = self.currentSvg(size, master=master)
            dimensions = QSvgRenderer(svg.encode("utf-8")).defaultSize()
            return render_svg(svg, (dimensions.width(), dimensions.height()))
        return self.renderIconImage(size, master=master)

    def renderIconImage(self, size, master=False):
        rendered = render_svg(self.vectorSvg(size, master=master), size)

        if self.usesImageTexture():
            texture = self.texture_library.load(self.texture_id)
            field = render_svg(self.vectorSvg(size, master=master, unmasked=True), size)
            strength = self.material_strength
            optical_scale = self.optical_scale
            if self.useSmallIconMode(size, master):
                strength *= 0.18
                optical_scale *= 1.0 - 0.055 * self.small_icon_strength
            return apply_texture(
                rendered,
                field,
                texture,
                strength,
                self.material_scale,
                self.material_seed,
                optical_scale,
            )

        if self.color_mode in ("black", "white"):
            color = 0 if self.color_mode == "black" else 255
            solid = Image.new("RGBA", rendered.size, (color, color, color, 0))
            solid.putalpha(rendered.getchannel("A"))
            return solid

        return rendered

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
            raise RuntimeError(f"WebP 回读尺寸异常：写入 {source.size}，读回 {decoded.size}")

        if lossless and self.webp_compat_check.isChecked():
            difference = ImageChops.difference(source, decoded)
            if difference.getbbox(alpha_only=False) is not None:
                raise RuntimeError("WebP 无损回读校验失败：编码后像素与源 RGBA 不一致。")

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

        frames = [self.renderIconImage(size) for size in ico_sizes]
        frames[-1].save(
            path,
            "ICO",
            sizes=[(size, size) for size in ico_sizes],
            append_images=frames[:-1],
            bitmap_format="png",
        )

    def exportSelected(self):
        if self.typography.settings().enabled:
            self.refresh()
            if self.font_error:
                self.tabs.setCurrentIndex(2)
                return
        if self.usesImageTexture():
            try:
                self.texture_library.load(self.texture_id)
            except (OSError, ValueError) as error:
                self.refresh()
                QMessageBox.warning(self, "无法导出", str(error))
                return
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
            tasks, _ = self.exportTasks(Path(folder), formats, sizes)
        except Exception as error:
            QMessageBox.critical(self, "无法开始导出", f"无法写入所选文件夹：\n\n{error}")
            return

        self.export_folder = folder
        self.export_completed = 0
        self.export_tasks = iter(tasks)
        self.export_progress = QProgressDialog("正在准备导出…", "停止导出", 0, len(tasks), self)
        self.export_progress.setWindowTitle("导出图标")
        self.export_progress.setWindowModality(Qt.WindowModal)
        self.export_progress.setMinimumDuration(0)
        self.export_progress.setAutoClose(False)
        self.export_progress.setAutoReset(False)
        self.export_progress.setValue(0)
        self.export_progress.show()
        QTimer.singleShot(0, self.writeNextExport)

    def writeNextExport(self):
        if self.export_progress.wasCanceled():
            self.finishExport(
                f"导出已停止，已生成的 {self.export_completed} 个文件保留在输出文件夹。"
            )
            return
        task = next(self.export_tasks, None)
        if task is None:
            self.finishExport(f"已导出 {self.export_completed} 个文件：{self.export_folder}")
            return
        path, write = task
        self.export_progress.setLabelText(f"正在导出 {path.name}")
        try:
            write()
        except Exception as error:
            self.finishExport(f"导出中断，已生成 {self.export_completed} 个文件。")
            QMessageBox.critical(
                self,
                "导出失败",
                f"无法写入 {path.name}。\n已生成的文件保留在输出文件夹。\n\n{error}",
            )
            return
        self.export_completed += 1
        self.export_progress.setValue(self.export_completed)
        QTimer.singleShot(0, self.writeNextExport)

    def finishExport(self, message):
        self.export_progress.close()
        self.export_progress.deleteLater()
        self.export_tasks = iter(())
        self.statusBar().showMessage(message)

    def exportTasks(self, root, formats, sizes):
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
        tasks = []
        basename = "Cedarflake-wordmark" if self.typography.settings().enabled else "Revaea"

        if "SVG" in formats:
            folder = root / "SVG"
            folder.mkdir(exist_ok=True)
            path = folder / f"{basename}.svg"
            tasks.append(
                (
                    path,
                    lambda path=path: path.write_text(
                        self.currentSvg(1024, master=True), encoding="utf-8"
                    ),
                )
            )
            messages.append("SVG × 1")

        if "ICO" in formats:
            folder = root / "ICO"
            folder.mkdir(exist_ok=True)
            path = folder / "Revaea.ico"
            tasks.append((path, lambda path=path: self.saveIco(path, sizes)))
            messages.append("ICO × 1（多尺寸）")

        for format_name in formats:
            if format_name in ("SVG", "ICO"):
                continue

            folder = root / format_name
            folder.mkdir(exist_ok=True)
            extension = extensions[format_name]

            for size in sizes:
                path = folder / f"{basename}-{size}{extension}"
                tasks.append(
                    (
                        path,
                        lambda size=size, path=path, name=format_name: self.saveRaster(
                            self.renderImage(size), path, name
                        ),
                    )
                )

            messages.append(f"{format_name} × {len(sizes)}")

        return tasks, " · ".join(messages)

    def writeExports(self, root, formats, sizes):
        tasks, summary = self.exportTasks(root, formats, sizes)
        for _, write in tasks:
            write()
        return summary, len(tasks)

    def closeEvent(self, event):
        self.preview_timer.stop()
        self.font_library.close()
        super().closeEvent(event)


def main():
    app = QApplication(sys.argv)
    app.setApplicationName(APP_NAME)

    window = StudioWindow()
    window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
