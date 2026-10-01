import re
import sys
from os import listdir, makedirs, path

HERE = path.dirname(path.abspath(__file__))
REPO = path.dirname(path.dirname(path.dirname(HERE)))
BUILD = path.join(REPO, ".build", "fonts")

AFM_DIR = sys.argv[1] if len(sys.argv) > 1 else path.join(HERE, "afm")
OUT = path.join(BUILD, "afm-analyze.txt")
CM = re.compile(r"^C\s+(-?\d+)\s*;\s*WX\s+(\S+)\s*;\s*N\s+(\S+)\s*;")


def read_afm(p):
    d = {}
    for line in open(p, encoding="latin-1"):
        m = CM.match(line.rstrip("\n"))
        if m and int(m.group(1)) >= 0:
            d[int(m.group(1))] = m.group(3)
    return d


makedirs(BUILD, exist_ok=True)
fh = open(OUT, "w", encoding="utf-8", newline="\n")


def w(s=""):
    fh.write(s + "\n")
    fh.flush()


try:
    fonts = sorted(f[:-4] for f in listdir(AFM_DIR) if f.endswith(".afm"))
    w(f"=== AFM encoding analysis ({len(fonts)} fonts)")

    sig_map = {}
    for font in fonts:
        afm = read_afm(path.join(AFM_DIR, font + ".afm"))
        sig_map.setdefault(tuple(afm.get(c) for c in range(128)), []).append(font)

    groups = sorted(sig_map.items(), key=lambda kv: -len(kv[1]))
    base = groups[0][0]
    w(f"=== distinct 0..127 encoding signatures: {len(groups)}")
    for i, (sig, fs) in enumerate(groups, 1):
        miss = [c for c, n in enumerate(sig) if n is None]
        w()
        w(f"[{i}] missing {len(miss):>3} slots  {len(fs)} fonts: {' '.join(fs)}")
        if miss:
            w(f"    hole code points: {miss}")
        if i > 1:
            diff = [c for c in range(128) if base[c] != sig[c]]
            w(f"    differs from [1] in {len(diff)} slots: {diff}")

    for i, (sig, fs) in enumerate(groups, 1):
        w()
        w(f"--- [{i}] {' '.join(fs)}")
        for c in range(128):
            n = sig[c]
            if n is None:
                continue
            mark = ""
            if i > 1 and base[c] != n:
                mark = f"   <== [1] is {base[c]}"
            w(f"  {c:>3} 0x{c:02X}  {n}{mark}")
finally:
    fh.close()
    print("done")
