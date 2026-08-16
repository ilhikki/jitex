/*
 * IL Runtime — 同步 syscall 实现。
 *
 * 决策依据（见 decide.md）：
 *   - 决策 7：全部同步，无 async/await
 *   - 决策 8：steps.check 在循环回边由 compiler.ts 插入
 *   - 决策 9：RunState 复用 src/runtime/run-state.ts；
 *             file ops 逻辑参考 file-model.ts 但同步化
 *
 * 提供给 transform.ts 生成的 JS 代码调用的 dispatcher：
 *   __sys(key, args) → unknown
 *
 * transform.ts 的 SemanticCompiler 决定哪些 syscall inline（算术/比较），
 * 哪些走 dispatcher（IO/file/cell/mem/set）。本文件实现所有走 dispatcher 的 key。
 */

import type { RunError, RunState } from './run-state.ts'
import type { IlPlugin } from '../compiler/plugin.ts'
import type { RuntimeContext, RuntimeOptions, SyscallHandler } from './runtime-type.ts'
import { TypeDescriptor } from '@/runtime/runtime-type.ts'
import { ioSyscalls } from './sys/io.ts'
import { createDefaultArray, createDefaultRec, deepCopyValue } from './runtime-util.ts'
import { fileSyscalls } from './sys/file.ts'

export function createRuntimeContext(options: RuntimeOptions = {}): RuntimeContext {
  return {
    outputBuffer: [],
    inputQueue: options.input ? [...options.input] : [],
    files: options.files ?? new Map(),
    fileStates: new WeakMap(),
    readState: { tokens: [], tokenIdx: 0 },
    steps: 0,
    maxSteps: options.maxSteps ?? Infinity,
    programFileUrls: options.programFileUrls ?? {},
    extensions: new Set(options.extensions ?? []),
    plugins: options.plugins ?? [],
    debugLog: options.debugLog ?? [],
    jsCode: undefined,
  }
}

export function toRunState(
  ctx: RuntimeContext,
  status: 'running' | 'terminated' | 'error' = 'terminated',
  error?: RunError | null,
): RunState {
  return {
    status,
    outputBuffer: ctx.outputBuffer,
    inputQueue: ctx.inputQueue,
    steps: ctx.steps,
    error: error ?? null,
    jsCode: ctx.jsCode,
  }
}

// ============================================================
// dispatch — 所有走 dispatcher 的 syscall
// ============================================================

function getDefaultSyscalls(): Record<string, SyscallHandler> {
  return { ...basicSyscall(), ...ioSyscalls(), ...fileSyscalls() }
}

