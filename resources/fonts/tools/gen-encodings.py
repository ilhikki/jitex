"""从 AFM 生成 plain 的编码表。

输入：一份 *.afm 目录（来自 CTAN fonts/amsfonts/afm/）——每个字体自己的
      "C 码位 ; WX 宽 ; N 字形名"。**这是「码位 → 哪个字形」的权威来源**：
      TeX 并不全局使用 OT1，75 个字体分属 10 种编码（见 afm-analyze.py）。

输出：
    src/tex-runtime/render/plain/encodings.ts     10 张「码位 → Unicode」表（入库）
    .build/fonts/cm-map.json                      中间物，给 gen_cm_fonts.py 用
    .build/fonts/encodings-report.txt             审计用：全表 + 私用区分配 + 覆盖量

判据：
    1. 码位 → 字形名   ：AFM 说了算（不假设全局 OT1）
    2. 字形名 → Unicode：AGL 打底，TeX 专名覆盖（AGL 对数学字体的名字常给错，
                          甚至给到私用区）——见 NAME_OVERRIDE
    3. 一族内多个字形抢同一个 Unicode（尺寸档、text/display 档）：不给真 Unicode，
       改用私用区保留位。理由：Unicode 里没有"第 3 档大括号"这种码位，
       硬映射必然错档，用 CM 原码又会撞 ASCII 与 C0 控制字符。

用法：python gen-encodings.py [afm 目录]     # 默认 ./afm
"""

import json
import re
import sys
from os import listdir, makedirs, path

from fontTools import agl

HERE = path.dirname(path.abspath(__file__))
REPO = path.dirname(path.dirname(path.dirname(HERE)))  # resources/fonts/tools → 仓库根
BUILD = path.join(REPO, '.build', 'fonts')

AFM_DIR = sys.argv[1] if len(sys.argv) > 1 else path.join(HERE, 'afm')
OUT_TS = path.join(REPO, 'src', 'tex-runtime', 'render', 'plain', 'encodings.ts')
OUT_REPORT = path.join(BUILD, 'encodings-report.txt')
MAP_JSON = path.join(BUILD, 'cm-map.json')
CM = re.compile(r'^C\s+(-?\d+)\s*;\s*WX\s+(\S+)\s*;\s*N\s+(\S+)\s*;')

# ---------------------------------------------------------------- 名字 → Unicode

