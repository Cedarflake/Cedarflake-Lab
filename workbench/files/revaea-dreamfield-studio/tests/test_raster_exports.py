import os
import tempfile
import unittest
from pathlib import Path

from PIL import Image


class RasterExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
        from main import StudioWindow
        from PySide6.QtWidgets import QApplication

        cls.application = QApplication.instance() or QApplication([])
        cls.window = StudioWindow()

    @classmethod
    def tearDownClass(cls):
        cls.window.close()

    def test_render_and_round_trip_supported_raster_formats(self):
        source = self.window.renderImage(64)
        self.assertEqual(source.mode, "RGBA")
        self.assertEqual(source.size, (64, 64))
        self.assertGreater(source.getchannel("A").getextrema()[1], 0)

        with tempfile.TemporaryDirectory() as temporary_directory:
            for format_name in ("PNG", "WebP", "AVIF", "JPEG", "TIFF", "BMP"):
                with self.subTest(format_name=format_name):
                    path = Path(temporary_directory) / f"icon.{format_name.lower()}"
                    self.window.saveRaster(source, path, format_name)
                    with Image.open(path) as decoded:
                        decoded.load()
                        self.assertEqual(decoded.size, source.size)
                        self.assertEqual(decoded.format, format_name.upper())

    def test_small_multi_size_ico_round_trip(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            path = Path(temporary_directory) / "icon.ico"
            self.window.saveIco(path, [16, 32, 64])
            with Image.open(path) as decoded:
                decoded.load()
                self.assertEqual(decoded.ico.sizes(), {(16, 16), (32, 32), (64, 64)})


if __name__ == "__main__":
    unittest.main()
