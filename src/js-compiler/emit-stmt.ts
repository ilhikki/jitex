// 语句编译：emitStmt 及相关辅助（赋值/IF/WHILE/REPEAT/FOR/CASE/WITH/过程调用/READ/GOTO）
//
// 由原 compiler.ts 中的 private 方法提取为独立函数，所有函数接收 compiler 实例。
import type {
  ArrayAccessNode,
  AssignmentNode,
  BinaryExpressionNode,
  CaseStatementNode,
  CompoundStatementNode,
  ExpressionNode,
  FieldAccessNode,
  ForStatementNode,
  GotoStatementNode,
  IdentifierNode,
  IfStatementNode,
  IntegerLiteralNode,
  LabeledStatementNode,
  ProcedureCallNode,
  RepeatStatementNode,
  StatementNode,
  WhileStatementNode,
  WithStatementNode,
} from '../ast/types'
import { BUILTIN_SYSCALLS, Scope } from './emit-utils'
import {
  coerce,
  emitArg,
  emitArgFromExpr,
  emitExpr,
  findWithField,
  toBool,
  toInt,
} from './emit-expr'
import {
  arrayDimAt,
  arrayElementAfterNIndices,
  isScalarBare,
  recordFieldType,
  scalarBase,
  subrangeBounds,
  typeKind,
} from './emit-type'
import type { Compiler } from './compiler'

// ---- 语句生成 ----

// 扫描 compound 中顶层出现的 LabeledStatement，收集 label
export function collectLabelsFromCompound(
  compound: CompoundStatementNode
): IntegerLiteralNode[] {
  const labels: IntegerLiteralNode[] = []
  for (const s of compound.statements) {
    if (s.kind === 'LabeledStatement') {
      labels.push((s as LabeledStatementNode).label as IntegerLiteralNode)
    }
  }
  return labels
}

export function emitCompound(
  compiler: Compiler,
  node: CompoundStatementNode,
  scope: Scope,
  indent: number
): string {
  const pad = ' '.repeat(indent)
  const lines = node.statements
    .map((s) => emitStmt(compiler, s, scope, indent))
    .filter((x) => x.length > 0)
  return lines.join('\n')
}

