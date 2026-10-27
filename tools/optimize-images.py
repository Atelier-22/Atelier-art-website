import sys
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError as exc:
    raise SystemExit("Image optimization requires Pillow: python -m pip install Pillow") from exc

ROOT = Path(__file__).resolve().parent.parent / "frontend"
WEB_MAX = 1600
WEB_QUALITY = 80


def jpegs(folder):
    return sorted(p for p in folder.rglob("*") if p.suffix.lower() in (".jpg", ".jpeg"))


def encode(img, target, quality):
    img.save(target, "JPEG", quality=quality, optimize=True, progressive=True, subsampling=2)


def shrink(img, limit):
    w, h = img.size
    if max(w, h) <= limit:
        return img
    scale = limit / float(max(w, h))
    return img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)


def optimize_in_place(path):
    before = path.stat().st_size
    with Image.open(path) as raw:
        img = ImageOps.exif_transpose(raw).convert("RGB")
        img = shrink(img, WEB_MAX)
        tmp = path.with_suffix(path.suffix + ".tmp")
        encode(img, tmp, WEB_QUALITY)
    after = tmp.stat().st_size
    if after < before:
        tmp.replace(path)
        return before, after
    tmp.unlink()
    return before, before


def main():
    total_before = total_after = 0
    for path in jpegs(ROOT):
        before, after = optimize_in_place(path)
        total_before += before
        total_after += after
        print(f"{path.relative_to(ROOT)}  {before // 1024} -> {after // 1024} KB")
    print(f"site jpegs: {total_before / 1048576:.1f} MB -> {total_after / 1048576:.1f} MB")


if __name__ == "__main__":
    sys.exit(main())
