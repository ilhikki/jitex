import * as JsonCode from '@/middle/ir/json-code.ts'
import { emitSNode, structurize, type StructurizeContext } from './structurizer/index.ts'

export interface ToJsOptions {
  semantic?: SemanticCompiler
  /** id → 可读名字映射。提供时，生成的变量/函数名变为 v{id}_{name}，便于调试。 */
  debugNames?: Map<number, string>
  debug: boolean
}

export interface SemanticCompiler {
  syscallToJs(syscall: JsonCode.Syscall, compiler: JsCompiler): string | undefined

  literalToJs(literal: JsonCode.Literal, compiler: JsCompiler): string | undefined
}

export interface JsCompiler {
  compileId(id: number): string

  compileExpr(expr: JsonCode.Expr): string

  compileStatement(stmt: JsonCode.Statement): string
}

export interface ToJsResult {
  code: string
  /** 顶层函数的编译名，用于 ES module 的 export 语句 */
  mainName: string
}

export function toJs(fn: JsonCode.Function, options: ToJsOptions = { debug: false }): ToJsResult {
  const longJumpTargets = new Set<number>()
  collectLongJumpTargets(fn, longJumpTargets)

  // JSON code 的 id 全局唯一（见 json-code.ts §1），codegen 自造的标识符必须从既有
  // id 的最大值之后编号，否则会与 var / label / function id 撞名。
  const usedIds = new Set<number>()
  collectUsedIds(fn, usedIds)

  const compiler = new JsCompilerImpl(options, longJumpTargets, new IdAllocator(usedIds))
  const code = compiler.compileFunction(fn, true)
  return { code, mainName: compiler.compileId(fn.id) }
}

function collectLongJumpTargets(fn: JsonCode.Function, out: Set<number>): void {
  for (const stmt of fn.body) {
    if (stmt.kind === 'longJump') {
      out.add(stmt.functionId)
    }
  }
  for (const child of fn.children) {
    collectLongJumpTargets(child, out)
  }
}

/** 收集 JSON code 图中出现过的全部 id（var / label / function 共用一个 id 空间） */
function collectUsedIds(fn: JsonCode.Function, out: Set<number>): void {
  out.add(fn.id)
  for (const id of fn.params) {
    out.add(id)
  }
  for (const id of fn.locals) {
    out.add(id)
  }
  for (const stmt of fn.body) {
    collectStatementIds(stmt, out)
  }
  for (const child of fn.children) {
    collectUsedIds(child, out)
  }
}

function collectStatementIds(stmt: JsonCode.Statement, out: Set<number>): void {
  switch (stmt.kind) {
    case 'label':
    case 'jump':
      out.add(stmt.labelId)
      break
    case 'jumpIf':
      out.add(stmt.then)
      out.add(stmt.else)
      collectExprIds(stmt.condition, out)
      break
    case 'longJump':
      out.add(stmt.labelId)
      out.add(stmt.functionId)
      break
    case 'return':
      if (stmt.value) {
        collectExprIds(stmt.value, out)
      }
      break
    case 'eval':
      collectExprIds(stmt.expr, out)
      break
  }
}

function collectExprIds(expr: JsonCode.Expr, out: Set<number>): void {
  switch (expr.kind) {
    case 'ref':
      out.add(expr.varId)
      break
    case 'call':
      out.add(expr.functionId)
      for (const arg of expr.args) {
        collectExprIds(arg, out)
      }
      break
    case 'syscall':
      for (const arg of expr.args) {
        collectExprIds(arg, out)
      }
      break
    case 'literal':
      break
  }
}

/**
 * JS 数字只能精确表示到 2^53-1，再往上自增会停在同一个值上、生成出重名的标识符。
 * 因此 id 触及上限即失败，而不是静默产出重复 id。
 */
const MAX_ID = Number.MAX_SAFE_INTEGER

/**
 * 不重复 id 生成器：从既有 id 的最大值之后开始分配，供 codegen 自造的标识符
 * （如 __sys 解包变量）使用，保证不与 JSON code 的 id 相撞。
 */
class IdAllocator {
  private next: number

  constructor(private readonly used: Set<number>) {
    let max = 0
    for (const id of used) {
      if (id > max) {
        max = id
      }
    }
    this.next = max + 1
  }

