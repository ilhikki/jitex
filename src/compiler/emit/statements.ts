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
  LabeledStatementNode,
  ProcedureCallNode,
  RepeatStatementNode,
  StatementNode,
  WhileStatementNode,
  WithStatementNode,
} from '@/ast/types'
import { BUILTIN_SYSCALLS, Scope } from './utils'
import {
  coerce,
  emitArg,
  emitArgFromExpr,
  emitExpr,
  findWithField,
  toBool,
  toInt,
} from './expressions'
import {
  arrayDimAt,
  arrayElementAfterNIndices,
  isScalarBare,
  recordFieldType,
  scalarBase,
  subrangeBounds,
  typeKind,
} from './types'
import type { Compiler } from '@/compiler'
import {
  collectGotoTargetsInStmt,
  collectLabelsFlat,
  collectLabelValuesInStmt,
} from '../label-analysis'
import { emitLoopInnerStateMachine, getLoopAnalysis, nextLoopLabel } from '../strategy'

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
      const loopAn = getLoopAnalysis(compiler, w.body)
      const needsLabel = loopAn.innerLabels.size > 0 || loopAn.gotosInBody.size > 0
      const loopJsLabel = needsLabel ? nextLoopLabel('while') : ''

      if (needsLabel) {
        compiler.loopStack.push({
          jsLabel: loopJsLabel,
          innerLabels: loopAn.innerLabels,
          tailLabels: loopAn.tailLabels,
        })
      }

      let body: string
      if (loopAn.needsInner && w.body.kind === 'CompoundStatement') {
        // 需要内层状态机：递归收集循环体内所有层级的 label
        const cs = w.body as CompoundStatementNode
        const allLabels = collectLabelsFlat(cs.statements)
        const innerLabelInfo = new Map<string, { remaining: StatementNode[] }>()
        for (const [name, info] of allLabels) {
          innerLabelInfo.set(name, { remaining: info.remaining })
        }
        body = emitLoopInnerStateMachine(
          w.body,
          cs.statements,
          innerLabelInfo,
          compiler,
          scope,
          indent + 2
        )
      } else {
        body = emitStmt(compiler, w.body, scope, indent + 2)
      }

      if (needsLabel) {
        compiler.loopStack.pop()
      }

      const labelPrefix = needsLabel ? `${loopJsLabel}: ` : ''
      const lines: string[] = []
      lines.push(`${pad}${labelPrefix}while (${toBool(compiler, cond.code, cond.type)}) {`)
      lines.push(
        `${pad}  if (++ctx.steps > ctx.maxSteps) { throw new Error('JS VM: step limit exceeded') }`
      )
      lines.push(body)
      lines.push(`${pad}}`)

      // 循环后检查 pc：如果 goto 跳到了循环外的 label，需要 break 出来后 dispatch
      if (needsLabel && compiler.labelCases && compiler.currentPcVar) {
        lines.push(
          `${pad}if (${compiler.currentPcVar} !== 0) continue ${compiler.labelSwitchName};`
        )
      }

      return lines.join('\n')
    }
    case 'RepeatStatement': {
      const r = node as RepeatStatementNode
      const cond = emitExpr(compiler, r.untilCondition, scope)
      // Repeat 的 body 是 statements 数组
      const allInnerLabels = new Set(r.statements.flatMap((s) => [...collectLabelValuesInStmt(s)]))
      const allGotos = new Set(r.statements.flatMap((s) => [...collectGotoTargetsInStmt(s)]))
      const needsLabel =
        compiler.labelCases != null && (allInnerLabels.size > 0 || allGotos.size > 0)
      const loopJsLabel = needsLabel ? nextLoopLabel('repeat') : ''

      // 找末尾 label
      const tailLabels = new Set<string>()
      for (let i = r.statements.length - 1; i >= 0; i--) {
        if (r.statements[i].kind === 'LabeledStatement') {
          tailLabels.add(String((r.statements[i] as any).label.value))
        } else break
      }

      if (needsLabel) {
        compiler.loopStack.push({ jsLabel: loopJsLabel, innerLabels: allInnerLabels, tailLabels })
      }

      const bodyStmts = r.statements
        .map((s) => emitStmt(compiler, s, scope, indent + 2))
        .filter((x) => x.length > 0)

      if (needsLabel) {
        compiler.loopStack.pop()
      }

      const labelPrefix = needsLabel ? `${loopJsLabel}: ` : ''
      const lines: string[] = []
      lines.push(`${pad}${labelPrefix}do {`)
      lines.push(
        `${pad}  if (++ctx.steps > ctx.maxSteps) { throw new Error('JS VM: step limit exceeded') }`
      )
      lines.push(...bodyStmts)
      lines.push(`${pad}} while (!(${toBool(compiler, cond.code, cond.type)}));`)

      if (needsLabel && compiler.labelCases && compiler.currentPcVar) {
        lines.push(
          `${pad}if (${compiler.currentPcVar} !== 0) continue ${compiler.labelSwitchName};`
        )
      }

      return lines.join('\n')
    }
    case 'ForStatement': {
      const f = node as ForStatementNode
      const vi = scope.lookup(f.variable.name)
      const vName = vi ? vi.jsName : f.variable.name
      const init = emitExpr(compiler, f.initial, scope)
      const final = emitExpr(compiler, f.final, scope)
      const loopAn = getLoopAnalysis(compiler, f.body)
      const needsLabel = loopAn.innerLabels.size > 0 || loopAn.gotosInBody.size > 0
      const loopJsLabel = needsLabel ? nextLoopLabel('for') : ''

      if (needsLabel) {
        compiler.loopStack.push({
          jsLabel: loopJsLabel,
          innerLabels: loopAn.innerLabels,
          tailLabels: loopAn.tailLabels,
        })
      }

      const body = emitStmt(compiler, f.body, scope, indent + 2)

      if (needsLabel) {
        compiler.loopStack.pop()
      }

      const labelPrefix = needsLabel ? `${loopJsLabel}: ` : ''
      const lines: string[] = []
      if (f.direction === 'TO') {
        lines.push(
          `${pad}${labelPrefix}for (${vName} = ${toInt(compiler, init.code, init.type)}; ${vName} <= ${toInt(compiler, final.code, final.type)}; ${vName} = (${vName} + 1) | 0) {`
        )
      } else {
        lines.push(
          `${pad}${labelPrefix}for (${vName} = ${toInt(compiler, init.code, init.type)}; ${vName} >= ${toInt(compiler, final.code, final.type)}; ${vName} = (${vName} - 1) | 0) {`
        )
      }
      lines.push(
        `${pad}  if (++ctx.steps > ctx.maxSteps) { throw new Error('JS VM: step limit exceeded') }`
      )
      lines.push(body)
      lines.push(`${pad}}`)

      if (needsLabel && compiler.labelCases && compiler.currentPcVar) {
        lines.push(
          `${pad}if (${compiler.currentPcVar} !== 0) continue ${compiler.labelSwitchName};`
        )
      }

      return lines.join('\n')
    }
    case 'ProcedureCall': {
      const pc = node as ProcedureCallNode
      return pad + emitProcedureCall(compiler, pc, scope)
    }
    case 'GotoStatement': {
      const gs = node as GotoStatementNode
      const lblName = String((gs.label as any).value)

      // 通过预计算的结果获取 goto 目标信息（分析阶段预计算，生成器直接查询）
      const target = compiler.getGotoTarget(gs)
      if (!target) {
        return `${pad}throw new Error('JS VM: goto ${lblName} - label not found in any visible block (ISO 7185 6.1.6)')`
      }

      const targetAnalysis = findAnalysisByBlockId(compiler, target.blockId)
      if (!targetAnalysis) {
        return `${pad}throw new Error('JS VM: goto ${lblName} - target block not found')`
      }

      const currentAnalysis = compiler.currentBlockAnalysis

      // 函数逃逸（跨函数/过程 block）：抛出 __GotoSignal，由目标的 try/catch 捕获并 dispatch
      // 判断条件：目标 functionBlockId 与当前编译的 functionBlockId 不同
      if (targetAnalysis.functionBlockId !== compiler.currentFunctionBlockId) {
        return `${pad}throw new __GotoSignal(${JSON.stringify(targetAnalysis.pcVar)}, ${target.caseNum})`
      }

      // 同函数内：沿用原有的状态机跳转逻辑

      // 在循环内的情况
      if (compiler.insideLoop && currentAnalysis) {
        // 循环体末尾 label：用 continue（适用于本 block）
        if (compiler.isLabelAtLoopTail(lblName) && target.blockId === currentAnalysis.blockId) {
          const loop = compiler.currentLoop!
          return `${pad}continue ${loop.jsLabel}`
        }

        // 目标在当前 block 内（即 target 块等于 currentBlockAnalysis）：
        // 如果当前状态机就是 currentBlockAnalysis 的状态机（同 block，outer sm），
        // 设 currentPcVar + continue labelSwitchName
        if (
          target.blockId === currentAnalysis.blockId &&
          compiler.labelSwitchName === currentAnalysis.loopLabel &&
          compiler.currentPcVar === currentAnalysis.pcVar
        ) {
          return `${pad}${compiler.currentPcVar} = ${target.caseNum}; continue ${compiler.labelSwitchName!}`
        }

        // 目标在循环外 / 内层状态机无法处理：
        // break 当前循环（最内层 JS labeled while），让外层状态机 dispatch
        // 注意：如果当前状态机是内层 sm（loopLabel != currentAnalysis.loopLabel），
        // 也要先 break 出内层 sm 的 while 循环
        const loop = compiler.currentLoop!
        return `${pad}${targetAnalysis.pcVar} = ${target.caseNum}; break ${loop.jsLabel}`
      }

      // 不在循环中：状态机跳转
      if (currentAnalysis && target.blockId === currentAnalysis.blockId) {
        // 跨 block goto 在 GotoStatement 中需要 break 出当前状态机循环。
        // 但 JS continue label 不能跨 labeled while —— 必须 break。
        // 同 block 时：__pc_<self> = caseNum; continue __goto_loop_<self>
        return `${pad}${currentAnalysis.pcVar} = ${target.caseNum}; continue ${currentAnalysis.loopLabel}`
      }

      // 同函数内（循环逃逸）：写外层 pc + continue 外层 while
      return `${pad}${targetAnalysis.pcVar} = ${target.caseNum}; continue ${targetAnalysis.loopLabel}`
    }
    case 'LabeledStatement': {
      const ls = node as LabeledStatementNode
      // LabeledStatement 只需发射其内部语句
      // 状态机的 case 分支已经处理了 label 定位
      return emitStmt(compiler, ls.statement, scope, indent)
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

/** 在 GotoStatement 中通过 blockId 查 block analysis */
function findAnalysisByBlockId(
  compiler: Compiler,
  blockId: number
): import('../label-analysis').BlockLabelAnalysis | null {
  if (!compiler.labelAnalysis) return null
  for (const [, a] of iterateAnalyses(compiler.labelAnalysis.root)) {
    if (a.blockId === blockId) return a
  }
  return null
}

function* iterateAnalyses(
  root: import('../label-analysis').BlockLabelAnalysis
): Iterable<[import('../../ast/types').BlockNode, import('../label-analysis').BlockLabelAnalysis]> {
  const stack: import('../label-analysis').BlockLabelAnalysis[] = [root]
  while (stack.length > 0) {
    const a = stack.pop()!
    yield [a.block, a]
    for (const child of a.children) {
      stack.push(child)
    }
  }
}

export function emitCase(
  compiler: Compiler,
  node: CaseStatementNode,
  scope: Scope,
  indent: number
): string {
  const pad = ' '.repeat(indent)
  const expr = emitExpr(compiler, node.expression, scope)
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

export function toCaseInt(compiler: Compiler, code: string, type: string): string {
  if (type === 'integer') return code
  if (type === 'char') return `(${code}).raw.charCodeAt(0)`
  if (type === 'boolean') return `(${code} ? 1 : 0)`
  return code
}

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

export function rangeCheck(compiler: Compiler, code: string, origTypeId: string): string {
  const b = subrangeBounds(origTypeId)
  if (!b) return code
  if (b.base === 'char') {
    return `((__v) => { let __c = (typeof __v === 'object' && __v && __v.raw !== undefined) ? (typeof __v.raw === 'string' ? __v.raw.charCodeAt(0) : __v.raw) : __v; if (__c < ${b.min} || __c > ${b.max}) throw new Error('JS VM: char value ' + __c + ' out of range ${b.min}..${b.max}'); return __v })(${code})`
  }
  return `((__v) => { if (__v < ${b.min} || __v > ${b.max}) throw new Error('JS VM: value ' + __v + ' out of range ${b.min}..${b.max}'); return __v })(${code})`
}

export function emitAssignment(compiler: Compiler, a: AssignmentNode, scope: Scope): string {
  if (a.left.kind === 'Identifier') {
    const id = a.left as IdentifierNode
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
    if (typeKind(compiler, vi.typeId) === 'set') {
      const copied = `ctx.box(${JSON.stringify(vi.typeId)}, new Set((${checked}).raw))`
      if (vi.isVar && isScalarBare(compiler, vi.typeId)) {
        return `${vi.jsName}.v = ${copied}`
      }
      return `${vi.jsName} = ${copied}`
    }
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
    const obj = emitExpr(compiler, fa.object, scope)
    const fieldName = fa.field.name.toUpperCase()
    const fieldTypeId = recordFieldType(compiler, obj.type, fieldName)
    if (!fieldTypeId) throw new Error(`JS VM: record ${obj.type} has no field ${fieldName}`)
    const rhs = emitExpr(compiler, a.right, scope)
    return `${obj.code}.raw[${JSON.stringify(fieldName)}] = ${rangeCheck(compiler, toRawValue(compiler, rhs.code, rhs.type, fieldTypeId), fieldTypeId)}`
  }
  throw new Error(`JS VM: unsupported assignment target ${(a.left as any).kind}`)
}

export function toRawValue(
  compiler: Compiler,
  code: string,
  fromType: string,
  toTypeId: string
): string {
  if (isScalarBare(compiler, fromType)) {
    return coerce(compiler, code, fromType, scalarBase(compiler, toTypeId))
  }
  return `(${code}).raw`
}

export function emitProcedureCall(compiler: Compiler, pc: ProcedureCallNode, scope: Scope): string {
  const name = pc.name.name.toUpperCase()
  if (BUILTIN_SYSCALLS.has(name)) {
    if (name === 'WRITE' || name === 'WRITELN') {
      const args = pc.arguments.map((a) => {
        if (a.kind === 'BinaryExpression' && (a as any).operator === ':') {
          const bin = a as BinaryExpressionNode
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
    if (name === 'READ' || name === 'READLN') {
      return emitRead(compiler, pc, scope, name === 'READLN')
    }
    const args = pc.arguments.map((a) => emitArg(compiler, a, scope))
    return `await ctx.sysCall(${JSON.stringify(name)}, [${args.join(', ')}])`
  }
  const info = scope.lookupProc(name) || compiler.procs.get(name)
  if (!info) throw new Error(`JS VM: unknown procedure ${pc.name.name}`)
  const varBoxes: { argIdx: number; argJsName: string; boxName: string }[] = []
  const args = pc.arguments.map((a, i) => {
    const paramInfo = info.params[i]
    const pType = paramInfo?.typeId || 'integer'
    const e = emitExpr(compiler, a, scope)
    if (paramInfo?.isVar) {
      if (a.kind === 'Identifier') {
        const argVi = scope.lookup((a as IdentifierNode).name)
        if (argVi?.isVar && isScalarBare(compiler, argVi.typeId)) {
          return argVi.jsName
        }
        if (isScalarBare(compiler, pType) && argVi) {
          const boxName = `__box_${varBoxes.length}`
          varBoxes.push({ argIdx: i, argJsName: argVi.jsName, boxName })
          return boxName
        }
        if (argVi) {
          return e.code
        }
      }
      if (a.kind === 'ArrayAccess' || a.kind === 'FieldAccess') {
        return e.code
      }
      throw new Error(`Variable required as var parameter: ${paramInfo.name || `arg${i}`}`)
    }
    return coerce(compiler, e.code, e.type, pType)
  })
  if (varBoxes.length === 0) {
    return `await ${info.jsName}(ctx, ${args.join(', ')})`
  }
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

export function emitRead(
  compiler: Compiler,
  pc: ProcedureCallNode,
  scope: Scope,
  isReadln: boolean
): string {
  const args = pc.arguments
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
          lines.push(`  ${vi.jsName}.raw = String.fromCharCode(await ctx.io.file.bufferChar(__f))`)
          lines.push(`  await ctx.io.file.get(__f)`)
        } else {
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
      lines.push(`  ${vi.jsName}.raw = (__i < __toks.length) ? __toks[__i++].charAt(0) : '\\u0000'`)
    } else if (st === 'string') {
      lines.push(`  ${vi.jsName}.raw = (__i < __toks.length) ? __toks[__i++] : ''`)
    }
  }
  lines.push('}')
  return lines.join('\n')
}
