import { nodeToCode, parse, transform } from '@jitex/pascal-to-js'
import type { ExtraCallable } from '@jitex/pascal-to-js'
import { createMemoryFileStore, encodeUtf8, runJs, toErrorState } from '@jitex/runtime'
import type { PascalFileStore, RunState, SyscallHandler } from '@jitex/runtime'
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@^1.0.0'
const textDecoder = new TextDecoder()
/**
 * A single Pascal test case.
 *
 * Assertion fields are checked in order: expectedError -> expectedOutput -> expectedContains -> expectedNotContains -> expectedFileContains; every declared field must hold.
 */
export interface PascalTest {
  /** Test case name, shown in the test report */
  name: string

  /** Pascal source code */
  code: string

  /** One-line description of what this case tests */
  purpose: string

  /** Require output to exactly equal this string */
  expectedOutput?: string

  /** Require output to contain this substring */
  expectedContains?: string

  /** Require output not to contain this substring */
  expectedNotContains?: string

  /**
   * Require execution to error.
   * - Empty string '' means 'error is enough, message not checked';
   * - A specific message means the error message must contain this substring.
   */
  expectedError?: string

  /** Simulated input (per line), used by readln/read */
  input?: string

  /** Extra callable injection (compile-time declaration) */
  extraCallables?: Record<string, ExtraCallable>
  /** Extra syscall implementation (runtime) */
  extraSyscalls?: Record<string, SyscallHandler>

  /** In-memory filesystem: filename -> file content */
  textFiles?: Map<string, Uint8Array>
  /** Program file variable name -> key in files */
  programFileUrls?: Record<string, string>

  /** Require the specified file content to contain this substring */
  expectedFileContains?: { url: string; contains: string }[]

  /** Maximum execution steps (default 1e5) */
  maxSteps?: number
}

function newTextFile(mode: 'inspection' | 'generation', text?: string) {
  const store = createMemoryFileStore(text === undefined ? undefined : encodeUtf8(text))
  store.setMode(mode)
  return store
}

/** Execution result of a single case: run state + compiled artifact (artifact held by caller, runtime does not return it) */
export interface PascalRunResult {
  state: RunState
  jsCode: string | undefined
}

/** Execute a single case, return run state and compiled artifact */
export async function runPascal(t: PascalTest): Promise<PascalRunResult> {
  const files = new Map<string, PascalFileStore>()
  files.set('INPUT', newTextFile('inspection', t.input))
  files.set('OUTPUT', newTextFile('generation'))
  for (const [key, value] of t.textFiles ?? []) {
    files.set(key, createMemoryFileStore(value))
  }

  // Compilation (@jitex/pascal-to-js) and execution (@jitex/runtime) are in separate packages: transform first, then runJs.
  // Compile-time errors are converted to error state here, unified with runtime errors.
  let jsCode: string
  try {
    jsCode = transform(t.code, {
      extraCallables: t.extraCallables,
      debug: true,
    })
  } catch (e) {
    return { state: toErrorState(e), jsCode: undefined }
  }

  const state = await runJs(jsCode, {
    files,
    programFileUrls: t.programFileUrls,
    maxSteps: t.maxSteps ?? 1e5,
    extraSyscalls: t.extraSyscalls,
  })
  return { state, jsCode }
}

/**
 * Register a group of cases.
 *
 * `group` is the owning name of this group (usually an ISO section title), prepended to each case name.
 * This is the only place in the harness that touches the test runner - changing the test framework only requires editing here.
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
/** Execute and assert a single case; on failure, print the compiled artifact before throwing the assertion error */
export async function runPascalTest(t: PascalTest): Promise<void> {
  const { state, jsCode } = await runPascal(t)
  const output = state.files.get('OUTPUT')
  const ctx = `[${t.name}] ${t.purpose}`

  try {
    const outputContent = decode(output)
    assertCase(t, state, outputContent ?? '', ctx)
    // Cases expected to compile: additionally verify the stability of source round-trip (parse -> print -> parse -> print)
    if (t.expectedError === undefined) {
      assertPrintRoundTripStable(t.code, ctx)
    }
  } catch (err) {
    if (jsCode) {
      console.error(jsCode)
    }
    if (state.error) {
      console.error(state.error)
    }
    throw err
  }
}

/**
 * Source round-trip check: parse -> print -> parse -> print.
 *
 * For cases expected to compile, the printed result must be stable: the second print must be identical to the first.
 * If the printed result cannot be parsed again, or the two prints differ, the printer has lost or altered information from the original AST.
 */
function assertPrintRoundTripStable(code: string, ctx: string): void {
  const first = parse(code)
  if (!first.success) {
    throw new Error(`${ctx}: parse failed: ${first.error}`)
  }
  const printedOnce = nodeToCode(first.astNode)

  const second = parse(printedOnce)
  if (!second.success) {
    throw new Error(`${ctx}: printed result cannot be parsed again: ${second.error}`)
  }
  const printedTwice = nodeToCode(second.astNode)

  assertEquals(printedTwice, printedOnce, `${ctx}: the two print results differ`)
}

/** Check each assertion field declared by the case in order */
function assertCase(t: PascalTest, state: RunState, output: string, ctx: string): void {
  // 1. Expected error: only require an error, or additionally require the error message to contain the specified substring
  if (t.expectedError !== undefined) {
    assert(state.status === 'error', `${ctx}: expected execution to error, but it succeeded`)
    if (t.expectedError.length > 0) {
      assertStringIncludes(state.error?.message ?? '', t.expectedError, ctx)
    }
    return
  }

  // 2. Unexpected error
  assert(state.status !== 'error', `${ctx}: unexpected error: ${state.error?.message ?? ''}`)

  // 3. Output assertions
  if (t.expectedOutput !== undefined) {
    assertEquals(output, t.expectedOutput, ctx)
  }
  if (t.expectedContains !== undefined) {
    assertStringIncludes(output, t.expectedContains, ctx)
  }
  if (t.expectedNotContains !== undefined) {
    assert(
      !output.includes(t.expectedNotContains),
      `${ctx}: output should not contain ${JSON.stringify(t.expectedNotContains)}`,
    )
  }

  // 4. File assertions
  for (const { url, contains } of t.expectedFileContains ?? []) {
    const store = state.files.get(url)
    if (store?.getData() === undefined) {
      assert(false, `file not found ${ctx}: file ${url}`)
    }

    assertStringIncludes(textDecoder.decode(store.getData()), contains, `${ctx}: file ${url}`)
  }
}
