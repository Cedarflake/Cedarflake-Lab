"""Per-object admission, complete JPEG decoding and recorded date-only derivatives."""
import ctypes
import io
import random
import re
import struct
import warnings
from ctypes import wintypes
from datetime import timedelta, timezone, datetime

import piexif
from PIL import Image

from library_storage import sha256
from library_network import admitted_url

POLICY = "https://www.metmuseum.org/policies/frequently-asked-questions-image-and-data-resources"
CC0 = "https://creativecommons.org/publicdomain/zero/1.0/"
DEMO_ZONE = timezone(timedelta(hours=8))
MAX_PIXELS = 40_000_000
FOLDERS = {
    "landscape": "山川风景", "mountain": "山川风景", "river": "山川风景",
    "waterfall": "山川风景", "snow": "山川风景", "moon": "山川风景",
    "flowers": "花卉植物", "garden": "花卉植物", "tree": "花卉植物",
    "forest": "花卉植物", "plant": "花卉植物",
    "cat": "动物与鸟类", "bird": "动物与鸟类", "horse": "动物与鸟类",
    "fish": "动物与鸟类", "butterfly": "动物与鸟类",
    "architecture": "建筑街景", "village": "建筑街景",
    "sea": "海滨与舟船", "boat": "海滨与舟船",
    "fruit": "静物陈列", "still life": "静物陈列", "art": "艺术收藏",
}


class Rejected(ValueError):
    pass


def admit(record, object_id):
    if record.get("objectID") != object_id or record.get("isPublicDomain") is not True:
        raise Rejected("Object identity or individual public-domain status was not confirmed")
    url = record.get("primaryImage", "")
    if not admitted_url(url) or not url.startswith("https://images.metmuseum.org/"):
        raise Rejected("The object has no admitted official image")
    years = re.findall(r"(?<!\d)(1[0-9]{3}|20[0-9]{2})(?!\d)", str(record.get("artistEndDate") or ""))
    death = max(map(int, years), default=0)
    end = record.get("objectEndDate") or 0
    if (death and death > 1955) or (not death and end > 1850):
        raise Rejected("Object does not meet the collection's age filter")
    if re.search(r"nude|naked|erotic|advertisement|trade card|cigarette|trademark",
                 record.get("title", "").lower()):
        raise Rejected("Object does not meet the collection's content filter")


def decode(data):
    try:
        with warnings.catch_warnings():
            warnings.filterwarnings("error", message=r"Corrupt EXIF data\.", category=UserWarning)
            with Image.open(io.BytesIO(data)) as image:
                width, height = image.size
                if image.format != "JPEG" or width * height > MAX_PIXELS:
                    raise Rejected("Expected a JPEG within the 40-megapixel decode limit")
                if min(width, height) < 600 or max(width, height) < 1200:
                    raise Rejected("Image dimensions are too small")
                image.load()
                identity = f"{image.mode}:{width}:{height}:{image.getexif().get(274, 1)}:".encode()
                return width, height, sha256(identity + image.tobytes())
    except (OSError, SyntaxError, struct.error, Image.DecompressionBombError, UserWarning) as error:
        raise Rejected("Official JPEG pixels or EXIF could not be fully decoded") from error


def dated_copy(data, identity):
    rng = random.Random("ame-studio-dates-v2-" + identity)
    year = rng.choices(list(range(2017, 2027)), [2, 4, 5, 7, 5, 9, 11, 13, 16, 23])[0]
    month = rng.choices(list(range(1, 13)), [4, 4, 8, 11, 10, 13, 12, 11, 8, 10, 6, 3])[0]
    if year == 2026:
        month = min(month, 10)
    day = max(1, min(28, rng.choice([3, 9, 16, 24]) + rng.choice([-2, -1, 0, 0, 0, 1, 2, 3])))
    captured = datetime(year, month, day, rng.randrange(7, 21), rng.randrange(60),
                        rng.randrange(60), tzinfo=DEMO_ZONE)
    created = captured + timedelta(seconds=rng.randrange(3600, 74 * 3600))
    modified = created + timedelta(seconds=rng.randrange(160 * 3600))
    try:
        exif = piexif.load(data)
    except (ValueError, struct.error, IndexError) as error:
        raise Rejected("Official EXIF could not be fully parsed") from error
    stamp = lambda value: value.strftime("%Y:%m:%d %H:%M:%S").encode("ascii")
    exif["0th"][piexif.ImageIFD.DateTime] = stamp(modified)
    exif["Exif"][piexif.ExifIFD.DateTimeOriginal] = stamp(captured)
    exif["Exif"][piexif.ExifIFD.DateTimeDigitized] = stamp(captured)
    for tag in (0x9010, 0x9011, 0x9012):
        exif["Exif"][tag] = b"+08:00"
    for tag in (0x9290, 0x9291, 0x9292):
        exif["Exif"].pop(tag, None)
    exif["GPS"] = {}
    output = io.BytesIO()
    try:
        piexif.insert(piexif.dump(exif), data, output)
    except (ValueError, struct.error, IndexError) as error:
        raise Rejected("Official EXIF could not support the date-only derivative") from error
    return output.getvalue(), captured, created, modified


def file_times(path, created, modified):
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
                                  wintypes.LPVOID, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
    kernel.CreateFileW.restype = wintypes.HANDLE
    kernel.SetFileTime.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.FILETIME),
                                  ctypes.POINTER(wintypes.FILETIME), ctypes.POINTER(wintypes.FILETIME)]
    kernel.SetFileTime.restype = wintypes.BOOL
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.CloseHandle.restype = wintypes.BOOL
    def stamp(value):
        ticks = int(value.timestamp()) * 10_000_000 + 116444736000000000
        return wintypes.FILETIME(ticks & 0xffffffff, ticks >> 32)
    handle = kernel.CreateFileW(str(path), 0x100, 7, None, 3, 0x80, None)
    if handle == ctypes.c_void_p(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        c, m = stamp(created), stamp(modified)
        if not kernel.SetFileTime(handle, ctypes.byref(c), None, ctypes.byref(m)):
            raise ctypes.WinError(ctypes.get_last_error())
    finally:
        kernel.CloseHandle(handle)
