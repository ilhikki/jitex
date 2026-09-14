// ISO/IEC 7185:1990 - 6.2 Blocks, scopes, and activations
//
// 章节概括：
//   定义 block 的语法与语义：block 由 label-declaration-part、constant-definition-part、
//   type-definition-part、variable-declaration-part、procedure-and-function-declaration-part
//   与 statement-part 组成，并规定标签声明与其语句的一一对应关系、标签的定义点。
//   规定每个标识符或标签定义点具有 region 与 scope：scope 一般为该 region 及其包围的所有区域，
//   但被内层同名定义点排除；field-designator 的 field-specifier 区域被排除在包围作用域之外。
//   同一区域内不得有同名定义点，所有应用出现须能唯一定位，且定义点须先于其在程序块内的所有应用出现
//   （唯一例外是 new-pointer-type 域类型中的类型标识符）。required identifiers 视为其定义点区域包围整个程序。
//   activations 部分规定块的一次激活所包含的实体（statement-part 的算法、各标签对应的程序点、
//   各变量、局部过程/函数、函数结果）、激活的嵌套关系，并定义 activation-point：激活开始时
//   变量（除程序参数外）与结果处于 totally-undefined，直到激活终止才消失。
//
// 子章节：
//   6.2.1 Blocks
//   6.2.2 Scopes
//   6.2.3 Activations
//
// 状态：骨架文件，用例待从 tests/integration/ 迁移（迁移时仅改 name，内容不动）。

import { assert, describe, test } from './harness.ts'
import { type PascalTest, runPascalTests } from './harness.ts'
import { run } from '@jitex/pascal-to-js'

