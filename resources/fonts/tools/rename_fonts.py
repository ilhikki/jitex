"""Rename already-generated resources/fonts artifacts to the current FONT_PREFIX.

`gen_cm_fonts.py` only writes prefixed names. Run this once on a checkout that
still has the original `cmr10.*` style files. It rewrites file names, the name
table, and the CFF names; outlines and metrics are untouched.
"""

import glob
import os

from fontTools.ttLib import TTFont
from fontTools.ttLib.woff2 import compress

from gen_cm_fonts import FONT_PREFIX

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, ".."))


def rename(otf):
    base = os.path.basename(otf)[:-4]
    if base.startswith(FONT_PREFIX):
        return None

    old = base.upper()
    new = (FONT_PREFIX + base).upper()

    font = TTFont(otf, recalcTimestamp=False)
    for record in font["name"].names:
        text = record.toUnicode()
        if old in text:
            record.string = text.replace(old, new)

    cff = font["CFF "].cff
    cff.fontNames = [new]
    top = cff.topDictIndex[0]
    if hasattr(top, "FullName"):
        top.FullName = new
    if hasattr(top, "FamilyName"):
        top.FamilyName = new

    out = os.path.join(OUT, FONT_PREFIX + base + ".otf")
    font.save(out, reorderTables=False)
    with open(out, "rb") as src, open(os.path.join(OUT, FONT_PREFIX + base + ".woff2"), "wb") as dst:
        compress(src, dst)

    os.remove(otf)
    old_woff2 = os.path.join(OUT, base + ".woff2")
    if os.path.exists(old_woff2):
        os.remove(old_woff2)
    return base


def main():
    names = []
    for otf in sorted(glob.glob(os.path.join(OUT, "*.otf"))):
        renamed = rename(otf)
        if renamed is not None:
            names.append(renamed)
    print(f"renamed {len(names)} fonts -> {FONT_PREFIX}*")
    for name in names:
        print(f"  {name} -> {FONT_PREFIX}{name}")


if __name__ == "__main__":
    main()
