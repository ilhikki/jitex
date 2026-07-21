// m5 测试辅助函数
//
// 测试的是 Pascal 语义，与具体引擎无关。
//
// 导出：
// - PascalTest: 测试用例接口（引擎无关命名）
// - runPascal / runPascalTest / runPascalTests: 执行测试的函数
// - getOutput: 从 RunState 提取输出字符串
// - LegacyTestCompat / runLegacyTest: 兼容旧格式的适配层
//
// 测试原则见 ../README.md；
// 执行引擎实现见 @/js-compiler/index.ts。

import { runJS, RunState, SysCallHandler, TypeDef } from '@/index'

export interface PascalTest {
  name: string
  code: string
  purpose: string
  features: string[]
  expectedOutput?: string
  expectedContains?: string
  expectedNotContains?: string
  expectedError?: string
  input?: string[]
  extraTypes?: TypeDef[]
  // 内存文件存储
  files?: Map<string, Uint8Array>
  // 全局文件变量名 → URL
  programFileUrls?: Record<string, string>
  // 文件内容包含检查（runJS 完成后检查 files.get(url) 是否包含 substring）
  expectedFileContains?: { url: string; contains: string }[]
  // 自定义系统调用（非标扩展用）
  sysCalls?: Map<string, SysCallHandler>
  // 非标扩展：允许无 LABEL 声明的 goto（Berkeley/DEC Pascal 扩展）
  allowUndeclaredLabels?: boolean
  // 调试：失败时打印编译后的 JS 代码
  debugEmitJS?: boolean
}

export async function runPascal(test: PascalTest): Promise<RunState> {
  return await runJS(test.code, {
    input: test.input,
    extraTypes: test.extraTypes,
    sysCalls: test.sysCalls,
    files: test.files,
    programFileUrls: test.programFileUrls,
    maxSteps: 1e9,
    allowUndeclaredLabels: test.allowUndeclaredLabels,
    debug: test.debugEmitJS ? { emitJS: true } : undefined,
  })
}

export function getOutput(state: RunState): string {
  return state.outputBuffer.join('')
}

export async function runPascalTest(
  test: PascalTest
): Promise<{ passed: boolean; message: string; state: RunState }> {
  try {
    const state = await runPascal(test)
    const output = getOutput(state)

    if (test.expectedError !== undefined) {
      if (state.status !== 'error' && !state.error) {
        return {
          passed: false,
          message: `Expected error "${test.expectedError}", but no error occurred`,
          state,
        }
      }
      const actualError = state.error?.message || ''
      if (test.expectedError.length > 0 && !actualError.includes(test.expectedError)) {
        return {
          passed: false,
          message: `Expected error containing "${test.expectedError}", got "${actualError}"`,
          state,
        }
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
        return {
          passed: false,
          message: `Expected output "${JSON.stringify(test.expectedOutput)}", got "${JSON.stringify(output)}"`,
          state,
        }
      }
    }

    if (test.expectedContains !== undefined) {
      if (!output.includes(test.expectedContains)) {
        return {
          passed: false,
          message: `Expected output to contain "${test.expectedContains}", got "${JSON.stringify(output)}"`,
          state,
        }
      }
    }

    if (test.expectedNotContains !== undefined) {
      if (output.includes(test.expectedNotContains)) {
        return {
          passed: false,
          message: `Expected output to NOT contain "${test.expectedNotContains}", got "${JSON.stringify(output)}"`,
          state,
        }
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
          return {
            passed: false,
            message: `Expected file ${exp.url} to contain "${exp.contains}", got "${text}"`,
            state,
          }
        }
      }
    }

    return { passed: true, message: 'OK', state }
  } catch (e: any) {
    return { passed: false, message: `Exception: ${e.message}`, state: null as any }
  }
}

export async function runPascalTests(
  tests: PascalTest[]
): Promise<{ passed: number; failed: number; failures: string[] }> {
  let passed = 0
  let failed = 0
  const failures: string[] = []

  for (const test of tests) {
    const result = await runPascalTest(test)
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
// 兼容层：将 m3.6 LegacyTest 格式适配
// ===========================================================================

export interface LegacyTestCompat {
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

export async function runLegacyTest(
  t: LegacyTestCompat
): Promise<{ passed: boolean; message: string }> {
  const result = await runPascalTest({
    ...t,
    expectedError: t.expectedError === true ? '' : undefined,
    allowUndeclaredLabels: t.allowUndeclaredLabels,
  } as PascalTest)
  return { passed: result.passed, message: result.message }
}
