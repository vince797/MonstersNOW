#!/usr/bin/env python3
"""Create exact-size print derivatives without overwriting approved artwork."""
from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "assets/storybook/halloween-monster-night"
PRINT = ART / "print"
TARGET = (5250, 2625)


def source_for(start):
    version = "v2" if start in {10, 12, 14, 18} else "v1"
    return ART / f"pages-{start:02d}-{start+1:02d}-master-{version}.png"


def build():
    PRINT.mkdir(parents=True, exist_ok=True)
    for start in range(4, 32, 2):
        source = source_for(start)
        destination = PRINT / f"pages-{start:02d}-{start+1:02d}-print-v1.jpg"
        with Image.open(source) as image:
            image = image.convert("RGB")
            if image.size[0] * TARGET[1] != image.size[1] * TARGET[0]:
                raise ValueError(f"Unexpected aspect ratio: {source.name} is {image.size}")
            image = image.resize(TARGET, Image.Resampling.LANCZOS)
            image = image.filter(ImageFilter.UnsharpMask(radius=1.4, percent=115, threshold=3))
            image.save(destination, "JPEG", quality=95, subsampling=0, dpi=(300, 300), optimize=True)
        print(f"Prepared {destination.relative_to(ROOT)}")


if __name__ == "__main__":
    build()
