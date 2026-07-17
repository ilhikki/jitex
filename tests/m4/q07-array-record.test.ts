import { describe, it, expect } from '@jest/globals'
import { runVMTest, type VMTest } from './_helper'

describe('M4 VM Array and Record', () => {
  const tests: VMTest[] = [
    {
      name: 'array type usage',
      code: `program test;
type
  Arr = array[1..5] of integer;
var a: Arr;
procedure fill;
var i: integer;
begin
  for i := 1 to 5 do
    a[i] := i;
  writeln(a[3]);
end;
begin
  fill;
end.`,
      purpose: 'array type usage across scopes',
      features: ['type', 'array-type', 'scope'],
      expectedContains: '3',
    },
    {
      name: 'record type field access',
      code: `program test;
type
  Person = record
    age: integer;
  end;
var p: Person;
procedure setAge(a: integer);
begin
  p.age := a;
end;
begin
  setAge(30);
  writeln(p.age);
end.`,
      purpose: 'record type field access across scopes',
      features: ['type', 'record-type', 'field-access', 'scope'],
      expectedContains: '30',
    },
    {
      name: 'enum type usage',
      code: `program test;
type
  Color = (red, green, blue);
var c: Color;
procedure setColor;
begin
  c := green;
  if c = green then writeln('ok');
end;
begin
  setColor;
end.`,
      purpose: 'enum type usage across scopes',
      features: ['type', 'enum-type', 'scope'],
      expectedContains: 'ok',
    },
    {
      name: 'array index expression',
      code: `program test;
var a: array[1..10] of integer;
begin
  a[2 + 3] := 42;
  writeln(a[5]);
end.`,
      purpose: 'array index with expression',
      features: ['array', 'index-expression'],
      expectedContains: '42',
    },
    {
      name: 'nested record access',
      code: `program test;
type
  Point = record
    x: integer;
    y: integer;
  end;
var p: Point;
begin
  p.x := 10;
  p.y := 20;
  writeln(p.x);
  writeln(p.y);
end.`,
      purpose: 'nested record field access',
      features: ['record', 'field-access'],
      expectedContains: '10',
    },
  ]

  it('should pass array and record tests', async () => {
    for (const test of tests) {
      const result = await runVMTest(test)
      if (!result.passed) {
        console.error(`FAIL: ${test.name}: ${result.message}`)
      }
      expect(result.passed).toBe(true)
    }
  })
})