import { describe, test, expect } from 'vitest'
import { runPascalTest, type PascalTest, runPascalTests } from '../_helper'

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

  runPascalTests(tests)
})
