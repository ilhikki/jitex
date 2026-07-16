import { runInterpreterTest, InterpreterTest } from './_helper'

describe('参数绑定测试', () => {
  const tests: InterpreterTest[] = [
    {
      name: '过程参数基础-无参过程',
      code: `
program Test;
procedure Hello;
begin
  writeln('Hello');
end;
begin
  Hello;
end.
      `,
      purpose: '测试无参数过程的调用',
      features: ['procedure', 'no parameters'],
      expectedOutput: 'Hello\n',
    },
    {
      name: '过程参数基础-单参过程',
      code: `
program Test;
procedure PrintNum(x: integer);
begin
  writeln(x);
end;
begin
  PrintNum(42);
end.
      `,
      purpose: '测试单个整数参数的过程',
      features: ['procedure', 'single parameter', 'integer'],
      expectedOutput: '42\n',
    },
    {
      name: '过程参数基础-多参过程',
      code: `
program Test;
procedure PrintSum(a, b: integer);
begin
  writeln(a + b);
end;
begin
  PrintSum(10, 20);
end.
      `,
      purpose: '测试多个参数的过程',
      features: ['procedure', 'multiple parameters', 'integer'],
      expectedOutput: '30\n',
    },
    {
      name: '过程参数基础-同类型多参数',
      code: `
program Test;
procedure PrintProduct(x, y, z: integer);
begin
  writeln(x * y * z);
end;
begin
  PrintProduct(2, 3, 4);
end.
      `,
      purpose: '测试多个相同类型的参数',
      features: ['procedure', 'multiple parameters', 'same type'],
      expectedOutput: '24\n',
    },
    {
      name: '过程参数基础-不同类型参数',
      code: `
program Test;
procedure PrintMixed(a: integer; b: char);
begin
  writeln(a);
  writeln(b);
end;
begin
  PrintMixed(100, 'A');
end.
      `,
      purpose: '测试不同类型的参数',
      features: ['procedure', 'multiple parameters', 'mixed types', 'integer', 'char'],
      expectedOutput: '100\nA\n',
    },
    {
      name: '过程参数基础-参数顺序',
      code: `
program Test;
procedure PrintOrder(first, second: integer);
begin
  writeln(first);
  writeln(second);
end;
begin
  PrintOrder(1, 2);
end.
      `,
      purpose: '测试参数传递的顺序',
      features: ['procedure', 'parameter order'],
      expectedOutput: '1\n2\n',
    },
    {
      name: '过程参数基础-参数名与全局变量同名',
      code: `
program Test;
var x: integer;
procedure TestParam(x: integer);
begin
  writeln(x);
end;
begin
  x := 100;
  TestParam(42);
end.
      `,
      purpose: '测试参数名与全局变量同名时的作用域',
      features: ['procedure', 'parameter scope', 'global variable'],
      expectedOutput: '42\n',
    },
    {
      name: '过程参数基础-参数名与局部变量同名',
      code: `
program Test;
procedure TestParam(a: integer);
var a: integer;
begin
  a := 10;
  writeln(a);
end;
begin
  TestParam(5);
end.
      `,
      purpose: '测试参数名与局部变量同名（应该报错）',
      features: ['procedure', 'parameter scope', 'local variable'],
      expectedError: true,
    },
    {
      name: '函数参数基础-无参函数',
      code: `
program Test;
function GetAnswer: integer;
begin
  GetAnswer := 42;
end;
begin
  writeln(GetAnswer);
end.
      `,
      purpose: '测试无参数函数返回值',
      features: ['function', 'no parameters', 'return value'],
      expectedOutput: '42\n',
    },
    {
      name: '函数参数基础-单参函数',
      code: `
program Test;
function Double(x: integer): integer;
begin
  Double := x * 2;
end;
begin
  writeln(Double(10));
end.
      `,
      purpose: '测试单个参数的函数',
      features: ['function', 'single parameter', 'integer'],
      expectedOutput: '20\n',
    },
    {
      name: '函数参数基础-多参函数',
      code: `
program Test;
function Add(a, b: integer): integer;
begin
  Add := a + b;
end;
begin
  writeln(Add(5, 3));
end.
      `,
      purpose: '测试多个参数的函数',
      features: ['function', 'multiple parameters', 'integer'],
      expectedOutput: '8\n',
    },
    {
      name: '函数参数基础-返回值与参数运算',
      code: `
program Test;
function Calculate(a, b, c: integer): integer;
begin
  Calculate := a * b + c;
end;
begin
  writeln(Calculate(2, 3, 4));
end.
      `,
      purpose: '测试函数返回值与参数的运算',
      features: ['function', 'parameter operation', 'arithmetic'],
      expectedOutput: '10\n',
    },
    {
      name: '函数参数基础-函数参数在表达式中',
      code: `
program Test;
function Square(x: integer): integer;
begin
  Square := x * x;
end;
begin
  writeln(Square(5) + Square(3));
end.
      `,
      purpose: '测试函数调用作为表达式的一部分',
      features: ['function', 'expression', 'arithmetic'],
      expectedOutput: '34\n',
    },
    {
      name: '函数参数基础-函数调用嵌套',
      code: `
program Test;
function AddOne(x: integer): integer;
begin
  AddOne := x + 1;
end;
begin
  writeln(AddOne(AddOne(AddOne(1))));
end.
      `,
      purpose: '测试函数调用的嵌套',
      features: ['function', 'nested call'],
      expectedOutput: '4\n',
    },
    {
      name: '函数参数基础-递归函数参数',
      code: `
program Test;
function Factorial(n: integer): integer;
begin
  if n = 0 then
    Factorial := 1
  else
    Factorial := n * Factorial(n - 1);
end;
begin
  writeln(Factorial(5));
end.
      `,
      purpose: '测试递归函数的参数处理',
      features: ['function', 'recursion', 'parameter'],
      expectedOutput: '120\n',
    },
    {
      name: '函数参数基础-嵌套函数参数',
      code: `
program Test;
function Outer(x: integer): integer;
  function Inner(y: integer): integer;
  begin
    Inner := x + y;
  end;
begin
  Outer := Inner(10);
end;
begin
  writeln(Outer(5));
end.
      `,
      purpose: '测试嵌套函数中的参数访问',
      features: ['function', 'nested function', 'parameter scope'],
      expectedOutput: '15\n',
    },
    {
      name: '值参数vsVAR参数-值参数不修改调用方变量',
      code: `
program Test;
var a: integer;
procedure TestValue(x: integer);
begin
  x := x + 1;
end;
begin
  a := 10;
  TestValue(a);
  writeln(a);
end.
      `,
      purpose: '测试值参数不会修改调用方的变量',
      features: ['procedure', 'value parameter', 'pass by value'],
      expectedOutput: '10\n',
    },
    {
      name: '值参数vsVAR参数-var参数修改调用方变量',
      code: `
program Test;
var a: integer;
procedure TestVar(var x: integer);
begin
  x := x + 1;
end;
begin
  a := 10;
  TestVar(a);
  writeln(a);
end.
      `,
      purpose: '测试var参数会修改调用方的变量',
      features: ['procedure', 'var parameter', 'pass by reference'],
      expectedOutput: '11\n',
    },
    {
      name: '值参数vsVAR参数-值参数传递表达式',
      code: `
program Test;
procedure PrintValue(x: integer);
begin
  writeln(x);
end;
begin
  PrintValue(5 + 3 * 2);
end.
      `,
      purpose: '测试值参数可以传递表达式',
      features: ['procedure', 'value parameter', 'expression'],
      expectedOutput: '11\n',
    },
    {
      name: '值参数vsVAR参数-var参数必须是变量',
      code: `
program Test;
procedure TestVar(var x: integer);
begin
  x := 1;
end;
begin
  TestVar(5);
end.
      `,
      purpose: '测试var参数不能传递常量（应该报错）',
      features: ['procedure', 'var parameter', 'constant'],
      expectedError: true,
    },
    {
      name: '值参数vsVAR参数-多个var参数',
      code: `
program Test;
var a, b: integer;
procedure Swap(var x, y: integer);
var temp: integer;
begin
  temp := x;
  x := y;
  y := temp;
end;
begin
  a := 1;
  b := 2;
  Swap(a, b);
  writeln(a);
  writeln(b);
end.
      `,
      purpose: '测试多个var参数',
      features: ['procedure', 'multiple var parameters', 'swap'],
      expectedOutput: '2\n1\n',
    },
    {
      name: '值参数vsVAR参数-值参数和var参数混合',
      code: `
program Test;
var a: integer;
procedure Mixed(x: integer; var y: integer);
begin
  y := x + y;
end;
begin
  a := 10;
  Mixed(5, a);
  writeln(a);
end.
      `,
      purpose: '测试值参数和var参数混合使用',
      features: ['procedure', 'value parameter', 'var parameter', 'mixed'],
      expectedOutput: '15\n',
    },
    {
      name: '值参数vsVAR参数-嵌套过程中的var参数',
      code: `
program Test;
var a: integer;
procedure Outer;
  procedure Inner(var x: integer);
  begin
    x := x + 1;
  end;
begin
  Inner(a);
end;
begin
  a := 10;
  Outer;
  writeln(a);
end.
      `,
      purpose: '测试嵌套过程中的var参数',
      features: ['procedure', 'nested procedure', 'var parameter'],
      expectedOutput: '11\n',
    },
    {
      name: '值参数vsVAR参数-递归过程中的var参数',
      code: `
program Test;
var total: integer;
procedure CountDown(var sum: integer; n: integer);
begin
  if n > 0 then
  begin
    sum := sum + n;
    CountDown(sum, n - 1);
  end;
end;
begin
  total := 0;
  CountDown(total, 5);
  writeln(total);
end.
      `,
      purpose: '测试递归过程中的var参数',
      features: ['procedure', 'recursion', 'var parameter'],
      expectedOutput: '15\n',
    },
    {
      name: '值参数vsVAR参数-数组作为值参数',
      code: `
program Test;
type IntArray = array[1..3] of integer;
var arr: IntArray;
procedure PrintArray(a: IntArray);
var i: integer;
begin
  for i := 1 to 3 do
    writeln(a[i]);
end;
begin
  arr[1] := 1;
  arr[2] := 2;
  arr[3] := 3;
  PrintArray(arr);
end.
      `,
      purpose: '测试数组作为值参数',
      features: ['procedure', 'value parameter', 'array'],
      expectedOutput: '1\n2\n3\n',
    },
    {
      name: '值参数vsVAR参数-记录作为值参数',
      code: `
program Test;
type Point = record
  x, y: integer;
end;
var p: Point;
procedure PrintPoint(pt: Point);
begin
  writeln(pt.x);
  writeln(pt.y);
end;
begin
  p.x := 10;
  p.y := 20;
  PrintPoint(p);
end.
      `,
      purpose: '测试记录作为值参数',
      features: ['procedure', 'value parameter', 'record'],
      expectedOutput: '10\n20\n',
    },
    {
      name: '参数边界情况-参数传递常量',
      code: `
program Test;
procedure PrintConst(x: integer);
begin
  writeln(x);
end;
begin
  PrintConst(42);
end.
      `,
      purpose: '测试参数传递常量',
      features: ['procedure', 'constant parameter'],
      expectedOutput: '42\n',
    },
    {
      name: '参数边界情况-参数传递函数调用结果',
      code: `
program Test;
function GetValue: integer;
begin
  GetValue := 100;
end;
procedure PrintValue(x: integer);
begin
  writeln(x);
end;
begin
  PrintValue(GetValue);
end.
      `,
      purpose: '测试参数传递函数调用的结果',
      features: ['procedure', 'function call as parameter'],
      expectedOutput: '100\n',
    },
    {
      name: '参数边界情况-参数传递数组元素',
      code: `
program Test;
var arr: array[1..3] of integer;
procedure PrintElement(x: integer);
begin
  writeln(x);
end;
begin
  arr[2] := 42;
  PrintElement(arr[2]);
end.
      `,
      purpose: '测试参数传递数组元素',
      features: ['procedure', 'array element as parameter'],
      expectedOutput: '42\n',
    },
    {
      name: '参数边界情况-参数传递记录字段',
      code: `
program Test;
type Point = record
  x, y: integer;
end;
var p: Point;
procedure PrintField(x: integer);
begin
  writeln(x);
end;
begin
  p.x := 100;
  PrintField(p.x);
end.
      `,
      purpose: '测试参数传递记录字段',
      features: ['procedure', 'record field as parameter'],
      expectedOutput: '100\n',
    },
    {
      name: '参数边界情况-参数传递负数',
      code: `
program Test;
procedure PrintNegative(x: integer);
begin
  writeln(x);
end;
begin
  PrintNegative(-42);
end.
      `,
      purpose: '测试参数传递负数',
      features: ['procedure', 'negative parameter'],
      expectedOutput: '-42\n',
    },
    {
      name: '参数边界情况-参数传递零',
      code: `
program Test;
procedure PrintZero(x: integer);
begin
  writeln(x);
end;
begin
  PrintZero(0);
end.
      `,
      purpose: '测试参数传递零',
      features: ['procedure', 'zero parameter'],
      expectedOutput: '0\n',
    },
    {
      name: '参数边界情况-参数传递最大整数',
      code: `
program Test;
procedure PrintMax(x: integer);
begin
  writeln(x);
end;
begin
  PrintMax(32767);
end.
      `,
      purpose: '测试参数传递最大整数',
      features: ['procedure', 'max integer parameter'],
      expectedOutput: '32767\n',
    },
    {
      name: '参数类型组合-integer参数',
      code: `
program Test;
procedure PrintInt(x: integer);
begin
  writeln(x);
end;
begin
  PrintInt(123);
end.
      `,
      purpose: '测试integer类型参数',
      features: ['procedure', 'integer parameter'],
      expectedOutput: '123\n',
    },
    {
      name: '参数类型组合-char参数',
      code: `
program Test;
procedure PrintChar(c: char);
begin
  writeln(c);
end;
begin
  PrintChar('X');
end.
      `,
      purpose: '测试char类型参数',
      features: ['procedure', 'char parameter'],
      expectedOutput: 'X\n',
    },
    {
      name: '参数类型组合-boolean参数',
      code: `
program Test;
procedure PrintBool(b: boolean);
begin
  if b then writeln('true') else writeln('false');
end;
begin
  PrintBool(true);
  PrintBool(false);
end.
      `,
      purpose: '测试boolean类型参数',
      features: ['procedure', 'boolean parameter'],
      expectedOutput: 'true\nfalse\n',
    },
    {
      name: '参数类型组合-子界参数',
      code: `
program Test;
type Grade = 1..100;
procedure PrintGrade(g: Grade);
begin
  writeln(g);
end;
begin
  PrintGrade(50);
end.
      `,
      purpose: '测试子界类型参数',
      features: ['procedure', 'subrange parameter'],
      expectedOutput: '50\n',
    },
    {
      name: '参数类型组合-枚举参数',
      code: `
program Test;
type Color = (red, green, blue);
procedure PrintColor(c: Color);
begin
  case c of
    red: writeln('red');
    green: writeln('green');
    blue: writeln('blue');
  end;
end;
begin
  PrintColor(green);
end.
      `,
      purpose: '测试枚举类型参数',
      features: ['procedure', 'enum parameter'],
      expectedOutput: 'green\n',
    },
    {
      name: '参数类型组合-数组参数',
      code: `
program Test;
type IntArray = array[1..2] of integer;
procedure SumArray(a: IntArray; var result: integer);
begin
  result := a[1] + a[2];
end;
var arr: IntArray;
var s: integer;
begin
  arr[1] := 10;
  arr[2] := 20;
  SumArray(arr, s);
  writeln(s);
end.
      `,
      purpose: '测试数组类型参数',
      features: ['procedure', 'array parameter', 'var parameter'],
      expectedOutput: '30\n',
    },
    {
      name: '参数类型组合-记录参数',
      code: `
program Test;
type Person = record
  initial: char;
  age: integer;
end;
var p: Person;
procedure PrintPerson(p: Person);
begin
  writeln(p.initial);
  writeln(p.age);
end;
begin
  p.initial := 'A';
  p.age := 25;
  PrintPerson(p);
end.
      `,
      purpose: '测试记录类型参数（Pascal82 标准：var 在 procedure 之前；不使用非标 string[n] 类型）',
      features: ['procedure', 'record parameter'],
      expectedOutput: 'A\n25\n',
    },
  ]

  tests.forEach((t) => {
    it(t.name, () => {
      runInterpreterTest(t)
    })
  })
})
