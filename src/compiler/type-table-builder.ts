import type {
  ArrayTypeNode,
  BinaryExpressionNode,
  BlockNode,
  BooleanLiteralNode,
  CharLiteralNode,
  ConstDeclarationNode,
  EnumerationTypeNode,
  ExpressionNode,
  FunctionDeclarationNode,
  IdentifierNode,
  IntegerLiteralNode,
  ParameterDeclarationNode,
  ProcedureDeclarationNode,
  ProgramNode,
  RangeTypeNode,
  RecordTypeNode,
  SetTypeNode,
  SimpleTypeNode,
  TypeDeclarationNode,
  TypeNode,
  UnaryExpressionNode,
  VariableDeclarationNode,
} from '@/ast/types'
import type {
  ArrayType,
  EnumType,
  FileType,
  RecordType,
  SetType,
  SubrangeType,
  TypeDef,
  TypeTable,
} from '@/types'
import {
  BOOLEAN_TYPE,
  CHAR_TYPE,
  createTypeTable,
  INTEGER_TYPE,
  REAL_TYPE,
  TEXT_TYPE,
} from '@/types'

interface Scope {
  types: Map<string, string>
  constInts: Map<string, number>
  parent: Scope | null
}

function createScope(parent: Scope | null = null): Scope {
  return {
    types: new Map(),
    constInts: new Map(),
    parent,
  }
}

function lookupType(scope: Scope, name: string): string | null {
  const upper = name.toUpperCase()
  let s: Scope | null = scope
  while (s) {
    const t = s.types.get(upper)
    if (t) return t
    s = s.parent
  }
  return null
}

function lookupConstInt(scope: Scope, name: string): number | undefined {
  const upper = name.toUpperCase()
  let s: Scope | null = scope
  while (s) {
    if (s.constInts.has(upper)) return s.constInts.get(upper)
    s = s.parent
  }
  return undefined
}

const BUILTIN_TYPES: TypeDef[] = [INTEGER_TYPE, REAL_TYPE, BOOLEAN_TYPE, CHAR_TYPE, TEXT_TYPE]

export class TypeTableBuilder {
  private typeTable: TypeTable
  private scope: Scope

  constructor(extraTypes: TypeDef[] = []) {
    this.typeTable = createTypeTable()
    for (const t of BUILTIN_TYPES) {
      this.typeTable.register(t)
    }
    for (const t of extraTypes) {
      if (!this.typeTable.has(t.id)) {
        this.typeTable.register(t)
      }
    }
    this.scope = createScope()
  }

  build(program: ProgramNode): TypeTable {
    this.processBlock(program.block, this.scope)
    return this.typeTable
  }

  private processBlock(block: BlockNode, scope: Scope): void {
    for (const c of block.constDeclarations) {
      this.processConst(c, scope)
    }
    for (const t of block.typeDeclarations) {
      this.processTypeDecl(t, scope)
    }
    for (const v of block.variableDeclarations) {
      this.processVarDecl(v, scope)
    }
    for (const p of block.procedureDeclarations) {
      this.processProc(p, scope)
    }
    for (const f of block.functionDeclarations) {
      this.processFunc(f, scope)
    }
  }

  private processConst(c: ConstDeclarationNode, scope: Scope): void {
    const name = c.name.name.toUpperCase()
    try {
      const val = this.evaluateConstExpr(c.value, scope)
      scope.constInts.set(name, val)
    } catch {}
  }

  private processTypeDecl(t: TypeDeclarationNode, scope: Scope): void {
    const name = t.name.name.toUpperCase()
    const typeDef = this.resolveType(t.typeDef, scope)
    this.typeTable.register(typeDef)
    scope.types.set(name, typeDef.id)

    if (typeDef.kind === 'enum') {
      const enumType = typeDef as EnumType
      for (let i = 0; i < enumType.values.length; i++) {}
    }
  }

  private processVarDecl(v: VariableDeclarationNode, scope: Scope): void {
    const typeDef = this.resolveType(v.type, scope)
    if (!this.typeTable.has(typeDef.id)) {
      this.typeTable.register(typeDef)
    }
  }

  private processProc(p: ProcedureDeclarationNode, scope: Scope): void {
    const localScope = createScope(scope)
    for (const param of p.parameters) {
      this.processParam(param, localScope)
    }
    if (p.block) {
      this.processBlock(p.block, localScope)
    }
  }

  private processFunc(f: FunctionDeclarationNode, scope: Scope): void {
    const localScope = createScope(scope)
    for (const param of f.parameters) {
      this.processParam(param, localScope)
    }
    if (f.returnType) {
      this.resolveType(f.returnType, localScope)
    }
    if (f.block) {
      this.processBlock(f.block, localScope)
    }
  }

