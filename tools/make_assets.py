"""Generate the original art and optimized photos for the gift site.

The moon is drawn from layered fractal noise and a synthetic crater heightmap,
so the project does not depend on any stock imagery. Photos are cropped and
graded, but never altered beyond colour, crop and grain.
"""
from __future__ import annotations

import glob
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
PHOTO_SRC = ROOT.parent / "our-little-world" / "public" / "photos" / "amal"
OUT = ROOT / "assets"
rng = np.random.default_rng(20261119)


def fractal_noise(size: int, octaves: int = 6, persistence: float = 0.55) -> np.ndarray:
    """Cheap, smooth value noise assembled from upscaled random grids."""
    total = np.zeros((size, size), dtype=np.float32)
    amplitude = 1.0
    norm = 0.0
    for octave in range(octaves):
        cells = max(2, int(2 ** (octave + 1)))
        grid = rng.random((cells, cells)).astype(np.float32)
        layer = np.asarray(
            Image.fromarray((grid * 255).astype(np.uint8)).resize(
                (size, size), Image.Resampling.BICUBIC
            ),
            dtype=np.float32,
        ) / 255.0
        total += layer * amplitude
        norm += amplitude
        amplitude *= persistence
    total /= norm
    return total


def add_crater(height: np.ndarray, cx: float, cy: float, radius: float, depth: float) -> None:
    """Carve one crater into the float heightmap (local patch, no full-frame cost)."""
    size = height.shape[0]
    pad = int(radius * 2.3) + 3
    x0, y0 = max(0, int(cx) - pad), max(0, int(cy) - pad)
    x1, y1 = min(size, int(cx) + pad), min(size, int(cy) + pad)
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    inside = d <= radius
    # Bowl.
    q = np.clip(d / radius, 0.0, 1.0)
    height[y0:y1, x0:x1] -= (depth * np.clip(1.0 - q * q, 0.0, 1.0) ** 1.35).astype(np.float32)
    # Raised rim.
    rim = np.exp(-(((d - radius * 0.94) / (radius * 0.18 + 0.7)) ** 2))
    height[y0:y1, x0:x1] += (depth * 0.55 * rim).astype(np.float32)
    # Central peak in larger craters.
    if radius > 16:
        peak = np.exp(-((d / (radius * 0.16 + 0.5)) ** 2))
        height[y0:y1, x0:x1] += (depth * 0.30 * peak).astype(np.float32)
    # A faint ejecta blanket lifts the immediate surroundings.
    ejecta = np.exp(-(((d - radius * 1.45) / (radius * 0.65 + 2.0)) ** 2))
    height[y0:y1, x0:x1] += (depth * 0.045 * ejecta).astype(np.float32)


