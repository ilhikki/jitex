import { bytesToString, extraSyscalls, fileOpenRewriters, runtimeFileSyscalls, stringToBytes } from '../utils.ts'
import { transform } from '@jitex/pascal-to-js'
import type { ExtraCallable } from '@jitex/pascal-to-js'
import { createMemoryFileStore, runJs } from '@jitex/runtime'
import type { PascalFileStore, RunState, SyscallHandler } from '@jitex/runtime'
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
  ...runtimeFileSyscalls,
}

export type TangleInput = {
  tangleContent: string
  webContent: string
  changeContent?: string
  /** debug 构建开关（默认 true），透传给 transform */
  debug?: boolean
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

export async function runTanglePascal(
  tangleInput: TangleInput,
): Promise<TangleOutput> {
  const runTangleOutput = await runTangle(tangleInput)
  return validRunTangleResult(runTangleOutput)
}

export function createTangleStage<const T extends readonly Stage<unknown>[], R>(
  name: string,
  deps: T,
  fn: (results: UnwrapAll<T>) => TangleInput,
): Stage<TangleOutput> {
  return stage(name, deps, async (results) => {
    const tangleInput = fn(results)
    return await runTanglePascal(tangleInput)
  })
}

export async function runTangleJs(
  jsCode: string,
  webContent: string,
  changeContent: string | undefined = undefined,
): Promise<RunTangleResult> {
  const files = new Map<string, PascalFileStore>()
  files.set(fileNames.webFile, createMemoryFileStore(stringToBytes(webContent)))
  if (changeContent) {
    const changeBytes = stringToBytes(changeContent)
    files.set(fileNames.changeFile, createMemoryFileStore(changeBytes))
  }
  const pascalFile = createMemoryFileStore()
  pascalFile.setMode('generation')
  const output = createMemoryFileStore()
  output.setMode('generation')
  files.set('TTY:', output)
  files.set(fileNames.pascalFile, pascalFile)
  const poolFile = createMemoryFileStore()
  poolFile.setMode('generation')
  files.set(fileNames.pool, poolFile)

  const state = await runJs(jsCode, {
    files,
    maxSteps: 1e9,
    extraSyscalls: tangleExtraSyscalls,
  })
  const debugLog = state.debugLog
  const pasFile = bytesToString(pascalFile.getData())
  return {
    output: bytesToString(output.getData()),
    state,
    pasFile,
    poolFile: poolFile.getData(),
    debugLog,
  }
}

export function transformTangle(tangleContent: string, debug = true) {
  const jsCode = transform(tangleContent, {
    extraCallables: tangleExtraCallables,
    syscallRewriters: fileOpenRewriters,
    debug,
  })
  return jsCode
}

export async function runTangle(input: TangleInput) {
  const { tangleContent, webContent, changeContent, debug } = input
  const jsCode = transformTangle(tangleContent, debug ?? true)
  return await runTangleJs(jsCode, webContent, changeContent)
}
