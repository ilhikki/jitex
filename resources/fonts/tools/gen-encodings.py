import json
import re
import sys
from os import listdir, makedirs, path

from fontTools import agl

HERE = path.dirname(path.abspath(__file__))
REPO = path.dirname(path.dirname(path.dirname(HERE)))
BUILD = path.join(REPO, ".build", "fonts")

AFM_DIR = sys.argv[1] if len(sys.argv) > 1 else path.join(HERE, "afm")
OUT_TS = path.join(REPO, "src", "tex-runtime", "render", "plain", "encodings.ts")
OUT_REPORT = path.join(BUILD, "encodings-report.txt")
MAP_JSON = path.join(BUILD, "cm-map.json")
CM = re.compile(r"^C\s+(-?\d+)\s*;\s*WX\s+(\S+)\s*;\s*N\s+(\S+)\s*;")

NAME_OVERRIDE = {
    "Delta": 0x0394,
    "Omega": 0x03A9,
    "mu": 0x03BC,
    "dotlessj": 0x0237,
    "zerooldstyle": 0x0030,
    "oneoldstyle": 0x0031,
    "twooldstyle": 0x0032,
    "threeoldstyle": 0x0033,
    "fouroldstyle": 0x0034,
    "fiveoldstyle": 0x0035,
    "sixoldstyle": 0x0036,
    "sevenoldstyle": 0x0037,
    "eightoldstyle": 0x0038,
    "nineoldstyle": 0x0039,
    "epsilon1": 0x03F5,
    "theta1": 0x03D1,
    "pi1": 0x03D6,
    "rho1": 0x03F1,
    "sigma1": 0x03C2,
    "phi1": 0x03D5,
    "lscript": 0x2113,
    "weierstrass": 0x2118,
    "vector": 0x2192,
    "tie": 0x2040,
    "star": 0x22C6,
    "flat": 0x266D,
    "natural": 0x266E,
    "sharp": 0x266F,
    "slurabove": 0x2322,
    "slurbelow": 0x2323,
    "triangleright": 0x25B7,
    "triangleleft": 0x25C1,
    "arrowhookleft": 0x21A9,
    "arrowhookright": 0x21AA,
    "arrowlefttophalf": 0x21BC,
    "arrowleftbothalf": 0x21BD,
    "arrowrighttophalf": 0x21C0,
    "arrowrightbothalf": 0x21C1,
    "minus": 0x2212,
    "periodcentered": 0x22C5,
    "multiply": 0x00D7,
    "asteriskmath": 0x2217,
    "divide": 0x00F7,
    "diamondmath": 0x22C4,
    "plusminus": 0x00B1,
    "minusplus": 0x2213,
    "circleplus": 0x2295,
    "circleminus": 0x2296,
    "circlemultiply": 0x2297,
    "circledivide": 0x2298,
    "circledot": 0x2299,
    "circlecopyrt": 0x25CB,
    "openbullet": 0x2218,
    "bullet": 0x2022,
    "equivasymptotic": 0x224D,
    "equivalence": 0x2261,
    "reflexsubset": 0x2286,
    "reflexsuperset": 0x2287,
    "lessequal": 0x2264,
    "greaterequal": 0x2265,
    "precedesequal": 0x2AAF,
    "followsequal": 0x2AB0,
    "similar": 0x223C,
    "approxequal": 0x2248,
    "propersubset": 0x2282,
    "propersuperset": 0x2283,
    "lessmuch": 0x226A,
    "greatermuch": 0x226B,
    "precedes": 0x227A,
    "follows": 0x227B,
    "arrownortheast": 0x2197,
    "arrowsoutheast": 0x2198,
    "arrownorthwest": 0x2196,
    "arrowsouthwest": 0x2199,
    "similarequal": 0x2243,
    "prime": 0x2032,
    "infinity": 0x221E,
    "element": 0x2208,
    "owner": 0x220B,
    "triangle": 0x25B3,
    "triangleinv": 0x25BD,
    "mapsto": 0x21A6,
    "universal": 0x2200,
    "existential": 0x2203,
    "logicalnot": 0x00AC,
    "emptyset": 0x2205,
    "Rfractur": 0x211C,
    "Ifractur": 0x2111,
    "latticetop": 0x22A4,
    "perpendicular": 0x22A5,
    "aleph": 0x2135,
    "union": 0x222A,
    "intersection": 0x2229,
    "unionmulti": 0x228E,
    "logicaland": 0x2227,
    "logicalor": 0x2228,
    "turnstileleft": 0x22A2,
    "turnstileright": 0x22A3,
    "floorleft": 0x230A,
    "floorright": 0x230B,
    "ceilingleft": 0x2308,
    "ceilingright": 0x2309,
    "angbracketleft": 0x27E8,
    "angbracketright": 0x27E9,
    "arrowbothv": 0x2195,
    "arrowdblbothv": 0x21D5,
    "wreathproduct": 0x2240,
    "coproduct": 0x2A3F,
    "nabla": 0x2207,
    "unionsq": 0x2294,
    "intersectionsq": 0x2293,
    "subsetsqequal": 0x2291,
    "supersetsqequal": 0x2292,
    "proportional": 0x221D,
    "radical": 0x221A,
    "integral": 0x222B,
    "bardbl": 0x2225,
    "section": 0x00A7,
    "paragraph": 0x00B6,
    "club": 0x2663,
    "diamond": 0x2662,
    "heart": 0x2661,
    "spade": 0x2660,
    "dagger": 0x2020,
    "daggerdbl": 0x2021,
    "lozenge": 0x25CA,
    "partialdiff": 0x2202,
    "negationslash": 0x0338,
    # --- cmtex ---
    "dotmath": 0x22C5,
    "nbspace": 0x00A0,
    "visiblespace": 0x2423,
    "sterling": 0x00A3,
    "quotedbl": 0x0022,
    "quotesingle": 0x0027,
    "less": 0x003C,
    "greater": 0x003E,
    "backslash": 0x005C,
    "bar": 0x007C,
    "asciicircum": 0x005E,
    "asciitilde": 0x007E,
    "underscore": 0x005F,
    "braceleft": 0x007B,
    "braceright": 0x007D,
    "parenlefttp": 0x239B,
    "parenleftex": 0x239C,
    "parenleftbt": 0x239D,
    "parenrighttp": 0x239E,
    "parenrightex": 0x239F,
    "parenrightbt": 0x23A0,
    "bracketlefttp": 0x23A1,
    "bracketleftex": 0x23A2,
    "bracketleftbt": 0x23A3,
    "bracketrighttp": 0x23A4,
    "bracketrightex": 0x23A5,
    "bracketrightbt": 0x23A6,
    "bracelefttp": 0x23A7,
    "braceleftmid": 0x23A8,
    "braceleftbt": 0x23A9,
    "braceex": 0x23AA,
    "bracerighttp": 0x23AB,
    "bracerightmid": 0x23AC,
    "bracerightbt": 0x23AD,
    "arrowvertex": 0x23D0,
    "summationtext": 0x2211,
    "producttext": 0x220F,
    "integraltext": 0x222B,
    "uniontext": 0x22C3,
    "intersectiontext": 0x22C2,
    "unionmultitext": 0x2A04,
    "logicalandtext": 0x22C0,
    "logicalortext": 0x22C1,
    "coproducttext": 0x2210,
    "unionsqtext": 0x2A06,
    "contintegraltext": 0x222E,
    "circledottext": 0x2A00,
    "circleplustext": 0x2A01,
    "circlemultiplytext": 0x2A02,
}

