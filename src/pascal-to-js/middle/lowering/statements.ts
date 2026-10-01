import * as JsonCode from '@/middle/ir/json-code.ts'
import { Analysis } from '@/middle/analysis/analysis-type.ts'
import {
  ArrayAccessNode,
  AssignmentNode,
  CaseStatementNode,
  CompoundStatementNode,
  ExpressionNode,
  FieldAccessNode,
  ForStatementNode,
  GotoStatementNode,
  IfStatementNode,
  LabeledStatementNode,
  ProcedureCallNode,
  RepeatStatementNode,
  StatementNode,
  WhileStatementNode,
  WithStatementNode,
} from '@/frontend/node.ts'
import {
  AssertionError,
  assignStmt,
  callExpr,
  evalStmt,
  jumpIfStmt,
  jumpStmt,
  labelStmt,
  litField,
  litInt,
  ref,
  syscall,
  syscallKeys,
  WithBinding,
} from './helpers.ts'
import { typeDescLiteral } from './type.ts'
import { callKey, loweringCallableArgument, loweringCallActuals, loweringExpr, resolveSymbol } from './expressions.ts'

export function loweringStmt(
  node: StatementNode,
  a: Analysis,
  funcId: number,
  withStack: WithBinding[],
): JsonCode.Statement[] {
  switch (node.kind) {
    case 'CompoundStatement':
      return loweringCompound(node, a, funcId, withStack)
    case 'Assignment':
      return loweringAssignment(node, a, funcId, withStack)
    case 'IfStatement':
      return loweringIf(node, a, funcId, withStack)
    case 'WhileStatement':
      return loweringWhile(node, a, funcId, withStack)
    case 'RepeatStatement':
      return loweringRepeat(node, a, funcId, withStack)
    case 'ForStatement':
      return loweringFor(node, a, funcId, withStack)
    case 'CaseStatement':
      return loweringCase(node, a, funcId, withStack)
    case 'GotoStatement':
      return loweringGoto(node, a, funcId)
    case 'LabeledStatement':
      return loweringLabeled(node, a, funcId, withStack)
    case 'WithStatement':
      return loweringWith(node, a, funcId, withStack)
    case 'ProcedureCall':
      return loweringProcedureCall(node, a, funcId, withStack)
    case 'EmptyStatement':
      return []
    default:
      throw new AssertionError(`loweringStmt: unknown kind ${(node as StatementNode).kind}`)
  }
}

function loweringCompound(
  node: CompoundStatementNode,
  a: Analysis,
  funcId: number,
  ws: WithBinding[],
): JsonCode.Statement[] {
  const out: JsonCode.Statement[] = []
  for (const s of node.statements) {
    out.push(...loweringStmt(s, a, funcId, ws))
  }
  return out
}

function loweringAssignment(
  node: AssignmentNode,
  a: Analysis,
  funcId: number,
  ws: WithBinding[],
): JsonCode.Statement[] {
  return loweringAssignTarget(node.left, loweringExpr(node.right, a, ws), a, funcId, ws)
}

