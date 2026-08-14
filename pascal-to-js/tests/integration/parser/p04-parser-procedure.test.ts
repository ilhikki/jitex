import { ConformanceTest, makeProgram, makeProgramWithVars, runParseTests } from './_helper'
import { describe } from './_helper.ts'

const tests: ConformanceTest[] = [
  // ==========================================================================
  // 1. 过程声明与调用（8个）
  // ==========================================================================
  {
    name: '无参过程声明与调用',
    code: makeProgram(
      `
procedure Hello;
begin
end;
`,
      `
  Hello
`,
    ),
    purpose: '测试无参数过程的声明和调用',
    shouldParse: true,
  },
  {
    name: '单参过程声明与调用',
    code: makeProgram(
      `
procedure PrintNum(n: integer);
begin
end;
`,
      `
  PrintNum(42)
`,
    ),
    purpose: '测试单个值参数的过程声明和调用',
    shouldParse: true,
  },
  {
    name: '多参过程声明与调用',
    code: makeProgram(
      `
procedure Add(a, b: integer; var c: integer);
begin
end;
`,
      `
  Add(1, 2, x)
`,
    ),
    purpose: '测试多个参数的过程声明和调用',
    shouldParse: true,
  },
  {
    name: '值参数过程',
    code: makeProgram(
      `
procedure SwapVal(a, b: integer);
var
  t: integer;
begin
  t := a;
  a := b;
  b := t
end;
`,
      `
  SwapVal(x, y)
`,
    ),
    purpose: '测试值参数传递的过程',
    shouldParse: true,
  },
  {
    name: 'var 参数过程',
    code: makeProgram(
      `
procedure SwapVar(var a, b: integer);
var
  t: integer;
begin
  t := a;
  a := b;
  b := t
end;
`,
      `
  SwapVar(x, y)
`,
    ),
    purpose: '测试 VAR 参数（引用传递）的过程',
    shouldParse: true,
  },
  {
    name: '混合参数过程',
    code: makeProgram(
      `
procedure Mix(a: integer; var b: char; c, d: boolean);
begin
end;
`,
      `
  Mix(1, ch, true, false)
`,
    ),
    purpose: '测试值参数和 VAR 参数混合的过程',
    shouldParse: true,
  },
  {
    name: '嵌套过程调用',
    code: makeProgram(
      `
procedure Outer;
  procedure Inner;
  begin
  end;
begin
  Inner
end;
`,
      `
  Outer
`,
    ),
    purpose: '测试嵌套过程的声明和调用',
    shouldParse: true,
  },
  {
    name: '递归过程声明',
    code: makeProgram(
      `
procedure Recurse(n: integer);
begin
  if n > 0 then
    Recurse(n - 1)
end;
`,
      `
  Recurse(10)
`,
    ),
    purpose: '测试递归过程的声明',
    shouldParse: true,
  },

  // ==========================================================================
  // 2. 函数声明与调用（8个）
  // ==========================================================================
  {
    name: '无参函数声明与调用',
    code: makeProgram(
      `
function GetAnswer: integer;
begin
  GetAnswer := 42
end;
`,
      `
  x := GetAnswer
`,
    ),
    purpose: '测试无参数函数的声明和调用',
    shouldParse: true,
  },
  {
    name: '单参函数声明与调用',
    code: makeProgram(
      `
function Square(x: integer): integer;
begin
  Square := x * x
end;
`,
      `
  y := Square(5)
`,
    ),
    purpose: '测试单个参数函数的声明和调用',
    shouldParse: true,
  },
  {
    name: '多参函数声明与调用',
    code: makeProgram(
      `
function Add(a, b: integer): integer;
begin
  Add := a + b
end;
`,
      `
  s := Add(3, 4)
`,
    ),
    purpose: '测试多个参数函数的声明和调用',
    shouldParse: true,
  },
  {
    name: '函数返回值赋值',
    code: makeProgram(
      `
function Max(a, b: integer): integer;
begin
  if a > b then
    Max := a
  else
    Max := b
end;
`,
      `
  m := Max(10, 20)
`,
    ),
    purpose: '测试函数体内对函数名赋值（返回值）',
    shouldParse: true,
  },
  {
    name: '嵌套函数调用',
    code: makeProgram(
      `
function Outer: integer;
  function Inner: integer;
  begin
    Inner := 10
  end;
begin
  Outer := Inner * 2
end;
`,
      `
  x := Outer
`,
    ),
    purpose: '测试嵌套函数的声明和调用',
    shouldParse: true,
  },
  {
    name: '递归函数声明',
    code: makeProgram(
      `
function Factorial(n: integer): integer;
begin
  if n <= 1 then
    Factorial := 1
  else
    Factorial := n * Factorial(n - 1)
end;
`,
      `
  f := Factorial(5)
`,
    ),
    purpose: '测试递归函数的声明',
    shouldParse: true,
  },
  {
    name: '函数作为表达式一部分',
    code: makeProgram(
      `
function Double(x: integer): integer;
begin
  Double := x * 2
end;
`,
      `
  y := Double(3) + 1
`,
    ),
    purpose: '测试函数调用作为算术表达式的一部分',
    shouldParse: true,
  },
  {
    name: '函数调用在复杂表达式中',
    code: makeProgram(
      `
function Add(a, b: integer): integer;
begin
  Add := a + b
end;
function Mul(a, b: integer): integer;
begin
  Mul := a * b
end;
`,
      `
  x := Add(Mul(2, 3), Add(4, 5))
`,
    ),
    purpose: '测试函数调用嵌套在复杂表达式中',
    shouldParse: true,
  },

  // ==========================================================================
  // 3. 参数类型组合（8个）
  // ==========================================================================
  {
    name: 'integer 参数',
    code: makeProgram(
      `
procedure IntParam(x: integer; var y: integer);
begin
  y := x + 1
end;
`,
      `
  IntParam(10, z)
`,
    ),
    purpose: '测试 integer 类型参数（值和 VAR）',
    shouldParse: true,
  },
  {
    name: 'char 参数',
    code: makeProgram(
      `
procedure CharParam(c: char; var d: char);
begin
  d := c
end;
`,
      `
  CharParam('A', ch)
`,
    ),
    purpose: '测试 char 类型参数（值和 VAR）',
    shouldParse: true,
  },
  {
    name: 'boolean 参数',
    code: makeProgram(
      `
procedure BoolParam(b: boolean; var c: boolean);
begin
  c := not b
end;
`,
      `
  BoolParam(true, flag)
`,
    ),
    purpose: '测试 boolean 类型参数（值和 VAR）',
    shouldParse: true,
  },
  {
    name: '数组值参数',
    code: makeProgramWithVars(
      'A: ARRAY[1..10] OF INTEGER',
      `
procedure ArrParam(arr: ARRAY[1..10] OF INTEGER);
begin
end;
`,
      `
  ArrParam(A)
`,
    ),
    purpose: '测试数组类型的值参数',
    shouldParse: true,
  },
  {
    name: '数组 VAR 参数',
    code: makeProgramWithVars(
      'A: ARRAY[1..10] OF INTEGER',
      `
procedure ArrVarParam(var arr: ARRAY[1..10] OF INTEGER);
begin
  arr[1] := 0
end;
`,
      `
  ArrVarParam(A)
`,
    ),
    purpose: '测试数组类型的 VAR 参数',
    shouldParse: true,
  },
  {
    name: 'record 值参数',
    code: makeProgramWithVars(
      'R: RECORD X: INTEGER; Y: CHAR END',
      `
procedure RecParam(r: RECORD X: INTEGER; Y: CHAR END);
begin
end;
`,
      `
  RecParam(R)
`,
    ),
    purpose: '测试 record 类型的值参数',
    shouldParse: true,
  },
  {
    name: 'record VAR 参数',
    code: makeProgramWithVars(
      'R: RECORD X: INTEGER; Y: CHAR END',
      `
procedure RecVarParam(var r: RECORD X: INTEGER; Y: CHAR END);
begin
  r.X := 0
end;
`,
      `
  RecVarParam(R)
`,
    ),
    purpose: '测试 record 类型的 VAR 参数',
    shouldParse: true,
  },
  {
    name: '枚举参数',
    code: makeProgram(
      `
type
  Color = (Red, Green, Blue);
var
  col: Color;
procedure EnumParam(c: Color);
begin
end;
`,
      `
  EnumParam(col)
`,
    ),
    purpose: '测试枚举类型参数',
    shouldParse: true,
  },

  // ==========================================================================
  // 4. FORWARD 声明（5个）
  // ==========================================================================
  {
    name: '过程 forward 声明',
    code: makeProgram(
      `
procedure ForwardProc; forward;
procedure ForwardProc;
begin
end;
`,
      `
  ForwardProc
`,
    ),
    purpose: '测试过程的 FORWARD 声明',
    shouldParse: true,
  },
  {
    name: '函数 forward 声明',
    code: makeProgram(
      `
function ForwardFunc: integer; forward;
function ForwardFunc: integer;
begin
  ForwardFunc := 42
end;
`,
      `
  x := ForwardFunc
`,
    ),
    purpose: '测试函数的 FORWARD 声明',
    shouldParse: true,
  },
  {
    name: 'forward 与实际定义参数一致',
    code: makeProgram(
      `
procedure Add(a, b: integer; var c: integer); forward;
procedure Add(a, b: integer; var c: integer);
begin
  c := a + b
end;
`,
      `
  Add(1, 2, x)
`,
    ),
    purpose: '测试 FORWARD 声明与实际定义参数列表一致',
    shouldParse: true,
  },
  {
    name: '相互递归 forward',
    code: makeProgram(
      `
procedure A(n: integer); forward;
procedure B(n: integer);
begin
  if n > 0 then
    A(n - 1)
end;
procedure A(n: integer);
begin
  if n > 0 then
    B(n - 1)
end;
`,
      `
  A(10)
`,
    ),
    purpose: '测试使用 FORWARD 实现相互递归的过程',
    shouldParse: true,
  },
  {
    name: '多个 forward 声明',
    code: makeProgram(
      `
procedure P1; forward;
procedure P2(x: integer); forward;
function F1: boolean; forward;
procedure P1;
begin
end;
procedure P2(x: integer);
begin
end;
function F1: boolean;
begin
  F1 := true
end;
`,
      `
  P1;
  P2(5);
  x := F1
`,
    ),
    purpose: '测试多个 FORWARD 声明',
    shouldParse: true,
  },

  // ==========================================================================
  // 5. 嵌套过程/函数（8个）
  // ==========================================================================
  {
    name: '一层嵌套过程',
    code: makeProgram(
      `
procedure Level1;
  procedure Level2;
  begin
  end;
begin
  Level2
end;
`,
      `
  Level1
`,
    ),
    purpose: '测试一层嵌套的过程',
    shouldParse: true,
  },
  {
    name: '一层嵌套函数',
    code: makeProgram(
      `
function Outer: integer;
  function Inner: integer;
  begin
    Inner := 5
  end;
begin
  Outer := Inner
end;
`,
      `
  x := Outer
`,
    ),
    purpose: '测试一层嵌套的函数',
    shouldParse: true,
  },
  {
    name: '两层嵌套',
    code: makeProgram(
      `
procedure L1;
  procedure L2;
    procedure L3;
    begin
    end;
  begin
    L3
  end;
begin
  L2
end;
`,
      `
  L1
`,
    ),
    purpose: '测试两层嵌套（L1 -> L2 -> L3）',
    shouldParse: true,
  },
  {
    name: '深层嵌套（3层）',
    code: makeProgram(
      `
procedure Deep1;
  procedure Deep2;
    procedure Deep3;
      procedure Deep4;
      begin
      end;
    begin
      Deep4
    end;
  begin
    Deep3
  end;
begin
  Deep2
end;
`,
      `
  Deep1
`,
    ),
    purpose: '测试三层深度嵌套过程',
    shouldParse: true,
  },
  {
    name: '嵌套过程访问外层变量',
    code: makeProgram(
      `
procedure Outer;
var
  x: integer;
  procedure Inner;
  begin
    x := x + 1
  end;
begin
  x := 0;
  Inner
end;
`,
      `
  Outer
`,
    ),
    purpose: '测试嵌套过程访问外层作用域的变量',
    shouldParse: true,
  },
  {
    name: '嵌套函数调用外层函数',
    code: makeProgram(
      `
function Outer(x: integer): integer;
  function AddOne(y: integer): integer;
  begin
    AddOne := y + 1
  end;
begin
  Outer := AddOne(x) * 2
end;
`,
      `
  z := Outer(5)
`,
    ),
    purpose: '测试嵌套函数在外层函数体内被调用',
    shouldParse: true,
  },
  {
    name: '同级过程调用',
    code: makeProgram(
      `
procedure SiblingA;
begin
end;
procedure SiblingB;
begin
  SiblingA
end;
`,
      `
  SiblingB
`,
    ),
    purpose: '测试同一级别的过程相互调用',
    shouldParse: true,
  },
  {
    name: '过程与函数混合嵌套',
    code: makeProgram(
      `
procedure ProcOuter;
var
  y: integer;
  function FuncInner(x: integer): integer;
    procedure ProcDeep;
    begin
    end;
  begin
    ProcDeep;
    FuncInner := x * 2
  end;
begin
  y := FuncInner(5)
end;
`,
      `
  ProcOuter
`,
    ),
    purpose: '测试过程中嵌套函数，函数中再嵌套过程',
    shouldParse: true,
  },

  // ==========================================================================
  // 6. 边界与组合（13个）
  // ==========================================================================
  {
    name: '空过程体',
    code: makeProgram(
      `
procedure EmptyProc;
begin
end;
`,
      `
  EmptyProc
`,
    ),
    purpose: '测试过程体只有 begin end，没有任何语句',
    shouldParse: true,
  },
  {
    name: '过程只有 label 声明',
    code: makeProgram(
      `
procedure LabelOnly;
label
  10, 20;
begin
  10: goto 20;
  20:
end;
`,
      `
  LabelOnly
`,
    ),
    purpose: '测试过程只有 LABEL 声明段',
    shouldParse: true,
  },
  {
    name: '过程只有 const 声明',
    code: makeProgram(
      `
procedure ConstOnly;
const
  MAX = 100;
  MIN = 0;
begin
end;
`,
      `
  ConstOnly
`,
    ),
    purpose: '测试过程只有 CONST 声明段',
    shouldParse: true,
  },
  {
    name: '过程只有 type 声明',
    code: makeProgram(
      `
procedure TypeOnly;
type
  Age = 0..150;
  Name = string;
begin
end;
`,
      `
  TypeOnly
`,
    ),
    purpose: '测试过程只有 TYPE 声明段',
    shouldParse: true,
  },
  {
    name: '过程只有 var 声明',
    code: makeProgram(
      `
procedure VarOnly;
var
  x, y: integer;
  ch: char;
begin
end;
`,
      `
  VarOnly
`,
    ),
    purpose: '测试过程只有 VAR 声明段',
    shouldParse: true,
  },
  {
    name: '过程包含所有声明段',
    code: makeProgram(
      `
procedure FullDecl;
label
  9999;
const
  PI = 3.14;
type
  Count = 0..100;
var
  x: integer;
  procedure Nested;
  begin
  end;
  function Helper: boolean;
  begin
    Helper := true
  end;
begin
  9999:
end;
`,
      `
  FullDecl
`,
    ),
    purpose: '测试过程包含所有声明段：label, const, type, var, procedure, function',
    shouldParse: true,
  },
  {
    name: '函数无参数无局部变量',
    code: makeProgram(
      `
function SimpleFunc: integer;
begin
  SimpleFunc := 0
end;
`,
      `
  x := SimpleFunc
`,
    ),
    purpose: '测试最简单的函数：无参数、无局部变量',
    shouldParse: true,
  },
  {
    name: '长参数列表（10个参数）',
    code: makeProgram(
      `
procedure LongParams(
  a1, a2, a3, a4, a5: integer;
  b1, b2, b3, b4, b5: char
);
begin
end;
`,
      `
  LongParams(1, 2, 3, 4, 5, 'a', 'b', 'c', 'd', 'e')
`,
    ),
    purpose: '测试包含10个参数的过程',
    shouldParse: true,
  },
  {
    name: '过程中定义函数',
    code: makeProgram(
      `
procedure ProcWithFunc;
var
  y: integer;
  function InnerFunc(x: integer): integer;
  begin
    InnerFunc := x * 2
  end;
begin
  y := InnerFunc(10)
end;
`,
      `
  ProcWithFunc
`,
    ),
    purpose: '测试过程内部定义函数',
    shouldParse: true,
  },
  {
    name: '函数中定义过程',
    code: makeProgram(
      `
function FuncWithProc(x: integer): integer;
var
  y: integer;
  procedure InnerProc(var n: integer);
  begin
    n := n + 1
  end;
begin
  y := x;
  InnerProc(y);
  FuncWithProc := y
end;
`,
      `
  z := FuncWithProc(5)
`,
    ),
    purpose: '测试函数内部定义过程',
    shouldParse: true,
  },
  {
    name: '多个过程和函数声明',
    code: makeProgram(
      `
procedure P1;
begin
end;
procedure P2(x: integer);
begin
end;
function F1: boolean;
begin
  F1 := true
end;
function F2(a, b: integer): integer;
begin
  F2 := a + b
end;
procedure P3(var y: integer);
begin
end;
`,
      `
  P1;
  P2(1);
  x := F1;
  z := F2(2, 3)
`,
    ),
    purpose: '测试多个过程和函数混合声明',
    shouldParse: true,
  },
  {
    name: '函数返回值为数组类型',
    code: makeProgram(
      `
type
  IntArr = ARRAY[1..5] OF INTEGER;
function GetArr: IntArr;
var
  i: integer;
begin
  for i := 1 to 5 do
    GetArr[i] := i
end;
`,
      `
`,
    ),
    purpose: '测试函数返回值为数组类型',
    shouldParse: true,
  },
  {
    name: '子界参数',
    code: makeProgram(
      `
type
  SmallInt = 0..100;
var
  n: 0..100;
procedure SubrangeParam(x: SmallInt);
begin
end;
`,
      `
  SubrangeParam(n)
`,
    ),
    purpose: '测试子界类型参数',
    shouldParse: true,
  },
]

describe('M3.5 Procedure & Function Conformance', () => {
  runParseTests(tests)
})
