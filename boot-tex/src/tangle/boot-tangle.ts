import { assertEquals, attachText, attach, cache, log, Stage, stage, suite, UnwrapAll } from '@jitex/integration'
import { run, transform } from '@jitex/pascal-to-js'
import { pascalHPlugin } from '@jitex/pascal-to-js/src/compiler/plugins/pascal-h.plugin.ts'

// noinspection SpellCheckingInspection
const fileNames = {
  webFile: 'WEBFILE',
  changeFile: 'CHANGEFILE',
  pascalFile: 'PASCALFILE',
  pool: 'POOL',
}

type TangleInput = {
  tangleContent: string
  webContent: string
  changeContent?: string
}
type TangleOutput = {
  pasFile: string
  poolFile: Uint8Array
}
function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}
function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}
export function createTangleStage<const T extends readonly Stage<unknown>[], R>(
  name: string,
  deps: T,
  fn: (results: UnwrapAll<T>) => TangleInput,
): Stage<TangleOutput> {
  return stage(name, deps, (results) => {
    const tangleInput = fn(results)
    const { state, pasFile, poolFile, debugLog } = runTangle(tangleInput)
    log(`state.status = ${state.status}`)
    log(`state.steps = ${state.steps}`)
    attachText('pasFile.pas', pasFile)
    attach('pool.bin', poolFile)
    attachText('debugLog.log', debugLog.join('\n'))
    assertEquals(state.status, 'terminated')
    return { pasFile, poolFile }
  })
}
function runTangle(input: TangleInput) {
  const { tangleContent, webContent, changeContent } = input
  const files = new Map<string, Uint8Array>()
  files.set(fileNames.webFile, stringToBytes(webContent))
  if (changeContent) {
    const changeBytes = stringToBytes(changeContent)
    files.set(fileNames.changeFile, changeBytes)
  }
  files.set(fileNames.pascalFile, new Uint8Array())
  files.set(fileNames.pool, new Uint8Array())

  const debugLog: string[] = []
  const state = run(
    tangleContent,
    {
      files,
      maxSteps: 1e9,
      debugLog,
      plugins: [pascalHPlugin],
    },
  )
  const pasFile = bytesToString(files.get(fileNames.pascalFile)!)
  const poolFile = files.get(fileNames.pool)!
  return {
    state,
    pasFile,
    poolFile,
    debugLog,
  }
}
const tangleBootstrapSuite = suite('TANGLE Bootstrap', () => {
  const stageLoadTangleSource = cache(
    stage('load tangle source', [], async () => {
      const tanglePas = await Deno.readTextFile('./resources/kunth/tangle/tangle-official.pas')
      const tangleWeb = await Deno.readTextFile('./resources/kunth/tangle/tangle.web')
      attachText('tangle-v0.pas', tanglePas)
      attachText('tangle.web', tangleWeb)
      return { tanglePas, tangleWeb }
    }),
  )

  const getTangleV1 = createTangleStage(
    'tangleV0 => tangleV1',
    [stageLoadTangleSource],
    ([tangleSource]): TangleInput => {
      return { tangleContent: tangleSource.tanglePas, webContent: tangleSource.tangleWeb }
    },
  )
  const getTangleV2 = createTangleStage('tangleV1 => tangleV2', [stageLoadTangleSource, getTangleV1], ([src, tangleOutput]) => {
    return { tangleContent: tangleOutput.pasFile, webContent: src.tangleWeb }
  })
  const getTangleV3 = createTangleStage('tangleV2 => tangleV3', [stageLoadTangleSource, getTangleV2], ([src, tangleOutput]) => {
    return { tangleContent: tangleOutput.pasFile, webContent: src.tangleWeb }
  })

  const valid = stage('valid tangle-v2.pas === tangle-v3.pas', [getTangleV2, getTangleV3], (result) => {
    assertEquals(result[0].pasFile, result[1].pasFile)
  })
  stage('storeJs', [getTangleV3, valid], (results) => {
    const tangleJs = transform(results[0].pasFile, {
      plugins: [pascalHPlugin],
    })
    attachText("tangle.js", tangleJs)
  })
})
export default tangleBootstrapSuite
