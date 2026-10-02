import { LOGO_TEX } from './logo-tex.js'


export const INITIAL_TEX = String.raw`% Plain TeX, not LaTeX --- edit this, then press Ctrl + Enter.
${LOGO_TEX}

\def\Color#1#2{{\special{color push #1}#2\special{color pop}}}
\noindent This page is a specimen: Ferrari's method for the quartic, set by \JiTex, running \TeX82.

\bigskip
\noindent Assume
$$ x^4 + a x^3 + b x^2 + c x + d = 0. $$

\bigskip
\noindent Then
$$ \eqalign{
 x &= y - {a \over 4}, \cr
 \noalign{\vskip 8pt}
 y^4 + p y^2 + q y + r &= 0, \cr
}$$
with
$$ \eqalign{
 p &= b - {3a^2 \over 8}, \cr
 \noalign{\vskip 8pt}
 q &= c - {ab \over 2} + {a^3 \over 8}, \cr
 \noalign{\vskip 8pt}
 r &= d - {ac \over 4} + {a^2 b \over 16} - {3a^4 \over 256}. \cr
}$$

\bigskip
\noindent Then
$$ \eqalign{
 \left( y^2 + {p \over 2} \right)^2 &= -q y - r + {p^2 \over 4}, \cr
 \noalign{\vskip 8pt}
 \left( y^2 + {p \over 2} + m \right)^2
   &= 2m y^2 - q y + \left( m p + m^2 - r + {p^2 \over 4} \right). \cr
}$$

\bigskip
\noindent So
$$ \eqalign{
 q^2 - 4(2m)\left( m p + m^2 - r + {p^2 \over 4} \right) &= 0, \cr
 \noalign{\vskip 8pt}
 8m^3 + 8p m^2 + (2p^2 - 8r)m - q^2 &= 0. \cr
}$$

\bigskip
\noindent Thus
$$ \eqalign{
 \left( y^2 + {p \over 2} + m \right)^2
   &= \left( \sqrt{2m}\, y - {q \over 2\sqrt{2m}} \right)^2, \cr
 \noalign{\vskip 8pt}
 y^2 + {p \over 2} + m
   &= \pm \left( \sqrt{2m}\, y - {q \over 2\sqrt{2m}} \right), \qquad m \neq 0. \cr
}$$

\bigskip
\noindent Then the four roots $x_1, x_2, x_3, x_4$ satisfy
$$ \eqalign{
 \sum_{i=1}^4 x_i &= -a, \cr
 \noalign{\vskip 8pt}
 \sum_{1 \le i < j \le 4} x_i x_j &= b, \cr
 \noalign{\vskip 8pt}
 \sum_{1 \le i < j < k \le 4} x_i x_j x_k &= -c, \cr
 \noalign{\vskip 8pt}
 x_1 x_2 x_3 x_4 &= d. \cr
}$$

\medskip
\noindent{\bf The faces.} \quad Ten point roman, {\bf bold}, {\it italic},
{\tt typewriter}, {\font\scc=cmcsc10 \scc Small Caps} and
{\font\bigfont=cmr10 at 24pt \bigfont 24 pt}; ligatures in a
{\it flowing final}; \lq\lq quotes\rq\rq\ like these, an em dash---like that;
and color, {\Color{rgb 1 0 0}{red}}, {\Color{rgb 0 0 1}{blue}}, and
{\Color{rgb 0 1 0}{green}}.

\vfill
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
License.`
