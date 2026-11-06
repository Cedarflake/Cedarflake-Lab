from __future__ import annotations

import base64
import io
import random
from functools import lru_cache

import numpy as np
from PIL import Image
from PySide6.QtCore import QRectF, Qt
from PySide6.QtGui import QImage, QPainter
from PySide6.QtSvg import QSvgRenderer


@lru_cache(maxsize=6)
def render_svg(svg, size):
    width, height = (size, size) if isinstance(size, int) else size
    image = QImage(width, height, QImage.Format_RGBA8888)
    image.fill(Qt.transparent)
    painter = QPainter(image)
    painter.setRenderHint(QPainter.Antialiasing)
    try:
        renderer = QSvgRenderer(svg.encode("utf-8"))
        if not renderer.isValid():
            raise ValueError("无法渲染图标。")
        renderer.render(painter, QRectF(0, 0, width, height))
    finally:
        painter.end()
    return Image.frombuffer(
        "RGBA", (width, height), bytes(image.constBits()), "raw", "RGBA", image.bytesPerLine(), 1
    ).copy()


def sample_channel(pixels, x, y, channel, repeat=False):
    height, width = pixels.shape[:2]
    if repeat:
        x = np.mod(x, width)
        y = np.mod(y, height)
    else:
        x = np.clip(x, 0, width - 1)
        y = np.clip(y, 0, height - 1)
    floor_x, floor_y = np.floor(x), np.floor(y)
    fx, fy = x - floor_x, y - floor_y
    x0, y0 = floor_x.astype(np.int32), floor_y.astype(np.int32)
    x1 = (x0 + 1) % width if repeat else np.minimum(x0 + 1, width - 1)
    y1 = (y0 + 1) % height if repeat else np.minimum(y0 + 1, height - 1)
    top = pixels[y0, x0, channel] * (1 - fx) + pixels[y0, x1, channel] * fx
    bottom = pixels[y1, x0, channel] * (1 - fx) + pixels[y1, x1, channel] * fx
    return top * (1 - fy) + bottom * fy


def apply_texture(original, field, texture, strength, scale, seed, optical_scale=1.0):
    if strength <= 0:
        return original.copy()
    source = np.asarray(field)
    if texture.getchannel("A").getextrema()[1] == 0:
        return original.copy()
    texture = texture.copy()
    limit = max(1, round(max(original.size) * scale))
    texture.thumbnail((limit, limit), Image.Resampling.LANCZOS)
    # Transparent pixels contribute no displacement, regardless of hidden RGB.
    neutral = Image.new("RGBA", texture.size, (128, 128, 128, 255))
    neutral.alpha_composite(texture)
    if neutral.getextrema()[:2] == ((128, 128), (128, 128)):
        return original.copy()
    texture_pixels = np.asarray(neutral)
    result = np.array(original)
    height, width = result.shape[:2]
    texture_height, texture_width = texture_pixels.shape[:2]
    rng = random.Random(seed)
    shift_x, shift_y = rng.random(), rng.random()
    x = ((np.arange(width, dtype=np.float32) + 0.5) / width - 0.5) / optical_scale + 0.5
    x = x[None, :]
    for start in range(0, height, 96):
        stop = min(height, start + 96)
        y = ((np.arange(start, stop, dtype=np.float32) + 0.5) / height - 0.5) / optical_scale + 0.5
        y = y[:, None]
        tx = (x / scale + shift_x) * texture_width
        ty = (y / scale + shift_y) * texture_height
        red = sample_channel(texture_pixels, tx, ty, 0, repeat=True)
        green = sample_channel(texture_pixels, tx + texture_width * 0.861, -ty, 1, repeat=True)
        displacement = float(strength) * 0.18 / 255
        sample_x = (x + (red - 128) * displacement) * width - 0.5
        sample_y = (y + (green - 128) * displacement) * height - 0.5
        for channel in range(3):
            values = sample_channel(source, sample_x, sample_y, channel)
            result[start:stop, :, channel] = np.clip(np.rint(values), 0, 255).astype(np.uint8)
    result[result[..., 3] == 0, :3] = 0
    return Image.fromarray(result)


def image_to_qimage(image):
    rgba = image.convert("RGBA")
    return QImage(rgba.tobytes(), rgba.width, rgba.height, QImage.Format_RGBA8888).copy()


def rendered_svg(image):
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
 width="{image.width}" height="{image.height}" viewBox="0 0 {image.width} {image.height}">
 <title>Revaea Dream Field</title>
 <desc>Rendered artwork with image-driven material.</desc>
 <image width="{image.width}" height="{image.height}" xlink:href="data:image/png;base64,{encoded}"/>
</svg>'''
