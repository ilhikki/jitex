import { InterpreterTest, runInterpreterTest } from './_helper'

const tests: InterpreterTest[] = [
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
    name: 'multiple global variables',
    code: `program test;
var a, b, c: integer;
procedure calc;
begin
  writeln(a + b + c);
end;
begin
  a := 1;
  b := 2;
  c := 3;
  calc;
end.`,
    purpose: 'multiple global variables accessible',
    features: ['global-variable', 'multiple-variables', 'scope'],
    expectedContains: '6',
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
    name: 'inner nested var shadows outer',
    code: `program test;
procedure outer;
var x: integer;
procedure inner;
var x: integer;
begin
  x := 3;
  writeln(x);
end;
begin
  x := 2;
  inner;
  writeln(x);
end;
begin
  outer;
end.`,
    purpose: 'inner nested local variable shadows outer local variable',
    features: ['local-variable', 'nested-procedure', 'shadowing', 'scope'],
    expectedContains: '3',
  },
  {
    name: 'sibling procedures independent',
    code: `program test;
procedure proc1;
var x: integer;
begin
  x := 10;
  writeln(x);
end;
procedure proc2;
var x: integer;
begin
  x := 20;
  writeln(x);
end;
begin
  proc1;
  proc2;
end.`,
    purpose: 'local variables in sibling procedures are independent',
    features: ['local-variable', 'sibling-procedures', 'scope'],
    expectedContains: '10',
  },
  {
    name: 'local var not accessible outside scope',
    code: `program test;
procedure proc;
var x: integer;
begin
  x := 5;
end;
begin
  writeln(x);
end.`,
    purpose: 'local variable not accessible outside its scope',
    features: ['local-variable', 'scope', 'error'],
    expectedError: true,
  },
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
    name: 'parameter shadows local',
    code: `program test;
procedure outer;
var x: integer;
procedure inner(x: integer);
begin
  writeln(x);
end;
begin
  x := 10;
  inner(20);
end;
begin
  outer;
end.`,
    purpose: 'parameter shadows local variable',
    features: ['parameter', 'local-variable', 'shadowing', 'scope'],
    expectedContains: '20',
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
    name: 'nested function return',
    code: `program test;
procedure outer;
function inner(n: integer): integer;
begin
  inner := n * 3;
end;
begin
  writeln(inner(5));
end;
begin
  outer;
end.`,
    purpose: 'nested function return value',
    features: ['function', 'nested-function', 'return-value', 'scope'],
    expectedContains: '15',
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
  {
    name: 'goto in procedure',
    code: `program test;
procedure proc;
label 10;
begin
  goto 10;
  writeln('skipped');
  10:
  writeln('ok');
end;
begin
  proc;
end.`,
    purpose: 'goto within procedure scope',
    features: ['goto', 'label', 'procedure', 'scope'],
    expectedContains: 'ok',
  },
  {
    name: 'goto in main program',
    code: `program test;
label 20;
begin
  goto 20;
  writeln('skipped');
  20:
  writeln('done');
end.`,
    purpose: 'goto within main program scope',
    features: ['goto', 'label', 'scope'],
    expectedContains: 'done',
  },
  {
    name: 'goto across procedures should error',
    code: `program test;
label 10;
procedure proc;
begin
  goto 10;
end;
begin
  writeln('start');
  10:
  writeln('end');
end.`,
    purpose:
      'goto across procedures only errors at runtime when proc is called (Pascal82: GOTO 目标跨 block，proc 未调用则不触发)',
    features: ['goto', 'label', 'cross-procedure', 'scope'],
    expectedContains: 'start\nend',
  },
  {
    name: 'label in nested procedure',
    code: `program test;
procedure outer;
procedure inner;
label 5;
begin
  goto 5;
  writeln('no');
  5:
  writeln('yes');
end;
begin
  inner;
end;
begin
  outer;
end.`,
    purpose: 'label in nested procedure',
    features: ['goto', 'label', 'nested-procedure', 'scope'],
    expectedContains: 'yes',
  },
  {
    name: 'labels in different scopes',
    code: `program test;
procedure proc1;
label 10;
begin
  goto 10;
  10:
  writeln('p1');
end;
procedure proc2;
label 10;
begin
  goto 10;
  10:
  writeln('p2');
end;
begin
  proc1;
  proc2;
end.`,
    purpose: 'same label number in different scopes',
    features: ['goto', 'label', 'scope', 'sibling-procedures'],
    expectedContains: 'p1',
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
    name: 'constant in procedure',
    code: `program test;
procedure proc;
const LIMIT = 100;
begin
  writeln(LIMIT);
end;
begin
  proc;
end.`,
    purpose: 'local constant in procedure',
    features: ['constant', 'local-constant', 'procedure', 'scope'],
    expectedContains: '100',
  },
  {
    name: 'constant visible in nested procedure',
    code: `program test;
procedure outer;
const C = 50;
procedure inner;
begin
  writeln(C);
end;
begin
  inner;
end;
begin
  outer;
end.`,
    purpose: 'constant visible in nested procedure',
    features: ['constant', 'nested-procedure', 'scope'],
    expectedContains: '50',
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
    purpose: 'record type field access across scopes (Pascal82: 无 string 类型)',
    features: ['type', 'record-type', 'field-access', 'scope'],
    expectedContains: '30',
  },
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
    name: 'local var modifies global indirectly',
    code: `program test;
var x: integer;
procedure proc;
var temp: integer;
begin
  temp := x;
  x := temp + 1;
end;
begin
  x := 5;
  proc;
  writeln(x);
end.`,
    purpose: 'local variable can read and modify global through assignment',
    features: ['local-variable', 'global-variable', 'scope'],
    expectedContains: '6',
  },
  {
    name: 'nested function access outer param',
    code: `program test;
procedure outer(n: integer);
function inner: integer;
begin
  inner := n * 2;
end;
begin
  writeln(inner);
end;
begin
  outer(10);
end.`,
    purpose: 'nested function can access outer procedure parameter',
    features: ['function', 'nested-function', 'parameter', 'scope'],
    expectedContains: '20',
  },
  {
    name: 'function param shadows outer local',
    code: `program test;
procedure outer;
var x: integer;
function inner(x: integer): integer;
begin
  inner := x + 1;
end;
begin
  x := 10;
  writeln(inner(5));
end;
begin
  outer;
end.`,
    purpose: 'function parameter shadows outer procedure local variable',
    features: ['function', 'parameter', 'shadowing', 'scope'],
    expectedContains: '6',
  },
]

describe('M3.6 Interpreter: Scope', () => {
  tests.forEach((t) => {
    test(t.name, () => {
      runInterpreterTest(t)
    })
  })
})
