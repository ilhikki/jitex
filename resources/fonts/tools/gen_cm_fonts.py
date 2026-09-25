#!/usr/bin/env python
"""
把 AMS/Bluesky 的 CM Type1（.pfb）转成通用 OTF + woff2。

做法与理由：
  * PFB 自带权威轮廓，但没有 Unicode cmap（其 /Encoding 是内建 asc）。
  * cmap **不在这里定义**：它来自 gen-encodings.py 的产物 .build/fonts/cm-map.json
    ——「码位 → 字形名 → Unicode」。渲染端（src/tex-runtime/render/plain/encodings.ts）
    和字体必须同源，否则渲染端打出来的码位在字体里是豆腐块。
  * 同一 Unicode 在字体里只能映射一个字形（尺寸档、text/display 档），按码位升序先到先得。
  * 顺带核验度量：字形 advance 必须等于 TFM 宽度，否则 DVI 的绝对定位会错。

一次性工具：产物入库 resources/fonts/，构建期只负责拷贝。

用法：python gen_cm_fonts.py [pfb 目录] [输出目录]
      # 默认 pfb 目录 ./pfb，默认输出目录 resources/fonts/
"""

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
# head 的时间戳固定成 AMS 这批字体自己的发布日期（AFM 里写着 Creation Date: 2009-07-13
# 16:17:00）。不固定的话每次重跑都会改掉全部 150 个文件的字节，仓库里全是噪声，
# "复现"也就没法用哈希核对。数值是 2009-07-13 16:17:00 UTC 距 1904-01-01 的秒数。
AMS_DATE = 3330346620
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))  # resources/fonts/tools → 仓库根
BUILD = os.path.join(REPO, '.build', 'fonts')
MAP_JSON = os.path.join(BUILD, 'cm-map.json')
TFM_DIR = os.path.join(REPO, 'resources', 'knuth', 'plain', 'fonts', 'cm')


def load_cmap():
    """{font: [[码位, 字形名, Unicode|null], ...]}，按码位升序。"""
    return json.load(open(MAP_JSON, encoding='utf-8'))


# ---------------------------------------------------------------- TFM（核验度量）

def tfm_widths(path):
    """返回 {码位: fix_word 宽度}（fix_word = value / 2^20，单位 em）。"""
    b = open(path, 'rb').read()
    lf, lh, bc, ec, nw = struct.unpack('>5H', b[0:10])
    char_at = (6 + lh) * 4
    width_at = char_at + (ec - bc + 1) * 4
    out = {}
    for code in range(bc, ec + 1):
        idx = b[char_at + (code - bc) * 4]
        if idx == 0 or idx >= nw:
            continue
        out[code] = struct.unpack('>i', b[width_at + idx * 4: width_at + idx * 4 + 4])[0] / (1 << 20)
    return out


# ---------------------------------------------------------------- 转换

