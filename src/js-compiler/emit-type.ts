// 类型相关编译逻辑：TypeNode → typeId、类型种类判断、subrange/数组维度解析等
//
// 由原 compiler.ts 中的 private 方法提取为独立函数，所有函数接收 compiler 实例
// 以便访问 typeTable / aliasMap / enumConstants / constInts 等公共字段。
import type {
  ArrayTypeNode,
  BinaryExpressionNode,
  BlockNode,
  EnumerationTypeNode,
  ExpressionNode,
  FileTypeNode,
  IdentifierNode,
  RangeTypeNode,
  RecordTypeNode,
  SetTypeNode,
  SimpleTypeNode,
  TypeNode,
  UnaryExpressionNode,
} from '../ast/types'
import type { Compiler } from './compiler'

// ---- 类型收集 ----

export function collectTypes(compiler: Compiler, block: BlockNode) {
  // 先扫一遍 const integer（type 边界可能引用 const）
  for (const c of block.constDeclarations) {
    const v = tryEvalConstInt(compiler, c.value)
    if (v !== undefined) compiler.constInts.set(c.name.name.toUpperCase(), v)
  }
  // 顺序处理 typeDeclarations（Pascal 要求先声明再使用）
  for (const t of block.typeDeclarations) {
    const typeId = resolveTypeId(compiler, t.typeDef)
    compiler.aliasMap.set(t.name.name.toUpperCase(), typeId)
  }
}

// 尝试在编译期求 const int（不抛错，失败返回 undefined）
export function tryEvalConstInt(compiler: Compiler, node: ExpressionNode): number | undefined {
  try {
    return evalConstInt(compiler, node)
  } catch {
    return undefined
  }
}

export function evalConstInt(compiler: Compiler, node: ExpressionNode): number {
  switch (node.kind) {
    case 'IntegerLiteral':
      return (node as any).value
    case 'CharLiteral':
      return (node as any).value.charCodeAt(0)
    case 'BooleanLiteral':
      return (node as any).value ? 1 : 0
    case 'Identifier': {
      const name = (node as IdentifierNode).name.toUpperCase()
      if (compiler.constInts.has(name)) return compiler.constInts.get(name)!
      if (compiler.enumConstants.has(name)) return compiler.enumConstants.get(name)!
      throw new Error(`JS VM: cannot eval const ${name}`)
    }
    case 'UnaryExpression': {
      const u = node as UnaryExpressionNode
      const v = evalConstInt(compiler, u.operand)
      return u.operator === '-' ? -v : v
    }
    case 'BinaryExpression': {
      const b = node as BinaryExpressionNode
      const l = evalConstInt(compiler, b.left)
      const r = evalConstInt(compiler, b.right)
      switch (b.operator.toUpperCase()) {
        case '+':
          return l + r
        case '-':
          return l - r
        case '*':
          return l * r
        case 'DIV':
          return Math.trunc(l / r)
        case 'MOD':
          return l - Math.trunc(l / r) * r
      }
    }
    case 'ParenthesizedExpression':
      return evalConstInt(compiler, (node as any).expression)
  }
  throw new Error(`JS VM: cannot eval const expr ${(node as any).kind}`)
}

