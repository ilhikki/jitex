import { assert, attach, attachText, log, stage, suite } from '@jitex/integration'
import type { Suite } from '@jitex/integration'
import { bundle } from 'jsr:@deno/emit@^0.46.0'
import type { ImportMap } from 'jsr:@deno/emit@^0.46.0'
import { createTexStages } from '../tex/stages.ts'
import { INITIAL_TEX } from '../../web/initial-tex.js'

/*
 * build:jitex —— 发布流水线：把 TeX82 的编译产物 + 预建格式 + 字符串池 + 字体打成
 * **一个自包含的 jitex.js**（全部内联），再用产物本身冒烟。
 *
 *   deno task build:jitex
 *
 * 本文件在 src/boot-tex/jitex/，仓库根 = 上三级
 */
const REPO_ROOT = new URL('../../../', import.meta.url)

/*
 * 十二段：
 *   1 build tangle.js    自举 TANGLE                    → tangle.js
 *   2 get initex         编译 tex.web                   → tex.pas / tex.pool / tex.js
 *   3 load base files    读 plain 的素材                → 内存
 *   4 load plain tfm     读 plain 用的 TFM              → 内存
 *   5 get plain.fmt      INITEX 建格式                  → plain.fmt / fonts.json
 *   6 bundle jitex.js    内联成单文件                    → dist/jitex.js + manifest
 *   7 smoke: tex ⇒ svg   用产物跑两个用例                → smoke-*.dvi / *.svg / *.log
 *   8 site tex ⇒ dvi+svg 官网正文那段 tex 的产物          → site.dvi / site.N.svg / site.log
 *   9 copy site          拷官网（5 个静态文件）          → dist/index.html · styles.css · app.js · initial-tex.js · logo-tex.js
 *  10 copy fonts         拷 CM 字体 + 生成清单           → dist/fonts/*.woff2 · fonts.css
 *  11 smoke: site        用 DOM 桩把官网真跑一遍          → （断言）
 *  12 publish            发布检查（体积 / sha256）        → dist.manifest.txt
 *
 * 这是发布套件：产物即发布物，阶段可缓存，报告里每段都有 artifact 与日志。
 */

const JITEX_VERSION = '0.1.0'
const BUILD_DIR = new URL('.build/jitex/', REPO_ROOT)
const DIST_DIR = new URL('dist/', REPO_ROOT)

/** 官网的静态文件（非包，原样拷进 dist；app.js 引用同目录的 jitex.js、initial-tex.js 与 logo-tex.js） */
const SITE_FILES = ['index.html', 'styles.css', 'app.js', 'initial-tex.js', 'logo-tex.js']

/** 生成模块里的 bare specifier：bundle 需要显式给出（不依赖宿主的工作区配置） */
const IMPORT_MAP: ImportMap = {
  baseUrl: REPO_ROOT,
  imports: {
    '@jitex/runtime': new URL('src/runtime/mod.ts', REPO_ROOT).href,
    '@jitex/tex-runtime': new URL('src/tex-runtime/mod.ts', REPO_ROOT).href,
  },
}

function base64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // 拷进普通 ArrayBuffer 再摘要：调用方的 Uint8Array 可能是共享/子视图
  const buffer = new Uint8Array(bytes)
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 生成 bundle 的输入模块，返回入口 URL。
 *
 * 入口静态 import 生成的 tex 程序与资产模块——于是 bundle 之后**没有任何动态装载**：
 * 没有 fetch、没有 data: / Blob URL、没有 import.meta 依赖。这正是 jitex.js 能在
 * 浏览器 / Worker / Deno / Node 里跑同一份代码的原因。
 */
