import { JsonCode } from '@/compiler/json-code'

export interface ToJsOptions {
  semantic?: SemanticCompiler
  /** id → 可读名字映射。提供时，生成的变量/函数名变为 v{id}_{name}，便于调试。 */
  debugNames?: Map<number, string>
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

export function toJs(fn: JsonCode.Function, options: ToJsOptions = {}): ToJsResult {
  const compiler = new JsCompilerImpl(options)
  const code = compiler.compileFunction(fn, true)
  return { code, mainName: compiler.compileId(fn.id) }
}

class JsCompilerImpl implements JsCompiler {
  constructor(private readonly options: ToJsOptions) {}

  compileFunction(fn: JsonCode.Function, top: boolean, indent = ''): string {
    const lines: string[] = []

    lines.push(`${indent}${this.functionHeader(fn, top)}`)

    if (top) {
      lines.push(`${indent}  let __is_long_jump_mode = false;`)
      lines.push(`${indent}  let __long_jump_label_id = 0;`)
      lines.push(`${indent}  let __long_jump_function_id = 0;`)
    }

    for (const local of fn.locals) {
      lines.push(`${indent}  let ${this.compileId(local)};`)
    }

    for (const child of fn.children) {
      lines.push(this.compileFunction(child, false, indent + '  '))
    }

    this.compileBody(fn, lines, indent + '  ')

    lines.push(`${indent}}`)
    return lines.join('\n')
  }

  private functionHeader(fn: JsonCode.Function, top: boolean): string {
    const params = fn.params.map((x) => this.compileId(x))
    // 顶层函数添加 __sys 参数（ES module 导出后由外部注入 dispatcher）
    if (top) params.unshift('__sys')
    return `function ${this.compileId(fn.id)}(${params.join(', ')}) {`
  }

  private compileBody(fn: JsonCode.Function, lines: string[], indent: string) {
    if (this.needStateMachine(fn.body)) {
      this.compileStateBody(fn, lines, indent)
    } else {
      this.compileLinearBody(fn, lines, indent)
    }
  }

  private compileLinearBody(fn: JsonCode.Function, lines: string[], indent: string) {
    for (const stmt of fn.body) {
      lines.push(indent + this.compileStatement(stmt))
    }
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

      case 'assign':
        return `${this.compileExpr(stmt.target)} = ${this.compileExpr(stmt.value)};`

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

      case 'literal': {
        const semantic = this.options.semantic
        if (!semantic) throw new Error('semantic compiler required')
        return semantic.literalToJs(expr, this) ?? this.error(`Unknown literal ${expr.key}`)
      }

      case 'syscall': {
        const semantic = this.options.semantic
        if (!semantic) throw new Error('semantic compiler required')
        return semantic.syscallToJs(expr, this) ?? this.error(`Unknown syscall ${expr.key}`)
      }

      default:
        return this.error('unknown expression')
    }
  }

  compileId(id: number): string {
    const name = this.options.debugNames?.get(id)
    if (name) {
      return `v${id}_${name}`
    }
    return `v${id}`
  }

  private needStateMachine(body: JsonCode.Statement[]): boolean {
    return body.some(
      (x) => x.kind === 'label' || x.kind === 'jump' || x.kind === 'jumpIf' || x.kind === 'longJump',
    )
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
