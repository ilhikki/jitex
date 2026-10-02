import { transform } from '@jitex/pascal-to-js'
import type { ExtraCallable } from '@jitex/pascal-to-js'
import { fileOpenRewriters, readTextFile } from '../utils.ts'
import { runTanglePascal, transformTangle } from '../tangle/build-tangle.ts'
import { attachText, type Stage, stage } from '@jitex/integration'

const texExtraCallables: Record<string, ExtraCallable> = {
  'BREAK': {
    sysCallName: 'extra.break',
    kind: 'procedure',
  },
  'CLOSE': {
    sysCallName: 'extra.close',
    kind: 'procedure',
  },
  'BREAKIN': {
    sysCallName: 'extra.breakIn',
    kind: 'procedure',
  },
  'ERSTAT': {
    sysCallName: 'extra.erStat',
    kind: 'function',
  },
}

export function transformTex(texPascalContent: string, debug: boolean) {
  const jsCode = transform(texPascalContent, {
    extraCallables: texExtraCallables,
    syscallRewriters: fileOpenRewriters,
    debug,
  })
  return jsCode
}

export function createStageOfGetTangleJs(): Stage<{ tangleJs: string }> {
  return stage('build tangle.js').nodeps(async () => {
    const tanglePas = await readTextFile('./resources/jitex/tangle.pas')
    const tangleWeb = await readTextFile('./resources/knuth/tangle/tangle.web')
    const tangleV1 = await runTanglePascal({
      tangleContent: tanglePas,
      webContent: tangleWeb,
      debug: false,
    })
    const tangleV2 = await runTanglePascal({
      tangleContent: tangleV1.pasFile,
      webContent: tangleWeb,
      debug: false,
    })
    const tangleJs = transformTangle(tangleV2.pasFile, false)
    attachText('tangle.js', tangleJs)
    return { tangleJs }
  })
}
