import { LegacyTestCompat, runLegacyTest } from './_helper'

const tests: LegacyTestCompat[] = [
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
    features: ['if-statement', 'condition'],
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
    features: ['if-statement', 'condition'],
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
    features: ['if-statement', 'else', 'condition'],
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
    features: ['if-statement', 'else', 'condition'],
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
    features: ['if-statement', 'nested-if', 'condition'],
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
    features: ['if-statement', 'else', 'nested-if', 'condition'],
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
    features: ['if-statement', 'for-loop', 'condition'],
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
    features: ['if-statement', 'procedure', 'condition'],
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
    features: ['if-statement', 'boolean', 'condition'],
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
    features: ['if-statement', 'logical-operator', 'condition'],
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
    features: ['while-loop', 'condition'],
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
    features: ['while-loop', 'condition'],
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
    features: ['while-loop', 'condition', 'accumulator'],
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
    features: ['while-loop', 'procedure', 'condition'],
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
    features: ['while-loop', 'nested-loop', 'condition'],
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
    features: ['while-loop', 'goto', 'break', 'condition'],
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
    features: ['for-loop', 'for-to'],
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
    features: ['for-loop', 'for-downto'],
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
    features: ['for-loop', 'boundary'],
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
    features: ['for-loop', 'procedure'],
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
    features: ['for-loop', 'nested-loop'],
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
    features: ['for-loop', 'loop-variable'],
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
    features: ['repeat-loop', 'condition'],
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
    features: ['repeat-loop', 'condition'],
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
    features: ['repeat-loop', 'condition', 'factorial'],
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
    features: ['repeat-loop', 'procedure'],
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
    features: ['repeat-loop', 'nested-loop'],
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
    features: ['case-statement', 'selection'],
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
    features: ['case-statement', 'multiple-values'],
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
    features: ['case-statement', 'otherwise'],
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
    features: ['case-statement', 'for-loop'],
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
    features: ['case-statement', 'procedure'],
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
    features: ['case-statement', 'nested-case'],
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
    features: ['for-loop', 'if-statement', 'nested-control'],
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
    features: ['case-statement', 'for-loop', 'nested-control'],
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
    features: ['recursion', 'for-loop', 'function', 'nested-control'],
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
    features: ['procedure', 'if-statement', 'for-loop', 'nested-control'],
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
    features: ['while-loop', 'if-statement', 'goto', 'break'],
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
    features: ['for-loop', 'case-statement', 'nested-control'],
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
    features: ['repeat-loop', 'if-statement', 'nested-control'],
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
    features: ['if-statement', 'logical-operator', 'condition'],
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
    features: ['case-statement', 'no-match'],
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
    features: ['for-loop', 'accumulator'],
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
    features: ['while-loop', 'boolean', 'flag'],
    expectedContains: '3',
  },
]

describe('M5 JS (from M3.6): Control Flow', () => {
  tests.forEach((t) => {
    test(t.name, async () => {
      const result = await runLegacyTest(t)
      if (!result.passed) {
        console.error(`FAIL: ${t.name}: ${result.message}`)
      }
      expect(result.passed).toBe(true)
    })
  })
})