def build(pfb_path, font, rows, out_dir, report):
    t1 = T1Font(pfb_path)
    gs = t1.getGlyphSet()
    names = [n for n in gs.keys() if n != '.notdef']

    # 码位升序：一个 Unicode 只留一个字形，先到先得（cmex 的 text 档码位在前）。
    # "Unicode 里没有身份"的字形不会落到这里——它们在 cm-map.json 里已经有私用区
    # 保留位（U+E000 起），渲染端与字体指认的是同一个位置。
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

    # 轮廓 + 宽度
    widths, bounds, charstrings = {}, {}, {}
    for n in ['.notdef'] + names:
        g = gs[n] if n != '.notdef' else None
        bp = BoundsPen(gs)
        if g is not None:
            g.draw(bp)
            bounds[n] = bp.bounds
            w = int(round(getattr(g, 'width', UNITS_PER_EM // 2)))
        else:
            bounds[n] = None
            w = UNITS_PER_EM // 2
        widths[n] = w
        pen = T2CharStringPen(w, gs)
        if g is not None:
            g.draw(pen)
        charstrings[n] = pen.getCharString()

    ps = font.upper()
    fb = FontBuilder(UNITS_PER_EM, isTTF=False)
    fb.setupGlyphOrder(['.notdef'] + names)
    fb.setupCharacterMap(cmap)
    fb.setupCFF(ps, {'FullName': ps, 'FamilyName': ps, 'Weight': 'Regular'}, charstrings, {})
    fb.setupHorizontalMetrics({
        n: (widths[n], int(round(bounds[n][0])) if bounds[n] else 0) for n in ['.notdef'] + names
    })
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({
        'familyName': ps, 'styleName': 'Regular', 'uniqueFontIdentifier': f'{ps};1.0',
        'fullName': ps, 'psName': ps, 'version': '1.0',
    })
    fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
    fb.setupPost(isFixedPitch=1 if font in ('cmtt10', 'manfnt') else 0)
    fb.setupHead(created=AMS_DATE, modified=AMS_DATE)

    os.makedirs(out_dir, exist_ok=True)
    otf = os.path.join(out_dir, font + '.otf')
    woff2 = os.path.join(out_dir, font + '.woff2')
    fb.save(otf)
    # 直接压 OTF 的字节：走 TTFont 再存一次会多绕一圈，而且那份路径压出来的字节
    # 在跨次构建时不稳定。这样 woff2 完全由确定性的 OTF 字节决定。
    with open(otf, 'rb') as src, open(woff2, 'wb') as dst:
        woff2_compress(src, dst)

    report.append((font, ps, len(names), len(cmap), dropped, absent, widths, cmap))


def main():
    pfb_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'pfb')
    out_dir = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.abspath(os.path.join(HERE, '..'))
    rows_of = load_cmap()
    report = []
    for fp in sorted(os.listdir(pfb_dir)):
        if not fp.endswith('.pfb') or fp.startswith('manfnt'):
            continue  # manfnt 字形名是 char00..char7f（无语义），无法做正确映射，留待后续
        font = fp[:-4].lower()
        print(f'... {font}', flush=True)
        build(os.path.join(pfb_dir, fp), font, rows_of[font], out_dir, report)

    # "挤掉"是 128+ 重复倾倒区的正常现象（同一名字已经在更低的码位占住了），只报数量。
    print('\n字体         family   字形  cmap   挤掉(重复倾倒区)  名字不在字体里')
    for font, ps, ng, nc, dropped, absent, _, _ in report:
        print(f'{font:<12} {ps:<8} {ng:>4} {nc:>5}  {len(dropped):>16}  {len(absent):>14}')
        for code, name in absent:
            print(f'     名字不在字体里 0x{code:02X} {name}')

    print('\n度量核验（OTF advance/1000 vs TFM width）:')
    for font, ps, ng, nc, dropped, absent, widths, cmap in report:
        tfm = os.path.join(TFM_DIR, font + '.tfm')
        if not os.path.exists(tfm):
            print(f'  {font}: 无 tfm，跳过')
            continue
        tw = tfm_widths(tfm)
        rows = rows_of[font]
        bad, checked = [], 0
        for code, name, u in rows:
            if code not in tw or code == 0x20:
                continue  # space 宽度来自 fontdimen2，与字形 advance 不是一回事
            gn = cmap.get(u)
            if gn is None:
                continue
            checked += 1
            diff = abs(widths.get(gn, 0) - tw[code] * UNITS_PER_EM)
            if diff > 1.0:
                bad.append((code, gn, tw[code] * UNITS_PER_EM, widths.get(gn, 0)))
        print(f'  {font}: 比对 {checked} 个码位，advance 不一致 {len(bad)}'
              + ('' if not bad else '  ' + '; '.join(
                  f'0x{c:02X} {n} tfm={a:.1f} otf={b:.1f}' for c, n, a, b in bad[:10])))


if __name__ == '__main__':
    main()
