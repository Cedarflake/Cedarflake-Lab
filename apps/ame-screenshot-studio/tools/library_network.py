"""Serial, stoppable official-source requests with persistent body-byte accounting."""
import json
import threading
import time
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from urllib.parse import urlsplit

import requests
from urllib3.exceptions import HTTPError as TransportError

from library_storage import BudgetExceeded, sha256

HOSTS = {"collectionapi.metmuseum.org", "images.metmuseum.org"}


class Stopped(RuntimeError):
    pass


class SourceDenied(RuntimeError):
    def __init__(self, message, *, url=None, http_status=None):
        super().__init__(message)
        self.url = url
        self.http_status = http_status


class StopController:
    def __init__(self, stop_file):
        self.path = stop_file
        self.event = threading.Event()

    def request(self, *_):
        self.event.set()

    def check(self):
        if self.event.is_set() or self.path.exists():
            raise Stopped("Preparation stopped before the next commit")

    def wait(self, seconds):
        until = time.monotonic() + max(0, seconds)
        while True:
            self.check()
            remaining = until - time.monotonic()
            if remaining <= 0:
                return
            self.event.wait(min(0.1, remaining))


def admitted_url(url):
    parsed = urlsplit(url)
    return (parsed.scheme == "https" and parsed.hostname in HOSTS
            and parsed.username is None and parsed.password is None
            and parsed.port in (None, 443))


def retry_after(value, now=None):
    try:
        return max(0, float(value))
    except (TypeError, ValueError):
        try:
            date = parsedate_to_datetime(value)
            if date.tzinfo is None:
                date = date.replace(tzinfo=UTC)
            return max(0, (date - (now or datetime.now(UTC))).total_seconds())
        except (TypeError, ValueError, OverflowError):
            return 5


class OfficialClient:
    def __init__(self, storage, stop, session=None, interval=0.5):
        self.storage = storage
        self.stop = stop
        self.session = session or requests.Session()
        self.session.headers.update({
            "User-Agent": "AmeScreenshotStudio/0.2 (Open Access collection)",
            "Accept-Encoding": "identity",
        })
        self.interval = interval
        self.next_request = 0
        self.denied_urls = storage.read_json("denied-urls.json", {})

    def close(self):
        self.session.close()

    def fetch(self, url, limit=32 * 1024**2):
        self.stop.check()
        if url in self.denied_urls:
            denied = self.denied_urls[url]
            raise SourceDenied(f"Previously denied official URL remains blocked; no request sent: {url}",
                               url=url, http_status=denied["http_status"])
        if not admitted_url(url):
            raise SourceDenied("Source URL is not an admitted official HTTPS host")
        for attempt in range(3):
            self.stop.wait(self.next_request - time.monotonic())
            self.next_request = time.monotonic() + self.interval
            try:
                with self.session.get(url, stream=True, allow_redirects=False, timeout=(5, 5)) as response:
                    code = response.status_code
                    if code in (401, 403):
                        self.denied_urls[url] = {"http_status": code, "at": datetime.now(UTC).isoformat()}
                        try:
                            self.storage.write_json("denied-urls.json", self.denied_urls)
                        except OSError as error:
                            raise RuntimeError("Could not persist source denial; stopped without retry") from error
                        raise SourceDenied(f"Official source denied access (HTTP {code}); no bypass attempted: {url}",
                                           url=url, http_status=code)
                    if 300 <= code < 400:
                        raise SourceDenied("Source redirected; redirect target requires explicit review")
                    if code in (429, 503):
                        delay = retry_after(response.headers.get("Retry-After", "5"))
                        self.next_request = max(self.next_request, time.monotonic() + delay)
                        if attempt == 2:
                            raise SourceDenied(f"Official source remains unavailable (HTTP {code})")
                        continue
                    response.raise_for_status()
                    if response.headers.get("Content-Encoding", "identity").lower() not in ("identity", ""):
                        raise SourceDenied("Compressed HTTP transfer was not requested")
                    text_length = response.headers.get("Content-Length")
                    length = int(text_length) if text_length is not None else None
                    if length is not None and (length < 0 or length > limit):
                        raise ValueError("Response exceeds the admitted per-file size")
                    available = self.storage.network_limit - self.storage.network_used
                    reserved = length if length is not None else min(limit, available)
                    self.storage.reserve_network(reserved)
                    data = bytearray()
                    try:
                        while len(data) < reserved:
                            self.stop.check()
                            chunk = response.raw.read(min(65536, reserved - len(data)), decode_content=False)
                            if not chunk:
                                break
                            data.extend(chunk)
                        if length is not None and len(data) != length:
                            raise requests.exceptions.ChunkedEncodingError("Incomplete response body")
                        if length is None and len(data) == reserved:
                            raise BudgetExceeded("Unknown-length response reached its reserved bound")
                    finally:
                        self.storage.finish_network(reserved, len(data))
                    self.stop.check()
                    return bytes(data), {
                        "requested_url": url, "response_url": response.url,
                        "fetched_at": datetime.now(UTC).isoformat(),
                        "sha256": sha256(data), "bytes": len(data),
                        "etag": response.headers.get("ETag"),
                        "last_modified": response.headers.get("Last-Modified"),
                    }
            except requests.HTTPError as error:
                if error.response is not None and error.response.status_code < 500:
                    raise SourceDenied(f"Official source returned HTTP {error.response.status_code}") from error
                if attempt == 2:
                    raise SourceDenied("Official request failed after bounded retries") from error
                self.stop.wait(attempt + 1)
            except (requests.RequestException, TransportError, OSError) as error:
                if attempt == 2:
                    raise SourceDenied("Official request failed after bounded retries") from error
                self.stop.wait(attempt + 1)
        raise SourceDenied("Official request could not complete")

    def json(self, url):
        data, receipt = self.fetch(url, limit=4 * 1024**2)
        return json.loads(data), receipt
