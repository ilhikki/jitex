// m5 测试辅助函数
// 默认走 JS 编译器（M5）；显式指定 engine='vm' 时回退到 M4 解释器

import { runJS as runJSImpl } from '../../src/js-compiler'
import type { VMState } from '../../src/js-compiler/vm-state'
import type { TypePlugin, SysCallHandler } from '../../src/js-compiler/types'

async function runVMImpl(code: string, options?: any): Promise<VMState> {
  return await runJSImpl(code, options)
}

export interface VMTest {
  name: string
  code: string
  purpose: string
  features: string[]
  expectedOutput?: string
  expectedContains?: string
  expectedNotContains?: string
  expectedError?: string
  input?: string[]
  plugins?: TypePlugin[]
  // 内存文件存储
  files?: Map<string, Uint8Array>
  // 全局文件变量名 → URL
  programFileUrls?: Record<string, string>
  // 文件内容包含检查（runVM 完成后检查 files.get(url) 是否包含 substring）
  expectedFileContains?: { url: string; contains: string }[]
  // 自定义系统调用（非标扩展用）
  sysCalls?: Map<string, SysCallHandler>
  // 执行引擎：'js'（默认，M5 JS 编译器）| 'vm'（M4 解释器，回退用）
  engine?: 'vm' | 'js'
  // 非标扩展：允许无 LABEL 声明的 goto（Berkeley/DEC Pascal 扩展）
  allowUndeclaredLabels?: boolean
  // 调试：失败时打印编译后的 JS 代码
  debugEmitJS?: boolean
}

export async function runVM(test: VMTest): Promise<VMState> {
  const engine = test.engine || 'js'
  if (engine === 'js') {
    // M5: JS 编译器执行路径
    const state = await runJSImpl(test.code, {
      input: test.input,
      plugins: test.plugins,
      sysCalls: test.sysCalls,
      files: test.files,
      programFileUrls: test.programFileUrls,
      maxSteps: 1e9,
      allowUndeclaredLabels: test.allowUndeclaredLabels,
      debug: test.debugEmitJS ? { emitJS: true } : undefined,
    })
    return state
  }
  return await runVMImpl(test.code, {
    input: test.input,
    plugins: test.plugins,
    files: test.files,
    programFileUrls: test.programFileUrls,
    sysCalls: test.sysCalls,
  })
}

export function getOutput(state: VMState): string {
  return state.outputBuffer.join('')
}

export async function runVMTest(test: VMTest): Promise<{ passed: boolean; message: string; state: VMState }> {
  try {
    const state = await runVM(test)
    const output = getOutput(state)

    if (test.expectedError !== undefined) {
      if (state.status !== 'error' && !state.error) {

        return { passed: false, message: `Expected error "${test.expectedError}", but no error occurred`, state }
      }
      const actualError = state.error?.message || ''
      if (test.expectedError.length > 0 && !actualError.includes(test.expectedError)) {

        return { passed: false, message: `Expected error containing "${test.expectedError}", got "${actualError}"`, state }
      }
      return { passed: true, message: 'OK', state }
    }

    if (state.status === 'error') {
      if (test.debugEmitJS && (state as any).__debugJS) {
        console.log('\n===== Generated JS (for failed test) =====')
        console.log((state as any).__debugJS)
        console.log('===========================================\n')
      }
      return { passed: false, message: `Unexpected error: ${state.error?.message}`, state }
    }

    if (test.expectedOutput !== undefined) {
      if (output !== test.expectedOutput) {

        return { passed: false, message: `Expected output "${JSON.stringify(test.expectedOutput)}", got "${JSON.stringify(output)}"`, state }
      }
    }

    if (test.expectedContains !== undefined) {
      if (!output.includes(test.expectedContains)) {

        return { passed: false, message: `Expected output to contain "${test.expectedContains}", got "${JSON.stringify(output)}"`, state }
      }
    }

    if (test.expectedNotContains !== undefined) {
      if (output.includes(test.expectedNotContains)) {

        return { passed: false, message: `Expected output to NOT contain "${test.expectedNotContains}", got "${JSON.stringify(output)}"`, state }
      }
    }

    if (test.expectedFileContains && test.files) {
      for (const exp of test.expectedFileContains) {
        const bytes = test.files.get(exp.url)
        const text = bytes ? new TextDecoder().decode(bytes) : ''
        if (!text.includes(exp.contains)) {
          if (test.debugEmitJS && (state as any).__debugJS) {
            console.log('\n===== Generated JS (for failed test) =====')
            console.log((state as any).__debugJS)
            console.log('===========================================\n')
          }
          return { passed: false, message: `Expected file ${exp.url} to contain "${exp.contains}", got "${text}"`, state }
        }
      }
    }

    return { passed: true, message: 'OK', state }
  } catch (e: any) {
    return { passed: false, message: `Exception: ${e.message}`, state: null as any }
  }
}

export async function runVMTests(tests: VMTest[]): Promise<{ passed: number; failed: number; failures: string[] }> {
  let passed = 0
  let failed = 0
  const failures: string[] = []

  for (const test of tests) {
    const result = await runVMTest(test)
    if (result.passed) {
      passed++
    } else {
      failed++
      failures.push(`  ${test.name}: ${result.message}`)
    }
  }

  return { passed, failed, failures }
}

// ===========================================================================
// 兼容层：将 m3.6 InterpreterTest 格式适配到 VM
// ===========================================================================

export interface InterpreterTestCompat {
  name: string
  code: string
  purpose: string
  features: string[]
  expectedOutput?: string
  expectedContains?: string
  expectedNotContains?: string
  expectedError?: boolean
  input?: string[]
  // 非标扩展：允许无 LABEL 声明的 goto（Berkeley/DEC Pascal 扩展）
  allowUndeclaredLabels?: boolean
}

export async function runVMFromInterpreterTest(
  t: InterpreterTestCompat
): Promise<{ passed: boolean; message: string }> {
  // 兼容层也默认走 JS 编译器（M5）
  const result = await runVMTest({
    ...t,
    engine: 'js',
    expectedError: t.expectedError === true ? '' : undefined,
    allowUndeclaredLabels: t.allowUndeclaredLabels,
  } as VMTest)
  return { passed: result.passed, message: result.message }
}
