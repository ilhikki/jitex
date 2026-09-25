"""把 *.afm 的 "C 码位 ; N 字形名" 抽出来，回答「到底有几种编码」。

这是"我们的字体为何这么设计"的证据来源：把 75 个字体按「0..127 位的字形名序列」
聚类，得到 10 种互不相同的编码（文本/斜体/无连字/打字机/打字机斜体/cmtex/cmmi/
cmsy/cmex/cminch），并列出每种编码与 OT1 的逐位差异。没有这份证据就会误以为
"TeX 全局用 OT1"，那么 \tt、cmtex、cmr5 这些族的字符会整片映射错。

输出：.build/fonts/afm-analyze.txt
用法：python afm-analyze.py [afm 目录]     # 默认 ./afm
"""

import re
import sys
from os import listdir, makedirs, path

HERE = path.dirname(path.abspath(__file__))
REPO = path.dirname(path.dirname(path.dirname(HERE)))  # resources/fonts/tools → 仓库根
BUILD = path.join(REPO, '.build', 'fonts')

AFM_DIR = sys.argv[1] if len(sys.argv) > 1 else path.join(HERE, 'afm')
OUT = path.join(BUILD, 'afm-analyze.txt')
CM = re.compile(r'^C\s+(-?\d+)\s*;\s*WX\s+(\S+)\s*;\s*N\s+(\S+)\s*;')


def read_afm(p):
    d = {}
    for line in open(p, encoding='latin-1'):
        m = CM.match(line.rstrip('\n'))
        if m and int(m.group(1)) >= 0:
            d[int(m.group(1))] = m.group(3)
    return d


makedirs(BUILD, exist_ok=True)
fh = open(OUT, 'w', encoding='utf-8', newline='\n')


def w(s=''):
    fh.write(s + '\n')
    fh.flush()


try:
    fonts = sorted(f[:-4] for f in listdir(AFM_DIR) if f.endswith('.afm'))
    w(f'=== AFM 编码分析（{len(fonts)} 个字体）')

    sig_map = {}
    for font in fonts:
        afm = read_afm(path.join(AFM_DIR, font + '.afm'))
        sig_map.setdefault(tuple(afm.get(c) for c in range(128)), []).append(font)

    groups = sorted(sig_map.items(), key=lambda kv: -len(kv[1]))
    base = groups[0][0]
    w(f'=== 0..127 编码签名数：{len(groups)}')
    for i, (sig, fs) in enumerate(groups, 1):
        miss = [c for c, n in enumerate(sig) if n is None]
        w()
        w(f'[{i}] 缺 {len(miss):>3} 位   {len(fs)} 个字体：{" ".join(fs)}')
        if miss:
            w(f'    空洞码位：{miss}')
        if i > 1:
            diff = [c for c in range(128) if base[c] != sig[c]]
            w(f'    与 [1] 相比 {len(diff)} 位不同：{diff}')

    for i, (sig, fs) in enumerate(groups, 1):
        w()
        w(f'--- [{i}] {" ".join(fs)}')
        for c in range(128):
            n = sig[c]
            if n is None:
                continue
            mark = ''
            if i > 1 and base[c] != n:
                mark = f'   <== [1] 是 {base[c]}'
            w(f'  {c:>3} 0x{c:02X}  {n}{mark}')
finally:
    fh.close()
    print('done')