# AGL 对这些名字给错的（含给到 PUA 的），以及 AGL 里没有的 TeX 专名。
# 值 None 表示"有字形但没有公认的 Unicode 归属"。
NAME_OVERRIDE = {
    # --- AGL 给到 PUA 或明显错位 ---
    'Delta': 0x0394,       # AGL 给 U+2206 INCREMENT；CM 里就是希腊 Δ
    'Omega': 0x03A9,       # AGL 给 U+2126 OHM；CM 里就是希腊 Ω
    'mu': 0x03BC,          # AGL 给 U+00B5 MICRO SIGN；cmmi 里是希腊 μ
    'dotlessj': 0x0237,    # AGL 给 U+F6BE（PUA）
    'zerooldstyle': 0x0030, 'oneoldstyle': 0x0031, 'twooldstyle': 0x0032,
    'threeoldstyle': 0x0033, 'fouroldstyle': 0x0034, 'fiveoldstyle': 0x0035,
    'sixoldstyle': 0x0036, 'sevenoldstyle': 0x0037, 'eightoldstyle': 0x0038,
    'nineoldstyle': 0x0039,  # AGL 给 U+F730..U+F739（PUA）
    # --- cmmi 专名 ---
    'epsilon1': 0x03F5, 'theta1': 0x03D1, 'pi1': 0x03D6, 'rho1': 0x03F1,
    'sigma1': 0x03C2, 'phi1': 0x03D5,
    'lscript': 0x2113, 'weierstrass': 0x2118, 'vector': 0x2192, 'tie': 0x2040,
    'star': 0x22C6, 'flat': 0x266D, 'natural': 0x266E, 'sharp': 0x266F,
    'slurabove': 0x2322, 'slurbelow': 0x2323,
    'triangleright': 0x25B7, 'triangleleft': 0x25C1,
    'arrowhookleft': 0x21A9, 'arrowhookright': 0x21AA,
    'arrowlefttophalf': 0x21BC, 'arrowleftbothalf': 0x21BD,
    'arrowrighttophalf': 0x21C0, 'arrowrightbothalf': 0x21C1,
    # --- cmsy 专名 ---
    'minus': 0x2212, 'periodcentered': 0x22C5, 'multiply': 0x00D7,
    'asteriskmath': 0x2217, 'divide': 0x00F7, 'diamondmath': 0x22C4,
    'plusminus': 0x00B1, 'minusplus': 0x2213, 'circleplus': 0x2295,
    'circleminus': 0x2296, 'circlemultiply': 0x2297, 'circledivide': 0x2298,
    'circledot': 0x2299, 'circlecopyrt': 0x25CB, 'openbullet': 0x2218,
    'bullet': 0x2022, 'equivasymptotic': 0x224D, 'equivalence': 0x2261,
    'reflexsubset': 0x2286, 'reflexsuperset': 0x2287, 'lessequal': 0x2264,
    'greaterequal': 0x2265, 'precedesequal': 0x2AAF, 'followsequal': 0x2AB0,
    'similar': 0x223C, 'approxequal': 0x2248, 'propersubset': 0x2282,
    'propersuperset': 0x2283, 'lessmuch': 0x226A, 'greatermuch': 0x226B,
    'precedes': 0x227A, 'follows': 0x227B, 'arrownortheast': 0x2197,
    'arrowsoutheast': 0x2198, 'arrownorthwest': 0x2196, 'arrowsouthwest': 0x2199,
    'similarequal': 0x2243, 'prime': 0x2032, 'infinity': 0x221E,
    'element': 0x2208, 'owner': 0x220B, 'triangle': 0x25B3,
    'triangleinv': 0x25BD, 'mapsto': 0x21A6,
    'universal': 0x2200, 'existential': 0x2203, 'logicalnot': 0x00AC,
    'emptyset': 0x2205, 'Rfractur': 0x211C, 'Ifractur': 0x2111,
    'latticetop': 0x22A4, 'perpendicular': 0x22A5, 'aleph': 0x2135,
    'union': 0x222A, 'intersection': 0x2229, 'unionmulti': 0x228E,
    'logicaland': 0x2227, 'logicalor': 0x2228, 'turnstileleft': 0x22A2,
    'turnstileright': 0x22A3, 'floorleft': 0x230A, 'floorright': 0x230B,
    'ceilingleft': 0x2308, 'ceilingright': 0x2309,
    'angbracketleft': 0x27E8, 'angbracketright': 0x27E9,
    'arrowbothv': 0x2195, 'arrowdblbothv': 0x21D5, 'wreathproduct': 0x2240,
    'coproduct': 0x2A3F, 'nabla': 0x2207, 'unionsq': 0x2294,
    'intersectionsq': 0x2293, 'subsetsqequal': 0x2291, 'supersetsqequal': 0x2292,
    'proportional': 0x221D, 'radical': 0x221A, 'integral': 0x222B,
    'bardbl': 0x2225,
    'section': 0x00A7, 'paragraph': 0x00B6, 'club': 0x2663,
    'diamond': 0x2662, 'heart': 0x2661, 'spade': 0x2660,
    'dagger': 0x2020, 'daggerdbl': 0x2021, 'lozenge': 0x25CA,
    'partialdiff': 0x2202,
    'negationslash': 0x0338,   # cmsy 0x36 是 plain.tex 的 \not：一条长斜杠，
                               # Unicode 里只有"组合用长斜线叠符"这一个身份
    # --- cmtex ---
    'dotmath': 0x22C5,
    # --- 文本字体的特殊码位 ---
    # 注意：suppress（OT1 0x20）不在这里 —— 它有条真轮廓，但"suppress"这个名字没有
    # Unicode 身份；真正的空白是另一个字形 space。宁缺勿错，让它落 null。
    'nbspace': 0x00A0, 'visiblespace': 0x2423,
    'sterling': 0x00A3, 'quotedbl': 0x0022, 'quotesingle': 0x0027,
    'less': 0x003C, 'greater': 0x003E, 'backslash': 0x005C,
    'bar': 0x007C, 'asciicircum': 0x005E, 'asciitilde': 0x007E,
    'underscore': 0x005F, 'braceleft': 0x007B, 'braceright': 0x007D,
    # --- cmex：可伸缩符号的"片段"，Unicode 的 Miscellaneous Technical
    #     区（U+239B..U+23AD、U+23D0）就是为它们而设，一档一个码位，不撞车 ---
    'parenlefttp': 0x239B, 'parenleftex': 0x239C, 'parenleftbt': 0x239D,
    'parenrighttp': 0x239E, 'parenrightex': 0x239F, 'parenrightbt': 0x23A0,
    'bracketlefttp': 0x23A1, 'bracketleftex': 0x23A2, 'bracketleftbt': 0x23A3,
    'bracketrighttp': 0x23A4, 'bracketrightex': 0x23A5, 'bracketrightbt': 0x23A6,
    'bracelefttp': 0x23A7, 'braceleftmid': 0x23A8, 'braceleftbt': 0x23A9,
    'braceex': 0x23AA, 'bracerighttp': 0x23AB, 'bracerightmid': 0x23AC,
    'bracerightbt': 0x23AD,
    'arrowvertex': 0x23D0,
    # --- cmex：大号运算符（text 档给 Unicode，display 档按原码——同形不同档，
    #     与尺寸档同一个道理；否则 \sum 在 display style 下会画成 text 档那么小） ---
    'summationtext': 0x2211, 'producttext': 0x220F,
    'integraltext': 0x222B, 'uniontext': 0x22C3, 'intersectiontext': 0x22C2,
    'unionmultitext': 0x2A04, 'logicalandtext': 0x22C0, 'logicalortext': 0x22C1,
    'coproducttext': 0x2210, 'unionsqtext': 0x2A06, 'contintegraltext': 0x222E,
    'circledottext': 0x2A00, 'circleplustext': 0x2A01, 'circlemultiplytext': 0x2A02,
}

