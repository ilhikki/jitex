// ============================================================
// 辅助函数：real 格式化

import {
  ArrayHandler,
  ArrayValue,
  DefaultRecordValue,
  DimsLink,
  PascalArray,
  PascalRecord,
  RecordHandler,
  RecordValue,
  RuntimeContext,
  TypeDescriptor,
  TypeHandler,
  VariantBranchDescriptor,
  VariantPartDescriptor,
  VariantState,
} from '@/runtime/runtime-type.ts'

// ============================================================
export function formatReal(n: number): string {
  if (Number.isInteger(n)) {
    return `${n}.00000000000000E+000`
  }
  const s = n.toExponential(14)
  const eIdx = s.indexOf('e')
  if (eIdx < 0) {
    return s
  }
  const mantissa = s.slice(0, eIdx)
  const exp = s.slice(eIdx + 1)
  const sign = exp[0]
  const digits = exp.slice(1)
  const padded = digits.padStart(3, '0')
  return `${mantissa}E${sign}${padded}`
}

/**
 * 字段格式化：右对齐，左填充空格到 width。
 * Pascal 写参数语义：x:width 表示最小字段宽度，右对齐。
 */
export function formatField(text: string, width: number): string {
  if (!width || text.length >= width) {
    return text
  }
  return ' '.repeat(width - text.length) + text
}

export function getPascalStringValue(str: PascalArray) {
  return str.value.array.join('')
}

function dimsToLink(dims: Array<{ low: number; high: number }> | undefined): DimsLink {
  if (dims === undefined || dims.length === 0) {
    return {
      low: 0,
      high: Number.MAX_VALUE,
      deep: 0,
    }
  }
  let current: DimsLink | undefined = undefined
  for (let i = dims.length - 1; i >= 0; i--) {
    const d = dims[i]
    const deep: number = current ? current.deep + 1 : 0
    current = {
      ...d,
      next: current,
      deep: deep,
    }
  }
  return current!
}
function flattenArrayType(
  type: TypeDescriptor,
): { dimsList: Array<{ low: number; high: number }>; elementType: TypeDescriptor } {
  const dimsList: Array<{ low: number; high: number }> = []
  let current = type
  while (current.tag === 'array') {
    if (current.dims) {
      dimsList.push(...current.dims)
    }
    current = current.elem ?? { tag: 'void' }
  }
  return { dimsList, elementType: current }
}

export function createDefaultArray(ctx: RuntimeContext, typeDesc: TypeDescriptor): PascalArray {
  return createArrayHandler(ctx, typeDesc).create()
}

// ============================================================
// Handler 工厂
// ============================================================

/**
 * 类型 → handler 工厂入口。
 * 只有 rec/array 返回 handler；其余标量类型返回 undefined。
 * 子 handler 通过 ctx.dispatch('factory.create*Handler') 获取，形成递归闭环。
 */
export function defaultCreateHandler(ctx: RuntimeContext, type: TypeDescriptor): TypeHandler | undefined {
  switch (type.tag) {
    case 'rec':
      return ctx.dispatch!('factory.createRecHandler')([type]) as RecordHandler
    case 'array':
      return ctx.dispatch!('factory.createArrayHandler')([type]) as ArrayHandler
    default:
      return undefined
  }
}

export function createDefaultRec(ctx: RuntimeContext, typeDesc: TypeDescriptor): PascalRecord {
  return createRecHandler(ctx, typeDesc).create()
}

// ============================================================
// 变体布局（编译期构建，运行时不变，存于 handler 闭包）
// ============================================================

interface VariantLayout {
  tagName: string | undefined
  branches: BranchLayout[]
}

interface BranchLayout {
  labels: number[]
  fieldSet: Set<string>
  fieldHandlers: Map<string, TypeHandler | undefined>
  nested: VariantLayout | undefined
}

function buildVariantLayout(ctx: RuntimeContext, vpd: VariantPartDescriptor): VariantLayout {
  const branches: BranchLayout[] = vpd.branches.map((b: VariantBranchDescriptor) => {
    const fieldSet = new Set<string>()
    const fieldHandlers = new Map<string, TypeHandler | undefined>()
    for (const f of b.fields) {
      fieldSet.add(f.name)
      // 子 handler 通过 ctx.dispatch 获取（可 extraSyscalls 替换 factory.*）
      fieldHandlers.set(f.name, callCreateHandler(ctx, f.type))
    }
    return {
      labels: b.labels,
      fieldSet,
      fieldHandlers,
      nested: b.nested ? buildVariantLayout(ctx, b.nested) : undefined,
    }
  })
  return { tagName: vpd.tagName, branches }
}

/** 该变体层级（含嵌套）是否包含字段 key */
function variantHasKey(layout: VariantLayout, key: string): boolean {
  for (const b of layout.branches) {
    if (b.fieldSet.has(key)) {
      return true
    }
    if (b.nested && variantHasKey(b.nested, key)) {
      return true
    }
  }
  return false
}

