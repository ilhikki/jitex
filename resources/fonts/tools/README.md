`resources/fonts/tools/` - How fonts are made

This directory contains one-off tools that build `resources/fonts/jitex-*.otf` and `jitex-*.woff2` from CTAN Computer Modern Type 1 fonts, and produce the encoding tables used by the renderer. `build:jitex` only copies the artifacts; it does not run these scripts. The `jitex-` prefix is explained in section IV.

```
CTAN fonts/amsfonts/pfb/*.pfb --|
                                |-- gen-encodings.py --> src/.../plain/encodings.ts  (checked in)
CTAN fonts/amsfonts/afm/*.afm --|                    |--> .build/fonts/cm-map.json   (intermediate)
                                                             |
                                     gen_cm_fonts.py --------|
                                           |--> resources/fonts/{jitex-*.otf, jitex-*.woff2}  (checked in)
```

`afm-analyze.py` does not produce artifacts. It only answers "how many encodings are there?" and supports the design rationale below.

---

## I. Why this design

### 1. Real Unicode, not a private mapping

Fonts should let users typeset their own documents with `cmr10.woff2`, not only use jitex as a private glyph table. The cmap must be real Unicode. Do not put arbitrary letters in the Private Use Area, and do not map Unicode characters to wrong glyphs.

Therefore we do not use the ready-made BaKoMa version: its cmap points heavily into the Private Use Area.

### 2. Lossless outlines: Type 1 (CFF), not TTF

CFF is cubic Bezier, isomorphic to METAFONT curves, so conversion is lossless. TTF `glyf` is quadratic Bezier and needs approximation. Start from AMS/Bluesky Type 1 (`fonts/amsfonts/pfb/`), not TTF.

For the same reason, no faux bold: each CM variant (`cmbx10` bold, `cmti10` italic, `cmtt10` typewriter, `cmr5`/`cmr7` design sizes) is an independent font file. So `@font-face` does not specify `weight` or `style`; if specified, the browser may synthesize fake glyphs and ruin real CM.

### 3. TeX does not globally use OT1

Assuming "CM fonts are just OT1" and mapping all 75 fonts by one OT1 table is wrong. Characters in `\tt` text, `cmtex`, `cmr5`, and `cmcsc10` would land on wrong glyphs.

The authoritative source is each font's `*.afm`, not `map/cm.map`. `C codepoint ; WX width ; N glyph name` says which glyph is at which codepoint. Clustering the 75 fonts by glyph name sequence at positions 0..127 (`afm-analyze.py`) gives 10 distinct encodings:

| Group | Fonts | Meaning |
|---|---|---|
| `ot1` | cmr* cmbx* cmss* cmssi* cmsl* cmb10 cmdunh10 cmvtt10 cmssq* cmssdc10 cmbxsl10 (36 fonts) | Exactly OT1 |
| `ot1-italic` | cmti* cmbxti10 cmu10 cmff10 cmfi10 cmfib8 | OT1, differing at `0x24`: `sterling` instead of `$` |
| `ot1-nolig` | cmr5, cmcsc10 | OT1 without ligatures: `0x0B..0x0F` are arrows and quotes; `0x3C`/`0x3E` are `<`/`>` |
| `ot1-tt` | cmtt* cmsltt10 cmtcsc10 | Typewriter: `" { } \ ^ _ ~ < >` and `0x20` differ |
| `ot1-tt-italic` | cmitt10 | Typewriter + `0x24` is `sterling` |
| `tex` | cmtex8/9/10 | TeX encoding: `0x00..0x1F` are math symbols |
| `cmmi` | cmmi* cmmib10 | Math italic |
| `cmsy` | cmsy* cmbsy10 | Math symbols |
| `cmex` | cmex10 | Large operators, extensible delimiters |
| `inch` | cminch | Only `space` `-` `0-9` `A-Z` |

