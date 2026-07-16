import * as fs from 'fs'
import * as path from 'path'
import { parse } from '../../src/index'
import {
  createState,
  runToCompletion,
  PascalFile,
  createRecordFileOps,
  populateSystemProcedures,
  populateSystemFunctions,
  evalExpr,
  StepCallback,
  State,
} from '../../src/interpreter'

const tanglePasPath = path.join(__dirname, '..', 'resources', 'tangle-official.pas')

function getActiveCode(state: State): string {
  if (state.stack.length === 0) return 'empty'
  const top = state.stack[state.stack.length - 1]
  if (top.kind === 'Function') {
    const fnFrame = top as any
    if (fnFrame.decl && fnFrame.decl.name) {
      return `Function: ${fnFrame.decl.name.name}`
    }
    return 'Function: unknown'
  }
  if (top.kind === 'Program') return 'Program'
  if (top.kind === 'Compound') {
    const caller = state.stack[state.stack.length - 2]
    if (caller && caller.kind === 'Function') {
      const fnCaller = caller as any
      if (fnCaller.decl && fnCaller.decl.name) {
        return `Compound in ${fnCaller.decl.name.name}`
      }
    }
    return 'Compound'
  }
  return top.kind
}

function getFullStack(state: State): string {
  const stack: string[] = []
  for (let i = state.stack.length - 1; i >= 0; i--) {
    const frame = state.stack[i]
    if (frame.kind === 'Function') {
      const fnFrame = frame as any
      if (fnFrame.decl && fnFrame.decl.name) {
        stack.push(fnFrame.decl.name.name)
      } else {
        stack.push('Function: unknown')
      }
    }
  }
  return stack.join(' → ')
}

/**
 * 用最小的 web 字符串跑 TANGLE，定位 "Pascal text flushed, = sign is missing" 的最小复现。
 */
function runTangle(webContent: string, stepCallback?: StepCallback): { pasOutput: string; termout: string; messages: string[] } {
  const pasSource = fs.readFileSync(tanglePasPath, 'utf-8')
  const parseResult = parse(pasSource)
  if (!parseResult.success) {
    throw new Error(`Parse failed: ${parseResult.error}`)
  }

  const webBytes = new TextEncoder().encode(webContent)

  const files = new Map<string, Uint8Array>()
  files.set('webfile', webBytes)
  files.set('changefile', new Uint8Array(0))
  files.set('terminfile', new Uint8Array(0))

  const fileOps = createRecordFileOps(files)

  const messages: string[] = []

  const pascalConsole = {
    write(_text: string) {},
    writeln() {},
    read() { return '' },
    readln() { return '' },
    eof() { return true },
    eoln() { return true },
  }

  const io = { file: fileOps, console: pascalConsole }
  const state = createState(parseResult.astNode, io)
  populateSystemProcedures(state, true)
  populateSystemFunctions(state)

  if (stepCallback) {
    state.stepCallback = stepCallback
  }

  state.systemProcedures.set('ASSERT', (args, s) => {
    const cond = evalExpr(args[0], s.currentScope, s)
    const condBool = typeof cond.rawValue === 'number' ? cond.rawValue !== 0 : !!cond.rawValue
    if (!condBool) {
      messages.push('ASSERT FAIL')
    }
  })
  state.systemProcedures.set('LOG_DEBUG', (args, s) => {
    if (args.length > 0) {
      const arg = evalExpr(args[0], s.currentScope, s)
      const text = typeof arg.rawValue === 'number' ? String(arg.rawValue)
        : String.fromCharCode(...((arg.rawValue as number[]) || []))
      messages.push(text)
    }
  })

  const fileMap: [string, string][] = [
    ['WEBFILE', 'webfile'],
    ['CHANGEFILE', 'changefile'],
    ['TERMIN', 'terminfile'],
    ['TERMOUT', 'termout'],
    ['PASCALFILE', 'pas'],
    ['POOL', 'pool'],
  ]

  for (const [pasName, url] of fileMap) {
    const val = state.globalScope.variables.get(pasName)
    if (val) {
      const pf = val.rawValue as PascalFile
      pf.url = url
      if (pasName === 'TERMOUT' || pasName === 'PASCALFILE' || pasName === 'POOL') {
        state.io.file.rewrite(pf)
      } else {
        state.io.file.reset(pf)
      }
    }
  }

  runToCompletion(state)

  const pasOutput = new TextDecoder().decode(files.get('pas') || new Uint8Array(0))
  const termout = new TextDecoder().decode(files.get('termout') || new Uint8Array(0))
  return { pasOutput, termout, messages }
}