function loweringAssignTarget(
  target: ExpressionNode,
  value: JsonCode.Expr,
  a: Analysis,
  funcId: number,
  ws: WithBinding[],
): JsonCode.Statement[] {
  const lvalueType = a.typeOf(target)
  const isComposite = lvalueType.tag === 'array' || lvalueType.tag === 'record' || lvalueType.tag === 'set'

  if (target.kind === 'Identifier') {
    for (let i = ws.length - 1; i >= 0; i--) {
      const binding = ws[i]
      const fname = target.name.toLowerCase()
      if (binding.fields.has(fname)) {
        return [
          evalStmt(
            syscall(syscallKeys.recAssign, [
              ref(binding.tempVarId),
              litField(fname),
              value,
              typeDescLiteral(binding.typeInfo),
            ]),
          ),
        ]
      }
    }

    const sym = resolveSymbol(target, a, ws)
    if (sym && (sym.kind === 'var' || sym.kind === 'param')) {
      const ti = sym.typeInfo

      const rangeCheck = a.debug() && ti.tag === 'subrange' && ti.low !== undefined && ti.high !== undefined
        ? evalStmt(
          syscall(syscallKeys.rangeCheck, [ref(sym.varId), litInt(ti.low), litInt(ti.high)]),
        )
        : undefined

      const stmts: JsonCode.Statement[] = []
      if (isComposite) {
        const target = sym.isVarParam ? syscall(syscallKeys.cellGet, [ref(sym.varId)]) : ref(sym.varId)
        stmts.push(
          evalStmt(syscall(syscallKeys.memCopy, [target, litInt(0), value, typeDescLiteral(ti)])),
        )
      } else if (sym.isVarParam) {
        stmts.push(evalStmt(syscall(syscallKeys.cellSet, [ref(sym.varId), value])))
      } else {
        stmts.push(assignStmt(ref(sym.varId), value))
      }
      if (rangeCheck) {
        stmts.push(rangeCheck)
      }
      return stmts
    }

    if (sym?.kind === 'func' && sym.funcId === funcId) {
      const retval = a.funcInfo(funcId).retval
      if (retval) {
        return [assignStmt(ref(retval.varId), value)]
      }
    }
  }

  if (target.kind === 'ArrayAccess') {
    const arr = target as ArrayAccessNode
    const arrExpr = loweringExpr(arr.array, a, ws)
    const idxExprs = arr.indices.map((i) => {
      const expr = loweringExpr(i, a, ws)
      const ti = a.typeOf(i)
      if (ti.tag === 'char') {
        return syscall(callKey('ord'), [expr, typeDescLiteral(ti)])
      }
      return expr
    })
    return [
      evalStmt(
        syscall(syscallKeys.arrayAssign, [
          arrExpr,
          ...idxExprs,
          value,
          typeDescLiteral(a.typeOf(arr.array)),
        ]),
      ),
    ]
  }

  if (target.kind === 'FieldAccess') {
    const fa = target as FieldAccessNode
    if (fa.field.name === '^') {
      const objType = a.typeOf(fa.object)
      if (objType.tag === 'pointer') {
        const ptrExpr = loweringExpr(fa.object, a, ws)
        return [evalStmt(syscall(syscallKeys.ptrAssign, [ptrExpr, value]))]
      }

      const fExpr = loweringExpr(fa.object, a, ws)
      return [evalStmt(syscall(syscallKeys.filePut, [fExpr, typeDescLiteral(objType), value]))]
    }
    const objExpr = loweringExpr(fa.object, a, ws)
    return [
      evalStmt(
        syscall(syscallKeys.recAssign, [
          objExpr,
          litField(fa.field.name.toLowerCase()),
          value,
          typeDescLiteral(a.typeOf(fa.object)),
        ]),
      ),
    ]
  }

  throw new Error('loweringAssignTarget: unsupported left-hand side')
}

function loweringIf(
  node: IfStatementNode,
  a: Analysis,
  funcId: number,
  ws: WithBinding[],
): JsonCode.Statement[] {
  const cond = loweringExpr(node.condition, a, ws)
  const L_then = a.nextId()
  const L_end = a.nextId()
  const L_else = node.elseBranch ? a.nextId() : L_end

  const out: JsonCode.Statement[] = [jumpIfStmt(cond, L_then, L_else)]
  out.push(labelStmt(L_then))
  out.push(...loweringStmt(node.thenBranch, a, funcId, ws))
  if (node.elseBranch) {
    out.push(jumpStmt(L_end))
    out.push(labelStmt(L_else))
    out.push(...loweringStmt(node.elseBranch, a, funcId, ws))
  }
  out.push(labelStmt(L_end))
  return out
}

function stepsCheckStmts(a: Analysis): JsonCode.Statement[] {
  return a.debug() ? [evalStmt(syscall(syscallKeys.stepsCheck, []))] : []
}

function loweringWhile(
  node: WhileStatementNode,
  a: Analysis,
  funcId: number,
  ws: WithBinding[],
): JsonCode.Statement[] {
  const L_top = a.nextId()
  const L_body = a.nextId()
  const L_end = a.nextId()
  const cond = loweringExpr(node.condition, a, ws)
  return [
    labelStmt(L_top),
    ...stepsCheckStmts(a),
    jumpIfStmt(cond, L_body, L_end),
    labelStmt(L_body),
    ...loweringStmt(node.body, a, funcId, ws),
    jumpStmt(L_top),
    labelStmt(L_end),
  ]
}

function loweringRepeat(
  node: RepeatStatementNode,
  a: Analysis,
  funcId: number,
  ws: WithBinding[],
): JsonCode.Statement[] {
  const L_top = a.nextId()
  const L_end = a.nextId()
  const cond = loweringExpr(node.untilCondition, a, ws)
  const bodyStmts: JsonCode.Statement[] = []
  for (const s of node.statements) {
    bodyStmts.push(...loweringStmt(s, a, funcId, ws))
  }
  return [
    labelStmt(L_top),
    ...stepsCheckStmts(a),
    ...bodyStmts,
    jumpIfStmt(cond, L_end, L_top),
    labelStmt(L_end),
  ]
}

