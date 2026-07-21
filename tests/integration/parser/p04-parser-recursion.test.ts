import { ConformanceTest, runParseTest, makeProgram, makeProgramWithVars } from './_helper'

const tests: ConformanceTest[] = [
  // ==========================================================================
  // 1. 直接递归 - 过程（5个）
  // ==========================================================================
  {
    name: '简单递归过程',
    code: makeProgram(
      `
procedure CountDown(n: integer);
begin
  if n > 0 then
    CountDown(n - 1)
end;
`,
      `
  CountDown(10)
`
    ),
    purpose: '测试最简单的直接递归过程：过程调用自身',
    shouldParse: true,
  },
  {
    name: '带参数递归过程',
    code: makeProgram(
      `
procedure SumTo(n: integer; var s: integer);
begin
  if n = 0 then
    s := 0
  else begin
    SumTo(n - 1, s);
    s := s + n
  end
end;
`,
      `
  SumTo(5, total)
`
    ),
    purpose: '测试带多个参数的递归过程，包含值参数和 VAR 参数',
    shouldParse: true,
  },
  {
    name: '带 var 参数递归过程',
    code: makeProgram(
      `
procedure FactorialProc(n: integer; var result: integer);
var
  temp: integer;
begin
  if n <= 1 then
    result := 1
  else begin
    FactorialProc(n - 1, temp);
    result := n * temp
  end
end;
`,
      `
  FactorialProc(5, f)
`
    ),
    purpose: '测试通过 VAR 参数返回结果的递归过程',
    shouldParse: true,
  },
  {
    name: '递归过程 + 局部变量',
    code: makeProgram(
      `
procedure RecurseWithLocal(n: integer);
var
  x, y: integer;
begin
  x := n * 2;
  y := n + 1;
  if n > 0 then
    RecurseWithLocal(n - 1);
  y := x + y
end;
`,
      `
  RecurseWithLocal(5)
`
    ),
    purpose: '测试递归过程中使用局部变量',
    shouldParse: true,
  },
  {
    name: '递归过程 + label/goto',
    code: makeProgram(
      `
procedure RecurseWithGoto(n: integer);
label
  10, 20;
begin
  if n <= 0 then
    goto 20;
  goto 10;
  10:
    RecurseWithGoto(n - 1);
  20:
end;
`,
      `
  RecurseWithGoto(5)
`
    ),
    purpose: '测试递归过程中使用 label 和 goto 语句',
    shouldParse: true,
  },

  // ==========================================================================
  // 2. 直接递归 - 函数（5个）
  // ==========================================================================
  {
    name: '阶乘递归函数',
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
`
    ),
    purpose: '测试经典的阶乘递归函数模式',
    shouldParse: true,
  },
  {
    name: '斐波那契递归函数',
    code: makeProgram(
      `
function Fibonacci(n: integer): integer;
begin
  if n <= 1 then
    Fibonacci := n
  else
    Fibonacci := Fibonacci(n - 1) + Fibonacci(n - 2)
end;
`,
      `
  fib := Fibonacci(10)
`
    ),
    purpose: '测试斐波那契数列递归函数，包含多次自调用',
    shouldParse: true,
  },
  {
    name: '递归函数 + 条件分支',
    code: makeProgram(
      `
function Ackermann(m, n: integer): integer;
begin
  if m = 0 then
    Ackermann := n + 1
  else if n = 0 then
    Ackermann := Ackermann(m - 1, 1)
  else
    Ackermann := Ackermann(m - 1, Ackermann(m, n - 1))
end;
`,
      `
  a := Ackermann(3, 3)
`
    ),
    purpose: '测试包含复杂条件分支的递归函数（Ackermann函数）',
    shouldParse: true,
  },
  {
    name: '递归函数 + 局部变量',
    code: makeProgram(
      `
function SumSquares(n: integer): integer;
var
  temp: integer;
begin
  if n = 0 then
    SumSquares := 0
  else begin
    temp := SumSquares(n - 1);
    SumSquares := temp + n * n
  end
end;
`,
      `
  s := SumSquares(5)
`
    ),
    purpose: '测试递归函数中使用局部变量存储中间结果',
    shouldParse: true,
  },
  {
    name: '递归函数作为表达式',
    code: makeProgram(
      `
function Power(base: integer; exp: integer): integer;
begin
  if exp = 0 then
    Power := 1
  else
    Power := base * Power(base, exp - 1)
end;
`,
      `
  x := Power(2, 3) + Power(3, 2);
  y := Power(Power(2, 2), 2)
`
    ),
    purpose: '测试递归函数调用作为表达式的一部分，包括嵌套调用',
    shouldParse: true,
  },

  // ==========================================================================
  // 3. 间接递归 / 相互递归（5个）
  // ==========================================================================
  {
    name: '两个过程相互递归',
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
`
    ),
    purpose: '测试两个过程通过 forward 声明实现相互递归',
    shouldParse: true,
  },
  {
    name: '两个函数相互递归',
    code: makeProgram(
      `
function IsEven(n: integer): boolean; forward;
function IsOdd(n: integer): boolean;
begin
  if n = 0 then
    IsOdd := false
  else
    IsOdd := IsEven(n - 1)
end;
function IsEven(n: integer): boolean;
begin
  if n = 0 then
    IsEven := true
  else
    IsEven := IsOdd(n - 1)
end;
`,
      `
  e := IsEven(5);
  o := IsOdd(5)
`
    ),
    purpose: '测试两个函数通过 forward 声明实现相互递归',
    shouldParse: true,
  },
  {
    name: '三个过程链式递归',
    code: makeProgram(
      `
procedure A(n: integer); forward;
procedure B(n: integer); forward;
procedure C(n: integer);
begin
  if n > 0 then
    A(n - 1)
end;
procedure B(n: integer);
begin
  if n > 0 then
    C(n - 1)
end;
procedure A(n: integer);
begin
  if n > 0 then
    B(n - 1)
end;
`,
      `
  A(9)
`
    ),
    purpose: '测试三个过程形成链式递归：A -> B -> C -> A',
    shouldParse: true,
  },
  {
    name: '过程与函数混合递归',
    code: makeProgram(
      `
procedure ProcA(n: integer; var r: integer); forward;
function FuncB(n: integer): integer;
begin
  if n <= 0 then
    FuncB := 1
  else begin
    ProcA(n - 1, FuncB);
    FuncB := FuncB + n
  end
end;
procedure ProcA(n: integer; var r: integer);
begin
  if n > 0 then
    r := FuncB(n - 1)
  else
    r := 0
end;
`,
      `
  ProcA(5, x)
`
    ),
    purpose: '测试过程和函数混合的相互递归',
    shouldParse: true,
  },
  {
    name: '深层相互递归',
    code: makeProgram(
      `
procedure P1(n: integer); forward;
procedure P2(n: integer); forward;
procedure P3(n: integer); forward;
procedure P4(n: integer); forward;
procedure P5(n: integer);
begin
  if n > 0 then
    P1(n - 1)
end;
procedure P4(n: integer);
begin
  if n > 0 then
    P5(n - 1)
end;
procedure P3(n: integer);
begin
  if n > 0 then
    P4(n - 1)
end;
procedure P2(n: integer);
begin
  if n > 0 then
    P3(n - 1)
end;
procedure P1(n: integer);
begin
  if n > 0 then
    P2(n - 1)
end;
`,
      `
  P1(10)
`
    ),
    purpose: '测试五个过程形成的深层相互递归链',
    shouldParse: true,
  },

  // ==========================================================================
  // 4. 嵌套递归（4个）
  // ==========================================================================
  {
    name: '嵌套过程调用外层递归',
    code: makeProgram(
      `
procedure Outer(n: integer);
  procedure Inner(k: integer);
  begin
    if k > 0 then
      Outer(k - 1)
  end;
begin
  if n > 0 then
    Inner(n - 1)
end;
`,
      `
  Outer(5)
`
    ),
    purpose: '测试嵌套过程调用外层过程形成的间接递归',
    shouldParse: true,
  },
  {
    name: '递归过程中定义嵌套过程',
    code: makeProgram(
      `
procedure RecurseOuter(n: integer);
  procedure Helper(x: integer);
  begin
  end;
begin
  Helper(n);
  if n > 0 then
    RecurseOuter(n - 1)
end;
`,
      `
  RecurseOuter(5)
`
    ),
    purpose: '测试递归过程内部定义嵌套过程（非递归的辅助过程）',
    shouldParse: true,
  },
  {
    name: '递归函数中定义嵌套函数',
    code: makeProgram(
      `
function RecurseOuter(n: integer): integer;
  function Double(x: integer): integer;
  begin
    Double := x * 2
  end;
begin
  if n <= 0 then
    RecurseOuter := 0
  else
    RecurseOuter := Double(n) + RecurseOuter(n - 1)
end;
`,
      `
  s := RecurseOuter(5)
`
    ),
    purpose: '测试递归函数内部定义嵌套辅助函数',
    shouldParse: true,
  },
  {
    name: '嵌套过程自身递归',
    code: makeProgram(
      `
procedure Outer;
  procedure InnerCount(n: integer);
  begin
    if n > 0 then
      InnerCount(n - 1)
  end;
begin
  InnerCount(5)
end;
`,
      `
  Outer
`
    ),
    purpose: '测试嵌套在过程内部的过程自身递归（不依赖外层）',
    shouldParse: true,
  },

  // ==========================================================================
  // 5. 递归边界结构（6个）
  // ==========================================================================
  {
    name: '递归 + CASE 语句',
    code: makeProgram(
      `
function Eval(n: integer): integer;
begin
  case n of
    0: Eval := 1;
    1: Eval := 1;
    otherwise Eval := Eval(n - 1) + Eval(n - 2)
  end
end;
`,
      `
  e := Eval(10)
`
    ),
    purpose: '测试递归函数中使用 CASE 语句进行分支控制',
    shouldParse: true,
  },
  {
    name: '递归 + WHILE 循环',
    code: makeProgram(
      `
procedure RecurseWhile(n: integer);
var
  i: integer;
begin
  i := 0;
  while i < n do begin
    RecurseWhile(n - 1);
    i := i + 1
  end
end;
`,
      `
  RecurseWhile(3)
`
    ),
    purpose: '测试递归过程中包含 WHILE 循环',
    shouldParse: true,
  },
  {
    name: '递归 + FOR 循环',
    code: makeProgram(
      `
function SumRec(n: integer): integer;
var
  i, temp: integer;
begin
  temp := 0;
  for i := 1 to n do
    temp := temp + SumRec(i - 1);
  SumRec := temp
end;
`,
      `
  s := SumRec(5)
`
    ),
    purpose: '测试递归函数中包含 FOR 循环',
    shouldParse: true,
  },
  {
    name: '递归 + REPEAT 循环',
    code: makeProgram(
      `
procedure RecurseRepeat(n: integer);
var
  i: integer;
begin
  i := 0;
  repeat
    if n > 0 then
      RecurseRepeat(n - 1);
    i := i + 1
  until i >= n
end;
`,
      `
  RecurseRepeat(3)
`
    ),
    purpose: '测试递归过程中包含 REPEAT-UNTIL 循环',
    shouldParse: true,
  },
  {
    name: '递归 + WITH 语句',
    code: makeProgramWithVars(
      'R: RECORD X: INTEGER; Y: INTEGER END',
      `
procedure RecurseWith(var r: RECORD X: INTEGER; Y: INTEGER END; n: integer);
begin
  with r do begin
    X := X + 1;
    Y := Y + 2;
    if n > 0 then
      RecurseWith(r, n - 1)
  end
end;
`,
      `
  RecurseWith(R, 5)
`
    ),
    purpose: '测试递归过程中使用 WITH 语句访问记录字段',
    shouldParse: true,
  },
  {
    name: '递归过程调用递归函数',
    code: makeProgram(
      `
function Fac(n: integer): integer;
begin
  if n <= 1 then
    Fac := 1
  else
    Fac := n * Fac(n - 1)
end;
procedure PrintFac(n: integer);
begin
  if n > 0 then
    PrintFac(n - 1);
  WriteLn(Fac(n))
end;
`,
      `
  PrintFac(5)
`
    ),
    purpose: '测试递归过程调用递归函数，两种递归形式组合',
    shouldParse: true,
  },
]

describe('M3.5 Recursion Conformance', () => {
  tests.forEach((t) => {
    test(t.name, () => {
      runParseTest(t)
    })
  })
})
