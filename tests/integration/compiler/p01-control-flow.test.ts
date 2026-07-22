import { describe } from 'vitest'
import { type PascalTest, runPascalTests } from '../_helper'

describe('Phase 1: Control Flow', () => {
  const tests: PascalTest[] = [
    {
      name: 'if-then simple true',
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
      name: 'if-then simple false',
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
      name: 'if-then-else true',
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
      name: 'if-then-else false',
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
      name: 'nested if',
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
      name: 'if-elseif via nested if',
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
      name: 'if in loop',
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
      name: 'if in procedure',
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
      name: 'boolean expression as condition',
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
      name: 'complex condition expression',
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
      name: 'while simple loop',
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
      name: 'while condition false initially',
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
      name: 'while multiple iterations',
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
      name: 'while in procedure',
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
      name: 'nested while',
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
      name: 'while with break via goto',
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
      name: 'for-to simple',
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
      name: 'for-downto simple',
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
      name: 'for boundary values',
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
      name: 'for in procedure',
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
      name: 'nested for',
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
      name: 'for variable after loop',
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
      name: 'repeat simple',
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
      name: 'repeat executes at least once',
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
      name: 'repeat multiple iterations',
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
      name: 'repeat in procedure',
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
      name: 'nested repeat',
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
      name: 'case simple',
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
      name: 'case multiple values',
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
      name: 'case otherwise',
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
      name: 'case in loop',
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
      name: 'case in procedure',
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
      name: 'nested case',
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
      name: 'loop with nested if',
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
      name: 'case with nested loop',
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
      name: 'recursion with loop',
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
      name: 'procedure call with control flow',
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
      name: 'while with if and break',
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
      name: 'for loop with case',
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
      name: 'repeat with nested if',
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
      name: 'if with complex expression',
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
      name: 'case with no match',
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
      name: 'for loop with step implicit',
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
      name: 'while loop with boolean flag',
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
      name: 'with-simple-record',
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
      name: 'with-assign-fields',
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
      name: 'nested-with-statements',
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
      name: 'case-multi-value-branch',
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
      name: 'for-downto-negative',
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
      name: 'for-to-zero-iterations',
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
      name: 'repeat-until-true-first',
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
      name: 'empty-statement',
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
      name: 'if-without-else-false',
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
  ]

  runPascalTests(tests)
})
