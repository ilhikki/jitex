import { describe, it, expect } from '@jest/globals'
import { runPascalTest, type PascalTest } from '../_helper'

describe('Phase 4: Goto Label in Non-Transparent Block', () => {
  const tests: PascalTest[] = [
    {
      name: 'goto to label in while loop should error',
      code: `program test;
label 888;
var x: integer;
begin
  x := 0;
  while x < 3 do
    888: begin x := x + 1; writeln('loop'); end;
  goto 888;
end.`,
      purpose: 'goto 跳转到 while 循环内部的 label，标准 Pascal 不允许，编译时应报错',
      expectedError: '',
    },
    {
      name: 'goto to label in for loop should error',
      code: `program test;
label 666;
var i: integer;
begin
  for i := 1 to 3 do
    666: writeln('loop');
  goto 666;
end.`,
      purpose: 'goto 跳转到 for 循环内部的 label，标准 Pascal 不允许，编译时应报错',
      expectedError: '',
    },
    {
      name: 'goto to label in if statement should error',
      code: `program test;
label 300;
begin
  if true then
    300: writeln('inside if');
  goto 300;
end.`,
      purpose: 'goto 跳转到 if 语句内部的 label，标准 Pascal 不允许，编译时应报错',
      expectedError: '',
    },
    {
      name: 'goto to label in repeat loop should error',
      code: `program test;
label 400;
var x: integer;
begin
  x := 0;
  repeat
    400: x := x + 1;
  until x >= 3;
  goto 400;
end.`,
      purpose: 'goto 跳转到 repeat 循环内部的 label，标准 Pascal 不允许，编译时应报错',
      expectedError: '',
    },
  ]
  for (const t of tests) {
    it(t.name, async () => {
      const result = await runPascalTest(t)
      if (!result.passed) {
        console.error(`  [${t.name}] FAIL: ${result.message}`)
      }
      expect(result.passed).toBe(true)
    })
  }
})