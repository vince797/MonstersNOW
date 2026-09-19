#!/usr/bin/env python3
"""Preflight the Halloween interior and publish a safe admin summary."""
import json
from pathlib import Path
from PIL import Image
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "assets/storybook/halloween-monster-night"
PDF = ROOT / "output/pdf/MonstersNOW_Halloween_Monster_Night_Interior_PREPRESS_CANDIDATE.pdf"
REPORT = ROOT / "output/Halloween_Monster_Night_Preflight.json"
PUBLIC = ART / "production-status.json"
TARGET_SPREAD = (5250, 2625)  # 17.5 x 8.75 inches at 300 PPI


def run():
    reader = PdfReader(str(PDF))
    art = sorted(ART.glob("pages-*-master-v*.png"))
    selected = []
    for start in range(4, 32, 2):
        selected.append(ART / "print" / f"pages-{start:02d}-{start+1:02d}-print-v1.jpg")
    measurements = []
    for path in selected:
        with Image.open(path) as image:
            width, height = image.size
        measurements.append({
            "file": path.name,
            "pixels": [width, height],
            "effective_ppi": round(min(width / 17.5, height / 8.75), 1),
            "passes_300_ppi": width >= TARGET_SPREAD[0] and height >= TARGET_SPREAD[1],
        })
    minimum_ppi = min(item["effective_ppi"] for item in measurements)
    checks = [
        {"label": "Interior pagination", "status": "pass" if len(reader.pages) == 32 else "blocked", "detail": f"{len(reader.pages)} of 32 pages"},
        {"label": "Interior size and bleed", "status": "pass" if all(float(p.mediabox.width) == 630 and float(p.mediabox.height) == 630 for p in reader.pages) else "blocked", "detail": "8.75 × 8.75 in media; 8.5 × 8.5 in trim"},
        {"label": "Illustration dimensions", "status": "blocked" if minimum_ppi < 300 else "pass", "detail": f"{minimum_ppi:g} PPI effective; 300 PPI required"},
        {"label": "Print-art quality review", "status": "blocked", "detail": "Approve sharpened print derivatives at 100% zoom"},
        {"label": "Softcover package cover", "status": "blocked", "detail": "Awaiting exact Lulu cover dimensions"},
        {"label": "Hardcover package cover", "status": "blocked", "detail": "Awaiting exact Lulu cover dimensions"},
        {"label": "Lulu file validation", "status": "blocked", "detail": "Run after final-resolution art and covers exist"},
    ]
    status = "ready" if all(item["status"] == "pass" for item in checks) else "blocked"
    report = {
        "title": "Halloween Monster Night",
        "status": status,
        "updated": "2026-09-18",
        "format": "8.5 × 8.5 in, full color, 32 pages",
        "checks": checks,
        "artwork": measurements,
        "unused_art_files": len(art) - len(selected),
        "next_action": "Review the 14 print-art derivatives at 100% zoom, then retrieve Lulu cover dimensions for both bindings.",
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2) + "\n")
    PUBLIC.write_text(json.dumps({key: report[key] for key in ("title", "status", "updated", "format", "checks", "next_action")}, indent=2) + "\n")
    print(f"Preflight {status.upper()}: {sum(c['status'] == 'pass' for c in checks)}/{len(checks)} checks pass")
    print(f"Detailed report: {REPORT}")


if __name__ == "__main__":
    run()
