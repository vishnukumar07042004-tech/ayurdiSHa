"""Render public/og-image.png (1200x630) in the editorial AYURDISHA identity."""
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent.parent
W, H = 1200, 630
IVORY = (252, 251, 247)
GREEN = (23, 63, 53)
GREEN_2 = (56, 107, 77)
GOLD = (196, 154, 82)
CHARCOAL = (30, 36, 33)
SUP = Path("/System/Library/Fonts/Supplemental")


def font(name, size, index=0):
    return ImageFont.truetype(str(SUP / name), size, index=index)


img = Image.new("RGB", (W, H), IVORY)

rng = random.Random(7)
grain = Image.new("L", (W, H))
grain.putdata([rng.randint(0, 255) for _ in range(W * H)])
img = Image.composite(Image.new("RGB", (W, H), (200, 190, 170)), img, grain.point(lambda v: 10 if v > 128 else 0))

d = ImageDraw.Draw(img)

hero = Image.open(ROOT / "public/assets/home/home-hero.png").convert("RGB")
PX, PY, PW, PH = 680, 60, 460, 510
hero = ImageOps.fit(hero, (PW, PH), centering=(0.5, 0.45))
mask = Image.new("L", (PW, PH), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle((0, 0, PW, PH), radius=28, fill=255)
md.rectangle((0, 0, PW, PH // 2), fill=0)
md.ellipse((0, 0, PW, PW), fill=255)
md.rectangle((0, PW // 2, PW, PH - 28), fill=255)

cx, cy = PX + PW // 2, PY + PH // 2
d.ellipse((cx - 300, cy - 300, cx + 300, cy + 300), outline=(232, 222, 200), width=1)
d.ellipse((cx - 270, cy - 270, cx + 270, cy + 270), outline=GOLD, width=1)
img.paste(hero, (PX, PY), mask)
d = ImageDraw.Draw(img)

x = 80
d.line((x, 118, x + 40, 118), fill=GOLD, width=2)
d.text((x + 54, 108), "11TH WORLD AYURVEDA CONGRESS · BHUBANESWAR 2026", font=font("Georgia.ttf", 17), fill=GREEN_2)
d.text((x, 160), "Meet the Minds", font=font("Georgia.ttf", 62), fill=GREEN)
d.text((x, 238), "Shaping Ayurveda", font=font("Georgia Italic.ttf", 62), fill=GREEN_2)
d.text(
    (x, 360),
    "Discover and connect with mentors, practitioners,\nresearchers and thought leaders from the\nAyurveda community.",
    font=font("Georgia.ttf", 23),
    fill=CHARCOAL,
    spacing=10,
)
d.line((x, 488, 600, 488), fill=(226, 220, 204), width=1)
d.text((x, 510), "AYURDISHA", font=font("Georgia Bold.ttf", 30), fill=GREEN)
d.text((x + 212, 519), "Meet the Mentors · WAC 2026", font=font("Georgia.ttf", 18), fill=GREEN_2)

out = ROOT / "public/og-image.png"
img.save(out, optimize=True)
print(out, img.size, out.stat().st_size)
