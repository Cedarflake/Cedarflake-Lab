# /// script
# requires-python = ">=3.12"
# dependencies = ["pillow==12.2.0", "piexif==1.1.3", "requests==2.32.5"]
# ///
"""Prepare a separately versioned collection from individually admitted official images."""
import argparse
import json
import re
import signal
import sys
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlencode

from library_media import CC0, FOLDERS, POLICY, Rejected, admit, dated_copy, decode, file_times
from library_network import OfficialClient, SourceDenied, StopController, Stopped
from library_storage import BudgetExceeded, Storage, collection_lock, sha256

ROOT = Path(__file__).resolve().parents[1]
API = "https://collectionapi.metmuseum.org/public/collection"
TOPICS = tuple(topic for topic in FOLDERS if topic != "art")


def seed_candidates(directory):
    path = directory / "sources.json"
    if not path.exists():
        path = directory / "manifest.json"
    document = json.loads(path.read_text("utf-8-sig"))
    for entry in document["images"]:
        value = entry.get("object_id")
        if value is None:
            match = re.fullmatch(r"met-([0-9]+)", entry.get("id", ""))
            if not match:
                raise ValueError("Seed entry lacks a valid Met object identity")
            value = int(match[1])
        if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
            raise ValueError("Seed object identity must be a positive integer")
        # Seed entries nominate candidates only. Their image files are never opened.
        yield value, {"manifest": path.name, "entry": entry,
                      "use": "candidate-id-only; not source or rights verification"}


def preserve_discovery_pause(storage):
    previous = storage.read_json("status.json", {})
    reason = previous.get("reason") or ""
    if (previous.get("status") == "failed" and re.search(r"HTTP (401|403)", reason)
            and not storage.read_json("issues.json", {})
            and storage.read_json("discovery/access-pause.json") is None):
        storage.write_json("discovery/access-pause.json", {
            "reason": reason, "source_status_updated": previous.get("updated"),
            "denied_url": None,
            "note": "Legacy discovery denial did not record its URL; do not infer a verified URL",
        })


def discover(client, storage, stop, cached_only=False):
    if not cached_only and storage.read_json("discovery/access-pause.json") is not None:
        raise SourceDenied("Discovery is paused after an access denial; use --cached-discovery. "
                           "No search request was sent")
    candidates = {}
    pages = 0
    for topic in TOPICS:
        topic_pages = 0
        for offset in range(0, 5000, 500):
            stop.check()
            path = f"discovery/{topic.replace(' ', '-')}-{offset}.json"
            url = API + "/v1.1/search?" + urlencode(
                {"q": topic, "hasImages": "true", "limit": 500, "offset": offset})
            cached = storage.read_json(path)
            if cached is None:
                if cached_only:
                    continue
                try:
                    result, receipt = client.json(url)
                except SourceDenied as error:
                    if error.http_status in (401, 403):
                        storage.write_json("discovery/access-pause.json", {
                            "reason": str(error), "denied_url": error.url,
                            "http_status": error.http_status, "at": datetime.now(UTC).isoformat(),
                        })
                    raise
                cached = {"result": result, "receipt": receipt}
                storage.write_json(path, cached)
            receipt = cached.get("receipt", {})
            if receipt.get("requested_url") != url or receipt.get("response_url") != url:
                raise ValueError(f"Saved discovery receipt does not match its official query: {path}")
            ids = cached["result"].get("objectIDs") or []
            if not isinstance(ids, list):
                raise ValueError("Official search object identities must be a list")
            for object_id in ids:
                if not isinstance(object_id, int) or isinstance(object_id, bool) or object_id <= 0:
                    raise ValueError("Official search returned an invalid object identity")
                candidates.setdefault(object_id, topic)
            pages += 1
            topic_pages += 1
            if not cached_only and len(ids) < 500:
                break
        if topic_pages:
            print("DISCOVERY_CACHE" if cached_only else "DISCOVERY",
                  topic, "pages", topic_pages, "unique_candidates", len(candidates), flush=True)
    if cached_only and not pages:
        raise ValueError("No saved official discovery pages are available")
    return candidates


