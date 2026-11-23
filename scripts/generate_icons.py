#!/usr/bin/env python3
"""Generate the PWA PNG icons from the same design as public/img/icon.svg."""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "img"
SIZE = 1024  # supersampled, resized down to 512/192
S = SIZE / 512


def gradient(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size))
    px = img.load()
    top = (11, 31, 58)
    bottom = (14, 107, 168)
    for y in range(size):
        for x in range(size):
            t = min(1.0, max(0.0, (x * 0.65 + y * 0.35) / size))
            px[x, y] = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return img


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def main() -> None:
    base = gradient(SIZE)
    mask = rounded_mask(SIZE, int(112 * S))
    icon = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    icon.paste(base, (0, 0), mask)

    draw = ImageDraw.Draw(icon)
    white = (255, 255, 255, 255)
    amber = (245, 165, 36, 255)
    width = int(22 * S)

    def pt(x: float, y: float) -> tuple[float, float]:
        return (x * S, y * S)

    # Hull
    hull = [pt(112, 286), pt(400, 286), pt(362, 382), pt(150, 382), pt(112, 286)]
    draw.line(hull, fill=white, width=width, joint="curve")
    # Deck
    draw.line([pt(160, 286), pt(160, 222), pt(352, 222), pt(352, 286)], fill=white, width=width, joint="curve")
    # Superstructure
    draw.line([pt(224, 222), pt(224, 176), pt(288, 176), pt(288, 222)], fill=white, width=width, joint="curve")
    # Mast
    draw.line([pt(256, 176), pt(256, 148)], fill=white, width=width)

    # Amber wave
    wave = []
    for i in range(0, 321):
        x = 96 + i
        y = 340 + 12 * math.sin((x - 96) / 56 * math.tau)
        wave.append(pt(x, y))
    draw.line(wave, fill=amber, width=int(20 * S), joint="curve")

    # Beacon
    r = int(16 * S)
    cx, cy = pt(256, 150)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=amber)

    for target in (512, 192):
        out = icon.resize((target, target), Image.LANCZOS)
        out.save(OUT / f"icon-{target}.png", optimize=True)
        print(f"wrote {OUT / f'icon-{target}.png'}")


if __name__ == "__main__":
    main()
