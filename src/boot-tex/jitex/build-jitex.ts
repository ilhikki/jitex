import { assert, attach, log, stage, suite } from '@jitex/integration'
import type { Suite } from '@jitex/integration'
import { bundle } from 'jsr:@deno/emit@^0.46.0'
import type { ImportMap } from 'jsr:@deno/emit@^0.46.0'
import { createTexStages } from '../tex/stages.ts'

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
 * 七段：
 *   1 build tangle.js    自举 TANGLE                    → tangle.js
 *   2 get initex         编译 tex.web                   → tex.pas / tex.pool / tex.js
 *   3 get plain.fmt      INITEX 建格式                  → plain.fmt / fonts.json
 *   4 bundle jitex.js    内联成单文件                    → dist/jitex.js + manifest
 *   5 smoke: tex ⇒ svg   用产物跑两个用例                → smoke-*.dvi / *.svg / *.log
 *   6 bundle demo        打演示站点（适配层范本）         → dist/index.html / app.js / worker.js
 *   7 publish            发布检查（体积 / sha256）        → dist.manifest.txt
 *
 * 这是发布套件：产物即发布物，阶段可缓存，报告里每段都有 artifact 与日志。
 */

const JITEX_VERSION = '0.1.0'
const BUILD_DIR = new URL('.build/jitex/', REPO_ROOT)
const DIST_DIR = new URL('dist/', REPO_ROOT)

/** 演示页的静态文件（适配层范本，零构建，相对路径引用同目录的 jitex.js） */
const DEMO_FILES = ['index.html', 'styles.css', 'app.js', 'worker.js']

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

/** 用例 A：plain 的预加载字体，不需要读任何 tfm */
const SMOKE_PLAIN = String.raw`Hello, \TeX!  $a^2 + b^2 = c^2$\par
`
/**
 * 用例 B：声明一个"新尺寸"的字体 → 必然走 read_font_info → 读 cmr10.tfm。
 * 这是 tfm 必须随发布一起内联的原因：去掉 tfm 时只有这个用例会红。
 */
const SMOKE_FONT = String.raw`\font\big=cmr10 at 12pt \big Big text at 12pt\par
`

interface SmokeRunResult {
  svgs: string[]
  dvi: Uint8Array
  status: string
  steps: number
  error: { message: string } | undefined
  missingFonts: string[]
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
      const jitex = await import(new URL('jitex.js', DIST_DIR).href) as {
        createTexEngine: (o?: Record<string, unknown>) => {
          render: (tex: string, o?: Record<string, unknown>) => SmokeRunResult & { log: string | undefined }
        }
      }
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

    const demoStage = stage('bundle demo', [jitexStage], async () => {
      // 演示页是**适配层范本**，本身零构建：四个静态文件直接拷进 dist，用相对路径
      // 引用同目录的 jitex.js。所以这里不再打 jitex.js——打了就重复 1.5MB，还可能版本不一。
      const demoSource = new URL('src/web/', REPO_ROOT)
      for (const name of DEMO_FILES) {
        const bytes = await Deno.readFile(new URL(name, demoSource))
        await Deno.writeFile(new URL(name, DIST_DIR), bytes)
        attach(name, bytes)
        if (name.endsWith('.html') || name.endsWith('.js') || name.endsWith('.css')) {
          const text = new TextDecoder().decode(bytes)
          // GitHub Pages 挂在 /<repo>/ 下：绝对路径会白屏
          assert(
            !/(?:src|href)="\/|from '\//.test(text),
            `${name}: 不能出现以 / 开头的资源路径（Pages 下会 404）`,
          )
        }
      }
      const jitexFile = await Deno.stat(new URL('jitex.js', DIST_DIR))
      assert(jitexFile.size > 0, 'dist/jitex.js must exist (demo 与库必须同批产出)')
      log(`demo: ${DEMO_FILES.join(', ')} (引用同目录 jitex.js)`)
      return { demoFiles: DEMO_FILES.length }
    })

    stage('publish', [jitexStage, smokeStage, demoStage], async () => {
      const names = [...DEMO_FILES, 'jitex.js', 'jitex.manifest.json']
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
