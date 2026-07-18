// VM 核心：执行 JsonCode（单循环模型）

import type {
  JsonCode,
  JsonInstruction,
  ProcDef,
  PascalValue,
  Ref,
  TypeDef,
} from './jsoncode'
import type {
  TypePlugin,
  RuntimeCtx,
  SysCallHandler,
  TypeTable,
} from '../types'
import {
  createTypeTable,
} from '../types'
import type { PascalIO, PascalFile } from './file-model'
import {
  VMState,
  StackFrame,
  createVMState,
  createStackFrame,
  getValue,
  setValue,
  topFrame,
  resolveVarBinding,
} from './state'

// ============================================================================
// 编译后的过程
// ============================================================================

interface CompiledProc {
  name: string
  body: ExecFunc[]
  labelMap: Map<string, number>
  params: ProcDef['params']
  returnType?: string
  locals: ProcDef['locals']
  maxTemps: number
  level?: number
}

type ExecFunc = (state: VMState, runtime: RuntimeCtx, ctx: VMContext) => Promise<void> | void

// ============================================================================
// VMContext: 传递 procMap 给指令
// ============================================================================

interface VMContext {
  procMap: Map<string, CompiledProc>
  plugins: TypePlugin[]
  // 全局文件变量名（大写）→ URL；DECLARE file 变量时自动 ASSIGN
  programFileUrls?: Record<string, string>
}

// ============================================================================
// VM 执行入口
// ============================================================================

export interface VMOptions {
  input?: string[]
  typePlugins?: TypePlugin[]
  sysCalls?: Map<string, SysCallHandler>
  io?: PascalIO
  // 全局文件变量名（大写）→ 文件 URL；VM 启动时自动 ASSIGN
  programFileUrls?: Record<string, string>
  // 最大执行步数，默认 1 亿；大程序（如 TEX82）可设更大
  maxSteps?: number
}

export async function execute(
  jsonCode: JsonCode,
  options: VMOptions = {}
): Promise<VMState> {
  // 构建类型表
  const typeTable = createTypeTable()
  for (const typeDef of jsonCode.typeTable) {
    typeTable.register(typeDef)
  }

  const plugins = options.typePlugins || []
  for (const plugin of plugins) {
    for (const typeDef of plugin.types) {
      if (!typeTable.has(typeDef.id)) {
        typeTable.register(typeDef)
      }
    }
  }

  const sysCalls = options.sysCalls || new Map<string, SysCallHandler>()
  const runtime: RuntimeCtx = { typeTable, sysCalls, io: options.io }

  // 编译所有过程
  const procMap = new Map<string, CompiledProc>()
  const ctx: VMContext = { procMap, plugins, programFileUrls: options.programFileUrls }
  for (const proc of jsonCode.procedures) {
    procMap.set(proc.name.toUpperCase(), compileProc(proc, plugins, runtime, ctx))
  }

  // 创建状态
  const state = createVMState()
  state.inputQueue = options.input ? [...options.input] : []

  // 初始化全局变量
  for (const g of jsonCode.globals) {
    const typeDef = typeTable.get(g.typeId)
    state.globals[g.name.toUpperCase()] = getDefault(typeDef, plugins, runtime)
  }

  // 创建入口栈帧
  const entryName = jsonCode.entry.toUpperCase()
  const entryProc = procMap.get(entryName)
  if (!entryProc) {
    throw new Error(`VM: entry procedure ${jsonCode.entry} not found`)
  }

  state.callStack.push(createStackFrame(entryName, -1, ''))
  state.currentProc = entryName
  state.pc = 0

  // 初始化入口过程的临时槽位
  for (let i = 0; i < entryProc.maxTemps; i++) {
    topFrame(state).temps.push({ typeId: 'unknown', raw: undefined })
  }

  // 初始化入口过程的局部变量
  for (const local of entryProc.locals) {
    const typeDef = typeTable.get(local.typeId)
    topFrame(state).locals[local.name.toUpperCase()] = getDefault(typeDef, plugins, runtime)
  }

  // 注意：programFileUrls 的 ASSIGN 不在此处处理
  // 因为 VAR 声明的 DECLARE 指令会在 MAIN body 执行时重新创建 PascalValue，覆盖 locals
  // 所以 programFileUrls 在 DECLARE 指令内部处理（见 compileInstruction DECLARE case）

  // 主执行循环
  try {
    await runLoop(state, runtime, ctx, options.maxSteps || 100000000)
    state.status = 'terminated'
  } catch (e: any) {
    state.status = 'error'
    state.error = {
      message: e.message || String(e),
      instructionIndex: state.pc,
      stackTrace: state.callStack.map((f) => f.procName).reverse(),
    }
  }

  return state
}

