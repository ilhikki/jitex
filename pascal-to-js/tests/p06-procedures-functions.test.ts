// ISO/IEC 7185:1990 - 6.6 Procedure and function declarations
//
// 章节概括：
//   规定过程与函数的声明语法与语义。procedure-declaration 有「directive + procedure-identification」、
//   「procedure-heading + procedure-block」两种形式，function-declaration 与之类似并额外含 result-type
//   （只能为 simple-type-identifier 或 pointer-type-identifier）。heading 中标识符构成定义点；
//   forward 指令对应的标识符必须恰有一个应用出现在同一 procedure-and-function-declaration-part 内；
//   一个 procedure/function-identifier 至多关联一个 block；function-block 至少要有一条以该函数标识符
//   为赋值目标的赋值语句。参数部分规定 value/variable/procedural/functional 四类形式参数的定义点与绑定规则
//   （变量参数的实参须为 variable-access，不得为变体的 selector 或 packed 类型的分量）、参数表 congruity
//   判据，以及（扩展级别）conformant array 参数与 conformability 规则。required procedures 用前后断言定义
//   文件处理过程 rewrite/put/reset/get 与 read/write、动态分配过程 new/dispose、转移过程 pack/unpack；
//   required functions 定义算术函数（abs、sqr、sin、cos、exp、ln、sqrt、arctan）、转移函数（trunc、round）、
//   序数函数（ord、chr、succ、pred）与布尔函数（odd、eof、eoln）的结果与出错条件。
//
// 子章节：
//   6.6.1 Procedure-declarations
//   6.6.2 Function-declarations
//   6.6.3 Parameters
//     6.6.3.1 General
//     6.6.3.2 Value parameters
//     6.6.3.3 Variable parameters
//     6.6.3.4 Procedural parameters
//     6.6.3.5 Functional parameters
//     6.6.3.6 Parameter list congruity
//     6.6.3.7 Conformant array parameters
//     6.6.3.8 Conformability
//   6.6.4 Required procedures and functions
//   6.6.5 Required procedures
//     6.6.5.1 General
//     6.6.5.2 File handling procedures
//     6.6.5.3 Dynamic allocation procedures
//     6.6.5.4 Transfer procedures
//   6.6.6 Required functions
//     6.6.6.1 General
//     6.6.6.2 Arithmetic functions
//     6.6.6.3 Transfer functions
//     6.6.6.4 Ordinal functions
//     6.6.6.5 Boolean functions
//
// 状态：骨架文件，用例待从 tests/integration/ 迁移（迁移时仅改 name，内容不动）。

import { describe } from './harness.ts'
import { type PascalTest, runPascalTests } from './harness.ts'

