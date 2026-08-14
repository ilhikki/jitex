import { parse } from '@/index'
import { expect, test } from 'vitest'

export interface ConformanceTest {
  name: string
  code: string
  purpose: string
  shouldParse: boolean
}
export function runParseTests(t: ConformanceTest[]) {
  t.forEach((testCase) => test(testCase.name, () => runParseTest(testCase)))
}

export function runParseTest(t: ConformanceTest) {
  let result: { success: boolean; error?: string; astNode?: any }
  try {
    result = parse(t.code) as any
  } catch (e: any) {
    if (t.shouldParse) {
      expect.fail(
        `Expected parse to succeed but it threw:\n` +
          `  Test: ${t.name}\n` +
          `  Purpose: ${t.purpose}\n` +
          `  Exception: ${e.message}\n` +
          `  Code:\n${t.code
            .split('\n')
            .map((l) => '    ' + l)
            .join('\n')}`
      )
    }
    return
  }

  if (t.shouldParse) {
    if (!result.success) {
      expect.fail(
        `Expected parse to succeed but it failed:\n` +
          `  Test: ${t.name}\n` +
          `  Purpose: ${t.purpose}\n` +
          `  Error: ${result.error}\n` +
          `  Code:\n${t.code
            .split('\n')
            .map((l) => '    ' + l)
            .join('\n')}`
      )
    }
    expect(result.astNode).toBeDefined()
  } else {
    if (result.success) {
      expect.fail(
        `Expected parse to fail but it succeeded:\n` +
          `  Test: ${t.name}\n` +
          `  Purpose: ${t.purpose}\n` +
          `  Code:\n${t.code
            .split('\n')
            .map((l) => '    ' + l)
            .join('\n')}`
      )
    }
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
