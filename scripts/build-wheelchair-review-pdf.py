#!/usr/bin/env python3
import json
import io
import os
from pathlib import Path

from PIL import Image
from pypdf import PdfReader
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent.parent
PAGE_DIR = ROOT / "output" / "wheelchair-full-review" / "pages"
OUTPUT_DIR = ROOT / "output" / "pdf"
OUTPUT = OUTPUT_DIR / "halloween-monster-night-wheelchair-reference-review.pdf"
PAGE_POINTS = 8.75 * 72


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    pages = sorted(PAGE_DIR.glob("*.png"))
    if len(pages) != 32:
        raise RuntimeError(f"Expected 32 rendered page PNGs, found {len(pages)}")

    pdf = canvas.Canvas(str(OUTPUT), pagesize=(PAGE_POINTS, PAGE_POINTS), pageCompression=1)
    pdf.setTitle("Halloween Monster Night - Wheelchair Profile Reference Review")
    pdf.setAuthor("MonstersNOW")
    pdf.setSubject("Synthetic Maya wheelchair profile; visual direction approved; not print ready")
    for page in pages:
        with Image.open(page) as source:
            buffer = io.BytesIO()
            source.convert("RGB").save(buffer, format="JPEG", quality=88, optimize=True, dpi=(300, 300))
            buffer.seek(0)
            pdf.drawImage(ImageReader(buffer), 0, 0, width=PAGE_POINTS, height=PAGE_POINTS, preserveAspectRatio=True)
        pdf.showPage()
    pdf.save()

    reader = PdfReader(str(OUTPUT))
    if len(reader.pages) != 32:
        raise RuntimeError(f"PDF page count mismatch: {len(reader.pages)}")
    dimensions = []
    for index, page in enumerate(reader.pages, 1):
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        dimensions.append([width, height])
        if abs(width - PAGE_POINTS) > 0.1 or abs(height - PAGE_POINTS) > 0.1:
            raise RuntimeError(f"Page {index} has unexpected dimensions {width} x {height}")

    verification = {
        "path": str(OUTPUT.relative_to(ROOT)),
        "pageCount": len(reader.pages),
        "pagePoints": [PAGE_POINTS, PAGE_POINTS],
        "pageInches": [8.75, 8.75],
        "sourcePixels": [2625, 2625],
        "nominalDpi": 300,
        "embeddedImageFormat": "JPEG quality 88 from lossless compositor pages",
        "fileSizeBytes": os.path.getsize(OUTPUT),
        "status": "reference_review_not_print_ready",
    }
    (OUTPUT_DIR / "halloween-monster-night-wheelchair-reference-review.json").write_text(
        json.dumps(verification, indent=2) + "\n",
        encoding="utf-8",
    )
    print(OUTPUT)


if __name__ == "__main__":
    main()
