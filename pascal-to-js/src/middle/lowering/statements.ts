/*
 * IL lowering 语句编译。
 *
 * Pascal StatementNode → JsonCode.Statement[]。
 * 纯函数族，无 mutable state。
 */

import * as JsonCode from '@/middle/ir/json-code.ts'
import { Analysis } from '@/middle/analysis/analysis.ts'
import {
  ArrayAccessNode,
  AssignmentNode,
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
} from '@/frontend/node.ts'
import {
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
import { defaultExpr, isRecordFile, typeDescLiteral } from './type.ts'
import { loweringExpr, resolveSymbol } from './expressions.ts'
import { loweringReadln, loweringWriteln } from './io.ts'

// ============================================================
// loweringStmt → Statement[]
// ============================================================

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
      throw new Error(`loweringStmt: unknown kind ${(node as StatementNode).kind}`)
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
  // Pascal record 赋值是值拷贝语义（ISO 7185），JS 对象赋值是引用。
  // 若左值类型为 record，用 rec.copy 深拷贝右值，避免别名共享。
  const lvalueType = a.typeOf(node.left)
  const needRecCopy = lvalueType.tag === 'rec'
  let value = loweringExpr(node.right, a, ws)
  if (needRecCopy) {
    value = syscall(syscallKeys.recCopy, [value])
  }

  // Pascal `packed array[low..high] of char` 赋值为字符串字面量时，
  // 右值已是 1-based PascalArray（StringLiteral 编译为 str.to.char.array）。
  // 若目标边界 low≠1（如 TeX 的 0-based NAMEOFFILE），需用 array.char.resize 调整边界。
  // （Knuth TeX 的 NAMEOFFILE := POOLNAME 即此问题，目标为 0-based。）
  if (
    lvalueType.tag === 'array' &&
    lvalueType.dims &&
    lvalueType.dims.length === 1 &&
    lvalueType.elem &&
    lvalueType.elem.tag === 'char'
  ) {
    if (node.right.kind === 'StringLiteral') {
      const dim = lvalueType.dims[0]
      if (dim.low !== 1) {
        value = syscall(syscallKeys.arrayCharResize, [litInt(dim.low), litInt(dim.high), value])
      }
    }
  }

  // 简单变量
  if (node.left.kind === 'Identifier') {
    // with 字段优先（ISO 7185 6.8.3.10）
    for (let i = ws.length - 1; i >= 0; i--) {
      const binding = ws[i]
      const fname = node.left.name.toLowerCase()
      if (binding.fields.has(fname)) {
        const varId = binding.tempVarId
        return [
          evalStmt(syscall(syscallKeys.recSet, [ref(varId), litField(fname), value])),
        ]
      }
    }

    const sym = resolveSymbol(node.left, a, ws)
    if (sym && (sym.kind === 'var' || sym.kind === 'param')) {
      const ti = sym.typeInfo
      // subrange 运行时边界检查
      const rangeCheck = ti.tag === 'subrange' && ti.low !== undefined && ti.high !== undefined
        ? evalStmt(syscall(syscallKeys.rangeCheck, [ref(sym.varId), litInt(ti.low), litInt(ti.high)]))
        : undefined
      if (sym.isVarParam) {
        const stmts: JsonCode.Statement[] = [evalStmt(syscall(syscallKeys.cellSet, [ref(sym.varId), value]))]
        if (rangeCheck) {
          stmts.push(rangeCheck)
        }
        return stmts
      }
      const stmts: JsonCode.Statement[] = [assignStmt(ref(sym.varId), value)]
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
  if (node.left.kind === 'ArrayAccess') {
    const arr = node.left as ArrayAccessNode
    const arrExpr = loweringExpr(arr.array, a, ws)
    const idxExprs = arr.indices.map((i) => {
      const expr = loweringExpr(i, a, ws)
      const ti = a.typeOf(i)
      if (ti.tag === 'char') {
        return syscall(syscallKeys.castCharToi32, [expr])
      }
      return expr
    })
    return [evalStmt(syscall(syscallKeys.arraySet, [arrExpr, ...idxExprs, value]))]
  }

  // 记录字段
  if (node.left.kind === 'FieldAccess') {
    const fa = node.left as FieldAccessNode
    if (fa.field.name === '^') {
      const objType = a.typeOf(fa.object)
      if (objType.tag === 'pointer') {
        // ISO 7185 6.5.4: 指针解引用赋值 p^ := x → cell.set(p, x)
        const ptrExpr = loweringExpr(fa.object, a, ws)
        return [evalStmt(syscall(syscallKeys.ptrAssign, [ptrExpr, value]))]
      }
      // 文件缓冲区赋值 f^ := x → file.put
      // file of record: f^ := r 设置记录缓冲区（ISO 7185 6.4.3.5/6.6.5.2）
      const fExpr = loweringExpr(fa.object, a, ws)
      if (isRecordFile(objType)) {
        return [evalStmt(syscall(syscallKeys.fileRecSetbuf, [fExpr, value]))]
      }
      return [evalStmt(syscall(syscallKeys.filePut, [fExpr, value]))]
    }
    const objExpr = loweringExpr(fa.object, a, ws)
    return [evalStmt(syscall(syscallKeys.recSet, [objExpr, litField(fa.field.name.toLowerCase()), value]))]
  }

  throw new Error('loweringAssignment: unsupported left-hand side')
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

  const limitVar = a.allocTempLocal(funcId, { tag: 'i32' })
  const L_top = a.nextId()
  const L_body = a.nextId()
  const L_end = a.nextId()

  const isDown = node.direction === 'DOWNTO'
  const cmpKey = isDown ? syscallKeys.cmpGe : syscallKeys.cmpLe
  const stepKey = isDown ? syscallKeys.i32Sub : syscallKeys.i32Add

  const varRef = varSym.isVarParam ? syscall(syscallKeys.cellGet, [ref(vid)]) : ref(vid)

  return [
    assignStmt(ref(vid), initE),
    assignStmt(ref(limitVar), finalE),
    labelStmt(L_top),
    evalStmt(syscall(syscallKeys.stepsCheck, [])),
    jumpIfStmt(syscall(cmpKey, [varRef, ref(limitVar)]), L_body, L_end),
    labelStmt(L_body),
    ...loweringStmt(node.body, a, funcId, ws),
    assignStmt(ref(vid), syscall(stepKey, [varRef, litInt(1)])),
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
        syscall(syscallKeys.cmpEq, [ref(caseVar), checks[i].labelExpr]),
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
    throw new Error(`loweringGoto: label ${node.label.value} not declared`)
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
    throw new Error(`loweringLabeled: label ${node.label.value} not declared`)
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
      fields: ti.fields ?? new Map(),
    })
  }

  const childWs = [...ws, ...newBindings]
  out.push(...loweringStmt(node.body, a, funcId, childWs))
  return out
}