export function emitStmt(
  compiler: Compiler,
  node: StatementNode,
  scope: Scope,
  indent: number
): string {
  const pad = ' '.repeat(indent)
  switch (node.kind) {
    case 'CompoundStatement':
      return emitCompound(compiler, node as CompoundStatementNode, scope, indent)

    case 'EmptyStatement':
      return ''

    case 'Assignment': {
      const a = node as AssignmentNode
      return pad + emitAssignment(compiler, a, scope)
    }

    case 'IfStatement': {
      const i = node as IfStatementNode
      const cond = emitExpr(compiler, i.condition, scope)
      const thenCode = emitStmt(compiler, i.thenBranch, scope, indent + 2)
      const lines = [`${pad}if (${toBool(compiler, cond.code, cond.type)}) {`, thenCode]
      if (i.elseBranch) {
        const elseCode = emitStmt(compiler, i.elseBranch, scope, indent + 2)
        lines.push(`${pad}} else {`, elseCode)
      }
      lines.push(`${pad}}`)
      return lines.join('\n')
    }

    case 'WhileStatement': {
      const w = node as WhileStatementNode
      const cond = emitExpr(compiler, w.condition, scope)
      const body = emitStmt(compiler, w.body, scope, indent + 2)
      // 在状态机模式下，如果 __skipTo 还没被吸收，跳过 body 继续循环
      const skipCheck =
        compiler.gotoMode === 'exception'
          ? `${pad}  if(__skipTo !== null) { if (${toBool(compiler, cond.code, cond.type)}) continue; else break; }\n`
          : ''
      return [
        `${pad}while (${toBool(compiler, cond.code, cond.type)}) {`,
        `${pad}  if (++ctx.steps > ctx.maxSteps) { throw new Error('JS VM: step limit exceeded') }`,
        skipCheck,
        body,
        `${pad}}`,
      ].join('\n')
    }

    case 'RepeatStatement': {
      const r = node as RepeatStatementNode
      const bodyStmts = r.statements
        .map((s) => emitStmt(compiler, s, scope, indent + 2))
        .filter((x) => x.length > 0)
      const cond = emitExpr(compiler, r.untilCondition, scope)
      const skipCheck =
        compiler.gotoMode === 'exception'
          ? `${pad}  if(__skipTo !== null) { if (!(${toBool(compiler, cond.code, cond.type)})) continue; }\n`
          : ''
      return [
        `${pad}do {`,
        `${pad}  if (++ctx.steps > ctx.maxSteps) { throw new Error('JS VM: step limit exceeded') }`,
        ...bodyStmts,
        skipCheck,
        `${pad}} while (!(${toBool(compiler, cond.code, cond.type)}));`,
      ].join('\n')
    }

    case 'ForStatement': {
      const f = node as ForStatementNode
      const vi = scope.lookup(f.variable.name)
      const vName = vi ? vi.jsName : f.variable.name
      const init = emitExpr(compiler, f.initial, scope)
      const final = emitExpr(compiler, f.final, scope)
      const body = emitStmt(compiler, f.body, scope, indent + 2)
      if (f.direction === 'TO') {
        const skipCheck =
          compiler.gotoMode === 'exception'
            ? `${pad}  if(__skipTo !== null) { if (${vName} <= ${toInt(compiler, final.code, final.type)}) continue; else break; }\n`
            : ''
        return [
          `${pad}for (${vName} = ${toInt(compiler, init.code, init.type)}; ${vName} <= ${toInt(compiler, final.code, final.type)}; ${vName} = (${vName} + 1) | 0) {`,
          `${pad}  if (++ctx.steps > ctx.maxSteps) { throw new Error('JS VM: step limit exceeded') }`,
          skipCheck,
          body,
          `${pad}}`,
        ].join('\n')
      } else {
        const skipCheck =
          compiler.gotoMode === 'exception'
            ? `${pad}  if(__skipTo !== null) { if (${vName} >= ${toInt(compiler, final.code, final.type)}) continue; else break; }\n`
            : ''
        return [
          `${pad}for (${vName} = ${toInt(compiler, init.code, init.type)}; ${vName} >= ${toInt(compiler, final.code, final.type)}; ${vName} = (${vName} - 1) | 0) {`,
          `${pad}  if (++ctx.steps > ctx.maxSteps) { throw new Error('JS VM: step limit exceeded') }`,
          skipCheck,
          body,
          `${pad}}`,
        ].join('\n')
      }
    }

    case 'ProcedureCall': {
      const pc = node as ProcedureCallNode
      return pad + emitProcedureCall(compiler, pc, scope)
    }

    case 'GotoStatement': {
      const gs = node as GotoStatementNode
      const lblName = String((gs.label as any).value)
      if (compiler.gotoMode === 'continue') {
        return `${pad}continue ${compiler.gotoLabel}`
      }
      if (compiler.gotoMode === 'break') {
        return `${pad}break ${compiler.gotoLabel}`
      }
      if (compiler.gotoMode === 'exception') {
        return `${pad}throw Object.assign(new Error('goto'), { __goto: ${JSON.stringify(lblName)} })`
      }
      if (compiler.labelCases) {
        const caseNum = compiler.labelCases.get(lblName)
        if (caseNum === undefined) {
          // 如果当前状态机找不到这个 label，说明要跳到外层，用 break 退出当前状态机
          if (compiler.labelSwitchName) {
            return `${pad}break ${compiler.labelSwitchName}`
          }
          throw new Error(`JS VM: goto ${lblName} - label not found`)
        }
        const continueLabel = compiler.labelSwitchName ? ` ${compiler.labelSwitchName}` : ''
        return `${pad}__pc = ${caseNum}; continue${continueLabel}`
      }
      return `${pad}throw new Error('JS VM: goto ${lblName} - label not found in current scope')`
    }

    case 'LabeledStatement': {
      const ls = node as LabeledStatementNode
      const lblName = String((ls.label as any).value)
      const innerCode = emitStmt(compiler, ls.statement, scope, indent)
      if (compiler.gotoMode === 'exception' && compiler.labelCases?.has(lblName)) {
        // 状态机模式：遇到匹配的 __skipTo 时清除标记
        return `${pad}if (__skipTo === ${JSON.stringify(lblName)}) { __skipTo = null; }\n${innerCode}`
      }
      return innerCode
    }

    case 'CaseStatement': {
      const cs = node as CaseStatementNode
      return pad + emitCase(compiler, cs, scope, indent)
    }

    case 'WithStatement': {
      const ws = node as WithStatementNode
      return emitWith(compiler, ws, scope, indent)
    }

    default:
      throw new Error(`JS VM: unsupported statement ${(node as any).kind}`)
  }
}

