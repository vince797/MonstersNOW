#!/usr/bin/env python3
"""Compose exact master copy with approved review illustrations."""
import re
import html
from io import BytesIO
from functools import lru_cache
from pathlib import Path
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor, Color, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'assets/storybook/halloween-monster-night'
OUT = ROOT / 'output/pdf/MonstersNOW_Halloween_Monster_Night_Illustrated_Proof.pdf'
SOURCE = ROOT / 'MonstersNOW_Halloween_Monster_Night_Master_Manuscript_REVISED.md'
W = H = 612
NAVY = HexColor('#071D3D')
CREAM = HexColor('#FFF7E8')
TEAL = HexColor('#008995')
GOLD = HexColor('#FFC94A')
FONT = '/System/Library/Fonts/Supplemental/'
pdfmetrics.registerFont(TTFont('Book', FONT + 'Arial.ttf'))
pdfmetrics.registerFont(TTFont('BookBold', FONT + 'Arial Bold.ttf'))
pdfmetrics.registerFontFamily('Book', normal='Book', bold='BookBold', italic='Book', boldItalic='BookBold')


def personalize(s):
    return s.replace('`', '').replace('{child_name}', 'Mia').replace('{monster_name}', 'Moxie').replace('—', '-').replace('–', '-')


def read_spreads():
    text = SOURCE.read_text()
    sections = re.findall(r'## Pages (\d+)[^\n]*\n(.*?)(?=\n## |\Z)', text, re.S)
    spreads = {}
    for start, section in sections:
        start = int(start)
        if start < 4:
            continue
        match = re.search(r'\*\*Final story text:\*\*\s*(.*?)\n\*\*Illustration direction:', section, re.S)
        assert match, start
        spreads[start] = personalize(match.group(1).strip())
    assert len(spreads) == 14
    return spreads


def divide(text):
    paras = text.split('\n\n')
    total = len(text.split())
    cut = min(range(1, len(paras)), key=lambda k: abs(len(' '.join(paras[:k]).split()) - total/2))
    return '\n\n'.join(paras[:cut]), '\n\n'.join(paras[cut:])


def paragraph(text, size=18, color=NAVY, align=0):
    escaped = html.escape(text).replace('&lt;br/&gt;', '<br/>').replace('\n\n', '<br/><br/>').replace('\n', ' ')
    escaped = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', escaped)
    style = ParagraphStyle('story', fontName='Book', fontSize=size, leading=size*1.32,
                           textColor=color, alignment=align)
    return Paragraph(escaped, style)


def put(c, text, x, top, width, size=18, color=NAVY, align=0):
    p = paragraph(text, size, color, align)
    _, height = p.wrap(width, H)
    p.drawOn(c, x, top-height)
    return height


def number(c, page):
    c.setFont('Book', 9)
    c.setFillColor(TEAL)
    if page % 2:
        c.drawRightString(W-38, 25, str(page))
    else:
        c.drawString(38, 25, str(page))


def spread_asset(start):
    print_asset = ART / 'print' / f'pages-{start:02d}-{start+1:02d}-print-v1.jpg'
    if print_asset.exists():
        return print_asset
    version = 'v2' if start in {10,12,14,18} else 'v1'
    path = ART / f'pages-{start:02d}-{start+1:02d}-master-{version}.png'
    assert path.exists(), path
    return path


@lru_cache(maxsize=14)
def spread_reader(start):
    # Compress only the PDF's embedded copy; preserve original PNG assets.
    data = BytesIO()
    Image.open(spread_asset(start)).convert('RGB').save(data, format='JPEG', quality=92)
    data.seek(0)
    return ImageReader(data)


def story_page(c, page, start, text):
    if page == 31:
        # Dense ending: keep the entire home illustration visible, including treats.
        base(c)
        c.saveState()
        clip = c.beginPath(); clip.rect(126,242,360,360); c.clipPath(clip,stroke=0)
        c.drawImage(spread_reader(start),-234,242,width=720,height=360)
        c.restoreState()
        height = put(c,text.replace('\n\n','<br/>'),48,223,W-96,16)
        assert height < 182, height
        number(c,page)
        return
    # Clip the original landscape spread into its true left/right square halves.
    c.saveState()
    clip = c.beginPath(); clip.rect(0,0,W,H); c.clipPath(clip,stroke=0)
    x = 0 if page == start else -W
    c.drawImage(spread_reader(start), x, 0, width=W*2, height=H)
    c.restoreState()
    width = W-96
    size = 18
    compact_text = text.replace('\n\n','<br/>')
    p = paragraph(compact_text, size)
    _, ph = p.wrap(width, H)
    while ph >= 245 and size > 16:
        size -= 1
        p = paragraph(compact_text, size)
        _, ph = p.wrap(width, H)
    assert ph < 245, (page, ph)
    panel = max(110, ph+46)
    c.setFillColor(Color(1,.969,.91,alpha=.96))
    c.roundRect(28,40,W-56,panel,16,fill=1,stroke=0)
    p.drawOn(c,48,40+panel-23-ph)
    number(c,page)


