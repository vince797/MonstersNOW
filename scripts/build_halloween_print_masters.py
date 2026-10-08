#!/usr/bin/env python3
"""Build Halloween Monster Night print masters (300 PPI) from the approved art.

  python3 scripts/build_halloween_print_masters.py upscale   # Real-ESRGAN (CPU ok, ~30 min)
  python3 scripts/build_halloween_print_masters.py assemble  # write assets/.../*-print.jpg

Needs: pip install torch spandrel opencv-python-headless pillow numpy, and the
Real-ESRGAN weights RealESRGAN_x2plus.pth + RealESRGAN_x4plus.pth
(github.com/xinntao/Real-ESRGAN releases) in $PRINT_MASTERS_WEIGHTS.

Spreads: Real-ESRGAN x2plus of pages-XX-YY-environment-v1.png (1774x887 ->
3548x1774) then Lanczos + light unsharp to 5250x2625.
Singles: p1 = the Books cover scene with its title removed; p2/p3/p32 = x2plus of the
porch-gate / garden-arch (dimmed for small type) / town-square plates, 2625x2625.
Cover wraps: Real-ESRGAN x4plus of the Books-page cover
(cover-series/minimal-concepts/halloween-monster-night-v5) on the front panel
(title kept; the compositor adds the monster + starring line), and the same
art with its title removed (x2plus), mirrored, on the back panel so the scene runs
across the spine. Softcover 5215x2625, hardcover 5700x3075 (casewrap margin
mirrored from the art edges).
"""
import os, sys
import numpy as np, cv2
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = f"{ROOT}/assets/storybook/halloween-monster-night"
UP = os.environ.get("PRINT_MASTERS_WORK", "/tmp/print-masters")
COVER = f"{ROOT}/assets/storybook/cover-series/minimal-concepts/halloween-monster-night-v5-web.jpg"
WEIGHTS = os.environ.get("PRINT_MASTERS_WEIGHTS", "/tmp/upscale")
CLEAN = os.path.join(UP, "cover-v5-clean.png")
DPI = 300

def save_jpg(img, path):
    img.convert("RGB").save(path, "JPEG", quality=95, subsampling=0, dpi=(DPI, DPI), optimize=True)
    print("wrote", path, img.size, os.path.getsize(path), flush=True)

