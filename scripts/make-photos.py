"""Generates test photos with known EXIF metadata.

- tests/fixtures/photos/: tiny JPEG/HEIC files matching tests/fixtures/simple.gpx (committed).
- tmp/sample-photos/: 24 full-resolution (12 MP) photos along public/samples/sample-hike.gpx,
  for checking placement and quality in the browser (gitignored, ~60 MB).

Every photo is synthetic: a colour gradient with its number and true position printed on it.

Run with: pnpm sample:photos
(uv run --no-project --with pillow --with piexif --with pillow-heif python scripts/make-photos.py)
"""

import json
import random
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import piexif
import pillow_heif
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
pillow_heif.register_heif_opener()


def rational(value: float, denominator: int = 1_000_000):
    return (int(round(value * denominator)), denominator)


def dms(deg: float):
    deg = abs(deg)
    d = int(deg)
    m = int((deg - d) * 60)
    s = (deg - d - m / 60) * 3600
    return (rational(d, 1), rational(m, 1), rational(s, 10_000))


def exif_bytes(local: datetime | None, offset: str | None, lat: float | None, lon: float | None,
               orientation: int = 1, ele: float | None = None) -> bytes:
    zeroth = {piexif.ImageIFD.Orientation: orientation, piexif.ImageIFD.Make: b"OpenFlyover",
              piexif.ImageIFD.Model: b"Synthetic test camera"}
    exif = {}
    if local is not None:
        exif[piexif.ExifIFD.DateTimeOriginal] = local.strftime("%Y:%m:%d %H:%M:%S").encode()
        if offset is not None:
            exif[piexif.ExifIFD.OffsetTimeOriginal] = offset.encode()
    gps = {}
    if lat is not None and lon is not None:
        gps = {
            piexif.GPSIFD.GPSLatitudeRef: b"N" if lat >= 0 else b"S",
            piexif.GPSIFD.GPSLatitude: dms(lat),
            piexif.GPSIFD.GPSLongitudeRef: b"E" if lon >= 0 else b"W",
            piexif.GPSIFD.GPSLongitude: dms(lon),
        }
        if ele is not None:
            gps[piexif.GPSIFD.GPSAltitudeRef] = 0
            gps[piexif.GPSIFD.GPSAltitude] = rational(ele, 100)
    return piexif.dump({"0th": zeroth, "Exif": exif, "GPS": gps})


