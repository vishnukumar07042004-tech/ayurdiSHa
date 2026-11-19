"""Simulated previews of the HallMap section (headless Chrome is blocked in the agent sandbox).

Uses the real image and the real zone data (via `node`), laid out with the CSS dimensions from
src/styles/hall-map.css. Run from ayurmarg-preview/: python3 design-src/hall-map/sim-preview.py
"""
import json
import subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ZONES = json.loads(subprocess.check_output([
    "node", "--input-type=module", "-e",
    "import {HALL_MAP_ZONES} from './src/components/hallMapZones.js';"
    "console.log(JSON.stringify(HALL_MAP_ZONES))",
]))

FOREST, DEEP, OAK, CREAM = (23, 63, 53), (15, 44, 37), (196, 154, 82), (251, 248, 241)
INK, MUTED, PAGE = (30, 42, 36), (92, 107, 98), (247, 244, 236)
HN = "/System/Library/Fonts/HelveticaNeue.ttc"
f = lambda size, bold=False: ImageFont.truetype(HN, size, index=1 if bold else 0)
serif_it = lambda size: ImageFont.truetype("/System/Library/Fonts/NewYorkItalic.ttf", size)


def shadow_box(base, box, radius, blur=18, alpha=70, offset=10):
    sh = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(
        (box[0], box[1] + offset, box[2], box[3] + offset), radius, fill=(15, 44, 37, alpha))
    base.alpha_composite(sh.filter(ImageFilter.GaussianBlur(blur)))


def wrap(d, text, font, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = f"{cur} {w}".strip()
        if d.textlength(t, font=font) <= width:
            cur = t
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    return lines


def pin(d, x, y, n, on=False, r=15):
    d.ellipse((x - r, y - r, x + r, y + r), fill=OAK if on else FOREST, outline=OAK, width=2)
    d.text((x, y), str(n), font=f(13, True), fill=DEEP if on else (255, 255, 255), anchor="mm")


def card(img, x, y, zone, n, w=290):
    d = ImageDraw.Draw(img)
    body = wrap(d, zone["body"], f(14), w - 32)
    h = 16 + 26 + 8 + len(body) * 21 + 12 + 36 + 14
    shadow_box(img, (x, y, x + w, y + h), 16)
    d.rounded_rectangle((x, y, x + w, y + h), 16, fill=(255, 255, 255))
    d.ellipse((x + 16, y + 17, x + 40, y + 41), fill=FOREST)
    d.text((x + 28, y + 29), str(n), font=f(12, True), fill="white", anchor="mm")
    d.text((x + 50, y + 29), zone["label"], font=f(18, True), fill=DEEP, anchor="lm")
    d.text((x + w - 22, y + 29), "×", font=f(20), fill=MUTED, anchor="mm")
    ty = y + 50
    for line in body:
        d.text((x + 16, ty), line, font=f(14), fill=MUTED)
        ty += 21
    cta = f"{zone['cta']}  ›"
    cw = d.textlength(cta, font=f(14, True)) + 28
    d.rounded_rectangle((x + 16, ty + 10, x + 16 + cw, ty + 46), 18, fill=FOREST)
    d.text((x + 30, ty + 28), cta, font=f(14, True), fill="white", anchor="lm")
    return h


def heading(d, x, y, width, title_size, sub_size):
    d.text((x, y), "MEET THE MENTORS · BHUBANESWAR", font=f(12, True), fill=(156, 122, 62))
    y += 26
    d.text((x, y), "How the hall ", font=f(title_size, True), fill=DEEP)
    tw = d.textlength("How the hall ", font=f(title_size, True))
    d.text((x + tw, y - 2), "works", font=serif_it(title_size + 2), fill=FOREST)
    y += title_size + 16
    for line in wrap(d, "Eight places on the floor. Tap one to see what happens there — and where to go next in the app.",
                     f(sub_size), width):
        d.text((x, y), line, font=f(sub_size), fill=MUTED)
        y += sub_size + 9
    return y


def desktop(path, open_id="podcast"):
    W, H = 1440, 900
    img = Image.new("RGBA", (W, H), PAGE + (255,))
    d = ImageDraw.Draw(img)
    sx, sy, sw = (W - 1136) // 2, 40, 1136
    d.rounded_rectangle((sx, sy, sx + sw, H + 40), 28, fill=CREAM, outline=(220, 226, 220))
    cx = sx + 36
    y = heading(d, cx, sy + 40, 700, 42, 17) + 18
    mw = sw - 72 - 260 - 28
    mh = round(mw * 0.75)
    m = Image.open("public/assets/hall/hall-map.webp").convert("RGBA").resize((mw, mh), Image.LANCZOS)
    shadow_box(img, (cx, y, cx + mw, y + mh), 20, blur=24, alpha=90, offset=18)
    mask = Image.new("L", (mw, mh), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, mw, mh), 20, fill=255)
    img.paste(m, (cx, y), mask)
    d = ImageDraw.Draw(img)
    for i, z in enumerate(ZONES):
        on = z["id"] == open_id
        for j, p in enumerate(z["points"]):
            px, py = cx + p["x"] * mw / 100, y + p["y"] * mh / 100
            if j:
                d.ellipse((px - 7, py - 7, px + 7, py + 7), fill=OAK if on else FOREST, outline=OAK, width=2)
                continue
            label = z["label"]
            lw = d.textlength(label, font=f(12.5, True)) + 20
            left = z.get("labelSide") == "left" or p["x"] > 70
            lx = px - 15 - 6 - lw if left else px + 15 + 6
            d.rounded_rectangle((lx, py - 13, lx + lw, py + 13), 13, fill=DEEP if on else (15, 44, 37, 215))
            d.text((lx + 10, py), label, font=f(12.5, True), fill="white", anchor="lm")
            pin(d, px, py, i + 1, on)
    oz = next(z for z in ZONES if z["id"] == open_id)
    on_i = ZONES.index(oz) + 1
    p = oz["points"][0]
    px, py = cx + p["x"] * mw / 100, y + p["y"] * mh / 100
    card(img, int(px - 26 - 290) if p["x"] > 58 else int(px + 26), int(py - 18), oz, on_i)
    d = ImageDraw.Draw(img)
    d.text((cx, y + mh + 14), "Illustrative layout of the Meet the Mentors hall at WAC 2026, Bhubaneswar.", font=f(13), fill=MUTED)
    lx, ly = cx + mw + 28, y
    for i, z in enumerate(ZONES):
        on = z["id"] == open_id
        if on:
            d.rounded_rectangle((lx, ly, lx + 260, ly + 44), 12, fill=(240, 228, 205))
        pin(d, lx + 24, ly + 22, i + 1, on, r=14)
        d.text((lx + 50, ly + 22), z["label"], font=f(15.5, True), fill=DEEP, anchor="lm")
        ly += 46
    img.convert("RGB").save(path)


