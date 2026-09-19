#!/usr/bin/env python3
"""Build the 32-page Halloween interior prepress candidate.

This file deliberately excludes the cover. Lulu calculates a cover from the
final page count, binding, paper, and package ID; it must never be guessed.
"""
from pathlib import Path
import re
import sys

from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_halloween_illustrated_proof as review  # noqa: E402

OUT = ROOT / "output/pdf/MonstersNOW_Halloween_Monster_Night_Interior_PREPRESS_CANDIDATE.pdf"
PAGE_POINTS = 630  # 8.75" including 0.125" bleed on all sides
TRIM_INSET = 9     # 0.125" in points


def page_number(c, page):
    """Keep folios at least 0.5" inside the trim edge."""
    c.setFont("Book", 9)
    c.setFillColor(review.TEAL)
    if page % 2:
        c.drawRightString(PAGE_POINTS - 45, 36, str(page))
    else:
        c.drawString(45, 36, str(page))


def add_boxes(path):
    reader = PdfReader(str(path))
    writer = PdfWriter()
    for page in reader.pages:
        page.bleedbox.lower_left = (0, 0)
        page.bleedbox.upper_right = (PAGE_POINTS, PAGE_POINTS)
        page.trimbox.lower_left = (TRIM_INSET, TRIM_INSET)
        page.trimbox.upper_right = (PAGE_POINTS - TRIM_INSET, PAGE_POINTS - TRIM_INSET)
        writer.add_page(page)
    writer.add_metadata({
        "/Title": "Halloween Monster Night — Interior Prepress Candidate",
        "/Author": "MonstersNOW",
        "/Subject": "32-page 8.5 x 8.5 inch interior with bleed",
    })
    temporary = path.with_suffix(".boxed.pdf")
    with temporary.open("wb") as handle:
        writer.write(handle)
    temporary.replace(path)


def build():
    review.W = review.H = PAGE_POINTS
    review.number = page_number
    spreads = review.read_spreads()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT), pagesize=(PAGE_POINTS, PAGE_POINTS), pageCompression=1)
    c.setTitle("Halloween Monster Night — Interior Prepress Candidate")
    c.setAuthor("MonstersNOW")
    c.setCreator("MonstersNOW production pipeline")

    review.base(c); review.decorations(c)
    review.put(c, "Halloween<br/>Monster Night", 55, 374, 520, 36, review.NAVY, 1)
    review.put(c, "A MonstersNOW story", 55, 252, 520, 15, review.TEAL, 1)
    c.showPage()

    review.base(c); review.decorations(c)
    review.put(c, "Halloween Monster Night", 46, 543, 538, 28, review.NAVY, 1)
    review.put(c, "Starring Mia and Moxie", 46, 486, 538, 19, review.TEAL, 1)
    review.put(c, "This book belongs to a one-of-a-kind monster maker.", 82, 430, 466, 17, review.NAVY, 1)
    c.drawImage(str(ROOT / "assets/master-references/input-drawing-purple.jpg"), 227, 119, width=176, height=220, preserveAspectRatio=True)
    page_number(c, 2); c.showPage()

    review.base(c); review.decorations(c)
    review.put(c, "Big stories from little imaginations.", 70, 390, 490, 23, review.NAVY, 1)
    review.put(c, "Created from an original monster drawing.\n\nCopyright 2026 MonstersNOW. All rights reserved.\n\nPublished by MonstersNOW.", 70, 305, 490, 13, review.NAVY, 1)
    page_number(c, 3); c.showPage()

    for start, text in spreads.items():
        if start == 30:
            parade, home = text.split("By the time they got home,", 1)
            copies = (parade.strip(), "By the time they got home," + home)
        else:
            copies = review.divide(text)
        for page, copy in zip((start, start + 1), copies):
            review.story_page(c, page, start, copy)
            c.showPage()

    review.base(c); review.decorations(c)
    review.put(c, "Meet Moxie!", 46, 563, 538, 31, review.NAVY, 1)
    review.put(c, "Created by Mia", 46, 510, 538, 18, review.TEAL, 1)
    c.drawImage(str(ROOT / "assets/master-references/input-drawing-purple.jpg"), 56, 195, width=235, height=270, preserveAspectRatio=True)
    c.drawImage(str(ROOT / "assets/master-references/character-purple-storybook-style.jpg"), 339, 195, width=235, height=270, preserveAspectRatio=True)
    review.put(c, "My Drawing", 56, 176, 235, 15, review.TEAL, 1)
    review.put(c, "My Storybook Monster", 339, 176, 235, 15, review.TEAL, 1)
    review.put(c, "Every great monster begins with a great imagination.", 62, 119, 506, 17, review.NAVY, 1)
    page_number(c, 32); c.showPage()
    c.save()
    add_boxes(OUT)

    reader = PdfReader(str(OUT))
    assert len(reader.pages) == 32
    assert all(float(p.mediabox.width) == PAGE_POINTS and float(p.mediabox.height) == PAGE_POINTS for p in reader.pages)
    print(f"Built 32-page prepress candidate: {OUT}")


if __name__ == "__main__":
    build()
