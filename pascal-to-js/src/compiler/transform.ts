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
 *   6. 包装：返回 ES module 代码（export）
 *
 * SemanticCompiler 实现（决策 6）：
 *   - literalToJs：i64/f64/str/char/bool → JS 字面量
 *   - syscallToJs：算术/比较/逻辑/转换 inline，IO/file/cell/mem/set 走 __sys dispatcher
 */

import { lex } from '@/lexer/lexer'
import { parseProgram } from '@/parser/declarations'
import type { ParserInput, ProgramNode } from '@/ast/types'
import { type Analysis, analyzeProgram, type VarSymbol } from '@/compiler/analysis'
import { compileProgram } from '@/compiler/compiler'
import { type JsCompiler, type SemanticCompiler, toJs } from '@/compiler/json-code-compiler'
import { JsonCode } from '@/compiler/json-code'
import type { RunError, RunState } from '@/runtime/run-state'
import { createRuntimeContext, dispatch, type RuntimeOptions, toRunState } from '@/compiler/runtime'
import type { IlPlugin } from '@/compiler/plugin'

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
  programFileUrls?: Record<string, string>,
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
    body: [...fn.body.slice(0, initCount), ...preamble, ...fn.body.slice(initCount)],
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

      // 字符串（也可以 inline）
      case 'str.concat':
        return `(${args[0]} + ${args[1]})`
      case 'str.length':
        return `(${args[0]}.length)`

      // str.to.char.array: args = [low, high, str]
      // 生成 IIFE 返回 1-based 字符数组对象，避免字符串作为数组索引时 0-based 偏移
      // 同时填充 length 属性（=high-low+1），便于 fileUrlToString 等遍历
      case 'str.to.char.array':
        return `(() => { const __low=${args[0]}|0, __high=${args[1]}|0, __s=${
          args[2]
        }; const __o={}; for(let __i=__low;__i<=__high;__i++){const __k=__i-__low; __o[__i]=__k<__s.length?__s.charAt(__k):' ';} __o.length=__high-__low+1; return __o; })()`

      // ---------- 数组/记录/cell（inline，符合 JS 语义）----------
      // array.get: args = [arr, idx1, idx2, ...] → arr[idx1][idx2]...
      case 'array.get': {
        if (args.length < 2) return args[0]
        return `(${args[0]}${
          args
            .slice(1)
            .map((i) => `[${i}]`)
            .join('')
        })`
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

// ============================================================
// transform：Pascal 源码 → ES module JS 代码
// ============================================================

/**
 * 将 Pascal 源码编译为 ES module JS 代码字符串。
 *
 * 输出格式（ES module，非 CommonJS）：
 *   function v1_main(__sys) { ... }
 *   export { v1_main };
 *
 * 变量/函数名携带可读名（v{id}_{name}），便于调试。
 * __sys 作为顶层函数参数，由 executeCompiled 或 import 后调用时注入。
 */
export function transform(source: string, options: TransformOptions = {}): string {
  // 1. parse
  const ast = parseSource(source)

  // 2. analyze（传递 extensions 和 plugins）
  const analysis = analyzeProgram(ast, options.extensions, options.plugins)

  // 3. compile
  let jsonCode = compileProgram(ast, analysis)

  // 4. 后处理：插入 programFileUrls 的 file.assign
  jsonCode = applyProgramFileUrls(jsonCode, analysis, options.programFileUrls)

  // 5. toJs（始终携带可读变量名）
  const semantic = new PascalSemanticCompiler()
  const { code: jsBody, mainName } = toJs(jsonCode, {
    semantic,
    debugNames: analysis.debugNames(),
  })

  // 6. 包装为 ES module
  return `${jsBody}\nexport { ${mainName} };`
}

// ============================================================
// executeCompiled：执行 transform 生成的 ES module 代码
// ============================================================

/**
 * 执行 transform() 生成的 ES module 代码。
 *
 * 生成的代码格式：
 *   function v1_main(__sys) { ... }
 *   export { v1_main };
 *
 * 执行方式：移除 export 语句，用 new Function 创建并调用顶层函数。
 * __sys dispatcher 作为参数传入。
 */
export function executeCompiled(
  code: string,
  __sys: (key: string, args: any[]) => any,
): void {
  // 提取导出的函数名
  const exportMatch = code.match(/export\s*\{\s*(\w+)\s*\}/)
  if (!exportMatch) throw new Error('executeCompiled: no export found in code')
  const mainName = exportMatch[1]

  // 移除 export 语句，添加 return
  const execCode = code.replace(/export\s*\{[^}]+\};?\s*$/, `return ${mainName};`)
  const factory = new Function(execCode)
  const mainFn = factory()
  mainFn(__sys)
}

// ============================================================
// transformAndRun：Pascal 源码 → 执行 → RunState
// ============================================================

export interface RunOptions extends TransformOptions, RuntimeOptions {}

export function run(source: string, options: RunOptions = {}): RunState {
  const debugLog: string[] = options.debugLog ?? []
  const ctx = createRuntimeContext({
    input: options.input,
    files: options.files,
    programFileUrls: options.programFileUrls,
    maxSteps: options.maxSteps,
    extensions: options.extensions,
    plugins: options.plugins,
    debugLog,
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

    // 执行（ES module 代码）
    executeCompiled(jsCode, __sys)

    return toRunState(ctx, 'terminated')
  } catch (e: any) {
    // 编译或执行出错：保留已产生的输出，并完整保存错误堆栈到 stackTrace
    const stackLines: string[] = e?.stack ? String(e.stack).split('\n').slice(0, 40) : []
    // 同时把错误信息追加到 debugLog，便于 e2e 报告统一查看
    debugLog.push(`[run] error: ${e?.message || String(e)}`)
    for (const line of stackLines) {
      debugLog.push(`  ${line}`)
    }
    const error: RunError = {
      message: e?.message || String(e),
      stackTrace: stackLines,
    }
    return toRunState(ctx, 'error', error)
  }
}