// ============================================================
// ProcedureCall 编译
// ============================================================

function loweringProcedureCall(
  node: ProcedureCallNode,
  a: Analysis,
  funcId: number,
  ws: WithBinding[],
): JsonCode.Statement[] {
  const name = node.name.name.toLowerCase()
  const sym = resolveSymbol(node.name, a, ws)

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
    case 'reset': {
      // ISO 6.6.5.2 reset(f)：1-arg 形式。
      // 若源码写了 reset(f, name) 2-arg 形式（非 ISO），name 参数被编译但
      // runtime 的 file.reset 忽略之（file.url 必须已通过 program-param 绑定）。
      // file of record 走 file.rec.reset（传元素类型描述，用于 reset 后创建默认缓冲区）。
      const resetArgs = node.arguments.map((x) => loweringExpr(x, a, ws))
      if (node.arguments.length > 0) {
        const fileType = a.typeOf(node.arguments[0])
        if (isRecordFile(fileType)) {
          const elemTi = fileType.elem!
          resetArgs.push(typeDescLiteral(elemTi))
          return [evalStmt(syscall(syscallKeys.fileRecReset, resetArgs))]
        }
      }
      return [evalStmt(syscall(syscallKeys.fileReset, resetArgs))]
    }
    case 'rewrite': {
      // ISO 6.6.5.2 rewrite(f)：1-arg 形式（同 reset 的处理策略）。
      const rewriteArgs = node.arguments.map((x) => loweringExpr(x, a, ws))
      if (node.arguments.length > 0) {
        const fileType = a.typeOf(node.arguments[0])
        if (isRecordFile(fileType)) {
          const elemTi = fileType.elem!
          rewriteArgs.push(typeDescLiteral(elemTi))
          return [evalStmt(syscall(syscallKeys.fileRecRewrite, rewriteArgs))]
        }
      }
      return [evalStmt(syscall(syscallKeys.fileRewrite, rewriteArgs))]
    }
    case 'get': {
      const getArgs = node.arguments.map((x) => loweringExpr(x, a, ws))
      if (node.arguments.length > 0) {
        const fileType = a.typeOf(node.arguments[0])
        if (isRecordFile(fileType)) {
          return [evalStmt(syscall(syscallKeys.fileRecGet, getArgs))]
        } else if (fileType.elem?.tag === 'char') {
          return [evalStmt(syscall(syscallKeys.fileGetChar, getArgs))]
        }
      }
      return [evalStmt(syscall(syscallKeys.fileGet, getArgs))]
    }
    case 'put': {
      const putArgs = node.arguments.map((x) => loweringExpr(x, a, ws))
      if (node.arguments.length > 0) {
        const fileType = a.typeOf(node.arguments[0])
        if (isRecordFile(fileType)) {
          return [evalStmt(syscall(syscallKeys.fileRecPut, putArgs))]
        }
      }
      return [evalStmt(syscall(syscallKeys.filePut, putArgs))]
    }
    case 'page':
      return [
        evalStmt(
          syscall(
            syscallKeys.ioPage,
            node.arguments.map((x) => loweringExpr(x, a, ws)),
          ),
        ),
      ]
    case 'new': {
      // ISO 7185 6.6.5.3: new(p) 创建新变量，p 指向它
      const argNode = node.arguments[0]
      if (argNode.kind !== 'Identifier') {
        throw new Error('new: argument must be a pointer variable')
      }
      const sym = resolveSymbol(argNode as IdentifierNode, a, ws)
      if (!sym || (sym.kind !== 'var' && sym.kind !== 'param')) {
        throw new Error('new: argument is not a variable')
      }
      const ptrType = a.typeOf(argNode)
      if (ptrType.tag !== 'pointer' || !ptrType.domainType) {
        throw new Error('new: argument must be a pointer-type variable')
      }
      const defaultVal = defaultExpr(ptrType.domainType)
      const cell = syscall(syscallKeys.cellCreate, [defaultVal])
      if (sym.isVarParam) {
        return [evalStmt(syscall(syscallKeys.cellSet, [ref(sym.varId), cell]))]
      }
      return [assignStmt(ref(sym.varId), cell)]
    }
    case 'dispose': {
      // ISO 7185 6.6.5.3: dispose(p) 释放标识值，p 置 nil
      const argNode = node.arguments[0]
      if (argNode.kind !== 'Identifier') {
        throw new Error('dispose: argument must be a pointer variable')
      }
      const sym = resolveSymbol(argNode as IdentifierNode, a, ws)
      if (!sym || (sym.kind !== 'var' && sym.kind !== 'param')) {
        throw new Error('dispose: argument is not a variable')
      }
      // 先检查 p 不是 nil（解引用前检查），然后置 nil
      const ptrExpr = loweringExpr(argNode, a, ws)
      const checkStmt = evalStmt(syscall(syscallKeys.ptrDisposeCheck, [ptrExpr]))
      if (sym.isVarParam) {
        return [checkStmt, evalStmt(syscall(syscallKeys.cellSet, [ref(sym.varId), litNull()]))]
      }
      return [checkStmt, assignStmt(ref(sym.varId), litNull())]
    }
    default: {
      throw new Error(`loweringProcedureCall: unknown procedure ${name}`)
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
  const cellVars: { argIdx: number; cellVar: number; targetIsVar: IdentifierNode | undefined }[] = []

  for (let i = 0; i < args.length; i++) {
    const param = info.params[i]
    if (!param) {
      argExprs.push(loweringExpr(args[i], a, ws))
      continue
    }
    if (param.isVarParam) {
      // var 参数：用 cell 包装
      const argNode = args[i]
      if (argNode.kind === 'Identifier') {
        const sym = resolveSymbol(argNode, a, ws)
        if (sym && (sym.kind === 'var' || sym.kind === 'param')) {
          const cellVar = a.allocTempLocal(curFuncId, { tag: 'unknown' })
          const valExpr = sym.isVarParam ? syscall(syscallKeys.cellGet, [ref(sym.varId)]) : ref(sym.varId)
          out.push(assignStmt(ref(cellVar), syscall(syscallKeys.cellCreate, [valExpr])))
          argExprs.push(ref(cellVar))
          cellVars.push({ argIdx: i, cellVar, targetIsVar: argNode })
        }
      }
    } else {
      // Pascal value 参数传递是值拷贝语义（ISO 7185），record 类型需深拷贝
      let argExpr = loweringExpr(args[i], a, ws)
      if (param.typeInfo.tag === 'rec') {
        argExpr = syscall(syscallKeys.recCopy, [argExpr])
      }
      argExprs.push(argExpr)
    }
  }

  out.push(evalStmt(callExpr(funcId, argExprs)))

  // 写回 var 参数
  for (const cv of cellVars) {
    const sym = resolveSymbol(cv.targetIsVar!, a, ws)
    if (sym && (sym.kind === 'var' || sym.kind === 'param')) {
      const valExpr = syscall(syscallKeys.cellGet, [ref(cv.cellVar)])
      if (sym.isVarParam) {
        out.push(evalStmt(syscall(syscallKeys.cellSet, [ref(sym.varId), valExpr])))
      } else {
        out.push(assignStmt(ref(sym.varId), valExpr))
      }
    }
  }

  return out
}
