// ISO/IEC 7185:1990 - 6.7 Expressions
//
// 章节概括：
//   规定表达式表示一个值，给出 expression / simple-expression / term / factor 的语法与运算符优先级：
//   not 最高，其次乘性运算符（* / div mod and），再次加性运算符（+ - or）与符号，最低为关系运算符；
//   同级运算符序列左结合。factor 若类型为 T 的子界则按 T 处理，集合按相应的 canonical-set-of-T-type 处理。
//   set-constructor：[] 表示不含成员的值，含 member-designator 的构造式表示由其决定的成员集合，
//   member-designator 的求值顺序为 implementation-dependent。operators 部分给出乘性/加性/关系运算符
//   集合与结果类型表；规定 x/y 在 y=0 时出错、i div j 与 i mod j 的取值条件、maxint 的四条性质、
//   整数运算须按数学规则正确执行否则出错、实数运算与转换结果为近似且精度 implementation-defined；
//   关系运算要求操作数相容（或为同一集合类型、或一为 real 一为 integer），对相容 string-type
//   定义字典序比较，另定义 in 运算。function-designator 指定函数块的激活并返回结果
//   （结果未定义即出错），实参与形参按位置对应、数量相等，求值与绑定顺序为 implementation-dependent。
//
// 子章节：
//   6.7.1 General
//   6.7.2 Operators
//     6.7.2.1 General
//     6.7.2.2 Arithmetic operators
//     6.7.2.3 Boolean operators
//     6.7.2.4 Set operators
//     6.7.2.5 Relational operators
//   6.7.3 Function-designators
//
// 状态：骨架文件，用例待从 tests/integration/ 迁移（迁移时仅改 name，内容不动）。

import { describe } from './harness.ts'
import { type PascalTest, runPascalTests } from './harness.ts'

