import type { JsCompiler, SemanticCompiler } from '@/backend/codegen/json-code-compiler.ts'
import * as JsonCode from '@/middle/ir/json-code.ts'
import { rtKeys } from '@/middle/rewrite/runtime-keys.ts'
import type { SyscallHandler } from '../runtime-type.ts'

/** 运行期基础设施：边界检查 / 步数限制 / 函数进入钩子 */
export function basicSyscall(): Record<string, SyscallHandler> {
  // subrange 运行时边界检查（rewrite 在 pred / succ 展开等处产 runtime.range.check）
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
    [rtKeys.stepsCheck]: stepsCheck,
    [rtKeys.hookFunctionEnter]: () => undefined,
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
  [rtKeys.int32Add]: (a) => `((${a[0]} + ${a[1]}) | 0)`,
  [rtKeys.int32Subtract]: (a) => `((${a[0]} - ${a[1]}) | 0)`,
  [rtKeys.int32Multiply]: (a) => `((${a[0]} * ${a[1]}) | 0)`,
  [rtKeys.int32Negate]: (a) => `(-(${a[0]}) | 0)`,
  [rtKeys.int32And]: (a) => `((${a[0]} & ${a[1]}) | 0)`,
  [rtKeys.int32Or]: (a) => `((${a[0]} | ${a[1]}) | 0)`,
  [rtKeys.booleanAnd]: (a) => `(${a[0]} && ${a[1]})`,
  [rtKeys.booleanOr]: (a) => `(${a[0]}|| ${a[1]})`,
  [rtKeys.int32Not]: (a) => `(~(${a[0]}) | 0)`,
  [rtKeys.int32Absolute]: (a) => `(Math.abs(${a[0]}) | 0)`,
  [rtKeys.int32Odd]: (a) => `(((${a[0]}) % 2) !== 0 ? 1 : 0)`,

  [rtKeys.float32Add]: (a) => `(Math.fround(${a[0]} + ${a[1]}))`,
  [rtKeys.float32Subtract]: (a) => `(Math.fround(${a[0]} - ${a[1]}))`,
  [rtKeys.float32Multiply]: (a) => `(Math.fround(${a[0]} * ${a[1]}))`,
  [rtKeys.float32Divide]: (a) => `(Math.fround(${a[0]} / ${a[1]}))`,
  [rtKeys.float32Negate]: (a) => `(Math.fround(-(${a[0]})))`,
  [rtKeys.float32Absolute]: (a) => `(Math.fround(Math.abs(${a[0]})))`,
  [rtKeys.float32Sine]: (a) => `(Math.sin(${a[0]}))`,
  [rtKeys.float32Cosine]: (a) => `(Math.cos(${a[0]}))`,
  [rtKeys.float32Exponential]: (a) => `(Math.exp(${a[0]}))`,
  [rtKeys.float32Arctangent]: (a) => `(Math.atan(${a[0]}))`,

  [rtKeys.booleanNot]: (a) => `((${a[0]}) ? 0 : 1)`,

  [rtKeys.compareEqual]: (a) => `((${a[0]} === ${a[1]}) ? 1 : 0)`,
  [rtKeys.compareNotEqual]: (a) => `((${a[0]} !== ${a[1]}) ? 1 : 0)`,
  [rtKeys.compareLess]: (a) => `(((${a[0]}) < (${a[1]})) ? 1 : 0)`,
  [rtKeys.compareLessOrEqual]: (a) => `(((${a[0]}) <= (${a[1]})) ? 1 : 0)`,
  [rtKeys.compareGreater]: (a) => `(((${a[0]}) > (${a[1]})) ? 1 : 0)`,
  [rtKeys.compareGreaterOrEqual]: (a) => `(((${a[0]}) >= (${a[1]})) ? 1 : 0)`,

  // 注：cast.float32.to.int32.round / cast.char.to.int32 的参数在 handler 里被多次使用，
  // 内联会造成实参重复求值（与 dispatcher 语义不一致），暂不内联。
  [rtKeys.castFloat32ToInt32]: (a) => `(Math.trunc(${a[0]}))`,
  [rtKeys.castBooleanToInt32]: (a) => `((${a[0]}) ? 1 : 0)`,
  [rtKeys.castInt32ToChar]: (a) => `(String.fromCharCode(${a[0]}))`,

  // bytes.alloc / bytes.clone / bytes.copy：每个实参只出现一次
  [rtKeys.bytesAlloc]: (a) => `(new Uint8Array(${a[0]}))`,
  [rtKeys.bytesClone]: (a) => `(${a[0]}.slice(0, ${a[1]}))`,
  [rtKeys.bytesCopy]: (a) => `(${a[0]}.set(${a[2]}.subarray(0, ${a[3]}), ${a[1]}))`,
  // view.subarray：offset 在生成代码里出现两次，仅当它是简单表达式时才展开
  [rtKeys.viewSubarray]: (a) => {
    if (!SIMPLE_EXPR_RE.test(a[1])) {
      return undefined
    }
    return `(${a[0]}.subarray(${a[1]}, ${a[1]} + ${a[2]}))`
  },
  // 注：bytes.get.* / bytes.set.* 刻意不内联——mem.ts 的 handler 已按 ArrayBuffer 缓存
  // DataView，内联版每次读写都要 new DataView，反而更慢。

  [rtKeys.cellNew]: (a) => `({ kind: 'cell', value: ${a[0]} })`,
  [rtKeys.cellGet]: (a) => `(${a[0]}.value)`,
  // cell.set 的 handler 返回 undefined，用 void 保持返回值语义
  [rtKeys.cellSet]: (a) => `(void (${a[0]}.value = ${a[1]}))`,

  // objectarray.* 都是类型无知的原子操作：统一走 base[offset+idx]，
  // 无需在运行时区分「完整数组」与「子数组视图」。
  [rtKeys.objectArrayGet]: (a) => `(${a[0]}.base[${a[0]}.offset + ${a[1]}])`,
  [rtKeys.objectArraySet]: (a) => `(void (${a[0]}.base[${a[0]}.offset + ${a[1]}] = ${a[2]}))`,
  [rtKeys.objectArraySublist]: (a) => `({base: ${a[0]}.base, offset: (${a[0]}.offset + ${a[1]}) | 0})`,

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
      case 'number':
        // 数值字面量：整型 / 实型 / 布尔序数值，arg 直接作为 JS 数字
        return literal.arg
      case 'string':
        // 字符串 / 字符字面量的内容
        return JSON.stringify(literal.arg)
      case 'bytes':
        // 字符串字面量（packed array of char）→ Uint8Array 字面量
        return `new Uint8Array(${literal.arg})`
      case 'field':
        // 记录字段名
        return JSON.stringify(literal.arg)
      case 'null':
        // ISO 7185 6.4.4: nil-value → JS undefined
        return 'undefined'
      case 'type':
        // 类型描述字面量：arg 已是 JSON 字符串，直接作为 JS 对象字面量嵌入。
        // 正常路径上 rewrite 会消费掉所有类型参数，codegen 不应再遇到本 key；
        // 保留该分支是为了兼容用户自定义 syscall 表透传的未重写节点。
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
