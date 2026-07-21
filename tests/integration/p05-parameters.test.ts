import { describe, it, expect } from '@jest/globals'
import { runPascalTest, type PascalTest } from './_helper'

describe('M5 JS Parameters', () => {
  const tests: PascalTest[] = [
    {
      name: 'value parameter passing',
      code: `program test;
var a: integer;
procedure setx(n: integer);
begin
  n := n + 1;
  writeln(n);
end;
begin
  a := 10;
  setx(a);
  writeln(a);
end.`,
      purpose: 'value parameter is a copy, does not modify original',
      features: ['value-parameter', 'scope'],
      expectedContains: '11',
    },
    {
      name: 'var parameter passing',
      code: `program test;
var a: integer;
procedure setx(var n: integer);
begin
  n := n + 1;
end;
begin
  a := 10;
  setx(a);
  writeln(a);
end.`,
      purpose: 'var parameter modifies original variable',
      features: ['var-parameter', 'scope'],
      expectedContains: '11',
    },
    {
      name: 'parameter shadows global',
      code: `program test;
var x: integer;
procedure proc(x: integer);
begin
  writeln(x);
end;
begin
  x := 100;
  proc(5);
end.`,
      purpose: 'parameter shadows global variable',
      features: ['parameter', 'global-variable', 'shadowing', 'scope'],
      expectedContains: '5',
    },
    {
      name: 'multiple parameters',
      code: `program test;
procedure calc(a, b, c: integer);
begin
  writeln(a + b + c);
end;
begin
  calc(1, 2, 3);
end.`,
      purpose: 'multiple parameters in procedure',
      features: ['parameter', 'multiple-parameters', 'scope'],
      expectedContains: '6',
    },
    {
      name: 'parameter in nested procedure',
      code: `program test;
procedure outer(a: integer);
procedure inner;
begin
  writeln(a);
end;
begin
  inner;
end;
begin
  outer(42);
end.`,
      purpose: 'parameter accessible in nested procedure',
      features: ['parameter', 'nested-procedure', 'scope'],
      expectedContains: '42',
    },
    {
      name: 'function name as return variable',
      code: `program test;
function double(n: integer): integer;
begin
  double := n * 2;
end;
begin
  writeln(double(5));
end.`,
      purpose: 'function name used as return value variable',
      features: ['function', 'return-value', 'scope'],
      expectedContains: '10',
    },
    {
      name: 'function return in expression',
      code: `program test;
function add(a, b: integer): integer;
begin
  add := a + b;
end;
begin
  writeln(add(3, 4) * 2);
end.`,
      purpose: 'function return value used in expression',
      features: ['function', 'return-value', 'expression', 'scope'],
      expectedContains: '14',
    },
    {
      name: 'recursive function return',
      code: `program test;
function fact(n: integer): integer;
begin
  if n = 0 then
    fact := 1
  else
    fact := n * fact(n - 1);
end;
begin
  writeln(fact(5));
end.`,
      purpose: 'recursive function return value',
      features: ['function', 'recursion', 'return-value', 'scope'],
      expectedContains: '120',
    },
  ]

  it('should pass parameter tests', async () => {
    for (const test of tests) {
      const result = await runPascalTest(test)
      if (!result.passed) {
        console.error(`FAIL: ${test.name}: ${result.message}`)
      }
      expect(result.passed).toBe(true)
    }
  })
})