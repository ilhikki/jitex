import type { JsCompiler, SemanticCompiler } from '@/backend/codegen/json-code-compiler.ts'
import * as JsonCode from '@/middle/ir/json-code.ts'
import { rtKeys } from '@/middle/rewrite/runtime-keys.ts'
import type { PascalSet, SyscallHandler } from '../runtime-type.ts'

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
  // subrange 运行时边界检查。'range.check'（lowering 直接产）与
  // 'runtime.range.check'（rewrite 产，如 pred/succ 展开）共用同一实现。
  const rangeCheck: SyscallHandler = (_ctx, index, min, max) => {
    if ((index as number) < (min as number) || (index as number) > (max as number)) {
      throw new Error(`subrange value ${index} out of range ${min}..${max}`)
    }
    return undefined
  }

  // 循环步数限制
  const stepsCheck: SyscallHandler = (ctx, _args) => {
    if (++ctx.steps > ctx.maxSteps) {
      throw new Error('step limit exceeded')
    }
    return undefined
  }

  return {
    // ---------- set（运算类：阶段1 起由 rewrite 产 runtime.set.*）----------
    [rtKeys.setUnion]: (_ctx, v1, v2): PascalSet => {
      return newPascalSet(new Set<number>([...unboxPascalSet(v1), ...unboxPascalSet(v2)]))
    },
    [rtKeys.setIntersect]: (_ctx, set, other) => {
      const jsSet = unboxPascalSet(set)
      return newPascalSet(new Set([...jsSet].filter((x) => unboxPascalSet(other).has(x))))
    },
    [rtKeys.setDiff]: (_ctx, set, other) =>
      newPascalSet(new Set([...(unboxPascalSet(set))].filter((x) => !(unboxPascalSet(other)).has(x)))),
    [rtKeys.setEq]: (_ctx, left, right) =>
      (unboxPascalSet(left)).size === (unboxPascalSet(right)).size &&
      [...unboxPascalSet(left)].every((x: number) => (unboxPascalSet(right)).has(x)),
    [rtKeys.setNe]: (_ctx, left, right) =>
      !((unboxPascalSet(left)).size === (unboxPascalSet(right)).size &&
        [...(unboxPascalSet(left))].every((x: number) => unboxPascalSet(right).has(x))),
    [rtKeys.setLe]: (_ctx, left, right) =>
      [...(unboxPascalSet(left))].every((x: number) => unboxPascalSet(right).has(x)),
    [rtKeys.setGe]: (_ctx, left, right) =>
      [...(unboxPascalSet(left))].every((x: number) => unboxPascalSet(right).has(x)),
    [rtKeys.setIn]: (_ctx, value, set) => (unboxPascalSet(set)).has(value as number),

    'runtime.steps.check': stepsCheck,
    // ---------- hook（调试钩子，no-op）----------
    'runtime.hook.function.enter': () => undefined,
    // ---------- range.check（subrange 运行时边界检查）----------
    'range.check': rangeCheck,
    [rtKeys.rangeCheck]: rangeCheck,
  }
}

/**
 * syscall 内联表：key → 「已编译的实参表达式 → 内联 JS 表达式」。
 *
 * 语义必须与 sys/arith.ts 等处的 handler 完全一致（返回值、异常、副作用）。
 * 表达式整体用括号包裹，保证嵌入父表达式时运算符优先级安全。
 * 未在此表的 key 一律回退 dispatcher。
 */
/** 内联表达式生成器：返回 undefined 表示放弃内联、回退 dispatcher */
type InlineGen = (args: string[]) => string | undefined

/**
 * 简单表达式：标识符 / 整数字面量 / 字符串字面量。
 * 只有简单表达式才允许在生成的内联代码里重复出现——
 * 这样与 dispatcher「实参各求值一次」的语义严格等价。
 */
const SIMPLE_EXPR_RE = /^(?:[A-Za-z_$][\w$]*|-?\d+|"[^"]*")$/

