/*
 * IL Compiler — lowering 第二阶段：编译。
 *
 * 纯函数族（namespace Compile）。无 mutable state。
 * 输入：(AST 节点, Analysis, 上下文) → 输出：JsonCode 节点。
 *
 * 唯一可变动作用是调用 analysis.nextId() / allocTempLocal() 拿新 ID，
 * 计数器属于 Analysis，compiler 不自行维护。
 */

import { JsonCode } from '@/compiler/json-code'
import { Analysis, TypeInfo, VarSymbol, Symbol } from '@/compiler/analysis'
import {
  IlPlugin,
  findProcedurePlugin,
  findFunctionPlugin,
  pluginSyscallKey,
} from '@/compiler/plugin'
import {
  ProgramNode,
  BlockNode,
  StatementNode,
  ExpressionNode,
  IdentifierNode,
  ProcedureDeclarationNode,
  FunctionDeclarationNode,
  WithStatementNode,
  AssignmentNode,
  IfStatementNode,
  WhileStatementNode,
  RepeatStatementNode,
  ForStatementNode,
  CaseStatementNode,
  CaseBranchNode,
  GotoStatementNode,
  LabeledStatementNode,
  ProcedureCallNode,
  CompoundStatementNode,
  EmptyStatementNode,
  BinaryExpressionNode,
  UnaryExpressionNode,
  FunctionCallNode,
  ArrayAccessNode,
  FieldAccessNode,
  ParenthesizedExpressionNode,
  SetConstructorNode,
  InExpressionNode,
  IntegerLiteralNode,
  RealLiteralNode,
  StringLiteralNode,
  CharLiteralNode,
  BooleanLiteralNode,
} from '@/ast/types'

// ============================================================
// With 绑定上下文
// ============================================================

interface WithBinding {
  tempVarId: number
  fields: Map<string, TypeInfo>
}

// ============================================================
// 辅助构造函数
// ============================================================

function ref(varId: number): JsonCode.Ref {
  return { kind: 'ref', varId }
}

function litInt(v: number | string): JsonCode.Literal {
  return { kind: 'literal', key: 'i64', arg: String(v) }
}

function litReal(v: string): JsonCode.Literal {
  return { kind: 'literal', key: 'f64', arg: v }
}

function litStr(v: string): JsonCode.Literal {
  return { kind: 'literal', key: 'str', arg: v }
}

function litChar(v: string): JsonCode.Literal {
  return { kind: 'literal', key: 'char', arg: v }
}

function litBool(v: boolean): JsonCode.Literal {
  return { kind: 'literal', key: 'bool', arg: v ? 'true' : 'false' }
}

function litNull(): JsonCode.Literal {
  // ISO 7185 6.4.4: nil-value，JS 中用 null 表示
  return { kind: 'literal', key: 'null', arg: 'null' }
}

function syscall(key: string, args: JsonCode.Expr[]): JsonCode.Syscall {
  return { kind: 'syscall', key, args }
}

function callExpr(funcId: number, args: JsonCode.Expr[]): JsonCode.Call {
  return { kind: 'call', functionId: funcId, args }
}

function labelStmt(id: number): JsonCode.Label {
  return { kind: 'label', labelId: id }
}

function jumpStmt(id: number): JsonCode.Jmp {
  return { kind: 'jump', labelId: id }
}

function jumpIfStmt(cond: JsonCode.Expr, then: number, els: number): JsonCode.JumpIf {
  return { kind: 'jumpIf', condition: cond, then, else: els }
}

function assignStmt(target: JsonCode.Ref, value: JsonCode.Expr): JsonCode.Assign {
  return { kind: 'assign', target, value }
}

function evalStmt(expr: JsonCode.Expr): JsonCode.Eval {
  return { kind: 'eval', expr }
}

function returnStmt(value?: JsonCode.Expr): JsonCode.Return {
  return { kind: 'return', value }
}

// ============================================================
// 类型 → syscall key 后缀
// ============================================================

function typeSuffix(ti: TypeInfo): string {
  switch (ti.tag) {
    case 'i64':
    case 'enum':
      return 'i64'
    case 'subrange':
      // 子界类型按 baseTag 选择 io.write syscall
      // （boolean 子界输出 TRUE/FALSE，char 子界输出字符）
      if (ti.baseTag === 'bool') return 'bool'
      if (ti.baseTag === 'char') return 'char'
      return 'i64'
    case 'f64':
      return 'f64'
    case 'bool':
      return 'bool'
    case 'char':
      return 'char'
    case 'str':
      return 'str'
    case 'set':
      return 'set'
    default:
      return 'i64'
  }
}

/**
 * 判断文件类型是否为 file of record（elem.tag === 'rec'）。
 * 用于在 reset/rewrite/get/put/eof/f^ 等操作中分派到 file.rec.* syscall。
 * ISO 7185 6.4.3.5: file-type = 'file' 'of' component-type
 */
function isRecordFile(fileType: TypeInfo): boolean {
  const elemTi = fileType.fileElem ?? null
  return elemTi !== null && elemTi.tag === 'rec'
}

// ============================================================
// 变量默认值
// ============================================================

function defaultExpr(ti: TypeInfo): JsonCode.Expr {
  switch (ti.tag) {
    case 'i64':
    case 'enum':
      return litInt(0)
    case 'subrange':
      // subrange 默认值为 lower bound（ISO 7185: 子界变量未初始化时取下界）
      return litInt(ti.low ?? 0)
    case 'f64':
      return litReal('0')
    case 'bool':
      return litBool(false)
    case 'char':
      return litChar('\x00')
    case 'str':
      return litStr('')
    case 'array':
      return syscall('mem.default.array', [typeDescLiteral(ti)])
    case 'rec':
      return syscall('mem.default.rec', [typeDescLiteral(ti)])
    case 'set':
      return syscall('set.empty', [])
    case 'file':
      return syscall('file.create', [])
    case 'pointer':
      // ISO 7185 6.4.4: 指针变量默认为 nil-value
      return litNull()
    default:
      return litInt(0)
  }
}

function typeDescLiteral(ti: TypeInfo): JsonCode.Literal {
  return { kind: 'literal', key: 'type', arg: JSON.stringify(serializeTypeInfo(ti)) }
}

function serializeTypeInfo(ti: TypeInfo): any {
  return {
    tag: ti.tag,
    low: ti.low,
    high: ti.high,
    dims: ti.dims,
    elem: ti.elem ? serializeTypeInfo(ti.elem) : undefined,
    fields: ti.fields
      ? Array.from(ti.fields.entries()).map(([k, v]) => ({ name: k, type: serializeTypeInfo(v) }))
      : undefined,
  }
}

