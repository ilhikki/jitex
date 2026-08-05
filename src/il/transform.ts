/*
 * IL Transform — 入口：Pascal 源码 → JS 代码字符串。
 *
 * 依赖关系（见 decide.md）：
 *   transform → compiler → analysis
 *   transform → json-code-compiler
 *   transform → runtime（执行时）
 *
 * 职责：
 *   1. parse：Pascal 源码 → AST
 *   2. analyze：AST → Analysis
 *   3. compile：AST + Analysis → JsonCode
 *   4. 后处理 JsonCode：插入 programFileUrls 的 file.assign
 *   5. toJs：JsonCode → JS 代码字符串（通过 SemanticCompiler 实现）
 *   6. 包装：返回可执行的 JS 代码
 *
 * SemanticCompiler 实现（决策 6）：
 *   - literalToJs：i64/f64/str/char/bool → JS 字面量
 *   - syscallToJs：算术/比较/逻辑/转换 inline，IO/file/cell/mem/set 走 __sys dispatcher
 */

import { lex } from '@/lexer/lexer'
import { parseProgram } from '@/parser/declarations'
import type { ParserInput, ProgramNode } from '@/ast/types'
import { analyzeProgram, type Analysis, type VarSymbol } from '@/il/analysis'
import { compileProgram } from '@/il/compiler'
import { toJs, type SemanticCompiler, type JsCompiler } from '@/il/json-code-compiler'
import { JsonCode } from '@/il/json-code'
import type { RunState, RunError } from '@/runtime/run-state'
import {
  createRuntimeContext,
  dispatch,
  toRunState,
  type RuntimeOptions,
} from '@/il/runtime'
import type { IlPlugin } from '@/il/plugin'

// ============================================================
// TransformOptions
// ============================================================

export interface TransformOptions {
  /** 程序文件变量名 → files 中的键名（用于 ASSIGN） */
  programFileUrls?: Record<string, string>
  /** 非标特性扩展（传递给 analysis 做语义检查） */
  extensions?: string[]
  /** 非标特性插件（AGENTS.md 原则 A.7：注入优先） */
  plugins?: IlPlugin[]
  /** 调试模式：生成带可读变量名的 JS 代码（v{id}_{name}） */
  debug?: boolean
}

// ============================================================
// parseSource：Pascal 源码 → AST
// ============================================================

function parseSource(source: string): ProgramNode {
  const tokens = lex(source)
  const input: ParserInput = { tokens, position: 0 }
  const result = parseProgram(input)
  if (!result.success) {
    throw new Error(`Parse error: ${(result as any).error}`)
  }
  return (result as any).astNode as ProgramNode
}

// ============================================================
// applyProgramFileUrls：在变量初始化之后插入 file.assign
// ============================================================

function applyProgramFileUrls(
  fn: JsonCode.Function,
  a: Analysis,
  programFileUrls?: Record<string, string>
): JsonCode.Function {
  if (!programFileUrls) return fn

  const preamble: JsonCode.Statement[] = []
  for (const [varName, url] of Object.entries(programFileUrls)) {
    const sym = a.globalSymbolOf(varName)
    if (sym && (sym.kind === 'var' || sym.kind === 'param')) {
      const varSym = sym as VarSymbol
      preamble.push({
        kind: 'eval',
        expr: {
          kind: 'syscall',
          key: 'file.assign',
          args: [
            { kind: 'ref', varId: varSym.varId },
            { kind: 'literal', key: 'str', arg: url },
          ],
        },
      })
    }
  }

  if (preamble.length === 0) return fn

  // bug 22 修复：file.assign 必须在变量初始化之后执行，
  // 否则文件变量还未被 mem.default/file.create 初始化（为 undefined），
  // 导致 args[0].url = ... 报 "Cannot set properties of undefined"。
  // 使用 compileBlock 记录的 initCount，而非 info.locals.length，
  // 因为编译阶段 allocTempLocal 会向 info.locals 追加 cell 临时变量。
  const initCount = fn.initCount ?? 0

  return {
    ...fn,
    body: [
      ...fn.body.slice(0, initCount),
      ...preamble,
      ...fn.body.slice(initCount),
    ],
  }
}

// ============================================================
// PascalSemanticCompiler — 实现 SemanticCompiler
// ============================================================