const inlineSyscalls: Record<string, InlineGen> = {
  // ---------- i32 算术 / 位运算 ----------
  [rtKeys.i32Add]: (a) => `((${a[0]} + ${a[1]}) | 0)`,
  [rtKeys.i32Sub]: (a) => `((${a[0]} - ${a[1]}) | 0)`,
  [rtKeys.i32Mul]: (a) => `((${a[0]} * ${a[1]}) | 0)`,
  [rtKeys.i32Neg]: (a) => `(-(${a[0]}) | 0)`,
  [rtKeys.i32And]: (a) => `((${a[0]} & ${a[1]}) | 0)`,
  [rtKeys.i32Or]: (a) => `((${a[0]} | ${a[1]}) | 0)`,
  [rtKeys.boolAnd]: (a) => `(${a[0]} && ${a[1]})`,
  [rtKeys.boolOr]: (a) => `(${a[0]}|| ${a[1]})`,
  [rtKeys.i32Not]: (a) => `(~(${a[0]}) | 0)`,
  [rtKeys.i32Abs]: (a) => `(Math.abs(${a[0]}) | 0)`,
  [rtKeys.i32Odd]: (a) => `(((${a[0]}) % 2) !== 0 ? 1 : 0)`,

  // ---------- f32 ----------
  [rtKeys.f32Add]: (a) => `(Math.fround(${a[0]} + ${a[1]}))`,
  [rtKeys.f32Sub]: (a) => `(Math.fround(${a[0]} - ${a[1]}))`,
  [rtKeys.f32Mul]: (a) => `(Math.fround(${a[0]} * ${a[1]}))`,
  [rtKeys.f32Div]: (a) => `(Math.fround(${a[0]} / ${a[1]}))`,
  [rtKeys.f32Neg]: (a) => `(Math.fround(-(${a[0]})))`,
  [rtKeys.f32Abs]: (a) => `(Math.fround(Math.abs(${a[0]})))`,
  [rtKeys.f32Sin]: (a) => `(Math.sin(${a[0]}))`,
  [rtKeys.f32Cos]: (a) => `(Math.cos(${a[0]}))`,
  [rtKeys.f32Exp]: (a) => `(Math.exp(${a[0]}))`,
  [rtKeys.f32Arctan]: (a) => `(Math.atan(${a[0]}))`,

  // ---------- bool ----------
  [rtKeys.boolNot]: (a) => `((${a[0]}) ? 0 : 1)`,

  // ---------- cmp（统一 0/1）----------
  [rtKeys.cmpEq]: (a) => `((${a[0]} === ${a[1]}) ? 1 : 0)`,
  [rtKeys.cmpNe]: (a) => `((${a[0]} !== ${a[1]}) ? 1 : 0)`,
  [rtKeys.cmpLt]: (a) => `(((${a[0]}) < (${a[1]})) ? 1 : 0)`,
  [rtKeys.cmpLe]: (a) => `(((${a[0]}) <= (${a[1]})) ? 1 : 0)`,
  [rtKeys.cmpGt]: (a) => `(((${a[0]}) > (${a[1]})) ? 1 : 0)`,
  [rtKeys.cmpGe]: (a) => `(((${a[0]}) >= (${a[1]})) ? 1 : 0)`,

  // ---------- cast ----------
  // 注：cast.f32.to.i32.round / cast.char.to.i32 的参数在 handler 里被多次使用，
  // 内联会造成实参重复求值（与 dispatcher 语义不一致），暂不内联。
  [rtKeys.castF32ToI32]: (a) => `(Math.trunc(${a[0]}))`,
  [rtKeys.castBoolToI32]: (a) => `((${a[0]}) ? 1 : 0)`,
  [rtKeys.castI32ToChar]: (a) => `(String.fromCharCode(${a[0]}))`,

  // ---------- 内存原语 ----------
  // mem.new / mem.clone / mem.copy：每个实参只出现一次
  [rtKeys.memNew]: (a) => `(new Uint8Array(${a[0]}))`,
  [rtKeys.memClone]: (a) => `(${a[0]}.slice(0, ${a[1]}))`,
  [rtKeys.memCopy]: (a) => `(${a[0]}.set(${a[2]}.subarray(0, ${a[3]}), ${a[1]}))`,
  // view.sub：offset 在生成代码里出现两次，仅当它是简单表达式时才展开
  [rtKeys.viewSub]: (a) => {
    if (!SIMPLE_EXPR_RE.test(a[1])) {
      return undefined
    }
    return `(${a[0]}.subarray(${a[1]}, ${a[1]} + ${a[2]}))`
  },
  // 注：num.get / num.set 刻意不内联——mem.ts 的 handler 已按 ArrayBuffer 缓存
  // DataView，内联版每次读写都要 new DataView，反而更慢。

  // ---------- cell ----------
  [rtKeys.cellNew]: (a) => `({ kind: 'cell', value: ${a[0]} })`,
  [rtKeys.cellGet]: (a) => `(${a[0]}.value)`,
  // cell.set 的 handler 返回 undefined，用 void 保持返回值语义
  [rtKeys.cellSet]: (a) => `(void (${a[0]}.value = ${a[1]}))`,

  // ---------- object 数组（统一视图表示 {base, offset}）----------
  // arrGet / arrSet / arrSublist 都是类型无知的原子操作：统一走 base[offset+idx]，
  // 无需在运行时区分「完整数组」与「子数组视图」。
  [rtKeys.arrGet]: (a) => `(${a[0]}.base[${a[0]}.offset + ${a[1]}])`,
  [rtKeys.arrSet]: (a) => `(void (${a[0]}.base[${a[0]}.offset + ${a[1]}] = ${a[2]}))`,
  [rtKeys.arrSublist]: (a) =>
    `({base: ${a[0]}.base, offset: (${a[0]}.offset + ${a[1]}) | 0})`,

  // ---------- 可调用形参：间接调用（ISO 6.6.3.4/6.6.3.5）----------
  // callee 是函数值；每个实参只出现一次，语义与 dispatcher 一致
  [rtKeys.callIndirect]: (a) => `(${a[0]})(${a.slice(1).join(', ')})`,
}

