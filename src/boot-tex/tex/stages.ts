import { attach, attachText, cache, stage } from '@jitex/integration'
import type { Stage } from '@jitex/integration'
import { bytesToString, createMemoryFileStore, runJs } from '@jitex/runtime'
import type { PascalFileStore } from '@jitex/runtime'
import { ConsoleFile, texFontKey, texFormatKey, texRuntimeSyscalls } from '@jitex/tex-runtime'
import { runTangleJs, validRunTangleResult } from '../tangle/build-tangle.ts'
import { readFile, readTextFile } from '../utils.ts'
import { createStageOfGetTangleJs, transformTex } from './build-tex.ts'

/*
 * TeX82 的公共阶段：自举 TANGLE → 编译 tex.js → 攒 INITEX 的输入 → 建 plain.fmt。
 *
 * boot-plain（测试）与 build:jitex（发布）共用同一套，避免两处各写一遍。
 * 阶段名保持与原 boot-plain 一致，报告与缓存条目对得上。
 */

/** 阶段 1：自举 TANGLE，产出 tangle.js */
export type TangleJsStage = Stage<{ tangleJs: string }>
/** 阶段 2：用 tangle.js 处理 tex.web，编译出 tex.js 与 pool */
export type TexJsStage = Stage<{ texJs: string; poolFile: Uint8Array }>
/** INITEX 的输入素材 */
export type BaseFilesStage = Stage<Record<string, Uint8Array>>
export type TfmFilesStage = Stage<Record<string, Uint8Array>>
/** 阶段 3：跑 INITEX（`\input plain \dump`）产出 plain.fmt 与"随格式预加载的字体"清单 */
export type PlainFmtStage = Stage<{ plainFmtBytes: Uint8Array; fontsJson: string }>

export interface TexStages {
  tangleJsStage: TangleJsStage
  texJsStage: TexJsStage
  baseFilesStage: BaseFilesStage
  tfmFilesStage: TfmFilesStage
  plainFmtStage: PlainFmtStage
}

const tfmNames = [
  'cmb10.tfm',
  'cmbsy10.tfm',
  'cmbx10.tfm',
  'cmbx12.tfm',
  'cmbx5.tfm',
  'cmbx6.tfm',
  'cmbx7.tfm',
  'cmbx8.tfm',
  'cmbx9.tfm',
  'cmbxsl10.tfm',
  'cmbxti10.tfm',
  'cmcsc10.tfm',
  'cmdunh10.tfm',
  'cmex10.tfm',
  'cmff10.tfm',
  'cmfi10.tfm',
  'cmfib8.tfm',
  'cminch.tfm',
  'cmitt10.tfm',
  'cmmi10.tfm',
  'cmmi12.tfm',
  'cmmi5.tfm',
  'cmmi6.tfm',
  'cmmi7.tfm',
  'cmmi8.tfm',
  'cmmi9.tfm',
  'cmmib10.tfm',
  'cmr10.tfm',
  'cmr12.tfm',
  'cmr17.tfm',
  'cmr5.tfm',
  'cmr6.tfm',
  'cmr7.tfm',
  'cmr8.tfm',
  'cmr9.tfm',
  'cmsl10.tfm',
  'cmsl12.tfm',
  'cmsl8.tfm',
  'cmsl9.tfm',
  'cmsltt10.tfm',
  'cmss10.tfm',
  'cmss12.tfm',
  'cmss17.tfm',
  'cmss8.tfm',
  'cmss9.tfm',
  'cmssbx10.tfm',
  'cmssdc10.tfm',
  'cmssi10.tfm',
  'cmssi12.tfm',
  'cmssi17.tfm',
  'cmssi8.tfm',
  'cmssi9.tfm',
  'cmssq8.tfm',
  'cmssqi8.tfm',
  'cmsy10.tfm',
  'cmsy5.tfm',
  'cmsy6.tfm',
  'cmsy7.tfm',
  'cmsy8.tfm',
  'cmsy9.tfm',
  'cmtcsc10.tfm',
  'cmtex10.tfm',
  'cmtex8.tfm',
  'cmtex9.tfm',
  'cmti10.tfm',
  'cmti12.tfm',
  'cmti7.tfm',
  'cmti8.tfm',
  'cmti9.tfm',
  'cmtt10.tfm',
  'cmtt12.tfm',
  'cmtt8.tfm',
  'cmtt9.tfm',
  'cmu10.tfm',
  'cmvtt10.tfm',
]

