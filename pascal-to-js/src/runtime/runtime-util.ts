// ============================================================
// 辅助函数：real 格式化

import type {
  ArrayHandler,
  ArrayValue,
  DimsLink,
  PascalArray,
  PascalFile,
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

/**
 * 深拷贝 Pascal 值（record 赋值语义）。
 * Pascal 中 record/array 赋值是值拷贝，但 JS 对象赋值是引用。
 * 此函数用于 `rec.copy` syscall，确保 record 赋值时产生独立副本。
 *
 * 规则：
 *   - 标量（number/string/boolean）：直接返回
 *   - Set：返回新 Set（元素是标量，无需递归）
 *   - Uint8Array：返回新 Uint8Array
 *   - Array：递归深拷贝每个元素
 *   - PascalFile（含 url 属性）：共享引用（文件是引用语义）
 *   - record（plain object）：递归深拷贝每个字段
 */
export function deepCopyValue(v: unknown): unknown {
  if (v === null || v === undefined) {
    return v
  }
  if (typeof v !== 'object') {
    return v
  }
  if (v instanceof Set) {
    return new Set(v)
  }
  if (v instanceof Uint8Array) {
    return new Uint8Array(v)
  }
  if (Array.isArray(v)) {
    return v.map(deepCopyValue)
  }
  // PascalFile：文件是引用语义，共享引用
  const obj = v as Record<string, unknown>
  if (typeof obj.url === 'string' && typeof obj.offset === 'number') {
    return v
  }
  // record：递归深拷贝每个字段
  const copy: Record<string, unknown> = {}
  for (const k of Object.keys(obj)) {
    copy[k] = deepCopyValue(obj[k])
  }
  return copy
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

/** 旧路径默认元素创建（仅用于无 handler 的手构数组，如 str.to.char.array） */
function createDefaultElement(ctx: RuntimeContext, type: TypeDescriptor, require: boolean) {
  switch (type.tag) {
    case 'rec':
      return createDefaultRec(ctx, type)
    case 'array':
      return createDefaultArray(ctx, type)
    case 'subrange':
      return type.low
    case 'file':
      return { kind: 'file', value: undefined } as PascalFile
    default:
      if (require) {
        throw new Error(`element of type ${type.tag} is not defined`)
      } else {
        return undefined
      }
  }
}

export function getArrayByIndex(array: PascalArray, indices: number[]): PascalArray {
  let current = array
  for (let i = 0; i < indices.length - 1; i++) {
    const index = indices[i]
    const actualIndex = index - (current.value.dims?.low ?? 0)
    const arr = current.value.array
    const element = arr[actualIndex]
    if (element === undefined && current.value.dims?.next) {
      // 创建下一维数组，继承父级的 elementType
      const newArray: PascalArray = {
        kind: 'array',
        value: {
          array: [],
          dims: current.value.dims.next,
          elementType: current.value.elementType, // 最终类型不变
        },
        handler: undefined,
      }
      arr[actualIndex] = newArray
      current = newArray
    } else {
      current = element as PascalArray
    }
  }
  return current
}

/** 无 handler 数组（手构，如 str.to.char.array）的元素获取 */
export function getArrayElement(ctx: RuntimeContext, array: PascalArray, indices: number[]) {
  const pascalArray = getArrayByIndex(array, indices)
  const lastIndex = indices.at(-1)! - (pascalArray.value.dims?.low ?? 0)
  const element = pascalArray.value.array[lastIndex]
  if (element === undefined) {
    if (pascalArray.value.elementType) {
      const defaultElement = createDefaultElement(ctx, pascalArray.value.elementType, true)
      pascalArray.value.array[lastIndex] = defaultElement
      return defaultElement
    } else {
      throw new Error(`array is not init at ${lastIndex}(${indices.at(-1)})`)
    }
  }
  return element
}

/** 无 handler 数组的元素设置 */
export function setArrayElement(array: PascalArray, indices: number[], value: unknown): void {
  const pascalArray = getArrayByIndex(array, indices)
  const lastIndex = indices.at(-1)! - (pascalArray.value.dims?.low ?? 0)
  const jsArray: Array<unknown> = pascalArray.value.array
  jsArray[lastIndex] = value
}

// ============================================================
// Handler 工厂
// ============================================================

/**
 * 类型 → handler 工厂入口。
 * 只有 rec/array 返回 handler；其余标量类型返回 undefined。
 * 子 handler 通过 ctx.dispatch('factory.create*Handler') 获取，形成递归闭环。
 */
export function createHandler(ctx: RuntimeContext, type: TypeDescriptor): TypeHandler | undefined {
  switch (type.tag) {
    case 'rec':
      return ctx.dispatch!('factory.createRecHandler')([type]) as RecordHandler
    case 'array':
      return ctx.dispatch!('factory.createArrayHandler')([type]) as ArrayHandler
    default:
      // 标量（i32/f64/bool/char/str/subrange/enum/set/file/pointer/void）
      // 默认实现返回 undefined（严格 ISO：读未初始化标量 = 未定义行为，抛错）。
      // 走 ctx.dispatch：extraSyscalls 覆盖 'factory.createHandler' 可为标量返回 handler
      // （例如 subrange 返回下限默认值，避免 "read unsetted field"）。
      return ctx.dispatch!('factory.createHandler')([type]) as TypeHandler | undefined
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
      fieldHandlers.set(f.name, createHandler(ctx, f.type))
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

/**
 * 用对应 handler 拷贝子 record/array。
 * 按 child.kind 路由：record → RecordHandler.copy(RecordValue)，array → ArrayHandler.copy(ArrayValue)。
 * 类型相关性由 create() 保证（rec 字段存 PascalRecord+RecordHandler，array 字段存 PascalArray+ArrayHandler）。
 */
function copyChild(handler: TypeHandler, child: PascalRecord | PascalArray): PascalRecord | PascalArray {
  if (child.kind === 'record') {
    return (handler as RecordHandler).copy(child.value)
  }
  return (handler as ArrayHandler).copy(child.value)
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
    handler: createHandler(ctx, f.type),
  }))
  const fixFieldSet = new Set(fixFields.map((f) => f.name))
  // —— 预编译变体布局 ——
  const variantLayout = type.variant ? buildVariantLayout(ctx, type.variant) : undefined

  const handler: RecordHandler = {
    create(): PascalRecord {
      const fix: Record<string, unknown> = {}
      for (const f of fixFields) {
        if (f.handler) {
          // rec/array → 用子 handler.create() 得到带 handler 的包装对象
          fix[f.name] = f.handler.create()
        }
        // 标量字段：不初始化（absent），读取时抛 "read unsetted field"
      }
      return { kind: 'record', value: { fix, variant: undefined }, handler }
    },

    get(value, key) {
      // 1. 固定字段
      if (fixFieldSet.has(key)) {
        if (key in value.fix) {
          return value.fix[key]
        }
        throw new Error(`read unsetted field: ${key}`)
      }
      // 2. tag 字段
      if (variantLayout?.tagName === key) {
        if (!value.variant) {
          throw new Error(`read unsetted field: ${key}`)
        }
        return value.variant.tagValue
      }
      // 3. 变体字段
      if (!variantLayout) {
        throw new Error(`record not contains field ${key}`)
      }
      if (!value.variant) {
        throw new Error(`read unsetted field: ${key}`)
      }
      return variantGet(variantLayout, value.variant, key)
    },

    set(value, key, val) {
      // 1. 固定字段
      if (fixFieldSet.has(key)) {
        value.fix[key] = val
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
      if (!value.variant) {
        value.variant = emptyVariantState()
      }
      variantSetState(variantLayout, value.variant, key, val)
    },

    copy(value) {
      const fix: Record<string, unknown> = {}
      for (const f of fixFields) {
        if (!(f.name in value.fix)) {
          continue
        }
        const v = value.fix[f.name]
        if (f.handler) {
          // 子 handler 存在但值是标量：该字段的 handler 可能来自 extraSyscalls（如 subrange/i32 等标量默认值 handler）
          // 此时用 handler.copy 拷贝标量值；只有当值真的是 PascalRecord/PascalArray 时才走 copyChild。
          const isComposite = typeof v === 'object' && v !== null && 'kind' in (v as object)
          if (isComposite) {
            fix[f.name] = copyChild(f.handler, v as PascalRecord | PascalArray)
          } else {
            // 标量 handler（extraSyscalls 注入，如 subrange/i32）copy 参数类型是 unknown，
            // 与 RecordHandler/ArrayHandler 接口签名不匹配，需要类型断言。
            fix[f.name] = (f.handler.copy as (x: unknown) => unknown)(v)
          }
        } else {
          fix[f.name] = copyScalarValue(v)
        }
      }
      return {
        kind: 'record',
        value: { fix, variant: value.variant ? copyVariantState(value.variant) : undefined },
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
  const idx = layout.branches.findIndex((b) => b.labels.includes(tagValue as number))
  if (idx < 0) {
    throw new Error(`tag value ${tagValue} not match any branch`)
  }
  // 同一分支：仅更新 tag 值，保留字段
  if (value.variant && value.variant.branchIndex === idx) {
    value.variant.tagValue = tagValue
    return
  }
  // 切换分支：清空旧字段，初始化新分支
  value.variant = {
    branchIndex: idx,
    tagValue,
    fields: {},
    nested: undefined,
  }
}

/** 深拷贝变体状态 */
function copyVariantState(state: VariantState): VariantState {
  const fields: Record<string, unknown> = {}
  for (const k in state.fields) {
    fields[k] = copyScalarValue(state.fields[k])
  }
  return {
    branchIndex: state.branchIndex,
    tagValue: state.tagValue,
    fields,
    nested: state.nested ? copyVariantState(state.nested) : undefined,
  }
}

/**
 * 拷贝标量/对象叶子值（用于 record copy 中无 handler 的字段及变体字段）。
 * - 原始值：直接返回
 * - Set / Uint8Array：拷贝
 * - PascalSet：拷贝其 Set
 * - PascalFile / PascalCell：引用语义，共享
 * - 其他对象：浅拷贝属性
 */
function copyScalarValue(v: unknown): unknown {
  if (v === null || typeof v !== 'object') {
    return v
  }
  if (v instanceof Set) {
    return new Set(v)
  }
  if (v instanceof Uint8Array) {
    return new Uint8Array(v)
  }
  const obj = v as { kind?: string; value?: unknown }
  if (obj.kind === 'set' && obj.value instanceof Set) {
    return { kind: 'set', value: new Set(obj.value) }
  }
  if (obj.kind === 'file' || obj.kind === 'cell') {
    return v // 引用语义
  }
  // 兜底：浅拷贝可枚举属性
  const out: Record<string, unknown> = {}
  for (const k in obj) {
    out[k] = (obj as Record<string, unknown>)[k]
  }
  return out
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
        elementType: current.elementType,
      }
      arr[actualIndex] = newArray
      element = newArray
    }
    current = element as ArrayValue
  }
  return current
}

export function createArrayHandler(ctx: RuntimeContext, type: TypeDescriptor): ArrayHandler {
  const { dimsList, elementType } = flattenArrayType(type)
  const dimsLink = dimsToLink(dimsList)
  const elemHandler = createHandler(ctx, elementType)

  const handler: ArrayHandler = {
    create(): PascalArray {
      return {
        kind: 'array',
        value: { array: [], dims: dimsLink, elementType },
        handler,
      }
    },
    get(value, indices) {
      const leaf = getArrayByIndexValue(value, indices)
      const lastIndex = indices.at(-1)! - (leaf.dims?.low ?? 0)
      let element = leaf.array[lastIndex]
      if (element === undefined) {
        // 元素不存在：有 handler（rec/array）→ 创建默认空值；无 handler → 抛 "read unsetted field"
        if (elemHandler) {
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
    copy(value) {
      const array = value.array.map((v) => {
        if (elemHandler && v) {
          // 元素是 PascalRecord/PascalArray 才走 copyChild；否则用 elemHandler.copy（标量 handler 情况）
          const isComposite = typeof v === 'object' && 'kind' in (v as object)
          if (isComposite) {
            return copyChild(elemHandler, v as PascalRecord | PascalArray)
          }
          return (elemHandler.copy as (x: unknown) => unknown)(v)
        }
        return copyScalarValue(v)
      })
      return {
        kind: 'array',
        value: { array, dims: value.dims, elementType: value.elementType },
        handler,
      }
    },
  }
  return handler
}

export function encodeUtf8(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

export function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}
