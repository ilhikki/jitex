// 扩展 IO 系统调用（非标 Pascal 扩展）
//
// ISSUE-033: RESET/REWRITE 多参数形式
// Berkeley/DEC Pascal 扩展：RESET(F, name) / REWRITE(F, name) / RESET(F, name, mode)
// 等价于 ASSIGN(F, name); RESET/REWRITE(F)
//
// 用法：
//   const sysCalls = createExtendedSysCalls()
//   await runVM(source, { sysCalls, files, plugins })
//
// 分类：非标扩展，不修改核心 io.plugin.ts

import { createDefaultSysCalls } from './io.plugin'
import type { SysCallHandler } from '../types'
import type { PascalValue } from './jsoncode'
import type { PascalFile } from './file-model'
import type { TypeTable } from '../types'

// 从参数中提取 PascalValue（兼容 SysCallArg 包装）
function getValue(arg: PascalValue | { value: PascalValue } | unknown): PascalValue {
  if (arg && typeof arg === 'object' && 'value' in arg) {
    const v = (arg as any).value
    if (v && typeof v === 'object' && 'typeId' in v) return v as PascalValue
  }
  return arg as PascalValue
}

// 从 PascalValue 提取文件名字符串
// 支持：string 类型（raw 是 JS string）
//       array-of-char / packed-array-of-char（raw 是字符数组或 string）
function extractFileName(val: PascalValue, typeTable: TypeTable | null): string {
  const raw = val.raw
  // string 类型
  if (typeof raw === 'string') return raw
  // array of char：raw 可能是数组
  if (Array.isArray(raw)) {
    return raw.map((c: any) => typeof c === 'number' ? String.fromCharCode(c) : String(c)).join('').replace(/\s+$/, '')
  }
  return String(raw)
}

// 从参数中提取 PascalFile 句柄
function asFileValue(arg: any, typeTable: TypeTable | null): PascalFile | null {
  const value = arg?.value || arg
  if (!value || !value.typeId) return null
  if (value.typeId === 'text') return value.raw as PascalFile
  if (typeTable) {
    const td = typeTable.get(value.typeId)
    if (td?.kind === 'file') return value.raw as PascalFile
  }
  return null
}

const extendedResetHandler: SysCallHandler = async (args, _state, runtime) => {
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io
  if (!io) return
  if (args.length === 0) throw new Error('RESET requires a file argument')
  const file = asFileValue(args[0], typeTable)
  if (!file) throw new Error('RESET: argument is not a file')
  // 非标扩展：第二参数是文件名
  if (args.length >= 2) {
    const nameVal = getValue(args[1])
    const name = extractFileName(nameVal, typeTable)
    await io.file.assign(file, name)
  }
  await io.file.reset(file)
}

const extendedRewriteHandler: SysCallHandler = async (args, _state, runtime) => {
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io
  if (!io) return
  if (args.length === 0) throw new Error('REWRITE requires a file argument')
  const file = asFileValue(args[0], typeTable)
  if (!file) throw new Error('REWRITE: argument is not a file')
  // 非标扩展：第二参数是文件名
  if (args.length >= 2) {
    const nameVal = getValue(args[1])
    const name = extractFileName(nameVal, typeTable)
    await io.file.assign(file, name)
  }
  await io.file.rewrite(file)
}

// 创建扩展系统调用集合（基于默认，覆盖 RESET/REWRITE）
export function createExtendedSysCalls(): Map<string, SysCallHandler> {
  const map = createDefaultSysCalls()
  map.set('RESET', extendedResetHandler)
  map.set('REWRITE', extendedRewriteHandler)
  return map
}