async function writeBundleInputs(
  texJs: string,
  format: Uint8Array,
  pool: Uint8Array,
  fonts: Record<string, Uint8Array>,
): Promise<URL> {
  await Deno.mkdir(BUILD_DIR, { recursive: true })

  await Deno.writeTextFile(new URL('tex-program.js', BUILD_DIR), texJs)

  const fontEntries = Object.keys(fonts).sort()
    .map((name) => `  ${JSON.stringify(name)}: b64(${JSON.stringify(base64(fonts[name]))}),`)
    .join('\n')
  await Deno.writeTextFile(
    new URL('assets.js', BUILD_DIR),
    `// 由 build:jitex 生成：预建格式、字符串池与字体（base64）。勿手改。
function b64(s) {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
export const format = b64(${JSON.stringify(base64(format))})
export const pool = b64(${JSON.stringify(base64(pool))})
export const fonts = {
${fontEntries}
}
`,
  )

  const entry = new URL('entry.js', BUILD_DIR)
  await Deno.writeTextFile(
    entry,
    `// 由 build:jitex 生成：jitex.js 的入口（零配置门面）。勿手改。
import { createTexEngine as createEngine, dviToSvg } from '@jitex/tex-runtime'
import texProgram from './tex-program.js'
import { fonts, format, pool } from './assets.js'

export { dviToSvg }
export const version = ${JSON.stringify(JITEX_VERSION)}

/** 装载一次即得引擎；options 可覆盖 maxSteps，或补充 plain 未预加载的字体 */
export function createTexEngine(options = {}) {
  return createEngine({ program: texProgram, format, pool, fonts, ...options })
}
`,
  )

  return entry
}

/** 最小 DOM 桩：只实现官网用到的那几个接口，用来在无浏览器环境里跑一遍产物 */
interface StubElement {
  id: string
  textContent: string
  innerHTML: string
  className: string
  value: string
  disabled: boolean
  scrollTop: number
  scrollHeight: number
  children: StubElement[]
  appendChild(child: StubElement): void
  addEventListener(type: string, fn: (event: StubKeyboardEvent) => void): void
}

interface StubKeyboardEvent {
  key?: string
  ctrlKey?: boolean
  metaKey?: boolean
  preventDefault?: () => void
}

function createStubDom(): { document: unknown; byId: (id: string) => StubElement } {
  const elements = new Map<string, StubElement>()

  const make = (id: string): StubElement => ({
    id,
    textContent: '',
    innerHTML: '',
    className: '',
    value: '',
    disabled: false,
    scrollTop: 0,
    scrollHeight: 0,
    children: [],
    appendChild(child: StubElement) {
      this.children.push(child)
    },
    addEventListener(_type: string, _fn: (event: StubKeyboardEvent) => void) {},
  })

  const byId = (id: string): StubElement => {
    let element = elements.get(id)
    if (element === undefined) {
      element = make(id)
      elements.set(id, element)
    }
    return element
  }

  return {
    document: {
      getElementById: (id: string) => byId(id),
      createElement: (_tag: string) => make(''),
    },
    byId,
  }
}

/** 用例 A：plain 的预加载字体，不需要读任何 tfm */
const SMOKE_PLAIN = String.raw`Hello, \TeX!  $a^2 + b^2 = c^2$\par
`
/**
 * 用例 B：声明一个"新尺寸"的字体 → 必然走 read_font_info → 读 cmr10.tfm。
 * 这是 tfm 必须随发布一起内联的原因：去掉 tfm 时只有这个用例会红。
 */
const SMOKE_FONT = String.raw`\font\big=cmr10 at 12pt \big Big text at 12pt\par
`

/**
 * 官网正文那段 tex 的产物：dvi + 每页 svg + log，全部进报告，点开就能与网页对照。
 * 不用断言守门——改 tex 复现问题时，报错的产物本身就是要看的东西。
 */
interface SmokeRunResult {
  svgs: string[]
  dvi: Uint8Array
  status: string
  steps: number
  error: { message: string } | undefined
  missingFonts: string[]
}

/** 产物 jitex.js 的公共面（只声明本套件用到的那部分） */
interface JitexModule {
  createTexEngine: (o?: Record<string, unknown>) => {
    render: (tex: string, o?: Record<string, unknown>) => SmokeRunResult & { log: string | undefined }
  }
}

