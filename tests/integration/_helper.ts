// m5 测试辅助函数
//
// 测试的是 Pascal 语义，与具体引擎无关。
//
// 导出：
// - PascalTest: 测试用例接口
// - runPascal: 执行 Pascal 源码并返回 RunState
// - runPascalTest: 执行测试用例并返回 pass/fail 结果
// - getOutput: 从 RunState 提取输出字符串
//
// 测试原则见 ../README.md；
// 执行引擎实现见 src/compiler/run-js.ts。

import { runJS, RunState, SysCallHandler, type Extension } from '@/index'

/**
 * 单个 Pascal 测试用例。
 *
 * 断言采用“首个匹配”策略：
 * - 若 expectedError 有值，则要求执行出错；
 * - 否则要求执行成功，并按 expectedOutput / expectedContains /
 *   expectedNotContains / expectedFileContains 依次校验。
 */
export interface PascalTest {
  /** 测试用例名称，在 jest 报告中显示 */
  name: string

  /** Pascal 源码 */
  code: string

  /** 一句话描述本用例测什么 */
  purpose: string

  /** 要求输出精确等于此字符串（不含此字段则不校验） */
  expectedOutput?: string

  /** 要求输出包含此子串（不含此字段则不校验） */
  expectedContains?: string

  /** 要求输出不包含此子串（不含此字段则不校验） */
  expectedNotContains?: string

  /**
   * 要求执行报错。
   * - 设为空字符串 '' 表示“只要报错就行，不检查消息内容”；
   * - 设为具体消息则表示“错误消息必须包含此字符串”。
   */
  expectedError?: string

  /** 模拟输入（按行），供 readln/read 使用 */
  input?: string[]

  /** 非标扩展列表，如 ['string', 'allowUndeclaredLabels'] */
  extensions?: Extension[]

  /** 内存文件系统：文件名 → 文件内容 */
  files?: Map<string, Uint8Array>

  /** 程序文件变量名 → files 中的键名（用于 ASSIGN） */
  programFileUrls?: Record<string, string>

  /** 断言文件内容包含指定子串 */
  expectedFileContains?: { url: string; contains: string }[]

  /** 自定义系统调用处理器 */
  sysCalls?: Map<string, SysCallHandler>

  /** 最大执行步数（覆盖默认 1e9，用于测试死循环场景） */
  maxSteps?: number
}

/** 执行单个测试用例，返回 runJS 原始结果 */
export async function runPascal(test: PascalTest): Promise<RunState> {
  return await runJS(test.code, {
    input: test.input,
    extensions: test.extensions,
    sysCalls: test.sysCalls,
    files: test.files,
    programFileUrls: test.programFileUrls,
    maxSteps: test.maxSteps ?? 1e5,
  })
}

/** 从 RunState 提取完整输出字符串 */
export function getOutput(state: RunState): string {
  return state.outputBuffer.join('')
}

/**
 * 执行单个测试用例并返回断言结果。
 *
 * @returns passed 是否通过；message 失败原因；state 执行后的状态
 */
export async function runPascalTest(
  test: PascalTest
): Promise<{ passed: boolean; message: string; state: RunState }> {
  try {
    const state = await runPascal(test)
    const output = getOutput(state)

    // 1. 错误断言
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

    // 2. 非预期错误
    if (state.status === 'error') {
      return { passed: false, message: `Unexpected error: ${state.error?.message}`, state }
    }

    // 3. 输出断言
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

    // 4. 文件内容断言
    if (test.expectedFileContains && test.files) {
      for (const exp of test.expectedFileContains) {
        const bytes = test.files.get(exp.url)
        const text = bytes ? new TextDecoder().decode(bytes) : ''
        if (!text.includes(exp.contains)) {
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
