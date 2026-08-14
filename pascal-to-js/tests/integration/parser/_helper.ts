import { parse } from '@/index'
import { assert, assertEquals, describe, it, test } from '../../_harness.ts'
export { assert, assertEquals, describe, it, test }

export interface ConformanceTest {
  name: string
  code: string
  purpose: string
  shouldParse: boolean
}

export function runParseTests(t: ConformanceTest[]) {
  for (const testCase of t) {
    test(testCase.name, () => runParseTest(testCase))
  }
}

function formatCode(code: string): string {
  return code.split('\n').map((l) => '    ' + l).join('\n')
}

export function runParseTest(t: ConformanceTest) {
  let result: { success: boolean; error?: string; astNode?: unknown }
  try {
    result = parse(t.code) as { success: boolean; error?: string; astNode?: unknown }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    assert(
      !t.shouldParse,
      `Expected parse to succeed but it threw:\n` +
        `  Test: ${t.name}\n` +
        `  Purpose: ${t.purpose}\n` +
        `  Exception: ${msg}\n` +
        `  Code:\n${formatCode(t.code)}`,
    )
    return
  }

  if (t.shouldParse) {
    assert(
      result.success,
      `Expected parse to succeed but it failed:\n` +
        `  Test: ${t.name}\n` +
        `  Purpose: ${t.purpose}\n` +
        `  Error: ${result.error}\n` +
        `  Code:\n${formatCode(t.code)}`,
    )
    assert(
      result.astNode !== undefined,
      `Expected parse astNode to be defined:\n  Test: ${t.name}\n  Purpose: ${t.purpose}`,
    )
  } else {
    assert(
      !result.success,
      `Expected parse to fail but it succeeded:\n` +
        `  Test: ${t.name}\n` +
        `  Purpose: ${t.purpose}\n` +
        `  Code:\n${formatCode(t.code)}`,
    )
  }
}

export function makeProgram(a: string, b?: string, c?: string): string {
  if (c !== undefined) {
    return `program test;\n${a}\n${b}\nbegin\n${c}\nend.`
  }
  if (b !== undefined) {
    return `program test;\n${a}\nbegin\n${b}\nend.`
  }
  return `program test;\n${a}\nbegin\nend.`
}

export function makeProgramWithVars(vars: string, b?: string, c?: string): string {
  if (c !== undefined) {
    return `program test;\nvar\n  ${vars}\n${b}\nbegin\n${c}\nend.`
  }
  if (b !== undefined) {
    const trimmed = b.trimEnd()
    if (trimmed.endsWith('end.')) {
      return `program test;\nvar\n  ${vars}\n${b}`
    }
    return `program test;\nvar\n  ${vars}\n${b}\nbegin\nend.`
  }
  return `program test;\nvar\n  ${vars}\nbegin\nend.`
}
