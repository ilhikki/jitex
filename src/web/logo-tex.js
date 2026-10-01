
export const LOGO_TEX = String.raw`\def\JiTex{\hbox{J\kern-.05em\lower.5ex\hbox{I}\kern-.02em\TeX}}`
export const LOGO_DOC = String.raw`${LOGO_TEX}
\output={\shipout\box255}
\font\logo=cmr10 at 20pt
\setbox0=\hbox{\logo\JiTex}
\hsize=\wd0
\vsize=\ht0
\maxdepth=\dp0
\noindent\box0`