PER_ENCODING = {
    ("cmsy", "bar"): 0x2223,
    ("cmsy", "backslash"): 0x2216,
}

NO_UNICODE = {
    "parenleftbig",
    "parenrightbig",
    "bracketleftbig",
    "bracketrightbig",
    "floorleftbig",
    "floorrightbig",
    "ceilingleftbig",
    "ceilingrightbig",
    "braceleftbig",
    "bracerightbig",
    "angbracketleftbig",
    "angbracketrightbig",
    "slashbig",
    "backslashbig",
    "vextendsingle",
    "vextenddouble",
    "parenleftBig",
    "parenrightBig",
    "bracketleftBig",
    "bracketrightBig",
    "floorleftBig",
    "floorrightBig",
    "ceilingleftBig",
    "ceilingrightBig",
    "braceleftBig",
    "bracerightBig",
    "angbracketleftBig",
    "angbracketrightBig",
    "slashBig",
    "backslashBig",
    "parenleftbigg",
    "parenrightbigg",
    "bracketleftbigg",
    "bracketrightbigg",
    "floorleftbigg",
    "floorrightbigg",
    "ceilingleftbigg",
    "ceilingrightbigg",
    "braceleftbigg",
    "bracerightbigg",
    "angbracketleftbigg",
    "angbracketrightbigg",
    "slashbigg",
    "backslashbigg",
    "parenleftBigg",
    "parenrightBigg",
    "bracketleftBigg",
    "bracketrightBigg",
    "floorleftBigg",
    "floorrightBigg",
    "ceilingleftBigg",
    "ceilingrightBigg",
    "braceleftBigg",
    "bracerightBigg",
    "angbracketleftBigg",
    "angbracketrightBigg",
    "slashBigg",
    "backslashBigg",
    "radicalbig",
    "radicalBig",
    "radicalbigg",
    "radicalBigg",
    "radicalbt",
    "radicalvertex",
    "radicaltp",
    "arrowvertexdbl",
    "arrowtp",
    "arrowbt",
    "arrowdbltp",
    "arrowdblbt",
    "bracehtipdownleft",
    "bracehtipdownright",
    "bracehtipupleft",
    "bracehtipupright",
    "hatwide",
    "hatwider",
    "hatwidest",
    "tildewide",
    "tildewider",
    "tildewidest",
    "summationdisplay",
    "productdisplay",
    "integraldisplay",
    "uniondisplay",
    "intersectiondisplay",
    "unionmultidisplay",
    "logicalanddisplay",
    "logicalordisplay",
    "coproductdisplay",
    "unionsqdisplay",
    "contintegraldisplay",
    "circledotdisplay",
    "circleplusdisplay",
    "circlemultiplydisplay",
}


