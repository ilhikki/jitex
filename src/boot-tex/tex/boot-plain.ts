import { createTexStages } from './stages.ts'
import { readFile } from '../utils.ts'
import { createMemoryFileStore, runJs } from '@jitex/runtime'
import type { PascalFileStore } from '@jitex/runtime'
import { ConsoleFile, texFormatKey, texRuntimeSyscalls } from '@jitex/tex-runtime'
import { dviToSvg } from '../../tex-runtime/render/mod.ts'
import { assert, attach, attachText, stage, type Suite, suite } from '@jitex/integration'

/*
 * boot plain：用自举出来的 jitex 编译器编译 tex.web，建 plain.fmt，再用 plain 排版 story.tex
 * 并渲染成 SVG。
 *
 * 前四段（tangle → tex.js → 素材 → plain.fmt）是 TeX 侧的公共阶段，与 build:jitex 共用，
 * 见 tex/stages.ts。
 */
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
      // 带上 tfm：渲染端据此按规范推进 h（否则位置只能交给渲染端的字体度量）
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
