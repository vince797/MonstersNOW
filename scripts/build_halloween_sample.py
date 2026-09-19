#!/usr/bin/env python3
"""Build the MonstersNOW Halloween Monster Night visual review proof."""

from pathlib import Path
from math import sin, cos, pi
from reportlab.pdfgen import canvas
from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "MonstersNOW_Halloween_Monster_Night_Sample.pdf"
MONSTER = ROOT / "assets" / "master-references" / "character-purple-storybook-style.jpg"
DRAWING = ROOT / "assets" / "master-references" / "input-drawing-purple.jpg"
LOGO = ROOT / "assets" / "monstersnow-logo.png"

W = H = 8.5 * 72
NAVY = HexColor("#071D3D")
DEEP = HexColor("#092D49")
TEAL = HexColor("#00A9B3")
ORANGE = HexColor("#FF6408")
GOLD = HexColor("#FFC94A")
CREAM = HexColor("#FFF7E8")
INK = HexColor("#10213A")
PURPLE = HexColor("#7655B7")
LEAF = HexColor("#D9652A")

try:
    pdfmetrics.registerFont(TTFont("StoryBold", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"))
    pdfmetrics.registerFont(TTFont("Story", "/System/Library/Fonts/Supplemental/Arial.ttf"))
except Exception:
    pass

PAGES = [
    ("HALF TITLE", "Halloween Monster Night", "A golden star waits above a quiet trail of autumn leaves."),
    ("TITLE", "Halloween Monster Night", "Starring Mia and Moxie\n\nThis book belongs to a one-of-a-kind monster maker."),
    ("THIS STORY BEGAN WITH A DRAWING", "Meet the original Moxie", "Copyright 2026 MonstersNOW. All rights reserved.\n\nA personalized story created from a child's original monster drawing."),
    ("A SPECIAL HALLOWEEN", "Halloween evening settled over the neighborhood", "in swirls of orange leaves and warm porch light. Mia hurried to the front door, where the most wonderful trick-or-treating partner was waiting."),
    ("READY, MOXIE?", "Tonight was no ordinary Halloween.", "Tonight was the Pumpkin Parade - and, for the first time ever, Moxie would be there."),
    ("THE TOWN SQUARE", "Friendly witches, wobbling ghosts, dancing pumpkins,", "and caped creatures gathered around a giant lantern."),
    ("THE MONSTER STAR", "High above the crowd shone the Monster Star.", "When it reached the top of the lantern, every pumpkin along the parade route would glow. Mia leaned close to Moxie. 'This is going to be amazing.'"),
    ("WHOOOOSH!", "A playful gust spun through the square.", "Leaves twirled. Hats tipped. Banners fluttered. The Monster Star lifted into the air and sailed over the rooftops, trailing golden sparkles behind it."),
    ("EVERYTHING BECAME STILL", "The parade could not begin without the star.", "The crowd looked beneath benches, behind pumpkins, and under the parade wagon."),
    ("THE GOLDEN TRAIL", "Mia noticed something beyond the square:", "one golden sparkle, then another, drifting down the trick-or-treating street. 'The star went that way!'"),
    ("THE SEARCH BEGINS", "Moxie moved toward the trail.", "Mia took a deep breath and followed. The search for the Monster Star had begun."),
    ("TREATS EVERYWHERE", "The trail curled past a porch crowded with smiling pumpkins.", "At the bottom of the steps, a little trick-or-treater stared at a torn treat bag. Wrapped goodies were scattered everywhere."),
    ("THE TRAIL CAN WAIT", "Mia gathered treats while Moxie guarded the goodies", "from the tumbling wind. Soon every treat was safe in a spare bag. 'Thank you!' cheered the little trick-or-treater."),
    ("ANOTHER CLUE", "Near the gate, Moxie stopped beside a star-patterned wrapper.", "A golden sparkle shimmered on its shiny edge. 'Another clue!' said Mia."),
    ("ONE MORE SEARCHER", "The little pumpkin wanted to help.", "Now three Halloween searchers followed the sparkling trail."),
    ("A BRAVE HELLO", "At the next house, a small costumed child waited.", "The porch was bright. The neighbor was smiling. Still, taking the first step felt hard."),
    ("TOGETHER", "Moxie moved to the beginning of the path. Mia stayed close.", "Together, the friends called, 'Trick or treat!' The small child joined in - and discovered a brave voice waiting inside all along."),
    ("A FLASH IN THE WINDOW", "Not moonlight. Not a candle.", "It was the reflection of the Monster Star! Beyond the houses, golden sparkles floated toward the garden lane."),
    ("THE GROUP GROWS", "The small moon joined the search.", "With every kind stop, the group grew - and Moxie moved a little farther ahead."),
    ("THE TANGLED SIGN", "A parade banner twisted around a fence, hiding the arrow.", "Everyone helped. Mia loosened the ribbon. The little pumpkin held one end. The small moon kept the paper stars safe."),
    ("THIS WAY!", "Moxie guided the group toward the part still caught by the wind.", "At last, the banner opened: PUMPKIN PARADE - THIS WAY!"),
    ("THE QUIET GARDEN", "One last sparkle drifted beneath a vine-covered arch.", "Beyond it, the garden was quiet and dim. Pumpkins rested among tall flowers. Fireflies blinked over a path of leaves."),
    ("THERE IT WAS", "At the far end - glowing softly - was the missing Monster Star.", "Mia stopped. The garden was not frightening. But sometimes even safe places can feel uncertain at first."),
    ("ONE KIND STEP", "Moxie moved forward.", "One step into the golden glow. Then another. Watching Moxie made Mia feel braver too."),
    ("WE FOUND IT", "The friends crossed the garden together", "until the Monster Star shone before them. 'We found it,' whispered Mia. The star brightened, as if courage and friendship were exactly what it had been waiting for."),
    ("BRINGING BACK THE LIGHT", "The Monster Star floated from its resting place", "and followed Moxie through the arch. Down the lane went the glowing star, with Moxie, Mia, and two happy helpers leading the way."),
    ("BACK AT THE SQUARE", "The crowd cheered.", "The parade keeper guided the star to the top of the giant lantern. For one tiny moment, everyone waited."),
    ("FWOOM!", "Golden light filled the lantern.", "One by one, every pumpkin along the parade route began to glow."),
    ("MONSTER OF THE NIGHT", "'The Monster Star came home because Moxie was brave enough to lead,'", "announced the parade keeper. 'Please lead our parade, Moxie - our Monster of the Night!'"),
    ("THE PUMPKIN PARADE", "Music bounced through the square, and the parade began at last.", "Moxie led beneath glowing stars. Mia marched alongside the best monster friend in the whole wide night."),
    ("HOME AGAIN", "Later, Mia placed two favorite treats on a small table.", "'What a night, Moxie.' Outside, the Monster Star twinkled above the rooftops. Being brave had started with one uncertain step. Friendship had lit the rest of the way home."),
    ("MEET MOXIE!", "Created by Mia", "Every great monster begins with a great imagination."),
]


def star(c, x, y, r, color=GOLD):
    pts = []
    for i in range(10):
        a = pi / 2 + i * pi / 5
        rr = r if i % 2 == 0 else r * 0.43
        pts.append((x + cos(a) * rr, y + sin(a) * rr))
    p = c.beginPath(); p.moveTo(*pts[0])
    for pt in pts[1:]: p.lineTo(*pt)
    p.close(); c.setFillColor(color); c.drawPath(p, fill=1, stroke=0)


def pumpkin(c, x, y, s=1):
    c.setFillColor(ORANGE)
    for dx in (-14, 0, 14): c.ellipse(x + dx*s - 22*s, y, x + dx*s + 22*s, y + 48*s, fill=1, stroke=0)
    c.setFillColor(HexColor("#487A3D")); c.roundRect(x-4*s, y+43*s, 8*s, 15*s, 3*s, fill=1, stroke=0)


def house(c, x, y, scale=1):
    c.setFillColor(HexColor("#F5C98A")); c.roundRect(x, y, 130*scale, 115*scale, 8, fill=1, stroke=0)
    c.setFillColor(HexColor("#A9453B")); p=c.beginPath(); p.moveTo(x-10*scale,y+105*scale); p.lineTo(x+65*scale,y+165*scale); p.lineTo(x+140*scale,y+105*scale); p.close(); c.drawPath(p,fill=1,stroke=0)
    c.setFillColor(HexColor("#FFE99A")); c.rect(x+20*scale,y+55*scale,28*scale,34*scale,fill=1,stroke=0); c.rect(x+82*scale,y+55*scale,28*scale,34*scale,fill=1,stroke=0)


def draw_scene(c, page):
    night = page >= 18
    c.setFillColor(DEEP if night else HexColor("#6D4A86")); c.rect(0, H*0.34, W, H*0.66, fill=1, stroke=0)
    c.setFillColor(HexColor("#173F43") if night else HexColor("#395B46")); c.rect(0, 0, W, H*0.38, fill=1, stroke=0)
    c.setFillColor(HexColor("#15345C")); c.circle(510, 530, 38, fill=1, stroke=0)
    for i in range(8): star(c, 45+i*73, 520+(i%3)*24, 4+(i%2)*2, HexColor("#FFE38A"))
    if page in {4,5,12,13,14,15,16,17,18,19,30,31}: house(c, 35, 260, .78); house(c, 440, 275, .65)
    if page in {6,7,8,9,27,28,29,30}: 
        pumpkin(c, 470, 250, 1.45); star(c, 470, 410, 31)
    elif page in {22,23,24,25,26}:
        c.setStrokeColor(HexColor("#477B59")); c.setLineWidth(18); c.arc(95,210,515,575,0,180)
        star(c, 465, 300, 35)
    else:
        for i in range(4): pumpkin(c, 70+i*145, 235+(i%2)*20, .55)
    # Golden clue trail.
    if 8 <= page <= 26:
        for i in range(8):
            c.setFillColor(Color(1, .8, .25, alpha=.35+.07*i)); c.circle(80+i*60, 210+i*12, 3+i*.4, fill=1, stroke=0)
    # Framed sample character; consistent placement varies by scene.
    mx = 325 + sin(page*1.7)*75; my = 242 + cos(page)*10
    c.setFillColor(Color(1,1,1,alpha=.92)); c.roundRect(mx-70,my-20,150,190,18,fill=1,stroke=0)
    c.drawImage(str(MONSTER), mx-61, my-10, 132, 165, preserveAspectRatio=True, mask='auto')
    # Child marker in a consistent fall outfit.
    cx = mx-65 if page%2 else mx+105
    c.setFillColor(HexColor("#F1B694")); c.circle(cx, my+96, 17, fill=1, stroke=0)
    c.setFillColor(TEAL); c.roundRect(cx-18,my+32,36,63,10,fill=1,stroke=0)
    c.setFillColor(HexColor("#E7A126")); c.circle(cx, my+17, 17, fill=0, stroke=1)


def wrap(c, text, x, y, max_width, size=17, leading=23, color=INK, max_lines=9):
    words=text.split(); lines=[]; line=""
    for word in words:
        test=(line+" "+word).strip()
        if c.stringWidth(test,"Story",size) <= max_width: line=test
        else:
            if line: lines.append(line)
            line=word
    if line: lines.append(line)
    c.setFont("Story",size); c.setFillColor(color)
    for ln in lines[:max_lines]: c.drawString(x,y,ln); y-=leading
    return y


def text_panel(c, kicker, title, body, page):
    c.setFillColor(CREAM); c.roundRect(34,32,W-68,188,18,fill=1,stroke=0)
    c.setFillColor(ORANGE if page%2 else TEAL); c.roundRect(52,190,150,20,10,fill=1,stroke=0)
    c.setFont("StoryBold",8); c.setFillColor(white); c.drawCentredString(127,197,kicker[:32])
    c.setFont("StoryBold",20); c.setFillColor(NAVY); c.drawString(54,163,title[:48])
    wrap(c,body,54,135,W-108,size=14,leading=19,max_lines=5)
    c.setFont("StoryBold",8); c.setFillColor(HexColor("#6A7481")); c.drawRightString(W-48,48,str(page))


def cover(c):
    c.setFillColor(NAVY); c.rect(0,0,W,H,fill=1,stroke=0)
    c.setFillColor(TEAL); c.circle(W+20,-20,270,fill=1,stroke=0)
    for x,y,r in [(72,530,13),(520,540,8),(470,470,5),(95,425,5)]: star(c,x,y,r)
    c.setFillColor(white); c.setFont("StoryBold",34); c.drawString(48,480,"Halloween")
    c.setFont("StoryBold",47); c.drawString(48,426,"Monster Night")
    c.setFont("Story",17); c.setFillColor(HexColor("#BDECF0")); c.drawString(51,394,"A MonstersNOW personalized story")
    c.setFillColor(white); c.roundRect(275,68,265,285,28,fill=1,stroke=0)
    c.drawImage(str(MONSTER),292,88,232,245,preserveAspectRatio=True,mask='auto')
    c.setFillColor(ORANGE); c.roundRect(48,76,184,46,23,fill=1,stroke=0)
    c.setFillColor(white); c.setFont("StoryBold",15); c.drawCentredString(140,93,"STARRING MIA + MOXIE")
    pumpkin(c,105,175,1.0); pumpkin(c,190,156,.75)


def build():
    OUT.parent.mkdir(parents=True,exist_ok=True)
    c=canvas.Canvas(str(OUT),pagesize=(W,H),pageCompression=1)
    c.setTitle("MonstersNOW - Halloween Monster Night Sample")
    cover(c); c.showPage()
    for page,(kicker,title,body) in enumerate(PAGES,1):
        if page == 1:
            c.setFillColor(CREAM); c.rect(0,0,W,H,fill=1,stroke=0); star(c,W/2,410,43)
            c.setFillColor(NAVY); c.setFont("StoryBold",38); c.drawCentredString(W/2,292,"Halloween Monster Night")
            c.setFillColor(LEAF); c.setFont("Story",13); c.drawCentredString(W/2,257,"A MonstersNOW story")
        elif page in {2,3,32}:
            c.setFillColor(CREAM); c.rect(0,0,W,H,fill=1,stroke=0)
            if page == 2:
                c.drawImage(str(MONSTER),330,165,220,270,preserveAspectRatio=True,mask='auto')
            elif page == 3:
                c.setFillColor(white); c.roundRect(325,190,205,265,18,fill=1,stroke=0)
                c.drawImage(str(DRAWING),340,210,175,225,preserveAspectRatio=True)
            else:
                c.setFillColor(white); c.roundRect(42,200,238,290,18,fill=1,stroke=0); c.drawImage(str(DRAWING),70,225,185,235,preserveAspectRatio=True)
                c.setFillColor(white); c.roundRect(332,200,238,290,18,fill=1,stroke=0); c.drawImage(str(MONSTER),350,225,200,235,preserveAspectRatio=True,mask='auto')
                c.setFont("StoryBold",11); c.setFillColor(TEAL); c.drawCentredString(161,180,"MY DRAWING"); c.drawCentredString(451,180,"MY STORYBOOK MONSTER")
            heading = kicker.title() if page == 32 else title
            c.setFillColor(NAVY); c.setFont("StoryBold",27); c.drawString(44,548,heading)
            if page == 32:
                c.setFillColor(ORANGE); c.setFont("StoryBold",16); c.drawString(46,516,title)
                wrap(c,body,46,486,520,size=15,leading=21,max_lines=8)
            else:
                wrap(c,body,46,520,250,size=15,leading=21,max_lines=8)
            c.setFont("StoryBold",8); c.setFillColor(HexColor("#6A7481")); c.drawRightString(W-48,36,str(page))
        else:
            draw_scene(c,page); text_panel(c,kicker,title,body,page)
        c.showPage()
    c.save()
    print(OUT)


if __name__ == "__main__":
    build()
