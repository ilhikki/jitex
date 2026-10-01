import type { Suite } from '@jitex/integration'
import { assert, attach, attachText, cache, log, stage, suite } from '@jitex/integration'
import type { ImportMap } from 'jsr:@deno/emit@^0.46.0'
import { bundle } from 'jsr:@deno/emit@^0.46.0'
import { createTexStages } from '../tex/stages.ts'
import { INITIAL_TEX } from '../../web/initial-tex.js'

/*
 * build:jitex
 *
 *   deno task build:jitex
 */
const REPO_ROOT = new URL('../../../', import.meta.url)

const JITEX_VERSION = '0.1.0'
const BUILD_DIR = new URL('.build/jitex/', REPO_ROOT)
const DIST_DIR = new URL('dist/', REPO_ROOT)
const LIB_DIR = new URL('lib/', DIST_DIR)
const SITE_DIR = new URL('site/', DIST_DIR)

const SITE_FILES = ['index.html', 'styles.css', 'app.js', 'worker.js', 'initial-tex.js', 'logo-tex.js']

/**
 * Bare specifiers in generated modules: the bundle must be supplied explicitly,
 * without relying on the host's workspace configuration.
 */
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
  const buffer = new Uint8Array(bytes)
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function copyDir(src: URL, dst: URL): Promise<void> {
  await Deno.mkdir(dst, { recursive: true })
  for await (const entry of Deno.readDir(src)) {
    if (entry.isDirectory) {
      await copyDir(new URL(`${entry.name}/`, src), new URL(`${entry.name}/`, dst))
    } else {
      await Deno.copyFile(new URL(entry.name, src), new URL(entry.name, dst))
    }
  }
}