describe('tangle min repro - module_name scan bug (ISSUE-003)', () => {
  // 最小复现：@p 前有 @ text (new_module) + @p 后有 2+ 个 module_name 引用
  // BUG 已修复：函数参数传递未正确绑定，导致 SCANREPL 中 T<>135 误判为 true
  test('MINIMAL REPRO: @ text + @p + 2 module_name refs (FIXED)', () => {
    const web = `@* Intro.
@ some text here
@p
@<bar@>@/
@<baz@>@/
@ end
`
    const { termout } = runTangle(web)
    expect(termout).not.toContain('= sign is missing')
  })

  // 对照组 1: 只有 1 个 module_name → 不触发
  test('control: @ text + @p + 1 module_name ref (no bug)', () => {
    const web = `@* Intro.
@ some text here
@p
@<bar@>@/
@ end
`
    const { termout } = runTangle(web)
    expect(termout).not.toContain('= sign is missing')
  })

  // 对照组 2: 无 @ text 前置 → 不触发
  test('control: no @ text + @p + 2 module_name refs (no bug)', () => {
    const web = `@* Intro.
@p
@<bar@>@/
@<baz@>@/
@ end
`
    const { termout } = runTangle(web)
    expect(termout).not.toContain('= sign is missing')
  })

  // 追踪执行路径，找到触发 bug 前的函数调用序列
  test('trace execution path before bug', () => {
    const web = `@* Intro.
@ some text here
@p
@<bar@>@/
@<baz@>@/
@ end
`
    const traceLines: string[] = []
    let lastStack = ''

    const callback: StepCallback = (state) => {
      const stack = getFullStack(state)
      if (stack && stack !== lastStack) {
        lastStack = stack
        traceLines.push(stack)
      }
    }

    const { termout } = runTangle(web, callback)
    
    console.log('\n=== Execution path before bug ===')
    console.log('Call stack transitions (top → bottom):')
    traceLines.forEach((line, i) => {
      console.log(`  ${i}: ${line}`)
    })
    console.log('===')

    expect(termout).not.toContain('= sign is missing')
  })

  // 追踪关键变量和文件读取
  test('trace key variables and file reads', () => {
    const web = `@* Intro.
@ some text here
@p
@<bar@>@/
@<baz@>@/
@ end
`
    const traceLog: string[] = []

    const callback: StepCallback = (state) => {
      const stack = getFullStack(state)
      
      const locVal = state.globalScope.variables.get('LOC')
      const limitVal = state.globalScope.variables.get('LIMIT')
      const nextControlVal = state.globalScope.variables.get('NEXTCONTROL')
      const lineVal = state.globalScope.variables.get('LINE')
      const curModuleVal = state.globalScope.variables.get('CURMODULE')
      
      const loc = locVal ? (locVal.rawValue as number) : -1
      const limit = limitVal ? (limitVal.rawValue as number) : -1
      const nextControl = nextControlVal ? (nextControlVal.rawValue as number) : -1
      const line = lineVal ? (lineVal.rawValue as number) : -1
      const curModule = curModuleVal ? (curModuleVal.rawValue as number) : -1
      
      if (stack.includes('SCAN_MODULE') && loc >= 0) {
        const key = `[scan_module] line=${line} loc=${loc}/${limit} nc=${nextControl} mod=${curModule}`
        if (traceLog.length === 0 || traceLog[traceLog.length - 1] !== key) {
          traceLog.push(key)
        }
      }
      if (stack.includes('SCAN_REPL') && loc >= 0) {
        const key = `[scan_repl] line=${line} loc=${loc}/${limit} nc=${nextControl} mod=${curModule}`
        if (traceLog.length === 0 || traceLog[traceLog.length - 1] !== key) {
          traceLog.push(key)
        }
      }
      if (stack.includes('GET_NEXT') && loc >= 0) {
        const key = `[get_next] line=${line} loc=${loc}/${limit} nc=${nextControl}`
        if (traceLog.length === 0 || traceLog[traceLog.length - 1] !== key) {
          traceLog.push(key)
        }
      }
    }

    const { termout, messages } = runTangleWithFileSpy(web, callback, traceLog)
    
    console.log('\n=== Execution Trace (minimal repro) ===')
    traceLog.forEach((line, i) => {
      console.log(`  ${i}: ${line}`)
    })
    console.log('===')
    
    console.log('\n=== LOG_DEBUG messages (minimal repro) ===')
    messages.forEach((msg, i) => {
      console.log(`  ${i}: ${msg}`)
    })
    console.log('===')

    expect(termout).not.toContain('= sign is missing')
  })

  // 对照组：只有 1 个 module_name，不触发 bug
  test('control trace: 1 module_name - no bug', () => {
    const web = `@* Intro.
@ some text here
@p
@<bar@>@/
@ end
`
    const traceLog: string[] = []

    const callback: StepCallback = (state) => {
      const stack = getFullStack(state)
      
      const locVal = state.globalScope.variables.get('LOC')
      const limitVal = state.globalScope.variables.get('LIMIT')
      const nextControlVal = state.globalScope.variables.get('NEXTCONTROL')
      const lineVal = state.globalScope.variables.get('LINE')
      const curModuleVal = state.globalScope.variables.get('CURMODULE')
      
      const loc = locVal ? (locVal.rawValue as number) : -1
      const limit = limitVal ? (limitVal.rawValue as number) : -1
      const nextControl = nextControlVal ? (nextControlVal.rawValue as number) : -1
      const line = lineVal ? (lineVal.rawValue as number) : -1
      const curModule = curModuleVal ? (curModuleVal.rawValue as number) : -1
      
      if (stack.includes('SCAN_MODULE') && loc >= 0) {
        const key = `[scan_module] line=${line} loc=${loc}/${limit} nc=${nextControl} mod=${curModule}`
        if (traceLog.length === 0 || traceLog[traceLog.length - 1] !== key) {
          traceLog.push(key)
        }
      }
      if (stack.includes('SCAN_REPL') && loc >= 0) {
        const key = `[scan_repl] line=${line} loc=${loc}/${limit} nc=${nextControl} mod=${curModule}`
        if (traceLog.length === 0 || traceLog[traceLog.length - 1] !== key) {
          traceLog.push(key)
        }
      }
      if (stack.includes('GET_NEXT') && loc >= 0) {
        const key = `[get_next] line=${line} loc=${loc}/${limit} nc=${nextControl}`
        if (traceLog.length === 0 || traceLog[traceLog.length - 1] !== key) {
          traceLog.push(key)
        }
      }
    }

    const { termout, messages } = runTangleWithFileSpy(web, callback, traceLog)
    
    console.log('\n=== Control Trace (1 module_name) ===')
    traceLog.forEach((line, i) => {
      console.log(`  ${i}: ${line}`)
    })
    console.log('===')

    expect(termout).not.toContain('= sign is missing')
  })

  // 收集所有进入过的函数/过程和使用的全局变量，并在关键变量更新时打印状态
  test('collect all functions/procedures/global vars used with state dump', () => {
    const web = `@* Intro.
@ some text here
@p
@<bar@>@/
@<baz@>@/
@ end
`
    const functionsSet = new Set<string>()
    const globalVarsSet = new Set<string>()
    const keyVars = ['LOC', 'LIMIT', 'NEXTCONTROL', 'CURMODULE', 'MODULECOUNT']
    const maxLogs = 100
    let logCount = 0

    const callback: StepCallback = (state) => {
    }

    runTangleWithProxySpy(web, callback, functionsSet, globalVarsSet, keyVars, maxLogs, logCount)
    
    console.log('\n=== Functions/Procedures called ===')
    const sortedFuncs = Array.from(functionsSet).sort()
    sortedFuncs.forEach((fn, i) => {
      console.log(`  ${i}: ${fn}`)
    })
    console.log(`Total: ${sortedFuncs.length}`)
    console.log('===')
    
    console.log('\n=== Global variables modified ===')
    const sortedVars = Array.from(globalVarsSet).sort()
    sortedVars.forEach((v, i) => {
      console.log(`  ${i}: ${v}`)
    })
    console.log(`Total: ${sortedVars.length}`)
    console.log('===')

    expect(true).toBe(true)
  })
})

