import { nodeToCode, parse, transform } from '@jitex/pascal-to-js'
import type { ExtraCallable } from '@jitex/pascal-to-js'
import { createMemoryFileStore, encodeUtf8, runJs, toErrorState } from '@jitex/runtime'
import type { PascalFileStore, RunState, SyscallHandler } from '@jitex/runtime'
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@^1.0.0'
const textDecoder = new TextDecoder()
/**
 * 单个 Pascal 测试用例。
 *
 * 断言字段按 expectedError → expectedOutput → expectedContains →
 * expectedNotContains → expectedFileContains 依次校验，声明的每一项都必须满足。
 */
export interface PascalTest {
  /** 测试用例名称，在测试报告中显示 */
  name: string

  /** Pascal 源码 */
  code: string

  /** 一句话描述本用例测什么 */
  purpose: string

  /** 要求输出精确等于此字符串 */
  expectedOutput?: string

  /** 要求输出包含此子串 */
  expectedContains?: string

  /** 要求输出不包含此子串 */
  expectedNotContains?: string

  /**
   * 要求执行报错。
   * - 空字符串 '' 表示"只要报错即可，不校验消息"；
   * - 具体消息表示"错误消息必须包含此子串"。
   */
  expectedError?: string

  /** 模拟输入（按行），供 readln/read 使用 */
  input?: string

  /** 额外 callable 注入（编译期声明） */
  extraCallables?: Record<string, ExtraCallable>
  /** 额外 syscall 实现（运行期） */
  extraSyscalls?: Record<string, SyscallHandler>

  /** 内存文件系统：文件名 → 文件内容 */
  textFiles?: Map<string, Uint8Array>
  /** 程序文件变量名 → files 中的键名 */
  programFileUrls?: Record<string, string>

  /** 要求指定文件内容包含此子串 */
  expectedFileContains?: { url: string; contains: string }[]

  /** 最大执行步数（默认 1e5） */
  maxSteps?: number
}

function newTextFile(mode: 'inspection' | 'generation', text?: string) {
  const store = createMemoryFileStore(text === undefined ? undefined : encodeUtf8(text))
  store.setMode(mode)
  return store
}

/** 执行单个用例，返回运行状态 */
export async function runPascal(t: PascalTest): Promise<RunState> {
  const files = new Map<string, PascalFileStore>()
  files.set('INPUT', newTextFile('inspection', t.input))
  files.set('OUTPUT', newTextFile('generation'))
  for (const [key, value] of t.textFiles ?? []) {
    files.set(key, createMemoryFileStore(value))
  }

  // 编译（@jitex/pascal-to-js）与执行（@jitex/runtime）分属两个包：先 transform 再 runJs。
  // 编译期报错在此转成 error 状态，与运行期报错统一。
  let jsCode: string
  try {
    jsCode = transform(t.code, {
      extraCallables: t.extraCallables,
      debug: true,
    })
  } catch (e) {
    return toErrorState(e)
  }

  return await runJs(jsCode, {
    files,
    programFileUrls: t.programFileUrls,
    maxSteps: t.maxSteps ?? 1e5,
    extraSyscalls: t.extraSyscalls,
  })
}

/**
 * 注册一组用例。
 *
 * `group` 是该组用例的归属名（通常是 ISO 章节标题），会拼在每条用例名前。
 * 这是 harness 中唯一接触测试运行器的地方——更换测试框架只需改这里。
 */
export function runPascalTests(group: string, tests: PascalTest[]): void {
  for (const t of tests) {
    Deno.test(`${group} > ${t.name}`, () => runPascalTest(t))
  }
}
function decode(store: PascalFileStore | undefined): string | undefined {
  if (store === undefined) {
    return undefined
  }
  return textDecoder.decode(store.getData())
}
/** 执行并断言单个用例；失败时先输出编译产物，再抛出断言错误 */
export async function runPascalTest(t: PascalTest): Promise<void> {
  const state = await runPascal(t)
  const output = state.files.get('OUTPUT')
  const ctx = `[${t.name}] ${t.purpose}`

  try {
    const outputContent = decode(output)
    assertCase(t, state, outputContent ?? '', ctx)
    // 期望编译通过的用例：额外验证源码往返（parse → print → parse → print）的稳定性
    if (t.expectedError === undefined) {
      assertPrintRoundTripStable(t.code, ctx)
    }
  } catch (err) {
    if (state.jsCode) {
      console.error(state.jsCode)
    }
    if (state.error) {
      console.error(state.error)
    }
    throw err
  }
}

/**
 * 源码往返检查：parse → print → parse → print。
 *
 * 期望编译通过的用例，其打印结果必须稳定：第二次打印须与第一次完全相同。
 * 打印结果无法再次 parse、或两次打印不同，都说明 printer 丢失或改写了原 AST 的信息。
 */
function assertPrintRoundTripStable(code: string, ctx: string): void {
  const first = parse(code)
  if (!first.success) {
    throw new Error(`${ctx}: parse 失败: ${first.error}`)
  }
  const printedOnce = nodeToCode(first.astNode)

  const second = parse(printedOnce)
  if (!second.success) {
    throw new Error(`${ctx}: 打印结果无法再次 parse: ${second.error}`)
  }
  const printedTwice = nodeToCode(second.astNode)

  assertEquals(printedTwice, printedOnce, `${ctx}: 两次 print 的结果不一致`)
}

/** 按用例声明的断言字段逐项校验 */
function assertCase(t: PascalTest, state: RunState, output: string, ctx: string): void {
  // 1. 期望报错：只要求报错，或额外要求错误消息包含指定子串
  if (t.expectedError !== undefined) {
    assert(state.status === 'error', `${ctx}: 期望执行报错，但执行成功`)
    if (t.expectedError.length > 0) {
      assertStringIncludes(state.error?.message ?? '', t.expectedError, ctx)
    }
    return
  }

  // 2. 非预期报错
  assert(state.status !== 'error', `${ctx}: 非预期错误: ${state.error?.message ?? ''}`)

  // 3. 输出断言
  if (t.expectedOutput !== undefined) {
    assertEquals(output, t.expectedOutput, ctx)
  }
  if (t.expectedContains !== undefined) {
    assertStringIncludes(output, t.expectedContains, ctx)
  }
  if (t.expectedNotContains !== undefined) {
    assert(
      !output.includes(t.expectedNotContains),
      `${ctx}: 输出不应包含 ${JSON.stringify(t.expectedNotContains)}`,
    )
  }

  // 4. 文件断言
  for (const { url, contains } of t.expectedFileContains ?? []) {
    const store = state.files.get(url)
    if (store?.getData() === undefined) {
      assert(false, `file not found ${ctx}: 文件 ${url}`)
    }

    assertStringIncludes(textDecoder.decode(store.getData()), contains, `${ctx}: 文件 ${url}`)
  }
}
