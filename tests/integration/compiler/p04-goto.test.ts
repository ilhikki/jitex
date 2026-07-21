import { describe, it, expect } from '@jest/globals'
import { runPascalTest, type PascalTest } from '../_helper'

describe('Phase 4: Goto', () => {
  const tests: PascalTest[] = [
    {
      name: 'goto-basic-same-procedure',
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
      name: 'goto-basic-forward',
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
      name: 'goto-basic-backward',
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
      name: 'goto-basic-skip-statements',
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
      name: 'goto-basic-outside-loop',
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
      name: 'goto-basic-into-loop',
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
      name: 'label-single',
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
      name: 'label-multiple',
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
      name: 'label-max-value',
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
      name: 'label-zero',
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
      name: 'label-same-as-variable',
      code: `program test;
label 100;
var lbl: integer;
begin
  lbl := 42;
  writeln(lbl);
100:
  writeln('Label 100');
end.`,
      purpose:
        'Label coexists with variable of same name（Pascal82: label 是关键字，不能作变量名）',
      expectedContains: '42\nLabel 100',
    },
    {
      name: 'goto-control-if-then',
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
      name: 'goto-control-if-then-else',
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
      name: 'goto-control-while',
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
      name: 'goto-control-for',
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
      name: 'goto-control-repeat',
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
      name: 'goto-control-case',
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
      name: 'goto-control-case-internal',
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
      name: 'goto-control-nested-loops',
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
      name: 'goto-error-nonexistent-label',
      code: `program test;
begin
  goto 999;
end.`,
      purpose: 'GOTO to non-existent label should error',
      expectedError: '',
    },
    {
      name: 'goto-error-cross-procedure',
      code: `program test;
label 100;
procedure p;
begin
  goto 100;
end;
begin
100:
  writeln('Main');
  p;
end.`,
      purpose: 'GOTO to label in different procedure should error',
      expectedError: '',
    },
    {
      name: 'goto-error-from-procedure-to-main',
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
      purpose: 'GOTO from procedure to main program label should error',
      expectedError: '',
    },
    {
      name: 'goto-error-from-outer-to-nested-procedure',
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
      name: 'goto-error-no-label',
      code: `program test;
begin
  goto;
end.`,
      purpose: 'GOTO without label should error',
      expectedError: '',
    },
    {
      name: 'goto-error-duplicate-label',
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
      name: 'goto-in-function',
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
      name: 'goto-in-nested-function',
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
      name: 'goto-recursion-procedure',
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
      name: 'goto-recursion-function',
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
      name: 'goto-recursion-label-in-recursive',
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
      purpose: 'GOTO from procedure to main program label should error (Pascal82: 禁止跨过程 GOTO)',
      expectedError: '',
    },
    {
      name: 'goto-recursion-mutual',
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
      purpose: 'GOTO from procedure to main program label should error (Pascal82: 禁止跨过程 GOTO)',
      expectedError: '',
    },
    {
      name: 'goto-recursion-deep-nested',
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
      purpose: 'GOTO in deeply nested procedures should error (Pascal82: GOTO 不能跨 block)',
      expectedError: '',
    },
    {
      name: 'goto-recursion-before-call',
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
      name: 'goto-recursion-after-call',
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
      name: 'goto-recursion-entry-label',
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
  ]

  for (const t of tests) {
    it(t.name, async () => {
      const result = await runPascalTest(t)
      if (!result.passed) {
        console.error(`  [${t.name}] FAIL: ${result.message}`)
      }
      expect(result.passed).toBe(true)
    })
  }
})
