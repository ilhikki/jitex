// m4 控制流测试

import { describe, it, expect } from '@jest/globals'
import { runVMTest, type VMTest } from './_helper'

describe('M5 JS Control Flow', () => {
  const tests: VMTest[] = [
    {
      name: 'if true',
      code: `program test; begin if true then writeln(1) else writeln(2); end.`,
      purpose: 'if 条件为 true',
      features: ['if', 'boolean-literal'],
      expectedOutput: '1\n',
    },
    {
      name: 'if false',
      code: `program test; begin if false then writeln(1) else writeln(2); end.`,
      purpose: 'if 条件为 false',
      features: ['if', 'boolean-literal'],
      expectedOutput: '2\n',
    },
    {
      name: 'if without else true',
      code: `program test; begin if true then writeln(1); writeln(2); end.`,
      purpose: 'if 无 else，条件 true',
      features: ['if'],
      expectedOutput: '1\n2\n',
    },
    {
      name: 'if without else false',
      code: `program test; begin if false then writeln(1); writeln(2); end.`,
      purpose: 'if 无 else，条件 false',
      features: ['if'],
      expectedOutput: '2\n',
    },
    {
      name: 'if comparison',
      code: `program test; var x: integer; begin x := 5; if x > 3 then writeln(1) else writeln(2); end.`,
      purpose: 'if 比较条件',
      features: ['if', 'compare'],
      expectedOutput: '1\n',
    },
    {
      name: 'while loop count to 3',
      code: `program test; var i: integer; begin i := 0; while i < 3 do begin i := i + 1; writeln(i); end; end.`,
      purpose: 'while 循环',
      features: ['while', 'compare'],
      expectedOutput: '1\n2\n3\n',
    },
    {
      name: 'for loop 1 to 3',
      code: `program test; var i: integer; begin for i := 1 to 3 do writeln(i); end.`,
      purpose: 'for 循环递增',
      features: ['for', 'to'],
      expectedOutput: '1\n2\n3\n',
    },
    {
      name: 'repeat until',
      code: `program test; var i: integer; begin i := 0; repeat i := i + 1; writeln(i); until i >= 3; end.`,
      purpose: 'repeat until 循环',
      features: ['repeat', 'until'],
      expectedOutput: '1\n2\n3\n',
    },
    {
      name: 'nested if',
      code: `program test; var x: integer; begin x := 5; if x > 0 then if x > 3 then writeln(1) else writeln(2) else writeln(3); end.`,
      purpose: '嵌套 if',
      features: ['if', 'nested'],
      expectedOutput: '1\n',
    },
    {
      name: 'while with complex condition',
      code: `program test; var i, sum: integer; begin i := 1; sum := 0; while (i <= 5) and (sum < 10) do begin sum := sum + i; i := i + 1; end; writeln(sum); end.`,
      purpose: 'while 复杂条件',
      features: ['while', 'and', 'compare'],
      expectedOutput: '10\n',
    },
  ]

  it('should pass all control flow tests', async () => {
    for (const test of tests) {
      const result = await runVMTest(test)
      if (!result.passed) {
        console.error(`FAIL: ${test.name}: ${result.message}`)
      }
      expect(result.passed).toBe(true)
    }
  })
})
