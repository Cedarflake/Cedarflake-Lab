import subprocess
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

from cedarflake_ascii_art import cli
from cedarflake_ascii_art.image_processing import converter_png
from cedarflake_ascii_art.playback import player
from cedarflake_ascii_art.utils import file_utils
from cedarflake_ascii_art.video_processing import converter_txt as video_converter_txt
from cedarflake_ascii_art.video_processing import converter_video


class FakeCapture:
    def __init__(self, frames, *, is_opened=True):
        self.frames = list(frames)
        self.is_opened = is_opened
        self.is_released = False

    def isOpened(self):
        return self.is_opened

    def get(self, _property):
        return len(self.frames)

    def read(self):
        if not self.frames:
            return False, None
        return True, self.frames.pop(0)

    def release(self):
        self.is_released = True


class TestNumberedOutput(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)

    def tearDown(self):
        self.temporary_directory.cleanup()

    def test_numbering_fills_gap_without_overwriting_later_file(self):
        first_output = self.root / "output_001.txt"
        later_output = self.root / "output_003.txt"
        first_output.write_text("first", encoding="utf-8")
        later_output.write_text("keep", encoding="utf-8")

        output_path = file_utils.save_to_file("second", self.root)

        self.assertEqual(Path(output_path).name, "output_002.txt")
        self.assertEqual(Path(output_path).read_text(encoding="utf-8"), "second")
        self.assertEqual(later_output.read_text(encoding="utf-8"), "keep")

    def test_concurrent_numbered_writes_reserve_unique_files(self):
        worker_count = 8
        barrier = threading.Barrier(worker_count)
        result_lock = threading.Lock()
        output_paths = []
        errors = []

        def save_content(index):
            try:
                barrier.wait(timeout=2)
                output_path = file_utils.save_to_file(str(index), self.root)
                with result_lock:
                    output_paths.append(Path(output_path))
            except Exception as error:
                with result_lock:
                    errors.append(error)

        threads = [threading.Thread(target=save_content, args=(index,)) for index in range(8)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=3)

        self.assertTrue(all(not thread.is_alive() for thread in threads))
        self.assertEqual(errors, [])
        self.assertEqual(len(output_paths), worker_count)
        self.assertEqual(len(set(output_paths)), worker_count)
        self.assertEqual(
            sorted(path.name for path in output_paths),
            [f"output_{index:03d}.txt" for index in range(1, worker_count + 1)],
        )
        self.assertEqual(
            {path.read_text(encoding="utf-8") for path in output_paths},
            {str(index) for index in range(worker_count)},
        )


class TestVideoTextConversion(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)

    def tearDown(self):
        self.temporary_directory.cleanup()

    def test_converter_returns_output_without_starting_playback(self):
        capture = FakeCapture([object(), object()])

        with (
            mock.patch.object(video_converter_txt.cv2, "VideoCapture", return_value=capture),
            mock.patch.object(video_converter_txt, "frame_to_ascii", return_value="ASCII"),
            mock.patch.object(player, "play_ascii_video") as play_ascii_video,
        ):
            output_directory = video_converter_txt.video_to_ascii(
                "sample.mp4",
                output_dir=self.root,
                new_width=8,
            )

        self.assertEqual(Path(output_directory), self.root / "sample")
        self.assertEqual(len(list(Path(output_directory).glob("frame_*.txt"))), 2)
        self.assertTrue(capture.is_released)
        play_ascii_video.assert_not_called()

    def test_unopenable_video_is_reported_as_failure(self):
        capture = FakeCapture([], is_opened=False)

        with mock.patch.object(
            video_converter_txt.cv2,
            "VideoCapture",
            return_value=capture,
        ):
            with self.assertRaisesRegex(RuntimeError, "无法打开视频文件"):
                video_converter_txt.video_to_ascii("broken.mp4", output_dir=self.root)

        self.assertTrue(capture.is_released)

    def test_frame_conversion_failure_is_propagated_and_releases_capture(self):
        capture = FakeCapture([object()])

        with (
            mock.patch.object(video_converter_txt.cv2, "VideoCapture", return_value=capture),
            mock.patch.object(
                video_converter_txt,
                "frame_to_ascii",
                side_effect=RuntimeError("frame failed"),
            ),
        ):
            with self.assertRaisesRegex(RuntimeError, "frame failed"):
                video_converter_txt.video_to_ascii(
                    "broken.mp4",
                    output_dir=self.root,
                )

        self.assertTrue(capture.is_released)

    def test_cli_plays_converted_text_video_once(self):
        output_directory = self.root / "sample"

        with (
            mock.patch("builtins.input", side_effect=["1", "sample.mp4"]),
            mock.patch.object(cli, "is_valid_file", return_value=True),
            mock.patch.object(
                cli.video_converter_txt,
                "video_to_ascii",
                return_value=str(output_directory),
            ) as video_to_ascii,
            mock.patch.object(cli.player, "play_ascii_video") as play_ascii_video,
            mock.patch.object(cli.click, "echo"),
        ):
            cli.handle_video_processing()

        video_to_ascii.assert_called_once()
        play_ascii_video.assert_called_once_with(
            str(output_directory),
            fps=cli.config.get_default_setting("video_fps"),
        )

    def test_cli_does_not_play_or_report_success_after_text_conversion_failure(self):
        with (
            mock.patch("builtins.input", side_effect=["1", "broken.mp4"]),
            mock.patch.object(cli, "is_valid_file", return_value=True),
            mock.patch.object(
                cli.video_converter_txt,
                "video_to_ascii",
                side_effect=RuntimeError("decode failed"),
            ),
            mock.patch.object(cli.player, "play_ascii_video") as play_ascii_video,
            mock.patch.object(cli.click, "echo") as echo,
        ):
            cli.handle_video_processing()

        messages = [str(call.args[0]) for call in echo.call_args_list if call.args]
        play_ascii_video.assert_not_called()
        self.assertTrue(any("视频处理失败" in message for message in messages))
        self.assertFalse(any("生成完成" in message for message in messages))


