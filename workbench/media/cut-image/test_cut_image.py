import tempfile
import unittest
from pathlib import Path

from cut_image import slice_image_horizontally
from PIL import Image


class SliceImageTests(unittest.TestCase):
    def test_rejects_more_slices_than_image_rows(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            image_path = root / "input.png"
            output_dir = root / "output"
            Image.new("RGB", (3, 2), color="red").save(image_path)

            with self.assertRaisesRegex(ValueError, "不能超过图片高度"):
                slice_image_horizontally(image_path, output_dir, "slice", slices=3)

            self.assertFalse(output_dir.exists())

    def test_uneven_rows_are_kept_in_the_last_slice(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            image_path = root / "input.png"
            output_dir = root / "output"
            Image.new("RGB", (3, 5), color="blue").save(image_path)

            slice_image_horizontally(image_path, output_dir, "slice", slices=2)

            with Image.open(output_dir / "slice_1.png") as first:
                self.assertEqual(first.size, (3, 2))
            with Image.open(output_dir / "slice_2.png") as second:
                self.assertEqual(second.size, (3, 3))


if __name__ == "__main__":
    unittest.main()