// ============================================================
// 入口：compileProgram
// ============================================================

export function compileProgram(program: ProgramNode, a: Analysis): JsonCode.Function {
  return compileBlock(program.block, a, null)
}

// ============================================================
// compileBlock → JsonCode.Function
// ============================================================

function compileBlock(
  block: BlockNode,
  a: Analysis,
  parentDecl: ProcedureDeclarationNode | FunctionDeclarationNode | null
): JsonCode.Function {
  const funcId = parentDecl ? a.funcOfDecl(parentDecl) : a.funcOfBlock(block)
  const info = a.funcInfo(funcId)

  const params = info.params.map((p) => p.varId)
  const locals = info.locals.map((l) => l.varId)
  if (info.retval) locals.push(info.retval.varId)

  // children
  const children: JsonCode.Function[] = []
  for (const p of block.procedureDeclarations) {
    if (p.block) {
      children.push(compileBlock(p.block, a, p))
    } else {
      // FORWARD 声明：空函数
      children.push({
        id: a.funcOfDecl(p),
        params: a.funcInfo(a.funcOfDecl(p)).params.map((x) => x.varId),
        locals: [],
        children: [],
        body: [returnStmt()],
      })
    }
  }
  for (const f of block.functionDeclarations) {
    if (f.block) {
      children.push(compileBlock(f.block, a, f))
    } else {
      children.push({
        id: a.funcOfDecl(f),
        params: a.funcInfo(a.funcOfDecl(f)).params.map((x) => x.varId),
        locals: [],
        children: [],
        body: [returnStmt()],
      })
    }
  }

  // body
  const body: JsonCode.Statement[] = []

  // 变量初始化
  // 注意：记录此时 info.locals.length，因为编译 compound 语句时
  // allocTempLocal 会向 info.locals 追加 cell 临时变量，
  // 导致 applyProgramFileUrls 中 initCount 计算偏大。
  const initCount = info.locals.length + (info.retval ? 1 : 0)
  for (const local of info.locals) {
    body.push(assignStmt(ref(local.varId), defaultExpr(local.typeInfo)))
  }
  if (info.retval) {
    body.push(assignStmt(ref(info.retval.varId), defaultExpr(info.retval.typeInfo)))
  }

  // compound 语句
  for (const stmt of compileStmt(block.compound, a, funcId, [])) {
    body.push(stmt)
  }

  // 末尾 return
  if (info.retval) {
    body.push(returnStmt(ref(info.retval.varId)))
  } else {
    body.push(returnStmt())
  }

  return {
    id: funcId,
    params,
    locals,
    children,
    body,
    initCount,
  }
}

// ============================================================
// compileStmt → Statement[]
// ============================================================

export function compileStmt(
  node: StatementNode,
  a: Analysis,
  funcId: number,
  withStack: WithBinding[]
): JsonCode.Statement[] {
  switch (node.kind) {
    case 'CompoundStatement':
      return compileCompound(node, a, funcId, withStack)
    case 'Assignment':
      return compileAssignment(node, a, funcId, withStack)
    case 'IfStatement':
      return compileIf(node, a, funcId, withStack)
    case 'WhileStatement':
      return compileWhile(node, a, funcId, withStack)
    case 'RepeatStatement':
      return compileRepeat(node, a, funcId, withStack)
    case 'ForStatement':
      return compileFor(node, a, funcId, withStack)
    case 'CaseStatement':
      return compileCase(node, a, funcId, withStack)
    case 'GotoStatement':
      return compileGoto(node, a, funcId)
    case 'LabeledStatement':
      return compileLabeled(node, a, funcId, withStack)
    case 'WithStatement':
      return compileWith(node, a, funcId, withStack)
    case 'ProcedureCall':
      return compileProcedureCall(node, a, funcId, withStack)
    case 'EmptyStatement':
      return []
    default:
      throw new Error(`compileStmt: unknown kind ${(node as StatementNode).kind}`)
  }
}

function compileCompound(
  node: CompoundStatementNode,
  a: Analysis,
  funcId: number,
  ws: WithBinding[]
): JsonCode.Statement[] {
  const out: JsonCode.Statement[] = []
  for (const s of node.statements) {
    out.push(...compileStmt(s, a, funcId, ws))
  }
  return out
}