describe('ISO 7185 6.7 - Expressions', () => {
  const tests: PascalTest[] = [
    {
      name: '6.7 addition',
      code: 'program test; var x, y: integer; begin x := 5; y := 3; writeln(x + y); end.',
      purpose: '测试加法运算',
      expectedOutput: '8\n',
    },
    {
      name: '6.7 subtraction',
      code: 'program test; var x, y: integer; begin x := 10; y := 4; writeln(x - y); end.',
      purpose: '测试减法运算',
      expectedOutput: '6\n',
    },
    {
      name: '6.7 multiplication',
      code: 'program test; var x, y: integer; begin x := 6; y := 7; writeln(x * y); end.',
      purpose: '测试乘法运算',
      expectedOutput: '42\n',
    },
    {
      name: '6.7 division',
      code: 'program test; var x, y: integer; begin x := 15; y := 3; writeln(x / y); end.',
      purpose: '测试除法运算（Pascal82: / 为实数除法，结果为 real）',
      expectedOutput: '5.00000000000000E+000\n',
    },
    {
      name: '6.7 integer division (DIV)',
      code: 'program test; var x, y: integer; begin x := 17; y := 5; writeln(x div y); end.',
      purpose: '测试整数除法DIV',
      expectedOutput: '3\n',
    },
    {
      name: '6.7 modulus (MOD)',
      code: 'program test; var x, y: integer; begin x := 17; y := 5; writeln(x mod y); end.',
      purpose: '测试取模运算MOD',
      expectedOutput: '2\n',
    },
    {
      name: '6.7 unary minus',
      code: 'program test; var x: integer; begin x := 10; writeln(-x); writeln(-(-x)); end.',
      purpose: '测试负号运算',
      expectedOutput: '-10\n10\n',
    },
    {
      name: '6.7 mixed arithmetic',
      code: 'program test; var a, b, c: integer; begin a := 2; b := 3; c := 4; writeln(a + b * c); end.',
      purpose: '测试混合算术运算',
      expectedOutput: '14\n',
    },
    {
      name: '6.7 operator precedence',
      code: 'program test; var x, y, z: integer; begin x := 2; y := 3; z := 4; writeln(x + y * z - 1); end.',
      purpose: '测试运算符优先级',
      expectedOutput: '13\n',
    },
    {
      name: '6.7 parentheses change precedence',
      code: 'program test; var x, y, z: integer; begin x := 2; y := 3; z := 4; writeln((x + y) * z); end.',
      purpose: '测试括号改变优先级',
      expectedOutput: '20\n',
    },
    {
      name: '6.7 equality (equals)',
      code:
        "program test; var x, y: integer; begin x := 5; y := 5; if x = y then writeln('equal') else writeln('not equal'); end.",
      purpose: '测试等于运算',
      expectedOutput: 'equal\n',
    },
    {
      name: '6.7 inequality (not equals)',
      code:
        "program test; var x, y: integer; begin x := 5; y := 3; if x <> y then writeln('not equal') else writeln('equal'); end.",
      purpose: '测试不等于运算',
      expectedOutput: 'not equal\n',
    },
    {
      name: '6.7 less than',
      code:
        "program test; var x, y: integer; begin x := 3; y := 5; if x < y then writeln('less') else writeln('not less'); end.",
      purpose: '测试小于运算',
      expectedOutput: 'less\n',
    },
    {
      name: '6.7 greater than',
      code:
        "program test; var x, y: integer; begin x := 5; y := 3; if x > y then writeln('greater') else writeln('not greater'); end.",
      purpose: '测试大于运算',
      expectedOutput: 'greater\n',
    },
    {
      name: '6.7 less than or equal',
      code:
        "program test; var x, y, z: integer; begin x := 3; y := 5; z := 3; if x <= y then writeln('ok1'); if x <= z then writeln('ok2'); end.",
      purpose: '测试小于等于运算',
      expectedOutput: 'ok1\nok2\n',
    },
    {
      name: '6.7 greater than or equal',
      code:
        "program test; var x, y, z: integer; begin x := 5; y := 3; z := 5; if x >= y then writeln('ok1'); if x >= z then writeln('ok2'); end.",
      purpose: '测试大于等于运算',
      expectedOutput: 'ok1\nok2\n',
    },
    {
      name: '6.7 mixed relational operations',
      code: "program test; var x: integer; begin x := 10; if (x > 5) and (x < 15) then writeln('in range'); end.",
      purpose: '测试混合关系运算',
      expectedOutput: 'in range\n',
    },
    {
      name: '6.7 NOT operation',
      code:
        "program test; var b: boolean; begin b := true; if not b then writeln('false') else writeln('true'); b := false; if not b then writeln('true') else writeln('false'); end.",
      purpose: '测试NOT逻辑运算',
      expectedOutput: 'true\ntrue\n',
    },
    {
      name: '6.7 AND operation',
      code:
        "program test; var a, b: boolean; begin a := true; b := true; if a and b then writeln('true') else writeln('false'); b := false; if a and b then writeln('true') else writeln('false'); end.",
      purpose: '测试AND逻辑运算',
      expectedOutput: 'true\nfalse\n',
    },
    {
      name: '6.7 OR operation',
      code:
        "program test; var a, b: boolean; begin a := false; b := false; if a or b then writeln('true') else writeln('false'); b := true; if a or b then writeln('true') else writeln('false'); end.",
      purpose: '测试OR逻辑运算',
      expectedOutput: 'false\ntrue\n',
    },
    {
      name: '6.7 mixed logical operations',
      code:
        "program test; var a, b, c: boolean; begin a := true; b := false; c := true; if (a and not b) or (not a and c) then writeln('true') else writeln('false'); end.",
      purpose: '测试混合逻辑运算',
      expectedOutput: 'true\n',
    },
    {
      name: '6.7 logical short circuit AND',
      code:
        "program test; var x: integer; begin x := 0; if (x > 0) and (10 div x > 0) then writeln('true') else writeln('false'); end.",
      purpose: '测试AND逻辑短路（第一个条件为false时不应执行第二个条件）',
      expectedOutput: 'false\n',
    },
    {
      name: '6.7 logical short circuit OR',
      code:
        "program test; var x: integer; begin x := 5; if (x > 0) or (10 div 0 > 0) then writeln('true') else writeln('false'); end.",
      purpose: '测试OR逻辑短路（第一个条件为true时不应执行第二个条件）',
      expectedOutput: 'true\n',
    },
    {
      name: '6.7 NOT operator precedence',
      code:
        "program test; var a, b: boolean; begin a := true; b := false; if not a and b then writeln('true') else writeln('false'); if not (a and b) then writeln('true') else writeln('false'); end.",
      purpose: '测试NOT运算符优先级',
      expectedOutput: 'false\ntrue\n',
    },
    {
      name: '6.7 set union',
      code:
        "program test; type T = set of 1..10; var a, b, c: T; begin a := [1, 2, 3]; b := [3, 4, 5]; c := a + b; if 1 in c then writeln('1'); if 5 in c then writeln('5'); end.",
      purpose: '测试集合并运算',
      expectedOutput: '1\n5\n',
    },
    {
      name: '6.7 set intersection',
      code:
        "program test; type T = set of 1..10; var a, b, c: T; begin a := [1, 2, 3, 4]; b := [3, 4, 5, 6]; c := a * b; if 3 in c then writeln('3'); if 4 in c then writeln('4'); if 1 in c then writeln('1') else writeln('no 1'); end.",
      purpose: '测试集合交运算',
      expectedOutput: '3\n4\nno 1\n',
    },
    {
      name: '6.7 set difference',
      code:
        "program test; type T = set of 1..10; var a, b, c: T; begin a := [1, 2, 3, 4]; b := [3, 4, 5]; c := a - b; if 1 in c then writeln('1'); if 3 in c then writeln('3') else writeln('no 3'); end.",
      purpose: '测试集合差运算',
      expectedOutput: '1\nno 3\n',
    },
    {
      name: '6.7 IN operation',
      code:
        "program test; type T = set of char; var s: T; begin s := ['A', 'B', 'C']; if 'B' in s then writeln('yes'); if 'X' in s then writeln('no') else writeln('not found'); end.",
      purpose: '测试IN集合成员运算',
      expectedOutput: 'yes\nnot found\n',
    },
    {
      name: '6.7 set assignment',
      code:
        "program test; type T = set of 1..5; var s1, s2: T; begin s1 := [1, 2]; s2 := s1; s1 := s1 + [3]; if 3 in s1 then writeln('s1 has 3'); if 3 in s2 then writeln('s2 has 3') else writeln('s2 no 3'); end.",
      purpose: '测试集合赋值',
      expectedOutput: 's1 has 3\ns2 no 3\n',
    },
    {
      name: '6.7 integer to char',
      code: 'program test; var i: integer; c: char; begin i := 65; c := chr(i); writeln(c); end.',
      purpose: '测试integer转换为char',
      expectedOutput: 'A\n',
    },
    {
      name: '6.7 char to integer',
      code: "program test; var c: char; i: integer; begin c := 'B'; i := ord(c); writeln(i); end.",
      purpose: '测试char转换为integer',
      expectedOutput: '66\n',
    },
    {
      name: '6.7 boolean operations',
      code:
        "program test; var b1, b2, b3: boolean; begin b1 := true; b2 := false; b3 := b1 and b2; if not b3 then writeln('false'); end.",
      purpose: '测试boolean类型运算',
      expectedOutput: 'false\n',
    },
    {
      name: '6.7 subrange type operations',
      code: 'program test; type Age = 0..120; var a: Age; begin a := 25; a := a + 5; writeln(a); end.',
      purpose: '测试子界类型运算',
      expectedOutput: '30\n',
    },
    {
      name: '6.7 enumeration type operations',
      code:
        "program test; type Color = (Red, Green, Blue); var c: Color; begin c := Green; if c = Green then writeln('green'); writeln(ord(c)); end.",
      purpose: '测试枚举类型运算',
      expectedOutput: 'green\n1\n',
    },
    {
      name: '6.7 mixed type operations',
      code: "program test; var i: integer; c: char; begin i := ord('A'); writeln(i); c := chr(i); writeln(c); end.",
      purpose: '测试类型混合运算',
      expectedOutput: '65\nA\n',
    },
    {
      name: '6.7 division by zero',
      code: 'program test; var x: integer; begin x := 10 div 0; end.',
      purpose: '测试除零错误',
      expectedError: '',
    },
    {
      name: '6.7 MOD by zero',
      code: 'program test; var x: integer; begin x := 10 mod 0; end.',
      purpose: '测试MOD零错误',
      expectedError: '',
    },
    {
      name: '6.7 negative arithmetic operations',
      code:
        'program test; var x, y: integer; begin x := -5; y := 3; writeln(x + y); writeln(x - y); writeln(x * y); writeln(-x); end.',
      purpose: '测试负数运算',
      expectedOutput: '-2\n-8\n-15\n5\n',
    },
    {
      name: '6.7 large number operations',
      code: 'program test; var x, y: integer; begin x := 100000; y := 200000; writeln(x + y); writeln(x * 2); end.',
      purpose: '测试大数运算',
      expectedOutput: '300000\n200000\n',
    },
    {
      name: '6.7 zero value operations',
      code:
        'program test; var x: integer; begin x := 0; writeln(x + 5); writeln(5 - x); writeln(x * 5); writeln(5 div (x + 1)); end.',
      purpose: '测试零值运算',
      expectedOutput: '5\n5\n0\n5\n',
    },
    {
      name: '6.7 maximum value operations',
      code: 'program test; var x: integer; begin x := 2147483647; writeln(x); writeln(x - 1); end.',
      purpose: '测试最大值运算',
      expectedOutput: '2147483647\n2147483646\n',
    },
    {
      name: '6.7 integer overflow',
      code: 'program test; var x: integer; begin x := 2147483647; x := x + 1; writeln(x); end.',
      purpose: '测试整数溢出（INTEGER 为 32 位有符号）',
      expectedOutput: '-2147483648\n',
    },
    {
      name: '6.7 subrange boundary check',
      code: 'program test; type Age = 0..120; var a: Age; begin a := 120; a := a + 1; end.',
      purpose: '测试子界类型边界检查',
      expectedError: '',
    },
    {
      name: '6.7 set-constructor-range',
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
      name: '6.7 set-constructor-mixed',
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
      name: '6.7 real-arithmetic-basic',
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
      name: '6.7 real-mixed-with-integer',
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
      name: '6.7 integer-bitwise-and',
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
      name: '6.7 integer-bitwise-or',
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
      name: '6.7 unary-not-boolean',
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
      name: '6.7 unary-minus-real',
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
      name: '6.7 string-literal-single-char',
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
      name: '6.7 chr-ord-roundtrip',
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
      name: '6.7 trunc-function',
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
      name: '6.7 round-function',
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
      name: '6.7 sqrt-function',
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
      name: '6.7 exp-function',
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
      name: '6.7 ln-function',
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