  alloc(): number {
    while (true) {
      if (this.next > MAX_ID) {
        throw new Error(`id overflow: exceeds max id ${MAX_ID}`)
      }
      if (!this.used.has(this.next)) {
        break
      }
      this.next += 1
    }
    const id = this.next
    this.used.add(id)
    this.next += 1
    return id
  }
}

class JsCompilerImpl implements JsCompiler {
  /** 走 dispatcher 的 syscall key → 顶层解包变量名（全图共用一个解包） */
  private readonly sysVarNames = new Map<string, string>()

  constructor(
    private readonly options: ToJsOptions,
    private readonly longJumpTargets: ReadonlySet<number>,
    private readonly idAllocator: IdAllocator,
  ) {
  }

  private get structCtx(): StructurizeContext {
    return {
      longJumpTargets: this.longJumpTargets,
      compileExpr: (expr) => this.compileExpr(expr),
      compileStatement: (stmt) => this.compileStatement(stmt),
    }
  }

  compileFunction(fn: JsonCode.Function, top: boolean, indent = ''): string {
    return top ? this.compileMainFunction(fn, indent) : this.compileNestedFunction(fn, indent)
  }

  /**
   * 顶层函数是工厂：注入 __sys、把用到的 syscall 解包成局部常量，返回一个可多次
   * 调用的函数。状态（locals / 子函数 / 状态机标志）全部留在内层作用域，故每次
   * 调用都从干净状态开始，互不污染。
   */
  private compileMainFunction(fn: JsonCode.Function, indent: string): string {
    // 内层函数体的缩进
    const runIndent = indent + '    '

    // 先编译子函数与函数体：编译过程中登记走 dispatcher 的 syscall key，
    // 而解包声明必须写在它们之前，所以只能编译完再组装。
    const children = fn.children
      .map((child) => this.compileNestedFunction(child, runIndent))
      .join('\n')
    const body: string[] = []
    this.compileBody(fn, body, runIndent)

    const lines: string[] = []
    lines.push(`${indent}${this.functionHeader(fn, true)}`)

    // __sys 解包：每个用到的 syscall 只取一次，省掉调用点的属性查找。
    // key 由 compileExpr 的 dispatcher 回退分支登记（见 syscallVar）。
    for (const [key, name] of this.sysVarNames) {
      lines.push(`${indent}  const ${name} = __sys[${JSON.stringify(key)}];`)
    }

    lines.push(`${indent}  return function __run() {`)
    if (this.longJumpTargets.size > 0) {
      lines.push(`${indent}    let __is_long_jump_mode = false;`)
      lines.push(`${indent}    let __long_jump_label_id = 0;`)
      lines.push(`${indent}    let __long_jump_function_id = 0;`)
    }
    for (const local of fn.locals) {
      lines.push(`${indent}    let ${this.compileId(local)};`)
    }
    if (children.length > 0) {
      lines.push(children)
    }
    for (const line of body) {
      lines.push(line)
    }
    lines.push(`${indent}  };`)
    lines.push(`${indent}}`)
    return lines.join('\n')
  }

  /** 内层函数（子函数）：靠闭包访问外层的 locals 与解包变量，不需要 __sys 参数 */
  private compileNestedFunction(fn: JsonCode.Function, indent: string): string {
    const lines: string[] = []

    lines.push(`${indent}${this.functionHeader(fn, false)}`)

    for (const local of fn.locals) {
      lines.push(`${indent}  let ${this.compileId(local)};`)
    }

    for (const child of fn.children) {
      lines.push(this.compileNestedFunction(child, indent + '  '))
    }

    this.compileBody(fn, lines, indent + '  ')

    lines.push(`${indent}}`)
    return lines.join('\n')
  }

  private functionHeader(fn: JsonCode.Function, top: boolean): string {
    const params = fn.params.map((x) => this.compileId(x))
    // 顶层函数添加 __sys 参数（ES module 导出后由外部注入 dispatcher）
    if (top) {
      params.unshift('__sys')
    }
    return `function ${this.compileId(fn.id)}(${params.join(', ')}) {`
  }