// CASE 语句 → JS switch
export function emitCase(
  compiler: Compiler,
  node: CaseStatementNode,
  scope: Scope,
  indent: number
): string {
  const pad = ' '.repeat(indent)
  const expr = emitExpr(compiler, node.expression, scope)
  // 把表达式统一转为 integer（integer/char/boolean/enum 都 OK）
  const switchExpr = toCaseInt(compiler, expr.code, expr.type)
  const lines: string[] = []
  lines.push(`switch (${switchExpr}) {`)
  for (const branch of node.branches) {
    for (const labelExpr of branch.labels) {
      const lbl = emitExpr(compiler, labelExpr, scope)
      lines.push(`${pad}  case ${toCaseInt(compiler, lbl.code, lbl.type)}:`)
    }
    const stmt = emitStmt(compiler, branch.statement, scope, indent + 4)
    lines.push(stmt)
    lines.push(`${pad}    break;`)
  }
  if (node.otherwise) {
    const stmt = emitStmt(compiler, node.otherwise, scope, indent + 4)
    lines.push(`${pad}  default:`)
    lines.push(stmt)
    lines.push(`${pad}    break;`)
  }
  lines.push(`${pad}}`)
  return lines.join('\n')
}

// CASE 表达式 → integer
export function toCaseInt(compiler: Compiler, code: string, type: string): string {
  if (type === 'integer') return code
  if (type === 'char') return `(${code}).raw.charCodeAt(0)`
  if (type === 'boolean') return `(${code} ? 1 : 0)`
  // enum/subrange 已经是 integer 裸值
  return code
}

// WITH 语句
export function emitWith(
  compiler: Compiler,
  node: WithStatementNode,
  scope: Scope,
  indent: number
): string {
  const pad = ' '.repeat(indent)
  const tmpNames: string[] = []
  const tmpTypeIds: string[] = []
  const lines: string[] = []
  lines.push(`${pad}{`)
  node.records.forEach((r) => {
    const e = emitExpr(compiler, r, scope)
    const tmpName = `__with_${compiler.withVarCounter++}`
    lines.push(`${pad}  const ${tmpName} = ${e.code}`)
    tmpNames.push(tmpName)
    tmpTypeIds.push(e.type)
  })
  const withScope = new Scope(scope)
  withScope.withRecords = tmpNames.map((n, i) => ({ jsName: n, typeId: tmpTypeIds[i] }))
  const body = emitStmt(compiler, node.body, withScope, indent + 2)
  lines.push(body)
  lines.push(`${pad}}`)
  return lines.join('\n')
}

// 生成 subrange 边界检查代码（如果不是 subrange 则原样返回）
export function rangeCheck(compiler: Compiler, code: string, origTypeId: string): string {
  const b = subrangeBounds(origTypeId)
  if (!b) return code
  if (b.base === 'char') {
    // char 存储为 PascalValue，需取 .raw 转 charCode 检查
    return `((__v) => { let __c = (typeof __v === 'object' && __v && __v.raw !== undefined) ? (typeof __v.raw === 'string' ? __v.raw.charCodeAt(0) : __v.raw) : __v; if (__c < ${b.min} || __c > ${b.max}) throw new Error('JS VM: char value ' + __c + ' out of range ${b.min}..${b.max}'); return __v })(${code})`
  }
  return `((__v) => { if (__v < ${b.min} || __v > ${b.max}) throw new Error('JS VM: value ' + __v + ' out of range ${b.min}..${b.max}'); return __v })(${code})`
}

