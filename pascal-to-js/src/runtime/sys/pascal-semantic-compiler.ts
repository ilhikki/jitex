import type { JsCompiler, SemanticCompiler } from '../../compiler/json-code-compiler.ts'
import * as JsonCode from '../../compiler/json-code.ts'
import type { PascalArray, PascalCell, PascalRecord, PascalSet, SyscallHandler } from '../runtime-type.ts'
import { type TypeDescriptor } from '../runtime-type.ts'
import {
  createDefaultArray,
  createDefaultRec,
  deepCopyValue,
  getArrayElement,
  setArrayElement,
} from '../runtime-util.ts'

function newPascalSet(set: Set<number>): PascalSet {
  return {
    kind: 'set',
    value: set,
  }
}

function unboxPascalSet(set: unknown): Set<number> {
  return (set as PascalSet).value
}

export function basicSyscall(): Record<string, SyscallHandler> {
  return {
    // ---------- cell（var 参数传递）----------
    'cell.create': (_ctx, [value]): PascalCell => ({
      kind: 'cell',
      value: value,
    }),
    'cell.get': (_ctx, [value]) => (value as PascalCell).value,
    'cell.set': (_ctx, [left, right]) => {
      ;(left as PascalCell).value = right
    },

    // ---------- array ----------
    'array.get': (_ctx, args) => getArrayElement(args[0] as PascalArray, args.slice(1) as number[]),
    'array.set': (_ctx, args) => {
      setArrayElement(args[0] as PascalArray, args.slice(1, -1) as number[], args[args.length - 1])
    },

    // ---------- cast ----------
    'cast.char.to.i64': (_ctx, [value]) => (typeof value === 'string' ? value.charCodeAt(0) : value),

    // ---------- record ----------
    'rec.field': (_ctx, [record, key]) => {
      const recordValue = (record as PascalRecord).value
      const keyText = key as string

      const keyKind = recordValue.keys[keyText]
      if (keyKind === 'fix') {
        return recordValue.fix[keyText]
      } else if (keyKind === 'variant') {
        const variantElement = recordValue.variant
        if (variantElement === undefined) {
          throw new Error(`field(variant) is unset ${keyText}`)
        }
        if (variantElement.name !== keyText) {
          throw new Error(`field(variant) set ${variantElement.name} but get ${keyText}`)
        }
        return variantElement.value
      } else {
        throw new Error(`record not contains field ${keyText}`)
      }
    },
    'rec.set': (_ctx, [r, key, value]) => {
      const record = r as PascalRecord
      const keyText = key as string
      const keyKind = record.value.keys[keyText]
      if (keyKind === 'fix') {
        record.value.fix[keyText] = value
      } else if (keyKind === 'variant') {
        record.value.variant = {
          type: record.value.variantTypes[keyText],
          value: value,
          name: keyText,
        }
      } else {
        throw new Error(`record not contains field ${keyText}`)
      }
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
      const pascalString = s as PascalArray
      return {
        kind: 'array',
        value: {
          array: pascalString.value.array,
          dims: {
            low: l,
            high: h,
            deep: 0,
          },
          elementType: { tag: 'char' },
        },
      }
    },

    // ---------- set ----------
    'set.empty': (_ctx, _args): PascalSet => newPascalSet(new Set()),
    'set.union': (_ctx, [v1, v2]): PascalSet => {
      return newPascalSet(new Set<number>([...unboxPascalSet(v1), ...unboxPascalSet(v2)]))
    },
    'set.intersect': (_ctx, [set, other]) => {
      const jsSet = unboxPascalSet(set)
      return newPascalSet(new Set([...jsSet].filter((x) => unboxPascalSet(other).has(x))))
    },
    'set.diff': (_ctx, [set, other]) =>
      newPascalSet(new Set([...(unboxPascalSet(set))].filter((x) => !(unboxPascalSet(other)).has(x)))),
    'set.eq': (_ctx, [left, right]) =>
      (unboxPascalSet(left)).size === (unboxPascalSet(right)).size &&
      [...unboxPascalSet(left)].every((x: number) => (unboxPascalSet(right)).has(x)),
    'set.ne': (_ctx, [left, right]) =>
      !((unboxPascalSet(left)).size === (unboxPascalSet(right)).size &&
        [...(unboxPascalSet(left))].every((x: number) => (unboxPascalSet(right)).has(x))),
    'set.le': (_ctx, [left, right]) => [...(unboxPascalSet(left))].every((x: number) => unboxPascalSet(right).has(x)),
    'set.ge': (_ctx, [left, right]) => [...(unboxPascalSet(left))].every((x: number) => unboxPascalSet(right).has(x)),
    'set.range': (_ctx, [start, end]) => {
      const s = new Set<number>()
      for (let i = start as number; i <= (end as number); i++) {
        s.add(i)
      }
      return newPascalSet(s)
    },
    'set.elem': (_ctx, [value]) => newPascalSet(new Set<number>([value as number])),
    'set.literal': (_ctx, args) => {
      const s = new Set<number>()
      for (const e of args) {
        if (Number.isSafeInteger(e)) {
          s.add(e as number)
        } else {
          for (const x of (e as PascalSet).value) {
            s.add(x as number)
          }
        }
      }
      return newPascalSet(s)
    },
    'set.in': (_ctx, [value, set]) => (unboxPascalSet(set)).has(value as number),

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

export class PascalSemanticCompiler implements SemanticCompiler {
  literalToJs(literal: JsonCode.Literal, _compiler: JsCompiler): string | undefined {
    switch (literal.key) {
      case 'i64':
        return literal.arg // 十进制整数字符串，直接作为 JS 数字
      case 'f64':
        return literal.arg // 浮点字符串，直接作为 JS 数字
      case 'bool':
        return literal.arg // 'true' 或 'false'
      case 'str': {
        const pascalString: PascalArray = {
          kind: 'array',
          value: {
            array: literal.arg.split(''),
            dims: {
              low: 0,
              high: literal.arg.length,
              deep: 0,
            },
          },
        }
        return JSON.stringify(pascalString)
      }

      case 'char':
        return JSON.stringify(literal.arg)
      case 'null':
        // ISO 7185 6.4.4: nil-value → JS null
        return 'null'
      case 'field':
        return JSON.stringify(literal.arg)
      case 'type':
        // 类型描述字面量：arg 已经是 JSON 字符串，直接作为 JS 对象字面量返回。
        // JSON 是 JS 对象字面量的子集，所以直接嵌入 JS 代码即可。
        // runtime 中 mem.default.array / mem.default.rec 直接接收对象，不需要 JSON.parse。
        return literal.arg
      default:
        throw new Error(`literal kind '${literal.key}' not support`)
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
      // ISO 7185 6.5.4: 指针解引用 p^ — nil 解引用是 error (6.4.4)
      case 'ptr.deref':
        return `(() => { const __p = ${
          args[0]
        }; if (__p === null) throw new Error('dereference of nil pointer (ISO 7185 6.4.4)'); return __p.value; })()`
      // p^ := x — nil 解引用是 error
      case 'ptr.assign':
        return `(() => { const __p = ${
          args[0]
        }; if (__p === null) throw new Error('dereference of nil pointer (ISO 7185 6.4.4)'); __p.value = ${
          args[1]
        }; })()`
      // dispose(p) 前置检查：p 为 nil 是 error (ISO 7185 6.6.5.3)
      case 'ptr.dispose.check':
        return `(() => { if (${args[0]} === null) throw new Error('dispose of nil-value (ISO 7185 6.6.5.3)'); })()`
      default:
        // 走 dispatcher
        return `__sys(${JSON.stringify(key)}, [${args.join(', ')}])`
    }
  }
}