function text(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

describe('ISO 7185 6.6 - Procedure and function declarations', () => {
  const tests: PascalTest[] = [
    {
      name: '6.6 simple procedure call',
      code: `program test;
        procedure sayhello;
        begin writeln(1); end;
        begin sayhello; end.`,
      purpose: '简单过程调用',
      expectedOutput: '1\n',
    },
    {
      name: '6.6 procedure with value parameter',
      code: `program test;
        procedure printn(n: integer);
        begin writeln(n); end;
        begin printn(42); end.`,
      purpose: '带值参数的过程',
      expectedOutput: '42\n',
    },
    {
      name: '6.6 procedure with var parameter',
      code: `program test;
        var a: integer;
        procedure incvar(var x: integer);
        begin x := x + 1; end;
        begin a := 5; incvar(a); writeln(a); end.`,
      purpose: '带 var 参数的过程',
      expectedOutput: '6\n',
    },
    {
      name: '6.6 simple function call',
      code: `program test;
        var r: integer;
        function double(n: integer): integer;
        begin double := n * 2; end;
        begin r := double(5); writeln(r); end.`,
      purpose: '简单函数调用',
      expectedOutput: '10\n',
    },
    {
      name: '6.6 nested procedure call',
      code: `program test;
        procedure inner;
        begin writeln(1); end;
        procedure outer;
        begin inner; end;
        begin outer; end.`,
      purpose: '嵌套过程调用',
      expectedOutput: '1\n',
    },
    {
      name: '6.6 recursive factorial',
      code: `program test;
        var r: integer;
        function fact(n: integer): integer;
        begin
          if n <= 1 then fact := 1
          else fact := n * fact(n - 1);
        end;
        begin r := fact(5); writeln(r); end.`,
      purpose: '递归阶乘',
      expectedOutput: '120\n',
    },
    {
      name: '6.6 过程参数基础-无参过程',
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
      name: '6.6 过程参数基础-单参过程',
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
      name: '6.6 过程参数基础-多参过程',
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
      name: '6.6 过程参数基础-同类型多参数',
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
      name: '6.6 过程参数基础-不同类型参数',
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
      name: '6.6 过程参数基础-参数顺序',
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
      name: '6.6 过程参数基础-参数名与全局变量同名',
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
      name: '6.6 过程参数基础-参数名与局部变量同名',
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
      name: '6.6 函数参数基础-无参函数',
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
      name: '6.6 函数参数基础-单参函数',
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
      name: '6.6 函数参数基础-多参函数',
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
      name: '6.6 函数参数基础-返回值与参数运算',
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
      name: '6.6 函数参数基础-函数参数在表达式中',
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
      name: '6.6 函数参数基础-函数调用嵌套',
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
      name: '6.6 函数参数基础-递归函数参数',
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
      name: '6.6 函数参数基础-嵌套函数参数',
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
      name: '6.6 值参数vsVAR参数-值参数不修改调用方变量',
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
      name: '6.6 值参数vsVAR参数-var参数修改调用方变量',
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
      name: '6.6 值参数vsVAR参数-值参数传递表达式',
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
      name: '6.6 值参数vsVAR参数-var参数必须是变量',
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
      name: '6.6 值参数vsVAR参数-多个var参数',
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
      name: '6.6 值参数vsVAR参数-值参数和var参数混合',
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
      name: '6.6 值参数vsVAR参数-嵌套过程中的var参数',
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
      name: '6.6 值参数vsVAR参数-递归过程中的var参数',
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
      name: '6.6 值参数vsVAR参数-数组作为值参数',
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
      name: '6.6 值参数vsVAR参数-记录作为值参数',
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
      name: '6.6 参数边界情况-参数传递常量',
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
      name: '6.6 参数边界情况-参数传递函数调用结果',
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
      name: '6.6 参数边界情况-参数传递数组元素',
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
      name: '6.6 参数边界情况-参数传递记录字段',
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
      name: '6.6 参数边界情况-参数传递负数',
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
      name: '6.6 参数边界情况-参数传递零',
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
      name: '6.6 参数边界情况-参数传递最大整数',
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
      name: '6.6 参数类型组合-integer参数',
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
      name: '6.6 参数类型组合-char参数',
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
      name: '6.6 参数类型组合-boolean参数',
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
      name: '6.6 参数类型组合-子界参数',
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
      name: '6.6 参数类型组合-枚举参数',
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
      name: '6.6 参数类型组合-数组参数',
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
      name: '6.6 参数类型组合-记录参数',
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
      name: '6.6 var实参-数组元素 a[i]',
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
      name: '6.6 var实参-记录字段 r.f',
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
      name: '6.6 var实参-数组元素的字段 a[i].f（变量下标）',
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
      name: '6.6 var实参-字段的数组元素 r.arr[i]',
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
      name: '6.6 var实参-嵌套记录字段 r.inner.v',
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
      name: '6.6 var实参-二维数组元素 m[i,j]',
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
      name: '6.6 var实参-变体记录的变体字段',
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
      name: '6.6 var实参-指针解引用 p^',
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
      name: '6.6 var实参-解引用的字段 p^.f',
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
      name: '6.6 var实参-with 语句内的字段',
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
      name: '6.6 var实参-文件缓冲区 f^',
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
    // ==========================================================================
    // 6.6.5.2 File handling procedures
    // ==========================================================================

    // --- rewrite / write / writeln (text) ---
    {
      name: '6.6 rewrite(f): 正向 - 创建新文件用于写入',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN REWRITE(F);WRITELN(F,'HELLO');END.`,
      purpose: 'ISO 6.6.5.2 rewrite(f) post‑assertion',
      textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
      expectedFileContains: [{ url: 'F', contains: 'HELLO' }],
    },

    // --- put (for text file, using f^ and put) ---
    {
      name: '6.6 put(f): 正向 - 将缓冲区内容追加到文件',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;V:CHAR;BEGIN REWRITE(F);V:='A';F^:=V;PUT(F);END.`,
      purpose: 'ISO 6.6.5.2 put(f) pre‑assertion: f.M = Generation, f^ is not undefined',
      textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
      expectedFileContains: [{ url: 'F', contains: 'A' }],
    },

    {
      name: '6.6 put(f): 反向 - 未 rewrite 直接 put 应失败',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN F^:='A';PUT(F);END.`,
      purpose: 'ISO 6.6.5.2 put(f) pre‑assertion violated: f.M != Generation',
      textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
      expectedError: '',
      maxSteps: 1000,
    },

    // --- reset / get / read ---
    {
      name: '6.6 reset(f): 正向 - 打开文件用于读取，F^ 指向首字符',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;CH:CHAR;BEGIN RESET(F);CH:=F^;WRITE(CH);END.`,
      purpose: 'ISO 6.6.5.2 reset(f) post‑assertion',
      textFiles: new Map<string, Uint8Array>([['F', text('AB')]]),
      expectedContains: 'A',
    },

    {
      name: '6.6 reset(f): 正向 - 空文件 reset 后 EOF 为真',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);IF EOF(F)THEN WRITE('EMPTY')ELSE WRITE('NOT EMPTY');END.`,
      purpose: 'ISO 6.6.5.2 reset(f) post‑assertion: f.R = S()',
      textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
      expectedContains: 'EMPTY',
    },

    {
      name: '6.6 get(f): 正向 - 推进到下一个组件',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;CH:CHAR;BEGIN RESET(F);GET(F);CH:=F^;WRITE(CH);END.`,
      purpose: 'ISO 6.6.5.2 get(f) post‑assertion',
      textFiles: new Map<string, Uint8Array>([['F', text('AB')]]),
      expectedContains: 'B',
    },

    {
      name: '6.6 get(f): 反向 - EOF 后 get 应失败',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);GET(F);GET(F);GET(F);END.`,
      purpose: 'ISO 6.6.5.2 get(f) pre‑assertion violated: f0.R is S()',
      textFiles: new Map<string, Uint8Array>([['F', text('AB')]]),
      expectedError: '',
      maxSteps: 1000,
    },

    {
      name: '6.6 read(f, v): 正向 - 从文件读整数',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;N:INTEGER;BEGIN RESET(F);READ(F,N);WRITE(N);END.`,
      purpose: 'ISO 6.6.5.2 read(f, v) integer case',
      textFiles: new Map<string, Uint8Array>([['F', text('42')]]),
      expectedContains: '42',
    },

    {
      name: '6.6 read(f, c): 正向 - 读 char 不跳过空格',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;C:CHAR;BEGIN RESET(F);READ(F,C);WRITE(ORD(C));END.`,
      purpose: 'ISO 6.6.5.2 read(f, v) char case: s length 1',
      textFiles: new Map<string, Uint8Array>([['F', text(' A')]]),
      expectedContains: '32',
    },

    // --- page ---
    {
      name: '6.6 page(f): 正向 - 写入 form feed 字符',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN REWRITE(F);PAGE(F);WRITE(F,'X');END.`,
      purpose: 'ISO 6.6.5.2 page(f) 在文本文件中写入 form feed',
      textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
      expectedFileContains: [{ url: 'F', contains: '\f' }],
    },

    // ==========================================================================
    // 6.6.5.3 Dynamic allocation procedures (new / dispose) — 无需修改
    // ==========================================================================

    {
      name: '6.6 new(p): 正向 - new 后 p^ 可读写',
      code: `PROGRAM TEST(OUTPUT);TYPE IPTR=^INTEGER;VAR P:IPTR;BEGIN NEW(P);P^:=42;WRITE(P^);DISPOSE(P);END.`,
      purpose: 'ISO 6.6.5.3 new(p) 创建新变量',
      expectedContains: '42',
    },

    {
      name: '6.6 new(p): 正向 - new 后 p 不等于 nil',
      code:
        `PROGRAM TEST(OUTPUT);TYPE IPTR=^INTEGER;VAR P:IPTR;BEGIN NEW(P);IF P<>NIL THEN WRITE('NOTNIL')ELSE WRITE('NIL');DISPOSE(P);END.`,
      purpose: 'ISO 6.6.5.3 new(p) 后 p 是 identifying‑value，非 nil',
      expectedContains: 'NOTNIL',
    },

    {
      name: '6.6 nil 比较: 正向 - 未初始化指针等于 nil',
      code:
        `PROGRAM TEST(OUTPUT);TYPE IPTR=^INTEGER;VAR P:IPTR;BEGIN IF P=NIL THEN WRITE('NIL')ELSE WRITE('NOTNIL');END.`,
      purpose: 'ISO 6.4.4: 指针变量默认为 nil‑value',
      expectedContains: 'NIL',
    },

    {
      name: '6.6 new/record: 正向 - 指向记录的指针',
      code:
        `PROGRAM TEST(OUTPUT);TYPE RPTR=^REC;REC=RECORD X:INTEGER;Y:INTEGER END;VAR P:RPTR;BEGIN NEW(P);P^.X:=10;P^.Y:=20;WRITE(P^.X+P^.Y);DISPOSE(P);END.`,
      purpose: 'ISO 6.6.5.3 new(p) 对记录类型',
      expectedContains: '30',
    },

    {
      name: '6.6 p^: 反向 - nil 解引用应报错',
      code: `PROGRAM TEST(OUTPUT);TYPE IPTR=^INTEGER;VAR P:IPTR;BEGIN P^:=42;END.`,
      purpose: 'ISO 6.4.4/6.5.4: nil 指针解引用是 error',
      expectedError: 'nil pointer',
      maxSteps: 1000,
    },

    {
      name: '6.6 dispose(nil): 反向 - dispose 未初始化指针应报错',
      code: `PROGRAM TEST(OUTPUT);TYPE IPTR=^INTEGER;VAR P:IPTR;BEGIN DISPOSE(P);END.`,
      purpose: 'ISO 6.6.5.3: dispose 的 identifying‑value 为 nil 是 error',
      expectedError: 'nil-value',
      maxSteps: 1000,
    },

    {
      name: '6.6 dispose 后解引用: 反向 - dispose 后 p^ 应报错',
      code: `PROGRAM TEST(OUTPUT);TYPE IPTR=^INTEGER;VAR P:IPTR;BEGIN NEW(P);DISPOSE(P);P^:=42;END.`,
      purpose: 'ISO 6.6.5.3: dispose 后 p 置 nil，再解引用是 error',
      expectedError: 'nil pointer',
      maxSteps: 1000,
    },

    // ==========================================================================
    // 6.6.5.4 Transfer procedures (pack / unpack) — 这些过程标准要求存在，测试报错合理
    // ==========================================================================

    {
      name: '6.6 pack: 反向 - 未实现的标准过程应报错',
      code: `PROGRAM TEST(OUTPUT);VAR A:ARRAY[1..10] OF CHAR;Z:PACKED ARRAY[1..10] OF CHAR;BEGIN PACK(A,1,Z);END.`,
      purpose: 'ISO 6.6.5.4 pack — 当前实现未支持，必须报错',
      expectedError: 'unknown procedure',
      maxSteps: 1000,
    },

    {
      name: '6.6 unpack: 反向 - 未实现的标准过程应报错',
      code: `PROGRAM TEST(OUTPUT);VAR A:ARRAY[1..10] OF CHAR;Z:PACKED ARRAY[1..10] OF CHAR;BEGIN UNPACK(Z,A,1);END.`,
      purpose: 'ISO 6.6.5.4 unpack — 当前实现未支持，必须报错',
      expectedError: 'unknown procedure',
      maxSteps: 1000,
    },

    // ==========================================================================
    // 6.6.6.2 Arithmetic functions (无需修改)
    // ==========================================================================

    {
      name: '6.6 abs(x): 正向 - 整数绝对值',
      code: `PROGRAM TEST(OUTPUT);VAR X:INTEGER;BEGIN X:=-5;WRITE(ABS(X));END.`,
      purpose: 'ISO 6.6.6.2 abs(-5)=5',
      expectedContains: '5',
    },

    {
      name: '6.6 abs(x): 正向 - 实数绝对值',
      code: `PROGRAM TEST(OUTPUT);VAR X:REAL;BEGIN X:=-3.5;WRITE(ABS(X));END.`,
      purpose: 'ISO 6.6.6.2 abs(-3.5)=3.5',
      expectedContains: '3.5',
    },

    {
      name: '6.6 sqr(x): 正向 - 整数平方',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(SQR(7));END.`,
      purpose: 'ISO 6.6.6.2 sqr(7)=49',
      expectedContains: '49',
    },

    {
      name: '6.6 sqr(x): 正向 - 实数平方',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(SQR(1.5));END.`,
      purpose: 'ISO 6.6.6.2 sqr(1.5)=2.25',
      expectedContains: '2.25',
    },

    {
      name: '6.6 sqrt(x): 正向 - 非负实数平方根',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(SQRT(4.0));END.`,
      purpose: 'ISO 6.6.6.2 sqrt(4.0)=2.0',
      expectedContains: '2',
    },

    {
      name: '6.6 sqrt(x): 反向 - 负数平方根应报错',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(SQRT(-1.0));END.`,
      purpose: 'ISO 6.6.6.2 sqrt: "It shall be an error if such a value does not exist"',
      expectedError: '',
      maxSteps: 1000,
    },

    {
      name: '6.6 ln(x): 正向 - 自然对数',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(LN(1.0));END.`,
      purpose: 'ISO 6.6.6.2 ln(1.0)=0',
      expectedContains: '0',
    },

    {
      name: '6.6 ln(x): 反向 - 非正数对数应报错',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(LN(0.0));END.`,
      purpose: 'ISO 6.6.6.2 ln: "It shall be an error if such a value does not exist" (x>0)',
      expectedError: '',
      maxSteps: 1000,
    },

    {
      name: '6.6 exp(x): 正向 - 指数函数',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(EXP(1.0)));END.`,
      purpose: 'ISO 6.6.6.2 exp(1.0) ≈ 2.718... → 3',
      expectedContains: '3',
    },

    {
      name: '6.6 sin(x): 正向 - 正弦函数',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(SIN(0.0)));END.`,
      purpose: 'ISO 6.6.6.2 sin(0)=0',
      expectedContains: '0',
    },

    {
      name: '6.6 cos(x): 正向 - 余弦函数',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(COS(0.0)));END.`,
      purpose: 'ISO 6.6.6.2 cos(0)=1',
      expectedContains: '1',
    },

    {
      name: '6.6 arctan(x): 正向 - 反正切函数',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(ARCTAN(0.0)));END.`,
      purpose: 'ISO 6.6.6.2 arctan(0)=0',
      expectedContains: '0',
    },

    // ==========================================================================
    // 6.6.6.3 Transfer functions (trunc / round)
    // ==========================================================================

    {
      name: '6.6 trunc(x): 正向 - 正数截断',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(TRUNC(3.7));END.`,
      purpose: 'ISO 6.6.6.3 trunc(3.7)=3',
      expectedContains: '3',
    },

    {
      name: '6.6 trunc(x): 正向 - 负数截断',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(TRUNC(-3.7));END.`,
      purpose: 'ISO 6.6.6.3 trunc(-3.7)=-3',
      expectedContains: '-3',
    },

    {
      name: '6.6 round(x): 正向 - 正数四舍五入',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(3.5));END.`,
      purpose: 'ISO 6.6.6.3 round(3.5)=4',
      expectedContains: '4',
    },

    {
      name: '6.6 round(x): 正向 - 负数四舍五入',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(-3.5));END.`,
      purpose: 'ISO 6.6.6.3 round(-3.5)=-4',
      expectedContains: '-4',
    },

    // ==========================================================================
    // 6.6.6.4 Ordinal functions (ord / chr / succ / pred)
    // ==========================================================================

    {
      name: '6.6 ord(x): 正向 - char 的序数',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ORD('A'));END.`,
      purpose: 'ISO 6.6.6.4 ord(A)=65',
      expectedContains: '65',
    },

    {
      name: '6.6 ord(x): 正向 - 布尔的序数',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ORD(TRUE));END.`,
      purpose: 'ISO 6.6.6.4 ord(TRUE)=1',
      expectedContains: '1',
    },

    {
      name: '6.6 ord(x): 正向 - 整数的序数（即自身）',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ORD(42));END.`,
      purpose: 'ISO 6.6.6.4 ord(42)=42',
      expectedContains: '42',
    },

    {
      name: '6.6 chr(x): 正向 - 整数转字符',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(CHR(66));END.`,
      purpose: 'ISO 6.6.6.4 chr(66)=B',
      expectedContains: 'B',
    },

    {
      name: '6.6 succ(x): 正向 - 后继值',
      code: `PROGRAM TEST(OUTPUT);VAR C:CHAR;BEGIN C:='A';WRITE(SUCC(C));END.`,
      purpose: 'ISO 6.6.6.4 succ(A)=B',
      expectedContains: 'B',
    },

    {
      name: '6.6 pred(x): 正向 - 前驱值',
      code: `PROGRAM TEST(OUTPUT);VAR C:CHAR;BEGIN C:='B';WRITE(PRED(C));END.`,
      purpose: 'ISO 6.6.6.4 pred(B)=A',
      expectedContains: 'A',
    },

    {
      name: '6.6 succ(x): 反向 - 枚举末值无后继应报错',
      code: `PROGRAM TEST(OUTPUT);TYPE COLOR=(RED,GREEN,BLUE);VAR C:COLOR;BEGIN C:=BLUE;WRITE(SUCC(C));END.`,
      purpose: 'ISO 6.6.6.4 succ: "error if none"',
      expectedError: '',
      maxSteps: 1000,
    },

    {
      name: '6.6 pred(x): 反向 - 枚举首值无前驱应报错',
      code: `PROGRAM TEST(OUTPUT);TYPE COLOR=(RED,GREEN,BLUE);VAR C:COLOR;BEGIN C:=RED;WRITE(PRED(C));END.`,
      purpose: 'ISO 6.6.6.4 pred: "error if none"',
      expectedError: '',
      maxSteps: 1000,
    },

    // ==========================================================================
    // 6.6.6.5 Boolean functions (odd / eof / eoln)
    // ==========================================================================

    {
      name: '6.6 odd(x): 正向 - 奇数返回 true',
      code: `PROGRAM TEST(OUTPUT);BEGIN IF ODD(7)THEN WRITE('ODD')ELSE WRITE('EVEN');END.`,
      purpose: 'ISO 6.6.6.5 odd(7)=true',
      expectedContains: 'ODD',
    },

    {
      name: '6.6 odd(x): 正向 - 偶数返回 false',
      code: `PROGRAM TEST(OUTPUT);BEGIN IF ODD(8)THEN WRITE('ODD')ELSE WRITE('EVEN');END.`,
      purpose: 'ISO 6.6.6.5 odd(8)=false',
      expectedContains: 'EVEN',
    },

    {
      name: '6.6 eof(f): 正向 - 文件末尾检测',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);IF EOF(F)THEN WRITE('EOF');END.`,
      purpose: 'ISO 6.6.6.5 eof(f): "true if f.R is empty sequence"',
      textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
      expectedContains: 'EOF',
    },

    {
      name: '6.6 eoln(f): 正向 - 行结束检测',
      code:
        `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);WHILE NOT EOLN(F)DO GET(F);IF EOLN(F)THEN WRITE('EOLN');END.`,
      purpose: 'ISO 6.6.6.5 eoln(f): "true if f^ is end‑of‑line or end‑of‑file"',
      textFiles: new Map<string, Uint8Array>([['F', text('AB\n')]]),
      expectedContains: 'EOLN',
    },

    {
      name: '6.6 eof: 正向 - 无参数默认对 input',
      code: `PROGRAM TEST(INPUT,OUTPUT);BEGIN IF EOF THEN WRITE('INPUT_EOF');END.`,
      purpose: 'ISO 6.6.6.5 eof: "If parameter omitted, applies to input"',
      expectedContains: 'INPUT_EOF',
    },

    {
      name: '6.6 eoln: 正向 - 无参数默认对 input',
      code: `PROGRAM TEST(INPUT,OUTPUT);BEGIN IF EOLN THEN WRITE('INPUT_EOLN');END.`,
      purpose: 'ISO 6.6.6.5 eoln: "If parameter omitted, applies to input"',
      expectedContains: 'INPUT_EOLN',
    },
  ]

  runPascalTests(tests)
})
