// ISO/IEC 7185:1990 - 6.8 Statements
//
// 章节概括：
//   规定语句表示可执行的算法动作，语法为 statement = [label ':'] (simple-statement | structured-statement)，
//   并给出某语句的标签能否作为某 goto 语句目标的三条判据。simple-statement 包括 empty-statement、
//   assignment-statement、procedure-statement、goto-statement：赋值语句把表达式值赋给变量或函数激活结果
//   （要求 assignment-compatible），并定义变量的 undefined 与 structured-type 变量的 totally-undefined 状态；
//   过程语句激活对应过程块（read/readln/write/writeln 的参数形式指称相应 required procedure）；
//   goto 语句使处理在该标签所指程序点继续，并终止除相关激活外的所有激活。structured-statement 包括
//   compound-statement、conditional-statement（if、case）、repetitive-statement（repeat、while、for）
//   与 with-statement：statement-sequence 按文本顺序执行；if 的 else 配对规则（无 else 的 if 不得紧跟 else）；
//   case 的 case-index 选择与 case 常量互异要求（无匹配即错误）；repeat/while/for 的重复语义，
//   其中 for 要求 control-variable 为 entire-variable 且为序数类型、执行后变 undefined，并定义
//   "threatening a variable" 及 for 的等价展开；with 规定 field-designator-identifier 的定义点与作用域。
//
// 子章节：
//   6.8.1 General
//   6.8.2 Simple-statements
//     6.8.2.1 General
//     6.8.2.2 Assignment-statements
//     6.8.2.3 Procedure-statements
//     6.8.2.4 Goto-statements
//   6.8.3 Structured-statements
//     6.8.3.1 General
//     6.8.3.2 Compound-statements
//     6.8.3.3 Conditional-statements
//     6.8.3.4 If-statements
//     6.8.3.5 Case-statements
//     6.8.3.6 Repetitive-statements
//     6.8.3.7 Repeat-statements
//     6.8.3.8 While-statements
//     6.8.3.9 For-statements
//     6.8.3.10 With-statements

import { type PascalTest, runPascalTests } from './harness.ts'

