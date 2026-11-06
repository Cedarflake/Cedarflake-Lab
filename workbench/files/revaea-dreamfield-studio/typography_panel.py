from __future__ import annotations

from dataclasses import replace

from lettering import LetteringSettings
from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QColor, QFont, QFontDatabase
from PySide6.QtWidgets import (
    QCheckBox,
    QColorDialog,
    QComboBox,
    QDoubleSpinBox,
    QFileDialog,
    QFormLayout,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QVBoxLayout,
    QWidget,
)


class TypographyPanel(QFrame):
    changed = Signal()

    def __init__(self, library, parent=None):
        super().__init__(parent)
        self.library = library
        self.updating = True
        self.color = "#FF7075"
        self.preview_color = self.color
        self.setObjectName("section")
        self.setFrameShape(QFrame.StyledPanel)
        self.setStyleSheet("QFrame#section{border:1px solid palette(mid);border-radius:10px;}")
        layout = QVBoxLayout(self)
        layout.setContentsMargins(14, 14, 14, 14)
        layout.setSpacing(12)
        self.enabled_check = QCheckBox("添加文字标识")
        self.enabled_check.setToolTip("将图标和文字横向组合；关闭后仍保留文字设置。")
        layout.addWidget(self.enabled_check)
        self.controls = QWidget()
        controls = QVBoxLayout(self.controls)
        controls.setContentsMargins(0, 0, 0, 0)
        controls.setSpacing(10)
        controls.addWidget(QLabel("文字内容"))
        self.text_edit = QLineEdit("Cedarflake - Lab")
        self.text_edit.setMaxLength(80)
        self.text_edit.setAccessibleName("标识文字")
        self.text_edit.setMinimumHeight(32)
        controls.addWidget(self.text_edit)

        source_header = QHBoxLayout()
        source_header.addWidget(QLabel("字体库"))
        source_header.addStretch()
        self.import_button = QPushButton("导入字体…")
        self.import_button.setToolTip("导入 TTF、OTF 或 TTC；由 Studio 保存，仅在 Studio 中加载。")
        self.import_button.clicked.connect(self.importFont)
        source_header.addWidget(self.import_button)
        controls.addLayout(source_header)
        self.source_combo = QComboBox()
        self.source_combo.setAccessibleName("字体来源")
        controls.addWidget(self.source_combo)

        self.family_combo = QComboBox()
        self.family_combo.setEditable(True)
        self.family_combo.setInsertPolicy(QComboBox.NoInsert)
        self.family_combo.setMaxVisibleItems(12)
        self.family_combo.setSizeAdjustPolicy(QComboBox.AdjustToMinimumContentsLengthWithIcon)
        self.family_combo.setMinimumContentsLength(16)
        self.family_combo.setAccessibleName("字体名称")
        self.family_combo.lineEdit().setPlaceholderText("输入字体名称搜索")
        self.family_combo.completer().setCaseSensitivity(Qt.CaseInsensitive)
        self.family_combo.completer().setFilterMode(Qt.MatchContains)
        controls.addWidget(self.family_combo)

        self.style_combo = QComboBox()
        self.style_combo.setAccessibleName("字形与字重")
        form = QFormLayout()
        form.setFieldGrowthPolicy(QFormLayout.AllNonFixedFieldsGrow)
        form.addRow("字形 / 字重", self.style_combo)
        self.size_spin = self.number(30, 150, 100, "文字大小")
        self.size_spin.setToolTip("字号相对于图标大小；100% 对应图标高度。")
        form.addRow("文字大小", self.size_spin)
        self.tracking_spin = self.number(-10, 40, 0, "字距")
        self.tracking_spin.setToolTip("相对于字号的附加间距；负数使字母靠近。")
        form.addRow("字距", self.tracking_spin)
        self.gap_spin = self.number(0, 100, 20, "图文间距")
        self.gap_spin.setToolTip("文字与图标之间的间距，相对于图标高度。")
        form.addRow("图文间距", self.gap_spin)
        self.follow_logo_check = QCheckBox("跟随 Logo 配色")
        self.follow_logo_check.setToolTip(
            "文字随 Logo 的主色、饱和度和明暗变化；取消后保留当前颜色。"
        )
        form.addRow("文字颜色", self.follow_logo_check)
        self.color_button = QPushButton()
        self.color_button.setAccessibleName("选择文字颜色")
        self.color_button.clicked.connect(self.chooseColor)
        form.addRow("", self.color_button)
        controls.addLayout(form)
        layout.addWidget(self.controls)

        self.message = QLabel()
        self.message.setWordWrap(True)
        self.message.setTextInteractionFlags(Qt.TextSelectableByMouse)
        layout.addWidget(self.message)
        note = QLabel("导出文字转为轮廓，成品无需安装字体；ICO 仍只导出图标。")
        note.setWordWrap(True)
        layout.addWidget(note)

        self.source_combo.currentIndexChanged.connect(self.sourceChanged)
        self.family_combo.currentTextChanged.connect(self.familyChanged)
        self.family_combo.lineEdit().editingFinished.connect(self.familyEditFinished)
        self.style_combo.currentIndexChanged.connect(self.notifyChange)
        self.enabled_check.toggled.connect(self.notifyChange)
        self.follow_logo_check.toggled.connect(self.followLogoChanged)
        self.text_edit.textChanged.connect(self.notifyChange)
        for number in (self.size_spin, self.tracking_spin, self.gap_spin):
            number.valueChanged.connect(self.notifyChange)
        self.updating = False
        self.applySettings(self.defaultSettings())

    def defaultSettings(self):
        family = self.library.default_family()
        styles = QFontDatabase.styles(family)
        style = "Regular" if "Regular" in styles else (styles[0] if styles else "Regular")
        return LetteringSettings(family=family, style=style)

    def number(self, low, high, value, name):
        number = QDoubleSpinBox()
        number.setRange(low, high)
        number.setDecimals(1)
        number.setValue(value)
        number.setSuffix("%")
        number.setAccessibleName(name)
        number.setKeyboardTracking(False)
        return number

    def reloadSources(self, asset_id=None):
        self.source_combo.clear()
        self.source_combo.addItem("本机字体", None)
        try:
            for asset in self.library.assets():
                self.source_combo.addItem(f"已导入 · {asset.name}", asset.id)
        except OSError:
            self.message.setText("无法读取字体库，请重新导入字体。")
        index = self.source_combo.findData(asset_id)
        if index < 0:
            self.source_combo.addItem("未找到的导入字体", asset_id)
            index = self.source_combo.count() - 1
        self.source_combo.setCurrentIndex(index)

    def loadFamilies(self, preferred=None):
        asset_id = self.source_combo.currentData()
        try:
            families = self.library.load(asset_id) if asset_id else self.library.system_families
        except (OSError, ValueError):
            families = []
        self.family_combo.clear()
        for family in families:
            self.family_combo.addItem(family)
            self.family_combo.setItemData(
                self.family_combo.count() - 1, QFont(family, 12), Qt.FontRole
            )
        if preferred and preferred not in families:
            self.family_combo.addItem(preferred)
        if preferred:
            self.family_combo.setCurrentText(preferred)
        self.loadStyles()

    def loadStyles(self, preferred=None):
        styles = QFontDatabase.styles(self.family_combo.currentText())
        self.style_combo.clear()
        self.style_combo.addItems(styles)
        if preferred and preferred not in styles:
            self.style_combo.addItem(preferred)
        if preferred:
            self.style_combo.setCurrentText(preferred)
        elif "Regular" in styles:
            self.style_combo.setCurrentText("Regular")

    def sourceChanged(self, *_args):
        if self.updating:
            return
        self.updating = True
        self.loadFamilies()
        self.updating = False
        self.notifyChange()

    def familyChanged(self, *_args):
        if self.updating or self.family_combo.findText(self.family_combo.currentText()) < 0:
            return
        self.updating = True
        self.loadStyles()
        self.updating = False
        self.notifyChange()

    def familyEditFinished(self):
        if self.family_combo.findText(self.family_combo.currentText()) < 0:
            self.notifyChange()

    def notifyChange(self, *_args):
        self.controls.setEnabled(self.enabled_check.isChecked())
        if not self.updating:
            self.changed.emit()

    def followLogoChanged(self, checked):
        if not self.updating and not checked:
            self.color = self.preview_color
        self.notifyChange()

    def settings(self):
        return LetteringSettings(
            enabled=self.enabled_check.isChecked(),
            text=self.text_edit.text(),
            family=self.family_combo.currentText(),
            style=self.style_combo.currentText(),
            asset_id=self.source_combo.currentData(),
            size=self.size_spin.value(),
            tracking=self.tracking_spin.value(),
            gap=self.gap_spin.value(),
            color=self.color,
            follow_logo=self.follow_logo_check.isChecked(),
        )

    def applySettings(self, settings):
        self.updating = True
        try:
            self.enabled_check.setChecked(settings.enabled)
            self.text_edit.setText(settings.text)
            self.reloadSources(settings.asset_id)
            self.loadFamilies(settings.family)
            self.loadStyles(settings.style)
            self.size_spin.setValue(settings.size)
            self.tracking_spin.setValue(settings.tracking)
            self.gap_spin.setValue(settings.gap)
            self.setColor(settings.color, custom=False)
            self.follow_logo_check.setChecked(settings.follow_logo)
        finally:
            self.updating = False
        self.notifyChange()

    def setColor(self, color, custom=True):
        self.color = color
        if custom:
            was_blocked = self.follow_logo_check.blockSignals(True)
            self.follow_logo_check.setChecked(False)
            self.follow_logo_check.blockSignals(was_blocked)
        self.setPreviewColor(color)

    def setPreviewColor(self, color, color_mode="color"):
        self.preview_color = color
        self.color_button.setText(color.upper())
        foreground = "#17171B" if QColor(color).lightnessF() > 0.6 else "#FFFFFF"
        self.color_button.setStyleSheet(f"background-color:{color};color:{foreground};padding:5px;")
        self.color_button.setEnabled(color_mode == "color")
        self.follow_logo_check.setEnabled(color_mode == "color")
        self.color_button.setToolTip(
            "当前为黑白模式，切回彩色后可调整。"
            if color_mode != "color"
            else (
                "已跟随 Logo 配色；点击选择颜色后将改为独立配色。"
                if self.follow_logo_check.isChecked()
                else "点击修改独立的文字颜色。"
            )
        )

    def chooseColor(self):
        color = QColorDialog.getColor(QColor(self.preview_color), self, "文字颜色")
        if color.isValid():
            self.setColor(color.name())
            self.notifyChange()

    def importFont(self):
        path, _ = QFileDialog.getOpenFileName(self, "导入字体", "", "字体文件 (*.ttf *.otf *.ttc)")
        if not path:
            return
        try:
            self.importFontPath(path)
        except (OSError, ValueError) as error:
            QMessageBox.warning(self, "无法导入字体", str(error))

    def importFontPath(self, path):
        asset = self.library.import_font(path)
        families = self.library.load(asset.id)
        family = families[0]
        styles = QFontDatabase.styles(family)
        style = "Regular" if "Regular" in styles else styles[0]
        self.applySettings(replace(self.settings(), asset_id=asset.id, family=family, style=style))
        return asset