def fit_cover(im, w, h):
    s = max(w / im.width, h / im.height)
    nw, nh = round(im.width * s), round(im.height * s)
    r = im.resize((nw, nh), Image.Resampling.LANCZOS)
    return r.crop(((nw - w) // 2, (nh - h) // 2, (nw - w) // 2 + w, (nh - h) // 2 + h))

def spreads():
    for start in range(4, 32, 2):
        name = f"pages-{start:02d}-{start+1:02d}"
        src = f"{UP}/{name}-environment-v1-x2.png"
        if not os.path.exists(src):
            print("missing", src, flush=True); continue
        im = Image.open(src).convert("RGB")
        up = im.resize((5250, 2625), Image.Resampling.LANCZOS)
        up = up.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
        save_jpg(up, f"{ART}/{name}-environment-print.jpg")

def square_from(path, box, dest, dim=True):
    name = os.path.splitext(os.path.basename(path))[0]
    upscaled = f"{UP}/{name}-x2.png"
    im = Image.open(upscaled if os.path.exists(upscaled) else path).convert("RGB")
    k = im.width / 1254
    im = im.crop(tuple(round(v * k) for v in box))
    out = fit_cover(im, 2625, 2625)
    if dim:
        arr = np.asarray(out).astype(np.float32)
        arr = arr * 0.82 + 28
        out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    save_jpg(out, f"{ART}/{dest}")

def singles(cover_x2):
    # p1 half-title: the Books cover scene with its title removed (echoes the cover).
    cc = f"{UP}/cover-v5-clean-x2.png"
    clean = Image.open(cc if os.path.exists(cc) else CLEAN).convert("RGB")
    save_jpg(fit_cover(clean, 2625, 2625), f"{ART}/page-01-half-title-background-print.jpg")
    # p2 title/dedication: the porch-gate plate, full scene.
    square_from(f"{ART}/covers/background-porch-gate-v1.png", (0, 0, 1254, 1254),
                "page-02-title-dedication-background-print.jpg", dim=False)
    # p3 copyright: quiet garden, dimmed so small type reads.
    square_from(f"{ART}/covers/background-garden-arch-v1.png", (0, 0, 1254, 1254),
                "page-03-copyright-background-print.jpg", dim=True)
    # p32 meet the monster: town square, open path for the characters.
    square_from(f"{ART}/covers/background-town-square-v1.png", (0, 0, 1254, 1254),
                "page-32-meet-monster-background-print.jpg", dim=False)

def place_front(canvas, cover, front):
    """Cover the front trim panel + 0.125 in with the square cover art; any
    remaining casewrap fold margin is filled by mirroring the art's edges."""
    W, H = canvas.size
    fx, fy, fw, fh = front  # trim panel, pixels
    b = 38  # 0.125 in
    x0 = max(0, fx - 40)
    top, bottom = max(0, fy - b), min(H, fy + fh + b)
    right = min(W, fx + fw + b)
    fitted = fit_cover(cover, right - x0, bottom - top)
    arr = np.asarray(fitted)
    arr = cv2.copyMakeBorder(arr, top, H - bottom, 0, W - right, cv2.BORDER_REFLECT)
    canvas.paste(Image.fromarray(arr), (x0, 0))
    return x0

def back_fill(canvas, cover, x_stop, front):
    """Mirror the title-free cover into the back panel; the mirror meets the
    front art at the spine so the scene continues across it."""
    W, H = canvas.size
    fx, fy, fw, fh = front
    b = 38
    top, bottom = max(0, fy - b), min(H, fy + fh + b)
    left = max(0, (W - (fx + fw)) - b)  # back trim panel mirrors the front
    width = x_stop + 160 - left
    fitted = np.asarray(fit_cover(cover.transpose(Image.FLIP_LEFT_RIGHT), width, bottom - top))
    fitted = cv2.copyMakeBorder(fitted, top, H - bottom, left, 0, cv2.BORDER_REFLECT)
    a = np.zeros((H, W, 3), np.float32)
    a[:, : fitted.shape[1]] = fitted[:, :W]
    b_ = np.asarray(canvas).astype(np.float32)
    ramp = np.clip((np.arange(W) - (x_stop - 20)) / 160, 0, 1)[None, :, None]
    out = a * (1 - ramp) + b_ * ramp
    return Image.fromarray(out.astype(np.uint8))

def wraps(front_im, back_im):
    layouts = {
        "softcover": dict(W=5215, H=2625, front=(2627, 38, 2550, 2550)),
        "hardcover": dict(W=5700, H=3075, front=(2888, 225, 2588, 2625)),
    }
    for fmt, L in layouts.items():
        canvas = Image.new("RGB", (L["W"], L["H"]), (20, 16, 40))
        x0 = place_front(canvas, front_im, L["front"])
        canvas = back_fill(canvas, back_im, x0, L["front"])
        save_jpg(canvas, f"{ART}/cover-{fmt}-wrap-print.jpg")

def remove_cover_title():
    """Title-free copy of the Books cover (sky refilled) for the back panel and p1."""
    src=np.asarray(Image.open(COVER).convert('RGB')).astype(np.float32)
    h,w,_=src.shape
    yy,xx=np.mgrid[0:h,0:w]
    inreg=(xx>=330)&(xx<1092)&(yy>=100)&(yy<680)
    house=yy>280+(xx-1254)*(-0.79)+30
    hsv=cv2.cvtColor(src.astype(np.uint8),cv2.COLOR_RGB2HSV)
    L=src.mean(2); sat=hsv[...,1].astype(np.float32)
    bluesky=((src[...,2]-src[...,0])>35)&(xx<380)  # night sky left of the title stays
    core=(inreg&~house&~bluesky&((L<135)|((yy<205)&(sat>60)))).astype(np.uint8)
    n,lab,stats,_=cv2.connectedComponentsWithStats(core,8)
    keepc=np.zeros(n,bool); keepc[1:]=stats[1:,cv2.CC_STAT_AREA]>=40
    core=keepc[lab].astype(np.uint8)
    near=cv2.dilate(core,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(45,45)))
    glow=((sat<30)&(L>200)).astype(np.uint8)
    mask=cv2.dilate(core,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(13,13)))|(glow&near)
    mask=cv2.dilate(mask,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(9,9)))
    mask[bluesky]=0
    m=mask.astype(np.float32)
    cream=(m==0)&(L>215)&(sat>=22)
    c=cream.astype(np.float32)
    ests=[];dens=[]
    for sigma in (20,50,150):
        num=cv2.GaussianBlur(src*c[...,None],(0,0),sigma); den=cv2.GaussianBlur(c,(0,0),sigma)
        ests.append(num/np.maximum(den,1e-6)[...,None]); dens.append(den)
    est=ests[2]
    est=np.where((dens[1]>0.03)[...,None],ests[1],est)
    est=np.where((dens[0]>0.08)[...,None],ests[0],est)
    rng=np.random.default_rng(1)
    grain=cv2.GaussianBlur(rng.normal(0,2.5,(h,w)).astype(np.float32),(0,0),0.7)[...,None]
    soft=np.maximum(cv2.GaussianBlur(m,(0,0),4),m)[...,None]
    out=src*(1-soft)+(est+grain)*soft
    # Remove the crescent moon so the mirrored back panel doesn't repeat it at the spine.
    moonbox=(xx>=165)&(xx<305)&(yy>=125)&(yy<305)
    moon=(moonbox&(L>120)&~((src[...,2]-src[...,0])>35)).astype(np.uint8)
    moon=cv2.dilate(moon,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(19,19)))
    sky=((moonbox|cv2.dilate(moonbox.astype(np.uint8),np.ones((61,61),np.uint8)).astype(bool))&(moon==0)&((src[...,2]-src[...,0])>35)).astype(np.float32)
    num=cv2.GaussianBlur(src*sky[...,None],(0,0),18); den=cv2.GaussianBlur(sky,(0,0),18)
    skyfill=num/np.maximum(den,1e-6)[...,None]+grain
    ms=np.maximum(cv2.GaussianBlur(moon.astype(np.float32),(0,0),3),moon)[...,None]
    out=out*(1-ms)+skyfill*ms
    Image.fromarray(np.clip(out,0,255).astype(np.uint8)).save(CLEAN)