async function listFiles(dir: URL, prefix = ''): Promise<string[]> {
  const out: string[] = []
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isDirectory) {
      out.push(...await listFiles(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`))
    } else {
      out.push(`${prefix}${entry.name}`)
    }
  }
  return out
}

/**
 * The entry statically imports the generated tex program and asset modules, so
 * after bundling there is **no dynamic loading**: no fetch, no data:/Blob URL,
 * no import.meta dependency. This is why the same jitex.js runs in
 * browser / Worker / Deno / Node.
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
    `
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
    `
import { createTexEngine as createEngine } from '@jitex/tex-runtime'
import texProgram from './tex-program.js'
import { fonts, format, pool } from './assets.js'

export const version = ${JSON.stringify(JITEX_VERSION)}

export function createTexEngine(options = {}) {
  return createEngine({ program: texProgram, format, pool, fonts, ...options })
}
`,
  )

  return entry
}

const SMOKE_PLAIN = String.raw`Hello, \TeX!  $a^2 + b^2 = c^2$\par
`
/**
 * Declaring a "new size" font forces read_font_info to read cmr10.tfm. This is
 * why tfm files must be bundled with the release: without them only this case
 * fails.
 */
const SMOKE_FONT = String.raw`\font\big=cmr10 at 12pt \big Big text at 12pt\par
`

/**
 * No assertion gating: when reproducing a tex issue, the errored output itself
 * is what needs to be inspected.
 */
type SmokeRunResult =
  | { status: 'completed'; svgs: string[] }
  | { status: 'interrupted'; error: { message: string } }

interface JitexModule {
  createTexEngine: (o?: Record<string, unknown>) => {
    render: (tex: string, o?: Record<string, unknown>) => SmokeRunResult
  }
}

export function createBuildJitexSuite(): Suite {
  return suite('build jitex', ({ debug }) => {
    const isDebug = debug === 'true'
    log(`debug = ${isDebug}`)
    const tex = createTexStages(isDebug, { cachePlainFmt: true })

    const jitexStage = cache(stage(
      'bundle jitex.js',
      [tex.texJsStage, tex.plainFmtStage, tex.tfmFilesStage],
      async ([texFiles, plainFmt, tfmFiles]) => {
        const entry = await writeBundleInputs(texFiles.texJs, plainFmt.plainFmtBytes, texFiles.poolFile, tfmFiles)
        const { code } = await bundle(entry, { importMap: IMPORT_MAP })

        // dist is rebuilt from scratch every time: renamed/deleted artifacts must not linger.
        await Deno.remove(DIST_DIR, { recursive: true }).catch((error: unknown) => {
          if (!(error instanceof Deno.errors.NotFound)) {
            throw error
          }
        })
        await Deno.mkdir(LIB_DIR, { recursive: true })
        await Deno.writeTextFile(new URL('jitex.js', LIB_DIR), code)
        const codeBytes = new TextEncoder().encode(code)
        attach('jitex.js', codeBytes)

        // The program, format and fonts are produced in the same batch: record
        // this correspondence together with their fingerprints.
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
        await Deno.writeTextFile(new URL('jitex.manifest.json', LIB_DIR), manifestText)
        attach('jitex.manifest.json', new TextEncoder().encode(manifestText))

        log(`jitex.js = ${codeBytes.length} bytes (${manifest.sha256.slice(0, 12)}...)`)
        return { jitexBytes: codeBytes.length, jitexSha256: manifest.sha256 }
      },
    ))

    cache(stage('smoke: tex => svg', [jitexStage], async () => {
      // Only import the artifact itself: the thing under test must be the release build.
      const jitex = await import(new URL('jitex.js', LIB_DIR).href) as JitexModule
      assert(typeof jitex.createTexEngine === 'function', 'createTexEngine should be exported')
      const engine = jitex.createTexEngine()

      const attachRun = (prefix: string, run: SmokeRunResult, consoleText: string) => {
        const svgs = run.status === 'completed' ? run.svgs : []
        svgs.forEach((svg, i) => attach(`${prefix}.${i + 1}.svg`, new TextEncoder().encode(svg)))
        attachText(`${prefix}.console.txt`, consoleText)
        const pages = svgs.length
        const status = run.status === 'completed' ? 'ok' : `error: ${run.error.message}`
        log(`[${prefix}] ${status}  pages=${pages}`)
      }

      const runWith = (tex: string): [SmokeRunResult, string] => {
        let consoleText = ''
        const result = engine.render(tex, {
          onConsole: (chunk: string) => {
            consoleText += chunk
          },
        })
        return [result, consoleText]
      }

      const [plain, plainConsole] = runWith(SMOKE_PLAIN)
      attachRun('smoke-plain', plain, plainConsole)
      assert(plain.status === 'completed', `plain smoke: ${plain.status === 'completed' ? '' : plain.error.message}`)
      assert(plain.svgs.length >= 1, 'plain smoke: expected at least one page')

      const [font, fontConsole] = runWith(SMOKE_FONT)
      attachRun('smoke-font', font, fontConsole)
      assert(font.status === 'completed', `font smoke: ${font.status === 'completed' ? '' : font.error.message}`)
      assert(font.svgs.length >= 1, 'font smoke: expected at least one page')

      const [again] = runWith(SMOKE_PLAIN)
      assert(again.status === 'completed', `rerun failed: ${again.status === 'completed' ? '' : again.error.message}`)
      assert(
        again.svgs.length === plain.svgs.length,
        `rerun page count differs: ${plain.svgs.length} -> ${again.svgs.length}`,
      )
      assert(
        again.svgs[0] === plain.svgs[0],
        'rerun should produce identical SVG',
      )

      return { plainPages: plain.svgs.length, fontPages: font.svgs.length }
    }))

    // No assertion gating: when reproducing a tex issue, the errored output itself
    // is what needs to be inspected.
    stage('site tex => svg', [jitexStage], async () => {
      const jitex = await import(new URL('jitex.js', LIB_DIR).href) as JitexModule
      let consoleText = ''
      const run = jitex.createTexEngine().render(INITIAL_TEX, {
        onConsole: (chunk: string) => {
          consoleText += chunk
        },
      })

      const svgs = run.status === 'completed' ? run.svgs : []
      svgs.forEach((svg, i) => attach(`site.${i + 1}.svg`, new TextEncoder().encode(svg)))
      attachText('site.console.txt', consoleText)

      const status = run.status === 'completed' ? 'ok' : `error: ${run.error.message}`
      log(`[site] ${status}  pages=${svgs.length}`)
      return { sitePages: svgs.length }
    })

    /*
     * The manifest only **declares** fonts, it does not download them: the browser
     * fetches only the families actually used on the page (on-demand loading).
     *
     * Depends on jitexStage because it rebuilds dist (clearing it first); running
     * later would delete the fonts.
     */
    const fontsStage = cache(stage('copy fonts', [jitexStage], async () => {
      const fontDir = new URL('resources/fonts/', REPO_ROOT)
      const names: string[] = []
      for await (const entry of Deno.readDir(fontDir)) {
        if (entry.isFile && entry.name.endsWith('.woff2')) {
          names.push(entry.name)
        }
      }
      names.sort()

      await Deno.mkdir(new URL('fonts/', LIB_DIR), { recursive: true })
      const lines = []
      for (const name of names) {
        const bytes = await Deno.readFile(new URL(name, fontDir))
        await Deno.writeFile(new URL(`fonts/${name}`, LIB_DIR), bytes)
        // Family name = uppercase filename (CMR10...), matching the runtime resolveFont output.
        lines.push(
          `@font-face {\n  font-family: '${name.replace(/\.woff2$/, '').toUpperCase()}';\n` +
            `  src: url('./fonts/${name}') format('woff2');\n}`,
        )
      }
      const css = lines.join('\n') + '\n'
      assert(!/url\(\s*['"]?\//.test(css), 'fonts.css: resource paths must not start with / (would 404 on Pages)')
      await Deno.writeTextFile(new URL('fonts.css', LIB_DIR), css)
      attach('fonts.css', new TextEncoder().encode(css))
      log(`fonts: ${names.length} woff2 + fonts.css → dist/lib/`)
      return { fontFiles: names.length }
    }))

    /*
     * dist/site/ is a self-contained demo site: worker.js -> ./jitex.js and
     * index.html -> ./fonts.css resolve in place; GitHub Pages can host
     * dist/site/ directly.
     */
    const copySiteStage = stage('copy site', [jitexStage, fontsStage], async () => {
      await Deno.mkdir(SITE_DIR, { recursive: true })
      const siteSource = new URL('src/web/', REPO_ROOT)
      for (const name of SITE_FILES) {
        const bytes = await Deno.readFile(new URL(name, siteSource))
        await Deno.writeFile(new URL(name, SITE_DIR), bytes)
        attach(name, bytes)
        const text = new TextDecoder().decode(bytes)
        // GitHub Pages serves under /<repo>/: resource paths starting with / blank the page.
        assert(
          !/\s(?:src|href)="\//.test(text) && !/from '\//.test(text),
          `${name}: resource paths must not start with / (would 404 on Pages)`,
        )
      }
      await copyDir(LIB_DIR, SITE_DIR)
      const jitexFile = await Deno.stat(new URL('jitex.js', LIB_DIR))
      assert(jitexFile.size > 0, 'dist/lib/jitex.js must be produced in the same batch as the site')
      log(`site: ${SITE_FILES.join(' + ')} + dist/lib/ copied (self-contained)`)
      return { siteFiles: SITE_FILES.length }
    })

    const plainVisualStage = stage('plain-visual => html', [jitexStage, copySiteStage], async () => {
      const source = await Deno.readTextFile(new URL('resources/jitex/plain-visual.tex', REPO_ROOT))
      const jitex = await import(new URL('jitex.js', LIB_DIR).href) as JitexModule
      let consoleText = ''
      const run = jitex.createTexEngine().render(source, {
        onConsole: (chunk: string) => {
          consoleText += chunk
        },
      })

      const svgs = run.status === 'completed' ? run.svgs : []
      // language=HTML
      const html = `<!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>plain-visual</title>
        <link rel="stylesheet" href="./fonts.css">
        <style>
          body {
            display: flex;
            flex-direction: column;
            align-items: center;
            background-color: #DDD;
            gap: 20px;
          }

          svg {
            background-color: #FFF;
            padding: 48px 48px 64px 48px;
          }
        </style>
      </head>
      <body>
      ${svgs.join('\n')}
      </body>
      </html>
      `
      await Deno.writeTextFile(new URL('plain-visual.html', SITE_DIR), html)
      attach('plain-visual.html', new TextEncoder().encode(html))
      svgs.forEach((svg, i) => attach(`plain-visual.${i + 1}.svg`, new TextEncoder().encode(svg)))
      attachText('plain-visual.console.txt', consoleText)

      const status = run.status === 'completed' ? 'ok' : `error: ${run.error.message}`
      log(`[plain-visual] ${status}  pages=${svgs.length} → dist/site/`)
      return { plainVisualPages: svgs.length }
    })

    /*
     * Release split: site -> GitHub Pages, lib -> GitHub Release.
     */
    stage('publish', [jitexStage, fontsStage, copySiteStage, plainVisualStage], async () => {
      const names: string[] = []
      for (const area of ['lib', 'site']) {
        for (const rel of await listFiles(new URL(`${area}/`, DIST_DIR))) {
          names.push(`${area}/${rel}`)
        }
      }
      names.sort()
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
