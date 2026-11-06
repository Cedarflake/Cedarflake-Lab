import base64
import io
import json
import os
import tempfile
import time
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

import main
from PIL import Image, ImageChops
from PySide6.QtCore import QPoint, QPointF, Qt
from PySide6.QtGui import QWheelEvent
from PySide6.QtSvg import QSvgRenderer
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication, QScrollArea


class StudioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = QApplication.instance() or QApplication([])

    def setUp(self):
        self.texture_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.texture_directory.cleanup)
        self.window = main.StudioWindow(
            main.TextureLibrary(Path(self.texture_directory.name) / "materials"),
            main.FontLibrary(Path(self.texture_directory.name) / "fonts"),
        )
        for method in ("critical", "warning"):
            dialog = patch.object(
                main.QMessageBox,
                method,
                side_effect=lambda _, title, message: self.fail(f"{title}: {message}"),
            )
            dialog.start()
            self.addCleanup(dialog.stop)

    def tearDown(self):
        self.window.preview_timer.stop()
        self.window.close()
        self.window.deleteLater()
        self.app.processEvents()

    def selectMaterial(self, name):
        self.window.material_list.setCurrentItem(self.window.material_items[name])
        self.window.refresh()

    def waitUntil(self, predicate):
        deadline = time.monotonic() + 2
        while not predicate() and time.monotonic() < deadline:
            QTest.qWait(10)
        self.assertTrue(predicate())

    def texturePath(self):
        path = Path(self.texture_directory.name) / "import-source.png"
        image = Image.new("RGBA", (64, 64))
        image.putdata(
            [
                ((x * 71 + y * 13) % 256, (x * 29 + y * 37) % 256, 128, 255)
                for y in range(64)
                for x in range(64)
            ]
        )
        image.save(path)
        return path

    def test_imported_texture_is_managed_and_presets_only_store_its_id(self):
        source = self.texturePath()
        asset = self.window.importTexturePath(source)
        saved = self.window.presetData()
        self.assertEqual(saved["material"]["asset_id"], asset.id)
        self.assertEqual(saved["material"]["type"], "texture")
        self.assertNotIn(source.name, json.dumps(saved))
        self.assertNotIn("base64", json.dumps(saved))
        self.assertIsNotNone(self.window.preview.image)
        expected = self.window.renderImage(128).tobytes()
        source.unlink()
        self.window.reset()
        self.window.applyPresetData(saved)
        self.assertEqual(self.window.renderImage(128).tobytes(), expected)
        self.assertFalse(self.window.texture_error)

    def test_imported_texture_export_contains_only_finished_artwork(self):
        asset = self.window.importTexturePath(self.texturePath())
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            _, count = self.window.writeExports(root, ["PNG", "SVG"], [128])
            self.assertEqual(count, 2)
            self.assertEqual(
                sorted(path.relative_to(root).as_posix() for path in root.rglob("*.*")),
                ["PNG/Revaea-128.png", "SVG/Revaea.svg"],
            )
            svg = (root / "SVG/Revaea.svg").read_text(encoding="utf-8")
            self.assertNotIn(asset.id, svg)
            self.assertNotIn(str(self.window.texture_library.root), svg)
            self.assertNotIn("file:", svg)
            element = ET.fromstring(svg).find("{http://www.w3.org/2000/svg}image")
            url = element.attrib["{http://www.w3.org/1999/xlink}href"]
            content = base64.b64decode(url.split(",", 1)[1])
            self.assertNotEqual(content, asset.path.read_bytes())
            with Image.open(io.BytesIO(content)) as rendered:
                self.assertEqual(rendered.size, (1024, 1024))
                self.assertEqual(rendered.getpixel((512, 512))[3], 0)
            self.assertTrue(QSvgRenderer(svg.encode()).isValid())

    def test_missing_imported_texture_blocks_export_and_reimport_recovers(self):
        source = self.texturePath()
        asset = self.window.importTexturePath(source)
        saved = self.window.presetData()
        asset.path.unlink()
        self.window.applyPresetData(saved)
        self.assertTrue(self.window.texture_error)
        self.assertFalse(self.window.export_button.isEnabled())
        self.assertIn("当前显示纯渐变", self.window.material_description.text())
        repaired = self.window.importTexturePath(source)
        self.assertEqual(repaired.id, asset.id)
        self.assertFalse(self.window.texture_error)
        self.assertTrue(self.window.export_button.isEnabled())

    def test_invalid_import_keeps_current_material(self):
        self.selectMaterial("paper")
        before = self.window.presetData()
        source = self.texturePath()
        source.write_bytes(b"broken PNG")
        with self.assertRaises(ValueError):
            self.window.importTexturePath(source)
        self.assertEqual(before, self.window.presetData())

    def test_version_two_presets_keep_their_procedural_surface(self):
        self.window.applyPresetData(
            {
                "schema": "revaea-dream-field-preset",
                "version": 2,
                "material": {"type": "paper", "strength": 0.61, "scale": 1.2, "seed": 77},
            }
        )
        self.assertEqual(self.window.material, "paper")
        self.assertAlmostEqual(self.window.material_strength, 0.61)
        self.assertIn("material-surface", self.window.currentSvg())
        self.assertNotIn("data:image", self.window.currentSvg())

    def test_image_texture_selection_and_comparison_work_with_keyboard(self):
        self.window.show()
        self.window.tabs.setCurrentIndex(1)
        self.window.material_list.setFocus()
        QTest.keyClick(self.window.material_list, Qt.Key_End)
        self.window.refresh()
        self.assertEqual(self.window.material, "texture")
        self.assertEqual(self.window.texture_id, "builtin:watercolor")
        self.assertIsNotNone(self.window.preview.image)
        self.window.compare_button.click()
        self.assertIsNone(self.window.preview.image)
        self.assertEqual(self.window.material, "texture")
        self.window.compare_button.click()
        self.assertIsNotNone(self.window.preview.image)

    def test_material_switch_preserves_color(self):
        self.window.hue_spin.setValue(28)
        palette = self.window.currentPalette()
        for material in main.MATERIALS:
            self.selectMaterial(material)
            self.assertEqual(self.window.material, material)
            self.assertEqual(self.window.currentPalette(), palette)
            self.assertTrue(self.window.material_items[material].isSelected())

    def test_numeric_entry_updates_slider_and_preview(self):
        self.window.show()
        self.window.tabs.setCurrentIndex(1)
        self.selectMaterial("paper")
        number = self.window.material_strength_spin
        number.setFocus()
        number.selectAll()
        QTest.keyClicks(number, "73")
        QTest.keyClick(number, Qt.Key_Return)
        self.waitUntil(lambda: b'opacity="0.7300"' in self.window.preview.svg_bytes)
        self.assertEqual(self.window.material_strength_slider.value(), 73)
        self.assertAlmostEqual(self.window.material_strength, 0.73)

    def test_compare_changes_preview_only(self):
        self.selectMaterial("pearl")
        exported = self.window.currentSvg()
        self.window.compare_button.click()
        self.assertNotIn(b"material-surface", self.window.preview.svg_bytes)
        self.assertEqual(self.window.currentSvg(), exported)
        self.assertEqual(self.window.presetData()["material"]["type"], "pearl")
        self.window.compare_button.click()
        self.assertIn(b"material-surface", self.window.preview.svg_bytes)

    def test_material_preset_round_trip_and_legacy_default(self):
        self.selectMaterial("paper")
        self.window.material_seed_spin.setValue(1234)
        self.window.material_scale_spin.setValue(157)
        self.window.material_strength_spin.setValue(62)
        saved = json.loads(json.dumps(self.window.presetData()))
        self.window.reset()
        self.window.applyPresetData(saved)
        self.assertEqual(self.window.presetData(), saved)
        saved.pop("material")
        saved["version"] = 1
        self.window.applyPresetData(saved)
        self.assertEqual(self.window.material, "none")
        self.assertNotIn("material-surface", self.window.currentSvg())

    def test_invalid_material_does_not_partially_apply_preset(self):
        saved = self.window.presetData()
        invalid = json.loads(json.dumps(saved))
        invalid["visual"]["hue"] = 123
        invalid["material"]["type"] = "unavailable"
        with self.assertRaises(ValueError):
            self.window.applyPresetData(invalid)
        self.assertEqual(self.window.presetData(), saved)

    def test_rejects_invalid_preset_values_without_changing_current_settings(self):
        saved = self.window.presetData()
        for section, key, value in (
            ("visual", "hue", float("nan")),
            ("visual", "saturation", float("inf")),
            ("small_icon", "threshold", "invalid"),
            ("small_icon", "strength", float("nan")),
            ("preview", "pixel_size", "invalid"),
            ("export", "formats", None),
            ("export", "sizes", None),
            ("export", "quality", "invalid"),
        ):
            with self.subTest(section=section, key=key):
                invalid = json.loads(json.dumps(saved))
                invalid["visual"]["hue"] = 123
                invalid[section][key] = value
                with self.assertRaises((ValueError, TypeError)):
                    self.window.applyPresetData(invalid)
                self.assertEqual(self.window.presetData(), saved)
                self.assertFalse(self.window.hue_spin.signalsBlocked())

    def test_rejects_webp_rgb_changes_even_when_alpha_matches(self):
        source = Image.new("RGBA", (16, 16), (50, 90, 120, 255))
        changed = Image.new("RGBA", source.size, (80, 90, 120, 255))
        path = Path(self.texture_directory.name) / "changed.webp"
        changed.save(path, "WEBP", lossless=True, exact=True)
        with self.assertRaisesRegex(RuntimeError, "回读校验失败"):
            self.window.verifyWebp(source, path, lossless=True)

    def test_empty_export_selection_survives_preset_round_trip(self):
        for check in (*self.window.format_checks.values(), *self.window.size_checks.values()):
            check.setChecked(False)
        saved = self.window.presetData()
        self.window.reset()
        self.window.applyPresetData(saved)
        self.assertEqual(self.window.selectedFormats(), [])
        self.assertEqual(self.window.selectedSizes(), [])
        self.assertFalse(self.window.export_button.isEnabled())

    def test_reset_restores_original_material_and_named_palette(self):
        self.selectMaterial("paper")
        self.window.saturation_slider.setValue(120)
        self.window.reset()
        self.assertEqual(self.window.material, "none")
        self.assertEqual(self.window.preset_combo.currentText(), "原版粉紫")
        self.assertEqual(self.window.currentPalette(), main.BASE_PALETTE)

    def test_all_materials_render_differently_without_filling_hole(self):
        images = []
        for material in main.MATERIALS:
            self.selectMaterial(material)
            image = self.window.renderImage(256)
            self.assertEqual(image.getpixel((128, 128))[3], 0)
            self.assertEqual(image.getpixel((0, 0))[3], 0)
            self.assertEqual(image.getchannel("A").getbbox(), (4, 4, 252, 252))
            images.append(image.tobytes())
        self.assertEqual(len(set(images)), 4)

    def test_solid_mode_hides_and_restores_selected_material(self):
        self.selectMaterial("pearl")
        for mode in ("black", "white"):
            self.window.color_mode_combo.setCurrentIndex(
                self.window.color_mode_combo.findData(mode)
            )
            self.window.refresh()
            self.assertFalse(self.window.material_controls.isEnabled())
            self.assertFalse(self.window.compare_button.isEnabled())
            self.assertNotIn("material-surface", self.window.currentSvg())
        self.window.color_mode_combo.setCurrentIndex(0)
        self.window.refresh()
        self.assertTrue(self.window.material_controls.isEnabled())
        self.assertIn("material-surface", self.window.currentSvg())

    def test_export_keeps_texture_in_svg_png_and_webp(self):
        self.selectMaterial("paper")
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            formats = ["SVG", "PNG", "ICO"]
            if main.features.check("webp"):
                formats.append("WebP")
            _, count = self.window.writeExports(root, formats, [32, 256])
            self.assertEqual(count, len(list(root.rglob("*.*"))))
            svg = (root / "SVG/Revaea.svg").read_bytes()
            self.assertTrue(QSvgRenderer(svg).isValid())
            self.assertIn(b"material-surface", svg)
            expected = self.window.renderImage(256)
            with Image.open(root / "PNG/Revaea-256.png") as image:
                self.assertIsNone(ImageChops.difference(expected, image).getbbox(alpha_only=False))
            if "WebP" in formats:
                with Image.open(root / "WebP/Revaea-256.webp") as image:
                    actual = image.convert("RGBA")
                    clean = self.window.cleanTransparentPixels(expected)
                    self.assertIsNone(
                        ImageChops.difference(clean, actual).getbbox(alpha_only=False)
                    )

    def test_export_selection_feedback_and_svg_without_sizes(self):
        for check in self.window.format_checks.values():
            check.setChecked(False)
        self.assertFalse(self.window.export_button.isEnabled())
        for check in self.window.size_checks.values():
            check.setChecked(False)
        self.window.format_checks["SVG"].setChecked(True)
        self.assertTrue(self.window.export_button.isEnabled())
        self.assertIn("1 个文件", self.window.export_summary.text())
        self.window.format_checks["PNG"].setChecked(True)
        self.assertFalse(self.window.export_button.isEnabled())

    def test_tabs_support_keyboard_and_preserve_values(self):
        self.window.show()
        self.window.hue_spin.setValue(28)
        self.window.tabs.tabBar().setFocus()
        QTest.keyClick(self.window.tabs.tabBar(), Qt.Key_Right)
        self.assertEqual(self.window.tabs.currentIndex(), 1)
        QTest.keyClick(self.window.tabs.tabBar(), Qt.Key_Right)
        self.assertEqual(self.window.tabs.currentIndex(), 2)
        self.assertEqual(self.window.hue, 28)

    def test_unfocused_wheel_scrolls_panel_without_changing_value(self):
        self.window.resize(860, 620)
        self.window.show()
        self.window.showExportPanel()
        self.app.processEvents()
        scroll = self.window.export_page.findChild(QScrollArea)
        scroll.ensureWidgetVisible(self.window.small_icon_strength_slider)
        self.app.processEvents()
        slider = self.window.small_icon_strength_slider
        slider.clearFocus()
        before = slider.value()
        wheel = QWheelEvent(
            QPointF(slider.rect().center()),
            QPointF(slider.mapToGlobal(slider.rect().center())),
            QPoint(),
            QPoint(0, 120),
            Qt.NoButton,
            Qt.NoModifier,
            Qt.NoScrollPhase,
            False,
        )
        position = scroll.verticalScrollBar().value()
        self.app.sendEvent(slider, wheel)
        self.assertEqual(slider.value(), before)
        self.assertLess(scroll.verticalScrollBar().value(), position)

    def test_small_window_keeps_export_action_visible(self):
        self.window.resize(860, 620)
        self.window.show()
        self.window.showExportPanel()
        self.app.processEvents()
        button = self.window.export_button
        top_left = button.mapTo(self.window, button.rect().topLeft())
        bottom_right = button.mapTo(self.window, button.rect().bottomRight())
        self.assertTrue(self.window.rect().contains(top_left))
        self.assertTrue(self.window.rect().contains(bottom_right))
        self.assertTrue(button.isVisible())

    def test_export_cancellation_preserves_completed_file(self):
        with tempfile.TemporaryDirectory() as folder:
            with (
                patch.object(main.QFileDialog, "getExistingDirectory", return_value=folder),
                patch.object(main.QTimer, "singleShot"),
            ):
                self.window.exportSelected()
                self.window.writeNextExport()
                self.assertEqual(self.window.export_completed, 1)
                self.window.export_progress.cancel()
                self.window.writeNextExport()
            self.assertTrue((Path(folder) / "SVG/Revaea.svg").exists())
            self.assertEqual(len(list(Path(folder).rglob("*.*"))), 1)
            self.assertIn("导出已停止", self.window.statusBar().currentMessage())

    def test_export_progress_completes_through_event_loop(self):
        for name, check in self.window.format_checks.items():
            check.setChecked(name == "PNG")
        for size, check in self.window.size_checks.items():
            check.setChecked(size in (32, 256))
        self.selectMaterial("matte")
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(main.QFileDialog, "getExistingDirectory", return_value=folder):
                self.window.exportSelected()
                self.waitUntil(
                    lambda: "已导出 2 个文件" in self.window.statusBar().currentMessage()
                )
            self.assertEqual(len(list(Path(folder).rglob("*.png"))), 2)

    def test_export_error_reports_failed_file_and_stops_queue(self):
        for name, check in self.window.format_checks.items():
            check.setChecked(name == "PNG")
        with tempfile.TemporaryDirectory() as folder:
            with (
                patch.object(main.QFileDialog, "getExistingDirectory", return_value=folder),
                patch.object(self.window, "saveRaster", side_effect=OSError("disk unavailable")),
                patch.object(main.QMessageBox, "critical") as message,
            ):
                self.window.exportSelected()
                self.waitUntil(lambda: "导出中断" in self.window.statusBar().currentMessage())
                message.assert_called_once()
                self.assertIn("Revaea-16.png", message.call_args.args[2])
                self.assertEqual(self.window.export_completed, 0)
                self.assertEqual(list(self.window.export_tasks), [])


if __name__ == "__main__":
    unittest.main()