function loweringFor(
  node: ForStatementNode,
  a: Analysis,
  funcId: number,
  ws: WithBinding[],
): JsonCode.Statement[] {
  const varSym = resolveSymbol(node.variable, a, ws)
  if (!varSym || (varSym.kind !== 'var' && varSym.kind !== 'param')) {
    throw new Error(`loweringFor: variable ${node.variable.name} not found`)
  }
  const vid = varSym.varId
  const initE = loweringExpr(node.initial, a, ws)
  const finalE = loweringExpr(node.final, a, ws)

  const limitVar = a.allocTempLocal(funcId, { tag: 'integer' })
  const L_top = a.nextId()
  const L_body = a.nextId()
  const L_end = a.nextId()

  const isDown = node.direction === 'DOWNTO'

  const cmpKey = isDown ? syscallKeys.ge : syscallKeys.le
  const stepKey = isDown ? syscallKeys.sub : syscallKeys.add
  const i32Td = typeDescLiteral({ tag: 'integer' })

  const varRef = varSym.isVarParam ? syscall(syscallKeys.cellGet, [ref(vid)]) : ref(vid)

  return [
    assignStmt(ref(vid), initE),
    assignStmt(ref(limitVar), finalE),
    labelStmt(L_top),
    ...stepsCheckStmts(a),
    jumpIfStmt(syscall(cmpKey, [varRef, i32Td, ref(limitVar), i32Td]), L_body, L_end),
    labelStmt(L_body),
    ...loweringStmt(node.body, a, funcId, ws),
    assignStmt(ref(vid), syscall(stepKey, [varRef, i32Td, litInt(1), i32Td])),
    jumpStmt(L_top),
    labelStmt(L_end),
  ]
}

function loweringCase(
  node: CaseStatementNode,
  a: Analysis,
  funcId: number,
  ws: WithBinding[],
): JsonCode.Statement[] {
  const caseVar = a.allocTempLocal(funcId, a.typeOf(node.expression))
  const caseTd = typeDescLiteral(a.typeOf(node.expression))
  const L_end = a.nextId()
  const L_otherwise = node.otherwise ? a.nextId() : L_end
  const out: JsonCode.Statement[] = [assignStmt(ref(caseVar), loweringExpr(node.expression, a, ws))]

  const bodyLabels = node.branches.map(() => a.nextId())

  const checks: { labelExpr: JsonCode.Expr; bodyLabel: number }[] = []
  for (let bi = 0; bi < node.branches.length; bi++) {
    for (const lbl of node.branches[bi].labels) {
      checks.push({ labelExpr: loweringExpr(lbl, a, ws), bodyLabel: bodyLabels[bi] })
    }
  }

  for (let i = 0; i < checks.length; i++) {
    const isLast = i === checks.length - 1
    const L_next = isLast ? L_otherwise : a.nextId()
    out.push(
      jumpIfStmt(
        syscall(syscallKeys.eq, [ref(caseVar), caseTd, checks[i].labelExpr, caseTd]),
        checks[i].bodyLabel,
        L_next,
      ),
    )
    if (!isLast) {
      out.push(labelStmt(L_next))
    }
  }

  for (let bi = 0; bi < node.branches.length; bi++) {
    out.push(labelStmt(bodyLabels[bi]))
    out.push(...loweringStmt(node.branches[bi].statement, a, funcId, ws))
    out.push(jumpStmt(L_end))
  }

  if (node.otherwise) {
    out.push(labelStmt(L_otherwise))
    out.push(...loweringStmt(node.otherwise, a, funcId, ws))
  }

  out.push(labelStmt(L_end))
  return out
}

function loweringGoto(node: GotoStatementNode, a: Analysis, funcId: number): JsonCode.Statement[] {
  const info = a.labelInfo(funcId, node.label.value)
  if (!info) {
    throw new AssertionError(`loweringGoto: label ${node.label.value} not declared`)
  }

  const checks = stepsCheckStmts(a)
  const useFuncId = a.labelUseFuncOf(info.labelId) ?? info.funcId
  if (useFuncId === funcId) {
    return [...checks, jumpStmt(info.labelId)]
  }
  return [
    ...checks,
    {
      kind: 'longJump',
      labelId: info.labelId,
      functionId: useFuncId,
    },
  ]
}

function loweringLabeled(
  node: LabeledStatementNode,
  a: Analysis,
  funcId: number,
  ws: WithBinding[],
): JsonCode.Statement[] {
  const info = a.labelInfo(funcId, node.label.value)
  if (!info) {
    throw new AssertionError(`loweringLabeled: label ${node.label.value} not declared`)
  }
  return [labelStmt(info.labelId), ...loweringStmt(node.statement, a, funcId, ws)]
}