def base(c):
    c.setFillColor(CREAM); c.rect(0,0,W,H,fill=1,stroke=0)


def decorations(c):
    from build_halloween_sample import star
    for x,y,r in [(60,552,12),(549,560,8),(68,70,8),(548,77,12)]:
        star(c,x,y,r)


def front_cover(c):
    c.saveState(); clip=c.beginPath(); clip.rect(0,0,W,H); c.clipPath(clip,stroke=0)
    c.drawImage(spread_reader(4),-W,0,width=W*2,height=H)
    c.restoreState()
    c.setFillColor(Color(.027,.114,.239,alpha=.94)); c.rect(0,H-185,W,185,fill=1,stroke=0)
    put(c,'Halloween<br/>Monster Night',40,573,W-80,38,white,1)
    c.setFont('BookBold',13); c.setFillColor(GOLD); c.drawCentredString(W/2,450,'STARRING MIA AND MOXIE')
    c.setFillColor(NAVY); c.roundRect(158,28,296,30,15,fill=1,stroke=0)
    c.setFillColor(white); c.setFont('Book',10); c.drawCentredString(W/2,39,'MonstersNOW - Illustrated review proof')


def build():
    spreads=read_spreads()
    OUT.parent.mkdir(parents=True,exist_ok=True)
    c=canvas.Canvas(str(OUT),pagesize=(W,H))
    c.setTitle('Halloween Monster Night - Complete Illustrated Review Proof')
    c.setAuthor('MonstersNOW'); c.setCreator('MonstersNOW')
    front_cover(c); c.showPage()
    base(c); decorations(c)
    put(c,'Halloween<br/>Monster Night',55,365,502,36,NAVY,1)
    put(c,'A MonstersNOW story',55,246,502,15,TEAL,1)
    c.showPage()
    base(c); decorations(c)
    put(c,'Halloween Monster Night',42,529,528,28,NAVY,1)
    put(c,'Starring Mia and Moxie',42,473,528,19,TEAL,1)
    put(c,'This book belongs to a one-of-a-kind monster maker.',76,421,460,17,NAVY,1)
    c.drawImage(str(ROOT/'assets/master-references/input-drawing-purple.jpg'),218,110,width=176,height=220,preserveAspectRatio=True)
    number(c,2); c.showPage()
    base(c); decorations(c)
    put(c,'Big stories from little imaginations.',64,377,484,23,NAVY,1)
    put(c,'Created from an original monster drawing.\n\nCopyright 2026 MonstersNOW. All rights reserved.\n\nPublished by MonstersNOW.',64,295,484,13,NAVY,1)
    put(c,'Illustrated sample for review. Artwork, print resolution, bleed and production specifications remain subject to final approval. Not for Lulu submission.',68,130,476,10,TEAL,1)
    number(c,3); c.showPage()
    for start,text in spreads.items():
        if start == 30:
            parade, home = text.split('By the time they got home,', 1)
            copies = (parade.strip(), 'By the time they got home,' + home)
        else:
            copies = divide(text)
        for page,copy in zip((start,start+1),copies):
            story_page(c,page,start,copy); c.showPage()
    base(c); decorations(c)
    put(c,'Meet Moxie!',42,549,528,31,NAVY,1)
    put(c,'Created by Mia',42,498,528,18,TEAL,1)
    c.drawImage(str(ROOT/'assets/master-references/input-drawing-purple.jpg'),50,184,width=235,height=270,preserveAspectRatio=True)
    c.drawImage(str(ROOT/'assets/master-references/character-purple-storybook-style.jpg'),329,184,width=235,height=270,preserveAspectRatio=True)
    put(c,'My Drawing',50,165,235,15,TEAL,1)
    put(c,'My Storybook Monster',329,165,235,15,TEAL,1)
    put(c,'Every great monster begins with a great imagination.',56,111,500,17,NAVY,1)
    number(c,32); c.showPage(); c.save()
    # Verify every narrative word survives composition in reading order.
    with pdfplumber.open(OUT) as pdf:
        assert len(pdf.pages)==33
        actual=' '.join(line for p in pdf.pages[4:32]
                        for line in (p.extract_text() or '').splitlines()
                        if not line.strip().isdigit())
        expected=' '.join(spreads.values()).replace('**','')
        norm=lambda s: re.sub(r'\s+',' ',s).strip()
        assert norm(actual)==norm(expected), 'Narrative extraction differs from master manuscript'
    print(f'PASS: cover + 32 interiors; all narrative copy matches master: {OUT}')


if __name__=='__main__':
    build()
