"""Turns tmp/captures/demo.mp4 (made by scripts/capture-demo.mjs) into README media:

- docs/media/demo.gif       a short looping preview (480 px wide, 10 fps, < 10 MB)
- docs/media/*.jpg          stills: title card, flyover, end card
- public/og-image.jpg       1200x630 social preview image

Run with: pnpm demo:media
(uv run --no-project --with av --with pillow python scripts/make-demo-media.py)
"""

from pathlib import Path

import av
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
VIDEO = ROOT / "tmp" / "captures" / "demo.mp4"
MEDIA = ROOT / "docs" / "media"

GIF_WIDTH = 480
GIF_FPS = 10
GIF_SECONDS = (3.0, 12.0)  # intro dive plus the first part of the flight
STILLS = {"title.jpg": 1.0, "flyover.jpg": 12.0, "end-card.jpg": -1.0}


def frames(path: Path):
    with av.open(str(path)) as container:
        stream = container.streams.video[0]
        for frame in container.decode(stream):
            yield float(frame.time), frame.to_image()


def main() -> None:
    MEDIA.mkdir(parents=True, exist_ok=True)
    all_frames = list(frames(VIDEO))
    duration = all_frames[-1][0]
    print(f"{len(all_frames)} frames, {duration:.1f} s, {all_frames[0][1].size}")

    # GIF: every n-th frame in the chosen window, resized, one shared adaptive palette.
    start, end = GIF_SECONDS
    picked, next_t = [], start
    for t, img in all_frames:
        if start <= t <= end and t >= next_t:
            h = round(img.height * GIF_WIDTH / img.width)
            picked.append(img.resize((GIF_WIDTH, h), Image.LANCZOS))
            next_t += 1 / GIF_FPS
    # One shared palette, no dithering: terrain detail makes dithered GIFs several times larger.
    palette = picked[len(picked) // 2].convert("P", palette=Image.ADAPTIVE, colors=96)
    gif_frames = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in picked]
    gif = MEDIA / "demo.gif"
    gif_frames[0].save(
        gif, save_all=True, append_images=gif_frames[1:], duration=round(1000 / GIF_FPS),
        loop=0, optimize=True, disposal=1,
    )
    print(f"{gif.name}: {len(gif_frames)} frames, {gif.stat().st_size / 1e6:.1f} MB")

    def at(seconds: float) -> Image.Image:
        target = seconds if seconds >= 0 else duration + seconds
        return min(all_frames, key=lambda f: abs(f[0] - target))[1]

    for name, t in STILLS.items():
        img = at(t)
        img.convert("RGB").save(MEDIA / name, quality=86)
        print(name, img.size)

    # Social preview: centre crop of the flyover still to 1200x630.
    fly = at(STILLS["flyover.jpg"]).convert("RGB")
    scale = max(1200 / fly.width, 630 / fly.height)
    fly = fly.resize((round(fly.width * scale), round(fly.height * scale)), Image.LANCZOS)
    left, top = (fly.width - 1200) // 2, (fly.height - 630) // 2
    fly.crop((left, top, left + 1200, top + 630)).save(ROOT / "public" / "og-image.jpg", quality=85)
    print("og-image.jpg written")


if __name__ == "__main__":
    main()
