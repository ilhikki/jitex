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
//
// 状态：骨架文件，用例待从 tests/integration/ 迁移（迁移时仅改 name，内容不动）。

import { describe } from './harness.ts'
import { type PascalTest, runPascalTests } from './harness.ts'

describe('ISO 7185 6.8 - Statements', () => {
  const tests: PascalTest[] = [
    {
      name: '6.8 if-then simple true',
      code: `program test;
var x: integer;
begin
  x := 5;
  if x > 0 then
    writeln('positive');
end.`,
      purpose: 'IF-THEN with true condition',
      expectedContains: 'positive',
    },
    {
      name: '6.8 if-then simple false',
      code: `program test;
var x: integer;
begin
  x := -5;
  if x > 0 then
    writeln('positive');
  writeln('done');
end.`,
      purpose: 'IF-THEN with false condition',
      expectedContains: 'done',
    },
    {
      name: '6.8 if-then-else true',
      code: `program test;
var x: integer;
begin
  x := 10;
  if x > 5 then
    writeln('greater')
  else
    writeln('less');
end.`,
      purpose: 'IF-THEN-ELSE with true condition',
      expectedContains: 'greater',
    },
    {
      name: '6.8 if-then-else false',
      code: `program test;
var x: integer;
begin
  x := 3;
  if x > 5 then
    writeln('greater')
  else
    writeln('less');
end.`,
      purpose: 'IF-THEN-ELSE with false condition',
      expectedContains: 'less',
    },
    {
      name: '6.8 nested if',
      code: `program test;
var x, y: integer;
begin
  x := 5;
  y := 3;
  if x > 0 then
    if y > 0 then
      writeln('both positive');
end.`,
      purpose: 'nested IF statements',
      expectedContains: 'both positive',
    },
    {
      name: '6.8 if-elseif via nested if',
      code: `program test;
var x: integer;
begin
  x := 2;
  if x = 1 then
    writeln('one')
  else
    if x = 2 then
      writeln('two')
    else
      writeln('other');
end.`,
      purpose: 'IF-ELSEIF simulated via nested IF',
      expectedContains: 'two',
    },
    {
      name: '6.8 if in loop',
      code: `program test;
var i: integer;
begin
  for i := 1 to 5 do
    if i mod 2 = 0 then
      writeln(i);
end.`,
      purpose: 'IF statement inside loop',
      expectedContains: '2',
    },
    {
      name: '6.8 if in procedure',
      code: `program test;
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
      purpose: 'IF statement in procedure',
      expectedContains: 'positive',
    },
    {
      name: '6.8 boolean expression as condition',
      code: `program test;
var b: boolean;
begin
  b := true;
  if b then
    writeln('true');
  b := false;
  if not b then
    writeln('not false');
end.`,
      purpose: 'boolean variable as condition',
      expectedContains: 'true',
    },
    {
      name: '6.8 complex condition expression',
      code: `program test;
var a, b, c: integer;
begin
  a := 5;
  b := 3;
  c := 7;
  if (a > b) and (c > b) then
    writeln('ok');
  if (a > 10) or (b < 10) then
    writeln('or ok');
end.`,
      purpose: 'complex logical expression as condition',
      expectedContains: 'ok',
    },
    {
      name: '6.8 while simple loop',
      code: `program test;
var i: integer;
begin
  i := 1;
  while i <= 3 do
  begin
    writeln(i);
    i := i + 1;
  end;
end.`,
      purpose: 'simple WHILE loop',
      expectedContains: '3',
    },
    {
      name: '6.8 while condition false initially',
      code: `program test;
var i: integer;
begin
  i := 5;
  while i < 5 do
    writeln('should not print');
  writeln('done');
end.`,
      purpose: 'WHILE loop with false condition does not execute',
      expectedContains: 'done',
    },
    {
      name: '6.8 while multiple iterations',
      code: `program test;
var i, sum: integer;
begin
  i := 1;
  sum := 0;
  while i <= 10 do
  begin
    sum := sum + i;
    i := i + 1;
  end;
  writeln(sum);
end.`,
      purpose: 'WHILE loop with multiple iterations',
      expectedContains: '55',
    },
    {
      name: '6.8 while in procedure',
      code: `program test;
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
      purpose: 'WHILE loop in procedure',
      expectedContains: '3',
    },
    {
      name: '6.8 nested while',
      code: `program test;
var i, j: integer;
begin
  i := 1;
  while i <= 2 do
  begin
    j := 1;
    while j <= 2 do
    begin
      writeln(i, ' ', j);
      j := j + 1;
    end;
    i := i + 1;
  end;
end.`,
      purpose: 'nested WHILE loops',
      expectedContains: '2 2',
    },
    {
      name: '6.8 while with break via goto',
      code: `program test;
label 10;
var i: integer;
begin
  i := 1;
  while i <= 10 do
  begin
    if i = 5 then
      goto 10;
    writeln(i);
    i := i + 1;
  end;
  10:
  writeln('exited');
end.`,
      purpose: 'WHILE loop with break using GOTO',
      expectedContains: 'exited',
    },
    {
      name: '6.8 for-to simple',
      code: `program test;
var i: integer;
begin
  for i := 1 to 3 do
    writeln(i);
end.`,
      purpose: 'simple FOR-TO loop',
      expectedContains: '3',
    },
    {
      name: '6.8 for-downto simple',
      code: `program test;
var i: integer;
begin
  for i := 3 downto 1 do
    writeln(i);
end.`,
      purpose: 'simple FOR-DOWNTO loop',
      expectedContains: '1',
    },
    {
      name: '6.8 for boundary values',
      code: `program test;
var i: integer;
begin
  for i := 1 to 1 do
    writeln('single');
  for i := 5 to 3 do
    writeln('should not print');
  writeln('done');
end.`,
      purpose: 'FOR loop boundary conditions',
      expectedContains: 'single',
    },
    {
      name: '6.8 for in procedure',
      code: `program test;
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
      purpose: 'FOR loop in procedure',
      expectedContains: '15',
    },
    {
      name: '6.8 nested for',
      code: `program test;
var i, j: integer;
begin
  for i := 1 to 2 do
    for j := 1 to 2 do
      writeln(i, ' ', j);
end.`,
      purpose: 'nested FOR loops',
      expectedContains: '2 2',
    },
    {
      name: '6.8 for variable after loop',
      code: `program test;
var i: integer;
begin
  for i := 1 to 5 do
    writeln(i);
  writeln('after: ', i);
end.`,
      purpose: 'FOR loop variable accessible after loop',
      expectedContains: 'after:',
    },
    {
      name: '6.8 repeat simple',
      code: `program test;
var i: integer;
begin
  i := 1;
  repeat
    writeln(i);
    i := i + 1;
  until i > 3;
end.`,
      purpose: 'simple REPEAT loop',
      expectedContains: '3',
    },
    {
      name: '6.8 repeat executes at least once',
      code: `program test;
var i: integer;
begin
  i := 10;
  repeat
    writeln('executed');
    i := i + 1;
  until i > 5;
end.`,
      purpose: 'REPEAT loop executes at least once',
      expectedContains: 'executed',
    },
    {
      name: '6.8 repeat multiple iterations',
      code: `program test;
var i, fact: integer;
begin
  i := 1;
  fact := 1;
  repeat
    fact := fact * i;
    i := i + 1;
  until i > 5;
  writeln(fact);
end.`,
      purpose: 'REPEAT loop with multiple iterations',
      expectedContains: '120',
    },
    {
      name: '6.8 repeat in procedure',
      code: `program test;
procedure countdown(n: integer);
var i: integer;
begin
  i := n;
  repeat
    writeln(i);
    i := i - 1;
  until i = 0;
end;
begin
  countdown(3);
end.`,
      purpose: 'REPEAT loop in procedure',
      expectedContains: '1',
    },
    {
      name: '6.8 nested repeat',
      code: `program test;
var i, j: integer;
begin
  i := 1;
  repeat
    j := 1;
    repeat
      writeln(i, ' ', j);
      j := j + 1;
    until j > 2;
    i := i + 1;
  until i > 2;
end.`,
      purpose: 'nested REPEAT loops',
      expectedContains: '2 2',
    },
    {
      name: '6.8 case simple',
      code: `program test;
var x: integer;
begin
  x := 2;
  case x of
    1: writeln('one');
    2: writeln('two');
    3: writeln('three');
  end;
end.`,
      purpose: 'simple CASE statement',
      expectedContains: 'two',
    },
    {
      name: '6.8 case multiple values',
      code: `program test;
var x: integer;
begin
  x := 3;
  case x of
    1, 2: writeln('low');
    3, 4, 5: writeln('medium');
    6, 7: writeln('high');
  end;
end.`,
      purpose: 'CASE statement with multiple values per case',
      expectedContains: 'medium',
    },
    {
      name: '6.8 case otherwise',
      code: `program test;
var x: integer;
begin
  x := 5;
  case x of
    1: writeln('one');
    2: writeln('two');
    otherwise writeln('other');
  end;
end.`,
      purpose: 'CASE statement with OTHERWISE clause',
      expectedContains: 'other',
    },
    {
      name: '6.8 case in loop',
      code: `program test;
var i: integer;
begin
  for i := 1 to 3 do
    case i of
      1: writeln('a');
      2: writeln('b');
      3: writeln('c');
    end;
end.`,
      purpose: 'CASE statement inside loop',
      expectedContains: 'c',
    },
    {
      name: '6.8 case in procedure',
      code: `program test;
procedure classify(n: integer);
begin
  case n of
    1: writeln('first');
    2: writeln('second');
    otherwise writeln('other');
  end;
end;
begin
  classify(1);
  classify(5);
end.`,
      purpose: 'CASE statement in procedure',
      expectedContains: 'first',
    },
    {
      name: '6.8 nested case',
      code: `program test;
var x, y: integer;
begin
  x := 1;
  y := 2;
  case x of
    1: case y of
         1: writeln('1-1');
         2: writeln('1-2');
       end;
    2: writeln('2');
  end;
end.`,
      purpose: 'nested CASE statements',
      expectedContains: '1-2',
    },
    {
      name: '6.8 loop with nested if',
      code: `program test;
var i: integer;
begin
  for i := 1 to 10 do
    if i mod 3 = 0 then
      writeln(i);
end.`,
      purpose: 'loop with nested IF for filtering',
      expectedContains: '9',
    },
    {
      name: '6.8 case with nested loop',
      code: `program test;
var x, i: integer;
begin
  x := 2;
  case x of
    1: for i := 1 to 2 do writeln('a', i);
    2: for i := 1 to 3 do writeln('b', i);
    otherwise writeln('other');
  end;
end.`,
      purpose: 'CASE statement with nested loop',
      expectedContains: 'b3',
    },
    {
      name: '6.8 recursion with loop',
      code: `program test;
function fact(n: integer): integer;
var i, f: integer;
begin
  f := 1;
  for i := 1 to n do
    f := f * i;
  fact := f;
end;
function fib(n: integer): integer;
begin
  if n <= 1 then
    fib := n
  else
    fib := fib(n-1) + fib(n-2);
end;
begin
  writeln(fact(5));
  writeln(fib(5));
end.`,
      purpose: 'recursion combined with loop',
      expectedContains: '120',
    },
    {
      name: '6.8 procedure call with control flow',
      code: `program test;
procedure check(n: integer);
begin
  if n > 0 then
    writeln('positive')
  else if n < 0 then
    writeln('negative')
  else
    writeln('zero');
end;
procedure loop(n: integer);
var i: integer;
begin
  for i := 1 to n do
    check(i);
end;
begin
  loop(3);
end.`,
      purpose: 'procedure calls with embedded control flow',
      expectedContains: 'positive',
    },
    {
      name: '6.8 while with if and break',
      code: `program test;
label 50;
var i: integer;
begin
  i := 1;
  while i <= 100 do
  begin
    if i = 5 then
      goto 50;
    writeln(i);
    i := i + 1;
  end;
  50:
  writeln('done');
end.`,
      purpose: 'WHILE loop with IF and GOTO break (Pascal82: 数字 label)',
      expectedNotContains: '5',
    },
    {
      name: '6.8 for loop with case',
      code: `program test;
var i: integer;
begin
  for i := 1 to 4 do
    case i of
      1: writeln('start');
      2: writeln('middle');
      3: writeln('middle');
      4: writeln('end');
    end;
end.`,
      purpose: 'FOR loop with CASE statement',
      expectedContains: 'end',
    },
    {
      name: '6.8 repeat with nested if',
      code: `program test;
var i: integer;
begin
  i := 1;
  repeat
    if i mod 2 = 1 then
      writeln(i);
    i := i + 1;
  until i > 5;
end.`,
      purpose: 'REPEAT loop with nested IF',
      expectedContains: '5',
    },
    {
      name: '6.8 if with complex expression',
      code: `program test;
var a, b, c, d: integer;
begin
  a := 10;
  b := 5;
  c := 3;
  d := 2;
  if (a > b) and (c > d) or (a < b) then
    writeln('true');
end.`,
      purpose: 'IF with complex logical expression',
      expectedContains: 'true',
    },
    {
      name: '6.8 case with no match',
      code: `program test;
var x: integer;
begin
  x := 10;
  case x of
    1: writeln('one');
    2: writeln('two');
  end;
  writeln('done');
end.`,
      purpose: 'CASE statement with no matching case',
      expectedContains: 'done',
    },
    {
      name: '6.8 for loop with step implicit',
      code: `program test;
var i, sum: integer;
begin
  sum := 0;
  for i := 2 to 8 do
    sum := sum + i;
  writeln(sum);
end.`,
      purpose: 'FOR loop sums numbers from 2 to 8 (Pascal82: 无 step，递增 +1)',
      expectedContains: '35',
    },
    {
      name: '6.8 while loop with boolean flag',
      code: `program test;
var flag: boolean;
    count: integer;
begin
  flag := true;
  count := 0;
  while flag do
  begin
    count := count + 1;
    if count = 3 then
      flag := false;
    writeln(count);
  end;
end.`,
      purpose: 'WHILE loop controlled by boolean flag',
      expectedContains: '3',
    },
    {
      name: '6.8 with-simple-record',
      code: `program test;
type
  Point = record
    x: integer;
    y: integer;
  end;
var
  p: Point;
begin
  p.x := 10;
  p.y := 20;
  with p do
    begin
      writeln(x);
      writeln(y);
    end;
end.`,
      purpose: 'WITH 语句访问记录字段',
      expectedContains: '10\n20',
    },
    {
      name: '6.8 with-assign-fields',
      code: `program test;
type
  Rect = record
    left: integer;
    top: integer;
    right: integer;
    bottom: integer;
  end;
var
  r: Rect;
begin
  with r do
    begin
      left := 1;
      top := 2;
      right := 3;
      bottom := 4;
    end;
  writeln(r.left);
  writeln(r.bottom);
end.`,
      purpose: 'WITH 语句中赋值记录字段',
      expectedContains: '1\n4',
    },
    {
      name: '6.8 nested-with-statements',
      code: `program test;
type
  Inner = record
    a: integer;
  end;
  Outer = record
    x: integer;
    inr: Inner;
  end;
var
  o: Outer;
begin
  o.x := 100;
  o.inr.a := 200;
  with o do
    with inr do
      begin
        writeln(x);
        writeln(a);
      end;
end.`,
      purpose: '嵌套 WITH 语句',
      expectedContains: '100\n200',
    },
    {
      name: '6.8 case-multi-value-branch',
      code: `program test;
var i: integer;
begin
  for i := 1 to 5 do
    case i of
      1, 3, 5: writeln('odd');
      2, 4: writeln('even');
    end;
end.`,
      purpose: 'CASE 语句多值分支',
      expectedContains: 'odd\neven\nodd\neven\nodd',
    },
    {
      name: '6.8 for-downto-negative',
      code: `program test;
var i: integer;
begin
  for i := -2 downto -5 do
    writeln(i);
end.`,
      purpose: 'FOR DOWNTO 负数范围',
      expectedContains: '-2\n-3\n-4\n-5',
    },
    {
      name: '6.8 for-to-zero-iterations',
      code: `program test;
var i: integer;
begin
  for i := 5 to 1 do
    writeln(i);
  writeln('done');
end.`,
      purpose: 'FOR TO 起始大于结束时零次迭代',
      expectedOutput: 'done\n',
    },
    {
      name: '6.8 repeat-until-true-first',
      code: `program test;
var i: integer;
begin
  i := 10;
  repeat
    writeln(i);
    i := i + 1;
  until i > 5;
end.`,
      purpose: 'REPEAT 条件一开始就满足（至少执行一次）',
      expectedContains: '10',
      expectedNotContains: '11',
    },
    {
      name: '6.8 empty-statement',
      code: `program test;
var i: integer;
begin
  i := 1;
  ;
  i := i + 1;
  ;
  writeln(i);
end.`,
      purpose: '空语句',
      expectedContains: '2',
    },
    {
      name: '6.8 if-without-else-false',
      code: `program test;
var x: integer;
begin
  x := 0;
  if false then
    x := 1;
  writeln(x);
end.`,
      purpose: 'IF 无 ELSE 且条件为假',
      expectedContains: '0',
    },

    {
      name: '6.8 goto-basic-same-procedure',
      code: `program test;
label 100;
begin
  writeln('Before');
  goto 100;
  writeln('Skipped');
100:
  writeln('After');
end.`,
      purpose: 'GOTO to label in same procedure',
      expectedContains: 'Before\nAfter',
      expectedNotContains: 'Skipped',
    },
    {
      name: '6.8 goto-basic-forward',
      code: `program test;
label 200;
begin
  goto 200;
  writeln('First');
200:
  writeln('Second');
end.`,
      purpose: 'GOTO forward jump',
      expectedContains: 'Second',
      expectedNotContains: 'First',
    },
    {
      name: '6.8 goto-basic-backward',
      code: `program test;
label 100;
var i: integer;
begin
  i := 0;
100:
  i := i + 1;
  writeln(i);
  if i < 3 then goto 100;
end.`,
      purpose: 'GOTO backward jump',
      expectedContains: '1\n2\n3',
    },
    {
      name: '6.8 goto-basic-skip-statements',
      code: `program test;
label 300;
begin
  writeln('A');
  goto 300;
  writeln('B');
  writeln('C');
300:
  writeln('D');
end.`,
      purpose: 'GOTO skip multiple statements',
      expectedContains: 'A\nD',
      expectedNotContains: 'B\nC',
    },
    {
      name: '6.8 goto-basic-outside-loop',
      code: `program test;
label 400;
var i: integer;
begin
  i := 0;
  while i < 10 do
  begin
    i := i + 1;
    if i = 5 then goto 400;
    writeln(i);
  end;
400:
  writeln('Exit');
end.`,
      purpose: 'GOTO jump out of loop',
      expectedContains: '1\n2\n3\n4\nExit',
      expectedNotContains: '5\n6\n7\n8\n9\n10',
    },
    {
      name: '6.8 goto-basic-into-loop',
      code: `program test;
label 500;
var x: integer;
begin
  x := 1;
  goto 500;
  x := 2;
500:
  writeln(x);
end.`,
      purpose: 'GOTO jump into loop area',
      expectedContains: '1',
      expectedNotContains: '2',
    },
    {
      name: '6.8 label-single',
      code: `program test;
label 10;
begin
10:
  writeln('Label 10');
end.`,
      purpose: 'Single label declaration',
      expectedContains: 'Label 10',
    },
    {
      name: '6.8 label-multiple',
      code: `program test;
label 10, 20;
begin
  goto 20;
10:
  writeln('Label 10');
20:
  writeln('Label 20');
end.`,
      purpose: 'Multiple labels in same procedure',
      expectedContains: 'Label 20',
      expectedNotContains: 'Label 10',
    },
    {
      name: '6.8 label-max-value',
      code: `program test;
label 9999;
begin
  goto 9999;
  writeln('Skipped');
9999:
  writeln('Label 9999');
end.`,
      purpose: 'Label with maximum value 9999',
      expectedContains: 'Label 9999',
      expectedNotContains: 'Skipped',
    },
    {
      name: '6.8 label-zero',
      code: `program test;
label 0;
begin
  goto 0;
  writeln('Before');
0:
  writeln('Label 0');
end.`,
      purpose: 'Label with value 0',
      expectedContains: 'Label 0',
      expectedNotContains: 'Before',
    },
    {
      name: '6.8 label-same-as-variable',
      code: `program test;
label 100;
var lbl: integer;
begin
  lbl := 42;
  writeln(lbl);
100:
  writeln('Label 100');
end.`,
      purpose: 'Label coexists with variable of same name（Pascal82: label 是关键字，不能作变量名）',
      expectedContains: '42\nLabel 100',
    },
    {
      name: '6.8 goto-control-if-then',
      code: `program test;
label 100;
var x: integer;
begin
  x := 1;
  if x = 1 then
  begin
    goto 100;
    writeln('Inside if');
  end;
  writeln('After if');
100:
  writeln('After goto');
end.`,
      purpose: 'GOTO out of IF-THEN block',
      expectedContains: 'After goto',
      expectedNotContains: 'Inside if\nAfter if',
    },
    {
      name: '6.8 goto-control-if-then-else',
      code: `program test;
label 200;
var x: integer;
begin
  x := 0;
  if x > 0 then
    writeln('Then')
  else
  begin
    goto 200;
    writeln('Else');
  end;
  writeln('After if');
200:
  writeln('After goto');
end.`,
      purpose: 'GOTO out of IF-THEN-ELSE block',
      expectedContains: 'After goto',
      expectedNotContains: 'Then\nElse\nAfter if',
    },
    {
      name: '6.8 goto-control-while',
      code: `program test;
label 300;
var i: integer;
begin
  i := 0;
  while i < 10 do
  begin
    i := i + 1;
    writeln(i);
    if i = 3 then goto 300;
  end;
300:
  writeln('Exit while');
end.`,
      purpose: 'GOTO out of WHILE loop',
      expectedContains: '1\n2\n3\nExit while',
      expectedNotContains: '4\n5\n6\n7\n8\n9\n10',
    },
    {
      name: '6.8 goto-control-for',
      code: `program test;
label 400;
var i: integer;
begin
  for i := 1 to 10 do
  begin
    writeln(i);
    if i = 4 then goto 400;
  end;
400:
  writeln('Exit for');
end.`,
      purpose: 'GOTO out of FOR loop',
      expectedContains: '1\n2\n3\n4\nExit for',
      expectedNotContains: '5\n6\n7\n8\n9\n10',
    },
    {
      name: '6.8 goto-control-repeat',
      code: `program test;
label 500;
var i: integer;
begin
  i := 0;
  repeat
    i := i + 1;
    writeln(i);
    if i = 5 then goto 500;
  until false;
500:
  writeln('Exit repeat');
end.`,
      purpose: 'GOTO out of REPEAT loop',
      expectedContains: '1\n2\n3\n4\n5\nExit repeat',
      expectedNotContains: '6\n7\n8\n9\n10',
    },
    {
      name: '6.8 goto-control-case',
      code: `program test;
label 600;
var x: integer;
begin
  x := 2;
  case x of
    1: writeln('One');
    2:
    begin
      goto 600;
      writeln('Two');
    end;
    3: writeln('Three');
  end;
  writeln('After case');
600:
  writeln('After goto');
end.`,
      purpose: 'GOTO out of CASE statement',
      expectedContains: 'After goto',
      expectedNotContains: 'Two\nAfter case',
    },
    {
      name: '6.8 goto-control-case-internal',
      code: `program test;
label 700;
var x: integer;
begin
  x := 1;
  case x of
    1:
    begin
      goto 700;
      writeln('Case 1');
    end;
    2: writeln('Case 2');
  end;
700:
  writeln('Label 700');
end.`,
      purpose: 'GOTO within CASE statement',
      expectedContains: 'Label 700',
      expectedNotContains: 'Case 1',
    },
    {
      name: '6.8 goto-control-nested-loops',
      code: `program test;
label 800;
var i, j: integer;
begin
  for i := 1 to 3 do
    for j := 1 to 3 do
    begin
      writeln('i=', i, ' j=', j);
      if (i = 2) and (j = 2) then goto 800;
    end;
800:
  writeln('Exit nested loops');
end.`,
      purpose: 'GOTO out of nested loops',
      expectedContains: 'i=1 j=1\ni=1 j=2\ni=1 j=3\ni=2 j=1\ni=2 j=2\nExit nested loops',
      expectedNotContains: 'i=2 j=3\ni=3',
    },
    {
      name: '6.8 goto-error-nonexistent-label',
      code: `program test;
begin
  goto 999;
end.`,
      purpose: 'GOTO to non-existent label should error',
      expectedError: '',
    },
    {
      name: '6.8 goto-error-cross-procedure',
      code: `program test;
label 100;
procedure p;
begin
  goto 100;
end;
begin
  writeln('Main');
  p;
  writeln('Skip');
  100:
end.`,
      purpose: 'GOTO to label in parent procedure should ok',
      expectedNotContains: 'Skip',
      expectedContains: 'Main',
    },
    {
      name: '6.8 goto-from-procedure-to-main-label',
      code: `program test;
label 200;
procedure p;
begin
  goto 200;
end;
begin
  p;
200:
  writeln('Main');
end.`,
      purpose: 'GOTO from procedure to main program label (ISO 7185 允许：goto 可以跳到外层 block 的 label)',
      expectedContains: 'Main',
    },
    {
      name: '6.8 goto-error-from-outer-to-nested-procedure',
      code: `program test;
label 300;
procedure outer;
  procedure inner;
  begin
  300:
    writeln('Inner');
  end;
begin
  goto 300;
end;
begin
  outer;
end.`,
      purpose: 'GOTO from outer to nested procedure label should error',
      expectedError: '',
    },
    {
      name: '6.8 goto-error-no-label',
      code: `program test;
begin
  goto;
end.`,
      purpose: 'GOTO without label should error',
      expectedError: '',
    },
    {
      name: '6.8 goto-error-duplicate-label',
      code: `program test;
label 100;
begin
100:
  writeln('First');
100:
  writeln('Second');
end.`,
      purpose: 'Duplicate label declaration should error',
      expectedError: '',
    },
    {
      name: '6.8 goto-in-function',
      code: `program test;
function f: integer;
label 10;
begin
  goto 10;
  f := 1;
10:
  f := 2;
end;
begin
  writeln(f);
end.`,
      purpose: 'GOTO in function',
      expectedContains: '2',
      expectedNotContains: '1',
    },
    {
      name: '6.8 goto-in-nested-function',
      code: `program test;
function outer: integer;
  label 10;
  function inner: integer;
    label 20;
    begin
      goto 20;
      inner := 1;
    20:
      inner := 3;
    end;
  begin
    goto 10;
    outer := 0;
  10:
    outer := inner;
  end;
begin
  writeln(outer);
end.`,
      purpose: 'GOTO in nested function',
      expectedContains: '3',
      expectedNotContains: '0\n1',
    },
    {
      name: '6.8 goto-recursion-procedure',
      code: `program test;
var count: integer;
procedure rec;
label 10, 20;
begin
  count := count + 1;
  writeln(count);
  if count < 3 then goto 10;
  goto 20;
10:
  rec;
20:
end;
begin
  count := 0;
  rec;
end.`,
      purpose: 'GOTO in recursive procedure（Pascal82: 无 exit，用 goto 跳转）',
      expectedContains: '1\n2\n3',
    },
    {
      name: '6.8 goto-recursion-function',
      code: `program test;
function fib(n: integer): integer;
label 10, 20;
begin
  if n <= 1 then goto 10;
  fib := fib(n-1) + fib(n-2);
  goto 20;
10:
  fib := n;
20:
end;
begin
  writeln(fib(5));
end.`,
      purpose: 'GOTO in recursive function（Pascal82: 数字 label）',
      expectedContains: '5',
    },
    {
      name: '6.8 goto-recursion-label-in-recursive',
      code: `program test;
label 99;
var x: integer;
procedure rec;
begin
  x := x + 1;
  if x > 3 then goto 99;
  writeln(x);
  rec;
end;
begin
  x := 0;
  rec;
99:
  writeln('Exit');
end.`,
      purpose: 'GOTO from recursive procedure to main program label (ISO 7185: 允许跨过程 GOTO 到外层 block)',
      expectedContains: 'Exit',
    },
    {
      name: '6.8 goto-recursion-mutual',
      code: `program test;
label 10, 20;
var n: integer;
procedure a;
begin
  n := n + 1;
  writeln('A:', n);
  if n < 3 then goto 20;
end;
procedure b;
begin
  n := n + 1;
  writeln('B:', n);
  if n < 3 then goto 10;
end;
begin
  n := 0;
10:
  a;
20:
  b;
end.`,
      purpose:
        'GOTO between mutually recursive procedures to main program label (ISO 7185: 允许跨过程 GOTO 到外层 block)',
      expectedContains: 'A:1',
    },
    {
      name: '6.8 goto-recursion-deep-nested',
      code: `program test;
label 30;
var depth: integer;
procedure level1;
  procedure level2;
    procedure level3;
    begin
      if depth < 1 then goto 30;
      writeln('L3 ok');
    end;
  begin
    writeln('L2 start');
    level3;
30:
    writeln('L2 end');
  end;
begin
  depth := 0;
  level2;
  writeln('L1 end');
end;
begin
  level1;
end.`,
      purpose: 'GOTO from deeply nested procedure to outer procedure label (ISO 7185: 允许跨过程 GOTO 到外层 block)',
      expectedContains: 'L2 end',
    },
    {
      name: '6.8 goto-recursion-before-call',
      code: `program test;
var count: integer;
procedure rec;
label 40;
begin
  count := count + 1;
  if count > 2 then goto 40;
  writeln('Before:', count);
40:
  if count < 3 then rec;
  writeln('After:', count);
end;
begin
  count := 0;
  rec;
end.`,
      purpose: 'GOTO before recursive call（Pascal82: 数字 label，count 为全局变量）',
      expectedContains: 'Before:1\nBefore:2\nAfter:3\nAfter:3\nAfter:3',
    },
    {
      name: '6.8 goto-recursion-after-call',
      code: `program test;
var count: integer;
procedure rec;
label 50;
begin
  count := count + 1;
  writeln('Enter:', count);
  if count < 3 then rec;
  goto 50;
  writeln('Skipped:', count);
50:
  writeln('Leave:', count);
end;
begin
  count := 0;
  rec;
end.`,
      purpose: 'GOTO after recursive call（Pascal82: 数字 label）',
      expectedContains: 'Enter:1\nEnter:2\nEnter:3\nLeave:3\nLeave:3\nLeave:3',
      expectedNotContains: 'Skipped:',
    },
    {
      name: '6.8 goto-recursion-entry-label',
      code: `program test;
var count: integer;
procedure rec;
label 60;
begin
60:
  count := count + 1;
  writeln(count);
  if count < 3 then goto 60;
end;
begin
  count := 0;
  rec;
end.`,
      purpose: 'GOTO to recursive entry label (simulating loop)（Pascal82: 数字 label）',
      expectedContains: '1\n2\n3',
    },
    {
      name: '6.8 goto-label-inside-nested-begin-end',
      code: `program test;
label 10, 20;
begin
  writeln('Outer begin');
  begin
    writeln('Inner begin');
    goto 20;
10:
    writeln('Inner label 10');
  end;
  writeln('Should not reach');
20:
  writeln('Outer label 20');
end.`,
      purpose: 'GOTO跨越嵌套begin块（透明块中的label收集）',
      expectedContains: 'Inner begin\nOuter label 20',
      expectedNotContains: 'Inner label 10\nShould not reach',
    },
    {
      name: '6.8 goto-from-inner-label-to-outer',
      code: `program test;
label 10, 20;
begin
  goto 10;
  writeln('Skipped outer');
  begin
10:
    writeln('Inner label 10');
    goto 20;
    writeln('Skipped inner');
  end;
20:
  writeln('Outer label 20');
end.`,
      purpose: 'GOTO跳到嵌套begin中的label再跳出',
      expectedContains: 'Inner label 10\nOuter label 20',
      expectedNotContains: 'Skipped outer\nSkipped inner',
    },
    {
      name: '6.8 goto-triple-nested-compound',
      code: `program test;
label 10, 20, 30;
begin
  writeln('L1');
  begin
    writeln('L2');
    begin
      writeln('L3');
      goto 30;
10:
      writeln('Label L3-10');
    end;
20:
    writeln('Label L2-20');
  end;
30:
  writeln('Label L1-30');
end.`,
      purpose: '三层嵌套begin-end中的GOTO（透明块label收集）',
      expectedContains: 'L1\nL2\nL3\nLabel L1-30',
      expectedNotContains: 'Label L3-10\nLabel L2-20',
    },
    {
      name: '6.8 goto-case-with-otherwise',
      code: `program test;
label 10;
var x: integer;
begin
  x := 5;
  case x of
    1: writeln('One');
    2: writeln('Two');
  otherwise
    goto 10;
  end;
  writeln('After case');
10:
  writeln('Label 10');
end.`,
      purpose: 'GOTO从CASE的otherwise分支跳出',
      expectedContains: 'Label 10',
      expectedNotContains: 'After case',
    },
    {
      name: '6.8 goto-case-branch-with-begin-end',
      code: `program test;
label 50;
var x: integer;
begin
  x := 1;
  case x of
    1:
      begin
        writeln('Case 1 begin');
        goto 50;
        writeln('Case 1 end');
      end;
    2: writeln('Case 2');
  end;
  writeln('After case');
50:
  writeln('Label 50');
end.`,
      purpose: 'GOTO从CASE分支内的begin-end块跳出',
      expectedContains: 'Case 1 begin\nLabel 50',
      expectedNotContains: 'Case 1 end\nAfter case',
    },
    {
      name: '6.8 goto-out-of-while-loop',
      code: `program test;
label 99;
var i: integer;
begin
  i := 1;
  while i <= 10 do
    begin
      writeln(i);
      if i = 3 then goto 99;
      i := i + 1;
    end;
  writeln('After while');
99:
  writeln('Exited at 3');
end.`,
      purpose: 'GOTO跳出while循环（不透明块中的goto）',
      expectedContains: '1\n2\n3\nExited at 3',
      expectedNotContains: '4\nAfter while',
    },
    {
      name: '6.8 goto-out-of-repeat-loop',
      code: `program test;
label 88;
var i: integer;
begin
  i := 1;
  repeat
    writeln(i);
    if i = 4 then goto 88;
    i := i + 1;
  until i > 10;
  writeln('After repeat');
88:
  writeln('Exited at 4');
end.`,
      purpose: 'GOTO跳出repeat循环',
      expectedContains: '1\n2\n3\n4\nExited at 4',
      expectedNotContains: '5\nAfter repeat',
    },
    {
      name: '6.8 goto-out-of-for-loop',
      code: `program test;
label 77;
var i: integer;
begin
  for i := 1 to 10 do
    begin
      writeln(i);
      if i = 5 then goto 77;
    end;
  writeln('After for');
77:
  writeln('Exited at 5');
end.`,
      purpose: 'GOTO跳出for循环',
      expectedContains: '1\n2\n3\n4\n5\nExited at 5',
      expectedNotContains: '6\nAfter for',
    },
    {
      name: '6.8 goto-out-of-if-then',
      code: `program test;
label 66;
var x: integer;
begin
  x := 1;
  if x > 0 then
    begin
      writeln('If then');
      goto 66;
      writeln('Skipped');
    end;
  writeln('After if');
66:
  writeln('Label 66');
end.`,
      purpose: 'GOTO跳出if-then块',
      expectedContains: 'If then\nLabel 66',
      expectedNotContains: 'Skipped\nAfter if',
    },
    {
      name: '6.8 goto-out-of-if-else',
      code: `program test;
label 55;
var x: integer;
begin
  x := 0;
  if x > 0 then
    writeln('Then')
  else
    begin
      writeln('Else');
      goto 55;
      writeln('Skipped else');
    end;
  writeln('After if');
55:
  writeln('Label 55');
end.`,
      purpose: 'GOTO跳出if-else块',
      expectedContains: 'Else\nLabel 55',
      expectedNotContains: 'Skipped else\nAfter if',
    },
    {
      name: '6.8 goto-with-statement',
      code: `program test;
label 44;
type
  r = record
    x: integer;
    y: integer;
  end;
var
  p: r;
begin
  p.x := 10;
  p.y := 20;
  with p do
    begin
      writeln(x);
      goto 44;
      writeln(y);
    end;
  writeln('After with');
44:
  writeln('Label 44');
end.`,
      purpose: 'GOTO跳出with语句',
      expectedContains: '10\nLabel 44',
      expectedNotContains: '20\nAfter with',
    },
    {
      name: '6.8 goto-multiple-labels-mixed-blocks',
      code: `program test;
label 100, 200, 300;
var i, j: integer;
begin
  i := 0;
  j := 0;
  while i < 10 do
    begin
      i := i + 1;
      j := j + 10;
      if j = 30 then goto 300;
100:
      writeln('i=', i, ' j=', j);
    end;
  goto 200;
300:
  writeln('Break at j=30');
200:
  writeln('Done');
end.`,
      purpose: '多label与while循环混合场景',
      expectedContains: 'i=1 j=10\ni=2 j=20\nBreak at j=30\nDone',
      expectedNotContains: 'i=3 j=30',
    },
    {
      name: '6.8 goto-label-inside-case-branch-compound',
      code: `program test;
label 20, 50;
var x: integer;
begin
  x := 1;
  case x of
    1:
      begin
        writeln('Case 1');
        goto 50;
20:
        writeln('Label 20 in case 1');
      end;
    2: writeln('Case 2');
  end;
  writeln('After case');
50:
  writeln('Label 50 outside');
end.`,
      purpose: 'CASE分支内compound块中的label（collectLabelsFromTransparentBlock case分支透明块）',
      expectedContains: 'Case 1\nLabel 50 outside',
      expectedNotContains: 'Label 20 in case 1\nAfter case',
    },
    {
      name: '6.8 goto-label-directly-in-case-branch',
      code: `program test;
label 30, 60;
var x: integer;
begin
  x := 2;
  case x of
    1: writeln('Case 1');
    2:
30:
      writeln('Label 30 is case 2 body');
  end;
  goto 60;
  writeln('Skipped');
60:
  writeln('Label 60');
end.`,
      purpose: 'CASE分支直接是LabeledStatement（collectLabelsFromTransparentBlock case分支LabeledStatement）',
      expectedContains: 'Label 30 is case 2 body\nLabel 60',
      expectedNotContains: 'Skipped',
    },
    {
      name: '6.8 goto-label-in-case-otherwise-compound',
      code: `program test;
label 40, 70;
var x: integer;
begin
  x := 99;
  case x of
    1: writeln('One');
    2: writeln('Two');
  otherwise
    begin
      writeln('Otherwise begin');
      goto 70;
40:
      writeln('Label 40 in otherwise');
    end;
  end;
  writeln('After case');
70:
  writeln('Label 70 outside');
end.`,
      purpose: 'CASE otherwise中compound块的label（collectLabelsFromTransparentBlock otherwise透明块）',
      expectedContains: 'Otherwise begin\nLabel 70 outside',
      expectedNotContains: 'Label 40 in otherwise\nAfter case',
    },
    {
      name: '6.8 goto-label-in-with-body-compound',
      code: `program test;
label 55, 80;
type
  r = record
    x: integer;
    y: integer;
  end;
var
  p: r;
begin
  p.x := 10;
  p.y := 20;
  with p do
    begin
      writeln(x);
      goto 80;
55:
      writeln(y);
    end;
  writeln('After with');
80:
  writeln('Label 80 outside');
end.`,
      purpose: 'WITH body中compound块的label（collectLabelsFromTransparentBlock with透明块）',
      expectedContains: '10\nLabel 80 outside',
      expectedNotContains: '20\nAfter with',
    },
    {
      name: '6.8 goto-label-directly-in-with-body',
      code: `program test;
label 66, 90;
type
  r = record
    x: integer;
  end;
var
  p: r;
begin
  p.x := 100;
  with p do
66:
    writeln(x);
  goto 90;
  writeln('Skipped');
90:
  writeln('Label 90');
end.`,
      purpose: 'WITH body直接是LabeledStatement（collectLabelsFromTransparentBlock with LabeledStatement）',
      expectedContains: '100\nLabel 90',
      expectedNotContains: 'Skipped',
    },
    {
      name: '6.8 goto-label-first-is-labeled-transparent',
      code: `program test;
label 100;
begin
  goto 100;
  writeln('Skipped');
100:
  begin
    writeln('In compound after label');
  end;
  writeln('After compound');
end.`,
      purpose: 'label后紧跟透明块（getRemainingStatements labeled+transparent first）',
      expectedContains: 'In compound after label\nAfter compound',
      expectedNotContains: 'Skipped',
    },
    {
      name: '6.8 goto-label-then-multi-transparent-after',
      code: `program test;
label 200;
begin
  goto 200;
  writeln('Skipped');
200:
  begin
    writeln('First compound');
  end;
  begin
    writeln('Second compound');
  end;
  writeln('Last');
end.`,
      purpose: 'label后有多个透明块（getRemainingStatements 后续透明块）',
      expectedContains: 'First compound\nSecond compound\nLast',
      expectedNotContains: 'Skipped',
    },
    {
      name: '6.8 goto-deep-nested-label-then-flatten',
      code: `program test;
label 300;
begin
  goto 300;
  writeln('Skipped');
  begin
    begin
300:
      begin
        writeln('Deep nested 1');
      end;
      writeln('Deep nested 2');
    end;
    writeln('Deep nested 3');
  end;
  writeln('Outer');
end.`,
      purpose: '深层嵌套透明块中的label（flattenTransparentBlock递归 + getRemainingStatements）',
      expectedContains: 'Deep nested 1\nDeep nested 2\nDeep nested 3\nOuter',
      expectedNotContains: 'Skipped',
    },
    {
      name: '6.8 goto-label-with-nested-transparent-in-remaining',
      code: `program test;
label 400;
begin
  goto 400;
  writeln('Skipped');
400:
  begin
    begin
      writeln('Inner compound');
    end;
    writeln('Outer compound');
  end;
  writeln('After');
end.`,
      purpose: 'label后compound内还有compound（flattenTransparentBlock递归子透明块）',
      expectedContains: 'Inner compound\nOuter compound\nAfter',
      expectedNotContains: 'Skipped',
    },
    {
      name: '6.8 goto-label-then-with-statement',
      code: `program test;
label 500;
type
  r = record
    x: integer;
  end;
var
  p: r;
begin
  p.x := 42;
  goto 500;
  writeln('Skipped');
500:
  with p do
    writeln(x);
  writeln('After with');
end.`,
      purpose: 'label后紧跟with语句（flattenTransparentBlock处理非Compound透明块）',
      expectedContains: '42\nAfter with',
      expectedNotContains: 'Skipped',
    },

    // ==========================================================================
    // 非正常场景：跳入循环 / 跳入 if 块
    // ==========================================================================

    {
      name: '6.8 goto-into-while-loop-body',
      code: `program test;
label 50;
var i: integer;
begin
  i := 0;
  writeln('before goto');
  goto 50;
  writeln('skipped');
  while i < 5 do
    begin
      i := i + 1;
50:
      writeln('jumped into loop body, i=', i);
    end;
  writeln('after loop, i=', i);
end.`,
      purpose: 'GOTO 跳入 while 循环体（非透明块，label 不可达，应报错）',
      expectedError: '',
    },
    {
      name: '6.8 goto-into-for-loop-body',
      code: `program test;
label 60;
var i: integer;
begin
  writeln('before goto');
  goto 60;
  writeln('skipped');
  for i := 1 to 3 do
    begin
      writeln('normal iter ', i);
60:
      writeln('jumped into for body');
    end;
  writeln('after for');
end.`,
      purpose: 'GOTO 跳入 for 循环体（非透明块，label 不可达，应报错）',
      expectedError: '',
    },
    {
      name: '6.8 goto-into-repeat-loop-body',
      code: `program test;
label 70;
var i: integer;
begin
  i := 0;
  writeln('before goto');
  goto 70;
  writeln('skipped');
  repeat
    i := i + 1;
    writeln('normal repeat ', i);
70:
    writeln('jumped into repeat');
  until i > 5;
  writeln('after repeat, i=', i);
end.`,
      purpose: 'GOTO 跳入 repeat 循环体（非透明块，label 不可达，应报错）',
      expectedError: '',
    },
    {
      name: '6.8 goto-into-if-then-branch',
      code: `program test;
label 80;
var x: integer;
begin
  x := 0;
  writeln('before goto');
  goto 80;
  writeln('skipped');
  if x > 0 then
    begin
      writeln('then branch');
80:
      writeln('jumped into then');
    end;
  writeln('after if');
end.`,
      purpose: 'GOTO 跳入 if-then 分支（非透明块，label 不可达，应报错）',
      expectedError: '',
    },
    {
      name: '6.8 goto-into-if-else-branch',
      code: `program test;
label 90;
var x: integer;
begin
  x := 1;
  writeln('before goto');
  goto 90;
  writeln('skipped');
  if x > 0 then
    writeln('then')
  else
    begin
      writeln('else branch');
90:
      writeln('jumped into else');
    end;
  writeln('after if');
end.`,
      purpose: 'GOTO 跳入 if-else 分支（非透明块，label 不可达，应报错）',
      expectedError: '',
    },

    // ==========================================================================
    // 嵌套非透明块：if/while/repeat/for 嵌套，每层有 label，goto 跨层跳转
    // ==========================================================================

    {
      name: '6.8 nested-if-then-goto-outer-label',
      code: `program test;
label 100;
var x, y: integer;
begin
  x := 1;
  y := 1;
  if x > 0 then
    begin
      if y > 0 then
        begin
          writeln('inner');
          goto 100;
          writeln('skipped inner');
        end;
      writeln('skipped middle');
    end;
  writeln('skipped outer');
100:
  writeln('label 100');
end.`,
      purpose: '嵌套 if-then 中 goto 跳到外层 label',
      expectedContains: 'inner\nlabel 100',
      expectedNotContains: 'skipped',
    },
    {
      name: '6.8 nested-if-else-goto-outer-label',
      code: `program test;
label 110;
var x: integer;
begin
  x := 0;
  if x > 0 then
    writeln('then')
  else
    begin
      if x = 0 then
        begin
          writeln('else-inner');
          goto 110;
        end;
      writeln('else-skipped');
    end;
  writeln('after-if-skipped');
110:
  writeln('label 110');
end.`,
      purpose: '嵌套 if-else 中 goto 跳到外层 label',
      expectedContains: 'else-inner\nlabel 110',
      expectedNotContains: 'else-skipped\nafter-if-skipped',
    },
    {
      name: '6.8 nested-while-goto-outer-label',
      code: `program test;
label 120;
var i, j: integer;
begin
  i := 1;
  while i <= 3 do
    begin
      j := 1;
      while j <= 3 do
        begin
          writeln('i=', i, ' j=', j);
          if (i = 2) and (j = 1) then goto 120;
          j := j + 1;
        end;
      i := i + 1;
    end;
  writeln('after loops');
120:
  writeln('label 120');
end.`,
      purpose: '嵌套 while 中 goto 跳出两层循环到外层 label',
      expectedContains: 'i=1 j=1\ni=1 j=2\ni=1 j=3\ni=2 j=1\nlabel 120',
      expectedNotContains: 'after loops',
    },
    {
      name: '6.8 nested-for-goto-outer-label',
      code: `program test;
label 130;
var i, j: integer;
begin
  for i := 1 to 3 do
    begin
      for j := 1 to 3 do
        begin
          writeln('i=', i, ' j=', j);
          if (i = 1) and (j = 2) then goto 130;
        end;
    end;
  writeln('after loops');
130:
  writeln('label 130');
end.`,
      purpose: '嵌套 for 中 goto 跳出两层循环到外层 label',
      expectedContains: 'i=1 j=1\ni=1 j=2\nlabel 130',
      expectedNotContains: 'after loops',
    },
    {
      name: '6.8 nested-repeat-goto-outer-label',
      code: `program test;
label 140;
var i, j: integer;
begin
  i := 0;
  repeat
    j := 0;
    repeat
      j := j + 1;
      writeln('i=', i, ' j=', j);
      if (i = 1) and (j = 1) then goto 140;
    until j >= 2;
    i := i + 1;
  until i >= 3;
  writeln('after loops');
140:
  writeln('label 140');
end.`,
      purpose: '嵌套 repeat 中 goto 跳出两层循环到外层 label',
      expectedContains: 'i=0 j=1\ni=0 j=2\ni=1 j=1\nlabel 140',
      expectedNotContains: 'after loops',
    },
    {
      name: '6.8 mixed-nested-if-while-goto',
      code: `program test;
label 150;
var x, i: integer;
begin
  x := 1;
  if x > 0 then
    begin
      i := 0;
      while i < 10 do
        begin
          i := i + 1;
          if i = 3 then goto 150;
        end;
      writeln('after while in if');
    end;
  writeln('after if');
150:
  writeln('label 150');
end.`,
      purpose: 'if 内嵌套 while，goto 从 while 跳出 if 到外层 label',
      expectedContains: 'label 150',
      expectedNotContains: 'after while in if\nafter if',
    },
    {
      name: '6.8 mixed-nested-while-for-goto',
      code: `program test;
label 160;
var i, j: integer;
begin
  i := 0;
  while i < 3 do
    begin
      i := i + 1;
      for j := 1 to 5 do
        begin
          if (i = 2) and (j = 3) then goto 160;
        end;
      writeln('completed for i=', i);
    end;
  writeln('after while');
160:
  writeln('label 160');
end.`,
      purpose: 'while 内嵌套 for，goto 从 for 跳出 while 到外层',
      expectedContains: 'completed for i=1\nlabel 160',
      expectedNotContains: 'after while',
    },
    {
      name: '6.8 mixed-nested-for-if-goto',
      code: `program test;
label 170;
var i, x: integer;
begin
  for i := 1 to 5 do
    begin
      x := i;
      if x > 2 then
        begin
          writeln('x=', x);
          goto 170;
        end;
      writeln('skip x=', x);
    end;
  writeln('after for');
170:
  writeln('label 170');
end.`,
      purpose: 'for 内嵌套 if，goto 从 if 跳出 for 到外层',
      expectedContains: 'skip x=1\nskip x=2\nx=3\nlabel 170',
      expectedNotContains: 'after for',
    },
    {
      name: '6.8 multiple-labels-in-nested-blocks',
      code: `program test;
label 200, 210, 220;
var i: integer;
begin
  writeln('start');
  for i := 1 to 3 do
    begin
      writeln('i=', i);
      if i = 1 then goto 200;
      if i = 2 then goto 210;
      if i = 3 then goto 220;
    end;
  writeln('after for');
200:
  writeln('label 200');
210:
  writeln('label 210');
220:
  writeln('label 220');
end.`,
      purpose: '多层嵌套中多个 label，goto 跳转到不同层级（label 在顶层透明块中）',
      expectedContains: 'start\ni=1\nlabel 200\nlabel 210\nlabel 220',
      expectedNotContains: 'after for',
    },
    {
      name: '6.8 goto-between-if-branches',
      code: `program test;
label 300, 310;
var x: integer;
begin
  x := 1;
  if x = 1 then
    goto 300
  else
    goto 310;
  writeln('skipped');
300:
  writeln('label 300');
310:
  writeln('label 310');
end.`,
      purpose: 'if 分支中的 goto 跳转到外层 label（label 在透明块中）',
      expectedContains: 'label 300\nlabel 310',
      expectedNotContains: 'skipped',
    },
    {
      name: '6.8 goto-from-repeat-to-for-label',
      code: `program test;
label 400, 410;
var i, j: integer;
begin
  i := 0;
400:
  for j := 1 to 2 do
    begin
      writeln('for j=', j, ' i=', i);
      if (i = 1) and (j = 2) then goto 410;
    end;
  i := i + 1;
  if i < 3 then goto 400;
410:
  writeln('done');
end.`,
      purpose: 'goto 在 repeat 模拟循环和 for 循环之间跳转',
      expectedContains: 'for j=1 i=0\nfor j=2 i=0\nfor j=1 i=1\nfor j=2 i=1\ndone',
    },
    {
      name: '6.8 goto-triple-nested-mixed-blocks',
      code: `program test;
label 500, 510, 520;
var i, j, k: integer;
begin
  for i := 1 to 3 do
    begin
      j := 0;
      while j < 3 do
        begin
          j := j + 1;
          if j > 1 then
            begin
              k := 0;
              repeat
                k := k + 1;
                if (i = 2) and (j = 2) and (k = 1) then goto 500;
                if (i = 2) and (j = 2) and (k = 2) then goto 510;
              until k >= 2;
            end;
        end;
      writeln('completed i=', i);
    end;
  goto 520;
500:
  writeln('label 500');
510:
  writeln('label 510');
520:
  writeln('label 520');
end.`,
      purpose: 'for→while→if→repeat 四层嵌套，多 label 跨层 goto',
      expectedContains: 'completed i=1',
    },

    // ==========================================================================
    // 防死循环测试（使用 maxSteps）
    // ==========================================================================

    {
      name: '6.8 goto-backward-infinite-loop-detected',
      code: `program test;
label 999;
var i: integer;
begin
  i := 0;
999:
  i := i + 1;
  goto 999;
end.`,
      purpose: '后向 goto 死循环，maxSteps 应终止',
      maxSteps: 1000,
      expectedError: 'step limit',
    },
    {
      name: '6.8 goto-mutual-infinite-loop-detected',
      code: `program test;
label 800, 810;
begin
  goto 800;
800:
  goto 810;
810:
  goto 800;
end.`,
      purpose: '互相 goto 死循环，maxSteps 应终止',
      maxSteps: 1000,
      expectedError: 'step limit',
    },
    {
      name: '6.8 goto-forward-skip-all-infinite',
      code: `program test;
label 700;
begin
  goto 700;
  while true do writeln('stuck');
700:
  writeln('safe');
end.`,
      purpose: '前向 goto 跳过无限 while，到达 label 安全退出',
      expectedContains: 'safe',
      maxSteps: 10000,
    },

    // ==========================================================================
    // 跨过程/函数 goto 测试（ISO 7185 6.8.1, 6.8.2.4）
    // 规则：goto 可以跳到同 block 或外层 block 的 label，但不能进入一个 block
    // NOTE 2: 内层 block 的 goto 可以引用外层 block 的 label，前提是 label 在最外层
    // ==========================================================================

    {
      name: '6.8 goto-from-proc-to-main-label-allowed',
      code: `program test;
label 100;
procedure p;
begin
  writeln('in p');
  goto 100;
  writeln('skipped in p');
end;
begin
  p;
  writeln('after p');
100:
  writeln('label 100');
end.`,
      purpose: '从过程内 goto 到主程序 label（ISO 允许，label 在主程序最外层）',
      expectedContains: 'in p\nlabel 100',
      expectedNotContains: 'skipped in p\nafter p',
    },
    {
      name: '6.8 goto-from-func-to-main-label-allowed',
      code: `program test;
label 200;
var x: integer;
function f: integer;
begin
  f := 42;
  writeln('in f');
  goto 200;
  writeln('skipped in f');
end;
begin
  x := f;
  writeln('after f');
200:
  writeln('label 200, x=', x);
end.`,
      purpose: '从函数内 goto 到主程序 label',
      expectedOutput: 'in f\nlabel 200, x=0\n',
    },
    {
      name: '6.8 goto-from-inner-proc-to-outer-proc-label-allowed',
      code: `program test;
procedure outer;
label 300;
procedure inner;
begin
  writeln('in inner');
  goto 300;
  writeln('skipped in inner');
end;
begin
  inner;
  writeln('after inner');
300:
  writeln('label 300');
end;
begin
  outer;
end.`,
      purpose: '从内层过程 goto 到外层过程 label（ISO 允许，label 在外层最外层）',
      expectedContains: 'in inner\nlabel 300',
      expectedNotContains: 'skipped in inner\nafter inner',
    },
    {
      name: '6.8 goto-from-proc-to-another-proc-label-forbidden',
      code: `program test;
procedure p1;
label 400;
begin
400:
  writeln('p1 label');
end;
procedure p2;
begin
  goto 400;
end;
begin
  p2;
end.`,
      purpose: '从一个过程 goto 到另一个过程的 label（ISO 禁止，label 不在作用域内）',
      expectedError: '',
    },
    {
      name: '6.8 goto-from-main-to-proc-label-forbidden',
      code: `program test;
procedure p;
label 500;
begin
500:
  writeln('p label');
end;
begin
  goto 500;
end.`,
      purpose: '从主程序 goto 到过程内的 label（ISO 禁止，不能进入一个 block）',
      expectedError: '',
    },
    {
      name: '6.8 goto-from-outer-proc-to-inner-proc-label-forbidden',
      code: `program test;
procedure outer;
procedure inner;
label 600;
begin
600:
  writeln('inner label');
end;
begin
  goto 600;
end;
begin
  outer;
end.`,
      purpose: '从外层过程 goto 到内层过程的 label（ISO 禁止，不能进入一个 block）',
      expectedError: '',
    },

    // ==========================================================================
    // Label 必须在外层 block 的 statement-sequence 顶层才能被内层 goto 引用
    // ==========================================================================

    {
      name: '6.8 goto-to-label-inside-if-forbidden',
      code: `program test;
procedure outer;
var x: integer;
procedure inner;
begin
  goto 700;
end;
begin
  x := 0;
  if x = 0 then
    begin
700:
      writeln('label inside if');
    end;
  inner;
end;
begin
  outer;
end.`,
      purpose: 'goto 到 if 块内的 label（ISO 禁止，label 不在最外层）',
      expectedError: '',
    },
    {
      name: '6.8 goto-to-label-inside-while-forbidden',
      code: `program test;
procedure outer;
var i: integer;
procedure inner;
begin
  goto 800;
end;
begin
  i := 0;
  while i < 5 do
    begin
800:
      writeln('label inside while');
      i := i + 1;
    end;
  inner;
end;
begin
  outer;
end.`,
      purpose: 'goto 到 while 块内的 label（ISO 禁止，label 不在最外层）',
      expectedError: '',
    },

    // ==========================================================================
    // LoopAnalysis 透明块末尾 label 误判测试
    // 问题：while(with{ label n; } call()) 会把 label n 当成循环体末尾，忽略 call()
    // ==========================================================================

    {
      name: '6.8 while-with-label-then-call',
      code: `program test;
label 10;
var i: integer;
begin
  i := 0;
  while i < 3 do
    begin
      with i do
        begin
          i := i + 1;
10:
          writeln('label 10, i=', i);
        end;
      writeln('after with, i=', i);
    end;
  writeln('done');
end.`,
      purpose: 'while 内 with 块末尾有 label，其后还有语句（label 不应被视为循环体末尾）',
      expectedContains:
        'label 10, i=1\nafter with, i=1\nlabel 10, i=2\nafter with, i=2\nlabel 10, i=3\nafter with, i=3\ndone',
      maxSteps: 10000,
    },
    {
      name: '6.8 while-compound-label-then-call',
      code: `program test;
label 20;
var i: integer;
begin
  i := 0;
  while i < 3 do
    begin
      begin
        i := i + 1;
20:
        writeln('label 20, i=', i);
      end;
      writeln('after inner compound, i=', i);
    end;
  writeln('done');
end.`,
      purpose: 'while 内复合语句末尾有 label，其后还有语句（label 不应被视为循环体末尾）',
      expectedContains:
        'label 20, i=1\nafter inner compound, i=1\nlabel 20, i=2\nafter inner compound, i=2\nlabel 20, i=3\nafter inner compound, i=3\ndone',
      maxSteps: 10000,
    },
    {
      name: '6.8 while-case-label-then-call',
      code: `program test;
label 30;
var i: integer;
begin
  i := 0;
  while i < 3 do
    begin
      case i of
        0, 1, 2:
          begin
            i := i + 1;
30:
            writeln('label 30, i=', i);
          end;
      end;
      writeln('after case, i=', i);
    end;
  writeln('done');
end.`,
      purpose: 'while 内 case 语句分支末尾有 label，其后还有语句（label 不应被视为循环体末尾）',
      expectedContains:
        'label 30, i=1\nafter case, i=1\nlabel 30, i=2\nafter case, i=2\nlabel 30, i=3\nafter case, i=3\ndone',
      maxSteps: 10000,
    },
    {
      name: '6.8 for-with-label-then-call',
      code: `program test;
label 40;
var i: integer;
begin
  for i := 1 to 3 do
    begin
      with i do
        begin
40:
          writeln('label 40, i=', i);
        end;
      writeln('after with, i=', i);
    end;
  writeln('done');
end.`,
      purpose: 'for 内 with 块末尾有 label，其后还有语句（label 不应被视为循环体末尾）',
      expectedContains:
        'label 40, i=1\nafter with, i=1\nlabel 40, i=2\nafter with, i=2\nlabel 40, i=3\nafter with, i=3\ndone',
      maxSteps: 10000,
    },
    {
      name: '6.8 repeat-with-label-then-call',
      code: `program test;
label 50;
var i: integer;
begin
  i := 0;
  repeat
    with i do
      begin
        i := i + 1;
50:
        writeln('label 50, i=', i);
      end;
    writeln('after with, i=', i);
  until i >= 3;
  writeln('done');
end.`,
      purpose: 'repeat 内 with 块末尾有 label，其后还有语句（label 不应被视为循环体末尾）',
      expectedContains:
        'label 50, i=1\nafter with, i=1\nlabel 50, i=2\nafter with, i=2\nlabel 50, i=3\nafter with, i=3\ndone',
      maxSteps: 10000,
    },

    // ==========================================================================
    // 嵌套透明块末尾 label 测试
    // ==========================================================================

    {
      name: '6.8 while-nested-with-label-then-call',
      code: `program test;
label 60;
var i: integer;
begin
  i := 0;
  while i < 2 do
    begin
      with i do
        begin
          with i do
            begin
              i := i + 1;
60:
              writeln('label 60, i=', i);
            end;
          writeln('inner with done');
        end;
      writeln('outer with done');
    end;
  writeln('done');
end.`,
      purpose: 'while 内嵌套两层 with，最内层末尾有 label，其后多层都有语句',
      expectedContains:
        'label 60, i=1\ninner with done\nouter with done\nlabel 60, i=2\ninner with done\nouter with done\ndone',
      maxSteps: 10000,
    },

    // ==========================================================================
    // 循环体内 goto 到透明块末尾 label 的情况
    // ==========================================================================

    {
      name: '6.8 goto-to-with-label-from-while-body',
      code: `program test;
label 70;
var i: integer;
begin
  i := 0;
  while i < 5 do
    begin
      i := i + 1;
      if i = 3 then goto 70;
      writeln('before with, i=', i);
      with i do
        begin
70:
          writeln('label 70, i=', i);
        end;
      writeln('after with, i=', i);
    end;
  writeln('done');
end.`,
      purpose: 'while 体内 goto 到 with 块末尾的 label（label 后还有语句）',
      expectedContains:
        'before with, i=1\nlabel 70, i=1\nafter with, i=1\nbefore with, i=2\nlabel 70, i=2\nafter with, i=2\nlabel 70, i=3\nafter with, i=3\nbefore with, i=4\nlabel 70, i=4\nafter with, i=4\nbefore with, i=5\nlabel 70, i=5\nafter with, i=5\ndone',
      maxSteps: 10000,
    },

    // ==========================================================================
    // 跨过程 goto 终止中间激活测试
    // ==========================================================================

    {
      name: '6.8 goto-from-nested-proc-terminates-intervening',
      code: `program test;
label 900;
procedure outer;
procedure inner;
begin
  writeln('in inner');
  goto 900;
  writeln('inner never');
end;
begin
  writeln('in outer');
  inner;
  writeln('outer never');
end;
begin
  writeln('in main');
  outer;
  writeln('main never');
900:
  writeln('label 900');
end.`,
      purpose: '从嵌套两层过程 goto 到主程序 label，验证中间激活都被终止',
      expectedContains: 'in main\nin outer\nin inner\nlabel 900',
      expectedNotContains: 'inner never\nouter never\nmain never',
    },

    // ==========================================================================
    // Label 作用域遮蔽测试（6.2.2.5）
    // ==========================================================================

    {
      name: '6.8 label-shadowing-inner-takes-precedence',
      code: `program test;
label 100;
procedure outer;
label 100;
begin
  writeln('outer');
  goto 100;
  writeln('outer skipped');
100:
  writeln('outer label');
end;
begin
  outer;
100:
  writeln('main label');
end.`,
      purpose: '内层过程和外层程序声明相同 label，内层 goto 引用内层 label（遮蔽规则）',
      expectedContains: 'outer\nouter label\nmain label',
      expectedNotContains: 'outer skipped',
    },
    {
      name: '6.8 label-shadowing-inner-goto-to-outer-forbidden',
      code: `program test;
label 100;
procedure outer;
label 100;
procedure inner;
begin
  goto 100;
end;
begin
  inner;
100:
  writeln('outer label');
end;
begin
  outer;
end.`,
      purpose: '三层嵌套，内层 goto 引用中间层的 label（内层被中间层遮蔽，不跳到主程序同名 label）',
      expectedContains: 'outer label',
      expectedNotContains: 'main label',
    },

    // ==========================================================================
    // 循环体末尾 label（非透明块内）测试
    // ==========================================================================

    {
      name: '6.8 while-label-at-actual-end-of-body',
      code: `program test;
label 10;
var i: integer;
begin
  i := 0;
  while i < 3 do
    begin
      i := i + 1;
10:
      writeln('label 10, i=', i);
    end;
  writeln('done');
end.`,
      purpose: 'while 循环体末尾有 label（直接在 compound 末尾，不是在 with/case 内）',
      expectedContains: 'label 10, i=1\nlabel 10, i=2\nlabel 10, i=3\ndone',
      maxSteps: 10000,
    },
    {
      name: '6.8 for-label-at-actual-end-of-body',
      code: `program test;
label 20;
var i: integer;
begin
  for i := 1 to 3 do
    begin
      writeln('i=', i);
20:
      writeln('label 20');
    end;
  writeln('done');
end.`,
      purpose: 'for 循环体末尾有 label（直接在 compound 末尾）',
      expectedContains: 'i=1\nlabel 20\ni=2\nlabel 20\ni=3\nlabel 20\ndone',
      maxSteps: 10000,
    },
    {
      name: '6.8 repeat-label-at-actual-end-of-body',
      code: `program test;
label 30;
var i: integer;
begin
  i := 0;
  repeat
    i := i + 1;
    writeln('i=', i);
30:
    writeln('label 30');
  until i >= 3;
  writeln('done');
end.`,
      purpose: 'repeat 循环体末尾有 label（直接在 repeat 末尾）',
      expectedContains: 'i=1\nlabel 30\ni=2\nlabel 30\ni=3\nlabel 30\ndone',
      maxSteps: 10000,
    },

    // ==========================================================================
    // 多个 label 在循环体末尾
    // ==========================================================================

    {
      name: '6.8 multiple-labels-at-end-of-while-body',
      code: `program test;
label 10, 20;
var i: integer;
begin
  i := 0;
  while i < 3 do
    begin
      i := i + 1;
10:
      writeln('label 10, i=', i);
20:
      writeln('label 20');
    end;
  writeln('done');
end.`,
      purpose: 'while 循环体末尾有多个连续 label',
      expectedContains: 'label 10, i=1\nlabel 20\nlabel 10, i=2\nlabel 20\nlabel 10, i=3\nlabel 20\ndone',
      maxSteps: 10000,
    },

    // ==========================================================================
    // Goto 到循环体末尾 label（应使用 continue 优化）
    // ==========================================================================

    {
      name: '6.8 goto-to-tail-label-in-while',
      code: `program test;
label 10;
var i: integer;
begin
  i := 0;
  while i < 5 do
    begin
      i := i + 1;
      if i = 3 then goto 10;
      writeln('before label, i=', i);
10:
      writeln('label 10, i=', i);
    end;
  writeln('done');
end.`,
      purpose: 'goto 到 while 循环体末尾的 label（tail label，可用 continue 优化）',
      expectedContains:
        'before label, i=1\nlabel 10, i=1\nbefore label, i=2\nlabel 10, i=2\nlabel 10, i=3\nbefore label, i=4\nlabel 10, i=4\nbefore label, i=5\nlabel 10, i=5\ndone',
      maxSteps: 10000,
    },

    // ==========================================================================
    // Label 声明但未使用（ISO 允许）
    // ==========================================================================

    {
      name: '6.8 label-declared-but-not-used',
      code: `program test;
label 100;
begin
  writeln('hello');
end.`,
      purpose: '声明了 label 但未使用（ISO 允许，不报错）',
      expectedContains: 'hello',
    },
    {
      name: '6.8 label-used-but-not-declared',
      code: `program test;
begin
100:
  writeln('hello');
end.`,
      purpose: '使用了 label 但未声明（ISO 禁止，应报错）',
      expectedError: '',
    },

    // ==========================================================================
    // Label 值范围测试（ISO 6.1.6: 0..9999）
    // ==========================================================================

    {
      name: '6.8 label-min-value-0',
      code: `program test;
label 0;
begin
0:
  writeln('label 0');
end.`,
      purpose: 'label 值为 0（ISO 允许的最小值）',
      expectedContains: 'label 0',
    },
    {
      name: '6.8 label-max-value-9999',
      code: `program test;
label 9999;
begin
9999:
  writeln('label 9999');
end.`,
      purpose: 'label 值为 9999（ISO 允许的最大值）',
      expectedContains: 'label 9999',
    },
    {
      name: '6.8 label-value-too-large',
      code: `program test;
label 10000;
begin
10000:
  writeln('label 10000');
end.`,
      purpose: 'label 值为 10000（超出 ISO 范围 0..9999，应报错）',
      expectedError: '',
    },

    {
      name: '6.8 goto-from-nested-loop-to-label',
      code: `program test;
label 100;
var i, j: integer;
begin
  for i := 1 to 3 do
    begin
      for j := 1 to 3 do
        begin
          writeln('i=', i, ' j=', j);
          if (i = 2) and (j = 2) then goto 100;
        end;
      writeln('completed j loop for i=', i);
    end;
  writeln('after outer loop');
100:
  writeln('label 100 reached');
end.`,
      purpose: 'goto from nested loop should correctly break out of both loops',
      expectedContains: 'i=1 j=1\ni=1 j=2\ni=1 j=3\ncompleted j loop for i=1\ni=2 j=1\ni=2 j=2\nlabel 100 reached',
      expectedNotContains: 'after outer loop',
    },
    {
      name: '6.8 goto-from-while-inside-for',
      code: `program test;
label 200;
var i, j: integer;
begin
  for i := 1 to 5 do
    begin
      j := 0;
      while j < 10 do
        begin
          j := j + 1;
          if (i = 3) and (j = 5) then goto 200;
        end;
      writeln('i=', i, ' completed');
    end;
  writeln('after for');
200:
  writeln('label 200');
end.`,
      purpose: 'goto from while inside for should correctly break',
      expectedContains: 'i=1 completed\ni=2 completed\nlabel 200',
      expectedNotContains: 'after for',
    },
    {
      name: '6.8 goto-from-repeat-inside-while',
      code: `program test;
label 300;
var i, j: integer;
begin
  i := 0;
  while i < 5 do
    begin
      i := i + 1;
      j := 0;
      repeat
        j := j + 1;
        if (i = 2) and (j = 3) then goto 300;
      until j >= 5;
      writeln('i=', i, ' completed');
    end;
  writeln('after while');
300:
  writeln('label 300');
end.`,
      purpose: 'goto from repeat inside while should correctly break',
      expectedContains: 'i=1 completed\nlabel 300',
      expectedNotContains: 'after while',
    },
    {
      name: '6.8 goto-forward-skip-all',
      code: `program test;
label 400;
var x: integer;
begin
  x := 0;
  writeln('before');
  goto 400;
  writeln('skipped');
400:
  writeln('label 400');
end.`,
      purpose: 'forward goto should skip code correctly',
      expectedContains: 'before\nlabel 400',
      expectedNotContains: 'skipped',
    },
    {
      name: '6.8 goto-backward-loop',
      code: `program test;
label 500;
var i: integer;
begin
  i := 0;
500:
  i := i + 1;
  writeln('i=', i);
  if i < 5 then goto 500;
  writeln('done');
end.`,
      purpose: 'backward goto should create loop',
      expectedContains: 'i=1\ni=2\ni=3\ni=4\ni=5\ndone',
    },

    {
      name: '6.8 goto to label in while loop should error',
      code: `program test;
label 888;
var x: integer;
begin
  x := 0;
  while x < 3 do
    888: begin x := x + 1; writeln('loop'); end;
  goto 888;
end.`,
      purpose: 'goto 跳转到 while 循环内部的 label，标准 Pascal 不允许，编译时应报错',
      expectedError: '',
    },
    {
      name: '6.8 goto to label in for loop should error',
      code: `program test;
label 666;
var i: integer;
begin
  for i := 1 to 3 do
    666: writeln('loop');
  goto 666;
end.`,
      purpose: 'goto 跳转到 for 循环内部的 label，标准 Pascal 不允许，编译时应报错',
      expectedError: '',
    },
    {
      name: '6.8 goto to label in if statement should error',
      code: `program test;
label 300;
begin
  if true then
    300: writeln('inside if');
  goto 300;
end.`,
      purpose: 'goto 跳转到 if 语句内部的 label，标准 Pascal 不允许，编译时应报错',
      expectedError: '',
    },
    {
      name: '6.8 goto to label in repeat loop should error',
      code: `program test;
label 400;
var x: integer;
begin
  x := 0;
  repeat
    400: x := x + 1;
  until x >= 3;
  goto 400;
end.`,
      purpose: 'goto 跳转到 repeat 循环内部的 label，标准 Pascal 不允许，编译时应报错',
      expectedError: '',
    },

    {
      // 最小复现：GOTO 和 label 在同一 CompoundStatement，CompoundStatement 在 IF then 中
      name: '6.8 goto and label in same compound inside if-then',
      code: `program test;
label 888;
var ddt: integer;
begin
  ddt := 0;
  if ddt = 0 then begin
    goto 888;
    888: ddt := 1;
  end;
  writeln('done', ddt);
end.`,
      purpose:
        'GOTO 888 和 888: 在同一个 BEGIN..END (CompoundStatement) 中，该 compound 在 IF then 分支内。ISO 6.8.1 b) 允许同一 statement-sequence 中的 goto',
      expectedContains: 'done1',
    },
    {
      // 最小复现：outer if 的 else 是 inner if，inner if 的 then 是含 goto+label 的 compound
      name: '6.8 goto and label in compound inside nested if-else (no while)',
      code: `program test;
label 888;
var ddt: integer;
begin
  ddt := 0;
  if ddt < 0 then ddt := -1
  else if ddt = 0 then begin
    goto 888;
    888: ddt := 1;
  end;
  writeln('done', ddt);
end.`,
      purpose:
        '外层 IF 的 ELSE 是另一个 IF (嵌套 IF)，内层 IF 的 THEN 是含 GOTO 和 label 的 CompoundStatement。验证 collectLabelsFromNonTransparentBlock 是否能递归处理嵌套 IF',
      expectedContains: 'done1',
    },
    {
      // tangle DEBUGHELP 的实际结构（简化）
      name: '6.8 tangle DEBUGHELP structure',
      code: `program test;
label 888, 10;
var ddt, k: integer;
begin
  ddt := 0;
  while true do begin
    if ddt < 0 then goto 10
    else if ddt = 0 then begin
      goto 888;
      888: ddt := 1;
    end else begin
      k := 1;
    end;
    goto 10;
  end;
  10: writeln('done', ddt);
end.`,
      purpose: 'tangle DEBUGHELP 中 GOTO 888 跳到同一 CompoundStatement 内的 label',
      expectedContains: 'done1',
    },
  ]

  runPascalTests(tests)
})
