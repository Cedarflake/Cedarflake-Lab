import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

import adjust_gif
from PIL import Image


class RootStub:
    def __init__(self):
        self.is_quit = False
        self.is_destroyed = False

    def after(self, _delay, callback, *args):
        callback(*args)

    def quit(self):
        self.is_quit = True

    def destroy(self):
        self.is_destroyed = True


class QueuedRootStub(RootStub):
    def __init__(self):
        super().__init__()
        self.callbacks = []

    def after(self, _delay, callback, *args):
        self.callbacks.append((callback, args))

    def run_next_callback(self):
        callback, args = self.callbacks.pop(0)
        callback(*args)


class StatusLabelStub:
    def __init__(self):
        self.text = ""

    def config(self, **kwargs):
        self.text = kwargs.get("text", self.text)


class TestGifSpeedAdjuster(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.input_path = self.root / "input.gif"
        self.output_path = self.root / "output.gif"
        self.existing_output = b"existing output"
        self.create_animated_gif(self.input_path)

    def tearDown(self):
        self.temporary_directory.cleanup()

    def create_animated_gif(self, path, *, loop=0, disposal=None):
        first_frame = Image.new("RGB", (8, 8), color="red")
        second_frame = Image.new("RGB", (8, 8), color="blue")
        save_kwargs = {
            "format": "GIF",
            "save_all": True,
            "append_images": [second_frame],
            "duration": [100, 100],
            "loop": loop,
            "optimize": False,
        }
        if disposal is not None:
            save_kwargs["disposal"] = disposal
        first_frame.save(path, **save_kwargs)
        first_frame.close()
        second_frame.close()

    def create_transparent_gif(self, path):
        palette = [0, 0, 0, 255, 0, 0, 0, 0, 255] + [0, 0, 0] * 253
        first_frame = Image.new("P", (8, 8), 1)
        second_frame = Image.new("P", (8, 8), 2)
        first_frame.putpalette(palette)
        second_frame.putpalette(palette)
        first_frame.putpixel((0, 0), 0)
        second_frame.putpixel((0, 0), 0)
        first_frame.save(
            path,
            format="GIF",
            save_all=True,
            append_images=[second_frame],
            duration=[100, 100],
            loop=1,
            disposal=[1, 2],
            transparency=0,
            optimize=False,
        )
        first_frame.close()
        second_frame.close()

    def create_adjuster(self, root=None):
        adjuster = adjust_gif.GifSpeedAdjuster.__new__(adjust_gif.GifSpeedAdjuster)
        adjuster.should_cancel = False
        adjuster._shutdown_initiated = False
        adjuster._temp_output_path = None
        adjuster._processing_state_lock = threading.Lock()
        adjuster._output_committed = False
        adjuster.is_processing = False
        adjuster.processing_thread = None
        adjuster.root = root or RootStub()
        adjuster.status_label = StatusLabelStub()
        return adjuster

    def read_rendered_frames(self, path):
        rendered_frames = []
        with Image.open(path) as image:
            for frame_index in range(image.n_frames):
                image.seek(frame_index)
                rendered_frames.append(image.convert("RGBA").tobytes())
        return rendered_frames

    def assert_no_temporary_output(self, output_path=None):
        output_path = output_path or self.output_path
        temporary_outputs = list(output_path.parent.glob(f".{output_path.name}.*.gif"))
        self.assertEqual(temporary_outputs, [])

    def test_success_atomically_replaces_existing_output(self):
        self.output_path.write_bytes(self.existing_output)
        adjuster = self.create_adjuster()
        replace_sources = []
        real_replace = os.replace

        def capture_replace(source, destination):
            source_path = Path(source)
            replace_sources.append(source_path)
            self.assertEqual(source_path.parent, self.output_path.parent)
            self.assertEqual(source_path.suffix, ".gif")
            real_replace(source, destination)

        with mock.patch.object(adjust_gif.os, "replace", side_effect=capture_replace):
            adjuster.adjust_gif_speed(str(self.input_path), str(self.output_path), 0.05)

        self.assertEqual(len(replace_sources), 1)
        self.assertNotEqual(self.output_path.read_bytes(), self.existing_output)
        with Image.open(self.output_path) as output_image:
            self.assertEqual(output_image.format, "GIF")
            self.assertEqual(output_image.n_frames, 2)
        self.assertTrue(adjuster._is_output_committed())
        self.assertIsNone(adjuster._temp_output_path)
        self.assert_no_temporary_output()

    def test_replace_failure_preserves_existing_output(self):
        self.output_path.write_bytes(self.existing_output)
        adjuster = self.create_adjuster()

        with mock.patch.object(adjust_gif.os, "replace", side_effect=OSError("replace failed")):
            with self.assertRaisesRegex(OSError, "replace failed"):
                adjuster.adjust_gif_speed(str(self.input_path), str(self.output_path), 0.05)

        self.assertEqual(self.output_path.read_bytes(), self.existing_output)
        self.assertFalse(adjuster._is_output_committed())
        self.assertIsNone(adjuster._temp_output_path)
        self.assert_no_temporary_output()

    def test_cancel_after_save_preserves_existing_output(self):
        self.output_path.write_bytes(self.existing_output)
        adjuster = self.create_adjuster()
        real_save = Image.Image.save

        def save_then_cancel(image, *args, **kwargs):
            result = real_save(image, *args, **kwargs)
            self.assertTrue(adjuster._request_cancel())
            return result

        with mock.patch.object(Image.Image, "save", new=save_then_cancel):
            with self.assertRaises(InterruptedError):
                adjuster.adjust_gif_speed(str(self.input_path), str(self.output_path), 0.05)

        self.assertEqual(self.output_path.read_bytes(), self.existing_output)
        self.assertFalse(adjuster._is_output_committed())
        self.assert_no_temporary_output()

    def test_commit_wins_over_late_cancel_without_cancel_state(self):
        self.output_path.write_bytes(self.existing_output)
        adjuster = self.create_adjuster()
        replace_started = threading.Event()
        allow_replace = threading.Event()
        real_replace = os.replace
        errors = []
        cancel_results = []

        def blocking_replace(source, destination):
            replace_started.set()
            allow_replace.wait(timeout=2)
            real_replace(source, destination)

        def process():
            try:
                adjuster.adjust_gif_speed(str(self.input_path), str(self.output_path), 0.05)
            except Exception as error:
                errors.append(error)

        with mock.patch.object(adjust_gif.os, "replace", side_effect=blocking_replace):
            processing_thread = threading.Thread(target=process)
            processing_thread.start()
            self.assertTrue(replace_started.wait(timeout=2))
            cancel_thread = threading.Thread(
                target=lambda: cancel_results.append(adjuster._request_cancel())
            )
            cancel_thread.start()
            allow_replace.set()
            processing_thread.join(timeout=2)
            cancel_thread.join(timeout=2)

        self.assertFalse(processing_thread.is_alive())
        self.assertFalse(cancel_thread.is_alive())
        self.assertEqual(errors, [])
        self.assertEqual(cancel_results, [False])
        self.assertTrue(adjuster._is_output_committed())
        self.assertFalse(adjuster._is_cancel_requested())

    def test_shutdown_waits_for_worker_before_cleaning_temporary_output(self):
        queued_root = QueuedRootStub()
        adjuster = self.create_adjuster(queued_root)
        temporary_output = self.root / ".output.gif.active.gif"
        temporary_output.write_bytes(b"temporary output")
        worker_started = threading.Event()
        worker_release = threading.Event()

        def worker():
            with temporary_output.open("r+b"):
                worker_started.set()
                worker_release.wait(timeout=2)

        processing_thread = threading.Thread(target=worker)
        processing_thread.start()
        self.assertTrue(worker_started.wait(timeout=2))
        adjuster.processing_thread = processing_thread
        adjuster.is_processing = True
        adjuster._temp_output_path = str(temporary_output)

        adjuster._graceful_shutdown()

        self.assertTrue(temporary_output.exists())
        self.assertFalse(queued_root.is_destroyed)
        self.assertEqual(len(queued_root.callbacks), 1)

        worker_release.set()
        processing_thread.join(timeout=2)
        queued_root.run_next_callback()

        self.assertFalse(temporary_output.exists())
        self.assertTrue(queued_root.is_quit)
        self.assertTrue(queued_root.is_destroyed)

    def test_transparent_pixels_are_preserved(self):
        transparent_input = self.root / "transparent.gif"
        transparent_output = self.root / "transparent-output.gif"
        self.create_transparent_gif(transparent_input)
        expected_frames = self.read_rendered_frames(transparent_input)
        adjuster = self.create_adjuster()

        adjuster.adjust_gif_speed(str(transparent_input), str(transparent_output), 0.05)

        self.assertEqual(self.read_rendered_frames(transparent_output), expected_frames)
        with Image.open(transparent_output) as output_image:
            output_image.seek(0)
            first_frame = output_image.convert("RGBA")
            self.assertEqual(first_frame.getpixel((0, 0))[3], 0)
            self.assertEqual(first_frame.getpixel((1, 1)), (255, 0, 0, 255))

    def test_input_can_be_atomically_replaced_in_place(self):
        adjuster = self.create_adjuster()

        adjuster.adjust_gif_speed(str(self.input_path), str(self.input_path), 0.05)

        with Image.open(self.input_path) as output_image:
            self.assertEqual(output_image.format, "GIF")
            self.assertEqual(output_image.n_frames, 2)
            self.assertEqual(output_image.info["duration"], 50)
        self.assertTrue(adjuster._is_output_committed())
        self.assert_no_temporary_output(self.input_path)

    def test_loop_and_per_frame_disposal_are_preserved(self):
        metadata_input = self.root / "metadata.gif"
        metadata_output = self.root / "metadata-output.gif"
        self.create_animated_gif(metadata_input, loop=2, disposal=[1, 2])
        adjuster = self.create_adjuster()

        adjuster.adjust_gif_speed(str(metadata_input), str(metadata_output), 0.05)

        with Image.open(metadata_output) as output_image:
            self.assertEqual(output_image.info["loop"], 2)
            durations = []
            disposals = []
            for frame_index in range(output_image.n_frames):
                output_image.seek(frame_index)
                durations.append(output_image.info["duration"])
                disposals.append(output_image.disposal_method)
        self.assertEqual(durations, [50, 50])
        self.assertEqual(disposals, [1, 2])

    def test_missing_output_parent_is_created(self):
        nested_output = self.root / "new" / "nested" / "output.gif"
        adjuster = self.create_adjuster()

        adjuster.adjust_gif_speed(str(self.input_path), str(nested_output), 0.05)

        self.assertTrue(nested_output.is_file())
        self.assert_no_temporary_output(nested_output)

    def test_shutdown_cleanup_only_removes_active_temporary_output(self):
        self.output_path.write_bytes(self.existing_output)
        temporary_output = self.root / ".output.gif.active.gif"
        temporary_output.write_bytes(b"temporary output")
        adjuster = self.create_adjuster()
        adjuster._temp_output_path = str(temporary_output)

        adjuster._cleanup_resources()

        self.assertEqual(self.output_path.read_bytes(), self.existing_output)
        self.assertFalse(temporary_output.exists())
        self.assertIsNone(adjuster._temp_output_path)


if __name__ == "__main__":
    unittest.main()
