import type { JsCompiler, SemanticCompiler } from '@/backend/codegen/json-code-compiler.ts'
import * as JsonCode from '@/middle/ir/json-code.ts'
import { rtKeys } from '@/middle/rewrite/runtime-keys.ts'
import type { SyscallHandler } from '../runtime-type.ts'

/** 运行期基础设施：debug 检查 / 函数进入钩子 */
export function basicSyscall(): Record<string, SyscallHandler> {
  // subrange 边界检查（rewrite 只在 debug 构建产出 runtime.debug.range.check）。
  // 必须回传被检查的值：rewrite 既把它当语句（赋值前的校验），也把它当表达式
  // （pred / succ 的结果包裹，ISO 6.6.6.4）。
  const debugRangeCheck: SyscallHandler = (_ctx, index, min, max) => {
    if ((index as number) < (min as number) || (index as number) > (max as number)) {
      throw new Error(`subrange value ${index} out of range ${min}..${max}`)
    }
    return index
  }

  // 循环步数限制（rewrite 只在 debug 构建产出 runtime.debug.steps.check）
  const debugStepsCheck: SyscallHandler = (ctx, _args) => {
    if (++ctx.steps > ctx.maxSteps) {
      throw new Error('step limit exceeded')
    }
    return undefined
  }

  return {
    [rtKeys.debugStepsCheck]: debugStepsCheck,
    [rtKeys.hookFunctionEnter]: () => undefined,
    [rtKeys.debugRangeCheck]: debugRangeCheck,
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
 * Pascal 数字字面量 → 合法的 JS 数字字面量。
 *
 * Pascal 的 digit-sequence 是十进制，前导零只表示位数（0100000 = 100000，ISO 6.1.5）；
 * 而 JS 宽松模式（`new Function` 的函数体即宽松模式）把前导 0 的整数按八进制解析
 * （0100000 → 32768），前导 0 后接比例因子更是语法错误（010E2 无法 parse）。
 * 因此以 0 开头且紧跟数字的字面量一律按十进制重新求值再输出。
 */
function jsNumberLiteral(raw: string): string {
  return /^0[0-9]/.test(raw) ? String(Number(raw)) : raw
}

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
  [rtKeys.castInt32ToChar]: (a) => `((${a[0]}) & 0xff)`,

  // 注：bytes.host / alloc / clone / copy / view.subarray 以及 bytes.get.* / bytes.set.*
  // 都不内联——宿主是 { bytes, dv } 对象，构造与标量读写统一由 mem.ts 的 handler 承担
  // （dv 随宿主走，不再需要按 ArrayBuffer 缓存）。

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

  literalToJs(literal: JsonCode.Literal, compiler: JsCompiler): string | undefined {
    switch (literal.key) {
      case 'jsExpr':
        return literal.arg
      case 'number':
        // 数值字面量：整型 / 实型 / 布尔序数值
        return jsNumberLiteral(literal.arg)
      case 'string':
        // 字符串 / 字符字面量的内容
        return JSON.stringify(literal.arg)
      case 'bytes':
        // 字符串字面量（packed array of char）→ 字节宿主
        return compiler.compileExpr({
          kind: 'syscall',
          key: rtKeys.bytesHost,
          args: [{
            kind: 'literal',
            key: 'jsExpr',
            arg: literal.arg,
          }],
        })
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
    return undefined
  }
}
