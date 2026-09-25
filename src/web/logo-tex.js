/**
 * 标志的 TeX：一段定义（LOGO_TEX）、一段渲染文档（LOGO_DOC）。
 *
 * 名字有三个寄存器：小写 jitex 只用于标识符与产物（jitex.js、@jitex/*、build:jitex）；
 * 正文写 JiTex；标志是 \JiTex 排出来的那五个字母。
 *
 * 渲染文档把定义内插进来，页面正文也一样内插它（见 initial-tex.js）。于是站头与正文
 * 里那个宏永远是同一个东西：改了定义，两处一起变。
 */

/**
 * 标志的定义：名字的后三个字母正好是 T、E、X，所以标志就是 "Ji" 接上 Knuth 的 \TeX。
 * 那三条让人觉得舒服的细节——E 压到 T 的横条下、E 沉半 ex、E 的右下接 X 的左下——
 * 全部来自 plain.tex 里他自己写的那一行；我们一个数都不加，也不改。
 *
 * 只有 I 是我们的，走的是 E 的同一条路：把自己沉下去，只是沉得更多——大写 I 落到
 * 小写的位置，看着像小写，其实还是那个大写 I。
 */
export const LOGO_TEX = String.raw`\def\JiTex{\hbox{J\kern-.05em\lower.5ex\hbox{I}\kern-.02em\TeX}}`
/**
 * 标志的渲染文档：排一行，页面上就只有这一行。
 *
 * \output 换掉，只 shipout 内容本身。plain.tex 的 \plainoutput 会把页面套成
 * \vbox{\makeheadline\pagebody\makefootline}：\pagebody 撑到 \vsize（8.9in），
 * \makefootline 印 \folio——标志于是变成一整页，还带个页码。
 *
 * 尺寸也要自己管：TeX 的每个行盒都是 \hbox to\hsize，而页面输出时 box255 还会被
 * 打包到 \vsize、深度再被截到 \maxdepth。所以先把标志量成盒子，把这三个数都收成它
 * ——\vsize 管高，\maxdepth 放行那个沉下去的 I。
 */
export const LOGO_DOC = String.raw`${LOGO_TEX}
\output={\shipout\box255}
\font\logo=cmr10 at 20pt
\setbox0=\hbox{\logo\JiTex}
\hsize=\wd0
\vsize=\ht0
\maxdepth=\dp0
\noindent\box0`