export function emitAssignment(
  compiler: Compiler,
  a: AssignmentNode,
  scope: Scope
): string {
  // 左值类型：
  //   Identifier -> 变量赋值
  //   ArrayAccess -> a[i] := v  (数组元素赋值)
  //   FieldAccess -> r.f := v   (record 字段赋值)
  //   WITH 字段 -> __with_N.raw['FIELD'] = v
  if (a.left.kind === 'Identifier') {
    const id = a.left as IdentifierNode
    // 检查是否是 WITH 字段
    const withField = findWithField(compiler, id.name, scope)
    if (withField) {
      const rhs = emitExpr(compiler, a.right, scope)
      const target = `${withField.recordJsName}.raw[${JSON.stringify(id.name.toUpperCase())}]`
      return `${target} = ${rangeCheck(compiler, toRawValue(compiler, rhs.code, rhs.type, withField.fieldTypeId), withField.fieldTypeId)}`
    }
    const vi = scope.lookup(id.name)
    if (!vi) throw new Error(`JS VM: undefined variable ${id.name}`)
    const rhs = emitExpr(compiler, a.right, scope)
    const code = coerce(compiler, rhs.code, rhs.type, vi.typeId)
    const checked = rangeCheck(compiler, code, vi.origTypeId)
    // set/array/record 赋值需要深拷贝
    if (typeKind(compiler, vi.typeId) === 'set') {
      const copied = `ctx.box(${JSON.stringify(vi.typeId)}, new Set((${checked}).raw))`
      if (vi.isVar && isScalarBare(compiler, vi.typeId)) {
        return `${vi.jsName}.v = ${copied}`
      }
      return `${vi.jsName} = ${copied}`
    }
    // var 参数（scalar）：赋值到 .v
    if (vi.isVar && isScalarBare(compiler, vi.typeId)) {
      return `${vi.jsName}.v = ${checked}`
    }
    return `${vi.jsName} = ${checked}`
  }
  if (a.left.kind === 'ArrayAccess') {
    const aa = a.left as ArrayAccessNode
    const arr = emitExpr(compiler, aa.array, scope)
    const elemTypeId = arrayElementAfterNIndices(compiler, arr.type, aa.indices.length)
    if (!elemTypeId) throw new Error(`JS VM: ${arr.type} is not indexable`)
    const idxCodes: string[] = []
    for (let i = 0; i < aa.indices.length; i++) {
      const idx = emitExpr(compiler, aa.indices[i], scope)
      let idxCode = toInt(compiler, idx.code, idx.type)
      const d = arrayDimAt(compiler, arr.type, i)
      if (d) {
        idxCode = `ctx.checkArrayIndex(${idxCode}, ${d.low}, ${d.high})`
      }
      idxCodes.push(idxCode)
    }
    let idxCode = `${arr.code}.raw`
    for (const ic of idxCodes) {
      idxCode += `[${ic}]`
    }
    const rhs = emitExpr(compiler, a.right, scope)
    return `${idxCode} = ${rangeCheck(compiler, toRawValue(compiler, rhs.code, rhs.type, elemTypeId), elemTypeId)}`
  }
  if (a.left.kind === 'FieldAccess') {
    const fa = a.left as FieldAccessNode
    // record 字段赋值：r.f := v -> r.raw['F'] = v.raw (或裸值)
    const obj = emitExpr(compiler, fa.object, scope)
    const fieldName = fa.field.name.toUpperCase()
    const fieldTypeId = recordFieldType(compiler, obj.type, fieldName)
    if (!fieldTypeId) throw new Error(`JS VM: record ${obj.type} has no field ${fieldName}`)
    const rhs = emitExpr(compiler, a.right, scope)
    return `${obj.code}.raw[${JSON.stringify(fieldName)}] = ${rangeCheck(compiler, toRawValue(compiler, rhs.code, rhs.type, fieldTypeId), fieldTypeId)}`
  }
  throw new Error(`JS VM: unsupported assignment target ${(a.left as any).kind}`)
}

// 把 rhs 转为存储到 array/record 中的 raw 值
// scalar (integer/real/boolean): 裸值
// char/string: raw（取 .raw）
// array/record: raw（取 .raw）
export function toRawValue(
  compiler: Compiler,
  code: string,
  fromType: string,
  toTypeId: string
): string {
  if (isScalarBare(compiler, fromType)) {
    // scalar 裸值 → 直接存（可能需要类型转换）
    return coerce(compiler, code, fromType, scalarBase(compiler, toTypeId))
  }
  // char/string/array/record：从 PascalValue 取 .raw
  return `(${code}).raw`
}

