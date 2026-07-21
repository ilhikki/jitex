import { describe, it, expect } from '@jest/globals'
import { runPascalTest, type PascalTest } from './_helper'

describe('M5 JS IO', () => {
  const tests: PascalTest[] = [
    {
      name: 'writeln with string',
      code: `program test;
begin
  writeln('Hello, World!');
end.`,
      purpose: 'output string literal',
      features: ['writeln', 'string'],
      expectedContains: 'Hello, World!',
    },
    {
      name: 'write without newline',
      code: `program test;
begin
  write('Hello');
  write(' ');
  writeln('World');
end.`,
      purpose: 'write without newline',
      features: ['write', 'writeln', 'string'],
      expectedContains: 'Hello World',
    },
    {
      name: 'readln integer',
      code: `program test;
var x: integer;
begin
  readln(x);
  writeln(x);
end.`,
      purpose: 'read integer from input',
      features: ['readln', 'integer'],
      input: ['42'],
      expectedContains: '42',
    },
    {
      name: 'readln multiple variables',
      code: `program test;
var a, b: integer;
begin
  readln(a, b);
  writeln(a);
  writeln(b);
end.`,
      purpose: 'read multiple variables',
      features: ['readln', 'multiple'],
      input: ['10 20'],
      expectedContains: '10',
    },
    {
      name: 'writeln with expression',
      code: `program test;
var x, y: integer;
begin
  x := 10;
  y := 20;
  writeln(x + y);
end.`,
      purpose: 'writeln with expression',
      features: ['writeln', 'expression'],
      expectedContains: '30',
    },
  ]

  it('should pass IO tests', async () => {
    for (const test of tests) {
      const result = await runPascalTest(test)
      if (!result.passed) {
        console.error(`FAIL: ${test.name}: ${result.message}`)
      }
      expect(result.passed).toBe(true)
    }
  })
})