# 同一个名字在不同族里语义不同（等价于"该字体自己的编码"），按 (族, 名字) 覆盖。
# 例：cmsy 的 bar 是 \mid、backslash 是 \setminus；文本字体里就是 | 和 \。
PER_ENCODING = {
    ('cmsy', 'bar'): 0x2223,
    ('cmsy', 'backslash'): 0x2216,
}

# 有意不给真 Unicode：字形存在，但 Unicode 里没有它的身份 → 落到私用区保留位。
#   * 尺寸档：同一字形的第 1/2/3/4 档（\big/\Big/\bigg/\Bigg），Unicode 只有一个码位
#   * 拼装件：根号的 bt/vertex/tp、箭头的 tp/bt、花括号的四个尖……
#   * cmex 大号运算符的 display 档（与 text 档同形、只是更大一号）
NO_UNICODE = {
    'parenleftbig', 'parenrightbig', 'bracketleftbig', 'bracketrightbig',
    'floorleftbig', 'floorrightbig', 'ceilingleftbig', 'ceilingrightbig',
    'braceleftbig', 'bracerightbig', 'angbracketleftbig', 'angbracketrightbig',
    'slashbig', 'backslashbig', 'vextendsingle', 'vextenddouble',
    'parenleftBig', 'parenrightBig', 'bracketleftBig', 'bracketrightBig',
    'floorleftBig', 'floorrightBig', 'ceilingleftBig', 'ceilingrightBig',
    'braceleftBig', 'bracerightBig', 'angbracketleftBig', 'angbracketrightBig',
    'slashBig', 'backslashBig',
    'parenleftbigg', 'parenrightbigg', 'bracketleftbigg', 'bracketrightbigg',
    'floorleftbigg', 'floorrightbigg', 'ceilingleftbigg', 'ceilingrightbigg',
    'braceleftbigg', 'bracerightbigg', 'angbracketleftbigg', 'angbracketrightbigg',
    'slashbigg', 'backslashbigg',
    'parenleftBigg', 'parenrightBigg', 'bracketleftBigg', 'bracketrightBigg',
    'floorleftBigg', 'floorrightBigg', 'ceilingleftBigg', 'ceilingrightBigg',
    'braceleftBigg', 'bracerightBigg', 'angbracketleftBigg', 'angbracketrightBigg',
    'slashBigg', 'backslashBigg',
    'radicalbig', 'radicalBig', 'radicalbigg', 'radicalBigg',
    'radicalbt', 'radicalvertex', 'radicaltp',
    'arrowvertexdbl', 'arrowtp', 'arrowbt', 'arrowdbltp', 'arrowdblbt',
    'bracehtipdownleft', 'bracehtipdownright', 'bracehtipupleft', 'bracehtipupright',
    'hatwide', 'hatwider', 'hatwidest',
    'tildewide', 'tildewider', 'tildewidest',
    # cmex 大号运算符的 display 档（与 text 档同形、只是更大一号）
    'summationdisplay', 'productdisplay', 'integraldisplay', 'uniondisplay',
    'intersectiondisplay', 'unionmultidisplay', 'logicalanddisplay', 'logicalordisplay',
    'coproductdisplay', 'unionsqdisplay', 'contintegraldisplay', 'circledotdisplay',
    'circleplusdisplay', 'circlemultiplydisplay',
}

