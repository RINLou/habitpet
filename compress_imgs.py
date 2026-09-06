# 压缩 16 张插画 PNG -> WebP（v10 性能优化：41MB -> ~2MB）
import glob, os
from PIL import Image

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public', 'img'))
# 宽度目标：族图 900 / 事件图 1024 / wishball+boss 640；质量 78-82
PLAN = {}
for f in glob.glob('*.png'):
    if f.startswith('icon'):
        continue  # PWA 图标保留 PNG
    if f in ('wishball.png', 'boss.png'):
        PLAN[f] = (640, 80)
    elif f in ('evo.png', 'graduate.png', 'awaken.png', 'reward.png'):
        PLAN[f] = (1024, 80)
    else:
        PLAN[f] = (900, 78)

total_before = total_after = 0
for f, (w, q) in sorted(PLAN.items()):
    im = Image.open(f)
    if im.mode in ('RGBA', 'P'):
        im = im.convert('RGBA')
    else:
        im = im.convert('RGB')
    if im.width > w:
        h = round(im.height * w / im.width)
        im = im.resize((w, h), Image.LANCZOS)
    out = os.path.splitext(f)[0] + '.webp'
    im.save(out, 'WEBP', quality=q, method=6)
    b, a = os.path.getsize(f), os.path.getsize(out)
    total_before += b; total_after += a
    print(f'{f:22s} {b/1024:8.0f}KB -> {a/1024:6.0f}KB  ({im.width}x{im.height})')
print(f'--- 合计 {total_before/1048576:.1f}MB -> {total_after/1048576:.2f}MB')