export function createBuildJitexSuite(): Suite {
  return suite('build jitex', ({ debug }) => {
    const isDebug = debug === 'true'
    log(`debug = ${isDebug}`)
    const tex = createTexStages(isDebug, { cachePlainFmt: true })

    const jitexStage = stage(
      'bundle jitex.js',
      [tex.texJsStage, tex.plainFmtStage, tex.tfmFilesStage],
      async ([texFiles, plainFmt, tfmFiles]) => {
        const entry = await writeBundleInputs(texFiles.texJs, plainFmt.plainFmtBytes, texFiles.poolFile, tfmFiles)
        const { code } = await bundle(entry, { importMap: IMPORT_MAP })

        // 发布目录每次重建：改过名/删过的产物不许残留（Pages 上是直接对外的那份）
        await Deno.remove(DIST_DIR, { recursive: true }).catch((error: unknown) => {
          if (!(error instanceof Deno.errors.NotFound)) {
            throw error
          }
        })
        await Deno.mkdir(DIST_DIR, { recursive: true })
        await Deno.writeTextFile(new URL('jitex.js', DIST_DIR), code)
        const codeBytes = new TextEncoder().encode(code)
        attach('jitex.js', codeBytes)

        // 程序与格式/字体是**同批产出**的：把这份对应关系与指纹一起记下来
        const manifest = {
          name: 'jitex',
          version: JITEX_VERSION,
          bytes: codeBytes.length,
          sha256: await sha256Hex(codeBytes),
          assets: {
            'tex.js': {
              bytes: texFiles.texJs.length,
              sha256: await sha256Hex(new TextEncoder().encode(texFiles.texJs)),
            },
            'tex.pool': {
              bytes: texFiles.poolFile.length,
              sha256: await sha256Hex(texFiles.poolFile),
            },
            'plain.fmt': {
              bytes: plainFmt.plainFmtBytes.length,
              sha256: await sha256Hex(plainFmt.plainFmtBytes),
            },
            fonts: Object.keys(tfmFiles).sort(),
          },
          fonts: JSON.parse(plainFmt.fontsJson) as unknown,
        }
        const manifestText = JSON.stringify(manifest, undefined, 2)
        await Deno.writeTextFile(new URL('jitex.manifest.json', DIST_DIR), manifestText)
        attach('jitex.manifest.json', new TextEncoder().encode(manifestText))

        log(`jitex.js = ${codeBytes.length} bytes (${manifest.sha256.slice(0, 12)}…)`)
        return { jitexBytes: codeBytes.length, jitexSha256: manifest.sha256 }
      },
    )

    const smokeStage = stage('smoke: tex ⇒ svg', [jitexStage], async () => {
      // 只 import 产物本身：被测的必须是发布物
      const jitex = await import(new URL('jitex.js', DIST_DIR).href) as JitexModule
      assert(typeof jitex.createTexEngine === 'function', 'createTexEngine should be exported')
      const engine = jitex.createTexEngine()

      const attachRun = (prefix: string, run: SmokeRunResult & { log: string | undefined }) => {
        attach(`${prefix}.dvi`, run.dvi)
        attach(`${prefix}.log`, new TextEncoder().encode(run.log ?? ''))
        run.svgs.forEach((svg, i) => attach(`${prefix}.${i + 1}.svg`, new TextEncoder().encode(svg)))
        log(`[${prefix}] status=${run.status} steps=${run.steps} pages=${run.svgs.length} dvi=${run.dvi.length}`)
      }

      const plain = engine.render(SMOKE_PLAIN, { jobName: 'smoke-plain' })
      attachRun('smoke-plain', plain)
      assert(plain.status === 'terminated', `plain smoke: status = ${plain.status} ${plain.error?.message ?? ''}`)
      assert(plain.svgs.length >= 1, 'plain smoke: expected at least one page')
      assert(plain.missingFonts.length === 0, `plain smoke: unmapped fonts ${plain.missingFonts.join(', ')}`)

      const font = engine.render(SMOKE_FONT, { jobName: 'smoke-font' })
      attachRun('smoke-font', font)
      assert(font.status === 'terminated', `font smoke: status = ${font.status} ${font.error?.message ?? ''}`)
      assert(font.svgs.length >= 1, 'font smoke: expected at least one page')
      assert(font.missingFonts.length === 0, `font smoke: unmapped fonts ${font.missingFonts.join(', ')}`)

      // 同一引擎重复运行必须互不污染（每次 render 自造 ctx 与全部 store）
      const again = engine.render(SMOKE_PLAIN, { jobName: 'smoke-plain' })
      assert(
        again.dvi.length === plain.dvi.length,
        `rerun should be identical: ${plain.dvi.length} → ${again.dvi.length}`,
      )

      return { plainPages: plain.svgs.length, fontPages: font.svgs.length }
    })

    // 官网正文那段 tex 的产物：dvi + 每页 svg + log，全部进报告，点开就能与网页对照。
    // 不用断言守门——改 tex 复现问题时，报错的产物本身就是要看的东西。
    stage('site tex ⇒ dvi + svg', [jitexStage], async () => {
      const jitex = await import(new URL('jitex.js', DIST_DIR).href) as JitexModule
      const run = jitex.createTexEngine().render(INITIAL_TEX, { jobName: 'site' })

      attach('site.dvi', run.dvi)
      // 二进制 dvi 在报告里点不开，另给一份可读的字节文本
      attachText('site.dvi.txt', run.dvi.join(', '))
      attachText('site.log', run.log ?? '')
      run.svgs.forEach((svg, i) => attach(`site.${i + 1}.svg`, new TextEncoder().encode(svg)))

      log(`[site] status=${run.status} steps=${run.steps} pages=${run.svgs.length} dvi=${run.dvi.length}`)
      if (run.error) {
        log(`[site] error: ${run.error.message}`)
      }
      return { sitePages: run.svgs.length }
    })

    const siteStage = stage('copy site', [jitexStage], async () => {
      // 官网是几个静态文件，原样拷进 dist：index.html 引用 ./styles.css 与
      // `<script type="module" src="./app.js">`，app.js 再 import 同目录的 jitex.js。
      //
      // 不内联、也不另打一份 jitex：页面用的就是发布的那个库文件，同批产出、版本一致。
      const siteSource = new URL('src/web/', REPO_ROOT)
      for (const name of SITE_FILES) {
        const bytes = await Deno.readFile(new URL(name, siteSource))
        await Deno.writeFile(new URL(name, DIST_DIR), bytes)
        attach(name, bytes)
        const text = new TextDecoder().decode(bytes)
        // GitHub Pages 挂在 /<repo>/ 下：出现以 / 开头的资源路径就会白屏
        assert(
          !/\s(?:src|href)="\//.test(text) && !/from '\//.test(text),
          `${name}: 不能出现以 / 开头的资源路径（Pages 下会 404）`,
        )
      }
      const jitexFile = await Deno.stat(new URL('jitex.js', DIST_DIR))
      assert(jitexFile.size > 0, 'dist/jitex.js 必须与官网同批产出')
      log(`site: ${SITE_FILES.join(' + ')}（app.js 引用同目录 jitex.js）`)
      return { siteFiles: SITE_FILES.length }
    })

    /*
     * 字体：resources/fonts/ 的 woff2 原样拷进 dist/fonts/，并按文件名生成 @font-face 清单。
     * 清单只**声明**、不下载——浏览器只为页面上真正用到的族取文件，这就是按需加载。
     * 依赖 jitexStage 是因为它负责重建 dist（先清空），晚跑会把字体删掉。
     */
    const fontsStage = stage('copy fonts', [jitexStage], async () => {
      const fontDir = new URL('resources/fonts/', REPO_ROOT)
      const names: string[] = []
      for await (const entry of Deno.readDir(fontDir)) {
        if (entry.isFile && entry.name.endsWith('.woff2')) {
          names.push(entry.name)
        }
      }
      names.sort()

      await Deno.mkdir(new URL('fonts/', DIST_DIR), { recursive: true })
      const lines = ['/* 由 build:jitex 生成：CM 字体清单（源自 resources/fonts/）。勿手改。 */']
      for (const name of names) {
        const bytes = await Deno.readFile(new URL(name, fontDir))
        await Deno.writeFile(new URL(`fonts/${name}`, DIST_DIR), bytes)
        // 族名 = 文件名大写（CMR10…），与运行期 resolveFont 的输出一致
        lines.push(
          `@font-face {\n  font-family: '${name.replace(/\.woff2$/, '').toUpperCase()}';\n` +
            `  src: url('./fonts/${name}') format('woff2');\n}`,
        )
      }
      const css = lines.join('\n') + '\n'
      assert(!/url\(\s*['"]?\//.test(css), 'fonts.css: 不能出现以 / 开头的资源路径（Pages 下会 404）')
      await Deno.writeTextFile(new URL('fonts.css', DIST_DIR), css)
      attach('fonts.css', new TextEncoder().encode(css))
      log(`fonts: ${names.length} 个 woff2 + fonts.css`)
      return { fontFiles: names.length }
    })

    const siteSmokeStage = stage('smoke: site', [siteStage], async () => {
      // 官网也是发布物，同样**用产物本身**验证：装一个最小 DOM 桩，把 dist/app.js
      // （连同它 import 的 jitex.js）真跑一遍。没有浏览器也能挡住"字段名 / 元素 id
      // 写错"这类只在页面里才暴露的错误。
      const dom = createStubDom()
      const hadDocument = 'document' in globalThis
      ;(globalThis as { document?: unknown }).document = dom.document
      try {
        await import(new URL('app.js', DIST_DIR).href)
        // 官网在末尾自动跑一次；run() 里先让出一次事件循环再同步执行
        await new Promise((resolve) => setTimeout(resolve, 2000))
      } finally {
        if (!hadDocument) {
          delete (globalThis as { document?: unknown }).document
        }
      }

      const runInfo = dom.byId('run-info').textContent
      const consoleText = dom.byId('console').textContent
      const pageCount = dom.byId('pages').children.length
      log(`[site] run: ${runInfo} · pages=${pageCount}`)
      assert(
        /^\d+ pages? · \d+ ms$/.test(runInfo),
        `site: 控制台标题右侧应是"页数 · 耗时"，实际 = ${runInfo}`,
      )
      assert(pageCount >= 1, 'site: 至少应渲染出一页')
      assert(
        dom.byId('logo').innerHTML.includes('<svg'),
        'site: 左上角标志应由引擎排出来（#logo 里没有 SVG）',
      )
      assert(
        dom.byId('pages').children[0].innerHTML.includes('<svg'),
        'site: 页面容器里应该是 SVG',
      )
      assert(consoleText.includes('Output written on'), 'site: 控制台应有 TeX 的 transcript')

      return { sitePages: pageCount }
    })

    stage('publish', [jitexStage, smokeStage, siteSmokeStage, fontsStage], async () => {
      const names = [...SITE_FILES, 'fonts.css', 'jitex.js', 'jitex.manifest.json']
      const lines: string[] = []
      for (const name of names) {
        const bytes = await Deno.readFile(new URL(name, DIST_DIR))
        lines.push(`${name}\t${bytes.length}\t${(await sha256Hex(bytes)).slice(0, 12)}`)
      }
      const listing = lines.join('\n')
      log(`dist:\n${listing}`)
      attach('dist.manifest.txt', new TextEncoder().encode(listing))
      return { distFiles: names.length }
    })
  })
}

export default createBuildJitexSuite()