/** 在当前层级查找拥有 key 的分支索引（自身字段或嵌套变体） */
function findOwnerBranch(layout: VariantLayout, key: string): number {
  return layout.branches.findIndex(
    (b) => b.fieldSet.has(key) || (b.nested !== undefined && variantHasKey(b.nested, key)),
  )
}

/** 创建空变体状态（branchIndex 待由 variantSetState 覆写） */
function emptyVariantState(): VariantState {
  return { branchIndex: -1, tagValue: undefined, fields: {}, nested: undefined }
}

// ============================================================
// Record Handler
// ============================================================

interface FixFieldInfo {
  name: string
  handler: TypeHandler | undefined
}

export function createRecHandler(ctx: RuntimeContext, type: TypeDescriptor): RecordHandler {
  // —— 预编译固定字段 ——
  const fixFields: FixFieldInfo[] = (type.fields ?? []).map((f) => ({
    name: f.name,
    handler: callCreateHandler(ctx, f.type),
  }))
  const fixFieldSet = new Set(fixFields.map((f) => f.name))
  // —— 预编译变体布局 ——
  const variantLayout = type.variant ? buildVariantLayout(ctx, type.variant) : undefined

  const handler: RecordHandler = {
    create(): PascalRecord {
      const fix: Record<string, unknown> = {}
      for (const f of fixFields) {
        if (f.handler?.create !== undefined) {
          // rec/array → 用子 handler.create() 得到带 handler 的包装对象
          fix[f.name] = f.handler.create()
        }
        // 标量字段：不初始化（absent），读取时抛 "read unsetted field"
      }
      return { kind: 'record', value: { fix, variant: undefined }, handler }
    },

    get(value, key) {
      const v = value as DefaultRecordValue
      // 1. 固定字段
      if (fixFieldSet.has(key)) {
        if (key in v.fix) {
          return v.fix[key]
        }
        throw new Error(`read unsetted field: ${key}`)
      }
      // 2. tag 字段
      if (variantLayout?.tagName === key) {
        if (!v.variant) {
          throw new Error(`read unsetted field: ${key}`)
        }
        return v.variant.tagValue
      }
      // 3. 变体字段
      if (!variantLayout) {
        throw new Error(`record not contains field ${key}`)
      }
      if (!v.variant) {
        throw new Error(`read unsetted field: ${key}`)
      }
      return variantGet(variantLayout, v.variant, key)
    },

    set(value, key, val) {
      const v = value as DefaultRecordValue
      // 1. 固定字段
      if (fixFieldSet.has(key)) {
        v.fix[key] = val
        return
      }
      // 2. tag 字段：设 tag = 切换分支
      if (variantLayout?.tagName === key) {
        switchBranchByTag(value, variantLayout, val)
        return
      }
      // 3. 变体字段
      if (!variantLayout) {
        throw new Error(`record not contains field ${key}`)
      }
      if (!v.variant) {
        v.variant = emptyVariantState()
      }
      variantSetState(variantLayout, v.variant, key, val)
    },

    copy(record) {
      const value = record.value as DefaultRecordValue
      const fix: Record<string, unknown> = {}
      for (const f of fixFields) {
        if (!(f.name in value.fix)) {
          continue
        }
        const v = value.fix[f.name]
        if (f.handler?.copy) {
          fix[f.name] = (f.handler.copy)(v)
        } else {
          fix[f.name] = v
        }
      }
      return {
        kind: 'record',
        value: {
          fix,
          variant: value.variant && variantLayout ? copyVariantState(value.variant, variantLayout) : undefined,
        },
        handler,
      }
    },
  }
  return handler
}

// ============================================================
// 变体 get/set 实现
// ============================================================

/** 递归读取变体字段，做 a写b读 检测 */
function variantGet(layout: VariantLayout, state: VariantState, key: string): unknown {
  // tag 字段（嵌套变体的 tag）
  if (layout.tagName === key) {
    return state.tagValue
  }
  const branch = layout.branches[state.branchIndex]
  // 当前分支自身字段
  if (branch.fieldSet.has(key)) {
    if (key in state.fields) {
      return state.fields[key]
    }
    throw new Error(`read unsetted field: ${key}`)
  }
  // 嵌套变体
  if (branch.nested) {
    if (state.nested) {
      return variantGet(branch.nested, state.nested, key)
    }
    if (variantHasKey(branch.nested, key)) {
      throw new Error(`read unsetted field: ${key}`)
    }
  }
  // 不属于当前活跃分支 → a写b读（ISO 未定义行为）
  throw new Error(
    `variant field '${key}' not accessible in active branch ${state.branchIndex} (a-write-b-read is undefined behavior)`,
  )
}

