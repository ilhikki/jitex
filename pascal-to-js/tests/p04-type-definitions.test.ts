// ISO/IEC 7185:1990 - 6.4 Type-definitions
//
// 章节概括：
//   type-definition 引入标识符表示一个类型，语法为 type-definition = identifier '=' type-denoter，
//   type-denoter 为 type-identifier 或 new-type（new-ordinal-type / new-structured-type / new-pointer-type）；
//   每个 new-type 的出现都表示一个与其他任何 new-type 都不同的类型。标识符在块的 type-definition-part
//   中的出现构成定义点（region 为块）；除 new-pointer-type 的 domain-type 中的应用出现外，
//   type-denoter 不得含该标识符的应用出现。子条款进一步规定：simple-types（required simple-types
//   integer/real/Boolean/char 的语义，以及 enumerated-types、subrange-types）；structured-types 的通用规则
//   （packed 表示及 array/record/set/file 四类，其中 file-types 含 textfile）；pointer-types
//   （单个 nil 值与一集 identifying-value，仅由 new 创建）；compatible types 的四条情形；
//   assignment-compatibility 的五条情形及 integer 到 real 的隐式转换。
//
// 子章节：
//   6.4.1 General
//   6.4.2 Simple-types
//     6.4.2.1 General
//     6.4.2.2 Required simple-types
//     6.4.2.3 Enumerated-types
//     6.4.2.4 Subrange-types
//   6.4.3 Structured-types
//     6.4.3.1 General
//     6.4.3.2 Array-types
//     6.4.3.3 Record-types
//     6.4.3.4 Set-types
//     6.4.3.5 File-types
//   6.4.4 Pointer-types
//   6.4.5 Compatible types
//   6.4.6 Assignment-compatibility
//   6.4.7 Example of a type-definition-part

import { describe } from './harness.ts'
import { type PascalTest, runPascalTests } from './harness.ts'

