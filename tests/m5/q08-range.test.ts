import { describe, it, expect } from '@jest/globals'
import { runVMTest, type VMTest } from './_helper'

describe('M4 VM Range Type', () => {
  const tests: VMTest[] = [
    {
      name: 'range type declaration',
      code: `program test;
type T = 1..10;
var a: T;
begin
  a := 5;
  writeln(a);
end.`,
      purpose: 'range type declaration and assignment',
      features: ['range-type', 'declaration', 'assign'],
      expectedContains: '5',
    },
    {
      name: 'range type with const bounds',
      code: `program test;
const
  MIN = 10;
  MAX = 20;
type T = MIN..MAX;
var a: T;
begin
  a := 15;
  writeln(a);
end.`,
      purpose: 'range type with constant bounds',
      features: ['range-type', 'constant', 'bounds'],
      expectedContains: '15',
    },
    {
      name: 'range type comparison',
      code: `program test;
type T = 1..5;
var a: T;
begin
  a := 3;
  if a >= 2 then writeln('ok');
end.`,
      purpose: 'range type comparison',
      features: ['range-type', 'comparison'],
      expectedContains: 'ok',
    },
    {
      name: 'range type in array index',
      code: `program test;
type
  Index = 1..5;
  Arr = array[Index] of integer;
var a: Arr;
begin
  a[3] := 42;
  writeln(a[3]);
end.`,
      purpose: 'range type as array index',
      features: ['range-type', 'array', 'index'],
      expectedContains: '42',
    },
    {
      name: 'range type arithmetic',
      code: `program test;
type T = 1..100;
var a, b: T;
begin
  a := 10;
  b := a + 5;
  writeln(b);
end.`,
      purpose: 'range type arithmetic operations',
      features: ['range-type', 'arithmetic'],
      expectedContains: '15',
    },
  ]

  it('should pass range type tests', async () => {
    for (const test of tests) {
      const result = await runVMTest(test)
      if (!result.passed) {
        console.error(`FAIL: ${test.name}: ${result.message}`)
      }
      expect(result.passed).toBe(true)
    }
  })
})