// 把 TypeNode 解析为 typeId（与 StaticAnalyzer 生成规则一致）
export function resolveTypeId(compiler: Compiler, node: TypeNode): string {
  switch (node.kind) {
    case 'SimpleType': {
      const n = (node as SimpleTypeNode).name.name.toUpperCase()
      switch (n) {
        case 'INTEGER':
          return 'integer'
        case 'REAL':
          return 'real'
        case 'BOOLEAN':
          return 'boolean'
        case 'CHAR':
          return 'char'
        case 'STRING':
          return 'string'
        case 'TEXT':
          return 'text'
        default: {
          const tid = compiler.aliasMap.get(n)
          if (tid) return tid
          // 可能是 enum 值？SimpleType 不会是 enum value，报错
          throw new Error(`JS VM: unknown type ${n}`)
        }
      }
    }
    case 'RangeType': {
      const r = node as RangeTypeNode
      const min = evalConstInt(compiler, r.start)
      const max = evalConstInt(compiler, r.end)
      if (min > max) {
        throw new Error(`JS VM: subrange lower bound ${min} > upper bound ${max}`)
      }
      let baseTypeId = 'integer'
      if (r.start.kind === 'CharLiteral') baseTypeId = 'char'
      else if (r.start.kind === 'BooleanLiteral') baseTypeId = 'boolean'
      else if (r.start.kind === 'Identifier') {
        const name = (r.start as IdentifierNode).name.toUpperCase()
        if (compiler.enumConstants.has(name)) {
          baseTypeId = 'integer'
        }
      }
      return `subrange-${min}-${max}-of-${baseTypeId}`
    }
    case 'ArrayType': {
      const a = node as ArrayTypeNode
      const elemTypeId = resolveTypeId(compiler, a.elementType)
      const dims = a.indexTypes.map((idx) => {
        if (idx.kind === 'RangeType') {
          const r = idx as RangeTypeNode
          const low = evalConstInt(compiler, r.start)
          const high = evalConstInt(compiler, r.end)
          return `${low}..${high}`
        }
        // 简单类型作为索引：尝试解析为 subrange 取范围
        const idxType = resolveTypeId(compiler, idx)
        const td = compiler.typeTable.get(idxType) as any
        if (td?.kind === 'subrange') return `${td.min}..${td.max}`
        if (idxType === 'char') return '0..255'
        if (idxType === 'boolean') return '0..1'
        // enum
        if (td?.kind === 'enum') return `0..${td.values.length - 1}`
        return '0..0'
      })
      return `array-${dims.join(',')}-of-${elemTypeId}`
    }
    case 'RecordType': {
      const r = node as RecordTypeNode
      const fields: string[] = []
      for (const f of r.fields) {
        for (const n of f.names) fields.push(n.name.toUpperCase())
      }
      return `record-${fields.join(',')}`
    }
    case 'EnumerationType': {
      const e = node as EnumerationTypeNode
      const vals = e.values.map((v) => v.name.toUpperCase())
      // 注册 enum 常量
      vals.forEach((v, i) => compiler.enumConstants.set(v, i))
      return `enum-${vals.join(',')}`
    }
    case 'SetType': {
      const s = node as SetTypeNode
      const baseTypeId = resolveTypeId(compiler, s.baseType)
      let minOrd = 0,
        maxOrd = 255
      const baseDef = compiler.typeTable.get(baseTypeId) as any
      if (baseDef?.kind === 'subrange') {
        minOrd = baseDef.min
        maxOrd = baseDef.max
      } else if (baseDef?.kind === 'char') {
        minOrd = 0
        maxOrd = 255
      } else if (baseDef?.kind === 'boolean') {
        minOrd = 0
        maxOrd = 1
      } else if (baseDef?.kind === 'enum') {
        minOrd = 0
        maxOrd = baseDef.values.length - 1
      }
      return `set-of-${baseTypeId}-${minOrd}-${maxOrd}`
    }
    case 'FileType': {
      const f = node as FileTypeNode
      if (
        f.elementType &&
        f.elementType.kind === 'SimpleType' &&
        (f.elementType as SimpleTypeNode).name.name.toUpperCase() === 'CHAR'
      ) {
        return 'text'
      }
      const elemTypeId = f.elementType ? resolveTypeId(compiler, f.elementType) : 'integer'
      return `file-of-${elemTypeId}`
    }
    default:
      throw new Error(`JS VM: unsupported type ${(node as any).kind}`)
  }
}

// 类型种类判断
export function typeKind(compiler: Compiler, typeId: string): string {
  if (
    typeId === 'integer' ||
    typeId === 'real' ||
    typeId === 'boolean' ||
    typeId === 'char' ||
    typeId === 'string' ||
    typeId === 'text'
  ) {
    return typeId
  }
  if (typeId === 'set' || typeId.startsWith('set-of-')) return 'set'
  if (typeId.startsWith('array-')) return 'array'
  if (typeId.startsWith('record-')) return 'record'
  if (typeId.startsWith('file-of-')) return 'file'
  const td = compiler.typeTable.get(typeId) as any
  return td?.kind || 'unknown'
}

