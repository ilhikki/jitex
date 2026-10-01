import {
  BlockNode,
  ExpressionNode,
  FunctionDeclarationNode,
  IdentifierNode,
  ProcedureDeclarationNode,
  TypeNode,
  WithStatementNode,
} from '@/frontend/node.ts'

export type TypeTag =
  | 'integer'
  | 'real'
  | 'boolean'
  | 'char'
  | 'array'
  | 'record'
  | 'set'
  | 'file'
  | 'enum'
  | 'subrange'
  | 'pointer'
  | 'nil'
  | 'unknown'
  | 'procedure'

export interface TypeInfo {
  tag: TypeTag

  low?: number
  high?: number
  baseTag?: TypeTag

  dims?: { low: number; high: number }[]
  elem?: TypeInfo

  fields?: Map<string, TypeInfo>

  variant?: VariantPartInfo

  setBase?: TypeInfo

  enumCount?: number

  domainType?: TypeInfo
}

export interface VariantPartInfo {
  tagName?: string
  branches: VariantBranchInfo[]
}

export interface VariantBranchInfo {
  labels: number[]

  fields: Map<string, TypeInfo>

  nested?: VariantPartInfo
}

export interface VarSymbol {
  kind: 'var' | 'param'
  varId: number
  typeInfo: TypeInfo
  isVarParam: boolean

  callable?: CallableParamInfo
}

export interface CallableParamInfo {
  kind: 'procedure' | 'function'

  params: CallableParamSig[]

  retTypeInfo?: TypeInfo
}

export interface CallableParamSig {
  isVar: boolean
  typeInfo: TypeInfo
}

export interface FuncSymbol {
  kind: 'func'
  funcId: number
  retTypeInfo?: TypeInfo
}

export interface LiteralValue {
  key: string
  arg: string
  typeInfo: TypeInfo
}

export interface ConstSymbol {
  kind: 'const'
  literal: LiteralValue
  typeInfo: TypeInfo
}

export interface TypeSymbol {
  kind: 'type'
  typeInfo: TypeInfo
}

export type AnalysisSymbol = VarSymbol | FuncSymbol | ConstSymbol | TypeSymbol

export type FuncKind = 'function' | 'procedure' | 'program'

export interface FuncInfo {
  funcId: number
  parentFuncId: number | undefined
  params: VarSymbol[]
  locals: VarSymbol[]
  retval?: VarSymbol
  children: number[]
  hasBody: boolean
  kind: FuncKind
}

export interface ExtraCallable {
  sysCallName: string

  kind: 'function' | 'procedure'

  allowOverrideNative?: boolean | undefined
}

export const BUILTIN_PROCEDURES = new Set([
  'writeln',
  'write',
  'readln',
  'read',
  'reset',
  'rewrite',
  'get',
  'put',
  'page',
  'new',
  'dispose',
  'pack',
  'unpack',
])

export const BUILTIN_FUNCTIONS = new Set([
  'abs',
  'sqr',
  'sqrt',
  'sin',
  'cos',
  'exp',
  'ln',
  'arctan',
  'trunc',
  'round',
  'ord',
  'chr',
  'pred',
  'succ',
  'odd',
  'eof',
  'eoln',
])

export const BUILTIN_IDENTIFIERS = new Set(['maxint', 'nil', 'eof', 'eoln'])

export type BuiltinReturnTypeRule =
  | { kind: 'fixed'; type: TypeInfo }
  | { kind: 'sameAsFirstArg' }

export const BUILTIN_FUNCTION_RETURN_TYPES: Record<string, BuiltinReturnTypeRule> = {
  abs: { kind: 'sameAsFirstArg' },
  sqr: { kind: 'sameAsFirstArg' },
  pred: { kind: 'sameAsFirstArg' },
  succ: { kind: 'sameAsFirstArg' },
  sqrt: { kind: 'fixed', type: { tag: 'real' } },
  sin: { kind: 'fixed', type: { tag: 'real' } },
  cos: { kind: 'fixed', type: { tag: 'real' } },
  exp: { kind: 'fixed', type: { tag: 'real' } },
  ln: { kind: 'fixed', type: { tag: 'real' } },
  arctan: { kind: 'fixed', type: { tag: 'real' } },
  trunc: { kind: 'fixed', type: { tag: 'integer' } },
  round: { kind: 'fixed', type: { tag: 'integer' } },
  ord: { kind: 'fixed', type: { tag: 'integer' } },
  chr: { kind: 'fixed', type: { tag: 'char' } },
  odd: { kind: 'fixed', type: { tag: 'boolean' } },
  eof: { kind: 'fixed', type: { tag: 'boolean' } },
  eoln: { kind: 'fixed', type: { tag: 'boolean' } },
}

