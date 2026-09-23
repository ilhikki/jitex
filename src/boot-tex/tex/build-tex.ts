import { transform } from '@jitex/pascal-to-js'
import type { ExtraCallable } from '@jitex/pascal-to-js'
import type { PascalFile, SyscallHandler } from '@jitex/runtime'
import { ConsoleFile, extraSyscalls, fileOpenRewriters, readTextFile, runtimeFileSyscalls } from '../utils.ts'
import { runTanglePascal, transformTangle } from '../tangle/build-tangle.ts'
import { attachText, stage } from '@jitex/integration'

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

/**
 * eoln(f)：ConsoleFile 需要模拟终端对回车键的回显。
 *
 * input_ln 读到行结束符就停下、不消费它；真实终端会把那个换行回显出来，
 * 这里用 advance() 消费并回显。
 */
const eolnSyscall: SyscallHandler = (ctx, file) => {
  const f = file as PascalFile | undefined
  const store = f === undefined ? ctx.files.get('INPUT') : f.value
  if (!store || !store.hasMore()) {
    return 1
  }
  const byte = store.peekByte()
  const isEoln = byte === 10 || byte === 13
  if (isEoln && store instanceof ConsoleFile) {
    store.advance()
  }
  return isEoln ? 1 : 0
}

export const texExtraSyscalls: Record<string, SyscallHandler> = {
  'extra.close': extraSyscalls['extra.close'],
  'extra.breakIn': extraSyscalls['extra.breakIn'],
  'extra.erStat': extraSyscalls['extra.erStat'],
  'extra.break': extraSyscalls['extra.break'],
  'runtime.file.eoln': eolnSyscall,
  ...runtimeFileSyscalls,
}

export function transformTex(texPascalContent: string, debug = true) {
  const jsCode = transform(texPascalContent, {
    extraCallables: texExtraCallables,
    syscallRewriters: fileOpenRewriters,
    debug,
  })
  return jsCode
}

export function createStageOfGetTangleJs(isDebug: boolean) {
  return stage('build tangle.js', [], async () => {
    const tanglePas = await readTextFile('./resources/jitex/tangle.pas')
    const tangleWeb = await readTextFile('./resources/knuth/tangle/tangle.web')
    const tangleV1 = await runTanglePascal({
      tangleContent: tanglePas,
      webContent: tangleWeb,
      debug: isDebug,
    })
    const tangleV2 = await runTanglePascal({
      tangleContent: tangleV1.pasFile,
      webContent: tangleWeb,
      debug: isDebug,
    })
    const tangleJs = transformTangle(tangleV2.pasFile, isDebug)
    attachText('tangle.js', tangleJs)
    return { tangleJs }
  })
}