const tests: PascalTest[] = [
  // ==========================================================================
  // 6.8.2.1 空语句
  // ==========================================================================

  {
    name: '6.8 空语句不含符号且不执行任何动作',
    code: `program test(output);
var i: integer;
begin
  i := 1;
  ;
  i := i + 1;
  ;
  writeln(i);
end.`,
    purpose: '6.8.2.1：空语句不含符号、表示无动作，夹在语句序列中不影响结果',
    expectedOutput: '2\n',
  },
  {
    name: '6.8 label 可前缀空语句',
    code: `program test(output);
label 10;
begin
  goto 10;
  writeln('skipped');
10:
  ;
  writeln('after');
end.`,
    purpose: '6.8.1：label 可前缀空语句，goto 跳到该处以空动作继续',
    expectedOutput: 'after\n',
  },

  // ==========================================================================
  // 6.8.2.2 赋值语句
  // ==========================================================================

  {
    name: '6.8 赋值语句把表达式值赋给变量',
    code: `program test(output);
var x: integer;
    c: char;
    b: boolean;
begin
  x := 3;
  c := 'q';
  b := x > 0;
  if b then
    writeln(c);
end.`,
    purpose: '6.8.2.2：赋值语句把与变量类型赋值兼容的表达式值赋给变量',
    expectedOutput: 'q\n',
  },
  {
    name: '6.8 整数可赋值给实数变量（赋值兼容）',
    code: `program test(output);
var r: real;
    i: integer;
begin
  i := 3;
  r := i;
  if r = 3.0 then
    writeln('compatible');
end.`,
    purpose: '6.8.2.2 / 6.4.6：integer 类型的值对 real 变量赋值兼容',
    expectedOutput: 'compatible\n',
  },
  {
    name: '6.8 赋值语句要求赋值兼容（不兼容的赋值是错误）',
    code: `program test;
var i: integer;
begin
  i := true;
end.`,
    purpose:
      '【乙类·D.49】6.8.2.2：值须与变量类型赋值兼容，boolean 不兼容 integer，程序非法——designated error，§5.1 f) 允许在随附文档中声明不报告；本处理器选择检出并报告',
    expectedError: '',
  },
  {
    name: '6.8 同一记录类型可整体赋值',
    code: `program test(output);
type
  point = record
    x: integer;
    y: integer;
  end;
var
  a, b: point;
begin
  a.x := 4;
  a.y := 5;
  b := a;
  writeln(b.x, b.y);
end.`,
    purpose: '6.4.6：同一记录类型的变量之间赋值兼容，可整体赋值',
    expectedOutput: '45\n',
  },
  {
    name: '6.8 赋值语句可给函数标识符（activation result）赋值',
    code: `program test(output);
function double(n: integer): integer;
begin
  double := n * 2;
end;
begin
  writeln(double(4));
end.`,
    purpose: '6.8.2.2：赋值语句可把值赋给函数标识符所指称的 activation result',
    expectedOutput: '8\n',
  },
  {
    name: '6.8 变量赋值前处于 undefined 状态，赋值后其值确定',
    code: `program test(output);
var x: integer;
begin
  x := 7;
  writeln(x);
end.`,
    purpose: '6.8.2.2：未赋值的变量状态为 undefined；赋值后其值由所赋表达式确定',
    expectedOutput: '7\n',
  },

  // ==========================================================================
  // 6.8.2.3 过程语句
  // ==========================================================================

  {
    name: '6.8 无参过程语句激活过程块',
    code: `program test(output);
procedure hello;
begin
  writeln('hello');
end;
begin
  hello;
end.`,
    purpose: '6.8.2.3：过程语句指定激活与其过程标识符关联的过程块',
    expectedOutput: 'hello\n',
  },
  {
    name: '6.8 过程语句实参与形参按位置对应',
    code: `program test(output);
procedure pair(a, b: char);
begin
  writeln(a, b);
end;
begin
  pair('x', 'y');
end.`,
    purpose: '6.8.2.3：实参与形参按各自列表中的位置一一对应且数量相等',
    expectedOutput: 'xy\n',
  },
  {
    name: '6.8 read 过程语句读取字符变量',
    code: `program test(input, output);
var c: char;
begin
  read(c);
  writeln(c);
end.`,
    purpose: '6.8.2.3 / 6.9.1：read-parameter-list 的过程标识符指称 required procedure read',
    input: 'Z',
    expectedOutput: 'Z\n',
  },
  {
    name: '6.8 readln 过程语句读取整数变量',
    code: `program test(input, output);
var i: integer;
begin
  readln(i);
  writeln(i);
end.`,
    purpose: '6.8.2.3 / 6.9.2：readln-parameter-list 的过程标识符指称 required procedure readln',
    input: '42',
    expectedOutput: '42\n',
  },
  {
    name: '6.8 write/writeln 过程语句输出字符与换行',
    code: `program test(output);
begin
  write('a');
  write('b');
  writeln;
  writeln('c');
end.`,
    purpose: '6.8.2.3 / 6.9.3：write/writeln-parameter-list 指称 required procedure write/writeln',
    expectedOutput: 'ab\nc\n',
  },

  // ==========================================================================
  // 6.8.2.4 goto 语句
  // ==========================================================================

  {
    name: '6.8 goto 向前跳转跳过语句',
    code: `program test(output);
label 10;
begin
  writeln('a');
  goto 10;
  writeln('b');
10:
  writeln('c');
end.`,
    purpose: '6.8.2.4 / 6.8.1 b)：label 与 goto 处于同一 statement-sequence，处理在 label 处继续',
    expectedOutput: 'a\nc\n',
  },
  {
    name: '6.8 goto 向后跳转构成循环',
    code: `program test(output);
label 20;
var i: integer;
begin
  i := 0;
20:
  i := i + 1;
  writeln(i);
  if i < 3 then
    goto 20;
end.`,
    purpose: '6.8.2.4：goto 使处理在 label 所指程序点继续，可向后构成循环',
    expectedOutput: '1\n2\n3\n',
  },
  {
    name: '6.8 goto 到包含它的语句中的 label（判据 a）',
    code: `program test(output);
label 30;
var i: integer;
begin
  i := 0;
30:
  begin
    i := i + 1;
    writeln(i);
    if i < 3 then
      goto 30;
  end;
  writeln('done');
end.`,
    purpose: '6.8.1 a)：label 前缀的语句 S 包含 goto，故该 label 允许作为目标',
    expectedOutput: '1\n2\n3\ndone\n',
  },
  {
    name: '6.8 goto 到所在块顶层 label（判据 c，goto 位于嵌套复合语句内）',
    code: `program test(output);
label 40;
begin
  writeln('outer');
  begin
    writeln('inner');
    goto 40;
  end;
  writeln('skipped');
40:
  writeln('label');
end.`,
    purpose: '6.8.1 c)：label 前缀块 statement-part 复合语句中的语句，块内任意位置的 goto 均可引用',
    expectedOutput: 'outer\ninner\nlabel\n',
  },
  {
    name: '6.8 goto 可跳出 while 循环',
    code: `program test(output);
label 50;
var i: integer;
begin
  i := 0;
  while i < 10 do
  begin
    i := i + 1;
    if i = 3 then
      goto 50;
    writeln(i);
  end;
50:
  writeln('done');
end.`,
    purpose: '6.8.2.4：goto 跳到循环外的 label，终止循环语句的执行',
    expectedOutput: '1\n2\ndone\n',
  },
  {
    name: '6.8 goto 可跳出 for 循环',
    code: `program test(output);
label 60;
var i: integer;
begin
  for i := 1 to 5 do
  begin
    writeln(i);
    if i = 2 then
      goto 60;
  end;
60:
  writeln('done');
end.`,
    purpose: '6.8.2.4：goto 跳出 for 语句（属"被 goto 离开"的情形，控制变量状态不再受约束）',
    expectedOutput: '1\n2\ndone\n',
  },
  {
    name: '6.8 goto 可跳出 repeat 循环',
    code: `program test(output);
label 70;
var i: integer;
begin
  i := 0;
  repeat
    i := i + 1;
    writeln(i);
    if i = 3 then
      goto 70;
  until false;
70:
  writeln('done');
end.`,
    purpose: '6.8.2.4：goto 跳出 repeat 语句，终止其重复执行',
    expectedOutput: '1\n2\n3\ndone\n',
  },
  {
    name: '6.8 goto 跳出嵌套循环',
    code: `program test(output);
label 80;
var i, j: integer;
begin
  for i := 1 to 3 do
    for j := 1 to 3 do
    begin
      write(i, j, ' ');
      if (i = 2) and (j = 1) then
        goto 80;
    end;
80:
  writeln('end');
end.`,
    purpose: '6.8.2.4：goto 一次跳出两层 for 循环，终止其间所有激活',
    expectedOutput: '11 12 13 21 end\n',
  },
  {
    name: '6.8 goto 不可跳到未声明的 label',
    code: `program test;
begin
  goto 999;
end.`,
    purpose: '6.8.2.4 / 6.2.1：goto 的 label 必须在某 label-declaration-part 中声明',
    expectedError: '',
  },
  {
    name: '6.8 label 须在 label-declaration-part 中声明',
    code: `program test(output);
begin
140:
  writeln('ok');
end.`,
    purpose: '6.2.1：block 中出现的语句 label 须在 label-declaration-part 声明',
    expectedError: '',
  },
  {
    name: '6.8 同一 label 不得前缀两个语句',
    code: `program test(output);
label 100;
begin
100:
  writeln('first');
100:
  writeln('second');
end.`,
    purpose: '6.2.1：块须 closest-contain 恰好一个带该 label 的语句，重复前缀非法',
    expectedError: '',
  },
  {
    name: '6.8 声明但未使用的 label 合法',
    code: `program test(output);
label 110;
begin
  writeln('ok');
end.`,
    purpose: '6.2.1：label 声明后可以没有对应的语句前缀与 goto 使用',
    expectedOutput: 'ok\n',
  },
  {
    name: '6.8 goto 不可跳到 if 分支内的 label',
    code: `program test(output);
label 120;
begin
  goto 120;
  if false then
    begin
120:
      writeln('inside');
    end;
  writeln('after');
end.`,
    purpose: '6.8.1：label 既不在 goto 所在 statement-sequence 内，也不在块 statement-part 顶层，故不可达',
    expectedError: '',
  },
  {
    name: '6.8 goto 不可跳到 while 循环体内的 label',
    code: `program test;
label 130;
var i: integer;
begin
  i := 0;
  while i < 3 do
    130: i := i + 1;
  goto 130;
end.`,
    purpose: '6.8.1：label 在 while 语句体（非块 statement-part 顶层、非同一 statement-sequence）内，不可达',
    expectedError: '',
  },
  {
    name: '6.8 goto 与 label 处于同一 statement-sequence（if 分支内）合法',
    code: `program test(output);
label 140;
var d: integer;
begin
  d := 0;
  if d = 0 then
  begin
    goto 140;
140:
    d := 1;
  end;
  writeln('done', d);
end.`,
    purpose: '6.8.1 b)：label 前缀的语句与 goto 处于同一 statement-sequence，故允许',
    expectedOutput: 'done1\n',
  },
  {
    name: '6.8 从内层过程 goto 到主程序顶层 label（终止中间激活）',
    code: `program test(output);
label 150;
procedure outer;
procedure inner;
begin
  writeln('inner');
  goto 150;
  writeln('never inner');
end;
begin
  writeln('outer');
  inner;
  writeln('never outer');
end;
begin
  writeln('main');
  outer;
  writeln('never main');
150:
  writeln('label');
end.`,
    purpose: '6.8.2.4 / 6.8.1 c)：goto 终止除含程序点的激活及包裹它的激活外的所有激活',
    expectedOutput: 'main\nouter\ninner\nlabel\n',
  },
  {
    name: '6.8 从内层过程 goto 到外层过程顶层 label',
    code: `program test(output);
procedure outer;
label 160;
procedure inner;
begin
  writeln('inner');
  goto 160;
  writeln('never');
end;
begin
  inner;
  writeln('after inner');
160:
  writeln('label 160');
end;
begin
  outer;
end.`,
    purpose: '6.8.1 NOTE 2 / c)：内层块的 goto 可引用外层块 statement-part 顶层的 label',
    expectedOutput: 'inner\nlabel 160\n',
  },
  {
    name: '6.8 goto 不可跳到另一过程内的 label',
    code: `program test(output);
procedure p1;
label 170;
begin
170:
  writeln('p1');
end;
procedure p2;
begin
  goto 170;
end;
begin
  p2;
end.`,
    purpose: '6.8.1：label 不在 goto 所在块或其外层块中，不可达',
    expectedError: '',
  },
  {
    name: '6.8 主程序 goto 不可跳到过程内的 label',
    code: `program test(output);
procedure p;
label 180;
begin
180:
  writeln('p');
end;
begin
  goto 180;
end.`,
    purpose: '6.8.1：goto 不得进入一个块去引用其内部 label',
    expectedError: '',
  },
  {
    name: '6.8 函数中 goto 到函数块顶层 label',
    code: `program test(output);
function f: integer;
label 190;
begin
  goto 190;
  f := 1;
190:
  f := 2;
end;
begin
  writeln(f);
end.`,
    purpose: '6.8.1 c)：函数块内 goto 可引用该函数块 statement-part 顶层的 label',
    expectedOutput: '2\n',
  },

  // ==========================================================================
  // 6.8.3.2 复合语句
  // ==========================================================================

  {
    name: '6.8 复合语句按文本顺序执行 statement-sequence',
    code: `program test(output);
var a: integer;
begin
  a := 1;
  writeln(a);
  a := a + 1;
  writeln(a);
  a := a + 1;
  writeln(a);
end.`,
    purpose: '6.8.3.1 / 6.8.3.2：statement-sequence 按文本顺序执行（除 goto 修改外）',
    expectedOutput: '1\n2\n3\n',
  },
  {
    name: '6.8 复合语句可嵌套',
    code: `program test(output);
begin
  writeln('a');
  begin
    writeln('b');
    begin
      writeln('c');
    end;
  end;
  writeln('d');
end.`,
    purpose: '6.8.3.2：复合语句本身是语句，可出现在另一复合语句的 statement-sequence 中',
    expectedOutput: 'a\nb\nc\nd\n',
  },

  // ==========================================================================
  // 6.8.3.4 if 语句
  // ==========================================================================

  {
    name: '6.8 if 条件为真时执行 then 的语句',
    code: `program test(output);
var x: integer;
begin
  x := 1;
  if x > 0 then
    writeln('positive');
end.`,
    purpose: '6.8.3.4：Boolean-expression 为 true 时执行 if 语句的语句',
    expectedOutput: 'positive\n',
  },
  {
    name: '6.8 if 条件为假时不执行 then 的语句',
    code: `program test(output);
var x: integer;
begin
  x := -1;
  if x > 0 then
    writeln('positive');
  writeln('done');
end.`,
    purpose: '6.8.3.4：Boolean-expression 为 false 且无 else-part 时，不执行任何分支',
    expectedOutput: 'done\n',
  },
  {
    name: '6.8 if-then-else 条件为真执行 then',
    code: `program test(output);
var x: integer;
begin
  x := 10;
  if x > 5 then
    writeln('greater')
  else
    writeln('less');
end.`,
    purpose: '6.8.3.4：条件为 true 时执行 then 的语句，不执行 else-part',
    expectedOutput: 'greater\n',
  },
  {
    name: '6.8 if-then-else 条件为假执行 else',
    code: `program test(output);
var x: integer;
begin
  x := 3;
  if x > 5 then
    writeln('greater')
  else
    writeln('less');
end.`,
    purpose: '6.8.3.4：条件为 false 时执行 else-part 的语句',
    expectedOutput: 'less\n',
  },
  {
    name: '6.8 else 与最近的未配对 then 配对',
    code: `program test(output);
var a, b: boolean;
begin
  a := true;
  b := false;
  if a then
    if b then
      writeln('a-then-b-then')
    else
      writeln('a-then-b-else');
end.`,
    purpose: '6.8.3.4 NOTE：else-part 与最近的前一个未配对 then 配对',
    expectedOutput: 'a-then-b-else\n',
  },
  {
    name: '6.8 用复合语句使无 else 的 if 不紧接 else',
    code: `program test(output);
var a: boolean;
begin
  a := true;
  if a then
    begin
      if false then
        writeln('inner');
    end
  else
    writeln('outer else');
  writeln('done');
end.`,
    purpose: '6.8.3.4：以 begin..end 结束内层无 else 的 if，使 else 与外层 then 配对',
    expectedOutput: 'done\n',
  },
  {
    name: '6.8 if 的条件须是 Boolean 表达式',
    code: `program test(output);
var x: integer;
begin
  x := 1;
  if x then
    writeln('x');
end.`,
    purpose: '6.8.3.4：if 的 Boolean-expression 须为 Boolean 类型，integer 作条件不合法',
    expectedError: '',
  },
  {
    name: '6.8 if 与布尔运算符组合的条件',
    code: `program test(output);
var a, b, c: integer;
begin
  a := 5;
  b := 3;
  c := 7;
  if (a > b) and (c > b) then
    writeln('and ok');
  if (a > 10) or (b < 10) then
    writeln('or ok');
end.`,
    purpose: '6.8.3.4：if 的条件可为含 and/or 的 Boolean 表达式',
    expectedOutput: 'and ok\nor ok\n',
  },
  {
    name: '6.8 循环体中的 if 语句',
    code: `program test(output);
var i: integer;
begin
  for i := 1 to 4 do
    if i mod 2 = 0 then
      writeln(i);
end.`,
    purpose: '6.8.3.4：if 语句可作为 for 语句体的语句',
    expectedOutput: '2\n4\n',
  },
  {
    name: '6.8 过程体中的 if-then-else',
    code: `program test(output);
procedure check(n: integer);
begin
  if n > 0 then
    writeln('positive')
  else
    writeln('non-positive');
end;
begin
  check(5);
  check(-3);
end.`,
    purpose: '6.8.3.4：if 语句出现在过程块 statement-part 中',
    expectedOutput: 'positive\nnon-positive\n',
  },

  // ==========================================================================
  // 6.8.3.5 case 语句
  // ==========================================================================

  {
    name: '6.8 case 执行含 case-index 值的 case-list-element',
    code: `program test(output);
var x: integer;
begin
  x := 2;
  case x of
    1: writeln('one');
    2: writeln('two');
    3: writeln('three');
  end;
end.`,
    purpose: '6.8.3.5：case-index 的值指定执行 closest-containing 相应 case-constant 的语句',
    expectedOutput: 'two\n',
  },
  {
    name: '6.8 case 常量列表可含多个常量',
    code: `program test(output);
var x: integer;
begin
  x := 3;
  case x of
    1, 2: writeln('low');
    3, 4: writeln('high');
  end;
end.`,
    purpose: '6.8.3.5：case-constant-list 可含多个 case 常量',
    expectedOutput: 'high\n',
  },
  {
    name: '6.8 case 分支可为复合语句',
    code: `program test(output);
var x: integer;
begin
  x := 2;
  case x of
    1:
      begin
        writeln('one');
      end;
    2:
      begin
        writeln('two');
        writeln('again');
      end;
  end;
end.`,
    purpose: '6.8.3.5：case-list-element 的语句可为复合语句',
    expectedOutput: 'two\nagain\n',
  },
  {
    name: '6.8 case-index 只求值一次',
    code: `program test(output);
var n: integer;
function f: integer;
begin
  n := n + 1;
  f := 2;
end;
begin
  n := 0;
  case f of
    1: writeln('one');
    2: writeln('two');
  end;
  writeln(n);
end.`,
    purpose: '6.8.3.5：执行 case 语句时 case-index 求值一次',
    expectedOutput: 'two\n1\n',
  },
  {
    name: '6.8 case 可用于字符序数类型',
    code: `program test(output);
var c: char;
begin
  c := 'b';
  case c of
    'a': writeln('A');
    'b': writeln('B');
    'c': writeln('C');
  end;
end.`,
    purpose: '6.8.3.5：case 常量须为与 case-index 相同的序数类型，char 类型适用',
    expectedOutput: 'B\n',
  },
  {
    name: '6.8 case 常量必须互异',
    code: `program test(output);
var x: integer;
begin
  x := 1;
  case x of
    1: writeln('a');
    1: writeln('b');
  end;
end.`,
    purpose: '6.8.3.5：各 case-constant-list 的 case 常量所表示的值须互异，重复非法',
    expectedError: '',
  },
  {
    name: '6.8 case-index 无匹配 case 常量时为错误',
    code: `program test(output);
var x: integer;
begin
  x := 10;
  case x of
    1: writeln('one');
    2: writeln('two');
  end;
  writeln('done');
end.`,
    purpose:
      '【乙类·D.51】6.8.3.5：进入 case 语句时必有一个 case 常量等于 case-index 值，否则为错误——designated error，§5.1 f) 允许在随附文档中声明不报告；本处理器选择检出并报告',
    expectedError: '',
  },
  {
    name: '6.8 嵌套 case',
    code: `program test(output);
var x, y: integer;
begin
  x := 1;
  y := 2;
  case x of
    1:
      case y of
        1: writeln('1-1');
        2: writeln('1-2');
      end;
    2: writeln('2');
  end;
end.`,
    purpose: '6.8.3.5：case-list-element 的语句可为另一 case 语句',
    expectedOutput: '1-2\n',
  },
  {
    name: '6.8 循环中的 case 按 case-index 选择分支',
    code: `program test(output);
var i: integer;
begin
  for i := 1 to 4 do
    case i of
      1: writeln('a');
      2, 4: writeln('b');
      3: writeln('c');
    end;
end.`,
    purpose: '6.8.3.5：case 语句可作为 for 语句体的语句，每次按 case-index 选择分支',
    expectedOutput: 'a\nb\nc\nb\n',
  },

  // ==========================================================================
  // 6.8.3.7 repeat 语句
  // ==========================================================================

  {
    name: '6.8 repeat 至少执行一次（条件初始即为真）',
    code: `program test(output);
var i: integer;
begin
  i := 10;
  repeat
    writeln('once');
    i := i + 1;
  until i > 5;
end.`,
    purpose: '6.8.3.7：Boolean-expression 在 statement-sequence 执行后求值，故至少执行一次',
    expectedOutput: 'once\n',
  },
  {
    name: '6.8 repeat 重复执行直到条件为真',
    code: `program test(output);
var i: integer;
begin
  i := 0;
  repeat
    i := i + 1;
    writeln(i);
  until i >= 3;
end.`,
    purpose: '6.8.3.7：statement-sequence 重复执行，直到 Boolean-expression 为 true',
    expectedOutput: '1\n2\n3\n',
  },
  {
    name: '6.8 repeat 的 statement-sequence 可含多条语句',
    code: `program test(output);
var i, s: integer;
begin
  i := 0;
  s := 0;
  repeat
    i := i + 1;
    s := s + i;
  until i >= 4;
  writeln(s);
end.`,
    purpose: '6.8.3.7：repeat 的 statement-sequence 可含多条以分号分隔的语句',
    expectedOutput: '10\n',
  },
  {
    name: '6.8 嵌套 repeat',
    code: `program test(output);
var i, j: integer;
begin
  i := 0;
  repeat
    i := i + 1;
    j := 0;
    repeat
      j := j + 1;
      write('*');
    until j >= i;
    writeln;
  until i >= 2;
end.`,
    purpose: '6.8.3.7：repeat 语句可嵌套，内层重复次数依赖外层当前状态',
    expectedOutput: '*\n**\n',
  },

  // ==========================================================================
  // 6.8.3.8 while 语句
  // ==========================================================================

  {
    name: '6.8 while 条件初始为假时语句不执行',
    code: `program test(output);
var i: integer;
begin
  i := 5;
  while i < 5 do
    writeln('never');
  writeln('done');
end.`,
    purpose: '6.8.3.8：while 等价展开首先判断条件，为 false 时语句不执行',
    expectedOutput: 'done\n',
  },
  {
    name: '6.8 while 重复执行直到条件为假',
    code: `program test(output);
var i: integer;
begin
  i := 0;
  while i < 3 do
  begin
    i := i + 1;
    writeln(i);
  end;
end.`,
    purpose: '6.8.3.8：while 语句体重复执行直到 Boolean-expression 为 false',
    expectedOutput: '1\n2\n3\n',
  },
  {
    name: '6.8 while 的布尔表达式每次迭代前重新求值',
    code: `program test(output);
var n: integer;
function cond: boolean;
begin
  n := n + 1;
  cond := n < 4;
end;
begin
  n := 0;
  while cond do
    writeln(n);
end.`,
    purpose: '6.8.3.8：按等价展开，每次重复前重新求值 Boolean-expression',
    expectedOutput: '1\n2\n3\n',
  },
  {
    name: '6.8 嵌套 while',
    code: `program test(output);
var i, j: integer;
begin
  i := 0;
  while i < 2 do
  begin
    i := i + 1;
    j := 0;
    while j < 2 do
    begin
      j := j + 1;
      write('x');
    end;
    writeln;
  end;
end.`,
    purpose: '6.8.3.8：while 语句可嵌套',
    expectedOutput: 'xx\nxx\n',
  },
  {
    name: '6.8 过程体中的 while 循环',
    code: `program test(output);
procedure count(n: integer);
var i: integer;
begin
  i := 1;
  while i <= n do
  begin
    writeln(i);
    i := i + 1;
  end;
end;
begin
  count(3);
end.`,
    purpose: '6.8.3.8：while 语句出现在过程块 statement-part 中',
    expectedOutput: '1\n2\n3\n',
  },

  // ==========================================================================
  // 6.8.3.9 for 语句
  // ==========================================================================

  {
    name: '6.8 for-to 依次给控制变量赋递增值',
    code: `program test(output);
var i: integer;
begin
  for i := 1 to 3 do
    writeln(i);
end.`,
    purpose: '6.8.3.9：for-to 按等价展开对控制变量依次赋值并执行语句',
    expectedOutput: '1\n2\n3\n',
  },
  {
    name: '6.8 for-downto 依次给控制变量赋递减值',
    code: `program test(output);
var i: integer;
begin
  for i := 3 downto 1 do
    writeln(i);
end.`,
    purpose: '6.8.3.9：for-downto 按等价展开用 pred 递减控制变量',
    expectedOutput: '3\n2\n1\n',
  },
  {
    name: '6.8 for-to 初始值大于终止值时零次迭代',
    code: `program test(output);
var i: integer;
begin
  for i := 5 to 1 do
    writeln('never');
  writeln('done');
end.`,
    purpose: '6.8.3.9：for-to 等价展开中 initial-value > final-value 时语句不执行',
    expectedOutput: 'done\n',
  },
  {
    name: '6.8 for-downto 初始值小于终止值时零次迭代',
    code: `program test(output);
var i: integer;
begin
  for i := 1 downto 5 do
    writeln('never');
  writeln('done');
end.`,
    purpose: '6.8.3.9：for-downto 等价展开中 initial-value < final-value 时语句不执行',
    expectedOutput: 'done\n',
  },
  {
    name: '6.8 for-to 初始值等于终止值时迭代一次',
    code: `program test(output);
var i: integer;
begin
  for i := 2 to 2 do
    writeln(i);
end.`,
    purpose: '6.8.3.9：initial-value = final-value 时语句恰好执行一次',
    expectedOutput: '2\n',
  },
  {
    name: '6.8 for 的 initial-value 与 final-value 各求值一次',
    code: `program test(output);
var i, n: integer;
begin
  n := 3;
  for i := 1 to n do
  begin
    writeln('x');
    n := 1;
  end;
end.`,
    purpose: '6.8.3.9：等价展开将 final-value 先存入辅助变量，故循环中改变 n 不影响迭代次数',
    expectedOutput: 'x\nx\nx\n',
  },
  {
    name: '6.8 for 的控制变量须为整个变量',
    code: `program test(output);
var a: array[1..3] of integer;
begin
  for a[1] := 1 to 3 do
    writeln('x');
end.`,
    purpose: '6.8.3.9：control-variable 语法上须为 entire-variable，下标变量不合法',
    expectedError: '',
  },
  {
    name: '6.8 for 结束后控制变量为 undefined，其后可重新赋值',
    code: `program test(output);
var i: integer;
begin
  for i := 1 to 2 do
    writeln('x');
  i := 9;
  writeln(i);
end.`,
    purpose: '6.8.3.9：for 语句执行后（非 goto 离开）控制变量为 undefined，可在语句外重新赋值',
    expectedOutput: 'x\nx\n9\n',
  },
  {
    name: '6.8 for 的控制变量可为子界序数类型',
    code: `program test(output);
var i: 1..5;
begin
  for i := 1 to 3 do
    writeln(i);
end.`,
    purpose: '6.8.3.9：control-variable 须具序数类型，子界类型满足此要求',
    expectedOutput: '1\n2\n3\n',
  },
  {
    name: '6.8 嵌套 for',
    code: `program test(output);
var i, j: integer;
begin
  for i := 1 to 2 do
  begin
    for j := 1 to 2 do
      write('*');
    writeln;
  end;
end.`,
    purpose: '6.8.3.9：for 语句可嵌套',
    expectedOutput: '**\n**\n',
  },
  {
    name: '6.8 过程体中的 for 循环求和',
    code: `program test(output);
procedure sum(n: integer);
var i, s: integer;
begin
  s := 0;
  for i := 1 to n do
    s := s + i;
  writeln(s);
end;
begin
  sum(5);
end.`,
    purpose: '6.8.3.9：for 语句出现在过程块 statement-part 中，语句体为赋值语句',
    expectedOutput: '15\n',
  },

  // ==========================================================================
  // 6.8.3.10 with 语句
  // ==========================================================================

  {
    name: '6.8 with 使字段标识符指称记录变量的分量',
    code: `program test(output);
type
  point = record
    x: integer;
    y: integer;
  end;
var
  p: point;
begin
  p.x := 10;
  p.y := 20;
  with p do
  begin
    writeln(x);
    writeln(y);
    x := 30;
  end;
  writeln(p.x);
end.`,
    purpose: '6.8.3.10：with 的单记录变量定义各字段标识符为 field-designator-identifier',
    expectedOutput: '10\n20\n30\n',
  },
  {
    name: '6.8 with 可含多个记录变量（等价于嵌套 with）',
    code: `program test(output);
type
  inner = record
    a: integer;
  end;
  outer = record
    b: integer;
    i: inner;
  end;
var
  o: outer;
begin
  o.b := 1;
  o.i.a := 2;
  with o, o.i do
  begin
    writeln(b);
    writeln(a);
  end;
end.`,
    purpose: '6.8.3.10：with v1,v2 do s 等价于 with v1 do with v2 do s',
    expectedOutput: '1\n2\n',
  },
  {
    name: '6.8 嵌套 with 中内层字段标识符遮蔽外层同名字段',
    code: `program test(output);
type
  inner = record
    v: integer;
  end;
  outer = record
    v: integer;
    i: inner;
  end;
var
  o: outer;
begin
  o.v := 1;
  o.i.v := 2;
  with o do
  begin
    writeln(v);
    with i do
      writeln(v);
    writeln(v);
  end;
end.`,
    purpose: '6.8.3.10 / 6.2.2：内层 with 为字段标识符建立新的定义点，遮蔽外层同名字段',
    expectedOutput: '1\n2\n1\n',
  },
  {
    name: '6.8 with 的字段标识符优先于外层同名变量',
    code: `program test(output);
type
  r = record
    x: integer;
  end;
var
  x: integer;
  p: r;
begin
  x := 1;
  p.x := 2;
  with p do
    writeln(x);
  writeln(x);
end.`,
    purpose: '6.8.3.10：with 语句内字段标识符的定义点使同名外层变量被遮蔽',
    expectedOutput: '2\n1\n',
  },
  {
    name: '6.8 with 语句体内可嵌套 if 并修改字段',
    code: `program test(output);
type
  date = record
    month: integer;
    year: integer;
  end;
var
  d: date;
begin
  d.month := 12;
  d.year := 1999;
  with d do
    if month = 12 then
    begin
      month := 1;
      year := year + 1;
    end
    else
      month := month + 1;
  writeln(d.month);
  writeln(d.year);
end.`,
    purpose: '6.8.3.10 示例：with 语句体中字段标识符直接指称记录变量的分量',
    expectedOutput: '1\n2000\n',
  },
]

runPascalTests('ISO 7185 6.8 - Statements', tests)