class PascalSemanticCompiler implements SemanticCompiler {
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
        return `(() => { const __d = ${args[1]}; if (__d === 0) throw new Error('JS VM: division by zero'); return (Math.trunc(${args[0]} / __d)) | 0; })()`
      case 'i64.mod':
        return `(() => { const __m = ${args[1]}; if (__m === 0) throw new Error('JS VM: division by zero'); const __l = ${args[0]}; return (__l - Math.trunc(__l / __m) * __m) | 0; })()`
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
        return `Math.sqrt(${args[0]})`
      case 'f64.sin':
        return `Math.sin(${args[0]})`
      case 'f64.cos':
        return `Math.cos(${args[0]})`
      case 'f64.exp':
        return `Math.exp(${args[0]})`
      case 'f64.ln':
        return `Math.log(${args[0]})`
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
        return `Math.round(${args[0]})`
      case 'cast.char.to.i64':
        return `(${args[0]}.charCodeAt(0))`
      case 'cast.bool.to.i64':
        return `(${args[0]} ? 1 : 0)`
      case 'cast.i64.to.char':
        return `String.fromCharCode(${args[0]})`

      // 字符串（也可以 inline）
      case 'str.concat':
        return `(${args[0]} + ${args[1]})`
      case 'str.length':
        return `(${args[0]}.length)`

      // ---------- 数组/记录/cell（inline，符合 JS 语义）----------
      // array.get: args = [arr, idx1, idx2, ...] → arr[idx1][idx2]...
      case 'array.get': {
        if (args.length < 2) return args[0]
        return `(${args[0]}${args.slice(1).map((i) => `[${i}]`).join('')})`
      }
      // array.set: args = [arr, idx1, idx2, ..., val] → arr[idx1][idx2]... = val
      case 'array.set': {
        if (args.length < 3) return args[0]
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

      // io.break: 空操作
      case 'io.break':
        return `undefined`

      default:
        // 走 dispatcher
        return `__sys(${JSON.stringify(key)}, [${args.join(', ')}])`
    }
  }
}

// ============================================================
// transform：Pascal 源码 → JS 代码字符串
// ============================================================

export function transform(source: string, options: TransformOptions = {}): string {
  // 1. parse
  const ast = parseSource(source)

  // 2. analyze（传递 extensions 和 plugins）
  const analysis = analyzeProgram(ast, options.extensions, options.plugins)

  // 3. compile
  let jsonCode = compileProgram(ast, analysis)

  // 4. 后处理：插入 programFileUrls 的 file.assign
  jsonCode = applyProgramFileUrls(jsonCode, analysis, options.programFileUrls)

  // 5. toJs
  const semantic = new PascalSemanticCompiler()
  const jsBody = toJs(jsonCode, {
    semantic,
    debugNames: options.debug ? analysis.debugNames() : undefined,
  })

  // 6. 包装：返回可执行的 JS 代码
  //    __sys 通过闭包在生成的函数内部可见
  return `return ${jsBody}`
}

// ============================================================
// transformAndRun：Pascal 源码 → 执行 → RunState
// ============================================================

export interface RunOptions extends TransformOptions, RuntimeOptions {}

export function run(source: string, options: RunOptions = {}): RunState {
  const ctx = createRuntimeContext({
    input: options.input,
    files: options.files,
    programFileUrls: options.programFileUrls,
    maxSteps: options.maxSteps,
    extensions: options.extensions,
    plugins: options.plugins,
  })

  try {
    // 编译
    const jsCode = transform(source, {
      programFileUrls: options.programFileUrls,
      extensions: options.extensions,
      plugins: options.plugins,
    })

    // __sys dispatcher
    const __sys = (key: string, args: any[]): any => dispatch(ctx, key, args)

    // 执行
    const factory = new Function('__sys', jsCode)
    const mainFn = factory(__sys)
    mainFn()

    return toRunState(ctx, 'terminated')
  } catch (e: any) {
    // 编译或执行出错：保留已产生的输出
    const error: RunError = {
      message: e?.message || String(e),
      stackTrace: e?.stack ? String(e.stack).split('\n').slice(0, 10) : [],
    }
    return toRunState(ctx, 'error', error)
  }
}