def run_upscale():
    import torch
    from spandrel import ModelLoader
    torch.set_num_threads(os.cpu_count() or 4)
    os.makedirs(UP, exist_ok=True)
    if not os.path.exists(CLEAN):
        remove_cover_title()
    jobs = {
        "RealESRGAN_x2plus.pth": [f"{ART}/pages-{s:02d}-{s+1:02d}-environment-v1.png" for s in range(4, 32, 2)]
        + [f"{ART}/covers/background-{n}-v1.png" for n in ("porch-gate", "garden-arch", "town-square")] + [CLEAN],
        "RealESRGAN_x4plus.pth": [COVER],
    }
    for weights, inputs in jobs.items():
        model = ModelLoader().load_from_file(os.path.join(WEIGHTS, weights)).eval()
        scale = model.scale
        def upscale(img, tile=512, pad=24):
            arr = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
            h, w, _ = arr.shape
            t = torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0)
            out = np.zeros((h * scale, w * scale, 3), dtype=np.float32)
            with torch.inference_mode():
                for y in range(0, h, tile):
                    for x in range(0, w, tile):
                        y0, x0 = max(0, y - pad), max(0, x - pad)
                        y1, x1 = min(h, y + tile + pad), min(w, x + tile + pad)
                        res = model(t[:, :, y0:y1, x0:x1])[0].permute(1, 2, 0).numpy()
                        oy, ox = (y - y0) * scale, (x - x0) * scale
                        th, tw = (min(y + tile, h) - y) * scale, (min(x + tile, w) - x) * scale
                        out[y*scale:y*scale+th, x*scale:x*scale+tw] = res[oy:oy+th, ox:ox+tw]
            return Image.fromarray((np.clip(out, 0, 1) * 255).round().astype(np.uint8))
        for src in inputs:
            name = os.path.splitext(os.path.basename(src))[0]
            if src == COVER: name = "cover-v5"
            if src == CLEAN: name = "cover-v5-clean"
            dst = os.path.join(UP, f"{name}-x{scale}.png")
            if os.path.exists(dst): continue
            upscale(Image.open(src)).save(dst)
            print("upscaled", dst, flush=True)


def main():
    spreads()
    cover = Image.open(COVER).convert("RGB")
    clean = Image.open(CLEAN).convert("RGB")
    # x2 with the already-loaded weights happens outside; here just Lanczos x2 if no x2 file
    cx = f"{UP}/cover-v5-x4.png"
    cc = f"{UP}/cover-v5-clean-x2.png"
    front = Image.open(cx).convert("RGB") if os.path.exists(cx) else cover.resize((2508, 2508), Image.Resampling.LANCZOS)
    back = Image.open(cc).convert("RGB") if os.path.exists(cc) else clean.resize((2508, 2508), Image.Resampling.LANCZOS)
    singles(front)
    wraps(front, back)
    print("ART DONE", flush=True)

if __name__ == "__main__":
    step = sys.argv[1] if len(sys.argv) > 1 else "assemble"
    if step == "upscale":
        run_upscale()
    else:
        if not os.path.exists(CLEAN):
            remove_cover_title()
        main()
