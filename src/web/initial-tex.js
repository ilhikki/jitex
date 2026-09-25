/**
 * 页面正文 = build:jitex 的初始 TeX —— 同一段内容，两处共用（单一真源）。
 *
 * 它同时是三样东西：
 *   1. 官网首页的正文：这段 TeX 由 jitex 自己排版，页面正文就是它的输出；
 *   2. 能力的展示：数学与物理按**历史**排列——从毕达哥拉斯到 univalence、
 *      从阿基米德到费曼；
 *   3. 字形探针：公式故意覆盖根号、可变大小括号、\hbar、\cal、\langle、
 *      大运算符、希腊字母等各类字形。**哪一行在页面上坏掉，就说明那个字形
 *      还没接上**；全部接上时，这一页也就全对了。
 *
 * 两个书写约束（否则这段源码自己会出问题）：
 *   - 不用反引号：TeX 的引号写成 \lq\lq ... \rq\rq；
 *   - 每个 $$ 后留一个空格：避免出现 ${ 触发模板插值。
 */
export const INITIAL_TEX = String.raw`% 改这里，然后按 Ctrl/⌘ + Enter
\noindent {\bf jitex} \quad \TeX82, in your browser.

\medskip
\noindent This page is typeset by the program it describes: Knuth's \TeX82
itself, TANGLEd from {\tt tex.web} and INITEXed with {\tt plain.tex}, running
in your browser. Engine, format and fonts are inlined into a single file:
no WebAssembly, no worker, no network.

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
\noindent{\bf Type.} \quad Ten point roman, {\bf bold}, {\it italic},
{\tt typewriter} and {\font\scc=cmcsc10 \scc Small Caps}; ligatures in a
{\it flowing final};
\lq\lq quotes\rq\rq\ like these, an em dash---like that; and a larger size:
{\font\bigfont=cmr10 at 24pt \bigfont 24 pt}. Edit this text and press
Ctrl/$\mathsurround=0pt$+ Enter: DVI first, then SVG, transcript below.
`