  private processParam(p: ParameterDeclarationNode, scope: Scope): void {
    const typeDef = this.resolveType(p.type, scope)
    if (!this.typeTable.has(typeDef.id)) {
      this.typeTable.register(typeDef)
    }
  }

  private resolveType(typeNode: TypeNode, scope: Scope): TypeDef {
    switch (typeNode.kind) {
      case 'SimpleType': {
        const name = (typeNode as SimpleTypeNode).name.name.toUpperCase()
        const builtin = this.typeTable.get(name.toLowerCase()) || this.typeTable.get(name)
        if (builtin) return builtin
        const typeId = lookupType(scope, name)
        if (typeId) {
          const def = this.typeTable.get(typeId)
          if (def) return def
        }
        throw new Error(`Undefined type: ${name}`)
      }

      case 'RangeType': {
        const range = typeNode as RangeTypeNode
        const min = this.evaluateConstExpr(range.start, scope)
        const max = this.evaluateConstExpr(range.end, scope)
        let baseTypeId = 'integer'
        if (range.start.kind === 'CharLiteral') {
          baseTypeId = 'char'
        } else if (range.start.kind === 'BooleanLiteral') {
          baseTypeId = 'boolean'
        }
        const id = `subrange-${min}-${max}-of-${baseTypeId}`
        const existing = this.typeTable.get(id)
        if (existing) return existing
        return {
          id,
          kind: 'subrange',
          baseTypeId,
          min,
          max,
        } as SubrangeType
      }

      case 'ArrayType': {
        const arr = typeNode as ArrayTypeNode
        const elementType = this.resolveType(arr.elementType, scope)
        if (!this.typeTable.has(elementType.id)) {
          this.typeTable.register(elementType)
        }
        const dimensions = arr.indexTypes.map((idx) => {
          if (idx.kind === 'RangeType') {
            const r = idx as RangeTypeNode
            const low = this.evaluateConstExpr(r.start, scope)
            const high = this.evaluateConstExpr(r.end, scope)
            return { low, high, indexTypeId: 'integer' }
          }
          const idxType = this.resolveType(idx, scope)
          if (idxType.kind === 'subrange') {
            const sub = idxType as SubrangeType
            return { low: sub.min, high: sub.max, indexTypeId: idxType.id }
          }
          if (idxType.id === 'char') {
            return { low: 0, high: 255, indexTypeId: 'char' }
          }
          if (idxType.id === 'boolean') {
            return { low: 0, high: 1, indexTypeId: 'boolean' }
          }
          if (idxType.kind === 'enum') {
            const enumDef = idxType as EnumType
            return { low: 0, high: enumDef.values.length - 1, indexTypeId: idxType.id }
          }
          return { low: 0, high: 0, indexTypeId: idxType.id }
        })
        const id = `array-${dimensions.map((d) => `${d.low}..${d.high}`).join(',')}-of-${elementType.id}`
        const existing = this.typeTable.get(id)
        if (existing) return existing
        return {
          id,
          kind: 'array',
          elementTypeId: elementType.id,
          dimensions,
          isPacked: false,
        } as ArrayType
      }

      case 'RecordType': {
        const rec = typeNode as RecordTypeNode
        const fields: { name: string; typeId: string; offset: number }[] = []
        let offset = 0

        for (const fieldDecl of rec.fields) {
          const fieldType = this.resolveType(fieldDecl.type, scope)
          if (!this.typeTable.has(fieldType.id)) {
            this.typeTable.register(fieldType)
          }
          for (const nameNode of fieldDecl.names) {
            fields.push({
              name: nameNode.name.toUpperCase(),
              typeId: fieldType.id,
              offset,
            })
            offset++
          }
        }

        const processVariantPart = (variantPart: any, baseOffset: number) => {
          if (variantPart.tagName) {
            const tagType = this.resolveType(variantPart.tagType, scope)
            if (!this.typeTable.has(tagType.id)) {
              this.typeTable.register(tagType)
            }
            fields.push({
              name: variantPart.tagName.name.toUpperCase(),
              typeId: tagType.id,
              offset: baseOffset,
            })
          }
          for (const variant of variantPart.variants) {
            for (const fieldDecl of variant.fields) {
              const fieldType = this.resolveType(fieldDecl.type, scope)
              if (!this.typeTable.has(fieldType.id)) {
                this.typeTable.register(fieldType)
              }
              for (const nameNode of fieldDecl.names) {
                fields.push({
                  name: nameNode.name.toUpperCase(),
                  typeId: fieldType.id,
                  offset: baseOffset,
                })
              }
            }
            if (variant.variant) {
              processVariantPart(variant.variant, baseOffset)
            }
          }
        }

        if ((rec as any).variant) {
          processVariantPart((rec as any).variant, offset)
        }

        const id = `record-${fields.map((f) => f.name).join(',')}`
        const existing = this.typeTable.get(id)
        if (existing) return existing
        return {
          id,
          kind: 'record',
          fields,
        } as RecordType
      }

      case 'EnumerationType': {
        const enumType = typeNode as EnumerationTypeNode
        const values = enumType.values.map((v) => v.name.toUpperCase())
        const id = `enum-${values.join(',')}`
        const existing = this.typeTable.get(id)
        if (existing) return existing
        return {
          id,
          kind: 'enum',
          values,
        } as EnumType
      }

      case 'SetType': {
        const setNode = typeNode as SetTypeNode
        const baseType = this.resolveType(setNode.baseType, scope)
        let minOrd = 0
        let maxOrd = 255
        if (baseType.kind === 'subrange') {
          const sub = baseType as SubrangeType
          minOrd = sub.min
          maxOrd = sub.max
        } else if (baseType.id === 'char') {
          minOrd = 0
          maxOrd = 255
        } else if (baseType.id === 'boolean') {
          minOrd = 0
          maxOrd = 1
        } else if (baseType.kind === 'enum') {
          const et = baseType as EnumType
          minOrd = 0
          maxOrd = et.values.length - 1
        }
        const id = `set-of-${baseType.id}-${minOrd}-${maxOrd}`
        const existing = this.typeTable.get(id)
        if (existing) return existing
        return {
          id,
          kind: 'set',
          baseTypeId: baseType.id,
          minOrd,
          maxOrd,
        } as SetType
      }

      case 'FileType': {
        const ft = typeNode as any
        if (
          ft.elementType &&
          ft.elementType.kind === 'SimpleType' &&
          (ft.elementType as SimpleTypeNode).name.name.toUpperCase() === 'CHAR'
        ) {
          return this.typeTable.get('text')!
        }
        const elementType = ft.elementType ? this.resolveType(ft.elementType, scope) : null
        const id = elementType ? `file-of-${elementType.id}` : 'file'
        const existing = this.typeTable.get(id)
        if (existing) return existing
        return { id, kind: 'file', elementTypeId: elementType?.id } as FileType
      }

      default:
        throw new Error(`Unsupported type kind: ${(typeNode as any).kind}`)
    }
  }

