import type { JsCompiler, SemanticCompiler } from '../../compiler/json-code-compiler.ts'
import * as JsonCode from '../../compiler/json-code.ts'
import type { SyscallHandler } from '../runtime-type.ts'
import {
  createDefaultArray,
  createDefaultRec,
  deepCopyValue,
  getArrayElement,
  setArrayElement,
} from '../runtime-util.ts'
import { type TypeDescriptor } from '../runtime-type.ts'

export function basicSyscall(): Record<string, SyscallHandler> {
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
          for (const x of e) {
            s.add(x as number)
          }
        } else {
          s.add(e as number)
        }
      }
      return s
    },
    'set.in': (_ctx, [value, set]) => (set as Set<number>).has(value as number),

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

    // ---------- program（program 头文件参数运行期查表）----------
    // PROGRAM X(INFILE, OUTFILE); 的参数在编译期无法确定 url，
    // 编译产物只烧参数名，运行时通过 ctx.programFileUrls 查表。
    // 缺省为恒等映射（程序参数名即 files 键名）。
    'program.fileUrl': (ctx, [name]) => {
      const key = String(name ?? '').toLowerCase()
      // 大小写不敏感的精确匹配（Pascal 标识符大小写不敏感）
      for (const [k, v] of Object.entries(ctx.programFileUrls)) {
        if (k.toLowerCase() === key) {
          return v
        }
      }
      return String(name ?? '')
    },
  }
}

export class PascalSemanticCompiler implements SemanticCompiler {
  literalToJs(literal: JsonCode.Literal, _compiler: JsCompiler): string | undefined {
    switch (literal.key) {
      case 'i64':
        return literal.arg // 十进制整数字符串，直接作为 JS 数字
      case 'f64':
        return literal.arg // 浮点字符串，直接作为 JS 数字
      case 'bool':
        return literal.arg // 'true' 或 'false'
      case 'str':
        return JSON.stringify(literal.arg)
      case 'char':
        return JSON.stringify(literal.arg)
      case 'null':
        // ISO 7185 6.4.4: nil-value → JS null
        return 'null'
      case 'type':
        // 类型描述字面量：arg 已经是 JSON 字符串，直接作为 JS 对象字面量返回。
        // JSON 是 JS 对象字面量的子集，所以直接嵌入 JS 代码即可。
        // runtime 中 mem.default.array / mem.default.rec 直接接收对象，不需要 JSON.parse。
        return literal.arg
      default:
        return undefined
    }
  }

