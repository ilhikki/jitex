import { createStageOfGetTangleJs, texExtraSyscalls, transformTex } from './build-tex.ts'
import { ConsoleFile, readFile, readTextFile } from '../utils.ts'
import { runTangleJs, validRunTangleResult } from '../tangle/build-tangle.ts'
import { createMemoryFileStore, runJs } from '@jitex/runtime'
import type { PascalFileStore } from '@jitex/runtime'
import { assert, attach, attachText, cache, stage, type Suite, suite } from '@jitex/integration'

function createBootPlainSuite(): Suite {
  return suite('boot plain', ({ debug }) => {
    const isDebug = debug === 'true'
    const tangleJsStage = cache(createStageOfGetTangleJs(isDebug))

    const getTexStage = cache(stage('get initex', [tangleJsStage], async ([{ tangleJs }]) => {
      return await compileTexAsJs(tangleJs)
    }))

    const baseFileStage = cache(stage('load base files', [], async () => {
      return await loadFiles('./resources/knuth/plain/base/', baseFileNames)
    }))

    const tfmResourcesStage = cache(stage('load plain tfm files', [], async () => {
      const cm = await loadFiles('./resources/knuth/plain/fonts/cm/', tfmNames)
      const man = await loadFiles('./resources/knuth/plain/fonts/manfnt/', ['manfnt.tfm'])
      return { ...cm, ...man }
    }))

    const getPlainFmtStage = stage(
      'get plain.fmt',
      [getTexStage, baseFileStage, tfmResourcesStage],
      async ([texFiles, baseFiles, tfmFiles]) => {
        const files = new Map<string, PascalFileStore>()
        for (const [name, data] of Object.entries(baseFiles)) {
          files.set(name, createMemoryFileStore(data))
        }
        files.set('plain.tex', createMemoryFileStore(baseFiles['plain.tex']))
        files.set('hyphen.tex', createMemoryFileStore(baseFiles['hyphen.tex']))
        for (const [name, data] of Object.entries(tfmFiles)) {
          files.set('TeXfonts:' + name, createMemoryFileStore(data))
        }
        files.set('TeXformats:TEX.POOL', createMemoryFileStore(texFiles.poolFile))
        const consoleFile = new ConsoleFile('\\input plain \\dump \n')
        files.set('TTY:', consoleFile)

        attach('hyphen.tex.txt', baseFiles['hyphen.tex'])
        const state = await runJs(texFiles.texJs, {
          files,
          extraSyscalls: texExtraSyscalls,
        })
        attachText('console.log', consoleFile.getOutput())
        attachText('debug.log', state.debugLog.join('\n'))
        const plainLogStore = state.files.get('plain.log')
        if (plainLogStore !== undefined) {
          attach('plain.log', plainLogStore.getData())
        }
        const plainFmtFile = files.get('plain.fmt')
        assert(plainFmtFile !== undefined, 'plain.fmt not found')
        const plainFmtBytes = plainFmtFile.getData()
        attach('plain.fmt', plainFmtBytes)
        return { plainFmtBytes }
      },
    )

    stage('valid plain fmt', [getTexStage, getPlainFmtStage], async ([texFiles, plainFmtFile]) => {
      const files = new Map<string, PascalFileStore>()
      files.set('TeXformats:TEX.POOL', createMemoryFileStore(texFiles.poolFile))
      files.set('plain.fmt', createMemoryFileStore(plainFmtFile.plainFmtBytes))
      const tex = await readFile('./resources/knuth/plain/base/story.tex')
      files.set('story.tex', createMemoryFileStore(tex))
      const consoleFile = new ConsoleFile('&plain story \n\ \\bye \n')
      files.set('TTY:', consoleFile)
      const state = await runJs(texFiles.texJs, {
        files,
        extraSyscalls: texExtraSyscalls,
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
    })
  })
}
function attachFile(name: string, store: PascalFileStore | undefined) {
  if (store !== undefined) {
    attach(name, store.getData())
  }
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

async function compileTexAsJs(tangleJs: string) {
  const texWeb = await readTextFile('./resources/knuth/tex/tex.web')
  const result = validRunTangleResult(await runTangleJs(tangleJs, texWeb, undefined))
  const pasFile = result.pasFile
  attachText('tex.pas', pasFile)
  const poolFile = result.poolFile
  attach('tex.pool', poolFile)
  const texJs = transformTex(pasFile)
  attachText('tex.js', texJs)
  return { texJs, poolFile }
}

export default createBootPlainSuite()
