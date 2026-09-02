import { extraSyscalls, stringToBytes } from '../utils.ts'
import {
  createHandler as defaultCreateHandler,
  ExtraCallable,
  MemoryTextFile,
  PascalFileStore,
  RecordHandler,
  runJs,
  RunState,
  SyscallHandler,
  transform,
  TypeDescriptor,
} from '@jitex/pascal-to-js'
import type { RuntimeContext } from '@jitex/pascal-to-js/src/runtime/runtime-type.ts'
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

  // 重写 factory.createHandler：Tangle / TeX 大量依赖"标量字段未初始化读取/数组标量元素未初始化读取"
  // （ISO 严格语义下均为未定义行为，TeX 等旧代码广泛依赖）。
  // - rec/array：走默认实现（严格 handler，记录变体语义，深拷贝）。
  // - subrange：默认值 = 下限 type.low。
  // - i32/enum/subrange：默认值 = 0（或 subrange.low）。
  // - f64：默认值 = 0。
  // - bool：默认值 = false。
  // - char：默认值 = '\x00'。
  // - str：默认值 = ''。
  // - set/file/pointer：默认值 = 空/undefined（标量浅拷贝）。
  // 有 handler 就会在 create() / array.get 缺省元素时预填值，避免 "read unsetted field"。
  'factory.createHandler': (ctx, [type]) => {
    const td = type as TypeDescriptor
    if (td.tag === 'rec' || td.tag === 'array') {
      return defaultCreateHandler(ctx as RuntimeContext, td)
    }
    const fallback = (() => {
      switch (td.tag) {
        case 'subrange':
          return td.low ?? 0
        default:
          return undefined
      }
    })()
    return {
      create() {
        return fallback
      },
      copy(v: unknown) {
        return v
      },
    } as unknown as RecordHandler
  },
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