function loweringWith(
  node: WithStatementNode,
  a: Analysis,
  funcId: number,
  ws: WithBinding[],
): JsonCode.Statement[] {
  const temps = a.withTempsOf(node)
  const out: JsonCode.Statement[] = []

  const newBindings: WithBinding[] = []
  for (let i = 0; i < node.records.length; i++) {
    const recExpr = node.records[i]
    const tempVarId = temps[i].varId
    out.push(assignStmt(ref(tempVarId), loweringExpr(recExpr, a, ws)))
    const ti = temps[i].typeInfo
    newBindings.push({
      tempVarId,
      typeInfo: ti,
      fields: ti.fields ?? new Map(),
    })
  }

  const childWs = [...ws, ...newBindings]
  out.push(...loweringStmt(node.body, a, funcId, childWs))
  return out
}

function loweringProcedureCall(
  node: ProcedureCallNode,
  a: Analysis,
  funcId: number,
  ws: WithBinding[],
): JsonCode.Statement[] {
  const name = node.name.name.toLowerCase()
  const sym = resolveSymbol(node.name, a, ws)

  if (sym?.kind === 'param' && sym.callable) {
    const out: JsonCode.Statement[] = []
    const argExprs: JsonCode.Expr[] = []
    const cellVars: { cellVar: number; target: ExpressionNode }[] = []
    const sig = sym.callable.params
    for (let i = 0; i < node.arguments.length; i++) {
      const arg = node.arguments[i]
      const isVar = sig[i]?.isVar
      if (isVar) {
        const cellVar = a.allocTempLocal(funcId, { tag: 'unknown' })
        out.push(
          assignStmt(ref(cellVar), syscall(syscallKeys.cellCreate, [loweringExpr(arg, a, ws)])),
        )
        argExprs.push(ref(cellVar))
        cellVars.push({ cellVar, target: arg })
      } else {
        argExprs.push(loweringExpr(arg, a, ws))
      }
    }
    out.push(evalStmt(syscall(syscallKeys.callIndirect, [ref(sym.varId), ...argExprs])))

    for (const cv of cellVars) {
      const valExpr = syscall(syscallKeys.cellGet, [ref(cv.cellVar)])
      const tgt = cv.target
      if (tgt.kind === 'Identifier') {
        const s = resolveSymbol(tgt, a, ws)
        if (s && (s.kind === 'var' || s.kind === 'param')) {
          if (s.isVarParam) {
            out.push(evalStmt(syscall(syscallKeys.cellSet, [ref(s.varId), valExpr])))
          } else {
            out.push(assignStmt(ref(s.varId), valExpr))
          }
          continue
        }
      }
      out.push(...loweringAssignTarget(tgt, valExpr, a, funcId, ws))
    }
    return out
  }

  if (sym?.kind === 'func') {
    return loweringUserCallStmt(sym.funcId, node.arguments, a, funcId, ws)
  }

  return [evalStmt(syscall(callKey(name), loweringCallActuals(node.arguments, a, ws)))]
}

function loweringUserCallStmt(
  funcId: number,
  args: ExpressionNode[],
  a: Analysis,
  curFuncId: number,
  ws: WithBinding[],
): JsonCode.Statement[] {
  const info = a.funcInfo(funcId)
  const out: JsonCode.Statement[] = []
  const argExprs: JsonCode.Expr[] = []
  const cellVars: { cellVar: number; target: ExpressionNode }[] = []

  for (let i = 0; i < args.length; i++) {
    const param = info.params[i]!
    if (param.callable) {
      argExprs.push(loweringCallableArgument(args[i], a, ws))
      continue
    }
    if (param.isVarParam) {
      const argNode = args[i]
      const cellVar = a.allocTempLocal(curFuncId, { tag: 'unknown' })
      out.push(
        assignStmt(ref(cellVar), syscall(syscallKeys.cellCreate, [loweringExpr(argNode, a, ws)])),
      )
      argExprs.push(ref(cellVar))
      cellVars.push({ cellVar, target: argNode })
    } else {
      let argExpr = loweringExpr(args[i], a, ws)
      if (param.typeInfo.tag === 'record' || param.typeInfo.tag === 'array') {
        argExpr = syscall(syscallKeys.recCopy, [argExpr, typeDescLiteral(param.typeInfo)])
      }
      argExprs.push(argExpr)
    }
  }

  out.push(evalStmt(callExpr(funcId, argExprs)))

  for (const cv of cellVars) {
    const valExpr = syscall(syscallKeys.cellGet, [ref(cv.cellVar)])
    const tgt = cv.target
    if (tgt.kind === 'Identifier') {
      const sym = resolveSymbol(tgt, a, ws)
      if (sym && (sym.kind === 'var' || sym.kind === 'param')) {
        if (sym.isVarParam) {
          out.push(evalStmt(syscall(syscallKeys.cellSet, [ref(sym.varId), valExpr])))
        } else {
          out.push(assignStmt(ref(sym.varId), valExpr))
        }
        continue
      }
    }

    out.push(...loweringAssignTarget(tgt, valExpr, a, curFuncId, ws))
  }

  return out
}
