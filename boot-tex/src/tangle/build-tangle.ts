import { bytesToString, stringToBytes } from '../utils.ts'
import { pascalHPlugin } from '@jitex/pascal-to-js/src/compiler/plugins/pascal-h.plugin.ts'
import { run } from '@jitex/pascal-to-js'
import { assertEquals, attach, attachText, log, Stage, stage, UnwrapAll } from '@jitex/integration'

// noinspection SpellCheckingInspection
const fileNames = {
  webFile: 'WEBFILE',
  changeFile: 'CHANGEFILE',
  pascalFile: 'PASCALFILE',
  pool: 'POOL',
}

export type TangleInput = {
  tangleContent: string
  webContent: string
  changeContent?: string
}
export type TangleOutput = {
  pasFile: string
  poolFile: Uint8Array
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
    if (state.jsCode) {
      attachText('tangle.js', state.jsCode)
    }
    attachText('result.pas', pasFile)
    attach('pool.bin', poolFile)
    attachText('debugLog.log', debugLog.join('\n'))
    assertEquals(state.status, 'terminated')
    return { pasFile, poolFile }
  })
}

export function runTangle(input: TangleInput) {
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
