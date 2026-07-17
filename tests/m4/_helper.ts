// m4 VM 测试辅助函数

import { runVM as runVMImpl } from '../../src/vm'
import type { VMState } from '../../src/vm/state'

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
}

export async function runVM(test: VMTest): Promise<VMState> {
  return await runVMImpl(test.code, { input: test.input })
}

export function getOutput(state: VMState): string {
  return state.outputBuffer.join('')
}

export async function runVMTest(test: VMTest): Promise<{ passed: boolean; message: string; state: VMState }> {
  try {
    const state = await runVM(test)
    const output = getOutput(state)

    if (test.expectedError) {
      if (state.status !== 'error' && !state.error) {
        return { passed: false, message: `Expected error "${test.expectedError}", but no error occurred`, state }
      }
      const actualError = state.error?.message || ''
      if (!actualError.includes(test.expectedError)) {
        return { passed: false, message: `Expected error containing "${test.expectedError}", got "${actualError}"`, state }
      }
      return { passed: true, message: 'OK', state }
    }

    if (state.status === 'error') {
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
}

export async function runVMFromInterpreterTest(
  t: InterpreterTestCompat
): Promise<{ passed: boolean; message: string }> {
  try {
    const state = await runVMImpl(t.code, { input: t.input })
    const output = getOutput(state)

    if (t.expectedError === true) {
      if (state.status !== 'error' && !state.error) {
        return { passed: false, message: `Expected error but none occurred` }
      }
      return { passed: true, message: 'OK' }
    }

    if (state.status === 'error') {
      return { passed: false, message: `Unexpected error: ${state.error?.message}` }
    }

    if (t.expectedOutput !== undefined) {
      if (output !== t.expectedOutput) {
        return { passed: false, message: `Expected output ${JSON.stringify(t.expectedOutput)}, got ${JSON.stringify(output)}` }
      }
    }

    if (t.expectedContains !== undefined) {
      if (!output.includes(t.expectedContains)) {
        return { passed: false, message: `Expected output to contain ${JSON.stringify(t.expectedContains)}, got ${JSON.stringify(output)}` }
      }
    }

    if (t.expectedNotContains !== undefined) {
      if (output.includes(t.expectedNotContains)) {
        return { passed: false, message: `Expected output to NOT contain ${JSON.stringify(t.expectedNotContains)}, got ${JSON.stringify(output)}` }
      }
    }

    return { passed: true, message: 'OK' }
  } catch (e: any) {
    if (t.expectedError === true) {
      return { passed: true, message: 'OK (error caught)' }
    }
    return { passed: false, message: `Exception: ${e.message}` }
  }
}
