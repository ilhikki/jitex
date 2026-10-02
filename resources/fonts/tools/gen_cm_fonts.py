import json
import os
import struct
import sys

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.t1Lib import T1Font
from fontTools.ttLib.woff2 import compress as woff2_compress

UNITS_PER_EM = 1000

# OFL Reserved Font Names are owned by AMS; our converted fonts are Modified
# Versions and must not present those names. Keep this in sync with
# FONT_PREFIX in src/tex-runtime/render/plain/fonts.ts.
# Artifacts produced before this prefix existed are fixed up by rename_fonts.py.
FONT_PREFIX = "jitex-"

AMS_DATE = 3330346620
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
BUILD = os.path.join(REPO, ".build", "fonts")
MAP_JSON = os.path.join(BUILD, "cm-map.json")
TFM_DIR = os.path.join(REPO, "resources", "knuth", "plain", "fonts", "cm")


def load_cmap():

    return json.load(open(MAP_JSON, encoding="utf-8"))


def tfm_widths(path):

    b = open(path, "rb").read()
    lf, lh, bc, ec, nw = struct.unpack(">5H", b[0:10])
    char_at = (6 + lh) * 4
    width_at = char_at + (ec - bc + 1) * 4
    out = {}
    for code in range(bc, ec + 1):
        idx = b[char_at + (code - bc) * 4]
        if idx == 0 or idx >= nw:
            continue
        out[code] = struct.unpack(">i", b[width_at + idx * 4 : width_at + idx * 4 + 4])[
            0
        ] / (1 << 20)
    return out


def build(pfb_path, font, rows, out_dir, report):
    t1 = T1Font(pfb_path)
    gs = t1.getGlyphSet()
    names = [n for n in gs.keys() if n != ".notdef"]

    cmap, dropped, absent = {}, [], []
    for code, name, u in rows:
        if u is None:
            continue
        if name not in names:
            absent.append((code, name))
            continue
        if u in cmap:
            dropped.append((code, name, cmap[u]))
            continue
        cmap[u] = name

    widths, bounds, charstrings = {}, {}, {}
    for n in [".notdef"] + names:
        g = gs[n] if n != ".notdef" else None
        bp = BoundsPen(gs)
        if g is not None:
            g.draw(bp)
            bounds[n] = bp.bounds
            w = int(round(getattr(g, "width", UNITS_PER_EM // 2)))
        else:
            bounds[n] = None
            w = UNITS_PER_EM // 2
        widths[n] = w
        pen = T2CharStringPen(w, gs)
        if g is not None:
            g.draw(pen)
        charstrings[n] = pen.getCharString()

    ps = (FONT_PREFIX + font).upper()
    fb = FontBuilder(UNITS_PER_EM, isTTF=False)
    fb.setupGlyphOrder([".notdef"] + names)
    fb.setupCharacterMap(cmap)
    fb.setupCFF(
        ps, {"FullName": ps, "FamilyName": ps, "Weight": "Regular"}, charstrings, {}
    )
    fb.setupHorizontalMetrics(
        {
            n: (widths[n], int(round(bounds[n][0])) if bounds[n] else 0)
            for n in [".notdef"] + names
        }
    )
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable(
        {
            "familyName": ps,
            "styleName": "Regular",
            "uniqueFontIdentifier": f"{ps};1.0",
            "fullName": ps,
            "psName": ps,
            "version": "1.0",
        }
    )
    fb.setupOS2(
        sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200
    )
    fb.setupPost(isFixedPitch=1 if font in ("cmtt10", "manfnt") else 0)
    fb.setupHead(created=AMS_DATE, modified=AMS_DATE)

    os.makedirs(out_dir, exist_ok=True)
    otf = os.path.join(out_dir, FONT_PREFIX + font + ".otf")
    woff2 = os.path.join(out_dir, FONT_PREFIX + font + ".woff2")
    fb.save(otf)

    with open(otf, "rb") as src, open(woff2, "wb") as dst:
        woff2_compress(src, dst)

    report.append((font, ps, len(names), len(cmap), dropped, absent, widths, cmap))


def main():
    pfb_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "pfb")
    out_dir = (
        os.path.abspath(sys.argv[2])
        if len(sys.argv) > 2
        else os.path.abspath(os.path.join(HERE, ".."))
    )
    rows_of = load_cmap()
    report = []
    for fp in sorted(os.listdir(pfb_dir)):
        if not fp.endswith(".pfb") or fp.startswith("manfnt"):
            continue
        font = fp[:-4].lower()
        print(f"... {font}", flush=True)
        build(os.path.join(pfb_dir, fp), font, rows_of[font], out_dir, report)

    print("\nfont         family   glyphs cmap   dropped(dup PUA)  names-not-in-font")
    for font, ps, ng, nc, dropped, absent, _, _ in report:
        print(
            f"{font:<12} {ps:<8} {ng:>4} {nc:>5}  {len(dropped):>16}  {len(absent):>14}"
        )
        for code, name in absent:
            print(f"     name not in font 0x{code:02X} {name}")

    print("\nMetrics check (OTF advance/1000 vs TFM width):")
    for font, ps, ng, nc, dropped, absent, widths, cmap in report:
        tfm = os.path.join(TFM_DIR, font + ".tfm")
        if not os.path.exists(tfm):
            print(f"  {font}: no tfm, skipping")
            continue
        tw = tfm_widths(tfm)
        rows = rows_of[font]
        bad, checked = [], 0
        for code, name, u in rows:
            if code not in tw or code == 0x20:
                continue
            gn = cmap.get(u)
            if gn is None:
                continue
            checked += 1
            diff = abs(widths.get(gn, 0) - tw[code] * UNITS_PER_EM)
            if diff > 1.0:
                bad.append((code, gn, tw[code] * UNITS_PER_EM, widths.get(gn, 0)))
        print(
            f"  {font}: checked {checked} code points, advance mismatch {len(bad)}"
            + (
                ""
                if not bad
                else "  "
                + "; ".join(
                    f"0x{c:02X} {n} tfm={a:.1f} otf={b:.1f}" for c, n, a, b in bad[:10]
                )
            )
        )


if __name__ == "__main__":
    main()