/**
 * 带 Proxy 追踪的 TANGLE 运行函数
 * 使用 Proxy 拦截 state.globalScope.variables 和 state.stack 的操作
 */
function runTangleWithProxySpy(
  webContent: string, 
  stepCallback?: StepCallback,
  functionsSet?: Set<string>,
  globalVarsSet?: Set<string>,
  keyVars?: string[],
  maxLogs: number = 100,
  logCount: number = 0
): { pasOutput: string; termout: string; messages: string[] } {
  const pasSource = fs.readFileSync(tanglePasPath, 'utf-8')
  const parseResult = parse(pasSource)
  if (!parseResult.success) {
    throw new Error(`Parse failed: ${parseResult.error}`)
  }

  const webBytes = new TextEncoder().encode(webContent)

  const files = new Map<string, Uint8Array>()
  files.set('webfile', webBytes)
  files.set('changefile', new Uint8Array(0))
  files.set('terminfile', new Uint8Array(0))

  const fileOps = createRecordFileOps(files)

  const messages: string[] = []

  const pascalConsole = {
    write(_text: string) {},
    writeln() {},
    read() { return '' },
    readln() { return '' },
    eof() { return true },
    eoln() { return true },
  }

  const io = { file: fileOps, console: pascalConsole }
  const state = createState(parseResult.astNode, io)
  populateSystemProcedures(state, true)
  populateSystemFunctions(state)

  if (stepCallback) {
    state.stepCallback = stepCallback
  }

  state.systemProcedures.set('ASSERT', (args, s) => {
    const cond = evalExpr(args[0], s.currentScope, s)
    const condBool = typeof cond.rawValue === 'number' ? cond.rawValue !== 0 : !!cond.rawValue
    if (!condBool) {
      messages.push('ASSERT FAIL')
    }
  })
  state.systemProcedures.set('LOG_DEBUG', (args, s) => {
    if (args.length > 0) {
      const arg = evalExpr(args[0], s.currentScope, s)
      const text = typeof arg.rawValue === 'number' ? String(arg.rawValue)
        : String.fromCharCode(...((arg.rawValue as number[]) || []))
      messages.push(text)
    }
  })

  // 使用 Proxy 拦截 globalScope.variables 的 set 操作
  if (globalVarsSet || keyVars) {
    const origVars = state.globalScope.variables
    const prevValues = new Map<string, any>()
    const logCounter = { count: 0 }
    
    state.globalScope.variables = new Proxy(origVars, {
      get(target, prop) {
        const result = Reflect.get(target, prop)
        if (prop === 'set' && typeof result === 'function') {
          return (...args: any[]) => {
            const varName = args[0]
            const newValue = args[1]
            
            if (globalVarsSet) {
              globalVarsSet.add(varName)
            }
            
            if (keyVars && keyVars.includes(varName) && logCounter.count < maxLogs) {
              const prev = prevValues.get(varName)
              const curr = newValue.rawValue
              const changed = prev !== curr
              prevValues.set(varName, curr)

              // 只在 LOC 被设为 0 时打印（跳过初始赋值）
              if (varName === 'LOC' && curr === 0 && prev !== undefined) {
                logCounter.count++
                console.log(`\n=== [${logCounter.count}] LOC SET TO 0 (was ${prev}) ===`)
                console.log('  Call stack (top->bottom):')
                for (let i = state.stack.length - 1; i >= 0; i--) {
                  const frame = state.stack[i] as any
                  if (frame.kind === 'Function' && frame.decl && frame.decl.name) {
                    console.log(`    ${i}: ${frame.decl.name.name}`)
                  } else {
                    console.log(`    ${i}: ${frame.kind}`)
                  }
                }
                console.log('  Key vars:')
                for (const kv of keyVars) {
                  if (kv !== varName) {
                    const val = state.globalScope.variables.get(kv)
                    if (val) console.log(`    ${kv}: ${val.rawValue}`)
                  }
                }
              }
            }
            
            return result.apply(target, args)
          }
        }
        if (typeof result === 'function') {
          return result.bind(target)
        }
        return result
      }
    })
  }

  // 使用 Proxy 拦截 stack 的 push 操作
  if (functionsSet) {
    const origStack = state.stack
    state.stack = new Proxy(origStack, {
      get(target, prop) {
        const result = Reflect.get(target, prop)
        if (prop === 'push' && typeof result === 'function') {
          return (...args: any[]) => {
            for (const arg of args) {
              if (arg.kind === 'Function' && arg.decl && arg.decl.name) {
                functionsSet.add(arg.decl.name.name)
              }
            }
            return result.apply(target, args)
          }
        }
        if (typeof result === 'function') {
          return result.bind(target)
        }
        return result
      }
    })
  }

  const fileMap: [string, string][] = [
    ['WEBFILE', 'webfile'],
    ['CHANGEFILE', 'changefile'],
    ['TERMIN', 'terminfile'],
    ['TERMOUT', 'termout'],
    ['PASCALFILE', 'pas'],
    ['POOL', 'pool'],
  ]

  for (const [pasName, url] of fileMap) {
    const val = state.globalScope.variables.get(pasName)
    if (val) {
      const pf = val.rawValue as PascalFile
      pf.url = url
      if (pasName === 'TERMOUT' || pasName === 'PASCALFILE' || pasName === 'POOL') {
        state.io.file.rewrite(pf)
      } else {
        state.io.file.reset(pf)
      }
    }
  }

  runToCompletion(state)

  const pasOutput = new TextDecoder().decode(files.get('pas') || new Uint8Array(0))
  const termout = new TextDecoder().decode(files.get('termout') || new Uint8Array(0))
  return { pasOutput, termout, messages }
}