const baseFileNames = [
  'plain.tex',
  'hyphen.tex',
]

async function loadFiles(basePath: string, fileNames: string[]) {
  const data: Record<string, Uint8Array> = {}
  for (const fileName of fileNames) {
    const fileData = await readFile(basePath + fileName)
    data[fileName] = fileData
  }
  return data
}

/**
 * plain.tex 里 `\font\tenrm=cmr10` 这类声明 → 随格式预加载的字体文件清单。
 *
 * 预加载意味着它们的度量已随 plain.fmt 一起 dump（tex.web 的 store_fmt_file 会
 * dump font_info），运行期用这些字体不需要 tfm；但**换尺寸**（`at 12pt` / `scaled`）
 * 或换字体名时会走 read_font_info 去读 tfm——所以 jitex 仍要带 tfm。
 */
function extractPreloadedFonts(plainTex: string): string[] {
  const names = new Set<string>()
  for (const match of plainTex.matchAll(/\\font\s*\\?[a-zA-Z@]+\s*=\s*([a-zA-Z0-9]+)/g)) {
    names.add(match[1])
  }
  return [...names].sort()
}

export function createTexStages(
  isDebug: boolean,
  options: { cachePlainFmt?: boolean } = {},
): TexStages {
  const tangleJsStage = cache(createStageOfGetTangleJs(isDebug))

  const texJsStage = cache(stage('get initex', [tangleJsStage], async ([{ tangleJs }]) => {
    const texWeb = await readTextFile('./resources/knuth/tex/tex.web')
    const result = validRunTangleResult(await runTangleJs(tangleJs, texWeb, undefined))
    attachText('tex.pas', result.pasFile)
    attach('tex.pool', result.poolFile)
    const texJs = transformTex(result.pasFile)
    attachText('tex.js', texJs)
    return { texJs, poolFile: result.poolFile }
  }))

  const baseFilesStage = cache(stage('load base files', [], async () => {
    return await loadFiles('./resources/knuth/plain/base/', baseFileNames)
  }))

  const tfmFilesStage = cache(stage('load plain tfm files', [], async () => {
    const cm = await loadFiles('./resources/knuth/plain/fonts/cm/', tfmNames)
    const man = await loadFiles('./resources/knuth/plain/fonts/manfnt/', ['manfnt.tfm'])
    return { ...cm, ...man }
  }))

  const plainFmtStage = stage(
    'get plain.fmt',
    [texJsStage, baseFilesStage, tfmFilesStage],
    async ([texFiles, baseFiles, tfmFiles]) => {
      const files = new Map<string, PascalFileStore>()
      for (const [name, data] of Object.entries(baseFiles)) {
        files.set(name, createMemoryFileStore(data))
      }
      for (const [name, data] of Object.entries(tfmFiles)) {
        files.set(texFontKey(name), createMemoryFileStore(data))
      }
      files.set(texFormatKey('TEX.POOL'), createMemoryFileStore(texFiles.poolFile))
      const consoleFile = new ConsoleFile('\\input plain \\dump \n')
      files.set('TTY:', consoleFile)

      attach('hyphen.tex.txt', baseFiles['hyphen.tex'])
      const state = await runJs(texFiles.texJs, {
        files,
        extraSyscalls: texRuntimeSyscalls(),
      })
      attachText('console.log', consoleFile.getOutput())
      attachText('debug.log', state.debugLog.join('\n'))

      const plainLogStore = state.files.get('plain.log')
      if (plainLogStore !== undefined) {
        attach('plain.log', plainLogStore.getData())
      }
      const plainFmtStore = files.get('plain.fmt')
      if (plainFmtStore === undefined) {
        throw new Error(`plain.fmt not produced (status = ${state.status})`)
      }
      const plainFmtBytes = plainFmtStore.getData()
      attach('plain.fmt', plainFmtBytes)

      // 支持范围要可知：哪些字体随格式走、哪些靠 tfm 文件
      const fontsJson = JSON.stringify(
        {
          preloaded: extractPreloadedFonts(bytesToString(baseFiles['plain.tex'])),
          available: Object.keys(tfmFiles).sort(),
        },
        undefined,
        2,
      )
      attachText('fonts.json', fontsJson)
      return { plainFmtBytes, fontsJson }
    },
  )

  return {
    tangleJsStage,
    texJsStage,
    baseFilesStage,
    tfmFilesStage,
    plainFmtStage: options.cachePlainFmt ? cache(plainFmtStage) : plainFmtStage,
  }
}
