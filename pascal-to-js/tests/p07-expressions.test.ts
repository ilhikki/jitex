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

import { type PascalTest, runPascalTests } from './harness.ts'

const tests: PascalTest[] = [
  {
    name: '6.7 算术优先级：乘性运算符高于加性运算符',
    code: `program test(output);
var a, b, c: integer;
begin
  a := 2;
  b := 3;
  c := 4;
  writeln(a + b * c);
  writeln(a * b + c);
  writeln((a + b) * c);
end.`,
    purpose: 'ISO 6.7.1：四类运算符优先级中乘性运算符高于加性运算符，括号可改变结合方式',
    expectedOutput: '14\n10\n20\n',
  },
  {
    name: '6.7 同级运算符左结合',
    code: `program test(output);
begin
  writeln(20 - 5 - 3);
  writeln(100 div 10 div 2);
  writeln(8 div 3 * 3);
end.`,
    purpose: 'ISO 6.7.1：同级运算符序列左结合，(20-5)-3=12、(100 div 10) div 2=5、(8 div 3)*3=6',
    expectedOutput: '12\n5\n6\n',
  },
  {
    name: '6.7 关系运算符优先级最低',
    code: `program test(output);
begin
  if 1 + 1 = 2 then writeln('eq-ok');
  if 2 * 3 < 3 * 3 then writeln('lt-ok');
end.`,
    purpose: 'ISO 6.7.1：关系运算符优先级低于算术运算符，1+1=2 与 2*3<3*3 先算算术再比较',
    expectedOutput: 'eq-ok\nlt-ok\n',
  },
  {
    name: '6.7 布尔运算符优先级：not 最高、and 高于 or',
    code: `program test(output);
var p, q, r: boolean;
begin
  p := true;
  q := false;
  r := false;
  if p or q and r then writeln('or-and');
  if (p or q) and r then writeln('paren') else writeln('not-eval');
  if not p and q then writeln('notp') else writeln('neg');
end.`,
    purpose:
      'ISO 6.7.1：not 优先级最高、and 高于 or；p or q and r 等价于 p or (q and r)，not p and q 等价于 (not p) and q',
    expectedOutput: 'or-and\nnot-eval\nneg\n',
  },
  {
    name: '6.7 加法运算（表 3）',
    code: 'program test(output); var x, y: integer; begin x := 5; y := 3; writeln(x + y); end.',
    purpose: 'ISO 6.7.2.2 表 3：两个 integer 操作数相加，结果为 integer',
    expectedOutput: '8\n',
  },
  {
    name: '6.7 减法运算（表 3）',
    code: 'program test(output); var x, y: integer; begin x := 10; y := 4; writeln(x - y); end.',
    purpose: 'ISO 6.7.2.2 表 3：两个 integer 操作数相减，结果为 integer',
    expectedOutput: '6\n',
  },
  {
    name: '6.7 乘法运算（表 3）',
    code: 'program test(output); var x, y: integer; begin x := 6; y := 7; writeln(x * y); end.',
    purpose: 'ISO 6.7.2.2 表 3：两个 integer 操作数相乘，结果为 integer',
    expectedOutput: '42\n',
  },
  {
    name: '6.7 一元负号（表 4，integer）',
    code: 'program test(output); var x: integer; begin x := 10; writeln(-x); writeln(-(-x)); end.',
    purpose: 'ISO 6.7.2.2 表 4：一元符号取反作用于 integer 得 integer',
    expectedOutput: '-10\n10\n',
  },
  {
    name: '6.7 除法 /：结果为 real（表 3）',
    code: `program test(output);
var r: real;
i, j: integer;
begin
  i := 15;
  j := 3;
  r := i / j;
  writeln(trunc(r));
  r := 1 / 2;
  writeln(round(r));
end.`,
    purpose: 'ISO 6.7.2.2 表 3：/ 的运算数虽为 integer 但结果为 real；1/2 得 0.5（round 得 1），区别于整数除法',
    expectedOutput: '5\n1\n',
  },
  {
    name: '6.7 整数除法 div（表 3）',
    code: 'program test(output); var x, y: integer; begin x := 17; y := 5; writeln(x div y); end.',
    purpose: 'ISO 6.7.2.2 表 3：17 div 5 = 3（满足 |i|-|j| < |(i div j)*j| <= |i|）',
    expectedOutput: '3\n',
  },
  {
    name: '6.7 div 的符号规则：向零截断',
    code: `program test(output);
var i, j: integer;
begin
  i := -7;
  j := 2;
  writeln(i div j);
  i := 7;
  j := -2;
  writeln(i div j);
  i := -7;
  j := -2;
  writeln(i div j);
end.`,
    purpose:
      'ISO 6.7.2.2：i div j 的结果符号在 i、j 同号时为正、异号时为负，即向零截断；(-7) div 2=-3、7 div (-2)=-3、(-7) div (-2)=3',
    expectedOutput: '-3\n-3\n3\n',
  },
  {
    name: '6.7 mod 的定义：0 <= i mod j < j',
    code: `program test(output);
var i, j: integer;
begin
  i := -7;
  j := 3;
  writeln(i mod j);
  i := 7;
  j := 3;
  writeln(i mod j);
  i := 5;
  j := 5;
  writeln(i mod j);
end.`,
    purpose: 'ISO 6.7.2.2：i mod j 是满足 0 <= i mod j < j 的 i-k*j；(-7) mod 3=2、7 mod 3=1、5 mod 5=0',
    expectedOutput: '2\n1\n0\n',
  },
  {
    name: '6.7 mod 的负除数为错误',
    code: `program test(output);
var x, j: integer;
begin
  j := -3;
  x := 10 mod j;
  writeln(x);
end.`,
    purpose:
      '【乙类·D.46】ISO 6.7.2.2：i mod j 在 j 为负时出错（j <= 0 即错误）——designated error，§5.1 f) 允许在随附文档中声明不报告；本处理器选择检出并报告',
    expectedError: '',
  },
  {
    name: '6.7 实数除法除数为零为错误',
    code: `program test(output);
var r: real;
i: integer;
begin
  i := 0;
  r := 10 / i;
  writeln(trunc(r));
end.`,
    purpose:
      '【乙类·D.44】ISO 6.7.2.2：x / y 在 y 为零时为错误——designated error，§5.1 f) 允许在随附文档中声明不报告；本处理器选择检出并报告',
    expectedError: '',
  },
  {
    name: '6.7 div 除数为零为错误',
    code: `program test(output);
var x, j: integer;
begin
  j := 0;
  x := 10 div j;
  writeln(x);
end.`,
    purpose: 'ISO 6.7.2.2：i div j 在 j 为零时为错误',
    expectedError: '',
  },
  {
    name: '6.7 mod 除数为零为错误',
    code: `program test(output);
var x, j: integer;
begin
  j := 0;
  x := 10 mod j;
  writeln(x);
end.`,
    purpose: 'ISO 6.7.2.2：i mod j 在 j 为零时为错误',
    expectedError: '',
  },
  {
    name: '6.7 整数运算须符合数学规则：maxint + 1 报错',
    code: `program test(output);
var x: integer;
begin
  x := maxint;
  x := x + 1;
  writeln(x);
end.`,
    purpose:
      '【乙类·D.47】ISO 6.7.2.2：整数运算须按数学规则正确执行，否则出错；maxint + 1 超出 integer 范围，应报错而非环绕——designated error，§5.1 f) 允许在随附文档中声明不报告；本处理器选择检出并报告',
    expectedError: '',
  },
  {
    name: '6.7 maxint 的数学性质（不依赖其具体取值）',
    code: `program test(output);
var x: integer;
begin
  x := maxint;
  writeln(x - x);
  if maxint + 0 = maxint then writeln('add-zero');
end.`,
    purpose: 'ISO 6.7.2.2：maxint 是 implementation-defined 值，但其在自身区间内的运算须正确；x-x=0 且 maxint+0=maxint',
    expectedOutput: '0\nadd-zero\n',
  },
  {
    name: '6.7 real 四则运算（表 3）',
    code: `program test(output);
var r1, r2: real;
begin
  r1 := 2.5;
  r2 := 1.5;
  writeln(trunc(r1 + r2));
  writeln(trunc(r1 - r2));
  writeln(trunc(r1 * r2));
  writeln(trunc(r1 / r2));
end.`,
    purpose: 'ISO 6.7.2.2 表 3：两个 real 操作数的 + - * / 结果均为 real（用 trunc 转整数以避免依赖 real 输出格式）',
    expectedOutput: '4\n1\n3\n1\n',
  },
  {
    name: '6.7 real 与 integer 混合运算结果为 real（表 3）',
    code: `program test(output);
var i: integer;
r: real;
begin
  i := 3;
  r := i + 2.5;
  writeln(trunc(r));
  r := i / 2;
  writeln(trunc(r));
end.`,
    purpose: 'ISO 6.7.2.2 表 3：一个 integer 一个 real 时结果为 real，3+2.5=5.5、3/2=1.5',
    expectedOutput: '5\n1\n',
  },
  {
    name: '6.7 一元负号（表 4，real）',
    code: `program test(output);
var r: real;
begin
  r := 3.5;
  writeln(trunc(-r));
  writeln(trunc(-(-r)));
end.`,
    purpose: 'ISO 6.7.2.2 表 4：一元符号取反作用于 real 得 real，-3.5 截断为 -3',
    expectedOutput: '-3\n3\n',
  },
  {
    name: '6.7 关系运算中 real 与 integer 相容',
    code: `program test(output);
var i: integer;
r: real;
begin
  i := 1;
  r := 1.5;
  if i < r then writeln('lt');
  i := 2;
  r := 2.0;
  if i = r then writeln('eq');
end.`,
    purpose: 'ISO 6.7.2.5：关系运算符允许一个操作数为 real、另一个为 integer',
    expectedOutput: 'lt\neq\n',
  },
  {
    name: '6.7 关系运算 = 与 <>',
    code: `program test(output);
var x, y: integer;
begin
  x := 5;
  y := 5;
  if x = y then writeln('equal');
  y := 3;
  if x <> y then writeln('not equal');
end.`,
    purpose: 'ISO 6.7.2.5：= 与 <> 分别表示相等与不等',
    expectedOutput: 'equal\nnot equal\n',
  },
  {
    name: '6.7 关系运算 < > <= >=',
    code: `program test(output);
var x, y, z: integer;
begin
  x := 3;
  y := 5;
  z := 3;
  if x < y then writeln('less');
  if y > x then writeln('greater');
  if x <= z then writeln('le');
  if y >= x then writeln('ge');
end.`,
    purpose: 'ISO 6.7.2.5：< > <= >= 分别表示小于、大于、小于等于、大于等于',
    expectedOutput: 'less\ngreater\nle\nge\n',
  },
  {
    name: '6.7 布尔 not 运算（6.7.2.3）',
    code: `program test(output);
var b: boolean;
begin
  b := true;
  if not b then writeln('t') else writeln('f');
  b := false;
  if not b then writeln('t') else writeln('f');
end.`,
    purpose:
      'ISO 6.7.2.3：not 表示逻辑取反，操作数与结果均为 Boolean-type（不直接输出 boolean，规避其大小写 implementation-defined）',
    expectedOutput: 'f\nt\n',
  },
  {
    name: '6.7 布尔 and 运算（6.7.2.3）',
    code: `program test(output);
var a, b: boolean;
begin
  a := true;
  b := true;
  if a and b then writeln('1') else writeln('0');
  b := false;
  if a and b then writeln('1') else writeln('0');
  a := false;
  if a and b then writeln('1') else writeln('0');
end.`,
    purpose: 'ISO 6.7.2.3：and 表示逻辑合取，T and T= T，其余为 F',
    expectedOutput: '1\n0\n0\n',
  },
  {
    name: '6.7 布尔 or 运算（6.7.2.3）',
    code: `program test(output);
var a, b: boolean;
begin
  a := false;
  b := false;
  if a or b then writeln('1') else writeln('0');
  b := true;
  if a or b then writeln('1') else writeln('0');
  a := true;
  b := false;
  if a or b then writeln('1') else writeln('0');
end.`,
    purpose: 'ISO 6.7.2.3：or 表示逻辑析取，F or F = F，其余为 T',
    expectedOutput: '0\n1\n1\n',
  },
  {
    name: '6.7 布尔混合运算',
    code: `program test(output);
var a, b, c: boolean;
begin
  a := true;
  b := false;
  c := true;
  if (a and not b) or (not a and c) then writeln('true') else writeln('false');
end.`,
    purpose: 'ISO 6.7.2.3：not/and/or 组合，(T and not F) or (not T and T) = T',
    expectedOutput: 'true\n',
  },
  {
    name: '6.7 Boolean 是序数类型：false < true',
    code: `program test(output);
begin
  if false < true then writeln('ok');
end.`,
    purpose: 'ISO 6.7.2.5 NOTE：Boolean-type 是序数类型且 false 小于 true',
    expectedOutput: 'ok\n',
  },
  {
    name: '6.7 集合并运算 +（表 5）',
    code: `program test(output);
type T = set of 1..10;
var a, b, c: T;
begin
  a := [1, 2, 3];
  b := [3, 4, 5];
  c := a + b;
  if 1 in c then writeln('1');
  if 2 in c then writeln('2');
  if 5 in c then writeln('5');
end.`,
    purpose: 'ISO 6.7.2.4 表 5：x 属于 u+v 当且仅当属于 u 或属于 v',
    expectedOutput: '1\n2\n5\n',
  },
  {
    name: '6.7 集合交运算 *（表 5）',
    code: `program test(output);
type T = set of 1..10;
var a, b, c: T;
begin
  a := [1, 2, 3, 4];
  b := [3, 4, 5, 6];
  c := a * b;
  if 3 in c then writeln('3');
  if 4 in c then writeln('4');
  if 1 in c then writeln('1') else writeln('no 1');
end.`,
    purpose: 'ISO 6.7.2.4 表 5：x 属于 u*v 当且仅当同时属于 u 和 v',
    expectedOutput: '3\n4\nno 1\n',
  },
  {
    name: '6.7 集合差运算 -（表 5）',
    code: `program test(output);
type T = set of 1..10;
var a, b, c: T;
begin
  a := [1, 2, 3, 4];
  b := [3, 4, 5];
  c := a - b;
  if 1 in c then writeln('1');
  if 2 in c then writeln('2');
  if 3 in c then writeln('3') else writeln('no 3');
end.`,
    purpose: 'ISO 6.7.2.4 表 5：x 属于 u-v 当且仅当属于 u 且不属于 v',
    expectedOutput: '1\n2\nno 3\n',
  },
  {
    name: '6.7 集合成员运算 in（6.7.2.5）',
    code: `program test(output);
type T = set of char;
var s: T;
begin
  s := ['A', 'B', 'C'];
  if 'B' in s then writeln('yes');
  if 'X' in s then writeln('no') else writeln('not found');
end.`,
    purpose: 'ISO 6.7.2.5：in 左操作数为序数类型、右为集合类型，成员则 true 否则 false',
    expectedOutput: 'yes\nnot found\n',
  },
  {
    name: '6.7 集合包含关系 <= 与 >=',
    code: `program test(output);
type T = set of 1..10;
var a, b: T;
begin
  a := [1, 2];
  b := [1, 2, 3];
  if a <= b then writeln('subset');
  if b >= a then writeln('superset');
  if b <= a then writeln('in') else writeln('not-subset');
end.`,
    purpose: 'ISO 6.7.2.5：对集合类型，u <= v 表示 u 被 v 包含，u >= v 表示 v 被 u 包含',
    expectedOutput: 'subset\nsuperset\nnot-subset\n',
  },
  {
    name: '6.7 集合相等 = 与 <>',
    code: `program test(output);
type T = set of 1..10;
var a, b: T;
begin
  a := [1, 2, 3];
  b := [3, 2, 1];
  if a = b then writeln('equal');
  b := [1, 2, 3, 4];
  if a <> b then writeln('not equal');
end.`,
    purpose: 'ISO 6.7.2.5：集合相等与成员书写顺序无关，[1,2,3] = [3,2,1]',
    expectedOutput: 'equal\nnot equal\n',
  },
  {
    name: '6.7 集合构造器 [] 及成员范围 [x..y]',
    code: `program test(output);
type T = set of 1..10;
var a: T;
begin
  a := [];
  if 1 in a then writeln('has') else writeln('empty');
  a := [5..3];
  if 5 in a then writeln('has5') else writeln('no5');
  a := [3..5];
  if 4 in a then writeln('yes4');
end.`,
    purpose: 'ISO 6.7.1：[] 表示不含成员；[x..y] 表示闭区间成员，x>y 时不含成员，[3..5] 含 4',
    expectedOutput: 'empty\nno5\nyes4\n',
  },
  {
    name: '6.7 集合构造器混合单个元素与范围',
    code: `program test(output);
type T = set of 0..20;
var s: T;
begin
  s := [1, 3..5, 10];
  if 1 in s then writeln('1 yes');
  if 4 in s then writeln('4 yes');
  if 10 in s then writeln('10 yes');
  if 2 in s then writeln('2 yes') else writeln('2 no');
end.`,
    purpose:
      'ISO 6.7.1：set-constructor 的 member-designator 可为单个表达式或 x..y 范围，[1,3..5,10] 含 1、3、4、5、10',
    expectedOutput: '1 yes\n4 yes\n10 yes\n2 no\n',
  },
  {
    name: '6.7 子界类型的 factor 按其基类型处理',
    code: 'program test(output); type Age = 0..120; var a: Age; begin a := 25; a := a + 5; writeln(a); end.',
    purpose: 'ISO 6.7.1：类型为 T 子界的 factor 视作 T 处理，故 Age 变量参与 integer 加法后再做赋值相容检查',
    expectedOutput: '30\n',
  },
  {
    name: '6.7 ord 与 chr 互逆（不依赖字符集具体序数）',
    code: `program test(output);
var c: char;
i: integer;
begin
  c := 'A';
  i := ord(c);
  if chr(i) = c then writeln('roundtrip');
end.`,
    purpose: 'ISO 6.6.6.2 转移函数：ord 与 chr 互为逆运算，只断言 chr(ord(c)) = c，不假设字符的具体序数',
    expectedOutput: 'roundtrip\n',
  },
  {
    name: '6.7.3 function-designator：实参按位置对应形参',
    code: `program test(output);
function subtract(a, b: integer): integer;
begin
  subtract := a - b;
end;
begin
  writeln(subtract(10, 3));
  writeln(subtract(3, 10));
end.`,
    purpose: 'ISO 6.7.3：实参与形参按位置对应而非按名字，参数次序影响结果',
    expectedOutput: '7\n-7\n',
  },
  {
    name: '6.7.3 function-designator：结果未定义即出错',
    code: `program test(output);
function f(x: integer): integer;
var y: integer;
begin
  y := x + 1;
end;
begin
  writeln(f(1));
end.`,
    purpose:
      '【乙类·D.48】ISO 6.7.3：函数激活结束时若结果未定义则为错误（函数体内从未给 f 赋值）——designated error，§5.1 f) 允许在随附文档中声明不报告；本处理器选择检出并报告',
    expectedError: '',
  },
  {
    name: '6.7.3 function-designator：实参个数须等于形参个数',
    code: `program test(output);
function add(a, b: integer): integer;
begin
  add := a + b;
end;
begin
  writeln(add(1, 2, 3));
end.`,
    purpose: 'ISO 6.7.3：实参个数须与形参个数相等，多传实参应报错',
    expectedError: '',
  },
]

runPascalTests('ISO 7185 6.7 - Expressions', tests)
