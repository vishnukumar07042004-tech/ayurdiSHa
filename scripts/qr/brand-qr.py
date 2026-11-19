"""Compose the branded Ask Desk QR card: python3 brand-qr.py <green-qr.png> <out.png>"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

GREEN = (23, 63, 53)
IVORY = (252, 251, 247)
GOLD = (196, 154, 82)
SUP = Path("/System/Library/Fonts/Supplemental")
W, H, QR, X0, Y0 = 1200, 1500, 1000, 100, 230


def font(name, size):
    try:
        return ImageFont.truetype(str(SUP / name), size)
    except OSError:
        return ImageFont.load_default(size)


def centred(d, y, text, f, fill):
    w = d.textlength(text, font=f)
    d.text(((W - w) / 2, y), text, font=f, fill=fill)


src, out = sys.argv[1], sys.argv[2]
card = Image.new("RGB", (W, H), (255, 255, 255))
mask = Image.new("L", (W, H), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, W - 1, H - 1), radius=48, fill=255)
card.paste(Image.new("RGB", (W, H), GREEN), (0, 0), mask)
d = ImageDraw.Draw(card)

centred(d, 62, "Ask a WAC mentor", font("Georgia Bold.ttf", 92), IVORY)
d.rounded_rectangle((X0, Y0, X0 + QR, Y0 + QR), radius=28, fill=(255, 255, 255))
qr = Image.open(src).convert("RGB").resize((QR - 40, QR - 40), Image.NEAREST)
card.paste(qr, (X0 + 20, Y0 + 20))
centred(d, 1290, "Scan to open the Ask Desk", font("Georgia.ttf", 44), IVORY)
centred(d, 1372, "ayushmarg.vercel.app/ask · AYURDISHA · WAC 2026", font("Georgia.ttf", 34), GOLD)
card.save(out, optimize=True)
