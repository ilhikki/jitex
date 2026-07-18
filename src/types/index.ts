// TypePlugin: 类型插件系统
// 设计原则：每个操作是 { can, toCode, invoke } 三元组，要么全有要么全无

import type {
  PascalValue,
  Ref,
  TypeDef,
  JsonInstruction,
  SourcePos,
} from '../vm/jsoncode'

// ============================================================================
// TypeTable: 类型表（编译时和运行时共用）
// ============================================================================

export interface TypeTable {
  get(id: string): TypeDef | undefined
  has(id: string): boolean
  register(def: TypeDef): void
  all(): TypeDef[]
}

export function createTypeTable(): TypeTable {
  const types = new Map<string, TypeDef>()
  return {
    get(id) {
      return types.get(id)
    },
    has(id) {
      return types.has(id)
    },
    register(def) {
      types.set(def.id, def)
    },
    all() {
      return Array.from(types.values())
    },
  }
}

// ============================================================================
// CodeGenContext: 代码生成上下文
// ============================================================================

export interface CodeGenContext {
  typeTable: TypeTable
  tempCount: number
  sourcePos?: SourcePos
  typeId?: string
}

export function createCodeGenContext(typeTable: TypeTable): CodeGenContext {
  return {
    typeTable,
    tempCount: 0,
  }
}

// ============================================================================
// RuntimeCtx: 运行时上下文
// ============================================================================

import type { PascalIO } from '../vm/file-model'

export interface RuntimeCtx {
  typeTable: TypeTable
  sysCalls: Map<string, SysCallHandler>
  io?: PascalIO
}

export interface SysCallArg {
  ref?: import('../vm/jsoncode').Ref
  value: PascalValue
  // WRITE/WRITELN 参数的格式说明
  width?: number
  precision?: number
}

export type SysCallHandler = (
  args: (PascalValue | SysCallArg)[],
  state: unknown,
  runtime?: RuntimeCtx
) => Promise<PascalValue | void> | PascalValue | void

// ============================================================================
// TypeOp: 类型操作三元组 { can, toCode, invoke }
// ============================================================================

export interface LiteralOp {
  can: (node: unknown, typeTable: TypeTable) => string | null
  toCode: (dest: Ref, node: unknown, ctx: CodeGenContext) => JsonInstruction[]
  invoke: (value: unknown, typeId: string, runtime: RuntimeCtx) => PascalValue
}

export interface AssignOp {
  can: (fromType: string, toType: string, typeTable: TypeTable) => boolean
  toCode: (dest: Ref, src: Ref, ctx: CodeGenContext) => JsonInstruction[]
  invoke: (dest: PascalValue, src: PascalValue, runtime: RuntimeCtx) => PascalValue
}

export interface UnaryOp {
  can: (operandType: string, typeTable: TypeTable) => string | null
  toCode: (dest: Ref, operand: Ref, ctx: CodeGenContext) => JsonInstruction[]
  invoke: (operand: PascalValue, runtime: RuntimeCtx) => PascalValue
}

export interface BinaryOp {
  can: (leftType: string, rightType: string, typeTable: TypeTable) => string | null
  toCode: (dest: Ref, left: Ref, right: Ref, ctx: CodeGenContext) => JsonInstruction[]
  invoke: (left: PascalValue, right: PascalValue, runtime: RuntimeCtx) => PascalValue
}

export interface CompareOp {
  can: (leftType: string, rightType: string, typeTable: TypeTable) => string | null
  toCode: (dest: Ref, left: Ref, right: Ref, op: string, ctx: CodeGenContext) => JsonInstruction[]
  invoke: (left: PascalValue, right: PascalValue, op: string, runtime: RuntimeCtx) => PascalValue
}

export interface IndexOp {
  can: (arrayType: string, indexType: string, typeTable: TypeTable) => string | null
  toCode: (dest: Ref, src: Ref[], ctx: CodeGenContext) => JsonInstruction[]
  invoke: (array: PascalValue, ...indexValues: PascalValue[]) => PascalValue
}

export interface SetIndexOp {
  can: (arrayType: string, indexType: string, valueType: string, typeTable: TypeTable) => boolean
  toCode: (dest: Ref, src: Ref[], ctx: CodeGenContext) => JsonInstruction[]
  invoke: (array: PascalValue, ...args: PascalValue[]) => PascalValue
}

export interface FieldOp {
  can: (recordType: string, fieldName: string, typeTable: TypeTable) => string | null
  toCode: (dest: Ref, record: Ref, fieldName: string, ctx: CodeGenContext) => JsonInstruction[]
  invoke: (record: PascalValue, fieldName: string, runtime: RuntimeCtx) => PascalValue
}

export interface SetFieldOp {
  can: (recordType: string, fieldName: string, valueType: string, typeTable: TypeTable) => boolean
  toCode: (dest: Ref, value: Ref, fieldName: string, ctx: CodeGenContext) => JsonInstruction[]
  invoke: (record: PascalValue, value: PascalValue, fieldName: string, runtime: RuntimeCtx) => PascalValue
}

export interface ControlOp {
  can: (typeId: string, typeTable: TypeTable) => boolean
  toCode: (cond: Ref, ctx: CodeGenContext) => JsonInstruction[]
  invoke: (value: PascalValue, runtime: RuntimeCtx) => boolean
}

export interface DefaultOp {
  can: (typeId: string, typeTable: TypeTable) => boolean
  toCode: (dest: Ref, typeId: string, ctx: CodeGenContext) => JsonInstruction[]
  invoke: (typeId: string, runtime: RuntimeCtx) => PascalValue
}

export interface CopyOp {
  can: (typeId: string, typeTable: TypeTable) => boolean
  toCode: (dest: Ref, src: Ref, ctx: CodeGenContext) => JsonInstruction[]
  invoke: (value: PascalValue, runtime: RuntimeCtx) => PascalValue
}

// ============================================================================
// TypePlugin: 一组类型的操作集合
// ============================================================================

export interface TypeOps {
  literal?: LiteralOp
  assign?: AssignOp
  unary?: Record<string, UnaryOp>
  binary?: Record<string, BinaryOp>
  compare?: Record<string, CompareOp>
  index?: IndexOp
  setIndex?: SetIndexOp
  field?: FieldOp
  setField?: SetFieldOp
  control?: ControlOp
  default?: DefaultOp
  copy?: CopyOp
}

export interface TypePlugin {
  name: string
  version: string
  types: TypeDef[]
  ops: TypeOps
}

// ============================================================================
// 预定义插件导出
// ============================================================================

export { booleanPlugin } from './boolean.plugin'
export { integerPlugin } from './integer.plugin'
export { stringPlugin } from './string.plugin'
export { charPlugin } from './char.plugin'

// ============================================================================
// 辅助函数：获取类型的操作
// ============================================================================

export function getOp(
  typeDef: TypeDef,
  opKind: string,
  opName: string,
  plugins: TypePlugin[]
): { invoke: (...args: any[]) => PascalValue; toCode: (...args: any[]) => JsonInstruction[] } | null {
  for (const plugin of plugins) {
    const ops = plugin.ops as any
    const category = ops[opKind]
    if (!category) continue
    // literal/default/copy/control 是单对象，其他是 Record
    if (opKind === 'literal' || opKind === 'default' || opKind === 'copy' || opKind === 'control' || opKind === 'assign') {
      return category
    }
    if (category[opName]) {
      return category[opName]
    }
  }
  return null
}