def prepare_item(client, storage, stop, object_id, topic, seed_hint, source_hashes, pixel_hashes):
    identity = f"met-{object_id}"
    record, metadata_receipt = client.json(API + "/v1/objects/" + str(object_id))
    admit(record, object_id)
    if topic is None:
        title = record.get("title", "").lower()
        topic = next((value for value in TOPICS if value in title), "art")
    data, image_receipt = client.fetch(record["primaryImage"])
    source_hash = sha256(data)
    if source_hash in source_hashes:
        raise Rejected("Exact official source already exists in this collection")
    try:
        width, height, pixel_hash = decode(data)
    except OSError as error:
        raise Rejected("Official JPEG could not be fully decoded") from error
    if pixel_hash in pixel_hashes:
        raise Rejected("Same decoded image already exists in this collection")
    dated, captured, created, modified = dated_copy(data, identity)
    if decode(dated) != (width, height, pixel_hash):
        raise ValueError("Date-only transformation changed image pixels")
    stop.check()
    slug = re.sub(r"[^\w-]+", "-", record.get("title", "image"), flags=re.UNICODE).strip("-")[:68] or "image"
    entry = {
        "format": storage.FORMAT, "id": identity,
        "file": f"images/{FOLDERS[topic]}/{slug}-{identity}.jpg",
        "title": record.get("title"), "artist": record.get("artistDisplayName"),
        "source_url": record.get("objectURL"), "image_url": record["primaryImage"],
        "license": "CC0-1.0", "license_url": CC0, "policy_url": POLICY,
        "public_domain": True, "verified_at": metadata_receipt["fetched_at"],
        "topic": topic, "width": width, "height": height, "bytes": len(dated),
        "source_sha256": source_hash, "sha256": sha256(dated), "pixel_sha256": pixel_hash,
        "source_kind": "official-download",
        "derivation": {"operation": "exif-dates-and-filesystem-times-v2",
                       "source_sha256": source_hash, "pixels_unchanged": True,
                       "timezone": "+08:00", "exif_gps_removed": True},
        "dates": {"captured": captured.isoformat(), "created": created.isoformat(),
                  "modified": modified.isoformat()},
    }
    witness = {"object": record, "object_response": metadata_receipt,
               "image_response": image_receipt, "seed_candidate": seed_hint}
    def set_dates(path):
        file_times(path, created, modified)
        stat = path.stat()
        if abs(stat.st_birthtime - created.timestamp()) > 1 or abs(stat.st_mtime - modified.timestamp()) > 1:
            raise ValueError("Filesystem times did not match the staged record")
    return storage.commit(entry, witness, dated, set_dates)


