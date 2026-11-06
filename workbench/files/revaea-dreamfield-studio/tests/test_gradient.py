import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

import main
from core import BASE_ANCHOR_HUE, BASE_PALETTE, build_palette
from gradient import GRADIENT_PRESETS, validate_gradient
from PySide6.QtCore import Qt
from PySide6.QtGui import QColor
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication


class GradientTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = QApplication.instance() or QApplication([])

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        self.window = main.StudioWindow(
            main.TextureLibrary(root / "materials"), main.FontLibrary(root / "fonts")
        )

    def tearDown(self):
        self.window.close()
        self.window.deleteLater()
        self.app.processEvents()

    def test_editing_one_region_preserves_all_other_visible_colors_after_adjustments(self):
        self.window.hue_spin.setValue(56)
        self.window.saturation_slider.setValue(118)
        self.window.contrast_slider.setValue(124)
        before = self.window.currentPalette()
        self.window.applyGradientColor("c2", "#26ABCF")
        after = self.window.currentPalette()
        self.assertEqual(after["c2"], "#26ABCF")
        self.assertEqual(
            {k: v for k, v in after.items() if k != "c2"},
            {k: v for k, v in before.items() if k != "c2"},
        )
        self.assertEqual(self.window.saturation, 1)
        self.assertEqual(self.window.contrast, 1)

    def test_reference_presets_preserve_text_material_and_geometry(self):
        self.window.typography.text_edit.setText("Unchanged title")
        self.window.material_list.setCurrentItem(self.window.material_items["paper"])
        self.window.scale_slider.setValue(88)
        before = self.window.presetData()
        for name, palette in GRADIENT_PRESETS.items():
            self.window.presetChanged(name)
            self.assertEqual(self.window.currentPalette(), palette)
            after = self.window.presetData()
            for section in ("material", "lettering", "export", "small_icon"):
                self.assertEqual(after[section], before[section])
            self.assertEqual(after["visual"]["optical_scale"], 0.88)

    def test_hue_changes_custom_colors_and_legacy_palette_resets_the_source(self):
        self.window.presetChanged("Lab 珊瑚渐变")
        before = self.window.currentPalette()
        self.window.hue_spin.setValue(140)
        self.assertNotEqual(self.window.currentPalette(), before)
        self.window.presetChanged("天蓝")
        self.assertEqual(self.window.currentPalette(), build_palette(205, 1, 1))
        self.assertEqual(self.window.gradient_palette, BASE_PALETTE)

    def test_custom_gradient_preset_round_trip_reproduces_pixels(self):
        self.window.presetChanged("Grove 蓝紫渐变")
        self.window.applyGradientColor("c7", "#69CBE8")
        self.window.hue_spin.setValue(260)
        self.window.saturation_slider.setValue(106)
        saved = json.loads(json.dumps(self.window.presetData()))
        expected = self.window.renderImage(256).tobytes()
        self.window.reset()
        self.window.applyPresetData(saved)
        self.assertEqual(self.window.presetData(), saved)
        self.assertEqual(self.window.renderImage(256).tobytes(), expected)

    def test_old_preset_uses_the_original_color_source(self):
        self.window.presetChanged("Lab 珊瑚渐变")
        for version in (1, 2, 3, 4):
            self.window.applyPresetData({"version": version, "visual": {"hue": 205}})
            self.assertEqual(self.window.currentPalette(), build_palette(205, 1, 1))
            self.assertEqual(self.window.gradient_anchor, BASE_ANCHOR_HUE)

    def test_invalid_gradient_is_rejected_before_other_settings_change(self):
        before = self.window.presetData()
        for gradient in (
            {"palette": {"c0": "#000000"}},
            {"palette": BASE_PALETTE | {"c1": "url(file:///image)"}},
            {"anchor_hue": float("nan")},
            {"text_color": "url(file:///image)"},
        ):
            with self.subTest(gradient=gradient), self.assertRaises(ValueError):
                self.window.applyPresetData(before | {"gradient": gradient, "visual": {"hue": 123}})
            self.assertEqual(self.window.presetData(), before)

    def test_color_picker_cancel_and_keyboard_palette_shortcut(self):
        self.window.show()
        before = self.window.currentPalette()
        with patch.object(main.QColorDialog, "getColor", return_value=QColor()):
            self.window.gradient_buttons["c1"].click()
        self.assertEqual(self.window.currentPalette(), before)
        button = self.window.palette_strip.buttons["c1"]
        button.setFocus()
        with patch.object(main.QColorDialog, "getColor", return_value=QColor("#ABCDEF")):
            QTest.keyClick(button, Qt.Key_Space)
        self.assertEqual(self.window.currentPalette()["c1"], "#ABCDEF")
        self.assertIn("#ABCDEF", self.window.gradient_buttons["c1"].text())

    def test_color_controls_are_disabled_in_solid_modes(self):
        self.window.color_mode_combo.setCurrentIndex(self.window.color_mode_combo.findData("white"))
        self.window.refresh()
        self.assertFalse(self.window.palette_strip.isEnabled())
        self.assertTrue(
            all(not button.isEnabled() for button in self.window.gradient_buttons.values())
        )
        self.window.color_mode_combo.setCurrentIndex(0)
        self.window.refresh()
        self.assertTrue(self.window.palette_strip.isEnabled())

    def test_gradient_edits_change_svg_and_pixels_without_changing_alpha(self):
        before = self.window.renderImage(256)
        self.window.applyGradientColor("c6", "#22AABB")
        after = self.window.renderImage(256)
        self.assertNotEqual(before.tobytes(), after.tobytes())
        self.assertEqual(before.getchannel("A").tobytes(), after.getchannel("A").tobytes())
        self.assertIn('stop-color="#22AABB"', self.window.currentSvg())

    def test_gradient_validation_normalizes_hex_and_does_not_alias_input(self):
        source = BASE_PALETTE | {"c0": "#abcdef"}
        palette, _ = validate_gradient({"palette": source})
        self.assertEqual(palette["c0"], "#ABCDEF")
        palette["c0"] = "#000000"
        self.assertEqual(source["c0"], "#abcdef")


if __name__ == "__main__":
    unittest.main()