// ============================================================================
// 主执行循环
// ============================================================================

async function runLoop(
  state: VMState,
  runtime: RuntimeCtx,
  ctx: VMContext,
  maxSteps: number
): Promise<void> {
  while (state.status === 'running' && state.callStack.length > 0) {
    if (state.stepsExecuted++ >= maxSteps) {
      state.status = 'terminated'
      state.error = {
        message: 'VM: step limit exceeded (possible infinite loop)',
        instructionIndex: state.pc,
        stackTrace: state.callStack.map((f) => f.procName).reverse(),
      }
      return
    }

    const currentFrame = topFrame(state)
    const proc = ctx.procMap.get(currentFrame.procName.toUpperCase())
    if (!proc) {
      throw new Error(`VM: unknown procedure ${currentFrame.procName}`)
    }

    if (state.pc < 0 || state.pc >= proc.body.length) {
      // 过程结束（没有 RET），隐式返回
      const frame = state.callStack.pop()!
      // 处理返回值（函数没有显式 RET 时返回默认值）
      if (frame.returnDest && state.returnValue) {
        setValue(state, frame.returnDest, state.returnValue)
        state.returnValue = null
      }
      if (state.callStack.length === 0) {
        return
      }
      state.pc = frame.returnAddress
      state.currentProc = frame.returnProc
      continue
    }

    const fn = proc.body[state.pc]
    const result = fn(state, runtime, ctx)
    if (result && typeof result.then === 'function') {
      await result
    }
  }
}

// ============================================================================
// 过程编译
// ============================================================================

function compileProc(
  proc: ProcDef,
  plugins: TypePlugin[],
  runtime: RuntimeCtx,
  ctx: VMContext
): CompiledProc {
  const labelMap = new Map<string, number>()
  proc.body.forEach((inst, i) => {
    if (inst.op === 'LABEL') {
      labelMap.set(inst.label, i)
    }
  })

  const body = proc.body.map((inst, index) => {
    return compileInstruction(inst, index, labelMap, plugins, runtime, ctx)
  })

  return {
    name: proc.name,
    body,
    labelMap,
    params: proc.params,
    returnType: proc.returnType,
    locals: proc.locals,
    maxTemps: proc.maxTemps,
    level: proc.level,
  }
}