def picture(width: int, height: int, hue: int, lines: list[str]) -> Image.Image:
    """A gradient with large text, so blur, scaling and orientation are easy to see."""
    img = Image.new("HSV", (width, height))
    px = img.load()
    for y in range(0, height, 4):
        for x in range(0, width, 4):
            h = (hue + x * 40 // width) % 256
            v = 140 + 100 * y // height
            for dy in range(4):
                for dx in range(4):
                    if x + dx < width and y + dy < height:
                        px[x + dx, y + dy] = (h, 170, v)
    img = img.convert("RGB")
    draw = ImageDraw.Draw(img)
    size = max(12, min(width, height) // 9)
    try:
        font = ImageFont.truetype("arial.ttf", size)
        small = ImageFont.truetype("arial.ttf", size // 3)
    except OSError:
        font = small = ImageFont.load_default()
    draw.text((width // 20, height // 20), lines[0], fill="white", font=font)
    for i, line in enumerate(lines[1:]):
        draw.text((width // 20, height // 20 + size * 1.3 + i * size // 2.4), line, fill="white",
                  font=small)
    # Fine checkerboard in one corner: shows whether the photo is shown at full resolution.
    for y in range(height - height // 6, height, 2):
        for x in range(width - width // 6, width, 2):
            if (x // 2 + y // 2) % 2 == 0:
                img.putpixel((x, y), (255, 255, 255))
    return img


def save(img: Image.Image, path: Path, exif: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix == ".heic":
        img.save(path, format="HEIF", quality=85, exif=exif)
    else:
        img.save(path, format="JPEG", quality=90, exif=exif)


def fixtures() -> None:
    out = ROOT / "tests" / "fixtures" / "photos"
    cest = lambda h, m, s: datetime(2026, 6, 1, h, m, s)  # local time at UTC+02:00
    # simple.gpx: point k is at lat 46 + 0.0005 k (k = 0..9), times 08:00:00Z + (see helpers.ts)
    save(picture(64, 48, 10, ["1"]), out / "gps-time.jpg",
         exif_bytes(cest(10, 0, 30), "+02:00", 46.0015, 7.0, ele=106))
    save(picture(64, 48, 60, ["2"]), out / "time-only.jpg",
         exif_bytes(cest(10, 2, 10), "+02:00", None, None))
    save(picture(64, 48, 110, ["3"]), out / "no-meta.jpg", piexif.dump({}))
    # Stored landscape, but Orientation 6 = rotate 90° clockwise when shown: a portrait photo.
    save(picture(64, 48, 160, ["4"]), out / "rotated.jpg",
         exif_bytes(cest(10, 0, 0), None, None, None, orientation=6))
    save(picture(64, 48, 210, ["5"]), out / "gps-only.jpg",
         exif_bytes(None, None, 46.0045, 7.00001))
    save(picture(64, 48, 30, ["6"]), out / "gps-time.heic",
         exif_bytes(cest(10, 2, 0), "+02:00", 46.0035, 7.0))
    print(f"Wrote fixtures to {out}")


def sample_photos() -> None:
    gpx = (ROOT / "public" / "samples" / "sample-hike.gpx").read_text()
    points = [
        (float(lat), float(lon), float(ele), datetime.fromisoformat(t.replace("Z", "+00:00")))
        for lat, lon, ele, t in re.findall(
            r'lat="([^"]+)" lon="([^"]+)"><ele>([^<]+)</ele><time>([^<]+)</time>', gpx)
    ]
    out = ROOT / "tmp" / "sample-photos"
    out.mkdir(parents=True, exist_ok=True)
    for old in out.iterdir():
        old.unlink()
    random.seed(3)
    cest = timezone(timedelta(hours=2))
    truth = []
    n = 24
    for i in range(n):
        # Spread along the hike, skipping the first and last 2 %.
        idx = int((0.02 + 0.96 * i / (n - 1)) * (len(points) - 1))
        lat, lon, ele, t = points[idx]
        # Real phones: GPS error of a few metres, photo a few seconds after the trackpoint.
        plat = lat + random.gauss(0, 4) / 111_195
        plon = lon + random.gauss(0, 4) / 76_400
        taken = t + timedelta(seconds=random.randint(0, 4))
        local = taken.astimezone(cest).replace(tzinfo=None)
        kind = ("time-only" if i in (5, 11, 17) else "no-metadata" if i == 20
                else "heic" if i in (8, 15) else "portrait" if i % 4 == 1 else "gps")
        portrait = kind == "portrait"
        w, h = (3000, 4000) if portrait else (4000, 3000)
        label = [f"Photo {i + 1}", kind, f"{plat:.5f}, {plon:.5f}", local.strftime("%H:%M:%S")]
        img = picture(w, h, (i * 37) % 256, label)
        if kind == "no-metadata":
            exif = piexif.dump({})
        elif kind == "time-only":
            exif = exif_bytes(local, "+02:00", None, None)
        else:
            exif = exif_bytes(local, "+02:00", plat, plon, ele=ele)
        name = f"photo-{i + 1:02d}.{'heic' if kind == 'heic' else 'jpg'}"
        save(img, out / name, exif)
        truth.append({"file": name, "kind": kind, "trackIndex": idx, "lat": lat, "lon": lon,
                      "utc": taken.isoformat()})
        print("wrote", name, kind)
    (out / "truth.json").write_text(json.dumps(truth, indent=2))


if __name__ == "__main__":
    fixtures()
    sample_photos()