def read_afm(p):
    d = {}
    for line in open(p, encoding="latin-1"):
        m = CM.match(line.rstrip("\n"))
        if m and 0 <= int(m.group(1)) < 128:
            d[int(m.group(1))] = m.group(3)
    return d


def read_afm_all(p):

    d = {}
    for line in open(p, encoding="latin-1"):
        m = CM.match(line.rstrip("\n"))
        if m and int(m.group(1)) >= 0:
            d[int(m.group(1))] = m.group(3)
    return d


def base_unicode(enc, name):

    if name in NO_UNICODE:
        return None
    if (enc, name) in PER_ENCODING:
        return PER_ENCODING[(enc, name)]
    if name in NAME_OVERRIDE:
        return NAME_OVERRIDE[name]
    s = agl.toUnicode(name)
    return ord(s) if len(s) == 1 else None


# ---------------------------------------------------------------- Grouping

fonts = sorted(f[:-4] for f in listdir(AFM_DIR) if f.endswith(".afm"))
tables = {}  # font -> {code: name}
sig2key = {}
for font in fonts:
    tables[font] = read_afm(path.join(AFM_DIR, font + ".afm"))

# Fonts with identical code tables form one group; readable keys in first-seen order
KEY_ORDER = [
    ("ot1", "cmr10"),
    ("ot1-italic", "cmti10"),
    ("ot1-nolig", "cmr5"),
    ("ot1-tt", "cmtt10"),
    ("ot1-tt-italic", "cmitt10"),
    ("tex", "cmtex10"),
    ("cmmi", "cmmi10"),
    ("cmsy", "cmsy10"),
    ("cmex", "cmex10"),
    ("inch", "cminch"),
]
key_of_font = {}
by_sig = {}
for font in fonts:
    by_sig.setdefault(tuple(sorted(tables[font].items())), []).append(font)

enc_of = {}
for key, probe in KEY_ORDER:
    sig = tuple(sorted(tables[probe].items()))
    assert sig in by_sig, f"{probe} code table not found"
    for font in by_sig.pop(sig):
        key_of_font[font] = key
        enc_of[key] = tables[probe]
assert not by_sig, f"unclassified fonts: {by_sig}"

# ---------------------------------------------------------------- PUA fallback

# Some glyphs have **no identity** in Unicode (cmex size variants, assembly pieces, OT1 suppress...).
# But they must have a code point; otherwise the renderer can only emit the raw CM code,
# which collides with ASCII and C0 controls (not even legal in XML). So we reserve a slot
# in the Unicode **Private Use Area** for each such name: a legal code point, no conflict
PUA_BASE = 0xE000
PUA: dict[str, int] = {}
name_enc: dict[str, str] = {}
for font in fonts:
    for n in read_afm_all(path.join(AFM_DIR, font + ".afm")).values():
        name_enc.setdefault(n, key_of_font[font])
for name in sorted(name_enc):
    if base_unicode(name_enc[name], name) is None:
        PUA[name] = PUA_BASE + len(PUA)


def unicode_of(enc, name):

    u = base_unicode(enc, name)
    return PUA.get(name) if u is None else u


report = []
report.append("=== Grouping (fonts with identical code tables form one group)")
groups = {}
for font, key in key_of_font.items():
    groups.setdefault(key, []).append(font)
