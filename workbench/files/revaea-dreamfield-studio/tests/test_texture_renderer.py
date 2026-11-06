import os
import unittest

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

import core
import numpy as np
from PIL import Image
from PySide6.QtWidgets import QApplication
from texture_renderer import apply_texture, render_svg


def texture_fixture(size=64):
    y, x = np.indices((size, size))
    pixels = np.empty((size, size, 4), dtype=np.uint8)
    pixels[..., 0] = (x * 71 + y * 13) % 256
    pixels[..., 1] = (x * 29 + y * 37) % 256
    pixels[..., 2] = 128
    pixels[..., 3] = 255
    return Image.fromarray(pixels)


class TextureRendererTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = QApplication.instance() or QApplication([])

    def images(self, **options):
        original = render_svg(core.build_svg(core.BASE_PALETTE, **options), 128)
        field = render_svg(core.build_svg(core.BASE_PALETTE, unmasked=True, **options), 128)
        return original, field

    def test_texture_changes_colors_and_preserves_every_alpha_pixel(self):
        for small in (False, True):
            original, field = self.images(optical_scale=0.9, small_icon=small, opacity=0.6)
            scale = 0.9 * (1 - 0.055 * 0.65) if small else 0.9
            result = apply_texture(original, field, texture_fixture(), 0.8, 1, 42, scale)
            self.assertEqual(result.getchannel("A").tobytes(), original.getchannel("A").tobytes())
            self.assertNotEqual(result.tobytes(), original.tobytes())

    def test_texture_is_reproducible_and_responds_to_scale_and_seed(self):
        original, field = self.images()
        texture = texture_fixture()
        first = apply_texture(original, field, texture, 0.7, 1, 42)
        again = apply_texture(original, field, texture, 0.7, 1, 42)
        changed = apply_texture(original, field, texture, 0.7, 1.8, 43)
        self.assertEqual(first.tobytes(), again.tobytes())
        self.assertNotEqual(first.tobytes(), changed.tobytes())

    def test_zero_strength_transparent_and_neutral_textures_are_noops(self):
        original, field = self.images()
        for texture, strength in (
            (texture_fixture(), 0),
            (Image.new("RGBA", (16, 16), (255, 0, 0, 0)), 1),
            (Image.new("RGBA", (16, 16), (128, 128, 255, 255)), 1),
        ):
            result = apply_texture(original, field, texture, strength, 1, 42)
            self.assertEqual(result.tobytes(), original.tobytes())

    def test_colored_texture_does_not_paint_its_colors_over_grayscale_logo(self):
        original, field = self.images(color_mode="grayscale")
        result = apply_texture(original, field, texture_fixture(), 1, 1, 42)
        red, green, blue, _ = result.split()
        self.assertEqual(red.tobytes(), green.tobytes())
        self.assertEqual(green.tobytes(), blue.tobytes())
