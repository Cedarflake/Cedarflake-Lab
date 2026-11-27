"""Version-owned durable storage, byte budgets and interrupted-item recovery."""
import hashlib
import json
import msvcrt
import os
import shutil
import uuid
from contextlib import contextmanager
from pathlib import Path


class BudgetExceeded(RuntimeError):
    pass


class CollectionInconsistent(RuntimeError):
    pass


def sha256(data):
    return hashlib.sha256(data).hexdigest()


@contextmanager
def collection_lock(root):
    root.mkdir(parents=True, exist_ok=True)
    path = root / "prepare.lock"
    with path.open("a+b") as handle:
        if path.stat().st_size == 0:
            handle.write(b"\0")
            handle.flush()
        handle.seek(0)
        try:
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError as error:
            raise RuntimeError("This collection is already being prepared") from error
        try:
            yield
        finally:
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)


class Storage:
    FORMAT = "ame-studio-verified-library-v2"

    def __init__(self, root, disk_limit, network_limit):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.disk_limit = disk_limit
        self.network_limit = network_limit
        self.used = sum(p.stat().st_size for p in self.root.rglob("*") if p.is_file())
        ledger = self.root / "transfer-budget.json"
        self.network_used = json.loads(ledger.read_text("utf-8"))["charged_body_bytes"] if ledger.exists() else 0
        marker = self.root / "collection.json"
        if marker.exists():
            if json.loads(marker.read_text("utf-8")).get("format") != self.FORMAT:
                raise CollectionInconsistent("This is not a v2 collection; choose a new version")
        else:
            unknown = [p for p in self.root.iterdir() if p.name != "prepare.lock"]
            if unknown:
                raise CollectionInconsistent("New version directory must be empty")
            self.write_json("collection.json", {"format": self.FORMAT})
        if self.used > disk_limit or self.network_used > network_limit:
            raise BudgetExceeded("Existing collection usage exceeds the requested budget")

    def path(self, relative):
        candidate = self.root / relative
        resolved = candidate.resolve()
        if not resolved.is_relative_to(self.root) or resolved == self.root:
            raise CollectionInconsistent("Collection path escapes its version directory")
        # Reject links/junctions rather than treating them as version-owned files.
        for part in (candidate, *candidate.parents):
            if part == self.root.parent:
                break
            if part.is_symlink() or part.is_junction():
                raise CollectionInconsistent("Linked collection paths are not supported")
        return candidate

    def read_json(self, relative, default=None):
        path = self.path(relative)
        return json.loads(path.read_text("utf-8")) if path.exists() else default

    def write_json(self, relative, value):
        self.write_bytes(relative, (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))

    def write_bytes(self, relative, data):
        path = self.path(relative)
        if self.used + len(data) > self.disk_limit:
            raise BudgetExceeded("Collection disk budget exhausted before writing")
        if shutil.disk_usage(self.root).free < len(data) + 16 * 1024**2:
            raise BudgetExceeded("Insufficient free disk space for an atomic write")
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
        old_size = path.stat().st_size if path.exists() else 0
        try:
            with temporary.open("xb") as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, path)
            self.used += len(data) - old_size
        finally:
            if temporary.exists():
                temporary.unlink()

    def remove_owned(self, relative):
        path = self.path(relative)
        if path.exists():
            length = path.stat().st_size
            path.unlink()
            self.used -= length

    def reserve_network(self, amount):
        if amount <= 0 or self.network_used + amount > self.network_limit:
            raise BudgetExceeded("Network response-body budget exhausted")
        self.network_used += amount
        try:
            self.write_json("transfer-budget.json", {"charged_body_bytes": self.network_used})
        except BaseException:
            self.network_used -= amount
            raise

    def finish_network(self, reserved, consumed):
        # Reservations survive a crash; only a completed accounting step refunds unused bytes.
        self.network_used -= reserved - consumed
        self.write_json("transfer-budget.json", {"charged_body_bytes": self.network_used})

    def recover(self):
        for pending_path in sorted((self.root / "pending").glob("*.json")):
            pending = json.loads(pending_path.read_text("utf-8"))
            entry = pending["entry"]
            destination = self.path(entry["file"])
            stage = self.path(pending["stage"])
            evidence = self.path(entry["evidence_file"])
            if not evidence.exists() or sha256(evidence.read_bytes()) != entry["evidence_sha256"]:
                raise CollectionInconsistent(f"Evidence is missing or changed for {entry['id']}")
            candidate = destination if destination.exists() else stage
            if candidate.exists():
                if sha256(candidate.read_bytes()) != entry["sha256"]:
                    raise CollectionInconsistent(f"Interrupted image changed: {entry['id']}")
                if candidate == stage:
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    os.rename(stage, destination)
                self.write_json("records/" + entry["id"] + ".json", entry)
            # No final/staged image means the next run must fetch the item again.
            self.remove_owned(pending_path.relative_to(self.root))
        records = []
        ids, source_hashes, pixel_hashes, tracked = set(), set(), set(), set()
        for path in sorted((self.root / "records").glob("*.json")):
            entry = json.loads(path.read_text("utf-8"))
            image = self.path(entry["file"])
            evidence = self.path(entry["evidence_file"])
            if entry.get("format") != self.FORMAT or entry.get("source_kind") != "official-download":
                raise CollectionInconsistent(f"Unverified record format: {path.name}")
            if not image.is_file() or image.stat().st_size != entry["bytes"] or sha256(image.read_bytes()) != entry["sha256"]:
                raise CollectionInconsistent(f"Missing or changed image: {entry['id']}; use a new version or restore its verified bytes")
            if not evidence.is_file() or sha256(evidence.read_bytes()) != entry["evidence_sha256"]:
                raise CollectionInconsistent(f"Missing or changed source evidence: {entry['id']}")
            witness = json.loads(evidence.read_text("utf-8"))
            if (witness["object"]["isPublicDomain"] is not True
                    or f"met-{witness['object']['objectID']}" != entry["id"]
                    or witness["object"]["primaryImage"] != entry["image_url"]
                    or witness["image_response"]["requested_url"] != entry["image_url"]
                    or witness["image_response"]["sha256"] != entry["source_sha256"]):
                raise CollectionInconsistent(f"Source evidence disagrees with record: {entry['id']}")
            if entry["id"] in ids or entry["source_sha256"] in source_hashes or entry["pixel_sha256"] in pixel_hashes:
                raise CollectionInconsistent("Duplicate identity or source in committed records")
            ids.add(entry["id"])
            source_hashes.add(entry["source_sha256"])
            pixel_hashes.add(entry["pixel_sha256"])
            tracked.add(image.resolve())
            records.append(entry)
        for image in (self.root / "images").rglob("*"):
            if image.is_file() and image.resolve() not in tracked:
                raise CollectionInconsistent(f"Untracked image remains in this version: {image.name}")
        self.manifest(records)
        return records

    def commit(self, entry, witness, data, set_times):
        identity = entry["id"]
        stage = "staging/" + identity + ".jpg"
        destination = self.path(entry["file"])
        if destination.exists() or self.path("records/" + identity + ".json").exists():
            raise CollectionInconsistent("Refusing to overwrite an existing collection item")
        self.write_bytes(stage, data)
        try:
            set_times(self.path(stage))
            entry["evidence_file"] = "evidence/" + identity + ".json"
            self.write_json(entry["evidence_file"], witness)
            entry["evidence_sha256"] = sha256(self.path(entry["evidence_file"]).read_bytes())
            self.write_json("pending/" + identity + ".json", {"entry": entry, "stage": stage})
        except BaseException:
            self.remove_owned(stage)
            raise
        destination.parent.mkdir(parents=True, exist_ok=True)
        os.rename(self.path(stage), destination)
        self.write_json("records/" + identity + ".json", entry)
        self.remove_owned("pending/" + identity + ".json")
        return entry

    def manifest(self, records):
        self.write_json("manifest.json", {"format": self.FORMAT, "images": records})