describe('ISO 7185 6.2 - Blocks, scopes, and activations', () => {
  const tests: PascalTest[] = [
    {
      name: '6.2 global var used in main',
      code: `program test;
var x: integer;
begin
  x := 42;
  writeln(x);
end.`,
      purpose: 'global variable is accessible in main program',
      expectedContains: '42',
    },
    {
      name: '6.2 global var used in procedure',
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
      expectedContains: '100',
    },
    {
      name: '6.2 global var used in nested procedure',
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
      expectedContains: '200',
    },
    {
      name: '6.2 global var used in function',
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
      expectedContains: '50',
    },
    {
      name: '6.2 multiple global variables',
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
      expectedContains: '6',
    },
    {
      name: '6.2 local var in procedure',
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
      expectedContains: '10',
    },
    {
      name: '6.2 local var in function',
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
      expectedContains: '20',
    },
    {
      name: '6.2 local var shadows global',
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
      expectedContains: '99',
    },
    {
      name: '6.2 inner nested var shadows outer',
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
      expectedContains: '3',
    },
    {
      name: '6.2 sibling procedures independent',
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
      expectedContains: '10',
    },
    {
      name: '6.2 local var not accessible outside scope',
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
      expectedError: '',
    },
    {
      name: '6.2 value parameter passing',
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
      expectedContains: '11',
    },
    {
      name: '6.2 var parameter passing',
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
      expectedContains: '11',
    },
    {
      name: '6.2 parameter shadows global',
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
      expectedContains: '5',
    },
    {
      name: '6.2 parameter shadows local',
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
      expectedContains: '20',
    },
    {
      name: '6.2 parameter in nested procedure',
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
      expectedContains: '42',
    },
    {
      name: '6.2 multiple parameters',
      code: `program test;
procedure calc(a, b, c: integer);
begin
  writeln(a + b + c);
end;
begin
  calc(1, 2, 3);
end.`,
      purpose: 'multiple parameters in procedure',
      expectedContains: '6',
    },
    {
      name: '6.2 function name as return variable',
      code: `program test;
function double(n: integer): integer;
begin
  double := n * 2;
end;
begin
  writeln(double(5));
end.`,
      purpose: 'function name used as return value variable',
      expectedContains: '10',
    },
    {
      name: '6.2 function return in expression',
      code: `program test;
function add(a, b: integer): integer;
begin
  add := a + b;
end;
begin
  writeln(add(3, 4) * 2);
end.`,
      purpose: 'function return value used in expression',
      expectedContains: '14',
    },
    {
      name: '6.2 nested function return',
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
      expectedContains: '15',
    },
    {
      name: '6.2 recursive function return',
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
      expectedContains: '120',
    },
    {
      name: '6.2 goto in procedure',
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
      expectedContains: 'ok',
    },
    {
      name: '6.2 goto in main program',
      code: `program test;
label 20;
begin
  goto 20;
  writeln('skipped');
  20:
  writeln('done');
end.`,
      purpose: 'goto within main program scope',
      expectedContains: 'done',
    },
    {
      name: '6.2 goto from procedure to outer block label',
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
        'ISO 7185 6.8.1 c) + 6.8.2.4: goto from nested block to label in containing block is permitted; terminates intervening activations',
      expectedContains: 'start\nend',
    },
    {
      name: '6.2 label in nested procedure',
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
      expectedContains: 'yes',
    },
    {
      name: '6.2 labels in different scopes',
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
      expectedContains: 'p1',
    },
    {
      name: '6.2 global constant in procedure',
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
      expectedContains: '3.14',
    },
    {
      name: '6.2 local constant shadows global',
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
      expectedContains: '20',
    },
    {
      name: '6.2 constant in procedure',
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
      expectedContains: '100',
    },
    {
      name: '6.2 constant visible in nested procedure',
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
      expectedContains: '50',
    },
    {
      name: '6.2 global type in procedure',
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
      expectedContains: '10',
    },
    {
      name: '6.2 local type in procedure',
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
      expectedContains: '20',
    },
    {
      name: '6.2 record type field access',
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
      expectedContains: '30',
    },
    {
      name: '6.2 array type usage',
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
      expectedContains: '3',
    },
    {
      name: '6.2 enum type usage',
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
      expectedContains: 'ok',
    },
    {
      name: '6.2 local var modifies global indirectly',
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
      expectedContains: '6',
    },
    {
      name: '6.2 nested function access outer param',
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
      expectedContains: '20',
    },
    {
      name: '6.2 function param shadows outer local',
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
      expectedContains: '6',
    },
    {
      name: '6.2 正向：内置过程 writeln 可正常调用',
      code: `PROGRAM P;BEGIN WRITELN('ok');END.`,
      purpose: '内置过程不依赖用户声明，不应被误判为无定义',
      expectedOutput: 'ok\n',
    },
    {
      name: '6.2 正向：内置函数 abs 可正常调用',
      code: `PROGRAM P;VAR X:INTEGER;BEGIN X:=ABS(-5);WRITELN(X);END.`,
      purpose: '内置函数不依赖用户声明，不应被误判为无定义',
      expectedOutput: '5\n',
    },
    {
      name: '6.2 正向：maxint 无参标识符',
      code: `PROGRAM P;VAR X:INTEGER;BEGIN X:=MAXINT;WRITELN(X);END.`,
      purpose: 'maxint 是预定义标识符（ISO 7185 6.1.5），不应被误判为无定义',
      expectedOutput: '2147483647\n',
    },
    {
      name: '6.2 正向：nil 无参标识符',
      code: `PROGRAM P;TYPE IP=^INTEGER;VAR P1:IP;BEGIN P1:=NIL;IF P1=NIL THEN WRITELN('nil');END.`,
      purpose: 'nil 是预定义标识符（ISO 7185 6.4.4），不应被误判为无定义',
      expectedOutput: 'nil\n',
    },
    {
      name: '6.2 正向：eof 无参标识符',
      code: `PROGRAM P;BEGIN IF EOF THEN WRITELN('eof');END.`,
      purpose: 'eof 无参形式（标准输入）不应被误判为无定义',
      expectedOutput: 'eof\n',
    },
    {
      name: '6.2 反向：引用未声明变量应报错',
      code: `PROGRAM P;VAR X:INTEGER;BEGIN Y:=1;END.`,
      purpose: 'ISO 7185 6.2.1: 变量使用前必须先声明，Y 未声明',
      expectedError: 'undefined identifier',
    },
    {
      name: '6.2 反向：调用未声明函数应报错',
      code: `PROGRAM P;VAR X:INTEGER;BEGIN X:=FOO(1);END.`,
      purpose: 'ISO 7185 6.2.1: FOO 未声明，函数调用无定义',
      expectedError: 'unknown function',
    },
    {
      name: '6.2 反向：调用未声明过程应报错',
      code: `PROGRAM P;BEGIN BAR;END.`,
      purpose: 'ISO 7185 6.2.1: BAR 未声明，过程调用无定义',
      expectedError: 'unknown procedure',
    },
    {
      name: '6.2 反向：嵌套过程中引用未声明变量应报错',
      code: `PROGRAM P;PROCEDURE Q;BEGIN LOCAL:=1;END;BEGIN Q;END.`,
      purpose: '局部作用域内未声明的变量引用同样应报错',
      expectedError: 'undefined identifier',
    },
  ]

  runPascalTests(tests)

  test('6.2 反向：多个无定义引用一次性全部捕获', () => {
    const state = run(
      `PROGRAM P;VAR X:INTEGER;BEGIN Y:=1;Z:=FOO(2);BAR;END.`,
      { maxSteps: 1e5 },
    )
    assert(state.status === 'error', `expected error, got status=${state.status}`)
    const msg = state.error?.message ?? ''
    assert(msg.includes('undefined identifier Y'), `missing Y in: ${msg}`)
    assert(msg.includes('undefined identifier Z'), `missing Z in: ${msg}`)
    assert(msg.includes('unknown function FOO'), `missing FOO in: ${msg}`)
    assert(msg.includes('unknown procedure BAR'), `missing BAR in: ${msg}`)
  })
})
