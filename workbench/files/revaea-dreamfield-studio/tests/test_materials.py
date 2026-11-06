import unittest
import xml.etree.ElementTree as ET

import core


class MaterialTests(unittest.TestCase):
    def svg(self, **options):
        return core.build_svg(core.BASE_PALETTE, **options)

    def test_materials_remain_self_contained_vectors_with_original_shape(self):
        for material in core.MATERIALS:
            with self.subTest(material=material):
                svg = self.svg(material=material)
                ET.fromstring(svg)
                self.assertIn(core.SHAPE_PATH, svg)
                for forbidden in ("<image", "base64", "feTurbulence", "feDisplacementMap"):
                    self.assertNotIn(forbidden, svg)

    def test_seed_reproduces_texture_and_can_be_changed(self):
        for material in ("matte", "paper", "pearl"):
            with self.subTest(material=material):
                first = self.svg(material=material, material_seed=71)
                self.assertEqual(first, self.svg(material=material, material_seed=71))
                self.assertNotEqual(first, self.svg(material=material, material_seed=72))

    def test_zero_strength_matches_original(self):
        self.assertEqual(self.svg(), self.svg(material="paper", material_strength=0))

    def test_solid_modes_keep_material_hidden(self):
        for mode in ("black", "white"):
            for material in core.MATERIALS:
                self.assertEqual(
                    self.svg(color_mode=mode), self.svg(color_mode=mode, material=material)
                )

    def test_small_icon_optimization_reduces_material(self):
        namespace = "{http://www.w3.org/2000/svg}"
        strengths = []
        for small in (False, True):
            root = ET.fromstring(self.svg(material="matte", small_icon=small))
            layer = root.find(f".//{namespace}g[@id='material-surface']")
            strengths.append(float(layer.attrib["opacity"]))
        self.assertGreater(strengths[0], strengths[1])
        self.assertGreater(strengths[1], 0)

    def test_grayscale_material_has_only_neutral_colors(self):
        for material in core.MATERIALS:
            root = ET.fromstring(self.svg(material=material, color_mode="grayscale"))
            for element in root.iter():
                for key in ("fill", "stroke", "stop-color"):
                    color = element.attrib.get(key, "")
                    if len(color) == 7 and color.startswith("#"):
                        self.assertEqual(color[1:3], color[3:5])
                        self.assertEqual(color[3:5], color[5:7])

    def test_unknown_material_is_rejected(self):
        with self.assertRaises(ValueError):
            self.svg(material="unknown")