export const BUILTIN_IDENTIFIER_TYPES: Record<string, TypeInfo> = {
  eof: { tag: 'boolean' },
  eoln: { tag: 'boolean' },

  nil: { tag: 'nil' },
}

export const SIMPLE_TYPES: Record<string, TypeInfo> = {
  integer: { tag: 'integer' },
  real: { tag: 'real' },
  boolean: { tag: 'boolean' },
  char: { tag: 'char' },
  text: { tag: 'file', elem: { tag: 'char' } },
}

export function evalConstInt(
  node: ExpressionNode,
  lookup: (name: string) => AnalysisSymbol | undefined,
): number | undefined {
  switch (node.kind) {
    case 'IntegerLiteral':
      return node.value
    case 'CharLiteral':
      return node.value.charCodeAt(0)
    case 'BooleanLiteral':
      return node.value ? 1 : 0
    case 'BinaryExpression': {
      const l = evalConstInt(node.left, lookup)
      const r = evalConstInt(node.right, lookup)
      if (l === undefined || r === undefined) {
        return undefined
      }
      switch (node.operator) {
        case '+':
          return l + r
        case '-':
          return l - r
        case '*':
          return l * r
        case 'div':
          return Math.trunc(l / r)
        case 'mod':
          return l % r
        default:
          return undefined
      }
    }
    case 'UnaryExpression': {
      const v = evalConstInt(node.operand, lookup)
      if (v === undefined) {
        return undefined
      }
      if (node.operator === '-') {
        return -v
      }
      return v
    }
    case 'Identifier': {
      const sym = lookup(node.name)

      if (sym?.kind === 'const' && sym.literal.key === 'number' && sym.typeInfo.tag !== 'real') {
        return parseInt(sym.literal.arg, 10)
      }
      return undefined
    }
    default:
      return undefined
  }
}

export function evalConstChar(node: ExpressionNode): string | undefined {
  if (node.kind === 'CharLiteral') {
    return node.value
  }
  if (node.kind === 'StringLiteral' && node.value.length === 1) {
    return node.value
  }
  return undefined
}

export function evalLiteral(
  node: ExpressionNode,
): LiteralValue | undefined {
  switch (node.kind) {
    case 'IntegerLiteral':
      return { key: 'number', arg: node.raw, typeInfo: { tag: 'integer' } }
    case 'RealLiteral':
      return { key: 'number', arg: node.raw, typeInfo: { tag: 'real' } }
    case 'StringLiteral':
      return {
        key: 'string',
        arg: node.value,
        typeInfo: {
          tag: 'array',
          dims: [{ low: 1, high: node.value.length }],
          elem: { tag: 'char' },
        },
      }
    case 'CharLiteral':
      return { key: 'string', arg: node.value, typeInfo: { tag: 'char' } }
    case 'BooleanLiteral':
      return { key: 'number', arg: node.value ? '1' : '0', typeInfo: { tag: 'boolean' } }
    default:
      return undefined
  }
}

export interface Analysis {
  nextId(): number
  allocTempLocal(funcId: number, typeInfo: TypeInfo): number
  symbolOf(node: IdentifierNode): AnalysisSymbol | undefined
  labelInfo(funcId: number, labelNum: number): { labelId: number; funcId: number } | undefined

  labelUseFuncOf(labelId: number): number | undefined
  funcOfBlock(block: BlockNode): number
  funcOfDecl(decl: ProcedureDeclarationNode | FunctionDeclarationNode): number
  funcInfo(funcId: number): FuncInfo
  withTempsOf(node: WithStatementNode): VarSymbol[]
  typeOf(node: ExpressionNode): TypeInfo
  typeTagOfTypeNode(node: TypeNode): TypeInfo
  evalConstInt(node: ExpressionNode): number | undefined
  globalSymbolOf(name: string): AnalysisSymbol | undefined

  debugNames(): Map<number, string>

  debug(): boolean

  extraCallables(): Map<string, ExtraCallable> | undefined
}