def make_moon(size: int = 1200) -> Image.Image:
    lin = np.linspace(-1.0, 1.0, size, dtype=np.float32)
    x, y = np.meshgrid(lin, lin)
    rr = np.sqrt(x * x + y * y)
    inside = rr <= 1.0
    z = np.sqrt(np.clip(1.0 - rr * rr, 0.0, 1.0))

    broad = fractal_noise(size, octaves=5, persistence=0.62)
    fine = fractal_noise(size, octaves=8, persistence=0.48)
    micro = rng.normal(0, 1, (size, size)).astype(np.float32)
    micro = np.asarray(
        Image.fromarray(np.clip(micro * 32 + 128, 0, 255).astype(np.uint8)).filter(
            ImageFilter.GaussianBlur(0.6)
        ),
        dtype=np.float32,
    ) / 255.0 - 0.5

    # Large, soft maria.
    maria_field = np.asarray(
        Image.fromarray((broad * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(24)),
        dtype=np.float32,
    ) / 255.0
    maria_mix = np.clip((maria_field - 0.495) * 3.8, 0.0, 1.0) * 0.85
    # A few recognisable dark plains.
    for mx, my, sx, sy, strength in [
        (0.60, 0.25, 0.24, 0.15, 0.78),
        (0.37, 0.55, 0.27, 0.12, 0.66),
        (0.70, 0.63, 0.16, 0.11, 0.56),
        (0.46, 0.17, 0.13, 0.10, 0.46),
    ]:
        patch = np.exp(-(((x - (mx * 2 - 1)) / sx) ** 2 + ((y - (my * 2 - 1)) / sy) ** 2))
        maria_mix = np.maximum(maria_mix, patch * strength)

    # Crater heightmap.
    height = np.zeros((size, size), dtype=np.float32)
    # Old, large basins first.
    for _ in range(7):
        ang = rng.uniform(0, 2 * math.pi)
        rad = rng.uniform(0.0, 0.70)
        cx = size * (0.5 + math.cos(ang) * rad * 0.5)
        cy = size * (0.5 + math.sin(ang) * rad * 0.5)
        add_crater(height, cx, cy, rng.uniform(38, 92), rng.uniform(0.020, 0.042))
    # Medium and small craters.
    for _ in range(78):
        ang = rng.uniform(0, 2 * math.pi)
        rad = rng.uniform(0.0, 0.94) ** 0.62
        cx = size * (0.5 + math.cos(ang) * rad * 0.5)
        cy = size * (0.5 + math.sin(ang) * rad * 0.5)
        radius = rng.uniform(2.0, 28.0)
        add_crater(height, cx, cy, radius, rng.uniform(0.010, 0.030) * (radius / 28.0 + 0.5))
    # A hero crater with a bright ray system.
    add_crater(height, size * 0.63, size * 0.73, size * 0.036, 0.032)

    height = np.asarray(
        Image.fromarray(np.clip((height + 0.05) * 255 * 3.5, 0, 255).astype(np.uint8)).filter(
            ImageFilter.GaussianBlur(1.1)
        ),
        dtype=np.float32,
    )
    height = (height / 255.0 - 0.175) / 3.5

    # Shade the heightmap with light from the upper left. This gives craters
    # a bright inner wall and a dark opposite wall instead of flat rings.
    gy, gx = np.gradient(height)
    relief = -(gx * -0.62 + gy * -0.55) * 42.0
    relief = np.clip(relief, -0.22, 0.22)
    relief = np.asarray(
        Image.fromarray(np.clip((relief + 0.22) / 0.44 * 255, 0, 255).astype(np.uint8)).filter(
            ImageFilter.GaussianBlur(0.6)
        ),
        dtype=np.float32,
    ) / 255.0 * 0.44 - 0.22

    light = np.array([-0.38, -0.48, 0.79], dtype=np.float32)
    light /= np.linalg.norm(light)
    lambert = np.clip(x * light[0] + y * light[1] + z * light[2], 0.0, 1.0)
    base_shade = (1.0 - 0.38 * (rr ** 3.0)) * (0.78 + 0.25 * lambert)

    # Albedo: warm highlands, cooler maria, fine dusty variation.
    highland = np.array([242.0, 235.0, 218.0], dtype=np.float32)
    mare = np.array([119.0, 123.0, 131.0], dtype=np.float32)
    albedo = 0.93 + 0.075 * (fine - 0.5) + 0.04 * (broad - 0.5) + 0.018 * micro
    rgb = highland[None, None, :] * albedo[:, :, None]
    rgb = rgb * (1.0 - maria_mix[:, :, None]) + mare[None, None, :] * maria_mix[:, :, None]
    rgb *= (base_shade + relief)[:, :, None]

    # Soft ejecta rays from the hero crater.
    rays = Image.new("L", (size, size), 0)
    rd = ImageDraw.Draw(rays)
    hx, hy = size * 0.63, size * 0.73
    for i in range(11):
        ang = rng.uniform(0, 2 * math.pi)
        length = rng.uniform(0.05, 0.22) * size
        width = rng.uniform(0.001, 0.0035) * size
        rd.line(
            [
                hx + math.cos(ang) * size * 0.02,
                hy + math.sin(ang) * size * 0.02,
                hx + math.cos(ang) * length,
                hy + math.sin(ang) * length,
            ],
            fill=int(rng.uniform(12, 40)),
            width=max(1, int(width)),
        )
    rays = rays.filter(ImageFilter.GaussianBlur(4.0))
    r = np.asarray(rays, dtype=np.float32)[:, :, None] / 255.0
    rgb += np.array([255.0, 247.0, 228.0]) * r * 0.10

    # Subtle colour: cool shadows, warm highlights.
    rgb[:, :, 2] += 2.5 * (1.0 - lambert)
    rgb[:, :, 0] += 4.0 * (lambert ** 2)

    # Soft alpha edge (two pixels of antialiasing at 1200 px).
    alpha = np.clip((1.0 - rr) * size * 0.10, 0.0, 1.0) ** 0.80
    out = np.dstack([np.clip(rgb, 0, 255), alpha * 255.0]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def make_photos() -> None:
    photo_dir = OUT / "photos"
    photo_dir.mkdir(parents=True, exist_ok=True)
    selected = [
        (1, (0.5, 0.43), "you"),
        (4, (0.5, 0.47), "mine"),
        (24, (0.5, 0.44), "most"),
        (30, (0.5, 0.35), "home"),
        (52, (0.5, 0.45), "love"),
    ]
    for number, centering, slug in selected:
        matches = glob.glob(str(PHOTO_SRC / f"photo_{number}_*.jpg"))
        if not matches:
            raise FileNotFoundError(number)
        im = Image.open(matches[0]).convert("RGB")
        im = ImageOps.fit(im, (900, 1125), Image.Resampling.LANCZOS, centering=centering)

        im = ImageEnhance.Color(im).enhance(0.82)
        im = ImageEnhance.Contrast(im).enhance(1.035)
        im = ImageEnhance.Brightness(im).enhance(0.975)
        warm = Image.new("RGB", im.size, (214, 169, 132))
        im = Image.blend(im, warm, 0.055)

        w, h = im.size
        yy, xx = np.mgrid[0:h, 0:w]
        nx = (xx - w / 2) / (w / 2)
        ny = (yy - h / 2) / (h / 2)
        v = np.clip(1.0 - 0.16 * ((nx * nx * 0.65 + ny * ny) ** 1.25), 0.0, 1.0)
        arr = np.asarray(im, dtype=np.float32) * v[:, :, None]
        grain = rng.normal(0, 4.2, (h, w, 1)).astype(np.float32)
        arr = np.clip(arr + grain, 0, 255).astype(np.uint8)
        im = Image.fromarray(arr, "RGB")

        im.save(photo_dir / f"{slug}.jpg", "JPEG", quality=84, optimize=True, progressive=True)
        im.resize((450, 563), Image.Resampling.LANCZOS).save(
            photo_dir / f"{slug}-sm.jpg", "JPEG", quality=82, optimize=True, progressive=True
        )
        print("photo", slug, im.size)


def make_favicon() -> None:
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="15" fill="#070b16"/>
<circle cx="32" cy="32" r="17" fill="none" stroke="#e6c88f" stroke-opacity=".35"/>
<path d="M32 9l3.6 19.4L55 32l-19.4 3.6L32 55l-3.6-19.4L9 32l19.4-3.6z" fill="#f3dcae"/>
<circle cx="32" cy="32" r="4" fill="#070b16"/>
<circle cx="32" cy="32" r="1.6" fill="#f3dcae"/>
</svg>"""
    (ROOT / "favicon.svg").write_text(svg, encoding="utf-8")


def main() -> None:
    OUT.mkdir(exist_ok=True)
    moon = make_moon()
    moon.save(OUT / "moon.webp", "WEBP", quality=92, method=6)
    moon.resize((560, 560), Image.Resampling.LANCZOS).save(
        OUT / "moon-sm.webp", "WEBP", quality=90, method=6
    )
    print("moon", moon.size)
    make_photos()
    make_favicon()


if __name__ == "__main__":
    main()