function compileAssignment(
  node: AssignmentNode,
  a: Analysis,
  funcId: number,
  ws: WithBinding[]
): JsonCode.Statement[] {
  // Pascal record 赋值是值拷贝语义（ISO 7185），JS 对象赋值是引用。
  // 若左值类型为 record，用 rec.copy 深拷贝右值，避免别名共享。
  const lvalueType = a.typeOf(node.left)
  const needRecCopy = lvalueType.tag === 'rec'
  let value = compileExpr(node.right, a, ws)
  if (needRecCopy) {
    value = syscall('rec.copy', [value])
  }

  // Pascal `packed array[low..high] of char` 赋值为字符串字面量或 str 类型时，
  // 必须转成 1-based 字符数组对象，否则后续 arr[k] 在 JS 中是 0-based 字符串索引，
  // 导致首字符丢失（Knuth TeX 的 NAMEOFFILE := POOLNAME 即此问题）。
  if (
    lvalueType.tag === 'array' &&
    lvalueType.dims &&
    lvalueType.dims.length === 1 &&
    lvalueType.elem &&
    lvalueType.elem.tag === 'char'
  ) {
    const rvalueType = a.typeOf(node.right)
    if (rvalueType.tag === 'str' || node.right.kind === 'StringLiteral') {
      const dim = lvalueType.dims[0]
      value = syscall('str.to.char.array', [litInt(dim.low), litInt(dim.high), value])
    }
  }

  // 简单变量
  if (node.left.kind === 'Identifier') {
    // with 字段优先（ISO 7185 6.8.3.10）
    for (let i = ws.length - 1; i >= 0; i--) {
      const binding = ws[i]
      const fname = node.left.name.toLowerCase()
      if (binding.fields.has(fname)) {
        return [evalStmt(syscall('rec.set', [ref(binding.tempVarId), litStr(fname), value]))]
      }
    }

    const sym = resolveSymbol(node.left, a, ws)
    if (sym && (sym.kind === 'var' || sym.kind === 'param')) {
      const ti = sym.typeInfo
      // subrange 运行时边界检查
      const rangeCheck =
        ti.tag === 'subrange' && ti.low !== undefined && ti.high !== undefined
          ? evalStmt(syscall('range.check', [ref(sym.varId), litInt(ti.low), litInt(ti.high)]))
          : null
      if (sym.isVarParam) {
        const stmts: JsonCode.Statement[] = [evalStmt(syscall('cell.set', [ref(sym.varId), value]))]
        if (rangeCheck) stmts.push(rangeCheck)
        return stmts
      }
      const stmts: JsonCode.Statement[] = [assignStmt(ref(sym.varId), value)]
      if (rangeCheck) stmts.push(rangeCheck)
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
    const arrExpr = compileExpr(arr.array, a, ws)
    const idxExprs = arr.indices.map((i) => {
      const expr = compileExpr(i, a, ws)
      const ti = a.typeOf(i)
      if (ti.tag === 'char') {
        return syscall('cast.char.to.i64', [expr])
      }
      return expr
    })
    return [evalStmt(syscall('array.set', [arrExpr, ...idxExprs, value]))]
  }

  // 记录字段
  if (node.left.kind === 'FieldAccess') {
    const fa = node.left as FieldAccessNode
    if (fa.field.name === '^') {
      const objType = a.typeOf(fa.object)
      if (objType.tag === 'pointer') {
        // ISO 7185 6.5.4: 指针解引用赋值 p^ := x → cell.set(p, x)
        const ptrExpr = compileExpr(fa.object, a, ws)
        return [evalStmt(syscall('ptr.assign', [ptrExpr, value]))]
      }
      // 文件缓冲区赋值 f^ := x → file.put
      // 二进制字节文件（file of byte / file of eight_bits，elem 为 subrange）：
      // x 是 0..255 的 byte 值，需转成单字符写入，否则 file.put 会把 number
      // 转成十进制字符串污染 DVI/TFM 等二进制产物。
      // 注意：file of integer（elem.tag === 'i64'）不走此路径，仍按文本写入。
      const fExpr = compileExpr(fa.object, a, ws)
      const elemTi = objType.fileElem ?? null
      const isBinaryByteFile = elemTi !== null && elemTi.tag === 'subrange'
      if (isBinaryByteFile) {
        const charVal = syscall('cast.i64.to.char', [value])
        return [evalStmt(syscall('file.put', [fExpr, charVal]))]
      }
      // file of record: f^ := r 设置记录缓冲区（ISO 7185 6.4.3.5/6.6.5.2）
      if (isRecordFile(objType)) {
        return [evalStmt(syscall('file.rec.setbuf', [fExpr, value]))]
      }
      return [evalStmt(syscall('file.put', [fExpr, value]))]
    }
    const objExpr = compileExpr(fa.object, a, ws)
    return [evalStmt(syscall('rec.set', [objExpr, litStr(fa.field.name.toLowerCase()), value]))]
  }

  throw new Error('compileAssignment: unsupported left-hand side')
}

function compileIf(
  node: IfStatementNode,
  a: Analysis,
  funcId: number,
  ws: WithBinding[]
): JsonCode.Statement[] {
  const cond = compileExpr(node.condition, a, ws)
  const L_then = a.nextId()
  const L_end = a.nextId()
  const L_else = node.elseBranch ? a.nextId() : L_end

  const out: JsonCode.Statement[] = [jumpIfStmt(cond, L_then, L_else)]
  out.push(labelStmt(L_then))
  out.push(...compileStmt(node.thenBranch, a, funcId, ws))
  if (node.elseBranch) {
    out.push(jumpStmt(L_end))
    out.push(labelStmt(L_else))
    out.push(...compileStmt(node.elseBranch, a, funcId, ws))
  }
  out.push(labelStmt(L_end))
  return out
}

function compileWhile(
  node: WhileStatementNode,
  a: Analysis,
  funcId: number,
  ws: WithBinding[]
): JsonCode.Statement[] {
  const L_top = a.nextId()
  const L_body = a.nextId()
  const L_end = a.nextId()
  const cond = compileExpr(node.condition, a, ws)
  return [
    labelStmt(L_top),
    evalStmt(syscall('steps.check', [])),
    jumpIfStmt(cond, L_body, L_end),
    labelStmt(L_body),
    ...compileStmt(node.body, a, funcId, ws),
    jumpStmt(L_top),
    labelStmt(L_end),
  ]
}

function compileRepeat(
  node: RepeatStatementNode,
  a: Analysis,
  funcId: number,
  ws: WithBinding[]
): JsonCode.Statement[] {
  const L_top = a.nextId()
  const L_end = a.nextId()
  const cond = compileExpr(node.untilCondition, a, ws)
  const bodyStmts: JsonCode.Statement[] = []
  for (const s of node.statements) {
    bodyStmts.push(...compileStmt(s, a, funcId, ws))
  }
  return [
    labelStmt(L_top),
    evalStmt(syscall('steps.check', [])),
    ...bodyStmts,
    jumpIfStmt(cond, L_end, L_top),
    labelStmt(L_end),
  ]
}

function compileFor(
  node: ForStatementNode,
  a: Analysis,
  funcId: number,
  ws: WithBinding[]
): JsonCode.Statement[] {
  const varSym = resolveSymbol(node.variable, a, ws)
  if (!varSym || (varSym.kind !== 'var' && varSym.kind !== 'param')) {
    throw new Error(`compileFor: variable ${node.variable.name} not found`)
  }
  const vid = varSym.varId
  const initE = compileExpr(node.initial, a, ws)
  const finalE = compileExpr(node.final, a, ws)

  const limitVar = a.allocTempLocal(funcId, { tag: 'i64' })
  const L_top = a.nextId()
  const L_body = a.nextId()
  const L_end = a.nextId()

  const isDown = node.direction === 'DOWNTO'
  const cmpKey = isDown ? 'cmp.ge' : 'cmp.le'
  const stepKey = isDown ? 'i64.sub' : 'i64.add'

  const varRef = varSym.isVarParam ? syscall('cell.get', [ref(vid)]) : ref(vid)

  return [
    assignStmt(ref(vid), initE),
    assignStmt(ref(limitVar), finalE),
    labelStmt(L_top),
    evalStmt(syscall('steps.check', [])),
    jumpIfStmt(syscall(cmpKey, [varRef, ref(limitVar)]), L_body, L_end),
    labelStmt(L_body),
    ...compileStmt(node.body, a, funcId, ws),
    assignStmt(ref(vid), syscall(stepKey, [varRef, litInt(1)])),
    jumpStmt(L_top),
    labelStmt(L_end),
  ]
}

function compileCase(
  node: CaseStatementNode,
  a: Analysis,
  funcId: number,
  ws: WithBinding[]
): JsonCode.Statement[] {
  const caseVar = a.allocTempLocal(funcId, a.typeOf(node.expression))
  const L_end = a.nextId()
  const L_otherwise = node.otherwise ? a.nextId() : L_end
  const out: JsonCode.Statement[] = [assignStmt(ref(caseVar), compileExpr(node.expression, a, ws))]

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
      checks.push({ labelExpr: compileExpr(lbl, a, ws), bodyLabel: bodyLabels[bi] })
    }
  }

  for (let i = 0; i < checks.length; i++) {
    const isLast = i === checks.length - 1
    const L_next = isLast ? L_otherwise : a.nextId()
    out.push(
      jumpIfStmt(
        syscall('cmp.eq', [ref(caseVar), checks[i].labelExpr]),
        checks[i].bodyLabel,
        L_next
      )
    )
    if (!isLast) {
      out.push(labelStmt(L_next))
    }
  }

  // 生成 body（每个分支的 statement）
  for (let bi = 0; bi < node.branches.length; bi++) {
    out.push(labelStmt(bodyLabels[bi]))
    out.push(...compileStmt(node.branches[bi].statement, a, funcId, ws))
    out.push(jumpStmt(L_end))
  }

  if (node.otherwise) {
    out.push(labelStmt(L_otherwise))
    out.push(...compileStmt(node.otherwise, a, funcId, ws))
  }

  out.push(labelStmt(L_end))
  return out
}