export function emitProcedureCall(
  compiler: Compiler,
  pc: ProcedureCallNode,
  scope: Scope
): string {
  const name = pc.name.name.toUpperCase()
  if (BUILTIN_SYSCALLS.has(name)) {
    // WRITELN/WRITE: 对 real 参数预先用 ctx.formatReal 格式化为 string，
    // Pascal 实数格式化（指数补零为 3 位）
    if (name === 'WRITE' || name === 'WRITELN') {
      const args = pc.arguments.map((a) => {
        // 处理格式化参数 value:width 或 value:width:precision
        // parser 把 : 包装成 BinaryExpression { op: ':' }
        if (a.kind === 'BinaryExpression' && (a as any).operator === ':') {
          const bin = a as BinaryExpressionNode
          // 内层可能是 value:width，外层是 (value:width):precision
          let valueExpr: ExpressionNode = bin.left
          let widthExpr: ExpressionNode = bin.right
          let precExpr: ExpressionNode | null = null
          if (bin.left.kind === 'BinaryExpression' && (bin.left as any).operator === ':') {
            const inner = bin.left as BinaryExpressionNode
            valueExpr = inner.left
            widthExpr = inner.right
            precExpr = bin.right
          }
          const v = emitExpr(compiler, valueExpr, scope)
          const w = emitExpr(compiler, widthExpr, scope)
          // real 类型在 JS path 已经预格式化；其他类型走 emitArgFromExpr 装箱
          let valueCode: string
          if (v.type === 'real') {
            valueCode = `ctx.box('string', ctx.formatReal(${v.code}))`
          } else {
            valueCode = emitArgFromExpr(v)
          }
          const precPart = precExpr
            ? `, precision: ${emitExpr(compiler, precExpr, scope).code}`
            : ''
          return `{value: ${valueCode}, width: ${toInt(compiler, w.code, w.type)}${precPart}}`
        }
        const e = emitExpr(compiler, a, scope)
        if (e.type === 'real') {
          return `ctx.box('string', ctx.formatReal(${e.code}))`
        }
        return emitArgFromExpr(e)
      })
      return `await ctx.sysCall(${JSON.stringify(name)}, [${args.join(', ')}])`
    }
    // READ/READLN：控制台模式内联（绕过 io.plugin 用 ref 写回，JS 路径无 ref）
    // 文件模式仍走 sysCall（但写回有 bug，待 Phase 3.5 修）
    if (name === 'READ' || name === 'READLN') {
      return emitRead(compiler, pc, scope, name === 'READLN')
    }
    const args = pc.arguments.map((a) => emitArg(compiler, a, scope))
    return `await ctx.sysCall(${JSON.stringify(name)}, [${args.join(', ')}])`
  }
  // 用户过程（按作用域查找：嵌套过程 → 外层 → 全局）
  const info = scope.lookupProc(name) || compiler.procs.get(name)
  if (!info) throw new Error(`JS VM: unknown procedure ${pc.name.name}`)
  // 检查是否有 scalar var 参数（需要 box + 写回）
  const varBoxes: { argIdx: number; argJsName: string; boxName: string }[] = []
  const args = pc.arguments.map((a, i) => {
    const paramInfo = info.params[i]
    const pType = paramInfo?.typeId || 'integer'
    const e = emitExpr(compiler, a, scope)
    if (paramInfo?.isVar) {
      // var 参数：传引用
      // 链式 var：实参是 var 参数（scalar），直接传容器对象
      if (a.kind === 'Identifier') {
        const argVi = scope.lookup((a as IdentifierNode).name)
        if (argVi?.isVar && isScalarBare(compiler, argVi.typeId)) {
          return argVi.jsName
        }
        // 普通 scalar 变量：用 box 包装，调用后写回
        if (isScalarBare(compiler, pType) && argVi) {
          const boxName = `__box_${varBoxes.length}`
          varBoxes.push({ argIdx: i, argJsName: argVi.jsName, boxName })
          return boxName
        }
        // 复杂类型变量：直接传引用
        if (argVi) {
          return e.code
        }
      }
      // 数组元素或记录字段：也是合法的 var 实参（左值）
      if (a.kind === 'ArrayAccess' || a.kind === 'FieldAccess') {
        return e.code
      }
      // var 参数必须是变量（左值），否则报错
      throw new Error(`Variable required as var parameter: ${paramInfo.name || `arg${i}`}`)
    }
    // value 参数：传值（scalar 裸值 / 复杂类型 PascalValue）
    return coerce(compiler, e.code, e.type, pType)
  })
  // 无 scalar var 参数：直接调用
  if (varBoxes.length === 0) {
    return `await ${info.jsName}(ctx, ${args.join(', ')})`
  }
  // 有 scalar var 参数：包装 box + 调用 + 写回
  const lines: string[] = ['{']
  for (const b of varBoxes) {
    lines.push(`  const ${b.boxName} = {v: ${b.argJsName}}`)
  }
  lines.push(`  await ${info.jsName}(ctx, ${args.join(', ')})`)
  for (const b of varBoxes) {
    lines.push(`  ${b.argJsName} = ${b.boxName}.v`)
  }
  lines.push('}')
  return lines.join('\n')
}

