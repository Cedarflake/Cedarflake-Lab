import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image
from texture_library import BUILTIN_ID, TextureLibrary


class TextureLibraryTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.library = TextureLibrary(self.root / "library")
        self.source = self.root / "paper.png"
        Image.new("RGBA", (16, 12), (75, 96, 120, 160)).save(self.source)

    def test_library_is_created_only_when_importing(self):
        self.assertEqual([asset.id for asset in self.library.assets()], [BUILTIN_ID])
        self.assertFalse(self.library.root.exists())

    def test_import_survives_source_removal_and_new_library_instance(self):
        original = self.source.read_bytes()
        asset = self.library.import_texture(self.source)
        self.assertEqual(self.source.read_bytes(), original)
        self.assertNotEqual(asset.path, self.source)
        self.source.unlink()
        reopened = TextureLibrary(self.library.root)
        image = reopened.load(asset.id)
        self.assertEqual(image.size, (16, 12))
        self.assertEqual(image.getpixel((0, 0)), (75, 96, 120, 160))
        self.assertEqual(reopened.assets()[1].name, "paper")

    def test_identical_pixels_share_one_asset(self):
        first = self.library.import_texture(self.source)
        duplicate = self.root / "renamed.png"
        Image.open(self.source).save(duplicate, compress_level=0)
        second = self.library.import_texture(duplicate)
        self.assertEqual(first.id, second.id)
        self.assertEqual(len(list(self.library.root.glob("*.png"))), 1)
        metadata = json.loads(next(self.library.root.glob("*.json")).read_text())
        self.assertEqual(set(metadata), {"name"})

    def test_unsupported_and_corrupt_images_do_not_enter_library(self):
        Image.new("RGB", (8, 8)).save(self.source, "JPEG")
        with self.assertRaises(ValueError):
            self.library.import_texture(self.source)
        self.source.write_bytes(b"not a PNG")
        with self.assertRaises(ValueError):
            self.library.import_texture(self.source)
        self.assertFalse(self.library.root.exists())

    def test_oversized_dimensions_are_rejected_before_copy(self):
        Image.new("RGB", (4097, 1)).save(self.source)
        with self.assertRaisesRegex(ValueError, "4096"):
            self.library.import_texture(self.source)
        self.assertFalse(self.library.root.exists())

    def test_normalized_image_must_fit_library_size_limit(self):
        Image.new("RGB", (32, 32), (75, 96, 120)).save(self.source, "WEBP", lossless=True)
        with (
            patch("texture_library.MAX_TEXTURE_BYTES", self.source.stat().st_size),
            self.assertRaisesRegex(ValueError, "存入素材库后"),
        ):
            self.library.import_texture(self.source)
        self.assertFalse(self.library.root.exists())

    def test_asset_ids_cannot_reference_arbitrary_paths(self):
        for asset_id in ("../paper.png", str(self.source), "sha256:../paper", None):
            with self.subTest(asset_id=asset_id), self.assertRaises(ValueError):
                self.library.asset(asset_id)

    def test_missing_or_changed_asset_is_reported_and_reimport_repairs_it(self):
        asset = self.library.import_texture(self.source)
        self.library.load(asset.id)
        asset.path.write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "已改变"):
            self.library.load(asset.id)
        repaired = self.library.import_texture(self.source)
        self.assertEqual(repaired.id, asset.id)
        self.assertEqual(self.library.load(asset.id).size, (16, 12))
        asset.path.unlink()
        with self.assertRaises(FileNotFoundError):
            self.library.load(asset.id)
