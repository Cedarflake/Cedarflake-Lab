import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from merge_av import merge_av


class MergeAvTests(unittest.TestCase):
    def test_timeout_terminates_and_reaps_ffmpeg(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            video = root / "video.mp4"
            audio = root / "audio.mp3"
            output = root / "output.mp4"
            video.touch()
            audio.touch()

            process = mock.MagicMock()
            process.wait.side_effect = [
                subprocess.TimeoutExpired("ffmpeg", 1),
                subprocess.TimeoutExpired("ffmpeg", 5),
                0,
            ]

            with mock.patch("merge_av.subprocess.Popen", return_value=process):
                with self.assertRaisesRegex(TimeoutError, "超时已中断"):
                    merge_av(video, audio, output, False, False, timeout=1)

            process.terminate.assert_called_once_with()
            process.kill.assert_called_once_with()
            self.assertEqual(process.wait.call_args_list[-1], mock.call())


if __name__ == "__main__":
    unittest.main()
