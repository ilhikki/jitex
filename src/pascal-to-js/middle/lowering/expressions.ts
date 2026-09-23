/*
 * IL lowering 表达式编译。
 *
 * Pascal ExpressionNode → JsonCode.Expr。
 * 纯函数族，无 mutable state。
 */

import * as JsonCode from '@/middle/ir/json-code.ts'
import { Analysis, AnalysisSymbol, TypeInfo } from '@/middle/analysis/analysis-type.ts'
import {
  ArrayAccessNode,
  BinaryExpressionNode,
  ExpressionNode,
  FieldAccessNode,
  FunctionCallNode,
  IdentifierNode,
  InExpressionNode,
  SetConstructorNode,
  UnaryExpressionNode,
} from '@/frontend/node.ts'
import {
  AssertionError,
  callExpr,
  litBool,
  litBytes,
  litChar,
  litField,
  litInt,
  litNull,
  litReal,
  ref,
  syscall,
  SyscallKey,
  syscallKeys,
  WithBinding,
} from './helpers.ts'
import { typeDescLiteral } from './type.ts'

// loweringExpr → Expr

export function loweringExpr(node: ExpressionNode, a: Analysis, ws: WithBinding[]): JsonCode.Expr {
  switch (node.kind) {
    case 'IntegerLiteral':
      return litInt(node.raw)
    case 'RealLiteral':
      return litReal(node.raw)
    case 'StringLiteral':
      // ISO 7185 6.1.7: string-literal 的类型是 packed array[1..n] of char → Uint8Array
      return litBytes(node.value)
    case 'CharLiteral':
      return litChar(node.value)
    case 'BooleanLiteral':
      return litBool(node.value)

    case 'Identifier':
      return loweringIdentifier(node, a, ws)

    case 'ParenthesizedExpression':
      return loweringExpr(node.expression, a, ws)

    case 'BinaryExpression':
      return loweringBinary(node, a, ws)

    case 'UnaryExpression':
      return loweringUnary(node, a, ws)

    case 'FunctionCall':
      return loweringFunctionCall(node, a, ws)

    case 'ArrayAccess':
      return loweringArrayAccess(node, a, ws)

    case 'FieldAccess':
      return loweringFieldAccess(node, a, ws)

    case 'SetConstructor':
      return loweringSetConstructor(node, a, ws)

    case 'InExpression':
      return loweringInExpression(node, a, ws)
  }
}

