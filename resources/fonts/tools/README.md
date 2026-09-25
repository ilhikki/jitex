# `resources/fonts/tools/` —— 字体是怎么做出来的

这个目录是**一次性工具**：从 CTAN 的 Computer Modern Type 1 字体做出 `resources/fonts/*.otf`
与 `*.woff2`，并给出渲染端用的字符编码表。构建期（`build:jitex`）只负责拷贝产物，不跑这些脚本。

```
CTAN fonts/amsfonts/pfb/*.pfb ─┐
                               ├─ gen-encodings.py ─→ src/…/plain/encodings.ts   （入库）
CTAN fonts/amsfonts/afm/*.afm ─┘                    └─→ .build/fonts/cm-map.json  （中间物）
                                                              │
                                    gen_cm_fonts.py ──────────┘
                                          └─→ resources/fonts/{*.otf, *.woff2}    （入库）
```

`afm-analyze.py` 不参与产出，它只回答「到底有几种编码」，是下面设计理由的证据来源。

---

## 一、为什么这么设计

### 1. 要真 Unicode，不要"只有我们看得懂"的映射

我们的字体是给人用的：用户应该能拿 `cmr10.woff2` 去排**他自己的**文档，而不是只能塞进
jitex 里当一张私有字形表。所以 cmap 必须是真 Unicode —— 不接受在私用区里随便放字母、
也不接受把 Unicode 字符映射到错误字形（接口一旦不是 Unicode，这个字体对外就没用了）。

**因此没用现成的 BaKoMa 版本**：它的 cmap 大量指向私用区，正是这里要避免的。

### 2. 要无损轮廓，用 Type 1(CFF) 而不是 TTF

CFF 是三次贝塞尔，与 METAFONT 的曲线表示同构，**转出来是无损的**；TTF 的 `glyf` 是二次贝塞尔，
必须做近似。所以我们从 AMS/Bluesky 的 Type 1 出发（`fonts/amsfonts/pfb/`），而不是从 TTF 出发。

同理，**不做伪粗**：CM 的每个变体（`cmbx10` 粗体、`cmti10` 斜体、`cmtt10` 等宽、`cmr5`/`cmr7`
不同设计尺寸）在源头就是**独立字体文件**。所以 `@font-face` 里不写 `weight` / `style` ——
写了浏览器会去同一族里找粗体变体，找不到就合成伪字形，反而毁掉真 CM。

### 3. 关键发现：TeX 并不全局用 OT1

一开始我们假设"CM 字体就是 OT1 编码"，把 75 个字体全按一张 OT1 表映射。这是错的，而且错得
很整片：`\tt` 文本、`cmtex`、`cmr5`、`cmcsc10` 的字符会成批落到错误的字形上。

权威来源不是 `map/cm.map`（那里只有 `cmr10 CMR10 <cmr10.pfb>`，没有编码信息），而是同目录下
**每个字体自己的 `*.afm`**：`C 码位 ; WX 宽 ; N 字形名` 就是"这个字体在哪个码位放哪个字形"。

把 75 个字体按「0..127 位的字形名序列」聚类（`afm-analyze.py`），得到 **10 种互不相同的编码**：

| 族 | 字体 | 是什么 |
|---|---|---|
| `ot1` | cmr* cmbx* cmss* cmssi* cmsl* cmb10 cmdunh10 cmvtt10 cmssq* cmssdc10 cmbxsl10（36 个） | 就是 OT1 |
| `ot1-italic` | cmti* cmbxti10 cmu10 cmff10 cmfi10 cmfib8 | OT1，只差 1 位：`0x24` 是 `sterling`(£) 而不是 `$` |
| `ot1-nolig` | cmr5、cmcsc10 | OT1 无连字：`0x0B..0x0F` 是箭头与引号，`0x3C`/`0x3E` 是 `<`/`>` |
| `ot1-tt` | cmtt* cmsltt10 cmtcsc10 | 打字机：`" { } \ ^ _ ~ < >` 与 `0x20` 全部不同 |
| `ot1-tt-italic` | cmitt10 | 打字机 + `0x24` 是 £ |
| `tex` | cmtex8/9/10 | TEX 编码：`0x00..0x1F` 整段是数学符号 |
| `cmmi` | cmmi* cmmib10 | 数学斜体 |
| `cmsy` | cmsy* cmbsy10 | 数学符号 |
| `cmex` | cmex10 | 大号运算符、可伸缩定界符 |
| `inch` | cminch | 只有 `space` `-` `0-9` `A-Z` |