// READ/READLN 内联生成
// 控制台模式：从 ctx.inputQueue 取一行，按 whitespace 拆 token，依次赋给变量
// 文件模式：暂走 sysCall（写回变量有 bug，待 Phase 3.5 实现 F^/文件 I/O 时一起修）
export function emitRead(
  compiler: Compiler,
  pc: ProcedureCallNode,
  scope: Scope,
  isReadln: boolean
): string {
  const args = pc.arguments
  // 第一参数是 file 变量？文件模式内联（用 ctx.io.file 方法直接读 + 直接写回变量）
  if (args.length > 0 && args[0].kind === 'Identifier') {
    const vi0 = scope.lookup((args[0] as IdentifierNode).name)
    if (vi0 && (vi0.typeId === 'text' || vi0.typeId.startsWith('file-of-'))) {
      const lines: string[] = ['{']
      lines.push(`  const __f = ${vi0.jsName}.raw`)
      for (let i = 1; i < args.length; i++) {
        const a = args[i]
        if (a.kind !== 'Identifier') continue
        const id = a as IdentifierNode
        const vi = scope.lookup(id.name)
        if (!vi) throw new Error(`JS VM: undefined variable ${id.name}`)
        const st = vi.typeId
        if (st === 'char') {
          // char: 读当前字符（不跳过空白），然后 get 推进
          lines.push(
            `  ${vi.jsName}.raw = String.fromCharCode(await ctx.io.file.bufferChar(__f))`
          )
          lines.push(`  await ctx.io.file.get(__f)`)
        } else {
          // integer/real/string: 跳过空白，读 token
          lines.push('  {')
          lines.push('    let __ch = await ctx.io.file.bufferChar(__f)')
          lines.push('    while (__ch === 32 || __ch === 10 || __ch === 13 || __ch === 9) {')
          lines.push('      await ctx.io.file.get(__f)')
          lines.push('      __ch = await ctx.io.file.bufferChar(__f)')
          lines.push('    }')
          lines.push('    let __s = ""')
          lines.push(
            '    while (__ch !== 32 && __ch !== 10 && __ch !== 13 && __ch !== 9 && __ch !== 0) {'
          )
          lines.push('      __s += String.fromCharCode(__ch)')
          lines.push('      await ctx.io.file.get(__f)')
          lines.push('      __ch = await ctx.io.file.bufferChar(__f)')
          lines.push('    }')
          if (st === 'integer') {
            lines.push(`    ${vi.jsName} = parseInt(__s, 10) | 0`)
          } else if (st === 'real') {
            lines.push(`    ${vi.jsName} = parseFloat(__s)`)
          } else if (st === 'string') {
            lines.push(`    ${vi.jsName}.raw = __s`)
          }
          lines.push('  }')
        }
      }
      if (isReadln) {
        lines.push(`  await ctx.io.file.readln(__f)`)
      }
      lines.push('}')
      return lines.join('\n')
    }
  }
  // 控制台模式：内联
  const lines: string[] = ['{']
  lines.push('  const __line = ctx.inputQueue.length > 0 ? ctx.inputQueue.shift() : ""')
  lines.push('  const __toks = __line.split(/\\s+/).filter(s => s.length > 0)')
  lines.push('  let __i = 0')
  for (const a of args) {
    if (a.kind !== 'Identifier') continue
    const id = a as IdentifierNode
    const vi = scope.lookup(id.name)
    if (!vi) throw new Error(`JS VM: undefined variable ${id.name}`)
    const st = vi.typeId
    if (st === 'integer') {
      lines.push(`  ${vi.jsName} = (__i < __toks.length) ? (parseInt(__toks[__i++], 10) | 0) : 0`)
    } else if (st === 'real') {
      lines.push(`  ${vi.jsName} = (__i < __toks.length) ? parseFloat(__toks[__i++]) : 0`)
    } else if (st === 'char') {
      lines.push(
        `  ${vi.jsName}.raw = (__i < __toks.length) ? __toks[__i++].charAt(0) : '\\u0000'`
      )
    } else if (st === 'string') {
      lines.push(`  ${vi.jsName}.raw = (__i < __toks.length) ? __toks[__i++] : ''`)
    }
  }
  lines.push('}')
  return lines.join('\n')
}