def mobile(path, open_id="kiosks", scroll_px=0):
    W, H = 390, 1500
    img = Image.new("RGBA", (W, H), PAGE + (255,))
    d = ImageDraw.Draw(img)
    sx, sw = 16, W - 32
    d.rounded_rectangle((sx, 20, sx + sw, H + 40), 22, fill=CREAM, outline=(220, 226, 220))
    cx, cw = sx + 18, sw - 36
    y = heading(d, cx, 48, cw, 28, 15) + 12
    canvas_w = round(cw * 1.6)
    canvas_h = round(canvas_w * 0.75)
    full = Image.open("public/assets/hall/hall-map-m.webp").convert("RGBA").resize((canvas_w, canvas_h), Image.LANCZOS)
    cd = ImageDraw.Draw(full)
    for i, z in enumerate(ZONES):
        on = z["id"] == open_id
        for j, p in enumerate(z["points"]):
            px, py = p["x"] * canvas_w / 100, p["y"] * canvas_h / 100
            if j:
                cd.ellipse((px - 7, py - 7, px + 7, py + 7), fill=OAK if on else FOREST, outline=OAK, width=2)
            else:
                pin(cd, px, py, i + 1, on)
    view = full.crop((scroll_px, 0, scroll_px + cw, canvas_h))
    mask = Image.new("L", view.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *view.size), 16, fill=255)
    img.paste(view, (cx, y), mask)
    d = ImageDraw.Draw(img)
    bar = cw * cw / canvas_w
    bx = cx + scroll_px * cw / canvas_w
    d.rounded_rectangle((bx, y + canvas_h - 6, bx + bar, y + canvas_h - 2), 2, fill=(255, 255, 255, 170))
    y += canvas_h + 12
    for line in wrap(d, "Illustrative layout of the Meet the Mentors hall at WAC 2026, Bhubaneswar.", f(13), cw):
        d.text((cx, y), line, font=f(13), fill=MUTED)
        y += 19
    y += 14
    for i, z in enumerate(ZONES):
        on = z["id"] == open_id
        if on:
            d.rounded_rectangle((cx, y, cx + cw, y + 56), 12, fill=(240, 228, 205))
        pin(d, cx + 20, y + 28, i + 1, on, r=14)
        d.text((cx + 46, y + 18), z["label"], font=f(15.5, True), fill=DEEP, anchor="lm")
        d.text((cx + 46, y + 38), z["cta"], font=f(13), fill=MUTED, anchor="lm")
        y += 56
        if on:
            y += 4
            h = card(img, cx + 46, y, z, i + 1, w=cw - 46)
            d = ImageDraw.Draw(img)
            y += h + 12
        if i < len(ZONES) - 1:
            d.line((cx, y, cx + cw, y), fill=(225, 230, 226), width=1)
    img = img.crop((0, 0, W, min(H, y + 40)))
    img.convert("RGB").save(path)


if __name__ == "__main__":
    desktop("docs/design/screenshots/hall-map-1440-sim.png")
    mobile("docs/design/screenshots/hall-map-390-sim.png")
    print("ok")