# ---------------------------------------------------------------- 读 AFM

def read_afm(p):
    """返回 {code: name}，只取 0..127（128+ 是 AMS 的重复倾倒区）。"""
    d = {}
    for line in open(p, encoding='latin-1'):
        m = CM.match(line.rstrip('\n'))
        if m and 0 <= int(m.group(1)) < 128:
            d[int(m.group(1))] = m.group(3)
    return d


def read_afm_all(p):
    """返回 {code: name}，全码位（含 128+ 的重复倾倒区）。"""
    d = {}
    for line in open(p, encoding='latin-1'):
        m = CM.match(line.rstrip('\n'))
        if m and int(m.group(1)) >= 0:
            d[int(m.group(1))] = m.group(3)
    return d


def base_unicode(enc, name):
    """名字 → Unicode（不含私用区兜底）；None 表示"这个名字没有 Unicode 身份"。"""
    if name in NO_UNICODE:
        return None
    if (enc, name) in PER_ENCODING:
        return PER_ENCODING[(enc, name)]
    if name in NAME_OVERRIDE:
        return NAME_OVERRIDE[name]
    s = agl.toUnicode(name)
    return ord(s) if len(s) == 1 else None


# ---------------------------------------------------------------- 分族

fonts = sorted(f[:-4] for f in listdir(AFM_DIR) if f.endswith('.afm'))
tables = {}       # font -> {code: name}
sig2key = {}
for font in fonts:
    tables[font] = read_afm(path.join(AFM_DIR, font + '.afm'))

# 码表相同的字体归一族；名字按首次出现顺序给个可读的键
KEY_ORDER = [
    ('ot1', 'cmr10'), ('ot1-italic', 'cmti10'), ('ot1-nolig', 'cmr5'),
    ('ot1-tt', 'cmtt10'), ('ot1-tt-italic', 'cmitt10'), ('tex', 'cmtex10'),
    ('cmmi', 'cmmi10'), ('cmsy', 'cmsy10'), ('cmex', 'cmex10'), ('inch', 'cminch'),
]
key_of_font = {}
by_sig = {}
for font in fonts:
    by_sig.setdefault(tuple(sorted(tables[font].items())), []).append(font)

enc_of = {}
for key, probe in KEY_ORDER:
    sig = tuple(sorted(tables[probe].items()))
    assert sig in by_sig, f'{probe} 的码表没找到'
    for font in by_sig.pop(sig):
        key_of_font[font] = key
        enc_of[key] = tables[probe]
assert not by_sig, f'有字体没归族：{by_sig}'

# ---------------------------------------------------------------- 私用区兜底

# 有些字形在 Unicode 里**没有身份**（cmex 的尺寸档、拼装件，OT1 的 suppress…）。
# 但它们必须有个码位，否则渲染端只能吐 CM 原码——那会撞 ASCII 和 C0 控制字符
# （XML 都不合法）。所以给每个这样的名字在 Unicode **私用区**留一个位置：
# 合法码点、不与任何真字符冲突、字体与渲染端同源指认。名字序保证分配是稳定的。
PUA_BASE = 0xE000
PUA: dict[str, int] = {}
name_enc: dict[str, str] = {}
for font in fonts:
    for n in read_afm_all(path.join(AFM_DIR, font + '.afm')).values():
        name_enc.setdefault(n, key_of_font[font])
for name in sorted(name_enc):
    if base_unicode(name_enc[name], name) is None:
        PUA[name] = PUA_BASE + len(PUA)


def unicode_of(enc, name):
    """名字 → Unicode；没有身份的名字落到私用区保留位。"""
    u = base_unicode(enc, name)
    return PUA.get(name) if u is None else u


# ---------------------------------------------------------------- 出表 + 审计

report = []
report.append('=== 分族（码表完全相同的字体归一族）')
groups = {}
for font, key in key_of_font.items():
    groups.setdefault(key, []).append(font)
for key, _ in KEY_ORDER:
    fs = sorted(groups.get(key, []))
    report.append(f'  {key:<16} {len(fs):>2} 个：{" ".join(fs)}')

