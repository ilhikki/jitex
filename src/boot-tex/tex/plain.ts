import { assert, attach, attachText, stage, type Stage } from '@jitex/integration'
import { createMemoryFileStore, runJs } from '@jitex/runtime'
import type { PascalFileStore } from '@jitex/runtime'
import { ConsoleFile, texFormatKey, texRuntimeSyscalls } from '@jitex/tex-runtime'
import { dviToSvg } from '../../tex-runtime/render/mod.ts'
import type { TexCollect } from './common.ts'
import { readFile } from '../utils.ts'

function attachFile(name: string, store: PascalFileStore | undefined) {
  if (store !== undefined) {
    attach(name, store.getData())
  }
}

function makeValidPlainFmtStage(
  texCollect: Stage<TexCollect>,
  tripCollect: Stage<void>,
): Stage<{ dviData: Uint8Array }> {
  return stage(
    'plain: valid plain fmt',
    [texCollect, tripCollect],
    async ([{ texJs, poolFile, plainFmtBytes }]) => {
      const files = new Map<string, PascalFileStore>()
      files.set(texFormatKey('TEX.POOL'), createMemoryFileStore(poolFile))
      files.set('plain.fmt', createMemoryFileStore(plainFmtBytes))
      const tex = await readFile('./resources/knuth/plain/base/story.tex')
      files.set('story.tex', createMemoryFileStore(tex))
      const consoleFile = new ConsoleFile('&plain story \n\ \\bye \n')
      files.set('TTY:', consoleFile)
      const state = await runJs(texJs, {
        files,
        extraSyscalls: texRuntimeSyscalls(),
      })
      attachText('console.log', consoleFile.getOutput())
      attachText('debug.log', state.debugLog.join('\n'))
      attachFile('story.log', state.files.get('story.log'))
      const dviFileStore = state.files.get('story.dvi')
      assert(dviFileStore !== undefined, 'dvi file store not found')
      const dviData = dviFileStore.getData()
      assert(dviData.length === 680, 'story.dvi length should be 680 bytes')
      attach('story.dvi', dviData)
      attachText('story.dvi.txt', dviData.join(', '))
      return { dviData }
    },
  )
}

function makeDviToSvgStage(
  validPlainFmtStage: Stage<{ dviData: Uint8Array }>,
  texCollect: Stage<TexCollect>,
): Stage<{ svgs: string[] }> {
  return stage('plain: dvi => svg', [validPlainFmtStage, texCollect], ([{ dviData }, { tfmFiles }]) => {
    const svgs = dviToSvg(dviData, tfmFiles)
    for (const [index, svg] of svgs.entries()) {
      attachText(`story.${index + 1}.svg`, svg)
    }
    return { svgs }
  })
}

function makeCollectStage(dviToSvg: Stage<{ svgs: string[] }>): Stage<void> {
  return stage('plain: collect', [dviToSvg], () => {})
}

export function registerPlain(texCollect: Stage<TexCollect>, tripCollect: Stage<void>): Stage<void> {
  const validPlainFmtStage = makeValidPlainFmtStage(texCollect, tripCollect)
  const dviToSvgStage = makeDviToSvgStage(validPlainFmtStage, texCollect)
  return makeCollectStage(dviToSvgStage)
}