for key, _ in KEY_ORDER:
    fs = sorted(groups.get(key, []))
    report.append(f"  {key:<16} {len(fs):>2} fonts: {' '.join(fs)}")

report.append("")
report.append(
    f"=== Glyphs with no identity in Unicode -> PUA reserved slots (from U+{PUA_BASE:04X})"
)
empties = {}
for key, _ in KEY_ORDER:
    for c, n in sorted(enc_of[key].items()):
        if base_unicode(key, n) is None:
            empties.setdefault(key, []).append((c, n))
    if key in empties:
        report.append(
            f"  [{key}] {len(empties[key])} code points, {len({n for _, n in empties[key]})} glyphs"
        )
        report.append(
            "    " + " ".join(f"{c:02X}:{n}(U+{PUA[n]:04X})" for c, n in empties[key])
        )
report.append(f"  total glyph names: {len(PUA)}")
report.append("")
report.append("=== PUA allocation (name -> reserved slot, stable by name order)")
for name, u in sorted(PUA.items(), key=lambda kv: kv[1]):
    report.append(f"  U+{u:04X}  {name}")

report.append("")
report.append(
    "=== Multiple glyphs in one family claiming the same Unicode (degenerates to one variant)"
)
for key, _ in KEY_ORDER:
    inv = {}
    for c, n in sorted(enc_of[key].items()):
        u = unicode_of(key, n)
        if u is not None:
            inv.setdefault(u, []).append((c, n))
    dup = {u: v for u, v in inv.items() if len(v) > 1}
    if dup:
        report.append(f"  [{key}]")
        for u, v in sorted(dup.items()):
            report.append(f"    U+{u:04X}: " + " ".join(f"{c:02X}:{n}" for c, n in v))


LOW = [
    0x393,
    0x394,
    0x398,
    0x39B,
    0x39E,
    0x3A0,
    0x3A3,
    0x3A5,
    0x3A6,
    0x3A8,
    0x3A9,
    0xFB00,
    0xFB01,
    0xFB02,
    0xFB03,
    0xFB04,
]
MID = [
    0x131,
    0x237,
    0x60,
    0xB4,
    0x2C7,
    0x2D8,
    0xAF,
    0x2DA,
    0xB8,
    0xDF,
    0xE6,
    0x153,
    0xF8,
    0xC6,
    0x152,
    0xD8,
]
OVR = {
    0x22: 0x201D,
    0x27: 0x2019,
    0x3C: 0xA1,
    0x3E: 0xBF,
    0x5C: 0x201C,
    0x5E: 0x2C6,
    0x5F: 0x2D9,
    0x60: 0x2018,
    0x7B: 0x2013,
    0x7C: 0x2014,
    0x7D: 0x2DD,
    0x7E: 0x2DC,
    0x7F: 0xA8,
}
OLD_OT1 = {i: u for i, u in enumerate(LOW)}
OLD_OT1.update({0x10 + i: u for i, u in enumerate(MID)})
OLD_OT1.update({c: c for c in range(0x20, 0x80)})
OLD_OT1.update(OVR)
report.append("")
report.append(
    "=== Regression guard: family ot1 must match the OT1 baseline slot-by-slot"
)
report.append(
    "  (baseline = independently hand-written 128 slots per the OT1 spec, to guard against accidental changes to the ot1 family)"
)
bad = [
    (c, OLD_OT1.get(c), unicode_of("ot1", n))
    for c, n in sorted(enc_of["ot1"].items())
    if OLD_OT1.get(c, 0x20) != unicode_of("ot1", n)
]
report.append(f"  slot-by-slot differences: {len(bad)}" + ("" if not bad else ":"))
for c, a, b in bad:
    report.append(
        f"    0x{c:02X} baseline={a and f'U+{a:04X}'} actual={b and f'U+{b:04X}'}"
    )

report.append("")
report.append("=== Coverage per family (how many of the 128 slots have a code point)")
for key, _ in KEY_ORDER:
    got = sum(1 for c in range(128) if enc_of[key].get(c) is not None)
    real = sum(
        1
        for c, n in enc_of[key].items()
        if unicode_of(key, n) is not None and n not in PUA
    )
    report.append(
        f"  {key:<16} glyphs {got:>3} / real Unicode {real:>3} / PUA {got - real:>3}"
    )


