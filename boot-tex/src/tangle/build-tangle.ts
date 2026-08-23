import { extraSyscalls, stringToBytes } from '../utils.ts'
import {
  ExtraCallable,
  MemoryTextFile,
  PascalFileStore,
  runJs,
  RunState,
  SyscallHandler,
  transform,
} from '@jitex/pascal-to-js'
import { assert, assertEquals, attach, attachText, log, Stage, stage, UnwrapAll } from '@jitex/integration'

// noinspection SpellCheckingInspection
const fileNames = {
  webFile: 'WEBFILE',
  changeFile: 'CHANGEFILE',
  pascalFile: 'PASCALFILE',
  pool: 'POOL',
}
const tangleExtraCallables: Record<string, ExtraCallable> = {
  'BREAK': {
    sysCallName: 'extra.break',
    kind: 'procedure',
  },
}

const tangleExtraSyscalls: Record<string, SyscallHandler> = {
  'extra.break': extraSyscalls['extra.break'],
  'file.reset': extraSyscalls['file.reset'],
  'file.rewrite': extraSyscalls['file.rewrite'],
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
  output: string
}

export function validRunTangleResult(result: RunTangleResult): TangleOutput {
  const { state, pasFile, poolFile, debugLog, output } = result
  log(`state.status = ${state.status}`)
  log(`state.steps = ${state.steps}`)
  attachText('debugLog.log', debugLog.join('\n'))
  attachText('output.txt', output)
  if (state.jsCode) {
    attachText('tangle.js', state.jsCode)
  } else {
    assert(false, 'miss tangle.js')
  }
  attachText('result.pas', pasFile)
  attach('pool.bin', poolFile)
  if (state.error) {
    console.error(state.error)
  }
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
  const files = new Map<string, PascalFileStore>()
  files.set(fileNames.webFile, new MemoryTextFile(stringToBytes(webContent)))
  if (changeContent) {
    const changeBytes = stringToBytes(changeContent)
    files.set(fileNames.changeFile, new MemoryTextFile(changeBytes))
  }
  const pascalFile = new MemoryTextFile()
  pascalFile.setMode('generation')
  const output = new MemoryTextFile()
  output.setMode('generation')
  files.set('TTY:', output)
  files.set(fileNames.pascalFile, pascalFile)
  const poolFile = new MemoryTextFile()
  poolFile.setMode('generation')
  files.set(fileNames.pool, poolFile)

  const state = runJs(jsCode, {
    files,
    maxSteps: 1e9,
    extraSyscalls: tangleExtraSyscalls,
  })
  const debugLog = state.debugLog
  const pasFile = pascalFile.getContent()
  return {
    output: output.getContent(),
    state,
    pasFile,
    poolFile: poolFile.getData(),
    debugLog,
  }
}

export function transformTangle(tangleContent: string) {
  const jsCode = transform(tangleContent, {
    extraCallables: tangleExtraCallables,
  })
  return jsCode
}

export function runTangle(input: TangleInput) {
  const { tangleContent, webContent, changeContent } = input
  const jsCode = transformTangle(tangleContent)
  return runTangleJs(jsCode, webContent, changeContent)
}
