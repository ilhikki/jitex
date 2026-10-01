import { createTexStages } from './stages.ts'
import { readFile } from '../utils.ts'
import { createMemoryFileStore, runJs } from '@jitex/runtime'
import type { PascalFileStore } from '@jitex/runtime'
import { ConsoleFile, texFormatKey, texRuntimeSyscalls } from '@jitex/tex-runtime'
import { dviToSvg } from '../../tex-runtime/render/mod.ts'
import { assert, attach, attachText, stage, type Suite, suite } from '@jitex/integration'

function createBootPlainSuite(): Suite {
  return suite('boot plain', ({ debug }) => {
    const isDebug = debug === 'true'
    const { texJsStage, plainFmtStage, tfmFilesStage } = createTexStages(isDebug)

    const validPlainFmtStage = stage(
      'valid plain fmt',
      [texJsStage, plainFmtStage],
      async ([texFiles, { plainFmtBytes }]) => {
        const files = new Map<string, PascalFileStore>()
        files.set(texFormatKey('TEX.POOL'), createMemoryFileStore(texFiles.poolFile))
        files.set('plain.fmt', createMemoryFileStore(plainFmtBytes))
        const tex = await readFile('./resources/knuth/plain/base/story.tex')
        files.set('story.tex', createMemoryFileStore(tex))
        const consoleFile = new ConsoleFile('&plain story \n\ \\bye \n')
        files.set('TTY:', consoleFile)
        const state = await runJs(texFiles.texJs, {
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

    stage('dvi => svg', [validPlainFmtStage, tfmFilesStage], ([{ dviData }, tfmFiles]) => {
      const svgs = dviToSvg(dviData, tfmFiles)
      for (const [index, svg] of svgs.entries()) {
        attachText(`story.${index + 1}.svg`, svg)
      }
      return { svgs }
    })
  })
}

function attachFile(name: string, store: PascalFileStore | undefined) {
  if (store !== undefined) {
    attach(name, store.getData())
  }
}

export default createBootPlainSuite()
