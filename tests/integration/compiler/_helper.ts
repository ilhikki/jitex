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
// 执行引擎实现见 src/compiler/transform.ts（新管线）。

import { run } from '@/compiler/transform'
import type { RunState } from '@/runtime/run-state'
import type { IlPlugin } from '@/compiler/plugin'
import { test, expect } from 'vitest'

/** 非标扩展标识符（保留用于类型标注，实际为 string） */
type Extension = string

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

  /** 非标特性插件（AGENTS.md 原则 A.7：注入优先） */
  plugins?: IlPlugin[]

  /** 内存文件系统：文件名 → 文件内容 */
  files?: Map<string, Uint8Array>

  /** 程序文件变量名 → files 中的键名（用于 ASSIGN） */
  programFileUrls?: Record<string, string>

  /** 断言文件内容包含指定子串 */
  expectedFileContains?: { url: string; contains: string }[]

  /** 最大执行步数（覆盖默认 1e9，用于测试死循环场景） */
  maxSteps?: number
}

/** 执行单个测试用例，返回 RunState */
export function runPascal(test: PascalTest): RunState {
  return run(test.code, {
    input: test.input,
    files: test.files,
    programFileUrls: test.programFileUrls,
    maxSteps: test.maxSteps ?? 1e5,
    extensions: test.extensions,
    plugins: test.plugins,
  })
}

/** 从 RunState 提取完整输出字符串 */
export function getOutput(state: RunState): string {
  return state.outputBuffer.join('')
}

/**
 * 执行单个测试用例并返回断言结果。
 */
export function runPascalTests(tests: PascalTest[]) {
  for (const testCase of tests) {
    test(testCase.name, () => runPascalTest(testCase))
  }
}

export function runPascalTest(test: PascalTest): void {
  const state = runPascal(test)
  const output = getOutput(state)

  if (test.expectedError !== undefined) {
    if (state.status !== 'error' && !state.error) {
      expect.fail(`Expected error "${test.expectedError}", but no error occurred`)
    }
    const actualError = state.error?.message || ''
    if (test.expectedError.length > 0) {
      expect(actualError).toContain(test.expectedError)
    }
    return
  }

  // 2. 非预期错误
  if (state.status === 'error') {
    expect.fail(`Unexpected error: ${state.error?.message}`)
  }

  // 3. 输出断言
  if (test.expectedOutput !== undefined) {
    expect(output).toBe(test.expectedOutput)
  }

  if (test.expectedContains !== undefined) {
    expect(output).toContain(test.expectedContains)
  }

  if (test.expectedNotContains !== undefined) {
    expect(output).not.toContain(test.expectedNotContains)
  }

  // 4. 文件内容断言
  if (test.expectedFileContains && test.files) {
    for (const exp of test.expectedFileContains) {
      const bytes = test.files.get(exp.url)
      const text = bytes ? new TextDecoder().decode(bytes) : ''
      expect(text).toContain(exp.contains)
    }
  }
}