class TestFailurePropagation(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)

    def tearDown(self):
        self.temporary_directory.cleanup()

    def test_png_conversion_failure_is_not_reported_as_success(self):
        with mock.patch.object(
            converter_png,
            "convert_image_to_ascii",
            return_value=(None, None, None),
        ):
            with self.assertRaisesRegex(RuntimeError, "ASCII字符转换失败"):
                converter_png.convert_and_save("broken.png")

    def test_ffmpeg_failure_is_reraised_after_temporary_cleanup(self):
        source_path = self.root / "sample.mp4"
        source_path.write_bytes(b"video")
        output_root = self.root / "output"
        dialog_root = mock.Mock()
        ffmpeg_error = subprocess.CalledProcessError(1, ["ffmpeg"])

        with (
            mock.patch.object(converter_video, "Tk", return_value=dialog_root),
            mock.patch.object(
                converter_video.filedialog,
                "askopenfilename",
                return_value=str(source_path),
            ),
            mock.patch.object(converter_video.os.path, "isfile", return_value=True),
            mock.patch.object(
                converter_video.config,
                "get",
                return_value={"video": str(output_root)},
            ),
            mock.patch.object(converter_video.subprocess, "run", side_effect=ffmpeg_error),
        ):
            with self.assertRaises(subprocess.CalledProcessError):
                converter_video.start_convert()

        dialog_root.withdraw.assert_called_once_with()
        dialog_root.destroy.assert_called_once_with()
        video_output_directory = output_root / "sample"
        for directory_name in ("temp_audio", "temp_pic", "temp_thum", "temp_ascii"):
            self.assertFalse((video_output_directory / directory_name).exists())

    def test_cli_does_not_print_video_success_after_ffmpeg_failure(self):
        ffmpeg_error = subprocess.CalledProcessError(1, ["ffmpeg"])

        with (
            mock.patch("builtins.input", return_value="2"),
            mock.patch.object(cli.converter_video, "start_convert", side_effect=ffmpeg_error),
            mock.patch.object(cli.click, "echo") as echo,
        ):
            cli.handle_video_processing()

        messages = [str(call.args[0]) for call in echo.call_args_list if call.args]
        self.assertTrue(any("视频处理失败" in message for message in messages))
        self.assertFalse(any("生成成功" in message for message in messages))

    def test_cli_reports_cancel_without_video_success(self):
        with (
            mock.patch("builtins.input", return_value="2"),
            mock.patch.object(cli.converter_video, "start_convert", return_value=None),
            mock.patch.object(cli.click, "echo") as echo,
        ):
            cli.handle_video_processing()

        messages = [str(call.args[0]) for call in echo.call_args_list if call.args]
        self.assertTrue(any("已取消转换" in message for message in messages))
        self.assertFalse(any("生成成功" in message for message in messages))


if __name__ == "__main__":
    unittest.main()