**同名不同义**也真实存在：`cmsy` 里的 `bar` 是 `\mid`（U+2223）、`backslash` 是 `\setminus`（U+2216），
而文本字体里的 `bar`/`backslash` 就是 `|` 和 `\`。所以映射按 `(族, 名字)` 取值，不是全局一张表。

### 4. 三层判据

1. **码位 → 字形名**：AFM 说了算（客观事实，不猜）。
2. **字形名 → Unicode**：AGL 打底，TeX 专名覆盖。AGL 对数学字体的名字经常给错，甚至给到私用区 ——
   例如 `Delta` 给成 U+2206（增量）、`Omega` 给成 U+2126（欧姆）、`mu` 给成 U+00B5（微符号）、
   `zerooldstyle` 给成 U+F730。这些逐条在 `NAME_OVERRIDE` 里改对了。
3. **一族内多个字形抢同一个 Unicode**：不给真 Unicode，改在**私用区 U+E000 起**留一个位置。

第 3 条是明说的取舍。CM 里同一个"形"有多个尺寸档（`\big(` `\Big(` `\bigg(` `\Bigg(` 是四个
不同字形），而 Unicode 只有"一个左圆括号"；`\sum` 的 text 档与 display 档同理。硬映射到同一个
码位就会**错档**（display 的 `\sum` 画成 text 那么小）。

试过的两个替代方案都不行：

- **用 CM 原码**（cmex 的 `0x00..0x7F`）：会撞 ASCII 和控制字符，`U+0012` 连 XML 都不合法。
- **只保一档**：`\Big(` 会画成 `\big(`，是可见的错误。

现在的做法：每个这样的字形在私用区拿一个**专用保留位**（按名字序稳定分配，共 95 个），
`encodings.ts` 与字体的 cmap **指向同一个位置**。代价是 `cmex10` 这类"多档同形"的字体放弃了
Unicode 语义（`U+E044` 不代表任何字符，就是"第 3 档左圆括号"）；**文本字体完全不受影响** ——
它们的 `0x00..0x7F` 全是真 Unicode，用户拿 `cmr10.woff2` 排自己的文档仍然是对的。

---

## 二、怎么复现

需要 Python + `fontTools`（要 woff2 支持：`pip install "fonttools[woff]" brotli`）。
脚本里一切路径都相对本目录/仓库根，不依赖当前工作目录。

```bash
# 1. 下载两份原始素材（放到本目录下，已 gitignore）
#    pfb/  ← https://mirrors.ctan.org/fonts/amsfonts/pfb/    （解开得到 *.pfb）
#    afm/  ← https://mirrors.ctan.org/fonts/amsfonts/afm/    （解开得到 *.afm）
#    manfnt 不在其中：它的字形名是 char00..char7f，没有语义，无法做正确映射，
#    我们只把它当 TFM 用（见 resources/README.md）。

# 2. 看一眼"到底有几种编码"（可选，但这是设计理由的证据）
python afm-analyze.py                     # 读 ./afm → .build/fonts/afm-analyze.txt

# 3. 生成编码表：AFM → encodings.ts + cm-map.json
python gen-encodings.py                   # 读 ./afm → src/tex-runtime/render/plain/encodings.ts
                                          #            + .build/fonts/{cm-map.json, encodings-report.txt}

# 4. 生成字体：PFB + cm-map.json → OTF/woff2
python gen_cm_fonts.py                    # 读 ./pfb → ../{*.otf, *.woff2}
```

第 4 步会顺带做**度量核验**：每个字形的 advance 必须等于对应 TFM 的宽度（TFM 取自
`resources/knuth/plain/fonts/cm/`）。这是 DVI 绝对定位的前提，对不上就说明码位与字形配错了。

**复现对了的样子**（数字是当前产物）：

- `gen-encodings.py` 输出 `fonts=75 groups=10 pua=95`，报告里
  「一族内多个字形抢同一个 Unicode」为**空**；「ot1 基准逐位差异」应恰好 1 处
  （`0x20`：这个位置的字形叫 `suppress`，它有自己的轮廓但"suppress"这个名字没有 Unicode 身份，
  真正的空白是另一个字形 `space`，所以按第 3 条给了私用区保留位）。
- `gen_cm_fonts.py` 的「advance 不一致」应只剩两处，且都是**原始素材自身**的微小出入，
  不是我们映射错了：`cmssdc10` 的 `C`（606.9 vs 609）、`cmtex9` 的 `arrowleft/arrowright`（525 vs 547）。
- 产物数量：`resources/fonts/` 下 75 个 `*.otf` + 75 个 `*.woff2`。

生成是**字节确定**的：`head` 的时间戳被钉成 AMS 的发布日期，woff2 直接压 OTF 的字节
（走 `TTFont` 再存一次那条路径跨次构建不稳定）。所以重跑一遍**不会改动仓库里任何文件**，
产物可以直接用哈希核对——这也是"复现对不对"最硬的判据。

## 三、产物去向与"改了要一起改"

| 产物 | 谁在用 |
|---|---|
| `resources/fonts/*.{otf,woff2}` | `build:jitex` 原样拷进 `dist/fonts/`，并由文件名生成 `dist/fonts.css` 的 `@font-face`（族名 = 文件名大写，如 `CMEX10`） |
| `src/tex-runtime/render/plain/encodings.ts` | 渲染端 `resolveUnicode`：DVI 字体名 → 族表 → Unicode |
| `.build/fonts/*` | 只是审计报告与中间物，不入库 |

**这两份产物必须同源**：`encodings.ts` 决定渲染端打出哪个码位，字体 cmap 决定那个码位画哪个字形。
所以字体改了一定要重跑 `gen-encodings.py` 再跑 `gen_cm_fonts.py`，顺序不能反（后者吃前者的
`cm-map.json`）。改完还要重跑 `deno task build:jitex` 把新的 woff2 拷进 `dist/`。

## 四、已知取舍与遗留

- 私用区保留位：见上（第 3 条）。这是为了保住"文本字体是纯 Unicode"而付的代价。
- `manfnt`：不产出，理由见上。
- `cmsy` 的 `\not`（`0x36`，字形名 `negationslash`）：Unicode 里只有"组合用长斜线叠符"
  （U+0338）这一个身份，本架构下能不能画对还没肉眼确认过。
- 只核验了 **advance**，没有核验轮廓本身。要肉眼比对轮廓，见 git 历史里的一次性脚本
  思路：直接把 PFB 轮廓画成 SVG，左本字体右 `cmr10`。
