// m5 测试辅助函数
//
// 测试的是 Pascal 语义，与具体引擎无关。
//
// 导出：
// - PascalTest: 测试用例接口
// - runPascal: 执行 Pascal 源码并返回 RunState
// - runPascalTest: 执行单个用例并做断言
// - runPascalTests: 批量注册 PascalTest 为独立 Deno.test 用例
// - getOutput: 从 RunState 提取输出字符串
// - harness 四件套：describe / test / assert / assertEquals（方便使用方一次 import 完）
//
// 测试原则见 ../README.md；
// 执行引擎实现见 pascal-to-js/src/compiler/transform.ts。

import { run } from '@jitex/pascal-to-js'
import type { RunState } from '@jitex/pascal-to-js'
import type { ExtraCallable } from '@jitex/pascal-to-js'
import type { PascalFileStore, SyscallHandler } from '@jitex/pascal-to-js'
import { assert, assertEquals, describe, it, test } from '../../_harness.ts'
import { MemoryTextFile, RecordFile } from '@jitex/pascal-to-js'
export { assert, assertEquals, describe, it, test }

/** 非标扩展标识符（保留用于类型标注，实际为 string） */
type Extension = string

/**
 * 单个 Pascal 测试用例。
 *
 * 断言采用"首个匹配"策略：
 * - 若 expectedError 有值，则要求执行出错；
 * - 否则要求执行成功，并按 expectedOutput / expectedContains /
 *   expectedNotContains / expectedFileContains 依次校验。
 */
export interface PascalTest {
  /** 测试用例名称，在测试报告中显示 */
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
   * - 设为空字符串 '' 表示"只要报错就行，不检查消息内容"；
   * - 设为具体消息则表示"错误消息必须包含此字符串"。
   */
  expectedError?: string

  /** 模拟输入（按行），供 readln/read 使用 */
  input?: string[]

  /** 非标扩展列表，如 ['string', 'allowUndeclaredLabels'] */
  extensions?: Extension[]

  /** 额外 callable 注入（编译期声明，AGENTS.md 原则 A.7：注入优先） */
  extraCallables?: Record<string, ExtraCallable>
  /** 额外 syscall 实现（运行期，与 extraCallables 的 sysCallName 对应） */
  extraSyscalls?: Record<string, SyscallHandler>

  /** 内存文件系统：文件名 → 文件内容 */
  textFiles?: Map<string, Uint8Array>
  recordFiles?: Map<string, RecordFile>
  /** 程序文件变量名 → files 中的键名（用于 ASSIGN） */
  programFileUrls?: Record<string, string>

  /** 断言文件内容包含指定子串 */
  expectedFileContains?: { url: string; contains: string }[]

  /** 最大执行步数（覆盖默认 1e9，用于测试死循环场景） */
  maxSteps?: number
}

/** 执行单个测试用例，返回 RunState */
export function runPascal(t: PascalTest): RunState {
  const files = new Map<string, PascalFileStore>()
  t.textFiles?.entries()?.forEach(([key, value]) => files.set(key, new MemoryTextFile(value)))
  t.recordFiles?.entries()?.forEach(([key, value]) => files.set(key, value))

  return run(t.code, {
    input: t.input,
    files: files,
    programFileUrls: t.programFileUrls,
    maxSteps: t.maxSteps ?? 1e5,
    extensions: t.extensions,
    extraCallables: t.extraCallables,
    extraSyscalls: t.extraSyscalls,
  })
}

/** 从 RunState 提取完整输出字符串 */
export function getOutput(state: RunState): string {
  return state.outputBuffer.join('')
}

/** 批量注册 PascalTest 为独立的 Deno.test 用例 */
export function runPascalTests(tests: PascalTest[]) {
  for (const testCase of tests) {
    test(testCase.name, () => runPascalTest(testCase))
  }
}

export function runPascalTest(t: PascalTest): void {
  const state = runPascal(t)
  const output = getOutput(state)
  const prefix = `[${t.name}] ${t.purpose}`

  // 1. 预期错误
  if (t.expectedError !== undefined) {
    assert(
      state.status === 'error' || !!state.error,
      `${prefix}: expected error "${t.expectedError}", but no error occurred`,
    )
    const actualError = state.error?.message || ''
    if (t.expectedError.length > 0) {
      assert(
        actualError.includes(t.expectedError),
        `${prefix}: expected error message to contain "${t.expectedError}", got: ${actualError}`,
      )
    }
    return
  }

  // 2. 非预期错误
  if (state.status === 'error') {
    console.error(state.jsCode)
    console.error(state.error)
    assert(false, `${prefix}: unexpected error: ${state.error?.message}`)
  }

  // 3. 输出断言
  if (t.expectedOutput !== undefined) {
    assertEquals(
      output,
      t.expectedOutput,
      `${state.jsCode}\n${prefix}: output mismatch.\n  expected: ${JSON.stringify(t.expectedOutput)}\n  actual:   ${
        JSON.stringify(output)
      }`,
    )
  }
  if (t.expectedContains !== undefined) {
    assert(
      output.includes(t.expectedContains),
      `${prefix}: expected output to contain ${JSON.stringify(t.expectedContains)}.\n  actual output: ${
        JSON.stringify(output)
      }`,
    )
  }
  if (t.expectedNotContains !== undefined) {
    assert(
      !output.includes(t.expectedNotContains),
      `${prefix}: expected output NOT to contain ${JSON.stringify(t.expectedNotContains)}.\n  actual output: ${
        JSON.stringify(output)
      }`,
    )
  }
  const files = state.files
  if (t.expectedFileContains && files) {
    for (const exp of t.expectedFileContains) {
      const fileStore = state.files.get(exp.url)
      const text = (fileStore as MemoryTextFile)?.getContent()
      assert(
        text !== undefined && text.includes(exp.contains),
        `${prefix}: expected file "${exp.url}" to contain "${exp.contains}". File content: ${JSON.stringify(text)}`,
      )
    }
  }
}
