import json
import os
import shutil
import tempfile
import unittest
import xml.etree.ElementTree as ET
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

import main
from font_library import FontLibrary
from lettering import SVG_NS, LetteringSettings, text_path
from PIL import Image, ImageChops
from PySide6.QtCore import Qt
from PySide6.QtGui import QColor, QFont, QFontDatabase, QRawFont
from PySide6.QtSvg import QSvgRenderer
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication
from texture_library import TextureLibrary
from texture_renderer import render_svg


def fixture_font():
    candidates = (
        Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts/BAUHS93.TTF",
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"),
        Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
    )
    return next((path for path in candidates if path.is_file()), None)


def fixture_collection():
    candidates = (
        Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts/msyh.ttc",
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
    )
    return next((path for path in candidates if path.is_file()), None)


class TypographyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = QApplication.instance() or QApplication([])
        cls.fixture = fixture_font()
        if cls.fixture is None:
            raise unittest.SkipTest("No local outline font is available for font-import tests.")
        cls.original_ui_font = cls.app.font()
        cls.ui_font_id = -1
        collection = fixture_collection()
        if collection:
            # Keep the offscreen UI on a permanent font, not a temporary imported asset.
            cls.ui_font_id = QFontDatabase.addApplicationFont(str(collection))
            families = QFontDatabase.applicationFontFamilies(cls.ui_font_id)
            if families:
                cls.app.setFont(QFont(families[0], 10))
        cls.application_font = QFontDatabase.addApplicationFont(str(cls.fixture))
        families = QFontDatabase.applicationFontFamilies(cls.application_font)
        if not families:
            raise RuntimeError("Could not load the local font fixture.")
        cls.family = families[0]

    @classmethod
    def tearDownClass(cls):
        QFontDatabase.removeApplicationFont(cls.application_font)
        cls.app.setFont(cls.original_ui_font)
        if cls.ui_font_id >= 0:
            QFontDatabase.removeApplicationFont(cls.ui_font_id)

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.library = FontLibrary(self.root / "fonts")
        self.window = main.StudioWindow(TextureLibrary(self.root / "materials"), self.library)
        self.panel = self.window.typography
        self.panel.applySettings(
            replace(
                self.panel.settings(),
                enabled=True,
                family=self.family,
                style=QFontDatabase.styles(self.family)[0],
            )
        )
        self.window.refresh()

    def tearDown(self):
        self.window.close()
        self.window.deleteLater()
        self.app.processEvents()

    def source(self):
        path = self.root / self.fixture.name
        shutil.copyfile(self.fixture, path)
        return path

    def wordmarkColor(self):
        root = ET.fromstring(self.window.currentSvg())
        return root.find(f"{{{SVG_NS}}}path[@id='wordmark']").attrib["fill"]

    def test_default_text_follows_reference_palettes_and_hue_changes(self):
        self.assertTrue(self.panel.follow_logo_check.isChecked())
        for preset, expected in (
            ("Lab 珊瑚渐变", "#FF7675"),
            ("Grove 蓝紫渐变", "#758FFF"),
            ("Ame 天蓝渐变", "#75CBFF"),
            ("Nami 紫罗兰渐变", "#9F75FF"),
        ):
            self.window.presetChanged(preset)
            self.assertEqual(self.wordmarkColor(), expected)
            self.assertEqual(self.panel.color_button.text(), self.wordmarkColor())
        before = self.wordmarkColor()
        self.window.hue_spin.setValue(130)
        self.window.refresh()
        color = QColor(self.wordmarkColor())
        self.assertNotEqual(before, self.wordmarkColor())
        self.assertGreater(color.green(), color.red())
        self.assertGreater(color.green(), color.blue())
        self.assertIn(self.wordmarkColor().encode(), self.window.preview.svg_bytes)

    def test_global_hue_moves_logo_and_text_together(self):
        self.window.presetChanged("Ame 天蓝渐变")
        logo_before = QColor(self.window.currentPalette()["c6"]).hslHueF()
        text_before = QColor(self.wordmarkColor()).hslHueF()
        self.window.hue_spin.setValue((round(self.window.hue) + 90) % 360)
        self.window.refresh()
        logo_shift = (QColor(self.window.currentPalette()["c6"]).hslHueF() - logo_before) % 1
        text_shift = (QColor(self.wordmarkColor()).hslHueF() - text_before) % 1
        self.assertLess(abs(logo_shift - text_shift) * 360, 1)
        self.assertAlmostEqual(text_shift * 360, 90, delta=1)

    def test_linked_text_uses_effective_palette_without_jump_when_other_region_is_edited(self):
        self.window.presetChanged("Grove 蓝紫渐变")
        self.window.saturation_slider.setValue(72)
        self.window.contrast_slider.setValue(86)
        self.window.refresh()
        before = self.wordmarkColor()
        self.window.applyGradientColor("c2", "#ABCDEF")
        self.assertEqual(self.wordmarkColor(), before)
        self.window.applyGradientColor("c6", "#459344")
        self.assertNotEqual(self.wordmarkColor(), before)
        self.assertGreater(
            QColor(self.wordmarkColor()).green(), QColor(self.wordmarkColor()).blue()
        )

    def test_unlink_freezes_current_color_and_relink_uses_current_logo(self):
        self.window.show()
        self.window.tabs.setCurrentIndex(2)
        self.window.presetChanged("Grove 蓝紫渐变")
        before = self.wordmarkColor()
        self.panel.follow_logo_check.setFocus()
        QTest.keyClick(self.panel.follow_logo_check, Qt.Key_Space)
        self.window.refresh()
        self.assertFalse(self.panel.settings().follow_logo)
        self.assertEqual(self.panel.settings().color, before)
        self.window.presetChanged("Lab 珊瑚渐变")
        self.assertEqual(self.wordmarkColor(), before)
        QTest.keyClick(self.panel.follow_logo_check, Qt.Key_Space)
        self.window.refresh()
        self.assertTrue(self.panel.settings().follow_logo)
        self.assertEqual(self.wordmarkColor(), "#FF7675")

    def test_color_picker_cancel_preserves_link_and_selection_becomes_independent(self):
        self.window.presetChanged("Grove 蓝紫渐变")
        before = self.wordmarkColor()
        with patch("typography_panel.QColorDialog.getColor", return_value=QColor()) as picker:
            self.panel.color_button.click()
            self.assertEqual(picker.call_args.args[0].name().upper(), before)
        self.assertTrue(self.panel.settings().follow_logo)
        self.assertEqual(self.wordmarkColor(), before)
        with patch("typography_panel.QColorDialog.getColor", return_value=QColor("#123456")):
            self.panel.color_button.click()
        self.window.refresh()
        self.assertFalse(self.panel.settings().follow_logo)
        self.assertEqual(self.wordmarkColor(), "#123456")
        self.window.presetChanged("Lab 珊瑚渐变")
        self.window.hue_spin.setValue(180)
        self.window.refresh()
        self.assertEqual(self.wordmarkColor(), "#123456")

    def test_link_and_custom_color_survive_preset_round_trip(self):
        for follows in (False, True):
            self.panel.applySettings(
                replace(self.panel.settings(), color="#123456", follow_logo=follows)
            )
            self.window.presetChanged("Grove 蓝紫渐变")
            saved = json.loads(json.dumps(self.window.presetData()))
            before = self.wordmarkColor()
            self.window.reset()
            self.window.applyPresetData(saved)
            self.assertEqual(self.wordmarkColor(), before)
            self.assertEqual(self.panel.settings().follow_logo, follows)
            self.assertEqual(self.panel.settings().color, "#123456")

    def test_old_default_color_gets_linked_and_old_custom_color_is_preserved(self):
        for legacy_color, follows in (("#ff7075", True), ("#123456", False)):
            saved = self.window.presetData()
            saved["version"] = 5
            saved["lettering"].pop("follow_logo")
            saved["gradient"].pop("text_color")
            saved["lettering"]["color"] = legacy_color
            self.window.applyPresetData(saved)
            self.assertEqual(self.panel.settings().follow_logo, follows)
            if not follows:
                self.assertEqual(self.wordmarkColor(), legacy_color.upper())
        with self.assertRaises(ValueError):
            LetteringSettings.from_dict({"follow_logo": "yes"})

    def test_linked_preview_svg_and_png_use_identical_text_color(self):
        self.window.presetChanged("Grove 蓝紫渐变")
        expected = self.wordmarkColor()
        root = self.root / "linked-output"
        self.window.writeExports(root, ["PNG", "SVG"], [1024])
        svg = ET.parse(root / "SVG/Cedarflake-wordmark.svg").getroot()
        self.assertEqual(svg.find(f"{{{SVG_NS}}}path[@id='wordmark']").attrib["fill"], expected)
        self.assertEqual(self.panel.color_button.text(), expected)
        with Image.open(root / "PNG/Cedarflake-wordmark-1024.png") as image:
            counts = {
                color: count
                for count, color in image.convert("RGBA").getcolors(image.width * image.height)
            }
            self.assertGreater(counts.get(QColor(expected).getRgb(), 0), 1000)

    def test_monochrome_color_swatch_matches_export_and_restores_link(self):
        self.window.presetChanged("Grove 蓝紫渐变")
        colored = self.wordmarkColor()
        for mode in ("black", "white", "grayscale"):
            self.window.color_mode_combo.setCurrentIndex(
                self.window.color_mode_combo.findData(mode)
            )
            self.window.refresh()
            color = QColor(self.wordmarkColor())
            self.assertEqual(color.red(), color.green())
            self.assertEqual(color.green(), color.blue())
            self.assertEqual(self.panel.color_button.text(), self.wordmarkColor())
            self.assertTrue(self.panel.settings().follow_logo)
            self.assertFalse(self.panel.follow_logo_check.isEnabled())
        self.window.color_mode_combo.setCurrentIndex(0)
        self.window.refresh()
        self.assertEqual(self.wordmarkColor(), colored)
        self.assertTrue(self.panel.follow_logo_check.isEnabled())

    def test_default_uses_bauhaus_when_available_and_import_is_lazy(self):
        if "Bauhaus 93" in self.library.system_families:
            self.assertEqual(self.library.default_family(), "Bauhaus 93")
            self.assertEqual(self.panel.defaultSettings().style, "Regular")
        self.assertFalse(self.library.root.exists())

    def test_import_is_managed_deduplicated_and_survives_original_removal(self):
        source = self.source()
        before = source.read_bytes()
        asset = self.panel.importFontPath(source)
        self.assertEqual(source.read_bytes(), before)
        self.assertEqual(asset.path.read_bytes(), before)
        duplicate = self.library.import_font(source)
        self.assertEqual(duplicate.id, asset.id)
        self.assertEqual(len(self.library.assets()), 1)
        font = self.library.resolve(asset.id, self.family, self.panel.settings().style, 1000, 0)
        self.assertEqual(
            QRawFont.fromFont(font).fontTable("head"),
            QRawFont(str(self.fixture), 1000).fontTable("head"),
        )
        source.unlink()
        reopened = FontLibrary(self.library.root)
        self.addCleanup(reopened.close)
        self.assertIn(self.family, reopened.load(asset.id))
        self.assertEqual(set(json.loads(asset.path.with_suffix(".json").read_text())), {"name"})

    def test_invalid_import_preserves_selection_and_creates_no_asset(self):
        before = self.panel.settings()
        source = self.root / "broken.ttf"
        source.write_bytes(b"invalid font")
        with self.assertRaises(ValueError):
            self.panel.importFontPath(source)
        self.assertEqual(before, self.panel.settings())
        self.assertFalse(self.library.root.exists())

    def test_library_rejects_arbitrary_paths_and_oversized_files(self):
        for value in ("../font.ttf", str(self.fixture), None, "font-sha256:../file"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.library.asset(value)
        with patch("font_library.MAX_FONT_BYTES", 1), self.assertRaisesRegex(ValueError, "64 MB"):
            self.library.import_font(self.fixture)
        self.assertFalse(self.library.root.exists())

    def test_imported_font_preset_is_reference_only_and_reopens(self):
        source = self.source()
        asset = self.panel.importFontPath(source)
        self.panel.text_edit.setText("Cedarflake - Grove")
        self.panel.tracking_spin.setValue(2.5)
        self.panel.size_spin.setValue(92)
        preset = self.window.presetData()
        content = json.dumps(preset)
        self.assertNotIn(str(source), content)
        self.assertNotIn("base64", content)
        self.assertEqual(preset["lettering"]["asset_id"], asset.id)
        self.assertEqual(preset["version"], 6)
        expected = self.window.currentSvg()
        source.unlink()
        self.window.reset()
        self.assertFalse(self.panel.settings().enabled)
        self.window.applyPresetData(preset)
        self.assertEqual(self.window.currentSvg(), expected)
        self.assertEqual(self.window.presetData(), preset)
        other = main.StudioWindow(
            TextureLibrary(self.root / "materials"), FontLibrary(self.library.root)
        )
        try:
            other.applyPresetData(preset)
            self.assertFalse(other.font_error)
            self.assertEqual(other.currentSvg(), expected)
        finally:
            other.close()
            other.deleteLater()

    def test_missing_and_changed_import_blocks_export_and_reimport_recovers(self):
        source = self.source()
        asset = self.panel.importFontPath(source)
        asset.path.unlink()
        self.window.refresh()
        self.assertIn("找不到", self.window.font_error)
        self.assertFalse(self.window.export_button.isEnabled())
        self.panel.importFontPath(source)
        self.window.refresh()
        self.assertFalse(self.window.font_error)
        self.assertTrue(self.window.export_button.isEnabled())
        asset.path.write_bytes(b"OTTOchanged")
        self.window.refresh()
        self.assertIn("已改变", self.window.font_error)
        self.assertFalse(self.window.export_button.isEnabled())
        self.panel.importFontPath(source)
        self.window.refresh()
        self.assertFalse(self.window.font_error)

    def test_missing_system_family_and_empty_text_have_actionable_recovery(self):
        original = self.panel.settings()
        self.panel.applySettings(replace(original, family="Missing Font 123456"))
        self.window.refresh()
        self.assertIn("未找到字体", self.window.font_error)
        self.assertFalse(self.window.export_button.isEnabled())
        self.panel.applySettings(replace(original, text="   "))
        self.window.refresh()
        self.assertIn("输入文字", self.window.font_error)
        self.panel.applySettings(original)
        self.window.refresh()
        self.assertFalse(self.window.font_error)

    def test_font_and_spacing_controls_change_the_actual_outline(self):
        initial = self.window.currentSvg()
        self.panel.tracking_spin.setValue(8)
        wider = self.window.currentSvg()
        self.assertNotEqual(initial, wider)
        self.assertGreater(
            float(ET.fromstring(wider).attrib["viewBox"].split()[2]),
            float(ET.fromstring(initial).attrib["viewBox"].split()[2]),
        )
        self.panel.gap_spin.setValue(45)
        spaced = self.window.currentSvg()
        self.assertNotEqual(wider, spaced)
        self.panel.size_spin.setValue(70)
        self.assertNotEqual(spaced, self.window.currentSvg())

    def test_svg_and_png_contain_both_logo_and_outlined_text(self):
        svg = self.window.currentSvg(1024)
        root = ET.fromstring(svg)
        path = root.find(f"{{{SVG_NS}}}path[@id='wordmark']")
        self.assertIsNotNone(path)
        self.assertIn("C", path.attrib["d"])
        self.assertNotIn("font-family", svg)
        self.assertIsNone(root.find(f".//{{{SVG_NS}}}text"))
        self.assertIsNone(root.find(f"{{{SVG_NS}}}svg"))
        image = self.window.renderImage(1024)
        design_width, design_height = map(float, root.attrib["viewBox"].split()[2:])

        def x(design_x):
            return round(design_x / design_width * image.width)

        def y(design_y):
            return round(design_y / design_height * image.height)

        self.assertGreater(image.getpixel((x(450), y(design_height / 2)))[3], 200)
        self.assertEqual(image.getpixel((x(700), y(design_height / 2)))[3], 0)
        text = image.crop((x(1400), 0, image.width, image.height))
        self.assertIsNotNone(text.getchannel("A").getbbox())
        self.assertGreater(image.width, image.height * 3)
        direct = render_svg(svg, image.size)
        self.assertIsNone(ImageChops.difference(direct, image).getbbox(alpha_only=False))

    def test_exported_svg_stays_renderable_after_font_is_unloaded(self):
        source = self.source()
        asset = self.panel.importFontPath(source)
        svg = self.window.currentSvg()
        self.library.close()
        asset.path.unlink()
        source.unlink()
        self.assertTrue(QSvgRenderer(svg.encode()).isValid())
        image = render_svg(svg, (1024, 200))
        self.assertIsNotNone(image.getchannel("A").getbbox())
        self.assertNotIn(asset.id, svg)

    def test_export_writes_wide_artwork_and_square_ico_without_font_sidecars(self):
        self.panel.importFontPath(self.source())
        output = self.root / "output"
        self.window.writeExports(output, ["SVG", "PNG", "ICO"], [1024])
        self.assertEqual(
            sorted(path.relative_to(output).as_posix() for path in output.rglob("*.*")),
            ["ICO/Revaea.ico", "PNG/Cedarflake-wordmark-1024.png", "SVG/Cedarflake-wordmark.svg"],
        )
        with Image.open(output / "PNG/Cedarflake-wordmark-1024.png") as image:
            self.assertEqual(image.width, 1024)
            self.assertLess(image.height, 400)
        with Image.open(output / "ICO/Revaea.ico") as image:
            self.assertEqual(image.size, (256, 256))

    def test_image_material_and_outlined_type_coexist_in_self_contained_svg(self):
        self.window.material_list.setCurrentItem(self.window.material_items["builtin:watercolor"])
        self.window.refresh()
        root = ET.fromstring(self.window.currentSvg(master=True))
        self.assertIsNotNone(root.find(f".//{{{SVG_NS}}}image"))
        self.assertIsNotNone(root.find(f"{{{SVG_NS}}}path[@id='wordmark']"))
        self.assertFalse(self.window.font_error)
        self.assertFalse(self.window.texture_error)
        self.window.compare_button.click()
        self.assertNotIn(b"data:image", self.window.preview.svg_bytes)
        self.assertIn("data:image", self.window.currentSvg())

    def test_missing_font_does_not_report_a_texture_error(self):
        self.window.material_list.setCurrentItem(self.window.material_items["builtin:watercolor"])
        self.panel.applySettings(replace(self.panel.settings(), family="Missing Font 123456"))
        self.window.refresh()
        self.assertIn("未找到字体", self.window.font_error)
        self.assertFalse(self.window.texture_error)

    def test_importing_another_family_changes_the_preview(self):
        candidates = (
            Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts/arial.ttf",
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"),
            Path("/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf"),
        )
        source = next((path for path in candidates if path.is_file()), None)
        if source is None:
            self.skipTest("No second local font fixture is available.")
        before = self.window.currentSvg()
        self.panel.importFontPath(source)
        self.window.refresh()
        self.assertNotEqual(self.panel.settings().family, self.family)
        self.assertNotEqual(self.window.currentSvg(), before)
        self.assertEqual(self.window.preview.svg_bytes, self.window.currentSvg().encode())

    def test_collection_import_offers_families_and_renders_chinese(self):
        source = fixture_collection()
        if source is None:
            self.skipTest("No local Chinese font collection fixture is available.")
        asset = self.panel.importFontPath(source)
        self.assertEqual(self.panel.family_combo.count(), len(self.library.load(asset.id)))
        self.panel.text_edit.setText("Cedarflake 实验室")
        self.window.refresh()
        self.assertFalse(self.window.font_error)
        self.assertIn('id="wordmark"', self.window.currentSvg())

    def test_small_window_can_reach_typography_and_export(self):
        self.window.resize(860, 620)
        self.window.show()
        self.window.tabs.setCurrentIndex(2)
        self.app.processEvents()
        self.assertTrue(self.panel.import_button.isVisible())
        self.assertTrue(
            self.window.rect().contains(
                self.panel.import_button.mapTo(
                    self.window, self.panel.import_button.rect().bottomRight()
                )
            )
        )
        self.window.showExportPanel()
        self.app.processEvents()
        self.assertTrue(self.window.export_button.isVisible())
        self.assertIn("宽度", self.window.size_heading.text())

    def test_solid_modes_apply_to_text_and_opacity(self):
        self.window.color_mode_combo.setCurrentIndex(self.window.color_mode_combo.findData("black"))
        self.window.opacity_slider.setValue(40)
        self.window.refresh()
        root = ET.fromstring(self.window.currentSvg())
        path = root.find(f"{{{SVG_NS}}}path[@id='wordmark']")
        self.assertEqual(path.attrib["fill"], "#000000")
        self.assertEqual(path.attrib["opacity"], "0.4000")

    def test_invalid_lettering_preset_does_not_change_existing_settings(self):
        saved = self.window.presetData()
        for changes in (
            {"size": float("nan")},
            {"text": "x\ny"},
            {"asset_id": "../font.ttf"},
            {"color": "url(file:///font)"},
            {"enabled": "yes"},
        ):
            with self.subTest(changes=changes):
                bad = saved | {"lettering": saved["lettering"] | changes}
                with self.assertRaises(ValueError):
                    self.window.applyPresetData(bad)
                self.assertEqual(saved, self.window.presetData())

    def test_old_presets_stay_icon_only(self):
        for version in (1, 2, 3):
            self.window.applyPresetData({"version": version})
            self.assertFalse(self.panel.settings().enabled)
            self.assertNotIn('id="wordmark"', self.window.currentSvg())

    def test_keyboard_edits_text_and_disabling_preserves_it(self):
        self.window.show()
        self.window.tabs.setCurrentIndex(2)
        self.panel.text_edit.setFocus()
        self.panel.text_edit.selectAll()
        QTest.keyClicks(self.panel.text_edit, "Cedarflake - Grove")
        self.window.refresh()
        self.assertIn("Cedarflake - Grove", self.window.currentSvg())
        self.panel.enabled_check.click()
        self.window.refresh()
        self.assertEqual(self.window.renderImage(256).size, (256, 256))
        self.assertEqual(self.panel.text_edit.text(), "Cedarflake - Grove")
        self.panel.enabled_check.click()
        self.window.refresh()
        self.assertLess(self.window.renderImage(1024).height, 400)

    def test_xml_special_characters_do_not_break_export(self):
        self.panel.text_edit.setText("Cedarflake <Lab> & Grove")
        svg = self.window.currentSvg()
        root = ET.fromstring(svg)
        self.assertEqual(root.find(f"{{{SVG_NS}}}title").text, "Cedarflake <Lab> & Grove")
        self.assertTrue(QSvgRenderer(svg.encode()).isValid())

    def test_missing_glyphs_are_reported_before_export(self):
        settings = replace(self.panel.settings(), text="Cedarflake \U0010ffff")
        font = self.library.resolve(None, settings.family, settings.style, 1000, 0)
        with self.assertRaisesRegex(ValueError, "缺少字形"):
            text_path(settings, font)


if __name__ == "__main__":
    unittest.main()
