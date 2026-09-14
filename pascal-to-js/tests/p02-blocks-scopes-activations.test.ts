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

import { type PascalTest, runPascalTests } from './harness.ts'

const tests: PascalTest[] = [
  // 6.2.1 / 6.2.2 —— 全局实体的作用域覆盖整个程序
  {
    name: '6.2 主程序可访问全局变量',
    code: `program test(output);
var x: integer;
begin
  x := 42;
  writeln(x);
end.`,
    purpose: '全局变量的 scope 覆盖整个程序块',
    expectedOutput: '42\n',
  },
  {
    name: '6.2 过程内可访问全局变量',
    code: `program test(output);
var x: integer;
procedure show;
begin
  writeln(x);
end;
begin
  x := 100;
  show;
end.`,
    purpose: '过程体处于全局变量的 scope 之内',
    expectedOutput: '100\n',
  },
  {
    name: '6.2 嵌套过程内可访问全局变量',
    code: `program test(output);
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
    purpose: 'scope 为 region 及其包围的所有区域，嵌套过程同样在全局变量 scope 内',
    expectedOutput: '200\n',
  },
  {
    name: '6.2 函数内可访问全局变量',
    code: `program test(output);
var x: integer;
function getx: integer;
begin
  getx := x;
end;
begin
  x := 50;
  writeln(getx);
end.`,
    purpose: '函数体处于全局变量的 scope 之内',
    expectedOutput: '50\n',
  },
  {
    name: '6.2 多个全局变量均可见',
    code: `program test(output);
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
    purpose: '同一 variable-declaration 声明的多个标识符各自表示一个变量',
    expectedOutput: '6\n',
  },

  // 6.2.2 —— 局部声明的作用域与遮蔽
  {
    name: '6.2 过程内的局部变量',
    code: `program test(output);
procedure proc;
var x: integer;
begin
  x := 10;
  writeln(x);
end;
begin
  proc;
end.`,
    purpose: '过程内声明的变量其 region 为该过程块',
    expectedOutput: '10\n',
  },
  {
    name: '6.2 函数内的局部变量',
    code: `program test(output);
function func: integer;
var x: integer;
begin
  x := 20;
  func := x;
end;
begin
  writeln(func);
end.`,
    purpose: '函数内声明的变量其 region 为该函数块',
    expectedOutput: '20\n',
  },
  {
    name: '6.2 局部变量遮蔽同名全局变量',
    code: `program test(output);
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
    purpose: 'ISO 6.2.2.5：内层同名定义点将外层定义点排除出该内层的 scope',
    expectedOutput: '99\n1\n',
  },
  {
    name: '6.2 内层局部变量遮蔽外层局部变量',
    code: `program test(output);
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
    purpose: '内层过程的同名局部变量遮蔽外层过程的局部变量',
    expectedOutput: '3\n2\n',
  },
  {
    name: '6.2 兄弟过程的局部变量互不影响',
    code: `program test(output);
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
    purpose: '两个过程各自的名字空间独立，同名局部变量是不同实体',
    expectedOutput: '10\n20\n',
  },
  {
    name: '6.2 局部变量在其作用域外不可见',
    code: `program test(output);
procedure proc;
var x: integer;
begin
  x := 5;
end;
begin
  writeln(x);
end.`,
    purpose: 'ISO 6.2.2：过程内的局部变量不在主程序块的 scope 内，引用应报错',
    expectedError: 'undefined identifier',
  },

  // 6.2.2 —— 形式参数的可见性
  {
    name: '6.2 值参数不修改实参',
    code: `program test(output);
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
    purpose: '值参数是调用时赋值的局部变量，对其赋值不影响实参',
    expectedOutput: '11\n10\n',
  },
  {
    name: '6.2 var 参数修改实参',
    code: `program test(output);
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
    purpose: '变量参数与实参表示同一变量，对其赋值即修改实参',
    expectedOutput: '11\n',
  },
  {
    name: '6.2 形式参数遮蔽同名全局变量',
    code: `program test(output);
var x: integer;
procedure proc(x: integer);
begin
  writeln(x);
end;
begin
  x := 100;
  proc(5);
end.`,
    purpose: '形式参数的定义点在其过程块内遮蔽同名的外层定义点',
    expectedOutput: '5\n',
  },
  {
    name: '6.2 形式参数遮蔽同名局部变量',
    code: `program test(output);
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
    purpose: '内层过程的形式参数遮蔽外层变量的同名定义点',
    expectedOutput: '20\n',
  },
  {
    name: '6.2 嵌套过程可访问外层过程的形式参数',
    code: `program test(output);
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
    purpose: '外层过程的形式参数在其嵌套过程的 scope 内可见',
    expectedOutput: '42\n',
  },
  {
    name: '6.2 嵌套函数可访问外层过程参数',
    code: `program test(output);
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
    purpose: '外层过程参数在嵌套函数的 scope 内可见',
    expectedOutput: '20\n',
  },
  {
    name: '6.2 函数形式参数遮蔽外层局部变量',
    code: `program test(output);
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
    purpose: '函数形式参数遮蔽外层过程局部变量的同名定义点',
    expectedOutput: '6\n',
  },
  {
    name: '6.2 多个形式参数',
    code: `program test(output);
procedure calc(a, b, c: integer);
begin
  writeln(a + b + c);
end;
begin
  calc(1, 2, 3);
end.`,
    purpose: '同一 parameter-group 声明的多个标识符各自表示一个形式参数',
    expectedOutput: '6\n',
  },

  // 6.2.2 —— 函数标识符在函数体内的作用
  {
    name: '6.2 函数名在函数体内作为返回值变量',
    code: `program test(output);
function double(n: integer): integer;
begin
  double := n * 2;
end;
begin
  writeln(double(5));
end.`,
    purpose: 'ISO 6.6.2：函数标识符在函数块内可用作赋值目标，赋的值即函数结果',
    expectedOutput: '10\n',
  },
  {
    name: '6.2 函数调用结果参与表达式',
    code: `program test(output);
function add(a, b: integer): integer;
begin
  add := a + b;
end;
begin
  writeln(add(3, 4) * 2);
end.`,
    purpose: 'function-designator 表示函数激活的结果值，可用在表达式中',
    expectedOutput: '14\n',
  },
  {
    name: '6.2 嵌套函数的返回值',
    code: `program test(output);
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
    purpose: '嵌套函数在其所在块的 scope 内可被调用',
    expectedOutput: '15\n',
  },
  {
    name: '6.2 递归函数的返回值',
    code: `program test(output);
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
    purpose: '函数标识符的 scope 覆盖其自身函数块，因此可以递归调用',
    expectedOutput: '120\n',
  },

  // 6.2.2 / 6.8 —— 标签的作用域
  {
    name: '6.2 过程内的 goto 与标签',
    code: `program test(output);
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
    purpose: '标签的 scope 与其所在块一致，过程内的 goto 目标在同一块内',
    expectedOutput: 'ok\n',
  },
  {
    name: '6.2 主程序内的 goto 与标签',
    code: `program test(output);
label 20;
begin
  goto 20;
  writeln('skipped');
  20:
  writeln('done');
end.`,
    purpose: '主程序块内声明的标签可在该块内作为 goto 目标',
    expectedOutput: 'done\n',
  },
  {
    name: '6.2 从过程跳到外层块的标签',
    code: `program test(output);
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
    purpose: 'ISO 6.8.1 c) / 6.8.2.4：外层块声明的标签在嵌套块内仍可作为 goto 目标',
    expectedOutput: 'start\nend\n',
  },
  {
    name: '6.2 嵌套过程中的标签',
    code: `program test(output);
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
    purpose: '标签声明与使用在同一过程块内',
    expectedOutput: 'yes\n',
  },
  {
    name: '6.2 不同作用域中的同名标签互不冲突',
    code: `program test(output);
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
    purpose: '标签由块中的定义点确定，不同块的同名数值标签是不同实体',
    expectedOutput: 'p1\np2\n',
  },

  // 6.2.2 —— 常量与类型的可见性
  {
    name: '6.2 过程内可访问全局常量',
    code: `program test(output);
const PI = 3.14;
begin
  writeln(round(PI * 100));
end.`,
    purpose: '全局常量定义点的 scope 覆盖整个程序块（real 输出格式由实现定义，故转为整数比较）',
    expectedOutput: '314\n',
  },
  {
    name: '6.2 局部常量遮蔽同名全局常量',
    code: `program test(output);
const x = 10;
procedure proc;
const x = 20;
begin
  writeln(x);
end;
begin
  proc;
end.`,
    purpose: '内层常量定义点遮蔽外层同名常量',
    expectedOutput: '20\n',
  },
  {
    name: '6.2 过程内的局部常量',
    code: `program test(output);
procedure proc;
const LIMIT = 100;
begin
  writeln(LIMIT);
end;
begin
  proc;
end.`,
    purpose: '过程块内可声明常量，其 scope 为该过程块',
    expectedOutput: '100\n',
  },
  {
    name: '6.2 嵌套过程内可见的常量',
    code: `program test(output);
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
    purpose: '外层过程的常量在其嵌套过程的 scope 内可见',
    expectedOutput: '50\n',
  },
  {
    name: '6.2 过程内可访问全局类型',
    code: `program test(output);
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
    purpose: '全局类型标识符的 scope 覆盖整个程序块',
    expectedOutput: '10\n',
  },
  {
    name: '6.2 过程内定义的局部类型',
    code: `program test(output);
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
    purpose: '过程块内可声明类型，其 scope 为该过程块',
    expectedOutput: '20\n',
  },

  // 6.2.2 —— 跨作用域访问复合类型的变量
  {
    name: '6.2 跨作用域访问记录字段',
    code: `program test(output);
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
    purpose: '全局变量的分量在过程的 scope 内可访问',
    expectedOutput: '30\n',
  },
  {
    name: '6.2 跨作用域使用数组类型',
    code: `program test(output);
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
    purpose: '全局数组变量的分量在过程内可访问',
    expectedOutput: '3\n',
  },
  {
    name: '6.2 跨作用域使用枚举类型',
    code: `program test(output);
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
    purpose: '全局类型与全局变量在过程内均可访问',
    expectedOutput: 'ok\n',
  },
  {
    name: '6.2 过程可通过全局变量间接修改状态',
    code: `program test(output);
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
    purpose: '过程中的局部变量与全局变量是不同实体，全局变量可被过程修改',
    expectedOutput: '6\n',
  },

  // 6.2.2.7 —— 同一 region 内定义点须唯一
  {
    name: '6.2.2.7 同一 region 内 type 与 var 不得同拼写',
    code: `program test;
type P = ^integer;
var p: P;
begin
  new(p);
  p^ := 1;
end.`,
    purpose: 'ISO 6.2.2.7：同一 region 内任何两个同拼写的定义点都不允许（type P 与 var p）',
    expectedError: '',
  },
  {
    name: '6.2.2.7 同一 region 内 const 与 var 不得同拼写',
    code: `program test;
const N = 1;
var n: integer;
begin
  n := N;
end.`,
    purpose: 'ISO 6.2.2.7：同一 region 内 const N 与 var n 拼写相同，不允许',
    expectedError: '',
  },

  // 6.2.2 —— 标识符须先声明后使用（含 required identifiers）
  {
    name: '6.2 正向：内置过程 writeln 可正常调用',
    code: `PROGRAM P(output);BEGIN WRITELN('ok');END.`,
    purpose: 'required procedure 不依赖用户声明，不应被误判为无定义',
    expectedOutput: 'ok\n',
  },
  {
    name: '6.2 正向：内置函数 abs 可正常调用',
    code: `PROGRAM P(output);VAR X:INTEGER;BEGIN X:=ABS(-5);WRITELN(X);END.`,
    purpose: 'required function 不依赖用户声明，不应被误判为无定义',
    expectedOutput: '5\n',
  },
  {
    name: '6.2 正向：maxint 是预定义常量',
    code: `PROGRAM P(output);BEGIN IF MAXINT > 0 THEN WRITELN('positive');END.`,
    purpose: 'ISO 6.7.2.2：maxint 表示 integer 类型的最大取值，其具体数值由实现定义，故只断言其为正',
    expectedOutput: 'positive\n',
  },
  {
    name: '6.2 正向：nil 无参标识符',
    code: `PROGRAM P(output);TYPE IP=^INTEGER;VAR P1:IP;BEGIN P1:=NIL;IF P1=NIL THEN WRITELN('nil');END.`,
    purpose: 'ISO 6.4.4：nil 是 pointer-type 的预定义值，不应被误判为无定义',
    expectedOutput: 'nil\n',
  },
  {
    name: '6.2 正向：eof 无参标识符',
    code: `PROGRAM P(INPUT);BEGIN IF EOF THEN WRITELN('eof');END.`,
    purpose: 'ISO 6.9.1：省略 file-variable 时作用于 program 参数 input，空输入下 eof 为真',
    expectedOutput: 'eof\n',
  },
  {
    name: '6.2 反向：引用未声明变量应报错',
    code: `PROGRAM P;VAR X:INTEGER;BEGIN Y:=1;END.`,
    purpose: 'ISO 6.2.2：变量的定义点须先于其应用出现，Y 未声明',
    expectedError: 'undefined identifier',
  },
  {
    name: '6.2 反向：调用未声明函数应报错',
    code: `PROGRAM P;VAR X:INTEGER;BEGIN X:=FOO(1);END.`,
    purpose: 'ISO 6.2.2：FOO 未声明，其应用出现无法被定位',
    expectedError: 'unknown function',
  },
  {
    name: '6.2 反向：调用未声明过程应报错',
    code: `PROGRAM P;BEGIN BAR;END.`,
    purpose: 'ISO 6.2.2：BAR 未声明，其应用出现无法被定位',
    expectedError: 'unknown procedure',
  },
  {
    name: '6.2 反向：嵌套过程中引用未声明变量应报错',
    code: `PROGRAM P;PROCEDURE Q;BEGIN LOCAL:=1;END;BEGIN Q;END.`,
    purpose: '局部作用域内未声明的变量引用同样违反先声明后使用',
    expectedError: 'undefined identifier',
  },
]

runPascalTests('ISO 7185 6.2 - Blocks, scopes, and activations', tests)
