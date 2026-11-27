# /// script
# requires-python = ">=3.12"
# dependencies = ["pillow==12.2.0", "piexif==1.1.3", "requests==2.32.5"]
# ///
"""Small offline behavior checks. All generated files stay below tools."""
import io
import json
import os
import subprocess
import struct
import warnings
import sys
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import Mock, patch
from types import SimpleNamespace

import piexif
from PIL import Image

from library_media import admit, dated_copy, decode, file_times, Rejected
from library_network import OfficialClient, SourceDenied, StopController, Stopped, retry_after
from library_storage import BudgetExceeded, CollectionInconsistent, Storage, collection_lock, sha256
from prepare_library import API, discover, prepare_item, preserve_discovery_pause, run, seed_candidates

TOOLS = Path(__file__).resolve().parent


class RawBody(io.BytesIO):
    def read(self, size=-1, decode_content=False):
        return super().read(size)


class Response:
    def __init__(self, data=b"", status=200, headers=None):
        self.status_code = status
        self.headers = headers if headers is not None else {"Content-Length": str(len(data))}
        self.raw = RawBody(data)
        self.url = "https://images.metmuseum.org/file.jpg"
    def __enter__(self):
        return self
    def __exit__(self, *_):
        self.raw.close()
    def raise_for_status(self):
        if self.status_code >= 400:
            raise AssertionError("Unexpected fake status")