  private evaluateConstExpr(expr: ExpressionNode, scope: Scope): number {
    switch (expr.kind) {
      case 'IntegerLiteral':
        return (expr as IntegerLiteralNode).value
      case 'RealLiteral':
        return (expr as any).value
      case 'BooleanLiteral':
        return (expr as BooleanLiteralNode).value ? 1 : 0
      case 'CharLiteral':
        return (expr as CharLiteralNode).value.charCodeAt(0)
      case 'Identifier': {
        const name = (expr as IdentifierNode).name.toUpperCase()
        const val = lookupConstInt(scope, name)
        if (val !== undefined) return val
        throw new Error(`Unknown constant: ${name}`)
      }
      case 'BinaryExpression': {
        const bin = expr as BinaryExpressionNode
        const left = this.evaluateConstExpr(bin.left, scope)
        const right = this.evaluateConstExpr(bin.right, scope)
        switch (bin.operator.toUpperCase()) {
          case '+':
            return left + right
          case '-':
            return left - right
          case '*':
            return left * right
          case 'DIV':
            return Math.trunc(left / right)
          case 'MOD':
            return left - Math.trunc(left / right) * right
          default:
            throw new Error(`Unsupported const operator: ${bin.operator}`)
        }
      }
      case 'UnaryExpression': {
        const unary = expr as UnaryExpressionNode
        const val = this.evaluateConstExpr(unary.operand, scope)
        switch (unary.operator.toUpperCase()) {
          case '+':
            return val
          case '-':
            return -val
          default:
            throw new Error(`Unsupported const unary: ${unary.operator}`)
        }
      }
      case 'ParenthesizedExpression':
        return this.evaluateConstExpr((expr as any).expression, scope)
      default:
        throw new Error(`Unsupported constant expression: ${expr.kind}`)
    }
  }
}

export function buildTypeTable(ast: ProgramNode, extraTypes: TypeDef[] = []): TypeTable {
  const builder = new TypeTableBuilder(extraTypes)
  return builder.build(ast)
}