// scalar 且用裸值表示（integer/real/boolean/subrange/enum 内部都是 number/boolean）
export function isScalarBare(compiler: Compiler, typeId: string): boolean {
  if (typeId === 'integer' || typeId === 'real' || typeId === 'boolean') return true
  const k = typeKind(compiler, typeId)
  return k === 'subrange' || k === 'enum'
}

// 缩并为基本标量类型（subrange → base, enum → integer）
export function scalarBase(compiler: Compiler, typeId: string): string {
  if (typeId === 'integer') return 'integer'
  if (typeId === 'real') return 'real'
  if (typeId === 'boolean') return 'boolean'
  if (typeId === 'char') return 'char'
  if (typeId === 'string') return 'string'
  const k = typeKind(compiler, typeId)
  if (k === 'subrange') {
    // 从 subrange-${min}-${max}-of-${base} 解析 base
    const b = subrangeBounds(typeId)
    return b ? b.base : 'integer'
  }
  if (k === 'enum') return 'integer'
  return typeId
}

// 解析 subrange typeId 的边界信息
export function subrangeBounds(typeId: string): { min: number; max: number; base: string } | null {
  const m = typeId.match(/^subrange-(-?\d+)-(-?\d+)-of-(.+)$/)
  if (!m) return null
  return { min: parseInt(m[1], 10), max: parseInt(m[2], 10), base: m[3] }
}

// record 字段类型
export function recordFieldType(
  compiler: Compiler,
  recordTypeId: string,
  fieldName: string
): string | null {
  const td = compiler.typeTable.get(recordTypeId) as any
  if (!td || td.kind !== 'record') return null
  const f = td.fields.find((x: any) => x.name === fieldName.toUpperCase())
  return f ? f.typeId : null
}

// 获取数组第 idx 个维度的边界（支持嵌套数组和压平多维数组）
export function arrayDimAt(
  compiler: Compiler,
  arrayTypeId: string,
  idx: number
): { low: number; high: number } | null {
  let t = arrayTypeId
  let consumed = 0
  while (idx >= consumed) {
    const td = compiler.typeTable.get(t) as any
    if (!td || td.kind !== 'array') return null
    const dims = td.dimensions || []
    if (dims.length === 0) return null
    if (dims.length > 1) {
      // 压平的多维数组：所有维度都在这一层
      const offset = idx - consumed
      if (offset < dims.length) {
        return { low: dims[offset].low, high: dims[offset].high }
      }
      return null
    }
    // 嵌套数组：1 个维度，进入下一层
    if (idx === consumed) {
      return { low: dims[0].low, high: dims[0].high }
    }
    consumed++
    t = td.elementTypeId
  }
  return null
}

// 从数组类型出发，应用 n 个索引后得到的最终类型
export function arrayElementAfterNIndices(
  compiler: Compiler,
  arrayTypeId: string,
  n: number
): string | null {
  let t = arrayTypeId
  for (let i = 0; i < n; i++) {
    const td = compiler.typeTable.get(t) as any
    if (!td || td.kind !== 'array') return null
    const dims = td.dimensions || []
    if (dims.length === 0) return null
    if (dims.length === 1) {
      // 嵌套数组：消耗 1 个维度，进入 elementTypeId
      t = td.elementTypeId
    } else {
      // 压平的多维数组：一次性消耗所有维度
      if (i === 0) {
        t = td.elementTypeId
      }
      // 剩下的索引已经没有更多维度可以消耗了，但压平数组要求所有索引一次性给出
      // 这里我们假设调用方已经确保索引数量正确
      break
    }
  }
  return t
}

// array 元素类型
export function arrayElementType(compiler: Compiler, arrayTypeId: string): string | null {
  const td = compiler.typeTable.get(arrayTypeId) as any
  if (!td || td.kind !== 'array') return null
  return td.elementTypeId
}

// array 维度信息：[{low, high}, ...]
export function arrayDims(
  compiler: Compiler,
  arrayTypeId: string
): { low: number; high: number }[] {
  const td = compiler.typeTable.get(arrayTypeId) as any
  if (!td || td.kind !== 'array') return []
  const dims = td.dimensions || []
  return dims.map((d: any) => ({ low: d.low, high: d.high }))
}
