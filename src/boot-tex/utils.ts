import { bytesToString, rtKeys } from '@jitex/runtime'
import type { RunState } from '@jitex/runtime'
import type { SyscallRewriteTable } from '@jitex/pascal-to-js'
import { texOpenKeys } from '@jitex/tex-runtime'

/*
 * boot-tex 的宿主侧工具。
 *
 * 只保留两类东西：Deno 相关的文件读取，以及**编译期**的方言声明（重写表）。
 * 运行期部件——TTY 终端、TeX 的 extra / open syscall、文件名区约定——已归
 * @jitex/tex-runtime，本目录不再各写一份。
 */

export function readTextFile(path: string): Promise<string> {
  return Deno.readTextFile(path)
}

export function readFile(path: string): Promise<Uint8Array> {
  return Deno.readFile(path)
}

// 具名文件打开（TeX 方言的 reset(f, name, opts) / rewrite(f, name, opts)）
//
// ISO 7185 6.6.5.2 的 reset / rewrite 只接受一个 file-variable 实参，不带 file-name。
// 带 file-name 的形式以 rewrite 扩展接管（覆盖同名 lowering.* key）：
//   - ISO 形式（file-variable + 类型描述）交回内部终态 key；
//   - 方言形式改写成宿主侧注入的 openin / openout（选项实参丢弃）。
// 编译器内部表对非 ISO 形式默认报错，这里的覆盖使方言形式合法化。
//
// 本表是**编译期**的（喂给 transform 的 syscallRewriters）；它产出的 key 由
// @jitex/tex-runtime 的运行期实现消费，故 key 取自那边导出的 texOpenKeys。

/** TeX 方言的文件打开：以 rewrite 扩展覆盖 lowering 侧的无本体调用 key */
export const fileOpenRewriters: SyscallRewriteTable = {
  // key 为 lowering 统一产出的 `lowering.call.<小写名>`；实参布局 = (值, 类型描述) 平铺，
  // 故 ISO 单实参形式长度为 2，方言形式（带 file-name）长度 > 2
  ['lowering.call.reset']: (sys) => {
    if (sys.args.length === 2) {
      return { kind: 'syscall', key: rtKeys.fileReset, args: [sys.args[0]] }
    }
    return { kind: 'syscall', key: texOpenKeys.openIn, args: [sys.args[0], sys.args[2]] }
  },
  ['lowering.call.rewrite']: (sys) => {
    if (sys.args.length === 2) {
      return { kind: 'syscall', key: rtKeys.fileRewrite, args: [sys.args[0]] }
    }
    return { kind: 'syscall', key: texOpenKeys.openOut, args: [sys.args[0], sys.args[2]] }
  },
}

export async function getTripChFile() {
  return await readTextFile('./resources/jitex/trip.ch')
}

export function readTextFromState(
  state: RunState,
  key: string,
): string | undefined {
  const value = state.files.get(key)
  if (value === undefined) {
    return undefined
  }
  return bytesToString(value.getData())
}

export function readBytesFromState(
  state: RunState,
  key: string,
): Uint8Array | undefined {
  const value = state.files.get(key)
  if (value === undefined) {
    return undefined
  }
  return value.getData()
}