report.append('')
report.append(f'=== Unicode 里没有身份的字形 → 私用区保留位（U+{PUA_BASE:04X} 起）')
empties = {}
for key, _ in KEY_ORDER:
    for c, n in sorted(enc_of[key].items()):
        if base_unicode(key, n) is None:
            empties.setdefault(key, []).append((c, n))
    if key in empties:
        report.append(f'  [{key}] {len(empties[key])} 个码位、{len({n for _, n in empties[key]})} 个字形')
        report.append('    ' + ' '.join(f'{c:02X}:{n}(U+{PUA[n]:04X})' for c, n in empties[key]))
report.append(f'  字形名合计 {len(PUA)} 个')
report.append('')
report.append('=== 私用区分配（名字 → 保留位，按名字序稳定分配）')
for name, u in sorted(PUA.items(), key=lambda kv: kv[1]):
    report.append(f'  U+{u:04X}  {name}')

report.append('')
report.append('=== 一族内多个字形抢同一个 Unicode（会退化成其中一档）')
for key, _ in KEY_ORDER:
    inv = {}
    for c, n in sorted(enc_of[key].items()):
        u = unicode_of(key, n)
        if u is not None:
            inv.setdefault(u, []).append((c, n))
    dup = {u: v for u, v in inv.items() if len(v) > 1}
    if dup:
        report.append(f'  [{key}]')
        for u, v in sorted(dup.items()):
            report.append(f'    U+{u:04X}: ' + ' '.join(f'{c:02X}:{n}' for c, n in v))

# 回归守卫：族 ot1 必须与现存的 ot1.ts 逐位一致
LOW = [0x393, 0x394, 0x398, 0x39B, 0x39E, 0x3A0, 0x3A3, 0x3A5, 0x3A6, 0x3A8, 0x3A9,
       0xFB00, 0xFB01, 0xFB02, 0xFB03, 0xFB04]
MID = [0x131, 0x237, 0x60, 0xB4, 0x2C7, 0x2D8, 0xAF, 0x2DA, 0xB8,
       0xDF, 0xE6, 0x153, 0xF8, 0xC6, 0x152, 0xD8]
OVR = {0x22: 0x201D, 0x27: 0x2019, 0x3C: 0xA1, 0x3E: 0xBF, 0x5C: 0x201C, 0x5E: 0x2C6,
       0x5F: 0x2D9, 0x60: 0x2018, 0x7B: 0x2013, 0x7C: 0x2014, 0x7D: 0x2DD, 0x7E: 0x2DC, 0x7F: 0xA8}
OLD_OT1 = {i: u for i, u in enumerate(LOW)}
OLD_OT1.update({0x10 + i: u for i, u in enumerate(MID)})
OLD_OT1.update({c: c for c in range(0x20, 0x80)})
OLD_OT1.update(OVR)
report.append('')
report.append('=== 回归守卫：族 ot1 必须与 OT1 基准逐位一致')
report.append('  （基准 = 独立按 OT1 定义手写的 128 位，用来挡住对 ot1 族的意外改动）')
bad = [(c, OLD_OT1.get(c), unicode_of('ot1', n)) for c, n in sorted(enc_of['ot1'].items())
       if OLD_OT1.get(c, 0x20) != unicode_of('ot1', n)]
report.append(f'  逐位差异 {len(bad)} 处' + ('' if not bad else '：'))
for c, a, b in bad:
    report.append(f'    0x{c:02X} 基准={a and f"U+{a:04X}"} 实际={b and f"U+{b:04X}"}')

report.append('')
report.append('=== 各族覆盖量（128 位里有多少位给了码点）')
for key, _ in KEY_ORDER:
    got = sum(1 for c in range(128) if enc_of[key].get(c) is not None)
    real = sum(1 for c, n in enc_of[key].items() if unicode_of(key, n) is not None and n not in PUA)
    report.append(f'  {key:<16} 有字形 {got:>3} / 有真 Unicode {real:>3} / 私用区 {got - real:>3}')


report.append('')
report.append('=== 人为覆盖的名字：AGL 原值 vs 本表（逐条核对用）')
allnames = sorted({n for key, _ in KEY_ORDER for n in enc_of[key].values()})
for n in allnames:
    if n not in NAME_OVERRIDE:
        continue
    s = agl.toUnicode(n)
    a = f'U+{ord(s):04X}' if len(s) == 1 else ('(无)' if s == '' else f'(多字 {s!r})')
    u = NAME_OVERRIDE[n]
    b = f'U+{u:04X}' if u is not None else '落不下'
    report.append(f'  {n:<22} AGL={a:<12} 本表={b}')

# ---------------------------------------------------------------- 给字体生成器

