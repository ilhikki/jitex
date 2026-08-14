import { describe } from './_helper.ts'
import { type PascalTest, runPascalTests } from './_helper'

describe('Phase 1: Basics and Operations', () => {
  const tests: PascalTest[] = [
    {
      name: 'addition',
      code: 'program test; var x, y: integer; begin x := 5; y := 3; writeln(x + y); end.',
      purpose: '测试加法运算',
      expectedOutput: '8\n',
    },
    {
      name: 'subtraction',
      code: 'program test; var x, y: integer; begin x := 10; y := 4; writeln(x - y); end.',
      purpose: '测试减法运算',
      expectedOutput: '6\n',
    },
    {
      name: 'multiplication',
      code: 'program test; var x, y: integer; begin x := 6; y := 7; writeln(x * y); end.',
      purpose: '测试乘法运算',
      expectedOutput: '42\n',
    },
    {
      name: 'division',
      code: 'program test; var x, y: integer; begin x := 15; y := 3; writeln(x / y); end.',
      purpose: '测试除法运算（Pascal82: / 为实数除法，结果为 real）',
      expectedOutput: '5.00000000000000E+000\n',
    },
    {
      name: 'integer division (DIV)',
      code: 'program test; var x, y: integer; begin x := 17; y := 5; writeln(x div y); end.',
      purpose: '测试整数除法DIV',
      expectedOutput: '3\n',
    },
    {
      name: 'modulus (MOD)',
      code: 'program test; var x, y: integer; begin x := 17; y := 5; writeln(x mod y); end.',
      purpose: '测试取模运算MOD',
      expectedOutput: '2\n',
    },
    {
      name: 'unary minus',
      code: 'program test; var x: integer; begin x := 10; writeln(-x); writeln(-(-x)); end.',
      purpose: '测试负号运算',
      expectedOutput: '-10\n10\n',
    },
    {
      name: 'mixed arithmetic',
      code: 'program test; var a, b, c: integer; begin a := 2; b := 3; c := 4; writeln(a + b * c); end.',
      purpose: '测试混合算术运算',
      expectedOutput: '14\n',
    },
    {
      name: 'operator precedence',
      code: 'program test; var x, y, z: integer; begin x := 2; y := 3; z := 4; writeln(x + y * z - 1); end.',
      purpose: '测试运算符优先级',
      expectedOutput: '13\n',
    },
    {
      name: 'parentheses change precedence',
      code: 'program test; var x, y, z: integer; begin x := 2; y := 3; z := 4; writeln((x + y) * z); end.',
      purpose: '测试括号改变优先级',
      expectedOutput: '20\n',
    },
    {
      name: 'equality (equals)',
      code:
        "program test; var x, y: integer; begin x := 5; y := 5; if x = y then writeln('equal') else writeln('not equal'); end.",
      purpose: '测试等于运算',
      expectedOutput: 'equal\n',
    },
    {
      name: 'inequality (not equals)',
      code:
        "program test; var x, y: integer; begin x := 5; y := 3; if x <> y then writeln('not equal') else writeln('equal'); end.",
      purpose: '测试不等于运算',
      expectedOutput: 'not equal\n',
    },
    {
      name: 'less than',
      code:
        "program test; var x, y: integer; begin x := 3; y := 5; if x < y then writeln('less') else writeln('not less'); end.",
      purpose: '测试小于运算',
      expectedOutput: 'less\n',
    },
    {
      name: 'greater than',
      code:
        "program test; var x, y: integer; begin x := 5; y := 3; if x > y then writeln('greater') else writeln('not greater'); end.",
      purpose: '测试大于运算',
      expectedOutput: 'greater\n',
    },
    {
      name: 'less than or equal',
      code:
        "program test; var x, y, z: integer; begin x := 3; y := 5; z := 3; if x <= y then writeln('ok1'); if x <= z then writeln('ok2'); end.",
      purpose: '测试小于等于运算',
      expectedOutput: 'ok1\nok2\n',
    },
    {
      name: 'greater than or equal',
      code:
        "program test; var x, y, z: integer; begin x := 5; y := 3; z := 5; if x >= y then writeln('ok1'); if x >= z then writeln('ok2'); end.",
      purpose: '测试大于等于运算',
      expectedOutput: 'ok1\nok2\n',
    },
    {
      name: 'mixed relational operations',
      code: "program test; var x: integer; begin x := 10; if (x > 5) and (x < 15) then writeln('in range'); end.",
      purpose: '测试混合关系运算',
      expectedOutput: 'in range\n',
    },
    {
      name: 'NOT operation',
      code:
        "program test; var b: boolean; begin b := true; if not b then writeln('false') else writeln('true'); b := false; if not b then writeln('true') else writeln('false'); end.",
      purpose: '测试NOT逻辑运算',
      expectedOutput: 'true\ntrue\n',
    },
    {
      name: 'AND operation',
      code:
        "program test; var a, b: boolean; begin a := true; b := true; if a and b then writeln('true') else writeln('false'); b := false; if a and b then writeln('true') else writeln('false'); end.",
      purpose: '测试AND逻辑运算',
      expectedOutput: 'true\nfalse\n',
    },
    {
      name: 'OR operation',
      code:
        "program test; var a, b: boolean; begin a := false; b := false; if a or b then writeln('true') else writeln('false'); b := true; if a or b then writeln('true') else writeln('false'); end.",
      purpose: '测试OR逻辑运算',
      expectedOutput: 'false\ntrue\n',
    },
    {
      name: 'mixed logical operations',
      code:
        "program test; var a, b, c: boolean; begin a := true; b := false; c := true; if (a and not b) or (not a and c) then writeln('true') else writeln('false'); end.",
      purpose: '测试混合逻辑运算',
      expectedOutput: 'true\n',
    },
    {
      name: 'logical short circuit AND',
      code:
        "program test; var x: integer; begin x := 0; if (x > 0) and (10 div x > 0) then writeln('true') else writeln('false'); end.",
      purpose: '测试AND逻辑短路（第一个条件为false时不应执行第二个条件）',
      expectedOutput: 'false\n',
    },
    {
      name: 'logical short circuit OR',
      code:
        "program test; var x: integer; begin x := 5; if (x > 0) or (10 div 0 > 0) then writeln('true') else writeln('false'); end.",
      purpose: '测试OR逻辑短路（第一个条件为true时不应执行第二个条件）',
      expectedOutput: 'true\n',
    },
    {
      name: 'NOT operator precedence',
      code:
        "program test; var a, b: boolean; begin a := true; b := false; if not a and b then writeln('true') else writeln('false'); if not (a and b) then writeln('true') else writeln('false'); end.",
      purpose: '测试NOT运算符优先级',
      expectedOutput: 'false\ntrue\n',
    },
    {
      name: 'set union',
      code:
        "program test; type T = set of 1..10; var a, b, c: T; begin a := [1, 2, 3]; b := [3, 4, 5]; c := a + b; if 1 in c then writeln('1'); if 5 in c then writeln('5'); end.",
      purpose: '测试集合并运算',
      expectedOutput: '1\n5\n',
    },
    {
      name: 'set intersection',
      code:
        "program test; type T = set of 1..10; var a, b, c: T; begin a := [1, 2, 3, 4]; b := [3, 4, 5, 6]; c := a * b; if 3 in c then writeln('3'); if 4 in c then writeln('4'); if 1 in c then writeln('1') else writeln('no 1'); end.",
      purpose: '测试集合交运算',
      expectedOutput: '3\n4\nno 1\n',
    },
    {
      name: 'set difference',
      code:
        "program test; type T = set of 1..10; var a, b, c: T; begin a := [1, 2, 3, 4]; b := [3, 4, 5]; c := a - b; if 1 in c then writeln('1'); if 3 in c then writeln('3') else writeln('no 3'); end.",
      purpose: '测试集合差运算',
      expectedOutput: '1\nno 3\n',
    },
    {
      name: 'IN operation',
      code:
        "program test; type T = set of char; var s: T; begin s := ['A', 'B', 'C']; if 'B' in s then writeln('yes'); if 'X' in s then writeln('no') else writeln('not found'); end.",
      purpose: '测试IN集合成员运算',
      expectedOutput: 'yes\nnot found\n',
    },
    {
      name: 'set assignment',
      code:
        "program test; type T = set of 1..5; var s1, s2: T; begin s1 := [1, 2]; s2 := s1; s1 := s1 + [3]; if 3 in s1 then writeln('s1 has 3'); if 3 in s2 then writeln('s2 has 3') else writeln('s2 no 3'); end.",
      purpose: '测试集合赋值',
      expectedOutput: 's1 has 3\ns2 no 3\n',
    },
    {
      name: 'integer to char',
      code: 'program test; var i: integer; c: char; begin i := 65; c := chr(i); writeln(c); end.',
      purpose: '测试integer转换为char',
      expectedOutput: 'A\n',
    },
    {
      name: 'char to integer',
      code: "program test; var c: char; i: integer; begin c := 'B'; i := ord(c); writeln(i); end.",
      purpose: '测试char转换为integer',
      expectedOutput: '66\n',
    },
    {
      name: 'boolean operations',
      code:
        "program test; var b1, b2, b3: boolean; begin b1 := true; b2 := false; b3 := b1 and b2; if not b3 then writeln('false'); end.",
      purpose: '测试boolean类型运算',
      expectedOutput: 'false\n',
    },
    {
      name: 'subrange type operations',
      code: 'program test; type Age = 0..120; var a: Age; begin a := 25; a := a + 5; writeln(a); end.',
      purpose: '测试子界类型运算',
      expectedOutput: '30\n',
    },
    {
      name: 'enumeration type operations',
      code:
        "program test; type Color = (Red, Green, Blue); var c: Color; begin c := Green; if c = Green then writeln('green'); writeln(ord(c)); end.",
      purpose: '测试枚举类型运算',
      expectedOutput: 'green\n1\n',
    },
    {
      name: 'mixed type operations',
      code: "program test; var i: integer; c: char; begin i := ord('A'); writeln(i); c := chr(i); writeln(c); end.",
      purpose: '测试类型混合运算',
      expectedOutput: '65\nA\n',
    },
    {
      name: 'division by zero',
      code: 'program test; var x: integer; begin x := 10 div 0; end.',
      purpose: '测试除零错误',
      expectedError: '',
    },
    {
      name: 'MOD by zero',
      code: 'program test; var x: integer; begin x := 10 mod 0; end.',
      purpose: '测试MOD零错误',
      expectedError: '',
    },
    {
      name: 'negative arithmetic operations',
      code:
        'program test; var x, y: integer; begin x := -5; y := 3; writeln(x + y); writeln(x - y); writeln(x * y); writeln(-x); end.',
      purpose: '测试负数运算',
      expectedOutput: '-2\n-8\n-15\n5\n',
    },
    {
      name: 'large number operations',
      code: 'program test; var x, y: integer; begin x := 100000; y := 200000; writeln(x + y); writeln(x * 2); end.',
      purpose: '测试大数运算',
      expectedOutput: '300000\n200000\n',
    },
    {
      name: 'zero value operations',
      code:
        'program test; var x: integer; begin x := 0; writeln(x + 5); writeln(5 - x); writeln(x * 5); writeln(5 div (x + 1)); end.',
      purpose: '测试零值运算',
      expectedOutput: '5\n5\n0\n5\n',
    },
    {
      name: 'maximum value operations',
      code: 'program test; var x: integer; begin x := 2147483647; writeln(x); writeln(x - 1); end.',
      purpose: '测试最大值运算',
      expectedOutput: '2147483647\n2147483646\n',
    },
    {
      name: 'integer overflow',
      code: 'program test; var x: integer; begin x := 2147483647; x := x + 1; writeln(x); end.',
      purpose: '测试整数溢出（INTEGER 为 32 位有符号）',
      expectedOutput: '-2147483648\n',
    },
    {
      name: 'subrange boundary check',
      code: 'program test; type Age = 0..120; var a: Age; begin a := 120; a := a + 1; end.',
      purpose: '测试子界类型边界检查',
      expectedError: '',
    },
    {
      name: 'set-constructor-range',
      code: `program test;
var s: set of 0..10;
begin
  s := [1..5];
  if 3 in s then writeln('3 in set');
  if 6 in s then writeln('6 in set') else writeln('6 not in set');
end.`,
      purpose: '集合构造器的范围形式 [a..b]',
      expectedContains: '3 in set\n6 not in set',
    },
    {
      name: 'set-constructor-mixed',
      code: `program test;
var s: set of 0..20;
begin
  s := [1, 3..5, 10];
  if 1 in s then writeln('1 yes');
  if 4 in s then writeln('4 yes');
  if 10 in s then writeln('10 yes');
  if 2 in s then writeln('2 yes') else writeln('2 no');
end.`,
      purpose: '集合构造器混合单个元素和范围',
      expectedContains: '1 yes\n4 yes\n10 yes\n2 no',
    },
    {
      name: 'string-concat-plus',
      code: `program test;
var s: string;
begin
  s := 'Hello' + ' ' + 'World';
  writeln(s);
end.`,
      purpose: '字符串拼接 + 运算符（非标扩展）',
      extensions: ['string'],
      expectedContains: 'Hello World',
    },
    {
      name: 'real-arithmetic-basic',
      code: `program test;
var r1, r2: real;
begin
  r1 := 2.5;
  r2 := 1.5;
  writeln(r1 + r2);
  writeln(r1 - r2);
  writeln(r1 * r2);
  writeln(r1 / r2);
end.`,
      purpose: 'real 基本算术运算',
      expectedContains: '4.0',
    },
    {
      name: 'real-mixed-with-integer',
      code: `program test;
var r: real;
    i: integer;
begin
  i := 3;
  r := i + 2.5;
  writeln(r);
  r := r - 1;
  writeln(r);
end.`,
      purpose: 'real 与 integer 混合运算',
      expectedContains: '5.5',
    },
    {
      name: 'integer-bitwise-and',
      code: `program test;
var a, b: integer;
begin
  a := 12;
  b := 10;
  writeln(a AND b);
end.`,
      purpose: 'integer 位与运算（Pascal 中 AND 对整数是位运算）',
      expectedContains: '8',
    },
    {
      name: 'integer-bitwise-or',
      code: `program test;
var a, b: integer;
begin
  a := 12;
  b := 10;
  writeln(a OR b);
end.`,
      purpose: 'integer 位或运算（Pascal 中 OR 对整数是位运算）',
      expectedContains: '14',
    },
    {
      name: 'unary-not-boolean',
      code: `program test;
var b: boolean;
begin
  b := true;
  writeln(NOT b);
  b := false;
  writeln(NOT b);
end.`,
      purpose: '布尔 NOT 运算',
      expectedContains: 'FALSE\nTRUE',
    },
    {
      name: 'unary-minus-real',
      code: `program test;
var r: real;
begin
  r := 3.14;
  writeln(-r:0:2);
end.`,
      purpose: 'real 一元负号',
      expectedContains: '-3.14',
    },
    {
      name: 'string-literal-single-char',
      code: `program test;
var c: char;
begin
  c := 'X';
  writeln(c);
end.`,
      purpose: '单字符字符串字面量赋值给 char',
      expectedContains: 'X',
    },
    {
      name: 'chr-ord-roundtrip',
      code: `program test;
var c: char;
    i: integer;
begin
  c := chr(65);
  writeln(c);
  i := ord('B');
  writeln(i);
end.`,
      purpose: 'chr 和 ord 往返转换',
      expectedContains: 'A\n66',
    },
    {
      name: 'trunc-function',
      code: `program test;
var r: real;
begin
  r := 3.7;
  writeln(trunc(r));
  r := -2.3;
  writeln(trunc(r));
end.`,
      purpose: 'trunc 函数（截断取整）',
      expectedContains: '3\n-2',
    },
    {
      name: 'round-function',
      code: `program test;
var r: real;
begin
  r := 3.4;
  writeln(round(r));
  r := 3.6;
  writeln(round(r));
end.`,
      purpose: 'round 函数（四舍五入）',
      expectedContains: '3\n4',
    },
    {
      name: 'sqrt-function',
      code: `program test;
var r: real;
begin
  r := sqrt(16.0);
  writeln(r:0:2);
end.`,
      purpose: 'sqrt 函数（平方根）',
      expectedContains: '4.00',
    },
    {
      name: 'exp-function',
      code: `program test;
var r: real;
begin
  r := exp(0.0);
  writeln(r:0:2);
end.`,
      purpose: 'exp 函数（自然指数）',
      expectedContains: '1.00',
    },
    {
      name: 'ln-function',
      code: `program test;
var r: real;
begin
  r := ln(1.0);
  writeln(r:0:2);
end.`,
      purpose: 'ln 函数（自然对数）',
      expectedContains: '0.00',
    },
  ]
  runPascalTests(tests)
})