  syscallToJs(syscall: JsonCode.Syscall, compiler: JsCompiler): string | undefined {
    const key = syscall.key
    const args = syscall.args.map((a) => compiler.compileExpr(a))

    // ---------- 算术（inline）----------
    // i64 — 32 位有符号整数语义（| 0 截断，与原 compiler 一致）
    switch (key) {
      case 'i64.add':
        return `((${args[0]} + ${args[1]}) | 0)`
      case 'i64.sub':
        return `((${args[0]} - ${args[1]}) | 0)`
      case 'i64.mul':
        return `((${args[0]} * ${args[1]}) | 0)`
      case 'i64.div':
        return `(() => { const __d = ${
          args[1]
        }; if (__d === 0) throw new Error('JS VM: division by zero'); return (Math.trunc(${args[0]} / __d)) | 0; })()`
      case 'i64.mod':
        return `(() => { const __m = ${
          args[1]
        }; if (__m === 0) throw new Error('JS VM: division by zero'); const __l = ${
          args[0]
        }; return (__l - Math.trunc(__l / __m) * __m) | 0; })()`
      case 'i64.neg':
        return `(-${args[0]} | 0)`
      case 'i64.and':
        return `((${args[0]} & ${args[1]}) | 0)`
      case 'i64.or':
        return `((${args[0]} | ${args[1]}) | 0)`
      case 'i64.not':
        return `(~${args[0]} | 0)`
      case 'i64.abs':
        return `(Math.abs(${args[0]}) | 0)`
      case 'i64.odd':
        return `((${args[0]} % 2) !== 0)`

      // f64
      case 'f64.add':
        return `(${args[0]} + ${args[1]})`
      case 'f64.sub':
        return `(${args[0]} - ${args[1]})`
      case 'f64.mul':
        return `(${args[0]} * ${args[1]})`
      case 'f64.div':
        return `(${args[0]} / ${args[1]})`
      case 'f64.neg':
        return `(-${args[0]})`
      case 'f64.abs':
        return `Math.abs(${args[0]})`
      case 'f64.sqrt':
        // ISO 7185 6.6.6.2: "It shall be an error if such a value does not exist"
        // sqrt(x) for x < 0 is undefined → must throw
        return `(() => { const __x = ${
          args[0]
        }; if (!(__x >= 0)) throw new Error('sqrt: domain error (x < 0)'); return Math.sqrt(__x); })()`
      case 'f64.sin':
        return `Math.sin(${args[0]})`
      case 'f64.cos':
        return `Math.cos(${args[0]})`
      case 'f64.exp':
        return `Math.exp(${args[0]})`
      case 'f64.ln':
        // ISO 7185 6.6.6.2: "It shall be an error if such a value does not exist"
        // ln(x) for x <= 0 is undefined → must throw
        return `(() => { const __x = ${
          args[0]
        }; if (!(__x > 0)) throw new Error('ln: domain error (x <= 0)'); return Math.log(__x); })()`
      case 'f64.arctan':
        return `Math.atan(${args[0]})`

      // 布尔
      case 'bool.and':
        return `(${args[0]} && ${args[1]})`
      case 'bool.or':
        return `(${args[0]} || ${args[1]})`
      case 'bool.not':
        return `(!${args[0]})`

      // 比较
      case 'cmp.eq':
        return `(${args[0]} === ${args[1]})`
      case 'cmp.ne':
        return `(${args[0]} !== ${args[1]})`
      case 'cmp.lt':
        return `(${args[0]} < ${args[1]})`
      case 'cmp.le':
        return `(${args[0]} <= ${args[1]})`
      case 'cmp.gt':
        return `(${args[0]} > ${args[1]})`
      case 'cmp.ge':
        return `(${args[0]} >= ${args[1]})`

      // 转换
      case 'cast.f64.to.i64':
        return `Math.trunc(${args[0]})`
      case 'cast.f64.to.i64.round':
        // ISO 7185 6.6.6.3: round(x) = trunc(x+0.5) if x>=0, trunc(x-0.5) if x<0
        // JS Math.round 对 -3.5 返回 -3（向 +∞ 舍入），不符合 ISO（ISO 要求 -4）
        return `(Math.trunc(${args[0]} >= 0 ? ${args[0]} + 0.5 : ${args[0]} - 0.5) | 0)`
      case 'cast.char.to.i64':
        return `(${args[0]}.charCodeAt(0))`
      case 'cast.bool.to.i64':
        return `(${args[0]} ? 1 : 0)`
      case 'cast.i64.to.char':
        return `String.fromCharCode(${args[0]})`

      // ---------- 数组/记录/cell（inline，符合 JS 语义）----------
      // array.get: args = [arr, idx1, idx2, ...] → arr[idx1][idx2]...
      case 'array.get': {
        if (args.length < 2) {
          return args[0]
        }
        return `(${args[0]}${
          args
            .slice(1)
            .map((i) => `[${i}]`)
            .join('')
        })`
      }
      // array.set: args = [arr, idx1, idx2, ..., val] → arr[idx1][idx2]... = val
      case 'array.set': {
        if (args.length < 3) {
          return args[0]
        }
        const val = args[args.length - 1]
        const indices = args.slice(1, -1)
        return `(${args[0]}${indices.map((i) => `[${i}]`).join('')} = ${val})`
      }
      // rec.field: args = [obj, fieldName] → obj[fieldName]
      case 'rec.field':
        return `(${args[0]}[${args[1]}])`
      // rec.set: args = [obj, fieldName, val] → obj[fieldName] = val
      case 'rec.set':
        return `(${args[0]}[${args[1]}] = ${args[2]})`
      // cell.create: args = [val] → {v: val}
      case 'cell.create':
        return `({v: ${args[0]}})`
      // cell.get: args = [cell] → cell.v
      case 'cell.get':
        return `(${args[0]}.v)`
      // cell.set: args = [cell, val] → cell.v = val
      case 'cell.set':
        return `(${args[0]}.v = ${args[1]})`
      // ISO 7185 6.5.4: 指针解引用 p^ — nil 解引用是 error (6.4.4)
      case 'ptr.deref':
        return `(() => { const __p = ${
          args[0]
        }; if (__p === null) throw new Error('dereference of nil pointer (ISO 7185 6.4.4)'); return __p.v; })()`
      // p^ := x — nil 解引用是 error
      case 'ptr.assign':
        return `(() => { const __p = ${
          args[0]
        }; if (__p === null) throw new Error('dereference of nil pointer (ISO 7185 6.4.4)'); __p.v = ${args[1]}; })()`
      // dispose(p) 前置检查：p 为 nil 是 error (ISO 7185 6.6.5.3)
      case 'ptr.dispose.check':
        return `(() => { if (${args[0]} === null) throw new Error('dispose of nil-value (ISO 7185 6.6.5.3)'); })()`

      // io.break: 空操作
      case 'io.break':
        return `undefined`

      default:
        // 走 dispatcher
        return `__sys(${JSON.stringify(key)}, [${args.join(', ')}])`
    }
  }
}
