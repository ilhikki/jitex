/*
 * IL lowering 语句编译。
 *
 * Pascal StatementNode → JsonCode.Statement[]。
 * 纯函数族，无 mutable state。
 */

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
  litNull,
  ref,
  syscall,
  SyscallKey,
  syscallKeys,
  WithBinding,
} from './helpers.ts'
import { defaultExpr, typeDescLiteral } from './type.ts'
import { loweringCallableArgument, loweringExpr, resolveSymbol } from './expressions.ts'
import { loweringReadln, loweringWriteln } from './io.ts'

// loweringStmt → Statement[]

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

/**
 * 把值写入一个 variable-access 目标（ISO 7185 6.5.1）。
 *
 * 目标可以是整个变量、数组元素、记录字段、指针解引用、文件缓冲区，
 * 以及它们的任意嵌套组合。var 实参的写回也复用本函数。
 */
function loweringAssignTarget(
  target: ExpressionNode,
  value: JsonCode.Expr,
  a: Analysis,
  funcId: number,
  ws: WithBinding[],
): JsonCode.Statement[] {
  const lvalueType = a.typeOf(target)
  const isComposite = lvalueType.tag === 'array' || lvalueType.tag === 'record' || lvalueType.tag === 'set'

  // 简单变量
  if (target.kind === 'Identifier') {
    // with 字段优先（ISO 7185 6.8.3.10）
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
      // subrange 运行时边界检查
      const rangeCheck = ti.tag === 'subrange' && ti.low !== undefined && ti.high !== undefined
        ? evalStmt(
          syscall(syscallKeys.rangeCheck, [ref(sym.varId), litInt(ti.low), litInt(ti.high)]),
        )
        : undefined

      const stmts: JsonCode.Statement[] = []
      if (isComposite) {
        // 复合类型整体赋值 = 字节拷贝（本模型中唯一的显式拷贝点）
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
    // 函数名赋值 → retval（funcName := expr 在函数体内表示给返回值赋值）
    if (sym?.kind === 'func' && sym.funcId === funcId) {
      const retval = a.funcInfo(funcId).retval
      if (retval) {
        return [assignStmt(ref(retval.varId), value)]
      }
    }
  }

  // 数组元素
  if (target.kind === 'ArrayAccess') {
    const arr = target as ArrayAccessNode
    const arrExpr = loweringExpr(arr.array, a, ws)
    const idxExprs = arr.indices.map((i) => {
      const expr = loweringExpr(i, a, ws)
      const ti = a.typeOf(i)
      if (ti.tag === 'char') {
        return syscall(syscallKeys.ord, [expr, typeDescLiteral(ti)])
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

  // 记录字段
  if (target.kind === 'FieldAccess') {
    const fa = target as FieldAccessNode
    if (fa.field.name === '^') {
      const objType = a.typeOf(fa.object)
      if (objType.tag === 'pointer') {
        // ISO 7185 6.5.4: 指针解引用赋值 p^ := x
        const ptrExpr = loweringExpr(fa.object, a, ws)
        return [evalStmt(syscall(syscallKeys.ptrAssign, [ptrExpr, value]))]
      }
      // 文件缓冲区赋值 f^ := x
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
    evalStmt(syscall(syscallKeys.stepsCheck, [])),
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
    evalStmt(syscall(syscallKeys.stepsCheck, [])),
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
  // Pascal for 变量为序数类型；此处比较/步进按 integer 语义，类型分派下沉到 rewrite
  const cmpKey = isDown ? syscallKeys.ge : syscallKeys.le
  const stepKey = isDown ? syscallKeys.sub : syscallKeys.add
  const i32Td = typeDescLiteral({ tag: 'integer' })

  const varRef = varSym.isVarParam ? syscall(syscallKeys.cellGet, [ref(vid)]) : ref(vid)

  return [
    assignStmt(ref(vid), initE),
    assignStmt(ref(limitVar), finalE),
    labelStmt(L_top),
    evalStmt(syscall(syscallKeys.stepsCheck, [])),
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

  // 为每个分支的 body 预分配 label
  const bodyLabels = node.branches.map(() => a.nextId())

  // 生成 label 检查链：
  // jumpIf(eq, bodyLabel, nextCheck)
  // label nextCheck
  // jumpIf(eq, bodyLabel, nextCheck)
  // ...
  // 最后一个的 else 跳到 L_otherwise
  // 注意：nextCheck 必须独立于 bodyLabel，否则 switch 穿透会错误执行 body
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

  // 生成 body（每个分支的 statement）
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
  // 决策 13：goto 跳转前插入 steps.check，防止 goto 死循环（steps.check 只在循环回边
  // 插入，goto 跳转不触发回边检查，需单独兜底）
  const check = evalStmt(syscall(syscallKeys.stepsCheck, []))
  // label 使用位置的 funcId：label 可能在祖先函数声明，但在后代函数使用。
  // longJump 需跳到使用位置（有 labelStmt 的函数），而非声明位置。
  const useFuncId = a.labelUseFuncOf(info.labelId) ?? info.funcId
  if (useFuncId === funcId) {
    return [check, jumpStmt(info.labelId)]
  }
  return [
    check,
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

  // 把 record 表达式赋给临时变量，构建 withStack 增量
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

// ProcedureCall 编译

/**
 * 文件过程的实参过境：首参（文件变量）+ 其类型描述，其余实参照传。
 *
 * 实参形态不由本层判定：内置过程接受何种实参（ISO 的单实参形式，还是方言形式
 * 如 `reset(f, name, opts)`）属于内置语义，归 rewrite 解释。lowering 只保证
 * 「结构 + 类型描述」完整过境 —— 多余实参原样带给 rewriter，由 rewriter 按形态
 * 决定翻译（使用方可覆盖对应的 lowering.* key 接管方言形态）。
 */
function loweringFileActuals(
  args: ExpressionNode[],
  a: Analysis,
  ws: WithBinding[],
): JsonCode.Expr[] {
  // 无实参：目标缺省，其含义交 rewrite / runtime 解释（本层不判定合法性）
  if (args.length === 0) {
    return [litNull()]
  }
  const head = args[0]
  return [
    loweringExpr(head, a, ws),
    typeDescLiteral(a.typeOf(head)),
    ...args.slice(1).map((x) => loweringExpr(x, a, ws)),
  ]
}

function loweringProcedureCall(
  node: ProcedureCallNode,
  a: Analysis,
  funcId: number,
  ws: WithBinding[],
): JsonCode.Statement[] {
  const name = node.name.name.toLowerCase()
  const sym = resolveSymbol(node.name, a, ws)

  // ISO 7185 6.6.3.4：过程形参在其块内标识实参过程 → 间接调用
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
    // 写回 var 参数
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

  // 用户定义过程
  if (sym?.kind === 'func') {
    return loweringUserCallStmt(sym.funcId, node.arguments, a, funcId, ws)
  }

  // 额外 callable 注入的过程（AGENTS.md 原则 A.7：注入优先；原生被允许覆盖时也在此命中）
  const extraProc = a.extraCallables()?.get(name)
  if (extraProc?.kind === 'procedure') {
    const args = node.arguments.map((x) => loweringExpr(x, a, ws))
    return [evalStmt(syscall(extraProc.sysCallName as SyscallKey, args))]
  }

  // 内置过程
  switch (name) {
    case 'writeln':
      return loweringWriteln(node.arguments, a, ws, false)
    case 'write':
      return loweringWriteln(node.arguments, a, ws, true)
    case 'readln':
      return loweringReadln(node.arguments, a, ws, false)
    case 'read':
      return loweringReadln(node.arguments, a, ws, true)
    // 文件过程的实参形态（ISO 单实参 / 方言带文件名）不由本层判定：
    // 完整实参与类型描述过境，翻译由 rewrite 决定（见 loweringFileActuals）
    case 'reset':
      return [
        evalStmt(syscall(syscallKeys.fileReset, loweringFileActuals(node.arguments, a, ws))),
      ]
    case 'rewrite':
      return [
        evalStmt(syscall(syscallKeys.fileRewrite, loweringFileActuals(node.arguments, a, ws))),
      ]
    case 'get':
      return [
        evalStmt(syscall(syscallKeys.fileGet, loweringFileActuals(node.arguments, a, ws))),
      ]
    case 'put':
      return [
        evalStmt(syscall(syscallKeys.filePut, loweringFileActuals(node.arguments, a, ws))),
      ]
    case 'page': {
      if (node.arguments.length === 0) {
        return [evalStmt(syscall(syscallKeys.ioPage, [litNull(), litNull()]))]
      }
      const f = loweringExpr(node.arguments[0], a, ws)
      return [
        evalStmt(
          syscall(syscallKeys.ioPage, [f, typeDescLiteral(a.typeOf(node.arguments[0]))]),
        ),
      ]
    }
    case 'pack': {
      // ISO 7185 6.6.5.4: pack(a, i, z) 等价于 z[j] := a[k]（k 自 i 起随 j 递增）
      const [aArg, iArg, zArg] = node.arguments
      return [
        evalStmt(
          syscall(syscallKeys.pack, [
            loweringExpr(aArg, a, ws),
            loweringExpr(iArg, a, ws),
            loweringExpr(zArg, a, ws),
            typeDescLiteral(a.typeOf(aArg)),
            typeDescLiteral(a.typeOf(zArg)),
          ]),
        ),
      ]
    }
    case 'unpack': {
      // ISO 7185 6.6.5.4: unpack(z, a, i) 等价于 a[k] := z[j]（k 自 i 起随 j 递增）
      const [zArg, aArg, iArg] = node.arguments
      return [
        evalStmt(
          syscall(syscallKeys.unpack, [
            loweringExpr(zArg, a, ws),
            loweringExpr(aArg, a, ws),
            loweringExpr(iArg, a, ws),
            typeDescLiteral(a.typeOf(zArg)),
            typeDescLiteral(a.typeOf(aArg)),
          ]),
        ),
      ]
    }
    case 'new': {
      // ISO 7185 6.6.5.3: new(p) 创建新变量，p 指向它
      // p 可以是指针变量、记录的 pointer 字段、数组元素的 pointer 字段等
      const argNode = node.arguments[0]
      const ptrType = a.typeOf(argNode)
      if (ptrType.tag !== 'pointer' || !ptrType.domainType) {
        throw new Error('new: argument must be a pointer-type variable')
      }
      const defaultVal = defaultExpr(ptrType.domainType)
      const cell = syscall(syscallKeys.cellCreate, [defaultVal])
      return loweringAssignTarget(argNode, cell, a, funcId, ws)
    }
    case 'dispose': {
      // ISO 7185 6.6.5.3: dispose(p) 释放标识值，p 置 nil
      const argNode = node.arguments[0]
      const ptrType = a.typeOf(argNode)
      if (ptrType.tag !== 'pointer') {
        throw new Error('dispose: argument must be a pointer-type variable')
      }
      // 先检查 p 不是 nil，然后置 nil
      const ptrExpr = loweringExpr(argNode, a, ws)
      const checkStmt = evalStmt(syscall(syscallKeys.ptrDisposeCheck, [ptrExpr]))
      return [checkStmt, ...loweringAssignTarget(argNode, litNull(), a, funcId, ws)]
    }
    default: {
      throw new AssertionError(`loweringProcedureCall: unknown procedure ${name}`)
    }
  }
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
    // 实参个数已由 analysis 按 ISO 7185 6.6.3.1 校验
    const param = info.params[i]!
    if (param.callable) {
      // ISO 7185 6.6.3.4/6.6.3.5：可调用形参的实参是过程/函数标识符 → 传其函数值
      argExprs.push(loweringCallableArgument(args[i], a, ws))
      continue
    }
    if (param.isVarParam) {
      // ISO 7185 6.6.3.3: var 实参必须是 variable-access（6.5.1）——
      // 整个变量、数组元素、记录字段、指针解引用、文件缓冲区皆可。
      // 用 cell 承载实参当前值，调用结束后按目标位置写回。
      const argNode = args[i]
      const cellVar = a.allocTempLocal(curFuncId, { tag: 'unknown' })
      out.push(
        assignStmt(ref(cellVar), syscall(syscallKeys.cellCreate, [loweringExpr(argNode, a, ws)])),
      )
      argExprs.push(ref(cellVar))
      cellVars.push({ cellVar, target: argNode })
    } else {
      // Pascal 值参数是赋值传递（ISO 7185 6.6.3.2）。record / array 这类复合值
      // 的宿主表示可能是可变的字节视图或对象，必须整体拷贝——否则形参改元素
      // 会直接回写到实参（标量与 set 无需拷贝：set 的运算都是函数式的，不就地改）
      let argExpr = loweringExpr(args[i], a, ws)
      if (param.typeInfo.tag === 'record' || param.typeInfo.tag === 'array') {
        argExpr = syscall(syscallKeys.recCopy, [argExpr, typeDescLiteral(param.typeInfo)])
      }
      argExprs.push(argExpr)
    }
  }

  out.push(evalStmt(callExpr(funcId, argExprs)))

  // 写回 var 参数
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
    // 非标识符的 variable-access（数组元素 / 记录字段 / 解引用 / 文件缓冲区）
    out.push(...loweringAssignTarget(tgt, valExpr, a, curFuncId, ws))
  }

  return out
}
