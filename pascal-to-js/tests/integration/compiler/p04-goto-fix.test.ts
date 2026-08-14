import { describe } from './_helper.ts'
import { type PascalTest, runPascalTests } from './_helper.ts'

describe('Phase 4: Goto Fix - Strategy D should use break not continue', () => {
  const tests: PascalTest[] = [
    {
      name: 'goto-from-nested-loop-to-label',
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
      name: 'goto-from-while-inside-for',
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
      name: 'goto-from-repeat-inside-while',
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
      name: 'goto-forward-skip-all',
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
      name: 'goto-backward-loop',
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
  ]

  runPascalTests(tests)
})
