from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path

from PySide6.QtCore import QByteArray
from PySide6.QtGui import QFont, QFontDatabase
from texture_library import default_library_path

FONT_ID = re.compile(r"font-sha256:([a-f0-9]{64})\Z")
MAX_FONT_BYTES = 64 * 1024 * 1024
FONT_SIGNATURES = (b"\x00\x01\x00\x00", b"OTTO", b"ttcf", b"true")


@dataclass(frozen=True)
class FontAsset:
    id: str
    name: str
    path: Path


class FontLibrary:
    def __init__(self, root=None):
        self.root = Path(root) if root is not None else default_library_path().parent / "fonts"
        self.system_families = [
            family
            for family in QFontDatabase.families()
            if not QFontDatabase.isPrivateFamily(family)
        ]
        self._loaded = {}

    def default_family(self):
        if "Bauhaus 93" in self.system_families:
            return "Bauhaus 93"
        return self.system_families[0] if self.system_families else "Bauhaus 93"

    def asset(self, asset_id):
        match = FONT_ID.fullmatch(asset_id) if isinstance(asset_id, str) else None
        if not match:
            raise ValueError("方案中的字体编号无效。")
        digest = match.group(1)
        name = f"导入字体 {digest[:8]}"
        metadata = self.root / f"{digest}.json"
        if metadata.is_file():
            try:
                data = json.loads(metadata.read_text(encoding="utf-8"))
                if isinstance(data, dict) and isinstance(data.get("name"), str):
                    name = data["name"][:120]
            except (ValueError, OSError):
                pass
        return FontAsset(asset_id, name, self.root / f"{digest}.font")

    def assets(self):
        return [
            self.asset(f"font-sha256:{path.stem}")
            for path in sorted(self.root.glob("*.font"))
            if re.fullmatch(r"[a-f0-9]{64}", path.stem)
        ]

    def _read(self, path):
        if path.stat().st_size > MAX_FONT_BYTES:
            raise ValueError("字体文件超过 64 MB，请选择较小的字体文件。")
        content = path.read_bytes()
        if content[:4] not in FONT_SIGNATURES:
            raise ValueError("无法读取这个字体，请选择有效的 TTF、OTF 或 TTC 文件。")
        return content

    def _register(self, content, path=None):
        # Stable asset paths avoid reusing Qt's in-memory font identifiers across imports.
        font_id = (
            QFontDatabase.addApplicationFont(str(path))
            if path is not None
            else QFontDatabase.addApplicationFontFromData(QByteArray(content))
        )
        families = QFontDatabase.applicationFontFamilies(font_id) if font_id >= 0 else []
        if not families:
            if font_id >= 0:
                QFontDatabase.removeApplicationFont(font_id)
            raise ValueError("无法加载这个字体，请重新选择 TTF、OTF 或 TTC 文件。")
        return font_id, families

    def load(self, asset_id):
        asset = self.asset(asset_id)
        try:
            stat = asset.path.stat()
        except FileNotFoundError as error:
            raise FileNotFoundError("字体库里找不到这个字体，请重新导入或选择其他字体。") from error
        stamp = (stat.st_mtime_ns, stat.st_size)
        loaded = self._loaded.get(asset_id)
        if loaded is None or loaded[0] != stamp:
            content = self._read(asset.path)
            if hashlib.sha256(content).hexdigest() != asset_id.removeprefix("font-sha256:"):
                raise ValueError("字体库中的文件已改变，请重新导入这个字体。")
            font_id, families = self._register(content, asset.path)
            if loaded is not None:
                QFontDatabase.removeApplicationFont(loaded[1])
            self._loaded[asset_id] = (stamp, font_id, families)
        return list(self._loaded[asset_id][2])

    def import_font(self, source):
        source = Path(source)
        if source.suffix.lower() not in (".ttf", ".otf", ".ttc"):
            raise ValueError("请选择 TTF、OTF 或 TTC 字体文件。")
        content = self._read(source)
        digest = hashlib.sha256(content).hexdigest()
        asset_id = f"font-sha256:{digest}"
        font_id, _ = self._register(content)
        QFontDatabase.removeApplicationFont(font_id)
        self.root.mkdir(parents=True, exist_ok=True)
        path = self.root / f"{digest}.font"
        if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            self._write_atomic(path, content)
        metadata = self.root / f"{digest}.json"
        if not metadata.exists():
            self._write_atomic(
                metadata,
                json.dumps({"name": source.stem[:120]}, ensure_ascii=False).encode("utf-8"),
            )
        self.load(asset_id)
        return self.asset(asset_id)

    def resolve(self, asset_id, family, style, pixel_size, tracking):
        families = self.load(asset_id) if asset_id else self.system_families
        if family not in families:
            raise ValueError(f"未找到字体“{family}”，请导入该字体或重新选择。")
        if style not in QFontDatabase.styles(family):
            raise ValueError(f"未找到“{family}”的“{style}”字形，请重新选择字形。")
        font = QFontDatabase.font(family, style, 100)
        font.setPixelSize(round(pixel_size))
        font.setHintingPreference(QFont.PreferNoHinting)
        font.setLetterSpacing(QFont.AbsoluteSpacing, pixel_size * tracking / 100)
        return font

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

    def close(self):
        for _, font_id, _ in self._loaded.values():
            QFontDatabase.removeApplicationFont(font_id)
        self._loaded.clear()
