import { describe, it, expect } from '@jest/globals'
import { runPascalTest, type PascalTest } from '../_helper'

describe('Phase 5: Non-standard', () => {
  // Original m36 tests
  const m36Tests: PascalTest[] = [
    {
      name: 'string type should not be supported',
      code: `program test;
var s: string;
begin
  s := 'hello';
  writeln(s);
end.`,
      purpose: 'Pascal82 没有 string 类型，解释器不应默认支持',
      expectedError: '',
    },
  ]

  const tests: PascalTest[] = [...m36Tests]

  it('should pass all tests', async () => {
    for (const test of tests) {
      const result = await runPascalTest(test)
      if (!result.passed) {
        console.error(`FAIL: ${test.name}: ${result.message}`)
      }
      expect(result.passed).toBe(true)
    }
  })
})
