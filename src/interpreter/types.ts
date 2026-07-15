import type {
  ProgramNode,
  ProcedureDeclarationNode,
  FunctionDeclarationNode,
  VariableDeclarationNode,
  ConstDeclarationNode,
  TypeDeclarationNode,
  StatementNode,
  BlockNode,
  LabelDeclarationNode,
  TypeNode,
} from '../ast/types'

import type { PascalValue, PascalType } from './types/pascal-value'
export { PascalValue, PascalType } from './types/pascal-value'
export * from './types/pascal-value'
import type { PascalIO } from './io'
import { createDefaultIO } from './io'
import {
  makeDefaultValue,
  findType,
  registerType,
  INTEGER_TYPE,
  SubrangeType,
  ArrayType,
  RecordType,
  FileType,
} from './types/pascal-value'
import type {
  SimpleTypeNode,
  RangeTypeNode,
  ArrayTypeNode,
  RecordTypeNode,
  FileTypeNode,
  IntegerLiteralNode,
  IdentifierNode,
  BinaryExpressionNode,
  UnaryExpressionNode,
  ExpressionNode,
} from '../ast/types'

// ============================================================================
// Scope
// ============================================================================

export interface Scope {
  variables: Map<string, PascalValue>
  variableTypes: Map<string, PascalType>
  parent: Scope | null
  functionDecl: ProcedureDeclarationNode | FunctionDeclarationNode | null
}

export function createScope(
  parent: Scope | null = null,
  functionDecl: ProcedureDeclarationNode | FunctionDeclarationNode | null = null
): Scope {
  return {
    variables: new Map(),
    variableTypes: new Map(),
    parent,
    functionDecl,
  }
}

// ============================================================================
// DeclarationTable
// ============================================================================

export interface DeclarationTable {
  // Global declarations
  procedures: Map<string, ProcedureDeclarationNode>
  functions: Map<string, FunctionDeclarationNode>
  variables: Map<string, VariableDeclarationNode>
  constants: Map<string, ConstDeclarationNode>
  types: Map<string, TypeDeclarationNode>
  labels: Map<number, StatementNode>

  // Nested declaration lookup: search scope chain for procedures/functions
  findProcedure: (name: string, scope: Scope) => ProcedureDeclarationNode | null
  findFunction: (name: string, scope: Scope) => FunctionDeclarationNode | null
  findLabel: (value: number, scope: Scope) => StatementNode | null
}

// ============================================================================
// Frame
// ============================================================================

export interface Frame {
  kind: string
  done: boolean
  step: (state: State) => void
  hasTag?(label: number): boolean
  gotoTag?(label: number, state: State): void
}

// ============================================================================
// RunMode
// ============================================================================

export type RunMode = 'STEP_INTO' | 'STEP_OVER' | 'RUN'

// ============================================================================
// State
// ============================================================================

export interface State {
  stack: Frame[]
  globalScope: Scope
  currentScope: Scope
  program: ProgramNode
  declarations: DeclarationTable
  status: 'running' | 'terminated'
  returnValue: PascalValue | null

  outputBuffer: string[]
  inputQueue: string[]

  /** 系统过程：优先查找用户定义，未命中则回退到系统过程 */
  systemProcedures: Map<string, (args: ExpressionNode[], state: State) => void>
  /** 系统函数：优先查找用户定义，未命中则回退到系统函数 */
  systemFunctions: Map<string, (args: ExpressionNode[], scope: Scope, state: State) => PascalValue>

  /** 运行时 IO 层：文件操作 + 控制台 IO */
  io: PascalIO
}

// ============================================================================
// Helpers
// ============================================================================