export class PascalSemanticCompiler implements SemanticCompiler {
  /** 命中内联规则时返回生成函数，否则 undefined */
  private inlineFor(key: string): InlineGen | undefined {
    return inlineSyscalls[key]
  }

  literalToJs(literal: JsonCode.Literal, _compiler: JsCompiler): string | undefined {
    switch (literal.key) {
      case 'i32':
        return literal.arg // 十进制整数字符串，直接作为 JS 数字
      case 'f64':
        return literal.arg // 浮点字符串，直接作为 JS 数字
      case 'bool':
        // boolean 取序数值（ISO 6.4.2.2）：true → 1，false → 0
        return literal.arg === 'true' ? '1' : '0'
      case 'bytes':
        // 字符串字面量（packed array of char）→ Uint8Array 字面量
        return `new Uint8Array(${literal.arg})`
      case 'str':
        // key 'str' 是字符串内容的字面量编码（非类型）。
        // 直接产出 JS 字符串；由 str.to.char.array syscall 包装时才转为 PascalArray。
        return JSON.stringify(literal.arg)

      case 'char':
        return JSON.stringify(literal.arg)
      case 'null':
        // ISO 7185 6.4.4: nil-value → JS null
        return 'undefined'
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

    // 内联开关命中 → 展开为内联 JS 表达式（消除 dispatcher 的数组分配 + 两层调用）
    const inline = this.inlineFor(key)
    if (inline) {
      const code = inline(args)
      if (code !== undefined) {
        return code
      }
    }

    // 阶段1 起：其余 syscall 一律走 runtime dispatcher，不再 inline。
    // 具体 handler 见 sys/arith.ts（算术/逻辑/比较/转换/指针）、
    // sys/pascal-semantic-compiler.ts（cell/array/rec/mem/set）、sys/file.ts（IO/文件）。
    // 重新 inline 属于后续优化阶段。
    return `__sys[${JSON.stringify(key)}](${args.join(', ')})`
  }
}