class Session:
    def __init__(self, responses):
        self.responses = iter(responses)
        self.headers = {}
        self.calls = 0
    def get(self, *_, **kwargs):
        assert kwargs["allow_redirects"] is False
        self.calls += 1
        return next(self.responses)
    def close(self):
        pass


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="library-fixture-", dir=TOOLS)
        self.root = Path(self.temp.name)
        self.storage = Storage(self.root / "collection", 4 * 1024**2, 1024**2)

    def tearDown(self):
        self.temp.cleanup()

    def jpeg(self):
        output = io.BytesIO()
        image = Image.new("RGB", (1200, 600), (37, 129, 203))
        exif = {"0th": {}, "Exif": {0x9011: b"-05:00", 0x9291: b"456"},
                "GPS": {}, "1st": {}, "thumbnail": None}
        image.save(output, "JPEG", exif=piexif.dump(exif))
        return output.getvalue()

    def committed(self):
        original = self.jpeg()
        dated, captured, created, modified = dated_copy(original, "met-1")
        width, height, pixels = decode(dated)
        entry = {
            "format": Storage.FORMAT, "id": "met-1",
            "file": "images/艺术收藏/painting-met-1.jpg", "bytes": len(dated),
            "sha256": sha256(dated), "source_sha256": sha256(original),
            "pixel_sha256": pixels, "image_url": "https://images.metmuseum.org/1.jpg",
            "source_kind": "official-download",
        }
        witness = {"object": {"objectID": 1, "isPublicDomain": True, "primaryImage": entry["image_url"]},
                   "image_response": {"requested_url": entry["image_url"], "sha256": entry["source_sha256"]}}
        result = self.storage.commit(entry, witness, dated, lambda path: file_times(path, created, modified))
        return result

    def corrupt_exif_jpeg(self):
        output = io.BytesIO()
        Image.new("RGB", (1200, 600), (17, 29, 43)).save(output, "JPEG")
        jpeg = output.getvalue()
        # A complete JPEG with a zero-entry IFD missing its four-byte next-IFD pointer.
        exif = b"Exif\0\0II*\0" + struct.pack("<I", 8) + struct.pack("<H", 0)
        return jpeg[:2] + b"\xff\xe1" + struct.pack(">H", len(exif) + 2) + exif + jpeg[2:]

    def test_truncated_jpeg_is_not_admitted(self):
        with self.assertRaises(Rejected):
            decode(self.jpeg()[:-200])

    def test_decodable_pixels_do_not_admit_corrupt_exif(self):
        data = self.corrupt_exif_jpeg()
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            with Image.open(io.BytesIO(data)) as image:
                image.load()
                self.assertEqual(image.size, (1200, 600))
        with self.assertRaisesRegex(Rejected, "JPEG|EXIF"):
            decode(data)
        with self.assertRaisesRegex(Rejected, "EXIF"):
            dated_copy(data, "met-1")

    def test_corrupt_exif_rejects_one_item_and_continues_batch(self):
        root = self.root / "collections" / "scope"
        storage = Storage(root, 4 * 1024**2, 1024**2)
        self.discovery_page(storage, "forest", 0, [1, 2])
        args = SimpleNamespace(collection="scope", seed=None, expand=False, cached_discovery=True,
                               limit=None, max_disk_gib=0.01, max_network_gib=0.01)
        data = [self.corrupt_exif_jpeg(), self.jpeg()]
        client = Mock()
        client.json.side_effect = [
            ({"objectID": identity, "isPublicDomain": True,
              "primaryImage": f"https://images.metmuseum.org/{identity}.jpg",
              "artistEndDate": "1900", "objectEndDate": 1880, "title": "River study"},
             {"fetched_at": "2026-11-27T10:00:00+00:00"})
            for identity in (1, 2)
        ]
        client.fetch.side_effect = [
            (body, {"requested_url": f"https://images.metmuseum.org/{identity}.jpg",
                    "sha256": sha256(body)})
            for identity, body in enumerate(data, 1)
        ]
        with patch("prepare_library.ROOT", self.root), patch("prepare_library.TOPICS", ("forest",)), \
                patch("prepare_library.OfficialClient", return_value=client):
            self.assertEqual(run(args), 0)
        self.assertEqual(client.fetch.call_count, 2)
        state = json.loads((root / "status.json").read_text("utf-8"))
        self.assertEqual(state["status"], "ready")
        self.assertEqual(state["admitted"], 1)
        self.assertEqual(state["rejected_this_run"], 1)
        self.assertEqual([entry["id"] for entry in storage.recover()], ["met-2"])
        self.assertFalse(storage.path("records/met-1.json").exists())

    def test_dates_preserve_pixels_and_replace_stale_offsets(self):
        data = self.jpeg()
        first, capture, created, modified = dated_copy(data, "met-1")
        second, *_ = dated_copy(data, "met-1")
        self.assertEqual(first, second)
        self.assertEqual(decode(data), decode(first))
        self.assertLess(capture, created)
        self.assertLess(created, modified)
        exif = piexif.load(first)["Exif"]
        self.assertEqual(exif[0x9011], b"+08:00")
        self.assertNotIn(0x9291, exif)
        self.assertEqual(capture.utcoffset().total_seconds(), 8 * 3600)

    def test_individual_admission_and_seed_only_ids(self):
        with self.assertRaises(Rejected):
            admit({"objectID": 1, "isPublicDomain": False}, 1)
        seed = self.root / "seed"
        seed.mkdir()
        (seed / "manifest.json").write_text(json.dumps({"images": [
            {"id": "met-7", "file": "../../not-opened.jpg", "source_sha256": "untrusted"}
        ]}), "utf-8")
        result = list(seed_candidates(seed))
        self.assertEqual(result[0][0], 7)
        self.assertIn("candidate-id-only", result[0][1]["use"])
        self.assertFalse((self.root / "not-opened.jpg").exists())

    def test_commit_and_restore_validate_actual_files(self):
        entry = self.committed()
        self.assertEqual(len(self.storage.recover()), 1)
        path = self.storage.path(entry["file"])
        path.write_bytes(b"broken")
        with self.assertRaises(CollectionInconsistent):
            self.storage.recover()

    def test_interrupted_commit_recovers_published_image(self):
        original_write = self.storage.write_json
        def fail_record(path, value):
            if str(path).startswith("records/"):
                raise OSError("injected record write failure")
            original_write(path, value)
        with patch.object(self.storage, "write_json", side_effect=fail_record):
            with self.assertRaises(OSError):
                self.committed()
        restored = self.storage.recover()
        self.assertEqual(len(restored), 1)
        self.assertEqual(list((self.storage.root / "pending").glob("*.json")), [])

    def test_staged_write_failure_never_publishes_image(self):
        data = self.jpeg()
        entry = {"id": "met-1", "file": "images/艺术收藏/painting.jpg"}
        def fail_time(_):
            raise OSError("injected timestamp failure")
        with self.assertRaises(OSError):
            self.storage.commit(entry, {}, data, fail_time)
        self.assertFalse(self.storage.path(entry["file"]).exists())
        self.assertFalse(self.storage.path("staging/met-1.jpg").exists())

    def test_disk_budget_rejects_before_new_bytes(self):
        self.storage.disk_limit = self.storage.used + 10
        with self.assertRaises(BudgetExceeded):
            self.storage.write_bytes("payload.bin", b"x" * 11)
        self.assertFalse(self.storage.path("payload.bin").exists())
        self.assertEqual(list(self.storage.root.rglob("*.tmp")), [])

    def test_network_budget_is_persistent_and_counts_rejected_transfers(self):
        self.storage.network_limit = 5
        session = Session([Response(b"abc"), Response(b"def")])
        client = OfficialClient(self.storage, StopController(self.storage.root / "stop"), session, interval=0)
        self.assertEqual(client.fetch("https://images.metmuseum.org/a.jpg")[0], b"abc")
        with self.assertRaises(BudgetExceeded):
            client.fetch("https://images.metmuseum.org/b.jpg")
        self.assertEqual(self.storage.network_used, 3)
        restored = Storage(self.storage.root, 4 * 1024**2, 5)
        self.assertEqual(restored.network_used, 3)

    def test_unfinished_network_reservation_is_not_refunded_after_restart(self):
        self.storage.reserve_network(100)
        restored = Storage(self.storage.root, 4 * 1024**2, 1024**2)
        self.assertEqual(restored.network_used, 100)

    def test_denial_and_redirect_do_not_retry_or_follow(self):
        for response in (Response(status=403), Response(status=302)):
            session = Session([response])
            client = OfficialClient(self.storage, StopController(self.storage.root / "stop"), session, interval=0)
            with self.assertRaises(SourceDenied):
                client.fetch(f"https://images.metmuseum.org/{response.status_code}.jpg")
            self.assertEqual(session.calls, 1)

    def test_retry_after_and_stop_before_request(self):
        self.assertEqual(retry_after("120"), 120)
        self.assertEqual(retry_after("Fri, 27 Nov 2026 10:02:00 GMT",
                                    datetime(2026, 11, 27, 10, 0, tzinfo=UTC)), 120)
        stop = StopController(self.storage.root / "stop")
        stop.path.touch()
        session = Session([])
        with self.assertRaises(Stopped):
            OfficialClient(self.storage, stop, session).fetch("https://images.metmuseum.org/a.jpg")
        self.assertEqual(session.calls, 0)

    def test_unknown_length_download_stops_at_its_reserved_bytes(self):
        self.storage.network_limit = 5
        session = Session([Response(b"abcdefghij", headers={})])
        client = OfficialClient(self.storage, StopController(self.storage.root / "stop"), session, interval=0)
        with self.assertRaises(BudgetExceeded):
            client.fetch("https://images.metmuseum.org/a.jpg")
        self.assertEqual(self.storage.network_used, 5)

    def test_full_item_flow_records_official_bytes_and_chinese_folder(self):
        original = self.jpeg()
        original_hash = sha256(original)
        url = "https://images.metmuseum.org/a.jpg"
        class Client:
            def json(self, _):
                return {"objectID": 7, "isPublicDomain": True, "primaryImage": url,
                        "artistEndDate": "1900", "objectEndDate": 1880, "title": "River study"}, {
                            "fetched_at": "2026-11-27T10:00:00+00:00"}
            def fetch(self, _):
                return original, {"requested_url": url, "sha256": original_hash}
        stop = StopController(self.storage.root / "stop")
        entry = prepare_item(Client(), self.storage, stop, 7, "river", {"use": "candidate-only"}, set(), set())
        self.assertIn("/山川风景/", entry["file"])
        self.assertEqual(entry["source_sha256"], original_hash)
        self.assertEqual(sha256(original), original_hash)
        self.assertEqual(len(self.storage.recover()), 1)
        with self.assertRaises(Rejected):
            prepare_item(Client(), self.storage, stop, 7, "river", None, {original_hash}, set())

    def discovery_page(self, storage, topic, offset, ids):
        url = API + f"/v1.1/search?q={topic}&hasImages=true&limit=500&offset={offset}"
        storage.write_json(f"discovery/{topic}-{offset}.json", {
            "result": {"objectIDs": ids},
            "receipt": {"requested_url": url, "response_url": url},
        })

    def test_saved_discovery_reads_all_available_pages_without_requests(self):
        self.discovery_page(self.storage, "forest", 0, [1, 2])
        self.discovery_page(self.storage, "forest", 1000, [2, 3])
        client = Mock()
        client.json.side_effect = AssertionError("Cached discovery must not request missing pages")
        with patch("prepare_library.TOPICS", ("forest", "cat")):
            candidates = discover(client, self.storage, StopController(self.storage.root / "stop"), True)
        self.assertEqual(candidates, {1: "forest", 2: "forest", 3: "forest"})
        client.json.assert_not_called()

    def test_saved_discovery_requires_matching_official_receipt(self):
        self.discovery_page(self.storage, "forest", 0, [1])
        page = self.storage.read_json("discovery/forest-0.json")
        page["receipt"]["requested_url"] = "https://example.invalid/search"
        self.storage.write_json("discovery/forest-0.json", page)
        with patch("prepare_library.TOPICS", ("forest",)):
            with self.assertRaisesRegex(ValueError, "receipt"):
                discover(Mock(), self.storage, StopController(self.storage.root / "stop"), True)

    def test_discovery_page_survives_next_page_denial(self):
        first_url = API + "/v1.1/search?q=forest&hasImages=true&limit=500&offset=0"
        denied_url = API + "/v1.1/search?q=forest&hasImages=true&limit=500&offset=500"
        client = Mock()
        client.json.side_effect = [
            ({"objectIDs": list(range(1, 501))},
             {"requested_url": first_url, "response_url": first_url}),
            SourceDenied("HTTP 403", url=denied_url, http_status=403),
        ]
        stop = StopController(self.storage.root / "stop")
        with patch("prepare_library.TOPICS", ("forest",)):
            with self.assertRaises(SourceDenied):
                discover(client, self.storage, stop)
            self.assertEqual(self.storage.read_json("discovery/access-pause.json")["denied_url"], denied_url)
            offline = Mock()
            candidates = discover(offline, self.storage, stop, True)
            self.assertEqual(len(candidates), 500)
            offline.json.assert_not_called()
            with self.assertRaises(SourceDenied):
                discover(offline, self.storage, stop)
            offline.json.assert_not_called()

    def test_denied_url_is_not_requested_again_after_restart(self):
        url = "https://images.metmuseum.org/blocked.jpg"
        session = Session([Response(status=403)])
        stop = StopController(self.storage.root / "stop")
        client = OfficialClient(self.storage, stop, session, interval=0)
        with self.assertRaises(SourceDenied):
            client.fetch(url)
        self.assertEqual(session.calls, 1)
        restarted_session = Session([])
        restarted = OfficialClient(self.storage, stop, restarted_session, interval=0)
        with self.assertRaises(SourceDenied) as failure:
            restarted.fetch(url)
        self.assertEqual(failure.exception.url, url)
        self.assertEqual(failure.exception.http_status, 403)
        self.assertEqual(restarted_session.calls, 0)

    def test_legacy_discovery_denial_is_preserved_without_inventing_url(self):
        self.storage.write_json("status.json", {
            "status": "failed", "reason": "Official source denied access (HTTP 403); no bypass attempted",
            "updated": "2026-11-27T10:00:27+00:00",
        })
        preserve_discovery_pause(self.storage)
        self.storage.write_json("status.json", {"status": "downloading"})
        preserve_discovery_pause(self.storage)
        pause = self.storage.read_json("discovery/access-pause.json")
        self.assertIsNone(pause["denied_url"])
        self.assertEqual(pause["source_status_updated"], "2026-11-27T10:00:27+00:00")
        client = Mock()
        with self.assertRaises(SourceDenied):
            discover(client, self.storage, StopController(self.storage.root / "stop"))
        client.json.assert_not_called()

    def test_item_access_denial_stops_before_next_candidate(self):
        root = self.root / "collections" / "scope"
        storage = Storage(root, 4 * 1024**2, 1024**2)
        self.discovery_page(storage, "forest", 0, [1, 2])
        args = SimpleNamespace(collection="scope", seed=None, expand=False, cached_discovery=True,
                               limit=None, max_disk_gib=0.01, max_network_gib=0.01)
        denied = SourceDenied("HTTP 403", url=API + "/v1/objects/1", http_status=403)
        with patch("prepare_library.ROOT", self.root), patch("prepare_library.TOPICS", ("forest",)), \
                patch("prepare_library.OfficialClient") as client, \
                patch("prepare_library.prepare_item", side_effect=denied) as prepare:
            with self.assertRaises(SourceDenied):
                run(args)
            self.assertEqual(prepare.call_count, 1)
            client.return_value.json.assert_not_called()
        state = json.loads((root / "status.json").read_text("utf-8"))
        self.assertEqual(state["status"], "failed")
        self.assertEqual(state["admitted"], 0)

    def test_os_lock_releases_after_process_termination(self):
        directory = self.root / "locked"
        code = ("from pathlib import Path; import time; from library_storage import collection_lock\n"
                f"with collection_lock(Path({str(directory)!r})):\n"
                " print('LOCKED', flush=True)\n time.sleep(30)\n")
        child = subprocess.Popen([sys._base_executable, "-c", code], cwd=TOOLS, stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
        try:
            self.assertEqual(child.stdout.readline().strip(), "LOCKED")
            with self.assertRaises(RuntimeError):
                with collection_lock(directory):
                    pass
            child.terminate()
            child.wait(timeout=5)
            with collection_lock(directory):
                pass
        finally:
            if child.poll() is None:
                child.kill()
                child.wait(timeout=5)
            child.stdout.close()
            child.stderr.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
