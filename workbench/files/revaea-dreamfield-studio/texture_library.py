from __future__ import annotations

import hashlib
import io
import json
import os
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, UnidentifiedImageError
from PySide6.QtCore import QStandardPaths

MAX_TEXTURE_BYTES = 32 * 1024 * 1024
MAX_TEXTURE_SIDE = 4096
IMPORTED_ID = re.compile(r"sha256:([a-f0-9]{64})\Z")
BUILTIN_ID = "builtin:watercolor"


@dataclass(frozen=True)
class TextureAsset:
    id: str
    name: str
    path: Path
    builtin: bool = False


def default_library_path():
    location = QStandardPaths.writableLocation(QStandardPaths.GenericDataLocation)
    if not location:
        raise OSError("无法确定 Studio 素材库的位置。")
    return Path(location) / "Cedarflake" / "DreamFieldStudio" / "materials"


def read_texture(path):
    path = Path(path)
    if path.stat().st_size > MAX_TEXTURE_BYTES:
        raise ValueError("纹理文件超过 32 MB，请选择较小的图片。")
    try:
        with Image.open(path) as image:
            if image.format not in ("PNG", "WEBP"):
                raise ValueError("请选择 PNG 或 WebP 纹理图片。")
            if max(image.size) > MAX_TEXTURE_SIDE:
                raise ValueError("纹理的宽和高最多为 4096 像素，请先缩小图片。")
            if getattr(image, "n_frames", 1) != 1:
                raise ValueError("请选择静态纹理图片。")
            return image.convert("RGBA")
    except (UnidentifiedImageError, Image.DecompressionBombError) as error:
        raise ValueError("无法读取这张纹理图片，请重新选择 PNG 或 WebP 文件。") from error


class TextureLibrary:
    def __init__(self, root=None):
        self.root = Path(root) if root is not None else default_library_path()
        self.builtin = TextureAsset(
            BUILTIN_ID,
            "水彩纹理",
            Path(__file__).parent / "assets" / "watercolor.webp",
            True,
        )
        self._cached = None

    def asset(self, asset_id):
        if asset_id == BUILTIN_ID:
            return self.builtin
        match = IMPORTED_ID.fullmatch(asset_id) if isinstance(asset_id, str) else None
        if not match:
            raise ValueError("方案中的纹理编号无效。")
        digest = match.group(1)
        path = self.root / f"{digest}.png"
        name = f"导入纹理 {digest[:8]}"
        metadata = self.root / f"{digest}.json"
        if metadata.is_file():
            try:
                data = json.loads(metadata.read_text(encoding="utf-8"))
                if isinstance(data, dict) and isinstance(data.get("name"), str):
                    name = data["name"][:120]
            except (ValueError, OSError):
                pass
        return TextureAsset(asset_id, name, path)

    def assets(self):
        result = [self.builtin]
        if self.root.exists():
            for path in sorted(self.root.glob("*.png")):
                if re.fullmatch(r"[a-f0-9]{64}", path.stem):
                    result.append(self.asset(f"sha256:{path.stem}"))
        return result

    def load(self, asset_id):
        asset = self.asset(asset_id)
        try:
            stat = asset.path.stat()
        except FileNotFoundError as error:
            raise FileNotFoundError("素材库里找不到这张纹理，请重新导入或选择其他材质。") from error
        if stat.st_size > MAX_TEXTURE_BYTES:
            raise ValueError("素材库中的纹理超过 32 MB，请重新导入较小的图片。")
        key = (asset.id, stat.st_mtime_ns, stat.st_size)
        if self._cached is None or self._cached[0] != key:
            if not asset.builtin and hashlib.sha256(
                asset.path.read_bytes()
            ).hexdigest() != asset.id.removeprefix("sha256:"):
                raise ValueError("素材库中的纹理已改变，请重新导入或选择其他材质。")
            image = read_texture(asset.path)
            self._cached = (key, image)
        return self._cached[1]

    def import_texture(self, source):
        source = Path(source)
        image = read_texture(source)
        normalized = Image.new("RGBA", image.size)
        normalized.paste(image)
        buffer = io.BytesIO()
        normalized.save(buffer, "PNG")
        content = buffer.getvalue()
        if len(content) > MAX_TEXTURE_BYTES:
            raise ValueError("纹理存入素材库后超过 32 MB，请先缩小图片。")
        digest = hashlib.sha256(content).hexdigest()
        asset_id = f"sha256:{digest}"
        self.root.mkdir(parents=True, exist_ok=True)
        path = self.root / f"{digest}.png"
        if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            self._write_atomic(path, content)
        metadata = self.root / f"{digest}.json"
        if not metadata.exists():
            self._write_atomic(
                metadata,
                json.dumps({"name": source.stem[:120]}, ensure_ascii=False).encode("utf-8"),
            )
        self._cached = None
        return self.asset(asset_id)

    def _write_atomic(self, path, content):
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(
                dir=self.root, prefix=".import-", delete=False
            ) as file:
                temporary = Path(file.name)
                file.write(content)
                file.flush()
                os.fsync(file.fileno())
            os.replace(temporary, path)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
