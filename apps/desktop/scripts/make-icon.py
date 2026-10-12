"""Tạo icon Lumora (build/icon.png, build/icon.ico, resources/icon.png).

Chạy lại khi muốn đổi icon:  python3 apps/desktop/scripts/make-icon.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SIZE = 1024
S = 4  # vẽ lớn gấp 4 rồi thu nhỏ để viền mượt


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def make() -> Image.Image:
    n = SIZE * S
    # Nền chuyển màu chàm → tím theo đường chéo.
    top, bottom = (67, 56, 202), (147, 51, 234)
    gradient = Image.new('RGB', (n, n))
    px = gradient.load()
    for y in range(0, n, S):
        for x in range(0, n, S):
            c = lerp(top, bottom, (x + y) / (2 * n))
            for dy in range(S):
                for dx in range(S):
                    px[x + dx, y + dy] = c
    mask = Image.new('L', (n, n), 0)
    margin = round(n * 0.06)
    ImageDraw.Draw(mask).rounded_rectangle(
        (margin, margin, n - margin, n - margin), radius=round(n * 0.22), fill=255
    )
    icon = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    icon.paste(gradient, (0, 0), mask)

    draw = ImageDraw.Draw(icon)
    # Bốn góc khung ngắm (gợi quay màn hình).
    a, b = n * 0.24, n * 0.76
    arm, w = n * 0.15, round(n * 0.055)
    for (x, y, dx, dy) in ((a, a, 1, 1), (b, a, -1, 1), (a, b, 1, -1), (b, b, -1, -1)):
        draw.line([(x, y + dy * arm), (x, y), (x + dx * arm, y)], fill='white', width=w, joint='curve')
        draw.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill='white')
        for ex, ey in ((x, y + dy * arm), (x + dx * arm, y)):
            draw.ellipse((ex - w / 2, ey - w / 2, ex + w / 2, ey + w / 2), fill='white')
    # Chấm "đang quay" màu hồng ở giữa, viền trắng.
    c, r = n / 2, n * 0.13
    draw.ellipse((c - r - w * 0.6, c - r - w * 0.6, c + r + w * 0.6, c + r + w * 0.6), fill='white')
    draw.ellipse((c - r, c - r, c + r, c + r), fill=(244, 63, 94))
    # Tia sáng nhỏ (gợi AI) ở góc trên phải, ngoài khung.
    sx, sy, sr = n * 0.80, n * 0.20, n * 0.06
    draw.polygon(
        [(sx, sy - sr), (sx + sr * 0.28, sy - sr * 0.28), (sx + sr, sy), (sx + sr * 0.28, sy + sr * 0.28),
         (sx, sy + sr), (sx - sr * 0.28, sy + sr * 0.28), (sx - sr, sy), (sx - sr * 0.28, sy - sr * 0.28)],
        fill=(253, 224, 71),
    )
    return icon.resize((SIZE, SIZE), Image.LANCZOS).filter(ImageFilter.SMOOTH_MORE)


def main() -> None:
    icon = make()
    (ROOT / 'build').mkdir(exist_ok=True)
    (ROOT / 'resources').mkdir(exist_ok=True)
    icon.save(ROOT / 'build' / 'icon.png')
    icon.resize((512, 512), Image.LANCZOS).save(ROOT / 'resources' / 'icon.png')
    icon.save(ROOT / 'build' / 'icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])


if __name__ == '__main__':
    main()
