"""Compare two visual snapshot folders: python3 tests/visual_diff.py <dirA> <dirB> [outDiffDir]"""
import os
import sys

from PIL import Image, ImageChops

a, b = sys.argv[1], sys.argv[2]
out = sys.argv[3] if len(sys.argv) > 3 else None
if out:
    os.makedirs(out, exist_ok=True)
bad = 0
for name in sorted(os.listdir(a)):
    if not name.endswith('.png'):
        continue
    pb = os.path.join(b, name)
    if not os.path.exists(pb):
        print('MISSING', name)
        bad += 1
        continue
    ia, ib = Image.open(os.path.join(a, name)).convert('RGB'), Image.open(pb).convert('RGB')
    if ia.size != ib.size:
        print('SIZE', name, ia.size, ib.size)
        bad += 1
        continue
    diff = ImageChops.difference(ia, ib)
    box = diff.getbbox()
    px = sum(1 for p in diff.get_flattened_data() if max(p) > 24) if box else 0
    if px:
        print(f'DIFF {name} box={box} pixels={px}')
        bad += 1
        if out:
            diff.point(lambda v: 255 if v > 24 else 0).save(os.path.join(out, name))
    else:
        print('same', name)
print('changed:', bad)
sys.exit(1 if bad else 0)