  private compileBody(fn: JsonCode.Function, lines: string[], indent: string) {
    const result = structurize(fn, this.structCtx)
    if (result.kind === 'structured') {
      const text = emitSNode(result.body, indent)
      if (text.length > 0) {
        lines.push(text)
      }
      return
    }
    this.compileStateBody(fn, lines, indent)
  }

  private compileStateBody(fn: JsonCode.Function, lines: string[], indent: string) {
    lines.push(`${indent}let __pc = 0;`)
    lines.push(`${indent}for (;;) {`)
    lines.push(`${indent}  try {`)
    lines.push(`${indent}    switch (__pc) {`)

    // 决策 10A：__pc 初始值 0，但 label ID 从 1 开始。
    // 插入 case 0: 利用 switch 穿透语义，让 pc=0 落到第一个实际 label
    // 或顺序执行非 label 的 statement（如变量初始化）。
    // 前提：label ID 永远不为 0（Analyzer.nextId_ 从 1 起步，满足）。
    lines.push(`${indent}      case 0:`)

    for (const stmt of fn.body) {
      if (stmt.kind === 'label') {
        lines.push(`${indent}      case ${stmt.labelId}:`)
        continue
      }

      lines.push(indentLines(this.compileStatement(stmt), indent + '        '))
    }

    lines.push(`${indent}      default:`)
    lines.push(`${indent}        return;`)
    lines.push(`${indent}    }`)
    lines.push(`${indent}  } catch (__ignored) {`)
    lines.push(
      `${indent}    if (!__is_long_jump_mode || __long_jump_function_id !== ${fn.id}) throw __ignored;`,
    )
    lines.push(`${indent}    __is_long_jump_mode = false;`)
    lines.push(`${indent}    __pc = __long_jump_label_id;`)
    lines.push(`${indent}    continue;`)
    lines.push(`${indent}  }`)
    lines.push(`${indent}}`)
  }

  compileStatement(stmt: JsonCode.Statement): string {
    switch (stmt.kind) {
      case 'label':
        return ''

      case 'jump':
        return [`__pc = ${stmt.labelId};`, `continue;`].join('\n')

      case 'jumpIf':
        return [
          `__pc = ${stmt.then};`,
          `if (!(${this.compileExpr(stmt.condition)})) __pc = ${stmt.else};`,
          `continue;`,
        ].join('\n')

      case 'longJump':
        return [
          `__long_jump_label_id = ${stmt.labelId};`,
          `__long_jump_function_id = ${stmt.functionId};`,
          `__is_long_jump_mode = true;`,
          `throw 0;`,
        ].join('\n')

      case 'eval':
        return `${this.compileExpr(stmt.expr)};`

      case 'return':
        return stmt.value ? `return ${this.compileExpr(stmt.value)};` : 'return;'
    }
  }

  compileExpr(expr: JsonCode.Expr): string {
    switch (expr.kind) {
      case 'ref':
        return this.compileId(expr.varId)

      case 'call':
        return `${this.compileId(expr.functionId)}(${expr.args.map((x) => this.compileExpr(x)).join(', ')})`

      case 'literal':
        // semantic 由 transform 构造本编译器时提供
        return this.options.semantic!.literalToJs(expr, this) ?? this.error(`Unknown literal ${expr.key}`)

      case 'syscall': {
        const js = this.options.semantic!.syscallToJs(expr, this)
        if (js !== undefined) {
          return js
        }
        const args = expr.args.map((arg) => this.compileExpr(arg)).join(', ')
        return `${this.syscallVar(expr.key)}(${args})`
      }
    }
  }

  /** dispatcher 回退用的解包变量名：同一 key 全图复用一个 */
  private syscallVar(key: string): string {
    const existing = this.sysVarNames.get(key)
    if (existing !== undefined) {
      return existing
    }
    const name = this.compileId(this.idAllocator.alloc())
    this.sysVarNames.set(key, name)
    return name
  }

  compileId(id: number): string {
    const name = this.options.debugNames?.get(id)
    if (this.options.debug && name) {
      return `v${id}_${name}`
    }
    return `v${id}`
  }

  private error(message: string): never {
    throw new Error(message)
  }
}

function indentLines(text: string, indent: string): string {
  return text
    .split('\n')
    .map((x) => indent + x)
    .join('\n')
}