describe('ISO 7185 6.4 - Type-definitions', () => {
  const tests: PascalTest[] = [
    // Array Basics
    {
      name: '6.4 array declaration and access',
      code:
        'program test; var arr: array[1..5] of integer; begin arr[1] := 10; arr[3] := 30; writeln(arr[1]); writeln(arr[3]); end.',
      purpose: '测试数组声明和元素访问',
      expectedOutput: '10\n30\n',
    },
    {
      name: '6.4 array assignment',
      code:
        'program test; var arr: array[0..2] of integer; begin arr[0] := 1; arr[1] := 2; arr[2] := 3; writeln(arr[0]+arr[1]+arr[2]); end.',
      purpose: '测试数组元素赋值',
      expectedOutput: '6\n',
    },
    {
      name: '6.4 array individual assignment',
      code:
        'program test; var arr: array[1..3] of integer; begin arr[1] := 10; arr[2] := 20; arr[3] := 30; writeln(arr[1]); writeln(arr[2]); writeln(arr[3]); end.',
      purpose: '测试数组逐个赋值（标准 Pascal 不支持初始化语法）',
      expectedOutput: '10\n20\n30\n',
    },
    {
      name: '6.4 array as procedure parameter (value)',
      code:
        'program test; var arr: array[1..3] of integer; procedure printArray(a: array[1..3] of integer); begin writeln(a[1]); writeln(a[2]); end; begin arr[1] := 100; arr[2] := 200; printArray(arr); end.',
      purpose: '测试数组作为过程参数（值传递）',
      expectedOutput: '100\n200\n',
    },
    {
      name: '6.4 array as procedure parameter (var)',
      code:
        'program test; var arr: array[1..3] of integer; procedure modifyArray(var a: array[1..3] of integer); begin a[1] := 999; end; begin arr[1] := 100; modifyArray(arr); writeln(arr[1]); end.',
      purpose: '测试数组作为过程参数（var传递）',
      expectedOutput: '999\n',
    },
    {
      name: '6.4 array as function parameter',
      code:
        'program test; var arr: array[1..3] of integer; function sumArray(a: array[1..3] of integer): integer; begin sumArray := a[1] + a[2] + a[3]; end; begin arr[1] := 1; arr[2] := 2; arr[3] := 3; writeln(sumArray(arr)); end.',
      purpose: '测试数组作为函数参数',
      expectedOutput: '6\n',
    },
    {
      name: '6.4 multidimensional array',
      code:
        'program test; var arr: array[1..2, 1..2] of integer; begin arr[1,1] := 1; arr[1,2] := 2; arr[2,1] := 3; arr[2,2] := 4; writeln(arr[1,1], arr[1,2]); writeln(arr[2,1], arr[2,2]); end.',
      purpose: '测试多维数组',
      expectedOutput: '12\n34\n',
    },
    {
      name: '6.4 array bound check',
      code: 'program test; var arr: array[1..3] of integer; begin arr[5] := 10; end.',
      purpose: '测试数组边界检查',
      expectedError: '',
    },
    // Array Operations
    {
      name: '6.4 array element as lvalue',
      code: 'program test; var arr: array[1..3] of integer; begin arr[2] := 42; writeln(arr[2]); end.',
      purpose: '测试数组元素作为左值',
      expectedOutput: '42\n',
    },
    {
      name: '6.4 array element as rvalue',
      code:
        'program test; var arr: array[1..3] of integer; x: integer; begin arr[1] := 10; x := arr[1]; writeln(x); end.',
      purpose: '测试数组元素作为右值',
      expectedOutput: '10\n',
    },
    {
      name: '6.4 array element in expression',
      code:
        'program test; var arr: array[1..3] of integer; begin arr[1] := 5; arr[2] := 3; writeln(arr[1] * arr[2] + 10); end.',
      purpose: '测试数组元素在表达式中',
      expectedOutput: '25\n',
    },
    {
      name: '6.4 array as global variable',
      code:
        'program test; var arr: array[1..3] of integer; procedure setArr; begin arr[1] := 100; end; begin setArr; writeln(arr[1]); end.',
      purpose: '测试数组作为全局变量',
      expectedOutput: '100\n',
    },
    {
      name: '6.4 array as local variable',
      code:
        'program test; procedure testLocal; var arr: array[1..2] of integer; begin arr[1] := 1; arr[2] := 2; writeln(arr[1]+arr[2]); end; begin testLocal; end.',
      purpose: '测试数组作为局部变量',
      expectedOutput: '3\n',
    },
    {
      name: '6.4 array in nested procedure',
      code:
        'program test; procedure outer; var arr: array[1..2] of integer; procedure inner; begin arr[1] := 99; end; begin arr[1] := 1; inner; writeln(arr[1]); end; begin outer; end.',
      purpose: '测试嵌套过程中的数组',
      expectedOutput: '99\n',
    },
    // Record Basics
    {
      name: '6.4 record declaration',
      code:
        'program test; type Point = record x, y: integer end; var p: Point; begin p.x := 10; p.y := 20; writeln(p.x, p.y); end.',
      purpose: '测试记录声明',
      expectedOutput: '1020\n',
    },
    {
      name: '6.4 record field access',
      code:
        'program test; type Person = record age: integer end; var p: Person; begin p.age := 30; writeln(p.age); end.',
      purpose: '测试记录字段访问',
      expectedOutput: '30\n',
    },
    {
      name: '6.4 record field assignment',
      code:
        'program test; type Rect = record width, height: integer end; var r: Rect; begin r.width := 100; r.height := 50; writeln(r.width * r.height); end.',
      purpose: '测试记录字段赋值',
      expectedOutput: '5000\n',
    },
    {
      name: '6.4 record as procedure parameter (value)',
      code: 'program test;' +
        ' type Point = record x, y: integer end;' +
        ' var p: Point;' +
        ' procedure printPoint(pt: Point);' +
        ' begin writeln(pt.x); writeln(pt.y);' +
        ' end;' +
        ' begin p.x := 1;' +
        ' p.y := 2; ' +
        'printPoint(p);' +
        ' end.',
      purpose: '测试记录作为过程参数（值传递）',
      expectedOutput: '1\n2\n',
    },
    {
      name: '6.4 record as procedure parameter (var)',
      code:
        'program test; type Point = record x, y: integer end; var p: Point; procedure modifyPoint(var pt: Point); begin pt.x := 99; end; begin p.x := 1; modifyPoint(p); writeln(p.x); end.',
      purpose: '测试记录作为过程参数（var传递）',
      expectedOutput: '99\n',
    },
    {
      name: '6.4 nested record',
      code:
        'program test; type Point = record x, y: integer end; Circle = record center: Point; radius: integer end; var c: Circle; begin c.center.x := 10; c.center.y := 20; c.radius := 5; writeln(c.center.x); writeln(c.radius); end.',
      purpose: '测试嵌套记录',
      expectedOutput: '10\n5\n',
    },
    // WITH Statement
    {
      name: '6.4 WITH single record',
      code:
        'program test; type Point = record x, y: integer end; var p: Point; begin p.x := 0; p.y := 0; with p do begin x := 10; y := 20; end; writeln(p.x, p.y); end.',
      purpose: '测试WITH单记录',
      expectedOutput: '1020\n',
    },
    {
      name: '6.4 WITH multiple records',
      code:
        'program test; type Point = record x, y: integer end; var p1, p2: Point; begin p1.x := 1; p2.x := 2; with p1, p2 do writeln(x); end.',
      purpose: '测试WITH多记录',
      expectedOutput: '2\n',
    },
    {
      name: '6.4 WITH modify fields',
      code:
        'program test; type Person = record age: integer end; var p: Person; begin with p do begin age := 25; end; writeln(p.age); end.',
      purpose: '测试WITH修改字段',
      expectedOutput: '25\n',
    },
    {
      name: '6.4 WITH call procedure',
      code:
        'program test; type Point = record x, y: integer end; var p: Point; procedure setX(val: integer); begin p.x := val; end; begin with p do setX(42); writeln(p.x); end.',
      purpose: '测试WITH中调用过程',
      expectedOutput: '42\n',
    },
    {
      name: '6.4 nested WITH',
      code:
        'program test; type Point = record x, y: integer end; Rect = record topLeft, bottomRight: Point end; var r: Rect; begin with r do with topLeft do x := 10; writeln(r.topLeft.x); end.',
      purpose: '测试嵌套WITH（Pascal82 标准：单个 type 段）',
      expectedOutput: '10\n',
    },
    {
      name: '6.4 WITH variable name conflict',
      code:
        'program test; type Point = record x, y: integer end; var x: integer; p: Point; begin x := 100; p.x := 10; with p do writeln(x); end.',
      purpose: '测试WITH与变量名冲突（Pascal82 标准：单个 var 段）',
      expectedOutput: '10\n',
    },
    // Array and Record Combination
    {
      name: '6.4 array of records',
      code: 'program test; type Point = record x, y: integer end;' +
        ' var arr: array[1..2] of Point;' +
        ' begin arr[1].x := 1;' +
        ' arr[1].y := 2;' +
        ' arr[2].x := 3;' +
        ' arr[2].y := 4; ' +
        'writeln(arr[1].x, arr[2].y);' +
        ' end.',
      purpose: '测试数组元素为记录',
      expectedOutput: '14\n',
    },
    {
      name: '6.4 record field as array',
      code:
        'program test; type Person = record scores: array[1..3] of integer end; var p: Person; begin p.scores[1] := 80; p.scores[2] := 90; p.scores[3] := 75; writeln(p.scores[1]+p.scores[2]+p.scores[3]); end.',
      purpose: '测试记录字段为数组',
      expectedOutput: '245\n',
    },
    {
      name: '6.4 record array assignment',
      code:
        'program test; type Point = record x, y: integer end; var arr: array[1..2] of Point; begin arr[1].x := 1; arr[1].y := 2; arr[2].x := 3; arr[2].y := 4; writeln(arr[1].x); writeln(arr[2].y); end.',
      purpose: '测试记录数组逐个赋值（标准 Pascal 不支持初始化语法）',
      expectedOutput: '1\n4\n',
    },
    {
      name: '6.4 nested array record',
      code:
        'program test; type Point = record x, y: integer end; var arr: array[1..2] of array[1..2] of Point; begin arr[1,1].x := 1; arr[2,2].y := 4; writeln(arr[1,1].x, arr[2,2].y); end.',
      purpose: '测试嵌套数组记录',
      expectedOutput: '14\n',
    },
    {
      name: '6.4 array record as parameter',
      code:
        'program test; type Point = record x, y: integer end; PointArray = array[1..2] of Point; var arr: PointArray; procedure printArray(pa: PointArray); begin writeln(pa[1].x); writeln(pa[2].y); end; begin arr[1].x := 10; arr[2].y := 20; printArray(arr); end.',
      purpose: '测试数组记录作为参数（Pascal82 标准：单个 type 段）',
      expectedOutput: '10\n20\n',
    },
    // packed array of char 字符串赋值（Knuth TeX NAMEOFFILE := POOLNAME 即此模式）
    // 反例：若直接把字符串赋给数组变量，arr[1] 在 JS 中会变成 0-based 字符串索引，
    // 首字符丢失。str.to.char.array syscall 把字符串展开为 1-based 字符数组对象。
    {
      name: '6.4 packed array of char := string literal: 正向 - 首字符不丢失',
      code:
        `program test; var name: packed array[1..10] of char; i: integer; begin name := 'TeXformat'; for i := 1 to 9 do write(name[i]); end.`,
      purpose: 'ISO 7185 6.4.3.3: packed array of char 接受字符串赋值，逐字符访问首字符必须保留',
      expectedContains: 'TeXformat',
    },
    {
      name: '6.4 packed array of char := string literal: 正向 - 首字符单独可读',
      code:
        `program test; var name: packed array[1..10] of char; begin name := 'hello'; write(name[1]); write(name[5]); end.`,
      purpose: '验证 str.to.char.array 后 name[1]="h" name[5]="o"（1-based 索引）',
      expectedContains: 'ho',
    },
    {
      name: '6.4 packed array of char := const string: 正向 - 首字符不丢失',
      code:
        `program test; const POOLNAME = 'TeXformats:TEX.POOL'; var name: packed array[1..20] of char; i: integer; begin name := POOLNAME; for i := 1 to 19 do write(name[i]); end.`,
      purpose: 'Knuth TeX NAMEOFFILE := POOLNAME 模式：const 字符串赋给 packed array of char',
      expectedContains: 'TeXformats:TEX.POOL',
    },
    // Basic Subrange
    {
      name: '6.4 integer subrange basic assignment',
      code: 'program test; type T = 1..10; var a: T; begin a := 5; writeln(a); end.',
      purpose: '整数子界基础赋值和输出',
      expectedOutput: '5\n',
    },
    {
      name: '6.4 integer subrange assign lower bound',
      code: 'program test; type T = 1..10; var a: T; begin a := 1; writeln(a); end.',
      purpose: '赋值下界值',
      expectedOutput: '1\n',
    },
    {
      name: '6.4 integer subrange assign upper bound',
      code: 'program test; type T = 1..10; var a: T; begin a := 10; writeln(a); end.',
      purpose: '赋值上界值',
      expectedOutput: '10\n',
    },
    {
      name: '6.4 subrange with negative bounds',
      code: 'program test; type T = -10..10; var a: T; begin a := -5; writeln(a); a := 5; writeln(a); end.',
      purpose: '负数边界的子界',
      expectedOutput: '-5\n5\n',
    },
    {
      name: '6.4 subrange assign lower negative bound',
      code: 'program test; type T = -10..10; var a: T; begin a := -10; writeln(a); end.',
      purpose: '赋值负数下界',
      expectedOutput: '-10\n',
    },
    {
      name: '6.4 char subrange basic',
      code: "program test; type T = 'A'..'Z'; var c: T; begin c := 'M'; writeln(c); end.",
      purpose: '字符子界基础',
      expectedOutput: 'M\n',
    },
    {
      name: '6.4 boolean subrange',
      code: 'program test; type T = false..true; var b: T; begin b := true; writeln(b); end.',
      purpose: '布尔子界（false..true 等价于 boolean）',
      expectedOutput: 'TRUE\n',
    },
    // Boundary Check on Assignment
    {
      name: '6.4 assign above upper bound should error',
      code: 'program test; type T = 1..10; var a: T; begin a := 11; end.',
      purpose: '赋值超过上界应报错',
      expectedError: '',
    },
    {
      name: '6.4 assign below lower bound should error',
      code: 'program test; type T = 1..10; var a: T; begin a := 0; end.',
      purpose: '赋值低于下界应报错',
      expectedError: '',
    },
    {
      name: '6.4 arithmetic result overflow should error',
      code: 'program test; type T = 1..10; var a: T; begin a := 8; a := a + 5; end.',
      purpose: '运算结果越界应报错（8+5=13 > 10）',
      expectedError: '',
    },
    {
      name: '6.4 arithmetic result underflow should error',
      code: 'program test; type T = 1..10; var a: T; begin a := 3; a := a - 5; end.',
      purpose: '运算结果越界应报错（3-5=-2 < 1）',
      expectedError: '',
    },
    {
      name: '6.4 char assign above upper bound should error',
      code: "program test; type T = 'A'..'Z'; var c: T; begin c := 'a'; end.",
      purpose: '字符赋值超过上界应报错（a > Z）',
      expectedError: '',
    },
    {
      name: '6.4 char assign below lower bound should error',
      code: "program test; type T = 'A'..'Z'; var c: T; begin c := '0'; end.",
      purpose: '字符赋值低于下界应报错（0 < A）',
      expectedError: '',
    },
    {
      name: '6.4 in-range arithmetic should succeed',
      code: 'program test; type T = 1..10; var a: T; begin a := 3; a := a + 5; writeln(a); end.',
      purpose: '范围内运算应成功（3+5=8）',
      expectedOutput: '8\n',
    },
    // Boundary Expressions
    {
      name: '6.4 const identifier as bound',
      code: 'program test; const n = 10; type T = 1..n; var a: T; begin a := 10; writeln(a); end.',
      purpose: 'const 标识符作为子界边界',
      expectedOutput: '10\n',
    },
    {
      name: '6.4 const expression as bound',
      code: 'program test; const n = 5; type T = 1..n*2; var a: T; begin a := 10; writeln(a); end.',
      purpose: '常量表达式作为子界边界（n*2=10）',
      expectedOutput: '10\n',
    },
    {
      name: '6.4 literal expression as bound',
      code: 'program test; type T = 1+2..5*2; var a: T; begin a := 10; writeln(a); end.',
      purpose: '字面量常量表达式作为边界（3..10）',
      expectedOutput: '10\n',
    },
    {
      name: '6.4 const upper bound overflow should error',
      code: 'program test; const n = 10; type T = 1..n; var a: T; begin a := 11; end.',
      purpose: 'const 边界的子界越界应报错',
      expectedError: '',
    },
    {
      name: '6.4 two const identifiers as both bounds',
      code: 'program test; const lo = 5; hi = 15; type T = lo..hi; var a: T; begin a := 10; writeln(a); end.',
      purpose: '两个 const 标识符作为上下界',
      expectedOutput: '10\n',
    },
    // Scope Isolation
    {
      name: '6.4 local const with same name does not affect global subrange type',
      code: `program test;
const
  c = 10;
type
  T = 1..c;
var
  a: T;
procedure p;
const
  c = 5;
var
  b: T;
begin
  b := 8;
  writeln(b);
end;
begin
  a := 8;
  writeln(a);
  p;
end.`,
      purpose: '函数内定义同名局部 const c 不影响全局类型 T=1..10（b:=8 应成功）',
      expectedOutput: '8\n8\n',
    },
    {
      name: '6.4 global subrange type unchanged after local const redefinition',
      code: `program test;
const
  c = 10;
type
  T = 1..c;
var
  a: T;
procedure p;
const
  c = 5;
var
  b: T;
begin
  b := 9;
  writeln(b);
end;
begin
  a := 9;
  writeln(a);
  p;
end.`,
      purpose: '局部 const c=5 不改变全局 T=1..10（b:=9 仍在 1..10 内）',
      expectedOutput: '9\n9\n',
    },
    {
      name: '6.4 local const as subrange bound in function',
      code: `program test;
procedure p;
const
  n = 5;
type
  T = 1..n;
var
  a: T;
begin
  a := 3;
  writeln(a);
end;
begin
  p;
end.`,
      purpose: '函数内部用局部 const 作为子界边界（Pascal82 允许局部 const/type 声明）',
      expectedOutput: '3\n',
    },
    {
      name: '6.4 local const bound overflow should error',
      code: `program test;
procedure p;
const
  n = 5;
type
  T = 1..n;
var
  a: T;
begin
  a := 6;
end;
begin
  p;
end.`,
      purpose: '局部 const 作为边界时越界应报错（6 > 5）',
      expectedError: '',
    },
    // Type Compatibility
    {
      name: '6.4 subrange assign to integer should succeed',
      code: 'program test; type T = 1..10; var a: T; i: integer; begin a := 5; i := a; writeln(i); end.',
      purpose: 'subrange 赋值给 integer 应成功（拓宽）',
      expectedOutput: '5\n',
    },
    {
      name: '6.4 integer assign to subrange in range should succeed',
      code: 'program test; type T = 1..10; var a: T; i: integer; begin i := 5; a := i; writeln(a); end.',
      purpose: 'integer 赋值给 subrange（范围内）应成功',
      expectedOutput: '5\n',
    },
    {
      name: '6.4 integer assign to subrange out of range should error',
      code: 'program test; type T = 1..10; var a: T; i: integer; begin i := 100; a := i; end.',
      purpose: 'integer 赋值给 subrange（范围外）应报错',
      expectedError: '',
    },
    {
      name: '6.4 different subranges assignment in range',
      code: 'program test; type T1 = 1..10; T2 = 1..5; var a: T1; b: T2; begin a := 8; b := a; end.',
      purpose: '不同子界赋值（T1=1..10 → T2=1..5，值 8 超出 T2）应报错',
      expectedError: '',
    },
    {
      name: '6.4 different subranges assignment in target range',
      code: 'program test; type T1 = 1..10; T2 = 1..5; var a: T1; b: T2; begin a := 3; b := a; writeln(b); end.',
      purpose: '不同子界赋值（T1=1..10 → T2=1..5，值 3 在 T2 内）应成功',
      expectedOutput: '3\n',
    },
    {
      name: '6.4 subrange to subrange same range assignment',
      code: 'program test; type T = 1..10; var a, b: T; begin a := 5; b := a; writeln(b); end.',
      purpose: '相同子界赋值应成功',
      expectedOutput: '5\n',
    },
    // Subrange as Array Index
    {
      name: '6.4 subrange as array index type',
      code:
        'program test; type Index = 1..5; var a: array[Index] of integer; begin a[1] := 10; a[5] := 50; writeln(a[1]); writeln(a[5]); end.',
      purpose: '子界作为数组下标类型',
      expectedOutput: '10\n50\n',
    },
    {
      name: '6.4 array access with subrange index in range',
      code:
        'program test; type Index = 1..5; var a: array[Index] of integer; i: Index; begin i := 3; a[i] := 30; writeln(a[i]); end.',
      purpose: '用 subrange 变量作为数组下标',
      expectedOutput: '30\n',
    },
    // Subrange in FOR Loop
    {
      name: '6.4 subrange as for loop variable',
      code:
        'program test; type T = 1..5; var i: T; s: integer; begin s := 0; for i := 1 to 5 do s := s + i; writeln(s); end.',
      purpose: 'subrange 作为 for 循环变量',
      expectedOutput: '15\n',
    },
    {
      name: '6.4 subrange for loop to upper bound',
      code: 'program test; type T = 1..3; var i: T; begin for i := 1 to 3 do writeln(i); end.',
      purpose: 'for 循环到上界',
      expectedOutput: '1\n2\n3\n',
    },
    {
      name: '6.4 subrange for loop downto lower bound',
      code: 'program test; type T = 1..3; var i: T; begin for i := 3 downto 1 do writeln(i); end.',
      purpose: 'for 循环 downto 到下界',
      expectedOutput: '3\n2\n1\n',
    },
    // Subrange Operations
    {
      name: '6.4 subrange arithmetic in range',
      code:
        'program test; type T = 1..20; var a, b: T; begin a := 5; b := 10; writeln(a + b); writeln(b - a); writeln(a * 2); end.',
      purpose: '子界算术运算（结果在范围内）',
      expectedOutput: '15\n5\n10\n',
    },
    {
      name: '6.4 subrange comparison',
      code:
        "program test; type T = 1..10; var a, b: T; begin a := 3; b := 7; if a < b then writeln('less'); if b > a then writeln('greater'); if a <> b then writeln('different'); end.",
      purpose: '子界比较运算',
      expectedOutput: 'less\ngreater\ndifferent\n',
    },
    {
      name: '6.4 subrange equality',
      code: "program test; type T = 1..10; var a, b: T; begin a := 5; b := 5; if a = b then writeln('equal'); end.",
      purpose: '子界相等比较',
      expectedOutput: 'equal\n',
    },
    {
      name: '6.4 subrange div and mod',
      code:
        'program test; type T = 1..100; var a, b: T; begin a := 17; b := 5; writeln(a div b); writeln(a mod b); end.',
      purpose: '子界 div 和 mod 运算',
      expectedOutput: '3\n2\n',
    },
    // Subrange Parameter Passing
    {
      name: '6.4 subrange as value parameter',
      code: `program test;
type T = 1..10;
procedure p(x: T);
begin
  writeln(x);
end;
begin
  p(5);
end.`,
      purpose: 'subrange 作为值参数',
      expectedOutput: '5\n',
    },
    {
      name: '6.4 subrange as var parameter',
      code: `program test;
type T = 1..10;
var
  a: T;
procedure p(var x: T);
begin
  x := 7;
end;
begin
  p(a);
  writeln(a);
end.`,
      purpose: 'subrange 作为 var 参数',
      expectedOutput: '7\n',
    },
    {
      name: '6.4 subrange function return type',
      code: `program test;
type T = 1..10;
var
  a: T;
function f: T;
begin
  f := 5;
end;
begin
  a := f;
  writeln(a);
end.`,
      purpose: 'subrange 作为函数返回类型',
      expectedOutput: '5\n',
    },
    // Subrange Boundary Order (Pascal82 Compliance)
    {
      name: '6.4 lower bound greater than upper bound should error',
      code: 'program test; type T = 10..1; var a: T; begin a := 5; end.',
      purpose: '下界 > 上界应报错（Pascal82 §6.4.3.2 要求 low <= high）',
      expectedError: '',
    },
    {
      name: '6.4 equal bounds single value subrange',
      code: 'program test; type T = 5..5; var a: T; begin a := 5; writeln(a); end.',
      purpose: '上下界相等（单值子界）应成功',
      expectedOutput: '5\n',
    },
    {
      name: '6.4 single value subrange overflow should error',
      code: 'program test; type T = 5..5; var a: T; begin a := 6; end.',
      purpose: '单值子界赋其他值应报错',
      expectedError: '',
    },
    // Subrange Edge Cases
    {
      name: '6.4 subrange default value is lower bound',
      code: 'program test; type T = 3..10; var a: T; begin writeln(a); end.',
      purpose: 'subrange 变量默认值是下界',
      expectedOutput: '3\n',
    },
    {
      name: '6.4 subrange in record field',
      code: `program test;
type
  Age = 0..120;
  Person = record
    age: Age;
  end;
var
  p: Person;
begin
  p.age := 25;
  writeln(p.age);
end.`,
      purpose: 'subrange 作为记录字段类型',
      expectedOutput: '25\n',
    },
    {
      name: '6.4 subrange record field overflow should error',
      code: `program test;
type
  Age = 0..120;
  Person = record
    age: Age;
  end;
var
  p: Person;
begin
  p.age := 200;
end.`,
      purpose: '记录中的 subrange 字段越界应报错',
      expectedError: '',
    },
    {
      name: '6.4 nested subrange type alias',
      code: 'program test; type T1 = 1..10; T2 = T1; var a: T2; begin a := 5; writeln(a); end.',
      purpose: 'subrange 类型别名',
      expectedOutput: '5\n',
    },
    {
      name: '6.4 subrange with byte range 0..255',
      code: 'program test; type T = 0..255; var a: T; begin a := 200; writeln(a); end.',
      purpose: '0..255 子界（BYTE 范围）',
      expectedOutput: '200\n',
    },
    // 变体 record 的运行时语义。
    //
    // 只断言 ISO 7185 可保证的部分（字段读写、下标换算、整体赋值、记录文件）。
    // 分支之间的内存重叠方式、字节序，以及「写一个分支再从另一个分支读」属于
    // 实现定义 / 错误用法，不在此文件断言；TeX 依赖的那类行为需要单独的扩展行为
    // 测试目录来覆盖。
    {
      name: '6.4 变体 record 的 int 分支读写',
      code: `program test;
type
  four_choices = 1..4;
  memory_word = record
    case four_choices of
      1: (int_field: integer);
      2: (gr: real);
      3: (mark: integer);
      4: (tag: integer)
  end;
var m: memory_word;
begin
  m.int_field := 42;
  writeln(m.int_field);
end.`,
      purpose: '无名变体 record 的 int 分支写入后应立即读到同一值',
      expectedContains: '42',
    },
    {
      name: '6.4 过程内用变量下标写、外部用常量下标读',
      code: `program test;
type
  halfword = 0..65535;
  four_choices = 1..4;
  memory_word = record
    case four_choices of
      1: (int_field: integer);
      2: (gr: real);
      3: (mark: integer);
      4: (tag: integer)
  end;
var eqtb: array[1..10] of memory_word;
procedure word_define(p: halfword; w: integer);
begin
  eqtb[p].int_field := w
end;
begin
  word_define(5, 4);
  writeln(eqtb[5].int_field);
end.`,
      purpose: '「变量下标写 + 常量下标读」两条路径必须落在同一槽位',
      expectedContains: '4',
    },
    {
      name: '6.4 常量下标写、变量下标读',
      code: `program test;
type
  halfword = 0..65535;
  four_choices = 1..4;
  memory_word = record
    case four_choices of
      1: (int_field: integer);
      2: (gr: real);
      3: (mark: integer);
      4: (tag: integer)
  end;
var eqtb: array[1..10] of memory_word;
    k: halfword;
begin
  eqtb[7].int_field := 1234;
  k := 7;
  writeln(eqtb[k].int_field);
end.`,
      purpose: '反方向：「常量下标写 + 变量下标读」',
      expectedContains: '1234',
    },
    {
      name: '6.4 变体 record 数组元素整体赋值',
      code: `program test;
type
  four_choices = 1..4;
  memory_word = record
    case four_choices of
      1: (int_field: integer);
      2: (gr: real);
      3: (mark: integer);
      4: (tag: integer)
  end;
var eqtb: array[1..10] of memory_word;
begin
  eqtb[3].int_field := 555;
  eqtb[8] := eqtb[3];
  writeln(eqtb[8].int_field);
end.`,
      purpose: '变体 record 的整体（字节级）拷贝应保留字段值',
      expectedContains: '555',
    },
    {
      name: '6.4 file of 变体 record 的 dump/load',
      code: `program test(f);
type
  four_choices = 1..4;
  memory_word = record
    case four_choices of
      1: (int_field: integer);
      2: (gr: real);
      3: (mark: integer);
      4: (tag: integer)
  end;
var f: file of memory_word;
    m: memory_word;
begin
  rewrite(f);
  m.int_field := 42;
  f^ := m;
  put(f);
  reset(f);
  m := f^;
  writeln(m.int_field);
end.`,
      purpose: '记录文件按整条 record 写入/读出，变体字段值应保留',
      expectedContains: '42',
    },
    // ==========================================================================
    // ARRAY[CHAR] — 索引范围应为 0..255（Pascal82 §6.4.3.1）
    // ==========================================================================

    {
      name: '6.4 ARRAY[CHAR] 索引范围 0..255',
      code:
        `PROGRAM TANGLE;TYPE ASCIICODE=0..127;VAR XORD:ARRAY[CHAR]OF ASCIICODE;CH:CHAR;BEGIN XORD[CHR(65)]:=1;XORD[CHR(90)]:=2;WRITELN(XORD[CHR(65)],',',XORD[CHR(90)]);END.`,
      purpose: 'ARRAY[CHAR] 类型索引应覆盖完整 CHAR 范围（0..255），TANGLE 用 XORD[CHR(I)]',
      expectedContains: '1,2',
    },

    {
      name: '6.4 ARRAY[CHAR] 访问极端值',
      code:
        `PROGRAM TANGLE;VAR A:ARRAY[CHAR]OF INTEGER;BEGIN A[CHR(0)]:=100;A[CHR(255)]:=200;WRITELN(A[CHR(0)],',',A[CHR(255)]);END.`,
      purpose: 'ARRAY[CHAR] 应能访问 CHR(0) 和 CHR(255)，覆盖完整 ASCII 范围',
      expectedContains: '100,200',
    },

    // ==========================================================================
    // ARRAY[BOOLEAN] — 索引范围应为 0..1（Pascal82 §6.4.3.1）
    // ==========================================================================

    {
      name: '6.4 ARRAY[BOOLEAN] 索引范围 0..1',
      code:
        `PROGRAM TANGLE;VAR FLAG:ARRAY[BOOLEAN]OF INTEGER;BEGIN FLAG[FALSE]:=0;FLAG[TRUE]:=1;WRITELN(FLAG[FALSE],',',FLAG[TRUE]);END.`,
      purpose: 'ARRAY[BOOLEAN] 类型索引应覆盖 FALSE(0) 和 TRUE(1)',
      expectedContains: '0,1',
    },

    // ==========================================================================
    // ARRAY[ENUM] — 索引范围应为 0..n-1（Pascal82 §6.4.3.1）
    // ==========================================================================

    {
      name: '6.4 ARRAY[ENUM] 索引范围 0..values.length-1',
      code:
        `PROGRAM TANGLE;TYPE COLOR=(RED,GREEN,BLUE);VAR PALETTE:ARRAY[COLOR]OF INTEGER;BEGIN PALETTE[RED]:=1;PALETTE[GREEN]:=2;PALETTE[BLUE]:=3;WRITELN(PALETTE[RED],',',PALETTE[GREEN],',',PALETTE[BLUE]);END.`,
      purpose: 'ARRAY[ENUM] 类型索引应覆盖枚举的完整范围',
      expectedContains: '1,2,3',
    },

    // ==========================================================================
    // TANGLE 风格：ARRAY[CHAR] 初始化循环
    // ==========================================================================

    {
      name: '6.4 TANGLE 风格 CHAR 数组初始化',
      code:
        `PROGRAM TANGLE;VAR XORD:ARRAY[CHAR]OF INTEGER;I:INTEGER;BEGIN FOR I:=0 TO 127 DO XORD[CHR(I)]:=I+1;WRITELN(XORD[CHR(65)]);END.`,
      purpose: 'TANGLE 初始化 CHAR 数组的模式：FOR 循环遍历 CHR(I)',
      expectedContains: '66',
    },
  ]

  runPascalTests(tests)
})
