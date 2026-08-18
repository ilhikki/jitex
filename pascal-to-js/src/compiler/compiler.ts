/*
 * IL Compiler — lowering 第二阶段：编译。
 *
 * 纯函数族（namespace Compile）。无 mutable state。
 * 输入：(AST 节点, Analysis, 上下文) → 输出：JsonCode 节点。
 *
 * 唯一可变动作用是调用 analysis.nextId() / allocTempLocal() 拿新 ID，
 * 计数器属于 Analysis，compiler 不自行维护。
 */

import * as JsonCode from './json-code.ts'
import { Analysis, Symbol, TypeInfo } from './analysis.ts'
import {
  ArrayAccessNode,
  AssignmentNode,
  BinaryExpressionNode,
  BlockNode,
  CaseStatementNode,
  CompoundStatementNode,
  ExpressionNode,
  FieldAccessNode,
  ForStatementNode,
  FunctionCallNode,
  GotoStatementNode,
  IdentifierNode,
  IfStatementNode,
  InExpressionNode,
  LabeledStatementNode,
  ProcedureCallNode,
  ProgramNode,
  RepeatStatementNode,
  SetConstructorNode,
  StatementNode,
  UnaryExpressionNode,
  WhileStatementNode,
  WithStatementNode,
} from '../ast/types.ts'

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

