import { LOGO_TEX } from './logo-tex.js'

/**
 * 页面正文 = build:jitex 的初始 TeX（单一真源）。
 *
 * 两页：
 *   第一页——样例。数学与物理按**历史**排列（毕达哥拉斯到 univalence、
 *          阿基米德到费曼），末尾一段展示各个字面。
 *   第二页——能力。是什么、能排什么、我们是怎么做的、边界在哪。**不写接口用法**：
 *          这一页的读者是要排版的人，接口的读者是要集成的人，两种读者不混在一页。
 *
 * 标志（名字那五个字母）的定义与渲染在 logo-tex.js；这里只内插那段定义——站头与
 * 正文里的宏因此永远是同一行。
 *
 * 几个书写约束（否则这段源码自己会出问题）：
 *   - 不用反引号：TeX 的引号写成 \lq\lq ... \rq\rq；
 *   - 每个 $$ 后留一个空格：避免出现 ${ 触发模板插值（LOGO_TEX 那处插值是有意的）；
 *   - 提到 LaTeX 只能写纯文本：plain.tex 里没有 \LaTeX；
 *   - 源码里的注释也是给读者看的，所以写英文。
 */

export const INITIAL_TEX = String.raw`% Plain TeX, not LaTeX --- edit this, then press Ctrl/⌘ + Enter.
${LOGO_TEX}
\noindent \JiTex \quad \TeX82, in your browser.

\medskip
\noindent This page was set by \TeX82 itself. The next page says what it can
set, and how it is done.

\medskip
\noindent{\bf Mathematics.} \quad a chronology
$$ a^{2} + b^{2} = c^{2} \qquad {\rm Pythagoras, \sim500\ BC} $$
$$ x = {-b \pm \sqrt{b^{2} - 4ac} \over 2a} \qquad {\rm al-Khwarizmi, \sim820} $$
$$ \int_{a}^{b} f'(x)\,dx = f(b) - f(a) \qquad {\rm Newton, \ Leibniz, 1675} $$
$$ e^{i\pi} + 1 = 0 \qquad {\rm Euler, 1748} $$
$$ \int_{-\infty}^{\infty} e^{-x^{2}} dx = \sqrt{\pi} \qquad {\rm Gauss, 1812} $$
$$ \zeta(s) = \sum_{n=1}^{\infty} {1 \over n^{s}} = \prod_{p\ {\rm prime}} {1 \over 1 - p^{-s}} \qquad {\rm Riemann, 1859} $$
$$ (A = B) \simeq (A \simeq B) \qquad {\rm univalence, 2013} $$

\medskip
\noindent{\bf Physics.} \quad a chronology
$$ F_{1} d_{1} = F_{2} d_{2} \qquad {\rm Archimedes, \sim250\ BC} $$
$$ F = G {m_{1} m_{2} \over r^{2}} \qquad {\rm Newton, 1687} $$
$$ {d \over dt} \left( {\partial L \over \partial \dot q} \right) - {\partial L \over \partial q} = 0 \qquad {\rm Lagrange, 1788} $$
$$ \nabla \cdot {\bf E} = 4 \pi \rho, \qquad \nabla \cdot {\bf B} = 0 \qquad {\rm Maxwell, 1865} $$
$$ \nabla \times {\bf E} = -{1 \over c} {\partial {\bf B} \over \partial t}, \qquad \nabla \times {\bf B} = {1 \over c} (4 \pi {\bf J} + {\partial {\bf E} \over \partial t}) $$
$$ S = k \log W \qquad {\rm Boltzmann, 1877} $$
$$ R_{\mu \nu} - {1 \over 2} R g_{\mu \nu} + \Lambda g_{\mu \nu} = {8 \pi G \over c^{4}} T_{\mu \nu} \qquad {\rm Einstein, 1915} $$
$$ i \hbar {\partial \psi \over \partial t} = -{\hbar^{2} \over 2m} \nabla^{2} \psi + V \psi \qquad {\rm Schrodinger, 1926} $$
$$ (i \gamma^{\mu} \partial_{\mu} - m) \psi = 0 \qquad {\rm Dirac, 1928} $$
$$ \langle x' | e^{-iHt/\hbar} | x \rangle = \int {\cal D} x\, e^{iS[x]/\hbar} \qquad {\rm Feynman, 1948} $$

\medskip
\noindent{\bf The faces.} \quad Ten point roman, {\bf bold}, {\it italic},
{\tt typewriter}, {\font\scc=cmcsc10 \scc Small Caps} and
{\font\bigfont=cmr10 at 24pt \bigfont 24 pt}; ligatures in a
{\it flowing final}; \lq\lq quotes\rq\rq\ like these, an em dash---like that.

\medskip
\noindent Edit this text and press Ctrl/$\mathsurround=0pt$+ Enter.

\eject
\noindent \JiTex \quad what it can set.

\beginsection 1. The two pages

The first page is a specimen: mathematics and physics in the order they were
found. This page says what \TeX\ can set, and how it is done.

\beginsection 2. What it is

JiTex runs \TeX82 --- Knuth's own program --- in the browser. You give it a
document, and it sets every page of it.

\beginsection 3. What it sets

\noindent Mathematics, in line or displayed: fractions, radicals, big operators,
matrices, accents, arrows, the Greek alphabet. Alignments, by
{\tt\char92 halign}, {\tt\char92 settabs} or {\tt\char92 matrix}. Boxes and
rules, so that a page can be laid out and not merely flowed. Line breaking,
page breaking, and the paragraph shapes that go with them. Faces --- roman,
bold, italic, typewriter, small caps --- and any other design, or any size, that
you name with {\tt\char92 font}. And {\tt\char92 def}, for notation of your own:
the name above is one.

\beginsection 4. How we do it

\noindent \TeX\ is a program. So the work was not to write a typesetting
program: it was to make \TeX's own program run here.

\medskip
\noindent{\bf A Pascal compiler.} \quad Knuth's \TeX\ is written in Pascal, and
{\tt tex.web} is the source he published. We wrote a Pascal compiler, and it
compiles that source as it stands. TANGLE, the tool that pulls the Pascal out of
{\tt tex.web}, is compiled by the same compiler. Nothing of the program itself
was rewritten for the browser.

\medskip
\noindent That is the whole method, and it is worth saying why it is the method.
A re-implementation would be a new program, with faults of its own: it could
look right and still decide differently. A compiler keeps the original the
original. Between Knuth's source and the page in front of you there is exactly
one thing of ours --- the compiler --- and it is allowed to be wrong; what it
cannot do is quietly change what the program means.

\medskip
\noindent{\bf The same for the measurements.} \quad Line and page breaks are
made out of character widths, so the widths matter as much as the program. Every
face here takes its widths from the same {\tt .tfm} files that \TeX\ reads, and
its outlines are the Computer Modern of the American Mathematical Society, not a
redrawn approximation. The lines break where Knuth's would break.

\beginsection 5. Limits

\noindent{\bf Engine and format.} \quad \TeX82 is the engine. {\tt plain.tex} is
one format written for it, and the one here. LaTeX is another format, far
larger, on the same engine. What is absent here is that layer: document classes,
packages, hyperlinks, microtype. None of it is absent from the engine; all of it
is written above the engine.

\medskip
\noindent{\bf Of JiTex.} \quad A page comes out as a finished drawing, not as
reflowable text. The line breaks were decided by \TeX\ and are baked into the
result: a page cannot reflow like a web page, and its text is not selectable as
prose. And a run is not interruptible from the outside.

\beginsection 6. Where it comes from

\TeX82 and {\tt plain.tex} are Donald Knuth's. The typefaces are the Computer
Modern of the American Mathematical Society and Bluesky, under the SIL Open Font
License.
`