function compileInstruction(
  inst: JsonInstruction,
  index: number,
  labelMap: Map<string, number>,
  plugins: TypePlugin[],
  runtime: RuntimeCtx,
  ctx: VMContext
): ExecFunc {
  switch (inst.op) {
    case 'DECLARE': {
      const { typeId, scope, name } = inst
      const typeDef = runtime.typeTable.get(typeId)
      const isFile = typeDef?.kind === 'file'
      if (isFile) {
        return async (state, _runtime, ctx) => {
          const value = getDefault(typeDef, plugins, runtime)
          if (scope === 'global') {
            state.globals[name.toUpperCase()] = value
          } else {
            topFrame(state).locals[name.toUpperCase()] = value
          }
          if (ctx.programFileUrls && runtime.io) {
            const upper = name.toUpperCase()
            const url = ctx.programFileUrls[upper]
            if (url && typeof value.raw === 'object' && 'url' in (value.raw as any)) {
              await runtime.io.file.assign(value.raw as PascalFile, url)
            }
          }
          state.pc++
        }
      }
      return (state) => {
        const value = getDefault(typeDef, plugins, runtime)
        if (scope === 'global') {
          state.globals[name.toUpperCase()] = value
        } else {
          topFrame(state).locals[name.toUpperCase()] = value
        }
        state.pc++
      }
    }

    case 'MOVE': {
      const { dest, src } = inst
      return (state) => {
        setValue(state, dest, getValue(state, src))
        state.pc++
      }
    }

    case 'LITERAL': {
      const { dest, typeId, value } = inst
      return (state) => {
        // 直接创建值，不通过 plugin invoke（避免类型混淆）
        setValue(state, dest, { typeId, raw: value })
        state.pc++
      }
    }

    case 'TEMP_ALLOC': {
      const { count } = inst
      return (state) => {
        const frame = topFrame(state)
        for (let i = 0; i < count; i++) {
          frame.temps.push({ typeId: 'unknown', raw: undefined })
        }
        state.pc++
      }
    }

    case 'TEMP_FREE': {
      const { count } = inst
      return (state) => {
        const frame = topFrame(state)
        frame.temps.splice(frame.temps.length - count, count)
        state.pc++
      }
    }

    case 'LABEL': {
      return (state) => { state.pc++ }
    }

    case 'JMP': {
      const target = labelMap.get(inst.target)
      if (target === undefined) {
        return () => { throw new Error(`VM: unknown label ${inst.target}`) }
      }
      return (state) => { state.pc = target }
    }

    case 'JMP_IF_FALSE': {
      const target = labelMap.get(inst.target)
      if (target === undefined) {
        return () => { throw new Error(`VM: unknown label ${inst.target}`) }
      }
      const condRef = inst.cond
      return (state, runtime) => {
        const condValue = getValue(state, condRef)
        const controlOp = findControlOp(plugins, condValue.typeId, runtime)
        const boolResult = controlOp
          ? controlOp.invoke(condValue, runtime)
          : Boolean(condValue.raw)
        if (!boolResult) {
          state.pc = target
        } else {
          state.pc++
        }
      }
    }

    case 'CALL': {
      const procName = inst.proc.toUpperCase()
      const argRefs = inst.args
      const dest = inst.dest
      return (state, runtime, ctx) => {
        const proc = ctx.procMap.get(procName)
        if (!proc) {
          throw new Error(`VM: unknown procedure ${procName}`)
        }

        const argValues = argRefs.map((r) => getValue(state, r))
        const returnAddress = state.pc + 1
        const returnProc = state.currentProc
        const staticLink = state.callStack.length > 0 ? state.callStack.length - 1 : undefined
        const frame = createStackFrame(proc.name, returnAddress, returnProc, staticLink, proc.level)
        frame.returnDest = dest

        for (const local of proc.locals) {
          const typeDef = runtime.typeTable.get(local.typeId)
          frame.locals[local.name.toUpperCase()] = getDefault(typeDef, plugins, runtime)
        }

        proc.params.forEach((param, i) => {
          const argValue = argValues[i]
          if (param.isVar) {
            frame.varBindings[param.name.toUpperCase()] = resolveVarBinding(state, argRefs[i])
          } else {
            frame.locals[param.name.toUpperCase()] = argValue
          }
        })

        for (let i = 0; i < proc.maxTemps; i++) {
          frame.temps.push({ typeId: 'unknown', raw: undefined })
        }

        state.callStack.push(frame)
        state.currentProc = proc.name
        state.pc = 0
      }
    }

    case 'RET': {
      const valueRef = inst.value
      return (state) => {
        if (valueRef) {
          state.returnValue = getValue(state, valueRef)
        }
        const frame = state.callStack.pop()!
        // 处理返回值：存储到调用者的 dest
        if (frame.returnDest && state.returnValue) {
          setValue(state, frame.returnDest, state.returnValue)
          state.returnValue = null
        }
        if (state.callStack.length === 0) {
          state.status = 'terminated'
          return
        }
        state.pc = frame.returnAddress
        state.currentProc = frame.returnProc
      }
    }

    case 'SYS_CALL': {
      const procName = inst.proc.toUpperCase()
      const argRefs = inst.args
      const argFormats = inst.argFormats
      const dest = inst.dest
      return async (state, runtime) => {
        const handler = runtime.sysCalls.get(procName)
        if (!handler) {
          throw new Error(`VM: unknown system call ${procName}`)
        }
        const args = argRefs.map((r, i) => {
          const fmt = argFormats?.[i]
          return {
            ref: r,
            value: getValue(state, r),
            width: fmt?.width !== undefined ? Number(getValue(state, fmt.width).raw) : undefined,
            precision: fmt?.precision !== undefined ? Number(getValue(state, fmt.precision).raw) : undefined,
          }
        })
        const result = await handler(args, state, runtime)
        if (dest && result !== undefined && result !== null) {
          setValue(state, dest, result as PascalValue)
        }
        state.pc++
      }
    }

    case 'TYPE_OP': {
      const { typeId, opName, opKind, dest, src: srcRefs, extra } = inst
      const op = findOp(plugins, opKind, opName, typeId, runtime.typeTable)
      if (!op) {
        throw new Error(`VM: unknown op ${opKind}.${opName} for type ${typeId}`)
      }
      const invoke = (op as any).invoke

      if (opKind === 'compare') {
        const opStr = (extra as any)?.op || opName
        return (state, runtime) => {
          const left = getValue(state, srcRefs[0])
          const right = getValue(state, srcRefs[1])
          setValue(state, dest, invoke(left, right, opStr, runtime))
          state.pc++
        }
      }
      if (opKind === 'assign') {
        return (state, runtime) => {
          const destValue = getValue(state, dest)
          const srcValue = getValue(state, srcRefs[0])
          setValue(state, dest, invoke(destValue, srcValue, runtime))
          state.pc++
        }
      }
      if (opKind === 'copy') {
        return (state, runtime) => {
          setValue(state, dest, invoke(getValue(state, srcRefs[0]), runtime))
          state.pc++
        }
      }
      if (opKind === 'default') {
        return (state, runtime) => {
          setValue(state, dest, invoke(typeId, runtime))
          state.pc++
        }
      }
      if (opKind === 'control') {
        return (state, runtime) => {
          const bool = invoke(getValue(state, srcRefs[0]), runtime)
          setValue(state, dest, { typeId: 'boolean', raw: bool })
          state.pc++
        }
      }
      if (opKind === 'index') {
        return (state) => {
          const arrayValue = getValue(state, srcRefs[0])
          const indices = srcRefs.slice(1).map((r) => getValue(state, r))
          setValue(state, dest, invoke(arrayValue, ...indices))
          state.pc++
        }
      }
      if (opKind === 'setIndex') {
        return (state) => {
          const arrayValue = getValue(state, dest)
          const args = srcRefs.map((r) => getValue(state, r))
          const indices = args.slice(0, args.length - 1)
          const value = args[args.length - 1]
          setValue(state, dest, invoke(arrayValue, ...indices, value))
          state.pc++
        }
      }
      if (opKind === 'field') {
        const fieldName = (extra as any)?.field
        return (state, runtime) => {
          setValue(state, dest, invoke(getValue(state, srcRefs[0]), fieldName, runtime))
          state.pc++
        }
      }
      if (opKind === 'setField') {
        const fieldName = (extra as any)?.field
        return (state, runtime) => {
          const recordValue = getValue(state, dest)
          const value = getValue(state, srcRefs[0])
          setValue(state, dest, invoke(recordValue, value, fieldName, runtime))
          state.pc++
        }
      }
      // unary / binary / call 等通用情况
      return (state, runtime) => {
        const args = srcRefs.map((r) => getValue(state, r))
        setValue(state, dest, invoke(...args, runtime))
        state.pc++
      }
    }

    default:
      return (state) => { state.pc++ }
  }
}