def run(args):
    if not re.fullmatch(r"[\w-]{1,64}", args.collection, re.UNICODE):
        raise ValueError("Collection name must contain only letters, numbers, underscore or hyphen")
    collections_root = ROOT / "collections"
    if collections_root.is_symlink() or collections_root.is_junction():
        raise ValueError("Collections parent cannot be a link or junction")
    version_root = collections_root / args.collection
    if version_root.is_symlink() or version_root.is_junction():
        raise ValueError("Collection root cannot be a link or junction")
    stop = StopController(version_root / "stop")
    previous_signal = signal.signal(signal.SIGINT, stop.request)
    try:
        with collection_lock(version_root):
            storage = Storage(version_root, int(args.max_disk_gib * 1024**3),
                              int(args.max_network_gib * 1024**3))
            records = storage.recover()
            known = {item["id"] for item in records}
            source_hashes = {item["source_sha256"] for item in records}
            pixel_hashes = {item["pixel_sha256"] for item in records}
            issues = storage.read_json("issues.json", {})
            preserve_discovery_pause(storage)
            rejected = 0
            client = OfficialClient(storage, stop)
            def status(state, reason=None):
                storage.write_json("status.json", {
                    "status": state, "admitted": len(records),
                    "candidate_scope": "saved-discovery-pages" if args.cached_discovery else "requested-inputs",
                    "image_bytes": sum(item["bytes"] for item in records),
                    "disk_bytes": storage.used, "charged_network_body_bytes": storage.network_used,
                    "unresolved_failures": len(issues), "rejected_this_run": rejected,
                    "reason": reason, "updated": datetime.now(UTC).isoformat(),
                })
            state, reason = "ready", None
            status("verifying")
            try:
                stop.check()
                candidates, hints = {}, {}
                if args.seed:
                    for object_id, hint in seed_candidates(args.seed.resolve()):
                        stop.check()
                        candidates.setdefault(object_id, None)
                        hints[object_id] = hint
                if args.expand or args.cached_discovery:
                    for object_id, topic in discover(client, storage, stop, args.cached_discovery).items():
                        candidates.setdefault(object_id, topic)
                status("downloading")
                for object_id, topic in candidates.items():
                    stop.check()
                    identity = f"met-{object_id}"
                    if identity in known:
                        issues.pop(identity, None)
                        continue
                    if args.limit is not None and len(records) >= args.limit:
                        state, reason = "partial", "Explicit item limit reached"
                        break
                    try:
                        entry = prepare_item(client, storage, stop, object_id, topic,
                                             hints.get(object_id), source_hashes, pixel_hashes)
                    except Rejected as error:
                        rejected += 1
                        issues.pop(identity, None)
                        print("REJECTED", identity, str(error), flush=True)
                        continue
                    except (Stopped, BudgetExceeded):
                        raise
                    except SourceDenied as error:
                        issues[identity] = {"message": str(error), "url": error.url,
                                            "http_status": error.http_status,
                                            "at": datetime.now(UTC).isoformat()}
                        storage.write_json("issues.json", issues)
                        print("FAILED", identity, str(error), flush=True)
                        if error.http_status in (401, 403):
                            raise
                        continue
                    records.append(entry)
                    known.add(entry["id"])
                    source_hashes.add(entry["source_sha256"])
                    pixel_hashes.add(entry["pixel_sha256"])
                    issues.pop(identity, None)
                    storage.write_json("issues.json", issues)
                    status("downloading")
                    print("ADMITTED", identity, entry["title"], flush=True)
                if issues:
                    state, reason = "partial", "Some official sources or local writes failed; see issues.json"
            except Stopped as error:
                state, reason = "stopped", str(error)
            except BudgetExceeded as error:
                state, reason = "partial", str(error)
            except Exception as error:
                state, reason = "failed", str(error)
                raise
            finally:
                client.close()
                storage.manifest(records)
                storage.write_json("issues.json", issues)
                status(state, reason)
            print("FINISHED", len(records), state, flush=True)
            return 0 if state == "ready" else 2
    finally:
        signal.signal(signal.SIGINT, previous_signal)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collection", required=True, help="New/resumable version under collections; never the old library")
    parser.add_argument("--seed", type=Path, help="Read only candidate IDs from sources.json or manifest.json")
    discovery = parser.add_mutually_exclusive_group()
    discovery.add_argument("--expand", action="store_true", help="Fetch missing official search pages")
    discovery.add_argument("--cached-discovery", action="store_true",
                           help="Use saved official search pages only; object/image downloads remain enabled")
    parser.add_argument("--limit", type=int, help="Optional explicit maximum committed items")
    parser.add_argument("--workers", type=int, choices=(1,), default=1, help="Serial owner enforces shared budgets and cooldown")
    parser.add_argument("--max-disk-gib", type=float, default=35)
    parser.add_argument("--max-network-gib", type=float, default=40)
    args = parser.parse_args()
    if not (args.seed or args.expand or args.cached_discovery):
        parser.error("Choose --seed, --expand, and/or --cached-discovery")
    if not (0 < args.max_disk_gib <= 1024 and 0 < args.max_network_gib <= 1024):
        parser.error("Budgets must be positive and at most 1024 GiB")
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be positive")
    try:
        return run(args)
    except Exception as error:
        print("FAILED", str(error), file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