report.append("")
report.append(
    "=== Manually overridden names: AGL value vs this table (for item-by-item review)"
)
allnames = sorted({n for key, _ in KEY_ORDER for n in enc_of[key].values()})
for n in allnames:
    if n not in NAME_OVERRIDE:
        continue
    s = agl.toUnicode(n)
    a = (
        f"U+{ord(s):04X}"
        if len(s) == 1
        else ("(none)" if s == "" else f"(multi {s!r})")
    )
    u = NAME_OVERRIDE[n]
    b = f"U+{u:04X}" if u is not None else "cannot fit"
    report.append(f"  {n:<22} AGL={a:<12} this-table={b}")


cmap_json = {}
for font in fonts:
    key = key_of_font[font]
    rows = []
    for code, name in sorted(read_afm_all(path.join(AFM_DIR, font + ".afm")).items()):
        rows.append([code, name, unicode_of(key, name)])
    cmap_json[font] = rows
makedirs(BUILD, exist_ok=True)
with open(MAP_JSON, "w", encoding="utf-8", newline="\n") as f:
    json.dump(cmap_json, f, ensure_ascii=False)


lines = []
lines.append("/**")
lines.append(
    " * Code point -> Unicode for each CM family. **Generated; do not edit by hand.**"
)
lines.append(" *")
lines.append(" * Source: *.afm from CTAN fonts/amsfonts/afm/, each font own")
lines.append(
    ' *       "C code ; WX width ; N name" - TeX does not use OT1 globally; 10 encodings total;'
)
lines.append(" *       A glyph of the same name may differ in meaning across families.")
lines.append(
    " * Generated by: resources/fonts/tools/gen-encodings.py (audit report at the location described in that directory README)"
)
lines.append(" *")
lines.append(" * Two forms of entries:")
lines.append(" *   number - the Unicode code point of the glyph at that slot")
lines.append(
    " *   null   - the font has no glyph at this slot (TeX should not use it); emit the raw code"
)
lines.append(" *")
lines.append(
    " * A few glyphs have **no identity** in Unicode (cmex size variants and assembly pieces, OT1 suppress...)."
)
lines.append(
    " * They still get code points, taken from **Unicode Private Use Area starting at U+E000**: a legal"
)
lines.append(
    " * code point, no conflict with any real character, and the font places that glyph at the same slot. An explicit tradeoff:"
)
lines.append(
    ' * "multi-variant same-shape" fonts like cmex10 give up Unicode semantics (U+E0xx means no character,'
)
lines.append(
    ' * it just means "the Nth left paren"), in exchange for every variant being available with the correct size.'
)
lines.append(" * Text fonts are unaffected: their 0x00..0x7F are all real Unicode.")
lines.append(
    " * The allocation table is in .build/fonts/encodings-report.txt (from U+E000, assigned stably by name order)."
)
lines.append(" */")
lines.append("export type CodeTable = readonly (number | null)[]")
lines.append("")

for key, probe in KEY_ORDER:
    enc = enc_of[key]
    fs = sorted(groups.get(key, []))
    lines.append("/**")
    lines.append(f" * {key}: {' '.join(fs)}")
    lines.append(f" * from {probe}.afm")
    lines.append(" */")
    name = "ENC_" + key.upper().replace("-", "_")
    lines.append(f"const {name}: CodeTable = [")
    for c in range(128):
        n = enc.get(c)
        u = None if n is None else unicode_of(key, n)
        if u is None:
            lines.append("  null, // the font has no glyph at this slot")
        elif PUA.get(n) == u:
            lines.append(
                f"  0x{u:04X}, // {n}: no identity in Unicode, using PUA reserved slot"
            )
        elif u == c:
            lines.append(f"  0x{u:04X}, // {n} (plain ASCII)")
        else:
            lines.append(f"  0x{u:04X}, // {n}")
    lines.append("]")
    lines.append("")

lines.append("/** family name -> code table */")
lines.append("export const TABLES: Record<string, CodeTable> = {")
for key, _ in KEY_ORDER:
    lines.append(f"  '{key}': ENC_{key.upper().replace('-', '_')},")
lines.append("}")
lines.append("")
lines.append(
    "/** DVI font name -> family name (comes directly from the AFM grouping; all 75 fonts covered) */"
)
lines.append("export const FONT_TABLE: Record<string, string> = {")
for font in sorted(key_of_font):
    lines.append(f"  '{font}': '{key_of_font[font]}',")
lines.append("}")

open(OUT_TS, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
open(OUT_REPORT, "w", encoding="utf-8", newline="\n").write("\n".join(report) + "\n")
print(f"written {OUT_TS}, {OUT_REPORT}")
print(f"fonts={len(fonts)} groups={len(groups)} pua={len(PUA)}")
print("ot1 regression diff", len(bad))