function basicSyscall(): Record<string, SyscallHandler> {
  return {
    // ---------- cell（var 参数传递）----------
    'cell.create': (_ctx, [value]) => ({ v: value }),
    'cell.get': (_ctx, [value]) => (value as { v: unknown }).v,
    'cell.set': (_ctx, [left, right]) => {
      ;(left as { v: unknown }).v = right
      return undefined
    },

    // ---------- array ----------
    'array.get': (_ctx, args) => getArrayElement(args[0], args.slice(1)),
    'array.set': (_ctx, args) => {
      setArrayElement(args[0], args.slice(1, -1), args[args.length - 1])
      return undefined
    },

    // ---------- cast ----------
    'cast.char.to.i64': (_ctx, [value]) => (typeof value === 'string' ? value.charCodeAt(0) : value),

    // ---------- record ----------
    'rec.field': (_ctx, [record, key]) => (record as Record<string, unknown>)[key as string],
    'rec.set': (_ctx, [record, key, value]) => {
      ;(record as Record<string, unknown>)[key as string] = value
    },
    'rec.copy': (_ctx, [value]) => deepCopyValue(value),

    // ---------- mem.default（变量初始化）----------
    // type 字面量由 literalToJs 直接作为 JS 对象字面量返回，无需 JSON.parse
    'mem.default.array': (_ctx, [type]) => createDefaultArray(type as TypeDescriptor),
    'mem.default.rec': (_ctx, [type]) => createDefaultRec(type as TypeDescriptor),

    // ---------- str.to.char.array ----------
    // Pascal `packed array[low..high] of char` 赋值为字符串字面量时，
    // 必须展开为 1-based（按 low 起）的字符数组对象，否则后续 `arr[k]`
    // 在 JS 中变成 0-based 字符串索引，导致首字符丢失。
    // args = [low, high, str]；返回对象 {low:ch1, low+1:ch2, ..., high:' '}
    // 同时填充 length 属性（=high-low+1），便于 fileUrlToString 等遍历。
    'str.to.char.array': (_ctx, [l, h, s]) => {
      const low: number = (l as number) | 0
      const high: number = (h as number) | 0
      const str: string = typeof s === 'string' ? s : String(s ?? '')
      const out: Record<number | string, string | number> = {}
      for (let i = low; i <= high; i++) {
        const idx = i - low
        out[i] = idx < str.length ? str.charAt(idx) : ' '
      }
      out.length = high - low + 1
      return out
    },

    // ---------- set ----------
    'set.empty': (_ctx, _args) => new Set<number>(),
    'set.union': (_ctx, [v1, v2]) => new Set<number>([...(v1 as Set<number>), ...(v2 as Set<number>)]),
    'set.intersect': (_ctx, [set, value]) =>
      new Set<number>([...(set as Set<number>)].filter((x) => (value as Set<number>).has(x))),
    'set.diff': (_ctx, [set, value]) =>
      new Set<number>([...(set as Set<number>)].filter((x) => !(value as Set<number>).has(x))),
    'set.eq': (_ctx, [left, right]) =>
      (left as Set<number>).size === (right as Set<number>).size &&
      [...(left as Set<number>)].every((x: number) => (right as Set<number>).has(x)),
    'set.ne': (_ctx, [left, right]) =>
      !((left as Set<number>).size === (right as Set<number>).size &&
        [...(left as Set<number>)].every((x: number) => (right as Set<number>).has(x))),
    'set.le': (_ctx, [left, right]) => [...(left as Set<number>)].every((x: number) => (right as Set<number>).has(x)),
    'set.ge': (_ctx, [left, right]) => [...(left as Set<number>)].every((x: number) => (right as Set<number>).has(x)),
    'set.range': (_ctx, [start, end]) => {
      const s = new Set<number>()
      for (let i = start as number; i <= (end as number); i++) {
        s.add(i)
      }
      return s
    },
    'set.elem': (_ctx, [value]) => new Set<number>([value as number]),
    'set.literal': (_ctx, args) => {
      const s = new Set<number>()
      for (const e of args) {
        if (e instanceof Set) {
          for (const x of e) s.add(x as number)
        } else {
          s.add(e as number)
        }
      }
      return s
    },
    'set.in': (_ctx, [value, set]) => (set as Set<number>).has(value as number),

    // ---------- string ----------
    'str.concat': (_ctx, [left, right]) => (left as string) + (right as string),
    'str.length': (_ctx, [str]) => (str as string).length,

    // ---------- steps.check（循环步数限制）----------
    'steps.check': (ctx, _args) => {
      if (++ctx.steps > ctx.maxSteps) {
        throw new Error('step limit exceeded')
      }
      return undefined
    },

    // ---------- range.check（subrange 运行时边界检查）----------
    'range.check': (_ctx, [index, min, max]) => {
      if ((index as number) < (min as number) || (index as number) > (max as number)) {
        throw new Error(`subrange value ${index} out of range ${min}..${max}`)
      }
      return undefined
    },
  }
}

export function createDispatcher(plugins: IlPlugin[]): (ctx: RuntimeContext, key: string, args: unknown[]) => unknown {
  const syscalls = { ...getDefaultSyscalls() }
  for (const plugin of plugins) {
    const pluginName = plugin.name
    for (const [name, fn] of Object.entries(plugin.syscalls ?? {})) {
      if (fn) {
        syscalls[`plugin.${pluginName}.${name}`] = fn
      }
    }
  }
  return (ctx, key, args) => {
    const fn = syscalls[key]
    if (fn) {
      return fn(ctx, args)
    }
    throw new Error(`Unknown syscall: ${key}`)
  }
}

// ============================================================
// 辅助函数：数组
// ============================================================

function getArrayElement(arr: unknown, indices: unknown[]): unknown {
  let cur = arr as Record<PropertyKey, unknown>
  for (const idx of indices) {
    // Pascal char 作为数组索引时是单字符字符串，需转 charCode
    const n = typeof idx === 'string' && idx.length === 1 ? idx.charCodeAt(0) : idx
    cur = cur[n as PropertyKey] as Record<PropertyKey, unknown>
  }
  return cur
}

function setArrayElement(arr: unknown, indices: unknown[], value: unknown): void {
  let cur = arr as Record<PropertyKey, unknown>
  for (let i = 0; i < indices.length - 1; i++) {
    const idx = indices[i]
    const n = typeof idx === 'string' && idx.length === 1 ? idx.charCodeAt(0) : idx
    cur = cur[n as PropertyKey] as Record<PropertyKey, unknown>
  }
  const last = indices[indices.length - 1]
  const lastN = typeof last === 'string' && last.length === 1 ? last.charCodeAt(0) : last
  cur[lastN as PropertyKey] = value
}
