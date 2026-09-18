import colorsys
import unittest
import xml.etree.ElementTree as ET

import main


def hue_of(hex_color: str) -> float:
    value = hex_color.lstrip("#")
    red = int(value[0:2], 16) / 255
    green = int(value[2:4], 16) / 255
    blue = int(value[4:6], 16) / 255

    hue, _, _ = colorsys.rgb_to_hls(red, green, blue)
    return hue * 360


def hue_distance(left: float, right: float) -> float:
    return abs((left - right + 180) % 360 - 180)


class PaletteTests(unittest.TestCase):
    def test_original_hue_reproduces_base_palette(self):
        palette = main.build_palette(
            main.BASE_ANCHOR_HUE,
            saturation_scale=1.0,
            contrast_scale=1.0,
        )

        self.assertEqual(palette, main.BASE_PALETTE)

    def test_target_hue_matches_core_color(self):
        for target_hue in (0, 45, 120, 180, 240, 300):
            with self.subTest(target_hue=target_hue):
                palette = main.build_palette(
                    target_hue,
                    saturation_scale=1.0,
                    contrast_scale=1.0,
                )

                actual_hue = hue_of(palette["c6"])

                self.assertLessEqual(
                    hue_distance(actual_hue, target_hue),
                    1.0,
                )

    def test_palette_keeps_all_color_roles(self):
        palette = main.build_palette(
            180,
            saturation_scale=1.0,
            contrast_scale=1.0,
        )

        self.assertEqual(set(palette), set(main.BASE_PALETTE))
        self.assertGreater(len(set(palette.values())), 1)

    def test_small_palette_optimization_changes_palette(self):
        palette = main.build_palette(
            main.BASE_ANCHOR_HUE,
            saturation_scale=1.0,
            contrast_scale=1.0,
        )

        optimized = main.strengthen_small_palette(palette, 0.65)

        self.assertEqual(set(optimized), set(palette))
        self.assertNotEqual(optimized, palette)


class SvgTests(unittest.TestCase):
    def make_svg(self, **kwargs):
        palette = main.build_palette(
            main.BASE_ANCHOR_HUE,
            saturation_scale=1.0,
            contrast_scale=1.0,
        )

        return main.build_svg(palette, **kwargs)

    def test_svg_is_valid_xml(self):
        svg = self.make_svg()

        root = ET.fromstring(svg)

        self.assertTrue(root.tag.endswith("svg"))

    def test_svg_uses_requested_size(self):
        svg = self.make_svg(width=256, height=256)

        root = ET.fromstring(svg)

        self.assertEqual(root.attrib["width"], "256")
        self.assertEqual(root.attrib["height"], "256")
        self.assertEqual(root.attrib["viewBox"], "0 0 2000 2000")

    def test_svg_contains_revaea_shape(self):
        svg = self.make_svg()

        self.assertIn(main.SHAPE_PATH, svg)
        self.assertIn('id="shape"', svg)
        self.assertIn('fill-rule="evenodd"', svg)

    def test_svg_does_not_embed_bitmap_content(self):
        svg = self.make_svg()
        lowered = svg.lower()

        forbidden = (
            "<image",
            "base64",
            "data:image",
            "feturbulence",
            "fedisplacementmap",
        )

        for value in forbidden:
            with self.subTest(value=value):
                self.assertNotIn(value, lowered)

    def test_small_icon_mode_changes_render_definition(self):
        normal = self.make_svg(
            width=32,
            height=32,
            small_icon=False,
        )

        optimized = self.make_svg(
            width=32,
            height=32,
            small_icon=True,
            small_strength=0.65,
        )

        self.assertNotEqual(normal, optimized)

    def test_different_hues_produce_different_svg(self):
        first_palette = main.build_palette(
            120,
            saturation_scale=1.0,
            contrast_scale=1.0,
        )
        second_palette = main.build_palette(
            240,
            saturation_scale=1.0,
            contrast_scale=1.0,
        )

        first = main.build_svg(first_palette)
        second = main.build_svg(second_palette)

        self.assertNotEqual(first, second)


class UtilityTests(unittest.TestCase):
    def test_clamp(self):
        self.assertEqual(main.clamp(-1), 0.0)
        self.assertEqual(main.clamp(0.5), 0.5)
        self.assertEqual(main.clamp(2), 1.0)

    def test_clamp_custom_range(self):
        self.assertEqual(main.clamp(5, 10, 20), 10)
        self.assertEqual(main.clamp(15, 10, 20), 15)
        self.assertEqual(main.clamp(25, 10, 20), 20)


if __name__ == "__main__":
    unittest.main()
