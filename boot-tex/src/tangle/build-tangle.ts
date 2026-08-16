import { bytesToString, stringToBytes } from '../utils.ts'
import { pascalHPlugin } from '@jitex/pascal-to-js'
import { runJs, RunState, transform } from '@jitex/pascal-to-js'
import { assert, assertEquals, attach, attachText, log, Stage, stage, UnwrapAll } from '@jitex/integration'

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
export type RunTangleResult = {
  state: RunState
  pasFile: string
  poolFile: Uint8Array
  debugLog: string[]
}

export function validRunTangleResult(result: RunTangleResult): TangleOutput {
  const { state, pasFile, poolFile, debugLog } = result
  log(`state.status = ${state.status}`)
  log(`state.steps = ${state.steps}`)
  if (state.jsCode) {
    attachText('tangle.js', state.jsCode)
  } else {
    assert(false, 'miss tangle.js')
  }
  attachText('result.pas', pasFile)
  attach('pool.bin', poolFile)
  attachText('debugLog.log', debugLog.join('\n'))
  assertEquals(state.status, 'terminated')
  return { pasFile, poolFile }
}

export function runTanglePascal(tangleInput: TangleInput): TangleOutput {
  const runTangleOutput = runTangle(tangleInput)
  return validRunTangleResult(runTangleOutput)
}

export function createTangleStage<const T extends readonly Stage<unknown>[], R>(
  name: string,
  deps: T,
  fn: (results: UnwrapAll<T>) => TangleInput,
): Stage<TangleOutput> {
  return stage(name, deps, (results) => {
    const tangleInput = fn(results)
    return runTanglePascal(tangleInput)
  })
}

export function runTangleJs(
  jsCode: string,
  webContent: string,
  changeContent: string | undefined = undefined,
): RunTangleResult {
  const files = new Map<string, Uint8Array>()
  files.set(fileNames.webFile, stringToBytes(webContent))
  if (changeContent) {
    const changeBytes = stringToBytes(changeContent)
    files.set(fileNames.changeFile, changeBytes)
  }
  files.set(fileNames.pascalFile, new Uint8Array())
  files.set(fileNames.pool, new Uint8Array())

  const debugLog: string[] = []
  const state = runJs(jsCode, {
    files,
    maxSteps: 1e9,
    debugLog,
    plugins: [pascalHPlugin],
  })
  const pasFile = bytesToString(state.files.get(fileNames.pascalFile)!)
  const poolFile = state.files.get(fileNames.pool)!
  return {
    state,
    pasFile,
    poolFile,
    debugLog,
  }
}

export function runTangle(input: TangleInput) {
  const { tangleContent, webContent, changeContent } = input
  const jsCode = transform(tangleContent, {
    plugins: [pascalHPlugin],
  })
  return runTangleJs(jsCode, webContent, changeContent)
}
