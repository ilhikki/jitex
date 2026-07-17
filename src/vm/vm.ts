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
} from '../types'
import {
  createTypeTable,
} from '../types'
import {
  VMState,
  StackFrame,
  createVMState,
  createStackFrame,
  getValue,
  setValue,
  topFrame,
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
}

// ============================================================================
// VM 执行入口
// ============================================================================

export interface VMOptions {
  input?: string[]
  typePlugins?: TypePlugin[]
  sysCalls?: Map<string, SysCallHandler>
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
  const runtime: RuntimeCtx = { typeTable, sysCalls }

  // 编译所有过程
  const procMap = new Map<string, CompiledProc>()
  const ctx: VMContext = { procMap, plugins }
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

  // 主执行循环
  try {
    await runLoop(state, runtime, ctx)
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
  ctx: VMContext
): Promise<void> {
  const maxSteps = 10000000
  let steps = 0

  while (state.status === 'running' && state.callStack.length > 0) {
    if (steps++ > maxSteps) {
      throw new Error('VM: step limit exceeded (possible infinite loop)')
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
    await fn(state, runtime, ctx)
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
      return (state) => {
        const typeDef = runtime.typeTable.get(typeId)
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
      return async (state, runtime, ctx) => {
        const proc = ctx.procMap.get(procName)
        if (!proc) {
          throw new Error(`VM: unknown procedure ${procName}`)
        }

        const argValues = argRefs.map((r) => getValue(state, r))
        const returnAddress = state.pc + 1
        const returnProc = state.currentProc
        const staticLink = state.callStack.length > 0 ? state.callStack.length - 1 : undefined
        const frame = createStackFrame(proc.name, returnAddress, returnProc, staticLink, proc.level)
        frame.returnDest = dest  // 记录返回值存储位置

        // 初始化局部变量
        for (const local of proc.locals) {
          const typeDef = runtime.typeTable.get(local.typeId)
          frame.locals[local.name.toUpperCase()] = getDefault(typeDef, plugins, runtime)
        }

        // 绑定参数
        proc.params.forEach((param, i) => {
          const argValue = argValues[i]
          if (param.isVar) {
            frame.varBindings[param.name.toUpperCase()] = argRefs[i]
          } else {
            frame.locals[param.name.toUpperCase()] = argValue
          }
        })

        // 分配临时槽位
        for (let i = 0; i < proc.maxTemps; i++) {
          frame.temps.push({ typeId: 'unknown', raw: undefined })
        }

        state.callStack.push(frame)
        state.currentProc = proc.name
        state.pc = 0
        // 主循环会自动执行新过程
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
      const dest = inst.dest
      return async (state, runtime) => {
        const handler = runtime.sysCalls.get(procName)
        if (!handler) {
          throw new Error(`VM: unknown system call ${procName}`)
        }
        const args = argRefs.map((r) => ({ ref: r, value: getValue(state, r) }))
        const result = await handler(args, state)
        if (dest && result !== undefined && result !== null) {
          setValue(state, dest, result as PascalValue)
        }
        state.pc++
      }
    }

    case 'TYPE_OP': {
      const { typeId, opName, opKind, dest, src: srcRefs, extra } = inst
      return (state, runtime) => {
        const op = findOp(plugins, opKind, opName)
        if (!op) {
          throw new Error(`VM: unknown op ${opKind}.${opName} for type ${typeId}`)
        }
        const args = srcRefs.map((r) => getValue(state, r))
        const invoke = (op as any).invoke
        let result: PascalValue
        if (opKind === 'compare') {
          const opStr = (extra as any)?.op || opName
          result = invoke(args[0], args[1], opStr, runtime)
        } else if (opKind === 'assign') {
          // assign invoke(dest, src, runtime) — 需要 dest 当前值和 src 新值
          const destValue = getValue(state, dest)
          result = invoke(destValue, args[0], runtime)
        } else if (opKind === 'copy') {
          // copy invoke(value, runtime) — 只需要 src 值
          result = invoke(args[0], runtime)
        } else if (opKind === 'default') {
          result = invoke(typeId, runtime)
        } else if (opKind === 'control') {
          const bool = invoke(args[0], runtime)
          result = { typeId: 'boolean', raw: bool }
        } else if (opKind === 'index') {
          const arrayValue = args[0]
          const indices = args.slice(1)
          result = invoke(arrayValue, ...indices)
        } else if (opKind === 'setIndex') {
          const arrayValue = getValue(state, dest)
          const indices = args.slice(0, args.length - 1)
          const value = args[args.length - 1]
          result = invoke(arrayValue, ...indices, value)
        } else if (opKind === 'field') {
          const fieldName = (extra as any)?.field
          result = invoke(args[0], fieldName, runtime)
        } else if (opKind === 'setField') {
          const recordValue = getValue(state, dest)
          const fieldName = (extra as any)?.field
          const value = args[0]
          result = invoke(recordValue, value, fieldName, runtime)
        } else {
          result = invoke(...args, runtime)
        }
        setValue(state, dest, result)
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
  opName: string
): { invoke: (...args: any[]) => PascalValue; toCode: (...args: any[]) => JsonInstruction[] } | null {
  for (const plugin of plugins) {
    const ops = plugin.ops as any
    const category = ops[opKind]
    if (!category) continue
    if (opKind === 'literal' || opKind === 'default' || opKind === 'copy' || opKind === 'control' || opKind === 'assign' || opKind === 'index' || opKind === 'setIndex' || opKind === 'field' || opKind === 'setField') {
      return category
    }
    if (category[opName]) {
      return category[opName]
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