export function resolveType(typeNode: TypeNode | null, state: State): PascalType {
  if (!typeNode) return INTEGER_TYPE

  switch (typeNode.kind) {
    case 'SimpleType': {
      const name = (typeNode as SimpleTypeNode).name.name.toUpperCase()
      const builtin = findType(name)
      if (builtin) return builtin

      // 用户定义的类型（如 ASCIICODE）
      const typeDecl = state.declarations.types.get(name)
      if (typeDecl) {
        const resolved = resolveType(typeDecl.typeDef, state)
        registerType(name, resolved)
        return resolved
      }

      return INTEGER_TYPE
    }

    case 'RangeType': {
      const sub = typeNode as RangeTypeNode
      const low = evaluateConstExpr(sub.start, state)
      const high = evaluateConstExpr(sub.end, state)
      return new SubrangeType(`${low}..${high}`, INTEGER_TYPE, low, high)
    }

    case 'ArrayType': {
      const arr = typeNode as ArrayTypeNode
      const elementType = resolveType(arr.elementType, state)
      const dimensions = arr.indexTypes.map(idx => arrayDimension(idx, state))
      return new ArrayType(`ARRAY`, elementType, dimensions)
    }

    case 'RecordType': {
      const rec = typeNode as RecordTypeNode
      const fields: { name: string; type: PascalType }[] = []
      for (const fieldDecl of rec.fields) {
        const fieldType = resolveType(fieldDecl.type, state)
        for (const nameNode of fieldDecl.names) {
          fields.push({ name: nameNode.name, type: fieldType })
        }
      }
      return new RecordType(`RECORD`, fields)
    }

    case 'FileType': {
      const file = typeNode as FileTypeNode
      const elementType = file.elementType ? resolveType(file.elementType, state) : null
      return new FileType(`FILE`, elementType)
    }

    default:
      return INTEGER_TYPE
  }
}

function arrayDimension(idx: TypeNode, state: State): { low: number; high: number } {
  if (idx.kind === 'RangeType') {
    const sub = idx as RangeTypeNode
    return {
      low: evaluateConstExpr(sub.start, state),
      high: evaluateConstExpr(sub.end, state),
    }
  }

  if (idx.kind === 'SimpleType') {
    const resolved = resolveType(idx, state)
    if (resolved.kind === 'subrange') {
      const sub = resolved as SubrangeType
      return { low: sub.min, high: sub.max }
    }
    if (resolved.kind === 'char') {
      return { low: 0, high: 255 }
    }
  }

  return { low: 0, high: 0 }
}

export function evaluateConstExpr(expr: ExpressionNode, state: State): number {
  switch (expr.kind) {
    case 'IntegerLiteral':
      return (expr as IntegerLiteralNode).value

    case 'Identifier': {
      const name = (expr as IdentifierNode).name.toUpperCase()
      const value = state.globalScope.variables.get(name)
      if (value) {
        const raw = value.rawValue
        return typeof raw === 'bigint' ? Number(raw) : raw as number
      }
      throw new Error(`Unknown constant: ${name}`)
    }

    case 'BinaryExpression': {
      const bin = expr as BinaryExpressionNode
      const left = evaluateConstExpr(bin.left, state)
      const right = evaluateConstExpr(bin.right, state)
      switch (bin.operator.toUpperCase()) {
        case '+': return left + right
        case '-': return left - right
        case '*': return left * right
        case 'DIV': return Math.trunc(left / right)
        case '/': return Math.trunc(left / right)
        case 'MOD': return left - Math.trunc(left / right) * right
        default: throw new Error(`Unsupported constant operator: ${bin.operator}`)
      }
    }

    case 'UnaryExpression': {
      const unary = expr as UnaryExpressionNode
      const val = evaluateConstExpr(unary.operand, state)
      switch (unary.operator.toUpperCase()) {
        case '+': return val
        case '-': return -val
        default: throw new Error(`Unsupported constant unary operator: ${unary.operator}`)
      }
    }

    default:
      throw new Error(`Unsupported constant expression: ${expr.kind}`)
  }
}

export function stackTrace(state: State): string[] {
  const trace: string[] = []
  for (let i = state.stack.length - 1; i >= 0; i--) {
    const frame = state.stack[i]
    if (frame.kind === 'Function') {
      const fnFrame = frame as any
      if (fnFrame.decl) {
        trace.push(fnFrame.decl.name.name)
      }
    }
  }
  return trace
}

