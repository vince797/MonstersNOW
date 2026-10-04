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
PAGE_DIR = ROOT / "output" / "wheelchair-production-candidate-v2" / "pages"
OUTPUT_DIR = ROOT / "output" / "pdf"
OUTPUT = OUTPUT_DIR / "halloween-monster-night-wheelchair-production-candidate-v2.pdf"
PAGE_POINTS = 8.75 * 72


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    pages = sorted(PAGE_DIR.glob("*.png"))
    if len(pages) != 32:
        raise RuntimeError(f"Expected 32 rendered page PNGs, found {len(pages)}")

    pdf = canvas.Canvas(str(OUTPUT), pagesize=(PAGE_POINTS, PAGE_POINTS), pageCompression=1)
    pdf.setTitle("Halloween Monster Night - Wheelchair Profile Production Candidate v2")
    pdf.setAuthor("MonstersNOW")
    pdf.setSubject("Single Maya wheelchair profile; digital production candidate; human approval and physical proof required")
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
    embedded_images = []
    for index, page in enumerate(reader.pages, 1):
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        dimensions.append([width, height])
        if abs(width - PAGE_POINTS) > 0.1 or abs(height - PAGE_POINTS) > 0.1:
            raise RuntimeError(f"Page {index} has unexpected dimensions {width} x {height}")
        resources = page["/Resources"].get_object()
        xobjects = resources.get("/XObject", {}).get_object()
        page_images = []
        for name, ref in xobjects.items():
            image = ref.get_object()
            if image.get("/Subtype") != "/Image":
                continue
            record = {
                "name": str(name),
                "width": int(image["/Width"]),
                "height": int(image["/Height"]),
                "colorSpace": str(image.get("/ColorSpace")),
                "bitsPerComponent": int(image.get("/BitsPerComponent", 0)),
            }
            page_images.append(record)
        if not any(item["width"] == 2625 and item["height"] == 2625 for item in page_images):
            raise RuntimeError(f"Page {index} does not contain a native 2625px full-page image")
        if not all(item["colorSpace"] == "/DeviceRGB" and item["bitsPerComponent"] == 8 for item in page_images):
            raise RuntimeError(f"Page {index} contains a non-RGB or non-8-bit image")
        embedded_images.append(page_images)

    verification = {
        "path": str(OUTPUT.relative_to(ROOT)),
        "pageCount": len(reader.pages),
        "pagePoints": [PAGE_POINTS, PAGE_POINTS],
        "pageInches": [8.75, 8.75],
        "sourcePixels": [2625, 2625],
        "nominalDpi": 300,
        "embeddedImageFormat": "JPEG quality 88 from lossless compositor pages",
        "fileSizeBytes": os.path.getsize(OUTPUT),
        "embeddedFullPageImages": embedded_images,
        "digitalPreflightPassed": True,
        "physicalProofRequired": True,
        "finalHumanApprovalRequired": True,
        "status": "digital_production_candidate_not_yet_approved",
    }
    (OUTPUT_DIR / "halloween-monster-night-wheelchair-production-candidate-v2.json").write_text(
        json.dumps(verification, indent=2) + "\n",
        encoding="utf-8",
    )
    print(OUTPUT)


if __name__ == "__main__":
    main()
