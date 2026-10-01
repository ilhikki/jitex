import type { JsCompiler, SemanticCompiler } from '@/backend/codegen/json-code-compiler.ts'
import * as JsonCode from '@/middle/ir/json-code.ts'
import { rtKeys } from '@jitex/runtime'

type InlineGen = (args: string[]) => string | undefined

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

  [rtKeys.castFloat32ToInt32]: (a) => `(Math.trunc(${a[0]}))`,
  [rtKeys.castBooleanToInt32]: (a) => `((${a[0]}) ? 1 : 0)`,
  [rtKeys.castInt32ToChar]: (a) => `((${a[0]}) & 0xff)`,

  [rtKeys.assign]: (a) => `((${a[0]}) = ${a[1]})`,

  [rtKeys.closureNoValue]: (a) => {
    if (a.length < 2) {
      throw new Error(`runtime.closure.noValue args < 2, actual ${a.length}`)
    }
    return `(() => { ${a.map((e) => `${e};`).join(' ')} })()`
  },

  [rtKeys.cellNew]: (a) => `({ kind: 'cell', value: ${a[0]} })`,
  [rtKeys.cellGet]: (a) => `(${a[0]}.value)`,
  [rtKeys.cellSet]: (a) => `(void (${a[0]}.value = ${a[1]}))`,

  [rtKeys.objectArrayGet]: (a) => `(${a[0]}.base[${a[0]}.offset + ${a[1]}])`,
  [rtKeys.objectArraySet]: (a) => `(void (${a[0]}.base[${a[0]}.offset + ${a[1]}] = ${a[2]}))`,
  [rtKeys.objectArraySublist]: (a) => `({base: ${a[0]}.base, offset: (${a[0]}.offset + ${a[1]}) | 0})`,

  [rtKeys.callIndirect]: (a) => `(${a[0]})(${a.slice(1).join(', ')})`,
}

export class PascalSemanticCompiler implements SemanticCompiler {
  private inlineFor(key: string): InlineGen | undefined {
    return inlineSyscalls[key]
  }

  literalToJs(literal: JsonCode.Literal, compiler: JsCompiler): string | undefined {
    switch (literal.key) {
      case 'jsExpr':
        return literal.arg
      case 'number':
        return jsNumberLiteral(literal.arg)
      case 'string':
        return JSON.stringify(literal.arg)
      case 'bytes':
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
        return JSON.stringify(literal.arg)
      case 'null':
        return 'undefined'
      case 'type':
        return literal.arg
      default:
        throw new Error(`literal kind '${literal.key}' not support`)
    }
  }

  syscallToJs(syscall: JsonCode.Syscall, compiler: JsCompiler): string | undefined {
    const key = syscall.key
    const args = syscall.args.map((a) => compiler.compileExpr(a))

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