/**
 * 带追踪的 TANGLE 运行函数
 */
function runTangleWithFileSpy(
  webContent: string, 
  stepCallback?: StepCallback,
  traceLog?: string[]
): { pasOutput: string; termout: string; messages: string[] } {
  const pasSource = fs.readFileSync(tanglePasPath, 'utf-8')
  const parseResult = parse(pasSource)
  if (!parseResult.success) {
    throw new Error(`Parse failed: ${parseResult.error}`)
  }

  const webBytes = new TextEncoder().encode(webContent)

  const files = new Map<string, Uint8Array>()
  files.set('webfile', webBytes)
  files.set('changefile', new Uint8Array(0))
  files.set('terminfile', new Uint8Array(0))

  const fileOps = createRecordFileOps(files)

  const messages: string[] = []

  const pascalConsole = {
    write(_text: string) {},
    writeln() {},
    read() { return '' },
    readln() { return '' },
    eof() { return true },
    eoln() { return true },
  }

  const io = { file: fileOps, console: pascalConsole }
  const state = createState(parseResult.astNode, io)
  populateSystemProcedures(state, true)
  populateSystemFunctions(state)

  if (stepCallback) {
    state.stepCallback = stepCallback
  }

  state.systemProcedures.set('ASSERT', (args, s) => {
    const cond = evalExpr(args[0], s.currentScope, s)
    const condBool = typeof cond.rawValue === 'number' ? cond.rawValue !== 0 : !!cond.rawValue
    if (!condBool) {
      messages.push('ASSERT FAIL')
    }
  })
  state.systemProcedures.set('LOG_DEBUG', (args, s) => {
    if (args.length > 0) {
      const arg = evalExpr(args[0], s.currentScope, s)
      const text = typeof arg.rawValue === 'number' ? String(arg.rawValue)
        : String.fromCharCode(...((arg.rawValue as number[]) || []))
      messages.push(text)
    }
  })

  // 文件读取打桩 - 追踪 inputln 调用（行级）
  const origReadln = state.io.file.readln.bind(state.io.file)
  let readlnCount = 0
  
  state.io.file.readln = (file) => {
    if (file.url === 'webfile' && traceLog) {
      readlnCount++
      const content = files.get('webfile') || new Uint8Array(0)
      const beforeOffset = file.offset
      traceLog.push(`  READLN[${readlnCount}]: before offset=${beforeOffset}`)
    }
    origReadln(file)
    if (file.url === 'webfile' && traceLog) {
      const content = files.get('webfile') || new Uint8Array(0)
      const afterOffset = file.offset
      traceLog.push(`  READLN[${readlnCount}]: after offset=${afterOffset}`)
    }
  }

  const fileMap: [string, string][] = [
    ['WEBFILE', 'webfile'],
    ['CHANGEFILE', 'changefile'],
    ['TERMIN', 'terminfile'],
    ['TERMOUT', 'termout'],
    ['PASCALFILE', 'pas'],
    ['POOL', 'pool'],
  ]

  for (const [pasName, url] of fileMap) {
    const val = state.globalScope.variables.get(pasName)
    if (val) {
      const pf = val.rawValue as PascalFile
      pf.url = url
      if (pasName === 'TERMOUT' || pasName === 'PASCALFILE' || pasName === 'POOL') {
        state.io.file.rewrite(pf)
      } else {
        state.io.file.reset(pf)
      }
    }
  }

  runToCompletion(state)

  const pasOutput = new TextDecoder().decode(files.get('pas') || new Uint8Array(0))
  const termout = new TextDecoder().decode(files.get('termout') || new Uint8Array(0))
  return { pasOutput, termout, messages }
}