// ============================================================================
// 辅助函数
// ============================================================================

function getDefault(
  typeDef: TypeDef | undefined,
  plugins: TypePlugin[],
  runtime: RuntimeCtx
): PascalValue {
  if (!typeDef) {
    return { typeId: 'unknown', raw: undefined }
  }
  for (const plugin of plugins) {
    const defaultOp = plugin.ops.default
    if (defaultOp && defaultOp.can(typeDef.id, runtime.typeTable)) {
      return defaultOp.invoke(typeDef.id, runtime)
    }
  }
  return { typeId: typeDef.id, raw: undefined }
}

function findOp(
  plugins: TypePlugin[],
  opKind: string,
  opName: string,
  typeId?: string,
  typeTable?: TypeTable
): { invoke: (...args: any[]) => PascalValue; toCode: (...args: any[]) => JsonInstruction[] } | null {
  for (const plugin of plugins) {
    const ops = plugin.ops as any
    const category = ops[opKind]
    if (!category) continue
    if (opKind === 'literal' || opKind === 'default' || opKind === 'copy' || opKind === 'control' || opKind === 'assign' || opKind === 'index' || opKind === 'setIndex' || opKind === 'field' || opKind === 'setField') {
      if (typeId && typeTable && category.can) {
        if (opKind === 'assign') {
          if (category.can(typeId, typeId, typeTable)) return category
        } else if (opKind === 'default' || opKind === 'copy' || opKind === 'control') {
          if (category.can(typeId, typeTable)) return category
        } else {
          // index/setIndex/field/setField: 暂时不做 can 检查，返回第一个匹配的
          // 因为这些操作需要额外参数（fieldName, indexType等），findOp时没有这些信息
          return category
        }
      } else {
        return category
      }
    } else {
      if (category[opName]) {
        return category[opName]
      }
    }
  }
  return null
}

function findControlOp(
  plugins: TypePlugin[],
  typeId: string,
  runtime: RuntimeCtx
): { invoke: (value: PascalValue, runtime: RuntimeCtx) => boolean } | null {
  for (const plugin of plugins) {
    const controlOp = plugin.ops.control
    if (controlOp && controlOp.can(typeId, runtime.typeTable)) {
      return controlOp
    }
  }
  return null
}
