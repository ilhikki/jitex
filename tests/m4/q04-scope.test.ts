import { describe, it, expect } from '@jest/globals'
import { runVMTest, type VMTest } from './_helper'

describe('M4 VM Scope', () => {
  const tests: VMTest[] = [
    {
      name: 'global var used in main',
      code: `program test;
var x: integer;
begin
  x := 42;
  writeln(x);
end.`,
      purpose: 'global variable is accessible in main program',
      features: ['global-variable', 'scope'],
      expectedContains: '42',
    },
    {
      name: 'global var used in procedure',
      code: `program test;
var x: integer;
procedure show;
begin
  writeln(x);
end;
begin
  x := 100;
  show;
end.`,
      purpose: 'global variable is accessible in procedure',
      features: ['global-variable', 'procedure', 'scope'],
      expectedContains: '100',
    },
    {
      name: 'global var used in nested procedure',
      code: `program test;
var x: integer;
procedure outer;
procedure inner;
begin
  writeln(x);
end;
begin
  inner;
end;
begin
  x := 200;
  outer;
end.`,
      purpose: 'global variable is accessible in nested procedure',
      features: ['global-variable', 'nested-procedure', 'scope'],
      expectedContains: '200',
    },
    {
      name: 'global var used in function',
      code: `program test;
var x: integer;
function getx: integer;
begin
  getx := x;
end;
begin
  x := 50;
  writeln(getx);
end.`,
      purpose: 'global variable is accessible in function',
      features: ['global-variable', 'function', 'scope'],
      expectedContains: '50',
    },
    {
      name: 'local var in procedure',
      code: `program test;
procedure proc;
var x: integer;
begin
  x := 10;
  writeln(x);
end;
begin
  proc;
end.`,
      purpose: 'local variable in procedure',
      features: ['local-variable', 'procedure', 'scope'],
      expectedContains: '10',
    },
    {
      name: 'local var in function',
      code: `program test;
function func: integer;
var x: integer;
begin
  x := 20;
  func := x;
end;
begin
  writeln(func);
end.`,
      purpose: 'local variable in function',
      features: ['local-variable', 'function', 'scope'],
      expectedContains: '20',
    },
    {
      name: 'local var shadows global',
      code: `program test;
var x: integer;
procedure proc;
var x: integer;
begin
  x := 99;
  writeln(x);
end;
begin
  x := 1;
  proc;
  writeln(x);
end.`,
      purpose: 'local variable shadows global variable',
      features: ['local-variable', 'global-variable', 'shadowing', 'scope'],
      expectedContains: '99',
    },
    {
      name: 'global constant in procedure',
      code: `program test;
const PI = 3.14;
procedure show;
begin
  writeln(PI);
end;
begin
  show;
end.`,
      purpose: 'global constant accessible in procedure',
      features: ['constant', 'global-constant', 'scope'],
      expectedContains: '3.14',
    },
    {
      name: 'local constant shadows global',
      code: `program test;
const x = 10;
procedure proc;
const x = 20;
begin
  writeln(x);
end;
begin
  proc;
end.`,
      purpose: 'local constant shadows global constant',
      features: ['constant', 'shadowing', 'scope'],
      expectedContains: '20',
    },
    {
      name: 'global type in procedure',
      code: `program test;
type T = integer;
var x: T;
procedure proc;
var y: T;
begin
  y := 10;
  writeln(y);
end;
begin
  proc;
end.`,
      purpose: 'global type accessible in procedure',
      features: ['type', 'global-type', 'scope'],
      expectedContains: '10',
    },
    {
      name: 'local type in procedure',
      code: `program test;
procedure proc;
type T = integer;
var x: T;
begin
  x := 20;
  writeln(x);
end;
begin
  proc;
end.`,
      purpose: 'local type in procedure',
      features: ['type', 'local-type', 'scope'],
      expectedContains: '20',
    },
  ]

  it('should pass scope tests', async () => {
    for (const test of tests) {
      const result = await runVMTest(test)
      if (!result.passed) {
        console.error(`FAIL: ${test.name}: ${result.message}`)
      }
      expect(result.passed).toBe(true)
    }
  })
})