import { describe } from './harness.ts'
import { type PascalTest, runPascalTests } from './harness.ts'

describe('Phase 4: Parameters', () => {
  const tests: PascalTest[] = [
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
      expectedError: '',
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
      expectedError: '',
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
      expectedOutput: 'green\n',
    },
    {
      name: '参数类型组合-数组参数',
      code: `
program Test;
type IntArray = array[1..2] of integer;
var arr: IntArray;
function SumArray(a: IntArray): integer;
begin
  SumArray := a[1] + a[2];
end;
begin
  arr[1] := 10;
  arr[2] := 20;
  writeln(SumArray(arr));
end.
      `,
      purpose: '测试数组类型参数（Pascal82 标准：var 在 function 之前；var 参数作为 P3 单独测试）',
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
      expectedOutput: 'A\n25\n',
    },
    // --------------------------------------------------------
    // ISO 7185 6.6.3.3：var 实参必须是 variable-access（6.5.1）
    //   variable-access = entire-variable | component-variable
    //                   | identified-variable | buffer-variable
    //   component-variable = indexed-variable | field-designator
    // 因此数组元素、记录字段、解引用等「非标识符」实参必须支持，
    // 且形参的修改要反映到原存储上。
    // --------------------------------------------------------
    {
      name: 'var实参-数组元素 a[i]',
      code: `
program Test;
var arr: array[1..3] of integer;
procedure SetIt(var x: integer);
begin
  x := 42;
end;
begin
  arr[2] := 0;
  SetIt(arr[2]);
  writeln(arr[2]);
end.
      `,
      purpose: 'ISO 6.5.1 indexed-variable 作为 var 实参，写回原数组元素',
      expectedOutput: '42\n',
    },
    {
      name: 'var实参-记录字段 r.f',
      code: `
program Test;
type Point = record
  x, y: integer;
end;
var p: Point;
procedure SetIt(var v: integer);
begin
  v := 42;
end;
begin
  p.x := 0;
  SetIt(p.x);
  writeln(p.x);
end.
      `,
      purpose: 'ISO 6.5.1 field-designator 作为 var 实参，写回原字段',
      expectedOutput: '42\n',
    },
    {
      name: 'var实参-数组元素的字段 a[i].f（变量下标）',
      code: `
program Test;
type Point = record
  x, y: integer;
end;
var a: array[1..3] of Point;
    i: integer;
procedure SetIt(var v: integer);
begin
  v := 42;
end;
begin
  i := 2;
  a[i].x := 0;
  SetIt(a[i].x);
  writeln(a[i].x);
end.
      `,
      purpose: 'indexed-variable + field-designator 组合，且下标是运行期变量',
      expectedOutput: '42\n',
    },
    {
      name: 'var实参-字段的数组元素 r.arr[i]',
      code: `
program Test;
type Bag = record
  items: array[1..3] of integer;
end;
var b: Bag;
    i: integer;
procedure SetIt(var v: integer);
begin
  v := 42;
end;
begin
  i := 3;
  b.items[i] := 0;
  SetIt(b.items[i]);
  writeln(b.items[i]);
end.
      `,
      purpose: 'field-designator + indexed-variable 组合（字段内数组元素）',
      expectedOutput: '42\n',
    },
    {
      name: 'var实参-嵌套记录字段 r.inner.v',
      code: `
program Test;
type Inner = record
  v: integer;
end;
     Outer = record
  inner: Inner;
end;
var o: Outer;
procedure SetIt(var v: integer);
begin
  v := 42;
end;
begin
  o.inner.v := 0;
  SetIt(o.inner.v);
  writeln(o.inner.v);
end.
      `,
      purpose: '多层 field-designator 作为 var 实参',
      expectedOutput: '42\n',
    },
    {
      name: 'var实参-二维数组元素 m[i,j]',
      code: `
program Test;
var m: array[1..2, 1..3] of integer;
    i, j: integer;
procedure SetIt(var v: integer);
begin
  v := 42;
end;
begin
  i := 2;
  j := 3;
  m[i, j] := 0;
  SetIt(m[i, j]);
  writeln(m[i, j]);
end.
      `,
      purpose: '多维 indexed-variable 作为 var 实参（验证展平下标换算）',
      expectedOutput: '42\n',
    },
    {
      name: 'var实参-变体记录的变体字段',
      code: `
program Test;
type Kind = (kindA, kindB);
     Rec = record
       pad: integer;
       case k: Kind of
         kindA: (x: integer);
         kindB: (y: integer);
     end;
var r: Rec;
procedure SetIt(var v: integer);
begin
  v := 42;
end;
begin
  r.k := kindA;
  r.x := 0;
  SetIt(r.x);
  writeln(r.x);
end.
      `,
      purpose: '变体分支字段作为 var 实参（验证变体槽位偏移与写回）',
      expectedOutput: '42\n',
    },
    {
      name: 'var实参-指针解引用 p^',
      code: `
program Test;
type P = ^integer;
var p: P;
procedure SetIt(var v: integer);
begin
  v := 42;
end;
begin
  new(p);
  p^ := 0;
  SetIt(p^);
  writeln(p^);
end.
      `,
      purpose: 'ISO 6.5.1 identified-variable 作为 var 实参',
      expectedOutput: '42\n',
    },
    {
      name: 'var实参-解引用的字段 p^.f',
      code: `
program Test;
type Point = record
  x, y: integer;
end;
     PP = ^Point;
var p: PP;
procedure SetIt(var v: integer);
begin
  v := 42;
end;
begin
  new(p);
  p^.x := 0;
  SetIt(p^.x);
  writeln(p^.x);
end.
      `,
      purpose: 'identified-variable + field-designator 组合',
      expectedOutput: '42\n',
    },
    {
      name: 'var实参-with 语句内的字段',
      code: `
program Test;
type Point = record
  x, y: integer;
end;
var p: Point;
procedure SetIt(var v: integer);
begin
  v := 42;
end;
begin
  with p do
    begin
      x := 0;
      SetIt(x);
    end;
  writeln(p.x);
end.
      `,
      purpose: 'with 展开后的字段仍属 field-designator，应可作 var 实参',
      expectedOutput: '42\n',
    },
    {
      name: 'var实参-文件缓冲区 f^',
      code: `
program Test(f);
type R = record
  x: integer;
end;
var f: file of R;
    r: R;
procedure SetIt(var v: R);
begin
  v.x := 42;
end;
begin
  rewrite(f);
  r.x := 0;
  f^ := r;
  SetIt(f^);
  put(f);
  reset(f);
  r := f^;
  writeln(r.x);
end.
      `,
      purpose: 'ISO 6.5.1 buffer-variable（f^）作为 var 实参，put 后应写入 42',
      expectedOutput: '42\n',
    },
  ]

  runPascalTests(tests)
})