export function createDeclarations(block: BlockNode, parentScope: Scope): DeclarationTable {
  const procedures = new Map<string, ProcedureDeclarationNode>()
  const functions = new Map<string, FunctionDeclarationNode>()
  const variables = new Map<string, VariableDeclarationNode>()
  const constants = new Map<string, ConstDeclarationNode>()
  const types = new Map<string, TypeDeclarationNode>()
  const labels = new Map<number, StatementNode>()

  // Collect block-level declarations
  block.procedureDeclarations.forEach(p => {
    if (!p.isForward) procedures.set(p.name.name.toUpperCase(), p)
  })
  block.functionDeclarations.forEach(f => {
    if (!f.isForward) functions.set(f.name.name.toUpperCase(), f)
  })
  block.variableDeclarations.forEach(v => {
    v.names.forEach(n => variables.set(n.name.toUpperCase(), v))
  })
  block.constDeclarations.forEach(c => {
    constants.set(c.name.name.toUpperCase(), c)
  })
  block.typeDeclarations.forEach(t => {
    types.set(t.name.name.toUpperCase(), t)
  })

  // Collect labels from compound statement
  collectLabels(block.compound, labels)

  return {
    procedures,
    functions,
    variables,
    constants,
    types,
    labels,
    findProcedure: (name: string, scope: Scope) => {
      const upper = name.toUpperCase()
      // Search up the scope chain
      let s: Scope | null = scope
      while (s) {
        if (s.functionDecl) {
          const block = s.functionDecl.block
          if (block) {
            for (const p of block.procedureDeclarations) {
              if (p.name.name.toUpperCase() === upper) return p
            }
          }
        }
        s = s.parent
      }
      // Fall back to global
      return procedures.get(upper) || null
    },
    findFunction: (name: string, scope: Scope) => {
      const upper = name.toUpperCase()
      let s: Scope | null = scope
      while (s) {
        if (s.functionDecl) {
          const block = s.functionDecl.block
          if (block) {
            for (const f of block.functionDeclarations) {
              if (f.name.name.toUpperCase() === upper) return f
            }
          }
        }
        s = s.parent
      }
      return functions.get(upper) || null
    },
    findLabel: (value: number, scope: Scope) => {
      // Pascal GOTO is intra-procedural: only search the current function/program block
      if (scope.functionDecl) {
        return findLabelInBlock(scope.functionDecl.block, value)
      }
      // At global scope, search program block
      return findLabelInBlock(block, value)
    },
  }
}

function collectLabels(stmt: StatementNode, labels: Map<number, StatementNode>): void {
  switch (stmt.kind) {
    case 'LabeledStatement': {
      const ls = stmt as any
      labels.set(ls.label.value, ls.statement)
      collectLabels(ls.statement, labels)
      break
    }
    case 'CompoundStatement': {
      for (const s of (stmt as any).statements) collectLabels(s, labels)
      break
    }
    case 'IfStatement': {
      const s = stmt as any
      collectLabels(s.thenBranch, labels)
      if (s.elseBranch) collectLabels(s.elseBranch, labels)
      break
    }
    case 'WhileStatement':
      collectLabels((stmt as any).body, labels)
      break
    case 'RepeatStatement': {
      for (const s of (stmt as any).statements) collectLabels(s, labels)
      break
    }
    case 'ForStatement':
      collectLabels((stmt as any).body, labels)
      break
    case 'CaseStatement': {
      const s = stmt as any
      for (const b of s.branches) collectLabels(b.statement, labels)
      if (s.otherwise) collectLabels(s.otherwise, labels)
      break
    }
    case 'WithStatement':
      collectLabels((stmt as any).body, labels)
      break
    default:
      break
  }
}

function findLabelInBlock(block: BlockNode | null, value: number): StatementNode | null {
  if (!block) return null
  const labels = new Map<number, StatementNode>()
  collectLabels(block.compound, labels)
  return labels.get(value) || null
}

// ============================================================================
// State factory
// ============================================================================

export function createState(program: ProgramNode): State {
  const globalScope = createScope(null, null)
  const declarations = createDeclarations(program.block, globalScope)

  const state: State = {
    stack: [],
    globalScope,
    currentScope: globalScope,
    program,
    declarations,
    status: 'running',
    returnValue: null,
    outputBuffer: [],
    inputQueue: [],
    systemProcedures: new Map(),
    systemFunctions: new Map(),
    io: createDefaultIO(),
  }

  // 先求值常量，供类型解析使用
  program.block.constDeclarations.forEach((c: ConstDeclarationNode) => {
    const value = evaluateConstExpr(c.value, state)
    globalScope.variables.set(c.name.name.toUpperCase(), { type: INTEGER_TYPE, rawValue: value })
    globalScope.variableTypes.set(c.name.name.toUpperCase(), INTEGER_TYPE)
  })

  // 注册用户定义类型
  program.block.typeDeclarations.forEach((t: TypeDeclarationNode) => {
    const resolved = resolveType(t.typeDef, state)
    registerType(t.name.name.toUpperCase(), resolved)
  })

  // 初始化变量
  program.block.variableDeclarations.forEach(v => {
    const varType = resolveType(v.type, state)
    v.names.forEach(n => {
      globalScope.variables.set(n.name.toUpperCase(), makeDefaultValue(varType))
      globalScope.variableTypes.set(n.name.toUpperCase(), varType)
    })
  })

  return state
}
