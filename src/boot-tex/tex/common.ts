import { attach, attachText, type Stage, stage } from '@jitex/integration'
import { bytesToString, createMemoryFileStore, runJs } from '@jitex/runtime'
import type { PascalFileStore } from '@jitex/runtime'
import { ConsoleFile, texFontKey, texFormatKey, texRuntimeSyscalls } from '@jitex/tex-runtime'
import { runTangleJs, validRunTangleResult } from '../tangle/build-tangle.ts'
import { readFile, readTextFile } from '../utils.ts'
import { transformTex } from './build-tex.ts'

export interface TexCollect {
  texJs: string
  poolFile: Uint8Array
  plainFmtBytes: Uint8Array
  fontsJson: string
  tfmFiles: Record<string, Uint8Array>
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

async function loadFiles(basePath: string, fileNames: string[]): Promise<Record<string, Uint8Array>> {
  const data: Record<string, Uint8Array> = {}
  for (const fileName of fileNames) {
    const fileData = await readFile(basePath + fileName)
    data[fileName] = fileData
  }
  return data
}

function extractPreloadedFonts(plainTex: string): string[] {
  const names = new Set<string>()
  for (const match of plainTex.matchAll(/\\font\s*\\?[a-zA-Z@]+\s*=\s*([a-zA-Z0-9]+)/g)) {
    names.add(match[1])
  }
  return [...names].sort()
}

function makeGetInitexStage(
  tangleCollect: Stage<{ tangleJs: string }>,
  tripCollect: Stage<void>,
): Stage<{ texJs: string; poolFile: Uint8Array }> {
  return stage('tex: get initex').deps([tangleCollect, tripCollect], async ({ tangleJs }) => {
    const texWeb = await readTextFile('./resources/knuth/tex/tex.web')
    const result = validRunTangleResult(await runTangleJs(tangleJs, texWeb, undefined))
    attachText('tex.pas', result.pasFile)
    attach('tex.pool', result.poolFile)
    const texJs = transformTex(result.pasFile, false)
    attachText('tex.js', texJs)
    return { texJs, poolFile: result.poolFile }
  })
}

function makeLoadBaseFilesStage(tripCollect: Stage<void>): Stage<Record<string, Uint8Array>> {
  return stage('tex: load base files').dep(tripCollect, async () => {
    return await loadFiles('./resources/knuth/plain/base/', baseFileNames)
  })
}

function makeLoadPlainTfmStage(tripCollect: Stage<void>): Stage<Record<string, Uint8Array>> {
  return stage('tex: load plain tfm files').dep(tripCollect, async () => {
    const cm = await loadFiles('./resources/knuth/plain/fonts/cm/', tfmNames)
    const man = await loadFiles('./resources/knuth/plain/fonts/manfnt/', ['manfnt.tfm'])
    return { ...cm, ...man }
  })
}

function makeGetPlainFmtStage(
  texJsStage: Stage<{ texJs: string; poolFile: Uint8Array }>,
  baseFilesStage: Stage<Record<string, Uint8Array>>,
  tfmFilesStage: Stage<Record<string, Uint8Array>>,
): Stage<{ plainFmtBytes: Uint8Array; fontsJson: string }> {
  return stage('tex: get plain.fmt').deps(
    [texJsStage, baseFilesStage, tfmFilesStage],
    async (texFiles, baseFiles, tfmFiles) => {
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
}

function makeCollectStage(
  getInitex: Stage<{ texJs: string; poolFile: Uint8Array }>,
  tfmFilesStage: Stage<Record<string, Uint8Array>>,
  plainFmtStage: Stage<{ plainFmtBytes: Uint8Array; fontsJson: string }>,
): Stage<TexCollect> {
  return stage('tex: collect').deps([getInitex, tfmFilesStage, plainFmtStage], (initex, tfmFiles, plainFmt) => ({
    texJs: initex.texJs,
    poolFile: initex.poolFile,
    plainFmtBytes: plainFmt.plainFmtBytes,
    fontsJson: plainFmt.fontsJson,
    tfmFiles,
  }))
}

export function registerTexCommon(
  tangleCollect: Stage<{ tangleJs: string }>,
  tripCollect: Stage<void>,
): Stage<TexCollect> {
  const texJsStage = makeGetInitexStage(tangleCollect, tripCollect)
  const baseFilesStage = makeLoadBaseFilesStage(tripCollect)
  const tfmFilesStage = makeLoadPlainTfmStage(tripCollect)
  const plainFmtStage = makeGetPlainFmtStage(texJsStage, baseFilesStage, tfmFilesStage)
  return makeCollectStage(texJsStage, tfmFilesStage, plainFmtStage)
}