function loweringIdentifier(node: IdentifierNode, a: Analysis, ws: WithBinding[]): JsonCode.Expr {
  // with 字段优先：Pascal 标准中 with record do 体内，
  // record 的字段优先于同名外层变量（ISO 7185 6.8.3.10）
  for (let i = ws.length - 1; i >= 0; i--) {
    const binding = ws[i]
    const fname = node.name.toLowerCase()
    if (binding.fields.has(fname)) {
      return syscall(syscallKeys.recAccess, [
        ref(binding.tempVarId),
        litField(fname),
        typeDescLiteral(binding.typeInfo),
      ])
    }
  }

  const sym = resolveSymbol(node, a, ws)

  // ISO 7185 6.6.3.5：可调用形参在其块内标识实参函数。
  // 无形参表形式出现在 factor 位置即为一次无实参的调用 → 间接调用。
  if (sym?.kind === 'param' && sym.callable) {
    return syscall(syscallKeys.callIndirect, [ref(sym.varId)])
  }

  if (sym?.kind === 'var' || sym?.kind === 'param') {
    if (sym.isVarParam) {
      return syscall(syscallKeys.cellGet, [ref(sym.varId)])
    }
    return ref(sym.varId)
  }

  if (sym?.kind === 'const') {
    // const 字符串字面量 → Uint8Array；char → ord 值；数值 / 布尔直接用字面量
    if (sym.typeInfo.tag === 'array') {
      return litBytes(sym.literal.arg)
    }
    if (sym.typeInfo.tag === 'char') {
      return litInt(sym.literal.arg.charCodeAt(0))
    }
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
  // 内置无参函数（parser 将无括号调用解析为 Identifier）：与带括号形式同一条
  // 机械翻译路径 —— 名字即 key，交给 rewrite
  if (name === 'eof' || name === 'eoln') {
    return syscall(callKey(name), [])
  }

  throw new AssertionError(`loweringIdentifier: undefined identifier ${node.name}`)
}

function loweringBinary(node: BinaryExpressionNode, a: Analysis, ws: WithBinding[]): JsonCode.Expr {
  const L = loweringExpr(node.left, a, ws)
  const R = loweringExpr(node.right, a, ws)
  const lt = a.typeOf(node.left)
  const rt = a.typeOf(node.right)
  // parser 输出大写 operator（DIV/MOD/AND/OR/NOT），统一转大写比较
  const op = node.operator.toUpperCase()

  // 二元运算统一产泛型 key + 两侧类型，由 rewrite 消费 type 分发到具体 runtime.syscall。
  // lowering 不做任何类型判断（集合/整数/实数/布尔的分派全部下沉到 rewrite）。
  const withTypes = (key: SyscallKey): JsonCode.Syscall =>
    syscall(key, [L, typeDescLiteral(lt), R, typeDescLiteral(rt)])

  switch (op) {
    // 算术与集合（+ - * 对数值是加减乘，对集合是并/差/交，由 rewrite 按 type 分发）
    case '+':
      return withTypes(syscallKeys.add)
    case '-':
      return withTypes(syscallKeys.sub)
    case '*':
      return withTypes(syscallKeys.mul)
    // 实数除 / 整除 / 取模（类型固定，无需 type 参数）
    case '/':
      return syscall(syscallKeys.div, [L, R])
    case 'DIV':
      return syscall(syscallKeys.intDiv, [L, R])
    case 'MOD':
      return syscall(syscallKeys.mod, [L, R])
    // 布尔/位运算（integer 为位运算，boolean 为逻辑，由 rewrite 按 type 分发）
    case 'AND':
      return withTypes(syscallKeys.and)
    case 'OR':
      return withTypes(syscallKeys.or)
    // 比较（集合与标量由 rewrite 按 type 分发）
    case '=':
      return withTypes(syscallKeys.eq)
    case '<>':
      return withTypes(syscallKeys.ne)
    case '<':
      return withTypes(syscallKeys.lt)
    case '<=':
      return withTypes(syscallKeys.le)
    case '>':
      return withTypes(syscallKeys.gt)
    case '>=':
      return withTypes(syscallKeys.ge)
    default:
      throw new AssertionError(`loweringBinary: unknown operator ${op}`)
  }
}

function loweringUnary(node: UnaryExpressionNode, a: Analysis, ws: WithBinding[]): JsonCode.Expr {
  const X = loweringExpr(node.operand, a, ws)
  const ti = a.typeOf(node.operand)
  // parser 输出大写 operator（NOT），统一转大写比较
  const op = node.operator.toUpperCase()

  // 一元运算统一产泛型 key + 类型，由 rewrite 按 type 分发
  const withType = (key: SyscallKey): JsonCode.Syscall => syscall(key, [X, typeDescLiteral(ti)])

  if (op === 'NOT') {
    return withType(syscallKeys.not)
  }
  if (op === '-') {
    return withType(syscallKeys.neg)
  }
  if (op === '+') {
    return X
  }
  throw new AssertionError(`loweringUnary: unknown operator ${op}`)
}

// 无本体调用的机械翻译

/** 无本体调用的 key：`lowering.call.<小写名>`（名字只是拼进 key，不做任何判定） */
export function callKey(name: string): SyscallKey {
  return `${syscallKeys.callPrefix}${name.toLowerCase()}` as SyscallKey
}

/**
 * 拆分字段规格语法 `x:w` / `x:w:p`。
 *
 * parser 把它解析为 `:` 二元表达式（`x:w:p` 形如 `(x:w):p`），这里只按 AST 形状
 * 拆成 [值, 宽度, 精度?] —— 纯结构翻译，不含任何语义判断。
 */
function splitWidthSpec(arg: ExpressionNode): ExpressionNode[] | undefined {
  if (arg.kind !== 'BinaryExpression' || (arg as BinaryExpressionNode).operator !== ':') {
    return undefined
  }
  const outer = arg as BinaryExpressionNode
  if (
    outer.left.kind === 'BinaryExpression' &&
    (outer.left as BinaryExpressionNode).operator === ':'
  ) {
    const inner = outer.left as BinaryExpressionNode
    return [inner.left, inner.right, outer.right]
  }
  return [outer.left, outer.right]
}

/**
 * 无本体调用（内置 + 注入）的实参翻译 —— 机械、无判定。
 *
 * 每个实参平铺成 (值, 类型描述)；字段规格 `x:w[:p]` 这类**仅由语法形状**决定的
 * 特殊写法，用一个专用 syscall（lowering.widthspec）表达，整体仍是一个实参。
 *
 * 实参个数、形态与合法性一概不问：全部原样交给 rewrite。
 */
export function loweringCallActuals(
  args: ExpressionNode[],
  a: Analysis,
  ws: WithBinding[],
): JsonCode.Expr[] {
  const out: JsonCode.Expr[] = []
  for (const arg of args) {
    const spec = splitWidthSpec(arg)
    if (spec) {
      out.push(
        syscall(syscallKeys.widthSpec, spec.flatMap((x) => [loweringExpr(x, a, ws), typeDescLiteral(a.typeOf(x))])),
        typeDescLiteral(a.typeOf(arg)),
      )
      continue
    }
    out.push(loweringExpr(arg, a, ws), typeDescLiteral(a.typeOf(arg)))
  }
  return out
}

function loweringFunctionCall(
  node: FunctionCallNode,
  a: Analysis,
  ws: WithBinding[],
): JsonCode.Expr {
  const sym = resolveSymbol(node.name, a, ws)

  // ISO 7185 6.6.3.5：调用可调用形参（形参标识实参函数）→ 间接调用
  if (sym?.kind === 'param' && sym.callable) {
    const args = node.arguments.map((x) => loweringExpr(x, a, ws))
    return syscall(syscallKeys.callIndirect, [ref(sym.varId), ...args])
  }

  // 用户定义函数
  if (sym?.kind === 'func') {
    const info = a.funcInfo(sym.funcId)
    const args = node.arguments.map((x, i) =>
      info.params[i]?.callable ? loweringCallableArgument(x, a, ws) : loweringExpr(x, a, ws)
    )
    return callExpr(sym.funcId, args)
  }

  // 内置函数与注入函数：机械翻译 —— 名字拼进 key，实参与类型描述平铺传递。
  // 名 → 翻译的映射（含实参形态是否合法）全部在 rewrite；注入的 callable 由其
  // sysCallName 在 transform 里自动注册为同 key 的 rewriter，故此处无需区分两者。
  return syscall(callKey(node.name.name), loweringCallActuals(node.arguments, a, ws))
}

function loweringArrayAccess(node: ArrayAccessNode, a: Analysis, ws: WithBinding[]): JsonCode.Expr {
  const arr = loweringExpr(node.array, a, ws)
  const indices = node.indices.map((i) => {
    const expr = loweringExpr(i, a, ws)
    // Pascal CHAR 作为数组索引时，需转成 ord（charCodeAt），
    // 否则 JS 中 arr['A'] 访问属性而非 arr[65]
    const ti = a.typeOf(i)
    if (ti.tag === 'char') {
      return syscall(callKey('ord'), [expr, typeDescLiteral(ti)])
    }
    return expr
  })
  return syscall(syscallKeys.arrayAccess, [
    arr,
    ...indices,
    typeDescLiteral(a.typeOf(node.array)),
  ])
}

/**
 * 解析字段访问对象的类型；analysis 未推断出（unknown）时，
 * 回退用符号表推导（数组元素 / 变量声明的类型）。
 */
function resolveObjType(node: ExpressionNode, a: Analysis, ws: WithBinding[]): TypeInfo {
  const ti = a.typeOf(node)
  if (ti.tag !== 'unknown') {
    return ti
  }
  if (node.kind === 'ArrayAccess') {
    const base = (node as ArrayAccessNode).array
    if (base.kind === 'Identifier') {
      const sym = resolveSymbol(base as IdentifierNode, a, ws)
      if (sym && (sym.kind === 'var' || sym.kind === 'param') && sym.typeInfo.elem) {
        return sym.typeInfo.elem
      }
    }
    const inner = resolveObjType(base, a, ws)
    if (inner.elem) {
      return inner.elem
    }
  }
  return ti
}

function loweringFieldAccess(node: FieldAccessNode, a: Analysis, ws: WithBinding[]): JsonCode.Expr {
  const objType = resolveObjType(node.object, a, ws)
  const obj = loweringExpr(node.object, a, ws)
  if (node.field.name === '^') {
    if (objType.tag === 'pointer') {
      // ISO 7185 6.5.4: 指针解引用 p^
      return syscall(syscallKeys.ptrDeref, [obj])
    }
    // 文件缓冲区访问 f^（text / record 由句柄类型决定）
    return syscall(syscallKeys.filePeek, [obj, typeDescLiteral(objType)])
  }
  return syscall(syscallKeys.recAccess, [
    obj,
    litField(node.field.name.toLowerCase()),
    typeDescLiteral(objType),
  ])
}

function loweringSetConstructor(
  node: SetConstructorNode,
  a: Analysis,
  ws: WithBinding[],
): JsonCode.Expr {
  const td = typeDescLiteral(a.typeOf(node))
  if (node.elements.length === 0) {
    return syscall(syscallKeys.setEmpty, [td])
  }

  const elems: JsonCode.Expr[] = []
  for (const [start, end] of node.elements) {
    const sExpr = loweringExpr(start, a, ws)
    if (end) {
      const eExpr = loweringExpr(end, a, ws)
      elems.push(syscall(syscallKeys.setRange, [sExpr, eExpr, td]))
    } else {
      elems.push(syscall(syscallKeys.setElem, [sExpr, td]))
    }
  }
  return syscall(syscallKeys.setLiteral, [...elems, td])
}

function loweringInExpression(
  node: InExpressionNode,
  a: Analysis,
  ws: WithBinding[],
): JsonCode.Expr {
  const L = loweringExpr(node.left, a, ws)
  const R = loweringExpr(node.right, a, ws)
  // in 运算：带两侧类型，由 rewrite 按 type 分发到 set.in
  return syscall(syscallKeys.in, [
    L,
    typeDescLiteral(a.typeOf(node.left)),
    R,
    typeDescLiteral(a.typeOf(node.right)),
  ])
}

// 符号解析（含 with 重写）

export function resolveSymbol(node: IdentifierNode, a: Analysis, _ws: WithBinding[]): AnalysisSymbol | undefined {
  return a.symbolOf(node)
}

/**
 * 求可调用形参实参所标识的函数值（ISO 7185 6.6.3.4/6.6.3.5）。
 *
 * 编译产物中的函数是普通 JS 函数声明，其名字即函数值；实参函数对其外层
 * 过程变量的访问由 JS 闭包保持，故直接传函数引用（而非另造转发闭包）即可。
 */
export function loweringCallableArgument(
  arg: ExpressionNode,
  a: Analysis,
  ws: WithBinding[],
): JsonCode.Expr {
  if (arg.kind !== 'Identifier') {
    throw new AssertionError('loweringCallableArgument: actual callable parameter must be an identifier')
  }
  const sym = resolveSymbol(arg, a, ws)
  if (sym?.kind === 'func') {
    return ref(sym.funcId)
  }
  // 形参本身作另一形参的实参（链式传递）：直接传槽位中已有的函数值
  if (sym?.kind === 'param' && sym.callable) {
    return ref(sym.varId)
  }
  throw new AssertionError(`loweringCallableArgument: '${arg.name}' is not a procedure/function identifier`)
}