/** 递归设置变体字段：切换分支时清空旧字段 */
function variantSetState(layout: VariantLayout, state: VariantState, key: string, val: unknown): void {
  const ownerIdx = findOwnerBranch(layout, key)
  if (ownerIdx < 0) {
    throw new Error(`record not contains variant field ${key}`)
  }
  // 切换分支（含清空旧字段、重置嵌套）
  if (state.branchIndex !== ownerIdx) {
    state.branchIndex = ownerIdx
    state.tagValue = layout.branches[ownerIdx].labels[0] ?? 0
    state.fields = {}
    state.nested = undefined
  }
  const branch = layout.branches[ownerIdx]
  // 该分支自身字段
  if (branch.fieldSet.has(key)) {
    state.fields[key] = val
    return
  }
  // 嵌套变体
  if (!branch.nested) {
    throw new Error(`record not contains variant field ${key}`)
  }
  if (!state.nested) {
    state.nested = emptyVariantState()
  }
  variantSetState(branch.nested, state.nested, key, val)
}

/** 通过 tag 值切换分支（set tag 字段时调用），清空旧字段 */
function switchBranchByTag(value: RecordValue, layout: VariantLayout, tagValue: unknown): void {
  const v = value as DefaultRecordValue
  const idx = layout.branches.findIndex((b) => b.labels.includes(tagValue as number))
  if (idx < 0) {
    throw new Error(`tag value ${tagValue} not match any branch`)
  }
  // 同一分支：仅更新 tag 值，保留字段
  if (v.variant && v.variant.branchIndex === idx) {
    v.variant.tagValue = tagValue
    return
  }
  // 切换分支：清空旧字段，初始化新分支
  v.variant = {
    branchIndex: idx,
    tagValue,
    fields: {},
    nested: undefined,
  }
}

/** 深拷贝变体状态 */
function copyVariantState(state: VariantState, layout: VariantLayout): VariantState {
  const fields: Record<string, unknown> = {}
  const branch = layout.branches[state.branchIndex]
  for (const k in state.fields) {
    const v = state.fields[k]
    const fHandler = branch.fieldHandlers.get(k)
    if (fHandler?.copy) {
      fields[k] = fHandler.copy(v)
    } else {
      fields[k] = v
    }
  }
  return {
    branchIndex: state.branchIndex,
    tagValue: state.tagValue,
    fields,
    nested: state.nested && branch.nested ? copyVariantState(state.nested, branch.nested) : undefined,
  }
}

// ============================================================
// Array Handler
// ============================================================

/** 值层级多维导航：返回最内层 ArrayValue，按需创建中间维度 */
function getArrayByIndexValue(value: ArrayValue, indices: number[]): ArrayValue {
  let current = value
  for (let i = 0; i < indices.length - 1; i++) {
    const index = indices[i]
    const actualIndex = index - (current.dims?.low ?? 0)
    const arr = current.array
    let element = arr[actualIndex]
    if (element === undefined && current.dims?.next) {
      const newArray: ArrayValue = {
        array: [],
        dims: current.dims.next,
      }
      arr[actualIndex] = newArray
      element = newArray
    }
    current = element as ArrayValue
  }
  return current
}

export function doCreateArrayHandler(dimsLink: DimsLink, elemHandler: TypeHandler | undefined) {
  const handler: ArrayHandler = {
    create(): PascalArray {
      return {
        kind: 'array',
        value: { array: [], dims: dimsLink },
        handler,
      }
    },
    get(value, indices) {
      const leaf = getArrayByIndexValue(value, indices)
      const lastIndex = indices.at(-1)! - (leaf.dims?.low ?? 0)
      let element = leaf.array[lastIndex]
      if (element === undefined) {
        // 元素不存在：有 handler（rec/array）→ 创建默认空值；无 handler → 抛 "read unsetted field"
        if (elemHandler?.create !== undefined) {
          element = elemHandler.create()
          leaf.array[lastIndex] = element
        } else {
          throw new Error(`read unsetted field: array[${indices.join(',')}]`)
        }
      }
      return element
    },
    set(value, indices, val) {
      const leaf = getArrayByIndexValue(value, indices)
      const lastIndex = indices.at(-1)! - (leaf.dims?.low ?? 0)
      leaf.array[lastIndex] = val
    },
    copy(pascalArray) {
      const value = pascalArray.value
      const array = value.array.map((v) => {
        if (v === undefined) {
          return undefined
        }
        if (elemHandler?.copy === undefined) {
          return v
        }
        return elemHandler.copy(v)
      })
      return {
        kind: 'array',
        value: { array, dims: value.dims },
        handler,
      }
    },
  }
  return handler
}
export function callCreateHandler(ctx: RuntimeContext, type: TypeDescriptor): TypeHandler | undefined {
  return ctx.dispatch!('factory.createHandler')([type]) as TypeHandler | undefined
}
export function createArrayHandler(ctx: RuntimeContext, type: TypeDescriptor): ArrayHandler {
  const { dimsList, elementType } = flattenArrayType(type)
  const dimsLink = dimsToLink(dimsList)
  const elemHandler = callCreateHandler(ctx, elementType)

  const handler = doCreateArrayHandler(dimsLink, elemHandler)
  return handler
}

export function encodeUtf8(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

export function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}