# gen_cm_fonts.py 据此重建 cmap：字体与渲染端必须同源，否则渲染端输出的码位
# 在字体里是豆腐块。这里给全码位（含 128+ 的重复倾倒区，那里面才有 nbspace 等）。
cmap_json = {}
for font in fonts:
    key = key_of_font[font]
    rows = []
    for code, name in sorted(read_afm_all(path.join(AFM_DIR, font + '.afm')).items()):
        rows.append([code, name, unicode_of(key, name)])
    cmap_json[font] = rows
makedirs(BUILD, exist_ok=True)
with open(MAP_JSON, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(cmap_json, f, ensure_ascii=False)

# ---------------------------------------------------------------- 写 TS

lines = []
lines.append('/**')
lines.append(' * CM 各族的「码位 → Unicode」。**生成物，勿手改。**')
lines.append(' *')
lines.append(' * 来源：CTAN fonts/amsfonts/afm/ 的 *.afm，每个字体自己的')
lines.append(' *       "C 码位 ; WX 宽 ; N 字形名" —— TeX 不是全局用 OT1，共 10 种编码；')
lines.append(' *       同名字形在不同族里还可能语义不同（cmsy 的 bar 是 \\mid，文本字体的 bar 是 |）。')
lines.append(' * 生成：resources/fonts/tools/gen-encodings.py（审计报告见该目录 README 说明的位置）')
lines.append(' *')
lines.append(' * 表项两种形态：')
lines.append(' *   number —— 该码位字形的 Unicode 码点')
lines.append(' *   null   —— 该字体在这个码位上没有字形（TeX 本不该用），按原码直出')
lines.append(' *')
lines.append(' * 少数字形在 Unicode 里**没有身份**（cmex 的尺寸档与拼装件、OT1 的 suppress…）。')
lines.append(' * 它们照样给了码点，但取的是 **Unicode 私用区 U+E000 起**的保留位：合法码点、')
lines.append(' * 不与任何真字符冲突、字体里也照着同一个位置放了那个字形。这是明说的取舍——')
lines.append(' * cmex10 这类"多档同形"的字体放弃了 Unicode 语义（U+E0xx 不代表任何字符，')
lines.append(' * 就是"第几档左圆括号"），换来的是每一档都拿得到、尺寸不会错。')
lines.append(' * 文本字体不受影响：它们的 0x00..0x7F 全是真 Unicode。')
lines.append(' * 分配表见 .build/fonts/encodings-report.txt（U+E000 起，按名字序稳定分配）。')
lines.append(' */')
lines.append('export type CodeTable = readonly (number | null)[]')
lines.append('')

for key, probe in KEY_ORDER:
    enc = enc_of[key]
    fs = sorted(groups.get(key, []))
    lines.append('/**')
    lines.append(f' * {key}：{" ".join(fs)}')
    lines.append(f' * 取自 {probe}.afm')
    lines.append(' */')
    name = 'ENC_' + key.upper().replace('-', '_')
    lines.append(f'const {name}: CodeTable = [')
    for c in range(128):
        n = enc.get(c)
        u = None if n is None else unicode_of(key, n)
        if u is None:
            lines.append('  null, // 该字体在这个码位上没有字形')
        elif PUA.get(n) == u:
            lines.append(f'  0x{u:04X}, // {n}：Unicode 里没有身份，用私用区保留位')
        elif u == c:
            lines.append(f'  0x{u:04X}, // {n}（就是 ASCII）')
        else:
            lines.append(f'  0x{u:04X}, // {n}')
    lines.append(']')
    lines.append('')

lines.append('/** 族名 → 码表 */')
lines.append('export const TABLES: Record<string, CodeTable> = {')
for key, _ in KEY_ORDER:
    lines.append(f"  '{key}': ENC_{key.upper().replace('-', '_')},")
lines.append('}')
lines.append('')
lines.append('/** DVI 字体名 → 族名（由 AFM 的分族直接给出，75 个字体全覆盖） */')
lines.append('export const FONT_TABLE: Record<string, string> = {')
for font in sorted(key_of_font):
    lines.append(f"  '{font}': '{key_of_font[font]}',")
lines.append('}')

open(OUT_TS, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')
open(OUT_REPORT, 'w', encoding='utf-8', newline='\n').write('\n'.join(report) + '\n')
print(f'written {OUT_TS}, {OUT_REPORT}')
print(f'fonts={len(fonts)} groups={len(groups)} pua={len(PUA)}')
print('ot1 回归差异', len(bad))