function litField(v: string): JsonCode.Literal {
  return { kind: 'literal', key: 'field', arg: v }
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

function syscall(key: SyscallKey, args: JsonCode.Expr[]): JsonCode.Syscall {
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
      if (ti.baseTag === 'bool') {
        return 'bool'
      }
      if (ti.baseTag === 'char') {
        return 'char'
      }
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
const syscallKeys = {
  // mem
  memDefaultArray: 'mem.default.array',
  memDefaultRec: 'mem.default.rec',
  // set
  setEmpty: 'set.empty',
  setUnion: 'set.union',
  setIntersect: 'set.intersect',
  setDiff: 'set.diff',
  setEq: 'set.eq',
  setNe: 'set.ne',
  setLe: 'set.le',
  setGe: 'set.ge',
  setRange: 'set.range',
  setElem: 'set.elem',
  setLiteral: 'set.literal',
  setIn: 'set.in',
  // file
  fileCreate: 'file.create',
  fileReset: 'file.reset',
  fileRewrite: 'file.rewrite',
  fileGet: 'file.get',
  filePut: 'file.put',
  fileEof: 'file.eof',
  fileEoln: 'file.eoln',
  filePeek: 'file.peek',
  fileRecReset: 'file.rec.reset',
  fileRecRewrite: 'file.rec.rewrite',
  fileRecGet: 'file.rec.get',
  fileRecPut: 'file.rec.put',
  fileRecSetbuf: 'file.rec.setbuf',
  fileRecEof: 'file.rec.eof',
  fileRecPeek: 'file.rec.peek',
  // rec
  recCopy: 'rec.copy',
  recSet: 'rec.set',
  recField: 'rec.field',
  // cell / ptr
  cellCreate: 'cell.create',
  cellGet: 'cell.get',
  cellSet: 'cell.set',
  ptrAssign: 'ptr.assign',
  ptrDeref: 'ptr.deref',
  ptrDisposeCheck: 'ptr.dispose.check',
  // array
  arrayGet: 'array.get',
  arraySet: 'array.set',
  // str
  strToCharArray: 'str.to.char.array',
  // range / steps / program
  rangeCheck: 'range.check',
  stepsCheck: 'steps.check',
  programFileUrl: 'program.fileUrl',
  // io
  ioPage: 'io.page',
  ioEof: 'io.eof',
  ioEoln: 'io.eoln',
  ioWritelnFile: 'io.writeln.file',
  ioWritelnEol: 'io.writeln.eol',
  ioReadlnSkipFile: 'io.readln.skip.file',
  ioReadlnSkip: 'io.readln.skip',
  // io.write.${suffix}
  ioWriteI64: 'io.write.i64',
  ioWriteF64: 'io.write.f64',
  ioWriteBool: 'io.write.bool',
  ioWriteChar: 'io.write.char',
  ioWriteStr: 'io.write.str',
  ioWriteSet: 'io.write.set',
  // io.write.${suffix}.file
  ioWriteI64File: 'io.write.i64.file',
  ioWriteF64File: 'io.write.f64.file',
  ioWriteBoolFile: 'io.write.bool.file',
  ioWriteCharFile: 'io.write.char.file',
  ioWriteStrFile: 'io.write.str.file',
  ioWriteSetFile: 'io.write.set.file',
  // io.write.${suffix}.fmt
  ioWriteI64Fmt: 'io.write.i64.fmt',
  ioWriteF64Fmt: 'io.write.f64.fmt',
  ioWriteBoolFmt: 'io.write.bool.fmt',
  ioWriteCharFmt: 'io.write.char.fmt',
  ioWriteStrFmt: 'io.write.str.fmt',
  ioWriteSetFmt: 'io.write.set.fmt',
  // io.write.${suffix}.fmt.file
  ioWriteI64FmtFile: 'io.write.i64.fmt.file',
  ioWriteF64FmtFile: 'io.write.f64.fmt.file',
  ioWriteBoolFmtFile: 'io.write.bool.fmt.file',
  ioWriteCharFmtFile: 'io.write.char.fmt.file',
  ioWriteStrFmtFile: 'io.write.str.fmt.file',
  ioWriteSetFmtFile: 'io.write.set.fmt.file',
  // io.read.${suffix}
  ioReadI64: 'io.read.i64',
  ioReadF64: 'io.read.f64',
  ioReadBool: 'io.read.bool',
  ioReadChar: 'io.read.char',
  ioReadStr: 'io.read.str',
  ioReadSet: 'io.read.set',
  // io.read.${suffix}.file
  ioReadI64File: 'io.read.i64.file',
  ioReadF64File: 'io.read.f64.file',
  ioReadBoolFile: 'io.read.bool.file',
  ioReadCharFile: 'io.read.char.file',
  ioReadStrFile: 'io.read.str.file',
  ioReadSetFile: 'io.read.set.file',
  // cmp
  cmpEq: 'cmp.eq',
  cmpNe: 'cmp.ne',
  cmpLt: 'cmp.lt',
  cmpLe: 'cmp.le',
  cmpGt: 'cmp.gt',
  cmpGe: 'cmp.ge',
  // i64
  i64Add: 'i64.add',
  i64Sub: 'i64.sub',
  i64Mul: 'i64.mul',
  i64Div: 'i64.div',
  i64Mod: 'i64.mod',
  i64And: 'i64.and',
  i64Or: 'i64.or',
  i64Not: 'i64.not',
  i64Neg: 'i64.neg',
  i64Abs: 'i64.abs',
  i64Odd: 'i64.odd',
  // f64
  f64Add: 'f64.add',
  f64Sub: 'f64.sub',
  f64Mul: 'f64.mul',
  f64Div: 'f64.div',
  f64Neg: 'f64.neg',
  f64Abs: 'f64.abs',
  f64Sqrt: 'f64.sqrt',
  f64Sin: 'f64.sin',
  f64Cos: 'f64.cos',
  f64Exp: 'f64.exp',
  f64Ln: 'f64.ln',
  f64Arctan: 'f64.arctan',
  // bool
  boolAnd: 'bool.and',
  boolOr: 'bool.or',
  boolNot: 'bool.not',
  // cast
  castCharToI64: 'cast.char.to.i64',
  castBoolToI64: 'cast.bool.to.i64',
  castI64ToChar: 'cast.i64.to.char',
  castF64ToI64: 'cast.f64.to.i64',
  castF64ToI64Round: 'cast.f64.to.i64.round',
} as const
type SyscallKey = (typeof syscallKeys)[keyof typeof syscallKeys]

// io.write.${suffix}[/file][.fmt] —— suffix 来自 typeSuffix，switch 分派，default 抛异常
function ioWriteSyscall(
  suffix: string,
  file: boolean,
  fmt: boolean,
  args: JsonCode.Expr[],
): JsonCode.Syscall {
  let key: SyscallKey
  switch (suffix) {
    case 'i64':
      key = fmt
        ? (file ? syscallKeys.ioWriteI64FmtFile : syscallKeys.ioWriteI64Fmt)
        : (file ? syscallKeys.ioWriteI64File : syscallKeys.ioWriteI64)
      break
    case 'f64':
      key = fmt
        ? (file ? syscallKeys.ioWriteF64FmtFile : syscallKeys.ioWriteF64Fmt)
        : (file ? syscallKeys.ioWriteF64File : syscallKeys.ioWriteF64)
      break
    case 'bool':
      key = fmt
        ? (file ? syscallKeys.ioWriteBoolFmtFile : syscallKeys.ioWriteBoolFmt)
        : (file ? syscallKeys.ioWriteBoolFile : syscallKeys.ioWriteBool)
      break
    case 'char':
      key = fmt
        ? (file ? syscallKeys.ioWriteCharFmtFile : syscallKeys.ioWriteCharFmt)
        : (file ? syscallKeys.ioWriteCharFile : syscallKeys.ioWriteChar)
      break
    case 'str':
      key = fmt
        ? (file ? syscallKeys.ioWriteStrFmtFile : syscallKeys.ioWriteStrFmt)
        : (file ? syscallKeys.ioWriteStrFile : syscallKeys.ioWriteStr)
      break
    case 'set':
      key = fmt
        ? (file ? syscallKeys.ioWriteSetFmtFile : syscallKeys.ioWriteSetFmt)
        : (file ? syscallKeys.ioWriteSetFile : syscallKeys.ioWriteSet)
      break
    default:
      throw new Error(`ioWriteSyscall: unsupported suffix ${suffix}`)
  }
  return syscall(key, args)
}

// io.read.${suffix}[/file] —— suffix 来自 typeSuffix，switch 分派，default 抛异常
function ioReadSyscall(suffix: string, file: boolean, args: JsonCode.Expr[]): JsonCode.Syscall {
  let key: SyscallKey
  switch (suffix) {
    case 'i64':
      key = file ? syscallKeys.ioReadI64File : syscallKeys.ioReadI64
      break
    case 'f64':
      key = file ? syscallKeys.ioReadF64File : syscallKeys.ioReadF64
      break
    case 'bool':
      key = file ? syscallKeys.ioReadBoolFile : syscallKeys.ioReadBool
      break
    case 'char':
      key = file ? syscallKeys.ioReadCharFile : syscallKeys.ioReadChar
      break
    case 'str':
      key = file ? syscallKeys.ioReadStrFile : syscallKeys.ioReadStr
      break
    case 'set':
      key = file ? syscallKeys.ioReadSetFile : syscallKeys.ioReadSet
      break
    default:
      throw new Error(`ioReadSyscall: unsupported suffix ${suffix}`)
  }
  return syscall(key, args)
}

// pred/succ fallback：${suffix}.sub / .add —— suffix 来自 typeSuffix
function typeSubCall(suffix: string, args: JsonCode.Expr[]): JsonCode.Syscall {
  switch (suffix) {
    case 'i64':
      return syscall(syscallKeys.i64Sub, args)
    case 'f64':
      return syscall(syscallKeys.f64Sub, args)
    default:
      throw new Error(`typeSubCall: unsupported suffix ${suffix}`)
  }
}
function typeAddCall(suffix: string, args: JsonCode.Expr[]): JsonCode.Syscall {
  switch (suffix) {
    case 'i64':
      return syscall(syscallKeys.i64Add, args)
    case 'f64':
      return syscall(syscallKeys.f64Add, args)
    default:
      throw new Error(`typeAddCall: unsupported suffix ${suffix}`)
  }
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
      return syscall(syscallKeys.memDefaultArray, [typeDescLiteral(ti)])
    case 'rec':
      return syscall(syscallKeys.memDefaultRec, [typeDescLiteral(ti)])
    case 'set':
      return syscall(syscallKeys.setEmpty, [])
    case 'file':
      return syscall(syscallKeys.fileCreate, [])
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

/** 序列化的类型描述符（嵌入 JsonCode literal，由 runtime.ts 消费） */
interface TypeDescriptor {
  tag: string
  low?: number
  high?: number
  dims?: Array<{ low: number; high: number }>
  elem?: TypeDescriptor
  fields?: Array<{ name: string; type: TypeDescriptor }>
}

function serializeTypeInfo(ti: TypeInfo): TypeDescriptor {
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
  return compileBlock(program.block, a, program.parameters)
}

// ============================================================
// compileBlock → JsonCode.Function
// ============================================================

function compileBlock(
  block: BlockNode,
  analysis: Analysis,
  programParams?: IdentifierNode[],
): JsonCode.Function {
  const funcId = analysis.funcOfBlock(block)
  const info = analysis.funcInfo(funcId)

  const params = info.params.map((p) => p.varId)
  const locals = info.locals.map((l) => l.varId)
  if (info.retval) {
    locals.push(info.retval.varId)
  }

  // children
  const children: JsonCode.Function[] = []
  for (const p of block.procedureDeclarations) {
    if (p.block) {
      children.push(compileBlock(p.block, analysis))
    } else {
      // FORWARD 声明：空函数
      children.push({
        id: analysis.funcOfDecl(p),
        params: analysis.funcInfo(analysis.funcOfDecl(p)).params.map((x) => x.varId),
        locals: [],
        children: [],
        body: [returnStmt()],
      })
    }
  }
  for (const f of block.functionDeclarations) {
    if (f.block) {
      children.push(compileBlock(f.block, analysis))
    } else {
      children.push({
        id: analysis.funcOfDecl(f),
        params: analysis.funcInfo(analysis.funcOfDecl(f)).params.map((x) => x.varId),
        locals: [],
        children: [],
        body: [returnStmt()],
      })
    }
  }

  // body
  const body: JsonCode.Statement[] = []

  // 变量初始化
  for (const local of info.locals) {
    body.push(assignStmt(ref(local.varId), defaultExpr(local.typeInfo)))
  }
  if (info.retval) {
    body.push(assignStmt(ref(info.retval.varId), defaultExpr(info.retval.typeInfo)))
  }

  // program 头的文件参数初始化（ISO 7185 6.10）：
  // PROGRAM X(INFILE, OUTFILE); 中声明的参数必须在算法开始前绑定到外部文件。
  // 绑定机制是 impl-defined（ISO 6.10）：本工程在运行时用 ctx.programFileUrls
  // 做映射（缺省为恒等映射），通过 program.fileUrl syscall 取 url，
  // 再用 rec.set 直接把 url 写入文件句柄的 .url 字段。
  // （不使用 file.assign —— 那是 Borland 扩展过程，非 ISO 6.6.5.2。）
  if (info.kind === 'program' && programParams && programParams.length > 0) {
    for (const p of programParams) {
      const sym = analysis.globalSymbolOf(p.name)
      if (sym && (sym.kind === 'var' || sym.kind === 'param')) {
        const varSym = sym as { varId: number }
        body.push(
          evalStmt(
            syscall(syscallKeys.programFileUrl, [ref(varSym.varId), litField(p.name)]),
          ),
        )
      }
    }
  }

  // compound 语句
  for (const stmt of compileStmt(block.compound, analysis, funcId, [])) {
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
  }
}

// ============================================================
// compileStmt → Statement[]
// ============================================================

export function compileStmt(
  node: StatementNode,
  a: Analysis,
  funcId: number,
  withStack: WithBinding[],
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
  ws: WithBinding[],
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
  ws: WithBinding[],
): JsonCode.Statement[] {
  // Pascal record 赋值是值拷贝语义（ISO 7185），JS 对象赋值是引用。
  // 若左值类型为 record，用 rec.copy 深拷贝右值，避免别名共享。
  const lvalueType = a.typeOf(node.left)
  const needRecCopy = lvalueType.tag === 'rec'
  let value = compileExpr(node.right, a, ws)
  if (needRecCopy) {
    value = syscall(syscallKeys.recCopy, [value])
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
      value = syscall(syscallKeys.strToCharArray, [litInt(dim.low), litInt(dim.high), value])
    }
  }

  // 简单变量
  if (node.left.kind === 'Identifier') {
    // with 字段优先（ISO 7185 6.8.3.10）
    for (let i = ws.length - 1; i >= 0; i--) {
      const binding = ws[i]
      const fname = node.left.name.toLowerCase()
      if (binding.fields.has(fname)) {
        return [evalStmt(syscall(syscallKeys.recSet, [ref(binding.tempVarId), litField(fname), value]))]
      }
    }

    const sym = resolveSymbol(node.left, a, ws)
    if (sym && (sym.kind === 'var' || sym.kind === 'param')) {
      const ti = sym.typeInfo
      // subrange 运行时边界检查
      const rangeCheck = ti.tag === 'subrange' && ti.low !== undefined && ti.high !== undefined
        ? evalStmt(syscall(syscallKeys.rangeCheck, [ref(sym.varId), litInt(ti.low), litInt(ti.high)]))
        : null
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
    const arrExpr = compileExpr(arr.array, a, ws)
    const idxExprs = arr.indices.map((i) => {
      const expr = compileExpr(i, a, ws)
      const ti = a.typeOf(i)
      if (ti.tag === 'char') {
        return syscall(syscallKeys.castCharToI64, [expr])
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
        const ptrExpr = compileExpr(fa.object, a, ws)
        return [evalStmt(syscall(syscallKeys.ptrAssign, [ptrExpr, value]))]
      }
      // 文件缓冲区赋值 f^ := x → file.put
      // file of record: f^ := r 设置记录缓冲区（ISO 7185 6.4.3.5/6.6.5.2）
      const fExpr = compileExpr(fa.object, a, ws)
      if (isRecordFile(objType)) {
        return [evalStmt(syscall(syscallKeys.fileRecSetbuf, [fExpr, value]))]
      }
      return [evalStmt(syscall(syscallKeys.filePut, [fExpr, value]))]
    }
    const objExpr = compileExpr(fa.object, a, ws)
    return [evalStmt(syscall(syscallKeys.recSet, [objExpr, litField(fa.field.name.toLowerCase()), value]))]
  }

  throw new Error('compileAssignment: unsupported left-hand side')
}

function compileIf(
  node: IfStatementNode,
  a: Analysis,
  funcId: number,
  ws: WithBinding[],
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
  ws: WithBinding[],
): JsonCode.Statement[] {
  const L_top = a.nextId()
  const L_body = a.nextId()
  const L_end = a.nextId()
  const cond = compileExpr(node.condition, a, ws)
  return [
    labelStmt(L_top),
    evalStmt(syscall(syscallKeys.stepsCheck, [])),
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
  ws: WithBinding[],
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
    evalStmt(syscall(syscallKeys.stepsCheck, [])),
    ...bodyStmts,
    jumpIfStmt(cond, L_end, L_top),
    labelStmt(L_end),
  ]
}

function compileFor(
  node: ForStatementNode,
  a: Analysis,
  funcId: number,
  ws: WithBinding[],
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
  const cmpKey = isDown ? syscallKeys.cmpGe : syscallKeys.cmpLe
  const stepKey = isDown ? syscallKeys.i64Sub : syscallKeys.i64Add

  const varRef = varSym.isVarParam ? syscall(syscallKeys.cellGet, [ref(vid)]) : ref(vid)

  return [
    assignStmt(ref(vid), initE),
    assignStmt(ref(limitVar), finalE),
    labelStmt(L_top),
    evalStmt(syscall(syscallKeys.stepsCheck, [])),
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
  ws: WithBinding[],
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
  if (!info) {
    throw new Error(`compileGoto: label ${node.label.value} not declared`)
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

function compileLabeled(
  node: LabeledStatementNode,
  a: Analysis,
  funcId: number,
  ws: WithBinding[],
): JsonCode.Statement[] {
  const info = a.labelInfo(funcId, node.label.value)
  if (!info) {
    throw new Error(`compileLabeled: label ${node.label.value} not declared`)
  }
  return [labelStmt(info.labelId), ...compileStmt(node.statement, a, funcId, ws)]
}

function compileWith(
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
  ws: WithBinding[],
): JsonCode.Statement[] {
  const name = node.name.name.toLowerCase()
  const sym = resolveSymbol(node.name, a, ws)

  // 用户定义过程
  if (sym?.kind === 'func') {
    return compileUserCallStmt(sym.funcId, node.arguments, a, funcId, ws)
  }

  // 额外 callable 注入的过程（AGENTS.md 原则 A.7：注入优先；原生被允许覆盖时也在此命中）
  const extraProc = a.extraCallables()?.get(name)
  if (extraProc?.kind === 'procedure') {
    const args = node.arguments.map((x) => compileExpr(x, a, ws))
    return [evalStmt(syscall(extraProc.sysCallName as SyscallKey, args))]
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
      // ISO 6.6.5.2 reset(f)：1-arg 形式。
      // 若源码写了 reset(f, name) 2-arg 形式（非 ISO），name 参数被编译但
      // runtime 的 file.reset 忽略之（file.url 必须已通过 program-param 绑定）。
      // file of record 走 file.rec.reset（传元素类型描述，用于 reset 后创建默认缓冲区）。
      const resetArgs = node.arguments.map((x) => compileExpr(x, a, ws))
      if (node.arguments.length > 0) {
        const fileType = a.typeOf(node.arguments[0])
        if (isRecordFile(fileType)) {
          const elemTi = fileType.fileElem!
          resetArgs.push(typeDescLiteral(elemTi))
          return [evalStmt(syscall(syscallKeys.fileRecReset, resetArgs))]
        }
      }
      return [evalStmt(syscall(syscallKeys.fileReset, resetArgs))]
    }
    case 'rewrite': {
      // ISO 6.6.5.2 rewrite(f)：1-arg 形式（同 reset 的处理策略）。
      const rewriteArgs = node.arguments.map((x) => compileExpr(x, a, ws))
      if (node.arguments.length > 0) {
        const fileType = a.typeOf(node.arguments[0])
        if (isRecordFile(fileType)) {
          const elemTi = fileType.fileElem!
          rewriteArgs.push(typeDescLiteral(elemTi))
          return [evalStmt(syscall(syscallKeys.fileRecRewrite, rewriteArgs))]
        }
      }
      return [evalStmt(syscall(syscallKeys.fileRewrite, rewriteArgs))]
    }
    case 'get': {
      const getArgs = node.arguments.map((x) => compileExpr(x, a, ws))
      if (node.arguments.length > 0) {
        const fileType = a.typeOf(node.arguments[0])
        if (isRecordFile(fileType)) {
          return [evalStmt(syscall(syscallKeys.fileRecGet, getArgs))]
        }
      }
      return [evalStmt(syscall(syscallKeys.fileGet, getArgs))]
    }
    case 'put': {
      const putArgs = node.arguments.map((x) => compileExpr(x, a, ws))
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
            node.arguments.map((x) => compileExpr(x, a, ws)),
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
      const ptrExpr = compileExpr(argNode, a, ws)
      const checkStmt = evalStmt(syscall(syscallKeys.ptrDisposeCheck, [ptrExpr]))
      if (sym.isVarParam) {
        return [checkStmt, evalStmt(syscall(syscallKeys.cellSet, [ref(sym.varId), litNull()]))]
      }
      return [checkStmt, assignStmt(ref(sym.varId), litNull())]
    }
    default: {
      throw new Error(`compileProcedureCall: unknown procedure ${name}`)
    }
  }
}

function compileUserCallStmt(
  funcId: number,
  args: ExpressionNode[],
  a: Analysis,
  curFuncId: number,
  ws: WithBinding[],
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
          const valExpr = sym.isVarParam ? syscall(syscallKeys.cellGet, [ref(sym.varId)]) : ref(sym.varId)
          out.push(assignStmt(ref(cellVar), syscall(syscallKeys.cellCreate, [valExpr])))
          argExprs.push(ref(cellVar))
          cellVars.push({ argIdx: i, cellVar, targetIsVar: argNode })
        }
      }
    } else {
      // Pascal value 参数传递是值拷贝语义（ISO 7185），record 类型需深拷贝
      let argExpr = compileExpr(args[i], a, ws)
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

// ============================================================
// writeln / write 编译
// ============================================================

function compileWriteln(
  args: ExpressionNode[],
  a: Analysis,
  ws: WithBinding[],
  noNewline: boolean,
): JsonCode.Statement[] {
  const out: JsonCode.Statement[] = []

  // 检查第一个参数是否是文件
  let fileExpr: JsonCode.Expr | null = null
  let argStart = 0
  if (args.length > 0) {
    const firstTi = a.typeOf(args[0])
    if (firstTi.tag === 'file') {
      fileExpr = compileExpr(args[0], a, ws)
      argStart = 1
    }
  }

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
    const valExpr = compileExpr(valueNode, a, ws)
    const suffix = typeSuffix(ti)

    if (widthExpr !== null) {
      // 带格式化的写入：io.write.{suffix}.fmt [value, width, precision?]
      const fmtArgs = fileExpr
        ? [fileExpr, valExpr, widthExpr, ...(precExpr ? [precExpr] : [])]
        : [valExpr, widthExpr, ...(precExpr ? [precExpr] : [])]
      out.push(evalStmt(ioWriteSyscall(suffix, fileExpr !== null, true, fmtArgs)))
    } else {
      const callArgs = fileExpr ? [fileExpr, valExpr] : [valExpr]
      out.push(evalStmt(ioWriteSyscall(suffix, fileExpr !== null, false, callArgs)))
    }
  }

  if (!noNewline) {
    if (fileExpr) {
      out.push(evalStmt(syscall(syscallKeys.ioWritelnFile, [fileExpr])))
    } else {
      out.push(evalStmt(syscall(syscallKeys.ioWritelnEol, [])))
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
  isRead: boolean,
): JsonCode.Statement[] {
  const out: JsonCode.Statement[] = []

  // 检查第一个参数是否是文件
  let fileExpr: JsonCode.Expr | null = null
  let argStart = 0
  if (args.length > 0) {
    const firstTi = a.typeOf(args[0])
    if (firstTi.tag === 'file') {
      fileExpr = compileExpr(args[0], a, ws)
      argStart = 1
    }
  }

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
    const suffix = typeSuffix(ti)
    const readArgs = fileExpr ? [fileExpr] : []
    const valExpr = ioReadSyscall(suffix, fileExpr !== null, readArgs)

    if (sym.isVarParam) {
      out.push(evalStmt(syscall(syscallKeys.cellSet, [ref(sym.varId), valExpr])))
    } else {
      out.push(assignStmt(ref(sym.varId), valExpr))
    }
  }

  // readln 消费换行
  if (!isRead) {
    if (fileExpr) {
      out.push(evalStmt(syscall(syscallKeys.ioReadlnSkipFile, [fileExpr])))
    } else if (argStart < args.length || args.length === 0) {
      out.push(evalStmt(syscall(syscallKeys.ioReadlnSkip, [])))
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
      return syscall(syscallKeys.recField, [ref(binding.tempVarId), litField(fname)])
    }
  }

  const sym = resolveSymbol(node, a, ws)

  if (sym?.kind === 'var' || sym?.kind === 'param') {
    if (sym.isVarParam) {
      return syscall(syscallKeys.cellGet, [ref(sym.varId)])
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
  if (name === 'true') {
    return litBool(true)
  }
  if (name === 'false') {
    return litBool(false)
  }
  if (name === 'maxint') {
    return litInt(2147483647)
  }
  if (name === 'nil') {
    return litNull()
  }
  // 内置无参函数（parser 将无括号调用解析为 Identifier）
  if (name === 'eof') {
    return syscall(syscallKeys.ioEof, [])
  }
  if (name === 'eoln') {
    return syscall(syscallKeys.ioEoln, [])
  }

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
        return syscall(syscallKeys.setUnion, [L, R])
      case '*':
        return syscall(syscallKeys.setIntersect, [L, R])
      case '-':
        return syscall(syscallKeys.setDiff, [L, R])
      case '=':
        return syscall(syscallKeys.setEq, [L, R])
      case '<>':
        return syscall(syscallKeys.setNe, [L, R])
      case '<=':
        return syscall(syscallKeys.setLe, [L, R])
      case '>=':
        return syscall(syscallKeys.setGe, [L, R])
    }
  }

  // 字符串拼接
  if (lt.tag === 'str' && op === '+') {
    throw new Error('concat str is not support')
  }

  // 布尔逻辑
  if (op === 'AND') {
    if (lt.tag === 'i64') {
      return syscall(syscallKeys.i64And, [L, R])
    }
    return syscall(syscallKeys.boolAnd, [L, R])
  }
  if (op === 'OR') {
    if (lt.tag === 'i64') {
      return syscall(syscallKeys.i64Or, [L, R])
    }
    return syscall(syscallKeys.boolOr, [L, R])
  }

  // 比较
  switch (op) {
    case '=':
      return syscall(syscallKeys.cmpEq, [L, R])
    case '<>':
      return syscall(syscallKeys.cmpNe, [L, R])
    case '<':
      return syscall(syscallKeys.cmpLt, [L, R])
    case '<=':
      return syscall(syscallKeys.cmpLe, [L, R])
    case '>':
      return syscall(syscallKeys.cmpGt, [L, R])
    case '>=':
      return syscall(syscallKeys.cmpGe, [L, R])
  }

  // 算术
  const isReal = lt.tag === 'f64' || a.typeOf(node.right).tag === 'f64'

  switch (op) {
    case '+':
      return syscall(isReal ? syscallKeys.f64Add : syscallKeys.i64Add, [L, R])
    case '-':
      return syscall(isReal ? syscallKeys.f64Sub : syscallKeys.i64Sub, [L, R])
    case '*':
      return syscall(isReal ? syscallKeys.f64Mul : syscallKeys.i64Mul, [L, R])
    case '/':
      return syscall(syscallKeys.f64Div, [L, R])
    case 'DIV':
      return syscall(syscallKeys.i64Div, [L, R])
    case 'MOD':
      return syscall(syscallKeys.i64Mod, [L, R])
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
    if (ti.tag === 'i64') {
      return syscall(syscallKeys.i64Not, [X])
    }
    return syscall(syscallKeys.boolNot, [X])
  }
  if (op === '-') {
    return syscall(ti.tag === 'f64' ? syscallKeys.f64Neg : syscallKeys.i64Neg, [X])
  }
  if (op === '+') {
    return X
  }
  throw new Error(`compileUnary: unknown operator ${op}`)
}

function compileFunctionCall(
  node: FunctionCallNode,
  a: Analysis,
  ws: WithBinding[],
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

  // 额外 callable 注入的函数（AGENTS.md 原则 A.7：注入优先；原生被允许覆盖时也在此命中）
  const extraFunc = a.extraCallables()?.get(name)
  if (extraFunc?.kind === 'function') {
    return syscall(extraFunc.sysCallName as SyscallKey, argExprs)
  }

  switch (name) {
    case 'abs': {
      const ti = a.typeOf(args[0])
      return syscall(ti.tag === 'f64' ? syscallKeys.f64Abs : syscallKeys.i64Abs, argExprs)
    }
    case 'sqr': {
      const ti = a.typeOf(args[0])
      return syscall(ti.tag === 'f64' ? syscallKeys.f64Mul : syscallKeys.i64Mul, [argExprs[0], argExprs[0]])
    }
    case 'sqrt':
      return syscall(syscallKeys.f64Sqrt, argExprs)
    case 'sin':
      return syscall(syscallKeys.f64Sin, argExprs)
    case 'cos':
      return syscall(syscallKeys.f64Cos, argExprs)
    case 'exp':
      return syscall(syscallKeys.f64Exp, argExprs)
    case 'ln':
      return syscall(syscallKeys.f64Ln, argExprs)
    case 'arctan':
      return syscall(syscallKeys.f64Arctan, argExprs)
    case 'trunc':
      return syscall(syscallKeys.castF64ToI64, argExprs)
    case 'round':
      return syscall(syscallKeys.castF64ToI64Round, argExprs)
    case 'ord': {
      const ti = a.typeOf(args[0])
      if (ti.tag === 'char') {
        return syscall(syscallKeys.castCharToI64, argExprs)
      }
      if (ti.tag === 'bool') {
        return syscall(syscallKeys.castBoolToI64, argExprs)
      }
      return argExprs[0] // integer/enum 已经是 i64
    }
    case 'chr':
      return syscall(syscallKeys.castI64ToChar, argExprs)
    case 'pred': {
      const ti = a.typeOf(args[0])
      // ISO 7185 6.6.6.4: pred(x) = value whose ordinal number is one less than x
      // "error if none" — 对枚举首值/子界下界必须报错
      // char 类型需先转 ord 再运算再转回 char
      if (ti.tag === 'char') {
        return syscall(syscallKeys.castI64ToChar, [
          syscall(syscallKeys.i64Sub, [syscall(syscallKeys.castCharToI64, argExprs), litInt(1)]),
        ])
      }
      if (ti.tag === 'enum' && ti.enumCount !== undefined) {
        // 枚举范围 0..enumCount-1，pred 后检查 < 0
        const result = syscall(syscallKeys.i64Sub, [argExprs[0], litInt(1)])
        return syscall(syscallKeys.rangeCheck, [result, litInt(0), litInt(ti.enumCount - 1)])
      }
      if (ti.tag === 'subrange' && ti.low !== undefined && ti.high !== undefined) {
        const result = syscall(syscallKeys.i64Sub, [argExprs[0], litInt(1)])
        return syscall(syscallKeys.rangeCheck, [result, litInt(ti.low), litInt(ti.high)])
      }
      return typeSubCall(typeSuffix(ti), [argExprs[0], litInt(1)])
    }
    case 'succ': {
      const ti = a.typeOf(args[0])
      // ISO 7185 6.6.6.4: succ(x) = value whose ordinal number is one greater than x
      // "error if none" — 对枚举末值/子界上界必须报错
      // char 类型需先转 ord 再运算再转回 char
      if (ti.tag === 'char') {
        return syscall(syscallKeys.castI64ToChar, [
          syscall(syscallKeys.i64Add, [syscall(syscallKeys.castCharToI64, argExprs), litInt(1)]),
        ])
      }
      if (ti.tag === 'enum' && ti.enumCount !== undefined) {
        // 枚举范围 0..enumCount-1，succ 后检查 > enumCount-1
        const result = syscall(syscallKeys.i64Add, [argExprs[0], litInt(1)])
        return syscall(syscallKeys.rangeCheck, [result, litInt(0), litInt(ti.enumCount - 1)])
      }
      if (ti.tag === 'subrange' && ti.low !== undefined && ti.high !== undefined) {
        const result = syscall(syscallKeys.i64Add, [argExprs[0], litInt(1)])
        return syscall(syscallKeys.rangeCheck, [result, litInt(ti.low), litInt(ti.high)])
      }
      return typeAddCall(typeSuffix(ti), [argExprs[0], litInt(1)])
    }
    case 'odd':
      return syscall(syscallKeys.i64Odd, argExprs)
    case 'eof':
      if (args.length > 0) {
        // file of record 用 file.rec.eof（ISO 7185 6.4.3.5）
        if (isRecordFile(a.typeOf(args[0]))) {
          return syscall(syscallKeys.fileRecEof, argExprs)
        }
        return syscall(syscallKeys.fileEof, argExprs)
      }
      return syscall(syscallKeys.ioEof, [])
    case 'eoln':
      if (args.length > 0) {
        return syscall(syscallKeys.fileEoln, argExprs)
      }
      return syscall(syscallKeys.ioEoln, [])
    default: {
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
      return syscall(syscallKeys.castCharToI64, [expr])
    }
    return expr
  })
  return syscall(syscallKeys.arrayGet, [arr, ...indices])
}

function compileFieldAccess(node: FieldAccessNode, a: Analysis, ws: WithBinding[]): JsonCode.Expr {
  if (node.field.name === '^') {
    const objType = a.typeOf(node.object)
    if (objType.tag === 'pointer') {
      // ISO 7185 6.5.4: 指针解引用 p^ → cell.get(p)
      return syscall(syscallKeys.ptrDeref, [compileExpr(node.object, a, ws)])
    }
    // 文件缓冲区访问 f^
    // file of record: f^ 返回记录缓冲区（ISO 7185 6.4.3.5/6.6.5.2）
    if (isRecordFile(objType)) {
      return syscall(syscallKeys.fileRecPeek, [compileExpr(node.object, a, ws)])
    }
    return syscall(syscallKeys.filePeek, [compileExpr(node.object, a, ws)])
  }
  const obj = compileExpr(node.object, a, ws)
  return syscall(syscallKeys.recField, [obj, litField(node.field.name.toLowerCase())])
}

function compileSetConstructor(
  node: SetConstructorNode,
  a: Analysis,
  ws: WithBinding[],
): JsonCode.Expr {
  if (node.elements.length === 0) {
    return syscall(syscallKeys.setEmpty, [])
  }

  const elems: JsonCode.Expr[] = []
  for (const [start, end] of node.elements) {
    const sExpr = compileExpr(start, a, ws)
    if (end) {
      const eExpr = compileExpr(end, a, ws)
      elems.push(syscall(syscallKeys.setRange, [sExpr, eExpr]))
    } else {
      elems.push(syscall(syscallKeys.setElem, [sExpr]))
    }
  }
  return syscall(syscallKeys.setLiteral, elems)
}

function compileInExpression(
  node: InExpressionNode,
  a: Analysis,
  ws: WithBinding[],
): JsonCode.Expr {
  const L = compileExpr(node.left, a, ws)
  const R = compileExpr(node.right, a, ws)
  return syscall(syscallKeys.setIn, [L, R])
}

// ============================================================
// 符号解析（含 with 重写）
// ============================================================

function resolveSymbol(node: IdentifierNode, a: Analysis, _ws: WithBinding[]): Symbol | undefined {
  return a.symbolOf(node)
}