function compileGoto(node: GotoStatementNode, a: Analysis, funcId: number): JsonCode.Statement[] {
  const info = a.labelInfo(funcId, node.label.value)
  if (!info) throw new Error(`compileGoto: label ${node.label.value} not declared`)
  // 决策 13：goto 跳转前插入 steps.check，防止 goto 死循环（steps.check 只在循环回边
  // 插入，goto 跳转不触发回边检查，需单独兜底）
  const check = evalStmt(syscall('steps.check', []))
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

function compileLabeled(
  node: LabeledStatementNode,
  a: Analysis,
  funcId: number,
  ws: WithBinding[]
): JsonCode.Statement[] {
  const info = a.labelInfo(funcId, node.label.value)
  if (!info) throw new Error(`compileLabeled: label ${node.label.value} not declared`)
  return [labelStmt(info.labelId), ...compileStmt(node.statement, a, funcId, ws)]
}

function compileWith(
  node: WithStatementNode,
  a: Analysis,
  funcId: number,
  ws: WithBinding[]
): JsonCode.Statement[] {
  const temps = a.withTempsOf(node)
  const out: JsonCode.Statement[] = []

  // 把 record 表达式赋给临时变量，构建 withStack 增量
  const newBindings: WithBinding[] = []
  for (let i = 0; i < node.records.length; i++) {
    const recExpr = node.records[i]
    const tempVarId = temps[i].varId
    out.push(assignStmt(ref(tempVarId), compileExpr(recExpr, a, ws)))
    const ti = temps[i].typeInfo
    newBindings.push({
      tempVarId,
      fields: ti.fields ?? new Map(),
    })
  }

  const childWs = [...ws, ...newBindings]
  out.push(...compileStmt(node.body, a, funcId, childWs))
  return out
}

// ============================================================
// ProcedureCall 编译
// ============================================================

function compileProcedureCall(
  node: ProcedureCallNode,
  a: Analysis,
  funcId: number,
  ws: WithBinding[]
): JsonCode.Statement[] {
  const name = node.name.name.toLowerCase()
  const sym = resolveSymbol(node.name, a, ws)

  // 用户定义过程
  if (sym?.kind === 'func') {
    return compileUserCallStmt(sym.funcId, node.arguments, a, funcId, ws)
  }

  // 内置过程
  switch (name) {
    case 'writeln':
      return compileWriteln(node.arguments, a, ws, false)
    case 'write':
      return compileWriteln(node.arguments, a, ws, true)
    case 'readln':
      return compileReadln(node.arguments, a, ws, false)
    case 'read':
      return compileReadln(node.arguments, a, ws, true)
    case 'reset': {
      // 对二进制字节文件（file of byte/eight_bits，elem 为 subrange）用 file.reset.binary，
      // 使 runtime 读取时不把 10/13 当作行结束符，正确处理 TFM/DVI 等二进制文件。
      const resetArgs = node.arguments.map((x) => compileExpr(x, a, ws))
      if (node.arguments.length > 0) {
        const fileType = a.typeOf(node.arguments[0])
        if (isRecordFile(fileType)) {
          // 传元素类型描述，用于 reset 后创建默认缓冲区记录
          const elemTi = fileType.fileElem!
          resetArgs.push(typeDescLiteral(elemTi))
          return [evalStmt(syscall('file.rec.reset', resetArgs))]
        }
        const elemTi = fileType.fileElem ?? null
        if (elemTi !== null && elemTi.tag === 'subrange') {
          return [evalStmt(syscall('file.reset.binary', resetArgs))]
        }
      }
      return [evalStmt(syscall('file.reset', resetArgs))]
    }
    case 'rewrite': {
      // 对二进制字节文件（file of byte/eight_bits，elem 为 subrange）用 file.rewrite.binary，
      // 使 runtime 用 Latin-1 编码写入，避免 UTF-8 破坏 DVI/TFM 等二进制产物。
      const rewriteArgs = node.arguments.map((x) => compileExpr(x, a, ws))
      if (node.arguments.length > 0) {
        const fileType = a.typeOf(node.arguments[0])
        if (isRecordFile(fileType)) {
          // 传元素类型描述，用于 rewrite 后创建默认缓冲区记录
          const elemTi = fileType.fileElem!
          rewriteArgs.push(typeDescLiteral(elemTi))
          return [evalStmt(syscall('file.rec.rewrite', rewriteArgs))]
        }
        const elemTi = fileType.fileElem ?? null
        if (elemTi !== null && elemTi.tag === 'subrange') {
          return [evalStmt(syscall('file.rewrite.binary', rewriteArgs))]
        }
      }
      return [evalStmt(syscall('file.rewrite', rewriteArgs))]
    }
    case 'close':
      return [
        evalStmt(
          syscall(
            'file.close',
            node.arguments.map((x) => compileExpr(x, a, ws))
          )
        ),
      ]
    case 'assign':
      return [
        evalStmt(
          syscall(
            'file.assign',
            node.arguments.map((x) => compileExpr(x, a, ws))
          )
        ),
      ]
    case 'get': {
      const getArgs = node.arguments.map((x) => compileExpr(x, a, ws))
      if (node.arguments.length > 0) {
        const fileType = a.typeOf(node.arguments[0])
        if (isRecordFile(fileType)) {
          return [evalStmt(syscall('file.rec.get', getArgs))]
        }
      }
      return [evalStmt(syscall('file.get', getArgs))]
    }
    case 'put': {
      const putArgs = node.arguments.map((x) => compileExpr(x, a, ws))
      if (node.arguments.length > 0) {
        const fileType = a.typeOf(node.arguments[0])
        if (isRecordFile(fileType)) {
          return [evalStmt(syscall('file.rec.put', putArgs))]
        }
      }
      return [evalStmt(syscall('file.put', putArgs))]
    }
    case 'page':
      return [
        evalStmt(
          syscall(
            'io.page',
            node.arguments.map((x) => compileExpr(x, a, ws))
          )
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
      const cell = syscall('cell.create', [defaultVal])
      if (sym.isVarParam) {
        return [evalStmt(syscall('cell.set', [ref(sym.varId), cell]))]
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
      const ptrExpr = compileExpr(argNode, a, ws)
      const checkStmt = evalStmt(syscall('ptr.dispose.check', [ptrExpr]))
      if (sym.isVarParam) {
        return [checkStmt, evalStmt(syscall('cell.set', [ref(sym.varId), litNull()]))]
      }
      return [checkStmt, assignStmt(ref(sym.varId), litNull())]
    }
    default: {
      // 插件注入的非标过程（AGENTS.md 原则 A.7）
      const found = findProcedurePlugin(a.plugins(), name)
      if (found) {
        const args = node.arguments.map((x) => compileExpr(x, a, ws))
        return [evalStmt(syscall(pluginSyscallKey(found.plugin.name, found.name), args))]
      }
      throw new Error(`compileProcedureCall: unknown procedure ${name}`)
    }
  }
}

function compileUserCallStmt(
  funcId: number,
  args: ExpressionNode[],
  a: Analysis,
  curFuncId: number,
  ws: WithBinding[]
): JsonCode.Statement[] {
  const info = a.funcInfo(funcId)
  const out: JsonCode.Statement[] = []
  const argExprs: JsonCode.Expr[] = []
  const cellVars: { argIdx: number; cellVar: number; targetIsVar: IdentifierNode | null }[] = []

  for (let i = 0; i < args.length; i++) {
    const param = info.params[i]
    if (!param) {
      argExprs.push(compileExpr(args[i], a, ws))
      continue
    }
    if (param.isVarParam) {
      // var 参数：用 cell 包装
      const argNode = args[i]
      if (argNode.kind === 'Identifier') {
        const sym = resolveSymbol(argNode, a, ws)
        if (sym && (sym.kind === 'var' || sym.kind === 'param')) {
          const cellVar = a.allocTempLocal(curFuncId, { tag: 'unknown' })
          const valExpr = sym.isVarParam ? syscall('cell.get', [ref(sym.varId)]) : ref(sym.varId)
          out.push(assignStmt(ref(cellVar), syscall('cell.create', [valExpr])))
          argExprs.push(ref(cellVar))
          cellVars.push({ argIdx: i, cellVar, targetIsVar: argNode })
        }
      }
    } else {
      // Pascal value 参数传递是值拷贝语义（ISO 7185），record 类型需深拷贝
      let argExpr = compileExpr(args[i], a, ws)
      if (param.typeInfo.tag === 'rec') {
        argExpr = syscall('rec.copy', [argExpr])
      }
      argExprs.push(argExpr)
    }
  }

  out.push(evalStmt(callExpr(funcId, argExprs)))

  // 写回 var 参数
  for (const cv of cellVars) {
    const sym = resolveSymbol(cv.targetIsVar!, a, ws)
    if (sym && (sym.kind === 'var' || sym.kind === 'param')) {
      const valExpr = syscall('cell.get', [ref(cv.cellVar)])
      if (sym.isVarParam) {
        out.push(evalStmt(syscall('cell.set', [ref(sym.varId), valExpr])))
      } else {
        out.push(assignStmt(ref(sym.varId), valExpr))
      }
    }
  }

  return out
}

// ============================================================
// writeln / write 编译
// ============================================================

function compileWriteln(
  args: ExpressionNode[],
  a: Analysis,
  ws: WithBinding[],
  noNewline: boolean
): JsonCode.Statement[] {
  const out: JsonCode.Statement[] = []

  // 检查第一个参数是否是文件
  let fileExpr: JsonCode.Expr | null = null
  let argStart = 0
  let fileElemTi: TypeInfo | null = null
  if (args.length > 0) {
    const firstTi = a.typeOf(args[0])
    if (firstTi.tag === 'file') {
      fileExpr = compileExpr(args[0], a, ws)
      fileElemTi = firstTi.fileElem ?? null
      argStart = 1
    }
  }
  // 二进制文件（file of byte / file of eight_bits，elem 为 subrange）：
  // write(f, x) 应写入单字节（String.fromCharCode(x & 0xff)），
  // 而非十进制字符串。Knuth TeX 的 DVIFILE: BYTEFILE 即此模式。
  // file of integer（elem.tag === 'i64'）和 text 文件不在此列，仍按文本写入。
  const isBinaryByteFile = fileElemTi !== null && fileElemTi.tag === 'subrange'

  for (let i = argStart; i < args.length; i++) {
    const arg = args[i]
    // 解析 Pascal 写参数格式：x / x:width / x:width:precision
    // parser 把 x:w 解析为 BinaryExpression(operator: ':', left: x, right: w)
    // x:w:p 解析为 BinaryExpression(':', BinaryExpression(':', x, w), p)
    let valueNode: ExpressionNode = arg
    let widthExpr: JsonCode.Expr | null = null
    let precExpr: JsonCode.Expr | null = null
    if (arg.kind === 'BinaryExpression' && (arg as BinaryExpressionNode).operator === ':') {
      const outer = arg as BinaryExpressionNode
      // outer.right 是最外层的 precision（或 width）
      if (
        outer.left.kind === 'BinaryExpression' &&
        (outer.left as BinaryExpressionNode).operator === ':'
      ) {
        // x:width:precision
        const inner = outer.left as BinaryExpressionNode
        valueNode = inner.left
        widthExpr = compileExpr(inner.right, a, ws)
        precExpr = compileExpr(outer.right, a, ws)
      } else {
        // x:width
        valueNode = outer.left
        widthExpr = compileExpr(outer.right, a, ws)
      }
    }

    const ti = a.typeOf(valueNode)
    let valExpr = compileExpr(valueNode, a, ws)
    // 二进制字节文件：把 byte 值转成单字符（String.fromCharCode），
    // 走 io.write.char.file 写入单字节，避免十进制字符串污染 DVI/TFM 等二进制产物。
    if (
      isBinaryByteFile &&
      widthExpr === null &&
      (ti.tag === 'i64' || ti.tag === 'subrange' || ti.tag === 'enum')
    ) {
      valExpr = syscall('cast.i64.to.char', [valExpr])
      out.push(evalStmt(syscall('io.write.char.file', [fileExpr!, valExpr])))
      continue
    }

    const suffix = typeSuffix(ti)

    if (widthExpr !== null) {
      // 带格式化的写入：io.write.{suffix}.fmt [value, width, precision?]
      const fmtArgs = fileExpr
        ? [fileExpr, valExpr, widthExpr, ...(precExpr ? [precExpr] : [])]
        : [valExpr, widthExpr, ...(precExpr ? [precExpr] : [])]
      const key = fileExpr ? `io.write.${suffix}.fmt.file` : `io.write.${suffix}.fmt`
      out.push(evalStmt(syscall(key, fmtArgs)))
    } else {
      const key = fileExpr ? `io.write.${suffix}.file` : `io.write.${suffix}`
      const callArgs = fileExpr ? [fileExpr, valExpr] : [valExpr]
      out.push(evalStmt(syscall(key, callArgs)))
    }
  }

  if (!noNewline) {
    if (fileExpr) {
      out.push(evalStmt(syscall('io.writeln.file', [fileExpr])))
    } else {
      out.push(evalStmt(syscall('io.writeln.eol', [])))
    }
  }

  return out
}

// ============================================================
// readln / read 编译
// ============================================================

function compileReadln(
  args: ExpressionNode[],
  a: Analysis,
  ws: WithBinding[],
  isRead: boolean
): JsonCode.Statement[] {
  const out: JsonCode.Statement[] = []

  // 检查第一个参数是否是文件
  let fileExpr: JsonCode.Expr | null = null
  let argStart = 0
  let fileElemTi: TypeInfo | null = null
  if (args.length > 0) {
    const firstTi = a.typeOf(args[0])
    if (firstTi.tag === 'file') {
      fileExpr = compileExpr(args[0], a, ws)
      fileElemTi = firstTi.fileElem ?? null
      argStart = 1
    }
  }
  // 二进制字节文件（file of byte / file of eight_bits，elem 为 subrange）：
  // read(f, x) 应读取单字节并按 byte 值赋给 x，
  // 而非按十进制 token 解析。Knuth TeX 的 TFMFILE/DVIFILE 即此模式。
  // file of integer（elem.tag === 'i64'）不在此列，仍按文本解析。
  const isBinaryByteFile = fileElemTi !== null && fileElemTi.tag === 'subrange'

  for (let i = argStart; i < args.length; i++) {
    const argNode = args[i]
    if (argNode.kind !== 'Identifier') {
      throw new Error('readln/read: argument must be a variable')
    }
    const sym = resolveSymbol(argNode, a, ws)
    if (!sym || (sym.kind !== 'var' && sym.kind !== 'param')) {
      throw new Error(`readln/read: variable ${argNode.name} not found`)
    }
    const ti = sym.typeInfo
    // 二进制字节文件：read(f, byte) → 读单字符再转 ord（0..255）
    if (isBinaryByteFile && (ti.tag === 'i64' || ti.tag === 'subrange' || ti.tag === 'enum')) {
      const chExpr = syscall('io.read.char.file', [fileExpr!])
      const valExpr = syscall('cast.char.to.i64', [chExpr])
      if (sym.isVarParam) {
        out.push(evalStmt(syscall('cell.set', [ref(sym.varId), valExpr])))
      } else {
        out.push(assignStmt(ref(sym.varId), valExpr))
      }
      continue
    }
    const suffix = typeSuffix(ti)
    const key = fileExpr ? `io.read.${suffix}.file` : `io.read.${suffix}`
    const readArgs = fileExpr ? [fileExpr] : []
    const valExpr = syscall(key, readArgs)

    if (sym.isVarParam) {
      out.push(evalStmt(syscall('cell.set', [ref(sym.varId), valExpr])))
    } else {
      out.push(assignStmt(ref(sym.varId), valExpr))
    }
  }

  // readln 消费换行
  if (!isRead) {
    if (fileExpr) {
      out.push(evalStmt(syscall('io.readln.skip.file', [fileExpr])))
    } else if (argStart < args.length || args.length === 0) {
      out.push(evalStmt(syscall('io.readln.skip', [])))
    }
  }

  return out
}

// ============================================================
// compileExpr → Expr
// ============================================================

export function compileExpr(node: ExpressionNode, a: Analysis, ws: WithBinding[]): JsonCode.Expr {
  switch (node.kind) {
    case 'IntegerLiteral':
      return litInt(node.raw)
    case 'RealLiteral':
      return litReal(node.raw)
    case 'StringLiteral':
      return litStr(node.value)
    case 'CharLiteral':
      return litChar(node.value)
    case 'BooleanLiteral':
      return litBool(node.value)

    case 'Identifier':
      return compileIdentifier(node, a, ws)

    case 'ParenthesizedExpression':
      return compileExpr(node.expression, a, ws)

    case 'BinaryExpression':
      return compileBinary(node, a, ws)

    case 'UnaryExpression':
      return compileUnary(node, a, ws)

    case 'FunctionCall':
      return compileFunctionCall(node, a, ws)

    case 'ArrayAccess':
      return compileArrayAccess(node, a, ws)

    case 'FieldAccess':
      return compileFieldAccess(node, a, ws)

    case 'SetConstructor':
      return compileSetConstructor(node, a, ws)

    case 'InExpression':
      return compileInExpression(node, a, ws)

    default:
      throw new Error(`compileExpr: unknown kind ${(node as ExpressionNode).kind}`)
  }
}

function compileIdentifier(node: IdentifierNode, a: Analysis, ws: WithBinding[]): JsonCode.Expr {
  // with 字段优先：Pascal 标准中 with record do 体内，
  // record 的字段优先于同名外层变量（ISO 7185 6.8.3.10）
  for (let i = ws.length - 1; i >= 0; i--) {
    const binding = ws[i]
    const fname = node.name.toLowerCase()
    if (binding.fields.has(fname)) {
      return syscall('rec.field', [ref(binding.tempVarId), litStr(fname)])
    }
  }

  const sym = resolveSymbol(node, a, ws)

  if (sym?.kind === 'var' || sym?.kind === 'param') {
    if (sym.isVarParam) {
      return syscall('cell.get', [ref(sym.varId)])
    }
    return ref(sym.varId)
  }

  if (sym?.kind === 'const') {
    return { kind: 'literal', key: sym.literal.key, arg: sym.literal.arg }
  }

  // 无参函数调用：Pascal 允许省略括号，parser 把 `getx` 解析为 Identifier。
  // analysis 阶段已查到 sym 是 func，这里生成无参 Call。
  if (sym?.kind === 'func') {
    return callExpr(sym.funcId, [])
  }

  // 内置常量
  const name = node.name.toLowerCase()
  if (name === 'true') return litBool(true)
  if (name === 'false') return litBool(false)
  if (name === 'maxint') return litInt(2147483647)
  if (name === 'nil') return litNull()
  // 内置无参函数（parser 将无括号调用解析为 Identifier）
  if (name === 'eof') return syscall('io.eof', [])
  if (name === 'eoln') return syscall('io.eoln', [])

  throw new Error(`compileIdentifier: undefined identifier ${node.name}`)
}

function compileBinary(node: BinaryExpressionNode, a: Analysis, ws: WithBinding[]): JsonCode.Expr {
  const L = compileExpr(node.left, a, ws)
  const R = compileExpr(node.right, a, ws)
  const lt = a.typeOf(node.left)
  // parser 输出大写 operator（DIV/MOD/AND/OR/NOT），统一转大写比较
  const op = node.operator.toUpperCase()

  // 集合运算
  if (lt.tag === 'set') {
    switch (op) {
      case '+':
        return syscall('set.union', [L, R])
      case '*':
        return syscall('set.intersect', [L, R])
      case '-':
        return syscall('set.diff', [L, R])
      case '=':
        return syscall('set.eq', [L, R])
      case '<>':
        return syscall('set.ne', [L, R])
      case '<=':
        return syscall('set.le', [L, R])
      case '>=':
        return syscall('set.ge', [L, R])
    }
  }

  // 字符串拼接
  if (lt.tag === 'str' && op === '+') {
    return syscall('str.concat', [L, R])
  }

  // 布尔逻辑
  if (op === 'AND') {
    if (lt.tag === 'i64') return syscall('i64.and', [L, R])
    return syscall('bool.and', [L, R])
  }
  if (op === 'OR') {
    if (lt.tag === 'i64') return syscall('i64.or', [L, R])
    return syscall('bool.or', [L, R])
  }

  // 比较
  switch (op) {
    case '=':
      return syscall('cmp.eq', [L, R])
    case '<>':
      return syscall('cmp.ne', [L, R])
    case '<':
      return syscall('cmp.lt', [L, R])
    case '<=':
      return syscall('cmp.le', [L, R])
    case '>':
      return syscall('cmp.gt', [L, R])
    case '>=':
      return syscall('cmp.ge', [L, R])
  }

  // 算术
  const isReal = lt.tag === 'f64' || a.typeOf(node.right).tag === 'f64'
  const prefix = isReal ? 'f64' : 'i64'

  switch (op) {
    case '+':
      return syscall(`${prefix}.add`, [L, R])
    case '-':
      return syscall(`${prefix}.sub`, [L, R])
    case '*':
      return syscall(`${prefix}.mul`, [L, R])
    case '/':
      return syscall('f64.div', [L, R])
    case 'DIV':
      return syscall('i64.div', [L, R])
    case 'MOD':
      return syscall('i64.mod', [L, R])
    default:
      throw new Error(`compileBinary: unknown operator ${op}`)
  }
}

function compileUnary(node: UnaryExpressionNode, a: Analysis, ws: WithBinding[]): JsonCode.Expr {
  const X = compileExpr(node.operand, a, ws)
  const ti = a.typeOf(node.operand)
  // parser 输出大写 operator（NOT），统一转大写比较
  const op = node.operator.toUpperCase()

  if (op === 'NOT') {
    if (ti.tag === 'i64') return syscall('i64.not', [X])
    return syscall('bool.not', [X])
  }
  if (op === '-') {
    return syscall(ti.tag === 'f64' ? 'f64.neg' : 'i64.neg', [X])
  }
  if (op === '+') {
    return X
  }
  throw new Error(`compileUnary: unknown operator ${op}`)
}

function compileFunctionCall(
  node: FunctionCallNode,
  a: Analysis,
  ws: WithBinding[]
): JsonCode.Expr {
  const sym = resolveSymbol(node.name, a, ws)

  // 用户定义函数
  if (sym?.kind === 'func') {
    const args = node.arguments.map((x) => compileExpr(x, a, ws))
    return callExpr(sym.funcId, args)
  }

  // 内置函数
  const name = node.name.name.toLowerCase()
  const args = node.arguments
  const argExprs = args.map((x) => compileExpr(x, a, ws))

  switch (name) {
    case 'abs': {
      const ti = a.typeOf(args[0])
      return syscall(ti.tag === 'f64' ? 'f64.abs' : 'i64.abs', argExprs)
    }
    case 'sqr': {
      const ti = a.typeOf(args[0])
      const prefix = ti.tag === 'f64' ? 'f64' : 'i64'
      return syscall(`${prefix}.mul`, [argExprs[0], argExprs[0]])
    }
    case 'sqrt':
      return syscall('f64.sqrt', argExprs)
    case 'sin':
      return syscall('f64.sin', argExprs)
    case 'cos':
      return syscall('f64.cos', argExprs)
    case 'exp':
      return syscall('f64.exp', argExprs)
    case 'ln':
      return syscall('f64.ln', argExprs)
    case 'arctan':
      return syscall('f64.arctan', argExprs)
    case 'trunc':
      return syscall('cast.f64.to.i64', argExprs)
    case 'round':
      return syscall('cast.f64.to.i64.round', argExprs)
    case 'ord': {
      const ti = a.typeOf(args[0])
      if (ti.tag === 'char') return syscall('cast.char.to.i64', argExprs)
      if (ti.tag === 'bool') return syscall('cast.bool.to.i64', argExprs)
      return argExprs[0] // integer/enum 已经是 i64
    }
    case 'chr':
      return syscall('cast.i64.to.char', argExprs)
    case 'pred': {
      const ti = a.typeOf(args[0])
      // ISO 7185 6.6.6.4: pred(x) = value whose ordinal number is one less than x
      // "error if none" — 对枚举首值/子界下界必须报错
      // char 类型需先转 ord 再运算再转回 char
      if (ti.tag === 'char') {
        return syscall('cast.i64.to.char', [
          syscall('i64.sub', [syscall('cast.char.to.i64', argExprs), litInt(1)]),
        ])
      }
      if (ti.tag === 'enum' && ti.enumCount !== undefined) {
        // 枚举范围 0..enumCount-1，pred 后检查 < 0
        const result = syscall('i64.sub', [argExprs[0], litInt(1)])
        return syscall('range.check', [result, litInt(0), litInt(ti.enumCount - 1)])
      }
      if (ti.tag === 'subrange' && ti.low !== undefined && ti.high !== undefined) {
        const result = syscall('i64.sub', [argExprs[0], litInt(1)])
        return syscall('range.check', [result, litInt(ti.low), litInt(ti.high)])
      }
      const prefix = typeSuffix(ti)
      return syscall(`${prefix}.sub`, [argExprs[0], litInt(1)])
    }
    case 'succ': {
      const ti = a.typeOf(args[0])
      // ISO 7185 6.6.6.4: succ(x) = value whose ordinal number is one greater than x
      // "error if none" — 对枚举末值/子界上界必须报错
      // char 类型需先转 ord 再运算再转回 char
      if (ti.tag === 'char') {
        return syscall('cast.i64.to.char', [
          syscall('i64.add', [syscall('cast.char.to.i64', argExprs), litInt(1)]),
        ])
      }
      if (ti.tag === 'enum' && ti.enumCount !== undefined) {
        // 枚举范围 0..enumCount-1，succ 后检查 > enumCount-1
        const result = syscall('i64.add', [argExprs[0], litInt(1)])
        return syscall('range.check', [result, litInt(0), litInt(ti.enumCount - 1)])
      }
      if (ti.tag === 'subrange' && ti.low !== undefined && ti.high !== undefined) {
        const result = syscall('i64.add', [argExprs[0], litInt(1)])
        return syscall('range.check', [result, litInt(ti.low), litInt(ti.high)])
      }
      const prefix = typeSuffix(ti)
      return syscall(`${prefix}.add`, [argExprs[0], litInt(1)])
    }
    case 'odd':
      return syscall('i64.odd', argExprs)
    case 'length':
      return syscall('str.length', argExprs)
    case 'eof':
      if (args.length > 0) {
        // file of record 用 file.rec.eof（ISO 7185 6.4.3.5）
        if (isRecordFile(a.typeOf(args[0]))) {
          return syscall('file.rec.eof', argExprs)
        }
        return syscall('file.eof', argExprs)
      }
      return syscall('io.eof', [])
    case 'eoln':
      if (args.length > 0) return syscall('file.eoln', argExprs)
      return syscall('io.eoln', [])
    default: {
      // 插件注入的非标函数（AGENTS.md 原则 A.7）
      const found = findFunctionPlugin(a.plugins(), name)
      if (found) {
        return syscall(pluginSyscallKey(found.plugin.name, found.name), argExprs)
      }
      throw new Error(`compileFunctionCall: unknown function ${name}`)
    }
  }
}

function compileArrayAccess(node: ArrayAccessNode, a: Analysis, ws: WithBinding[]): JsonCode.Expr {
  const arr = compileExpr(node.array, a, ws)
  const indices = node.indices.map((i) => {
    const expr = compileExpr(i, a, ws)
    // Pascal CHAR 作为数组索引时，需转成 ord（charCodeAt），
    // 否则 JS 中 arr['A'] 访问属性而非 arr[65]
    const ti = a.typeOf(i)
    if (ti.tag === 'char') {
      return syscall('cast.char.to.i64', [expr])
    }
    return expr
  })
  return syscall('array.get', [arr, ...indices])
}

function compileFieldAccess(node: FieldAccessNode, a: Analysis, ws: WithBinding[]): JsonCode.Expr {
  if (node.field.name === '^') {
    const objType = a.typeOf(node.object)
    if (objType.tag === 'pointer') {
      // ISO 7185 6.5.4: 指针解引用 p^ → cell.get(p)
      return syscall('ptr.deref', [compileExpr(node.object, a, ws)])
    }
    // 文件缓冲区访问 f^
    // 二进制字节文件（file of byte/eight_bits，elem 为 subrange）：f^ 返回 byte 值
    // （0..255 的 integer），而非字符。Knuth TeX 的 TFMFILE^ 即此模式
    // （`LF := TFMFILE^` 后做 `LF > 127` 比较）。
    // file of integer（elem.tag === 'i64'）和 text 文件仍返回字符/文本。
    const peekExpr = syscall('file.peek', [compileExpr(node.object, a, ws)])
    const elemTi = objType.fileElem ?? null
    const isBinaryByteFile = elemTi !== null && elemTi.tag === 'subrange'
    if (isBinaryByteFile) {
      return syscall('cast.char.to.i64', [peekExpr])
    }
    // file of record: f^ 返回记录缓冲区（ISO 7185 6.4.3.5/6.6.5.2）
    if (isRecordFile(objType)) {
      return syscall('file.rec.peek', [compileExpr(node.object, a, ws)])
    }
    return peekExpr
  }
  const obj = compileExpr(node.object, a, ws)
  return syscall('rec.field', [obj, litStr(node.field.name.toLowerCase())])
}

function compileSetConstructor(
  node: SetConstructorNode,
  a: Analysis,
  ws: WithBinding[]
): JsonCode.Expr {
  if (node.elements.length === 0) {
    return syscall('set.empty', [])
  }

  const elems: JsonCode.Expr[] = []
  for (const [start, end] of node.elements) {
    const sExpr = compileExpr(start, a, ws)
    if (end) {
      const eExpr = compileExpr(end, a, ws)
      elems.push(syscall('set.range', [sExpr, eExpr]))
    } else {
      elems.push(syscall('set.elem', [sExpr]))
    }
  }
  return syscall('set.literal', elems)
}

function compileInExpression(
  node: InExpressionNode,
  a: Analysis,
  ws: WithBinding[]
): JsonCode.Expr {
  const L = compileExpr(node.left, a, ws)
  const R = compileExpr(node.right, a, ws)
  return syscall('set.in', [L, R])
}

// ============================================================
// 符号解析（含 with 重写）
// ============================================================

function resolveSymbol(node: IdentifierNode, a: Analysis, ws: WithBinding[]): Symbol | undefined {
  return a.symbolOf(node)
}
