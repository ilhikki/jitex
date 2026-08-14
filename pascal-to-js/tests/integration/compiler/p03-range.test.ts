import { describe } from './_helper.ts'
import { type PascalTest, runPascalTests } from './_helper'

/**
 * Q10: Subrange (range) 类型专项测试
 *
 * 测试重点：
 * 1. 边界检查（赋值、运算、参数传递）
 * 2. 边界表达式（const 标识符、常量表达式、字面量）
 * 3. 作用域隔离（类型声明后不受后续同名标识符影响）
 * 4. 类型兼容性（subrange↔integer、subrange↔subrange）
 * 5. 作为数组下标、FOR 循环变量
 * 6. Pascal82 规范遵循（边界顺序、块结构）
 */
describe('Phase 3: Range', () => {
  const tests: PascalTest[] = [
    // Basic Subrange
    {
      name: 'integer subrange basic assignment',
      code: 'program test; type T = 1..10; var a: T; begin a := 5; writeln(a); end.',
      purpose: '整数子界基础赋值和输出',
      expectedOutput: '5\n',
    },
    {
      name: 'integer subrange assign lower bound',
      code: 'program test; type T = 1..10; var a: T; begin a := 1; writeln(a); end.',
      purpose: '赋值下界值',
      expectedOutput: '1\n',
    },
    {
      name: 'integer subrange assign upper bound',
      code: 'program test; type T = 1..10; var a: T; begin a := 10; writeln(a); end.',
      purpose: '赋值上界值',
      expectedOutput: '10\n',
    },
    {
      name: 'subrange with negative bounds',
      code: 'program test; type T = -10..10; var a: T; begin a := -5; writeln(a); a := 5; writeln(a); end.',
      purpose: '负数边界的子界',
      expectedOutput: '-5\n5\n',
    },
    {
      name: 'subrange assign lower negative bound',
      code: 'program test; type T = -10..10; var a: T; begin a := -10; writeln(a); end.',
      purpose: '赋值负数下界',
      expectedOutput: '-10\n',
    },
    {
      name: 'char subrange basic',
      code: "program test; type T = 'A'..'Z'; var c: T; begin c := 'M'; writeln(c); end.",
      purpose: '字符子界基础',
      expectedOutput: 'M\n',
    },
    {
      name: 'boolean subrange',
      code: 'program test; type T = false..true; var b: T; begin b := true; writeln(b); end.',
      purpose: '布尔子界（false..true 等价于 boolean）',
      expectedOutput: 'TRUE\n',
    },
    // Boundary Check on Assignment
    {
      name: 'assign above upper bound should error',
      code: 'program test; type T = 1..10; var a: T; begin a := 11; end.',
      purpose: '赋值超过上界应报错',
      expectedError: '',
    },
    {
      name: 'assign below lower bound should error',
      code: 'program test; type T = 1..10; var a: T; begin a := 0; end.',
      purpose: '赋值低于下界应报错',
      expectedError: '',
    },
    {
      name: 'arithmetic result overflow should error',
      code: 'program test; type T = 1..10; var a: T; begin a := 8; a := a + 5; end.',
      purpose: '运算结果越界应报错（8+5=13 > 10）',
      expectedError: '',
    },
    {
      name: 'arithmetic result underflow should error',
      code: 'program test; type T = 1..10; var a: T; begin a := 3; a := a - 5; end.',
      purpose: '运算结果越界应报错（3-5=-2 < 1）',
      expectedError: '',
    },
    {
      name: 'char assign above upper bound should error',
      code: "program test; type T = 'A'..'Z'; var c: T; begin c := 'a'; end.",
      purpose: '字符赋值超过上界应报错（a > Z）',
      expectedError: '',
    },
    {
      name: 'char assign below lower bound should error',
      code: "program test; type T = 'A'..'Z'; var c: T; begin c := '0'; end.",
      purpose: '字符赋值低于下界应报错（0 < A）',
      expectedError: '',
    },
    {
      name: 'in-range arithmetic should succeed',
      code: 'program test; type T = 1..10; var a: T; begin a := 3; a := a + 5; writeln(a); end.',
      purpose: '范围内运算应成功（3+5=8）',
      expectedOutput: '8\n',
    },
    // Boundary Expressions
    {
      name: 'const identifier as bound',
      code: 'program test; const n = 10; type T = 1..n; var a: T; begin a := 10; writeln(a); end.',
      purpose: 'const 标识符作为子界边界',
      expectedOutput: '10\n',
    },
    {
      name: 'const expression as bound',
      code: 'program test; const n = 5; type T = 1..n*2; var a: T; begin a := 10; writeln(a); end.',
      purpose: '常量表达式作为子界边界（n*2=10）',
      expectedOutput: '10\n',
    },
    {
      name: 'literal expression as bound',
      code: 'program test; type T = 1+2..5*2; var a: T; begin a := 10; writeln(a); end.',
      purpose: '字面量常量表达式作为边界（3..10）',
      expectedOutput: '10\n',
    },
    {
      name: 'const upper bound overflow should error',
      code: 'program test; const n = 10; type T = 1..n; var a: T; begin a := 11; end.',
      purpose: 'const 边界的子界越界应报错',
      expectedError: '',
    },
    {
      name: 'two const identifiers as both bounds',
      code: 'program test; const lo = 5; hi = 15; type T = lo..hi; var a: T; begin a := 10; writeln(a); end.',
      purpose: '两个 const 标识符作为上下界',
      expectedOutput: '10\n',
    },
    // Scope Isolation
    {
      name: 'local const with same name does not affect global subrange type',
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
      name: 'global subrange type unchanged after local const redefinition',
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
      name: 'local const as subrange bound in function',
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
      name: 'local const bound overflow should error',
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
      name: 'subrange assign to integer should succeed',
      code: 'program test; type T = 1..10; var a: T; i: integer; begin a := 5; i := a; writeln(i); end.',
      purpose: 'subrange 赋值给 integer 应成功（拓宽）',
      expectedOutput: '5\n',
    },
    {
      name: 'integer assign to subrange in range should succeed',
      code: 'program test; type T = 1..10; var a: T; i: integer; begin i := 5; a := i; writeln(a); end.',
      purpose: 'integer 赋值给 subrange（范围内）应成功',
      expectedOutput: '5\n',
    },
    {
      name: 'integer assign to subrange out of range should error',
      code: 'program test; type T = 1..10; var a: T; i: integer; begin i := 100; a := i; end.',
      purpose: 'integer 赋值给 subrange（范围外）应报错',
      expectedError: '',
    },
    {
      name: 'different subranges assignment in range',
      code: 'program test; type T1 = 1..10; T2 = 1..5; var a: T1; b: T2; begin a := 8; b := a; end.',
      purpose: '不同子界赋值（T1=1..10 → T2=1..5，值 8 超出 T2）应报错',
      expectedError: '',
    },
    {
      name: 'different subranges assignment in target range',
      code: 'program test; type T1 = 1..10; T2 = 1..5; var a: T1; b: T2; begin a := 3; b := a; writeln(b); end.',
      purpose: '不同子界赋值（T1=1..10 → T2=1..5，值 3 在 T2 内）应成功',
      expectedOutput: '3\n',
    },
    {
      name: 'subrange to subrange same range assignment',
      code: 'program test; type T = 1..10; var a, b: T; begin a := 5; b := a; writeln(b); end.',
      purpose: '相同子界赋值应成功',
      expectedOutput: '5\n',
    },
    // Subrange as Array Index
    {
      name: 'subrange as array index type',
      code:
        'program test; type Index = 1..5; var a: array[Index] of integer; begin a[1] := 10; a[5] := 50; writeln(a[1]); writeln(a[5]); end.',
      purpose: '子界作为数组下标类型',
      expectedOutput: '10\n50\n',
    },
    {
      name: 'array access with subrange index in range',
      code:
        'program test; type Index = 1..5; var a: array[Index] of integer; i: Index; begin i := 3; a[i] := 30; writeln(a[i]); end.',
      purpose: '用 subrange 变量作为数组下标',
      expectedOutput: '30\n',
    },
    // Subrange in FOR Loop
    {
      name: 'subrange as for loop variable',
      code:
        'program test; type T = 1..5; var i: T; s: integer; begin s := 0; for i := 1 to 5 do s := s + i; writeln(s); end.',
      purpose: 'subrange 作为 for 循环变量',
      expectedOutput: '15\n',
    },
    {
      name: 'subrange for loop to upper bound',
      code: 'program test; type T = 1..3; var i: T; begin for i := 1 to 3 do writeln(i); end.',
      purpose: 'for 循环到上界',
      expectedOutput: '1\n2\n3\n',
    },
    {
      name: 'subrange for loop downto lower bound',
      code: 'program test; type T = 1..3; var i: T; begin for i := 3 downto 1 do writeln(i); end.',
      purpose: 'for 循环 downto 到下界',
      expectedOutput: '3\n2\n1\n',
    },
    // Subrange Operations
    {
      name: 'subrange arithmetic in range',
      code:
        'program test; type T = 1..20; var a, b: T; begin a := 5; b := 10; writeln(a + b); writeln(b - a); writeln(a * 2); end.',
      purpose: '子界算术运算（结果在范围内）',
      expectedOutput: '15\n5\n10\n',
    },
    {
      name: 'subrange comparison',
      code:
        "program test; type T = 1..10; var a, b: T; begin a := 3; b := 7; if a < b then writeln('less'); if b > a then writeln('greater'); if a <> b then writeln('different'); end.",
      purpose: '子界比较运算',
      expectedOutput: 'less\ngreater\ndifferent\n',
    },
    {
      name: 'subrange equality',
      code: "program test; type T = 1..10; var a, b: T; begin a := 5; b := 5; if a = b then writeln('equal'); end.",
      purpose: '子界相等比较',
      expectedOutput: 'equal\n',
    },
    {
      name: 'subrange div and mod',
      code:
        'program test; type T = 1..100; var a, b: T; begin a := 17; b := 5; writeln(a div b); writeln(a mod b); end.',
      purpose: '子界 div 和 mod 运算',
      expectedOutput: '3\n2\n',
    },
    // Subrange Parameter Passing
    {
      name: 'subrange as value parameter',
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
      name: 'subrange as var parameter',
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
      name: 'subrange function return type',
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
      name: 'lower bound greater than upper bound should error',
      code: 'program test; type T = 10..1; var a: T; begin a := 5; end.',
      purpose: '下界 > 上界应报错（Pascal82 §6.4.3.2 要求 low <= high）',
      expectedError: '',
    },
    {
      name: 'equal bounds single value subrange',
      code: 'program test; type T = 5..5; var a: T; begin a := 5; writeln(a); end.',
      purpose: '上下界相等（单值子界）应成功',
      expectedOutput: '5\n',
    },
    {
      name: 'single value subrange overflow should error',
      code: 'program test; type T = 5..5; var a: T; begin a := 6; end.',
      purpose: '单值子界赋其他值应报错',
      expectedError: '',
    },
    // Subrange Edge Cases
    {
      name: 'subrange default value is lower bound',
      code: 'program test; type T = 3..10; var a: T; begin writeln(a); end.',
      purpose: 'subrange 变量默认值是下界',
      expectedOutput: '3\n',
    },
    {
      name: 'subrange in record field',
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
      name: 'subrange record field overflow should error',
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
      name: 'nested subrange type alias',
      code: 'program test; type T1 = 1..10; T2 = T1; var a: T2; begin a := 5; writeln(a); end.',
      purpose: 'subrange 类型别名',
      expectedOutput: '5\n',
    },
    {
      name: 'subrange with byte range 0..255',
      code: 'program test; type T = 0..255; var a: T; begin a := 200; writeln(a); end.',
      purpose: '0..255 子界（BYTE 范围）',
      expectedOutput: '200\n',
    },
  ]

  runPascalTests(tests)
})