Same name, different meaning also exists: in `cmsy`, `bar` is `\mid` (U+2223) and `backslash` is `\setminus` (U+2216), while in text fonts `bar`/`backslash` are just `|` and `\`. Mappings are looked up by `(group, name)`, not by one global table.

### 4. Three mapping criteria

1. Codepoint to glyph name: AFM decides.
2. Glyph name to Unicode: AGL as baseline; TeX-specific names override. AGL is often wrong for math names, sometimes giving Private Use Area. Examples: `Delta` as U+2206, `Omega` as U+2126, `mu` as U+00B5, `zerooldstyle` as U+F730. These are corrected in `NAME_OVERRIDE`.
3. Multiple glyphs in one group competing for the same Unicode: do not give real Unicode; reserve a Private Use Area slot starting at U+E000.

The third point is an explicit tradeoff. In CM, the same shape has multiple size grades (`\big(` `\Big(` `\bigg(` `\Bigg(` are four glyphs), while Unicode has only one left parenthesis. The same applies to `\sum` in text and display grades. Forcing the same codepoint would produce the wrong grade.

Two alternatives were tried and failed:

- Use CM original codes: collides with ASCII and control characters; U+0012 is not legal XML.
- Keep only one grade: `\Big(` would be drawn as `\big(`, a visible error.

Current approach: every such glyph gets a dedicated Private Use Area slot, stably allocated in name order, 95 total. `encodings.ts` and the font cmap point to the same position. Cost: fonts such as `cmex10` give up Unicode semantics. U+E044 is just the third-grade left parenthesis. Text fonts are unaffected: their `0x00..0x7F` are real Unicode, and users can still use `cmr10.woff2` correctly.

---

## II. How to reproduce

You need Python and `fontTools` with woff2 support:

```bash
pip install "fonttools[woff]" brotli
```

All paths in the scripts are relative to this directory or the repository root.

```bash
# 1. Download raw material sets under this directory, already gitignored.
#    pfb/ <- https://mirrors.ctan.org/fonts/amsfonts/pfb/  (unpack *.pfb)
#    afm/ <- https://mirrors.ctan.org/fonts/amsfonts/afm/  (unpack *.afm)
#    manfnt is not included: its glyph names are char00..char7f with no semantics,
#    so a correct mapping cannot be made. It is used only as TFM.

# 2. Count encodings (optional evidence).
python afm-analyze.py       # reads ./afm -> .build/fonts/afm-analyze.txt

# 3. Generate encoding tables.
python gen-encodings.py     # reads ./afm -> src/tex-runtime/render/plain/encodings.ts
                            #            + .build/fonts/{cm-map.json, encodings-report.txt}

# 4. Generate fonts.
python gen_cm_fonts.py      # reads ./pfb -> ../{jitex-*.otf, jitex-*.woff2}

# 5. Rename old artifacts in place (only if ../ still has unprefixed files).
python rename_fonts.py
```

Step 4 also verifies metrics: each glyph advance must equal the width in the corresponding TFM. TFM files come from `resources/knuth/plain/fonts/cm/`. This is required for DVI absolute positioning; a mismatch means the codepoint and glyph were paired incorrectly.

Correct reproduction:

- `gen-encodings.py` outputs `fonts=75 groups=10 pua=95`.
- The report's "multiple glyphs in one group compete for the same Unicode" is empty.
- "ot1 baseline per-position differences" should be exactly 1 place: `0x20`, glyph name `suppress`. It has its own outline, but the name has no Unicode identity; the actual blank is `space`, so rule 3 gives it a PUA slot.
- `gen_cm_fonts.py`'s "advance mismatches" should be only two, both raw material discrepancies: `cmssdc10`'s `C` (606.9 vs 609), and `cmtex9`'s `arrowleft`/`arrowright` (525 vs 547).
- Artifact count: 75 `jitex-*.otf` + 75 `jitex-*.woff2` under `resources/fonts/`.

Generation is byte-deterministic: the `head` timestamp is pinned to AMS's release date, and woff2 directly compresses the OTF bytes. Rerunning it will not change any file in the repository. Artifacts can be verified by hash.

### Renaming existing artifacts

`gen_cm_fonts.py` only writes `jitex-` prefixed names. If a checkout still has the original `cmr10.*` style files (created before the prefix existed), run `python rename_fonts.py` from this directory. It rewrites the file names, the name table, and the CFF names, and leaves outlines and metrics untouched. It reads `FONT_PREFIX` from `gen_cm_fonts.py` and is idempotent: already-prefixed files are skipped.

---

## III. Artifacts and dependencies

| Artifact | Used by |
|---|---|
| `resources/fonts/{jitex-*.otf,jitex-*.woff2}` | `build:jitex` copies them into `dist/lib/fonts/`, and generates `dist/lib/fonts.css`'s `@font-face` from filenames. Family name = filename uppercased, e.g. `JITEX-CMEX10` |
| `src/tex-runtime/render/plain/encodings.ts` | Renderer `resolveUnicode`: DVI font name -> family table -> Unicode |
| `.build/fonts/*` | Audit reports and intermediates only; not checked in |

These two artifacts must come from the same source. `encodings.ts` determines which codepoint the renderer outputs; the font cmap determines which glyph is drawn at that codepoint.

If fonts change, rerun `gen-encodings.py` and then `gen_cm_fonts.py`. The order cannot be reversed, because the latter consumes the former's `cm-map.json`. After changing them, rerun `deno task build:jitex` to copy the new woff2 files into `dist/`.

---

## IV. Known tradeoffs and leftovers

- OFL Reserved Font Names: the AMS OFL reserves every original CM name, and our converted fonts are Modified Versions. The generator therefore prefixes all file and family names with `jitex-`, and `resources/fonts/license/OFL.txt` ships alongside the fonts.
- PUA reserved slots: see rule 3. This is the price paid to keep text fonts pure Unicode.
- `manfnt`: not produced, for the reason above.
- `cmsy`'s `\not` (`0x36`, glyph name `negationslash`): Unicode only has "combining long solidus overlay" (U+0338); whether this architecture can draw it correctly has not been visually confirmed.
- Only advance was verified, not outlines. For visual comparison, see the one-off script idea in git history: draw the PFB outline as SVG, with this font on the left and `cmr10` on the right.