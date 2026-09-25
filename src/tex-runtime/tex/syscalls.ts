import { bytesToString, createMemoryFileStore, rtKeys } from '@jitex/runtime'
import type { ByteHost, PascalFile, PascalFileStore, SyscallHandler } from '@jitex/runtime'
import { ConsoleFile } from './console.ts'

/*
 * TeX 运行期需要覆盖的 syscall。
 *
 * 这里只放**运行期**语义：编译器侧的重写表（把方言形式的 reset/rewrite 改写成
 * openin/openout）属于编译期，留在使用方（boot-tex），不进本包。
 */

/**
 * TeX 依赖的外部过程 / 函数实现。
 *
 * 只保留 `extra.*`：这几个对应 TeX 源码里声明为 external 的例程
 * （break / close / breakin / erstat）。
 *
 * 文件与 record 的语义（reset 打开失败时句柄保持未初始化、record 的字节
 * 布局、`file of byte` 的逐字节写出等）已由 pascal-to-js 的 `runtime.*`
 * 原语承担，这里不再覆盖。
 */
const texExternalSyscalls: Record<string, SyscallHandler> = {
  'extra.break': () => {
  },
  'extra.close': (ctx) => {
    ctx.debugLog.push('extra.close')
  },
  'extra.breakIn': (ctx) => {
    ctx.debugLog.push('extra.breakIn')
  },
  'extra.erStat': (ctx, file) => {
    const pascalFile = file as PascalFile
    const result = pascalFile.value !== undefined ? 0 : 1
    ctx.debugLog.push('extra.erStat = ' + result)
    return result
  },
}

/** openin / openout 的 syscall key：编译期重写表 ⟷ 运行期实现之间的契约 */
export const texOpenKeys = {
  openIn: 'extra.openIn',
  openOut: 'extra.openOut',
} as const

const fileNameOf = (name: unknown): string => bytesToString((name as ByteHost).bytes).trim()

/**
 * openin / openout：按名字在 ctx.files 中查找（或新建）并绑定到句柄。
 *
 * TeX 的 `\input` / `\openout` 走这里，名字已由 TeX 补全扩展名（如 `\input user`
 * → `user.tex`）；字体走 `TeXfonts:` 区、格式走 `TeXformats:` 区，见 files.ts。
 */
const texOpenSyscalls: Record<string, SyscallHandler> = {
  [texOpenKeys.openIn]: (ctx, file, name) => {
    const key = fileNameOf(name)
    ctx.debugLog.push(`${texOpenKeys.openIn} ${key}`)
    const p = file as PascalFile
    const store = ctx.files.get(key)
    p.value = store
    if (store !== undefined) {
      store.seek(0)
      store.setMode('inspection')
    }
    return undefined
  },
  [texOpenKeys.openOut]: (ctx, file, name) => {
    const p = file as PascalFile
    const key = fileNameOf(name)
    ctx.debugLog.push(`${texOpenKeys.openOut} ${key}`)
    let store = ctx.files.get(key)
    if (store === undefined) {
      store = createMemoryFileStore()
      ctx.files.set(key, store)
    }
    p.value = store
    store.clear()
    store.seek(0)
    store.setMode('generation')
    return undefined
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
  const store: PascalFileStore | undefined = f === undefined ? ctx.files.get('INPUT') : f.value
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

export interface TexRuntimeSyscallOptions {
  /**
   * 这次运行的 TTY 是否是交互式终端（ConsoleFile）。
   *
   * true（默认）时覆盖 eoln：读到行结束符即消费并回显，模拟真实终端对回车的处理。
   * 非终端场景（例如 TANGLE 把 TTY 接在普通内存文件上）必须置 false——否则会
   * 用终端的回显语义替掉 eoln 本身的行结束判定。
   */
  terminal?: boolean
}

/** TeX 运行所需的全部额外 syscall（每次调用返回新表；handler 本身无状态） */
export function texRuntimeSyscalls(
  options: TexRuntimeSyscallOptions = {},
): Record<string, SyscallHandler> {
  const syscalls: Record<string, SyscallHandler> = {
    ...texExternalSyscalls,
    ...texOpenSyscalls,
  }
  if (options.terminal ?? true) {
    syscalls[rtKeys.fileEoln] = eolnSyscall
  }
  return syscalls
}
