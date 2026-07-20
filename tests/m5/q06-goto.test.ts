import { describe, it, expect } from '@jest/globals'
import { runVMTest, type VMTest } from './_helper'

describe('M5 JS Goto', () => {
  const tests: VMTest[] = [
    {
      name: 'goto in procedure',
      code: `program test;
procedure proc;
label 10;
begin
  goto 10;
  writeln('skipped');
  10:
  writeln('ok');
end;
begin
  proc;
end.`,
      purpose: 'goto within procedure scope',
      features: ['goto', 'label', 'procedure', 'scope'],
      expectedContains: 'ok',
    },
    {
      name: 'goto in main program',
      code: `program test;
label 20;
begin
  goto 20;
  writeln('skipped');
  20:
  writeln('done');
end.`,
      purpose: 'goto within main program scope',
      features: ['goto', 'label', 'scope'],
      expectedContains: 'done',
    },
    {
      name: 'goto across procedures should not error if proc not called',
      code: `program test;
label 10;
procedure proc;
begin
  goto 10;
end;
begin
  writeln('start');
  10:
  writeln('end');
end.`,
      purpose: 'goto across procedures only errors at runtime when proc is called',
      features: ['goto', 'label', 'cross-procedure', 'scope'],
      expectedContains: 'start\nend',
    },
    {
      name: 'label in nested procedure',
      code: `program test;
procedure outer;
procedure inner;
label 5;
begin
  goto 5;
  writeln('no');
  5:
  writeln('yes');
end;
begin
  inner;
end;
begin
  outer;
end.`,
      purpose: 'label in nested procedure',
      features: ['goto', 'label', 'nested-procedure', 'scope'],
      expectedContains: 'yes',
    },
    {
      name: 'labels in different scopes',
      code: `program test;
procedure proc1;
label 10;
begin
  goto 10;
  10:
  writeln('p1');
end;
procedure proc2;
label 10;
begin
  goto 10;
  10:
  writeln('p2');
end;
begin
  proc1;
  proc2;
end.`,
      purpose: 'same label number in different scopes',
      features: ['goto', 'label', 'scope', 'sibling-procedures'],
      expectedContains: 'p1',
    },
    {
      name: 'backward goto as loop',
      code: `program test;
label 20;
var i: integer;
begin
  i := 0;
  20:
  i := i + 1;
  if i < 5 then goto 20;
  writeln(i);
end.`,
      purpose: 'backward goto simulates a loop (tangle pattern: GOTO 20)',
      features: ['goto', 'label', 'backward-jump', 'loop'],
      expectedContains: '5',
    },
    {
      name: 'goto out of while loop',
      code: `program test;
label 30;
var i: integer;
begin
  i := 0;
  while true do begin
    i := i + 1;
    if i = 5 then goto 30;
  end;
  30:
  writeln(i);
end.`,
      purpose: 'goto breaks out of while loop (tangle pattern: GOTO 30 in SKIPAHEAD)',
      features: ['goto', 'label', 'cross-loop', 'break'],
      expectedContains: '5',
    },
    {
      name: 'goto out of nested while loop',
      code: `program test;
label 10;
var i, j: integer;
begin
  i := 0;
  while i < 10 do begin
    j := 0;
    while j < 10 do begin
      if i = 3 then goto 10;
      j := j + 1;
    end;
    i := i + 1;
  end;
  10:
  writeln(i, j);
end.`,
      purpose: 'goto breaks out of nested while loops',
      features: ['goto', 'label', 'cross-loop', 'nested-loop'],
      expectedContains: '30',
    },
    {
      name: 'multiple labels with mixed jumps',
      code: `program test;
label 20, 30, 31;
var i, s: integer;
begin
  i := 0;
  s := 0;
  20:
  i := i + 1;
  if i > 10 then goto 31;
  if i mod 2 = 0 then goto 30;
  s := s + i;
  goto 20;
  30:
  s := s - i;
  goto 20;
  31:
  writeln(s);
end.`,
      purpose: 'multiple labels with backward and forward jumps (tangle pattern: GETOUTPUT)',
      features: ['goto', 'label', 'multiple-labels', 'mixed-jumps'],
      expectedContains: '-5',
    },
    {
      name: 'goto in case statement',
      code: `program test;
label 20;
var c, i: integer;
begin
  i := 0;
  c := 1;
  20:
  case c of
    1: begin i := i + 1; c := 2; goto 20; end;
    2: begin i := i + 10; end;
  end;
  writeln(i);
end.`,
      purpose: 'goto inside case statement (tangle pattern: GETNEXT case...of)',
      features: ['goto', 'label', 'case-statement'],
      expectedContains: '11',
    },
    {
      name: 'goto in repeat-until loop',
      code: `program test;
label 10;
var i: integer;
begin
  i := 0;
  repeat
    i := i + 1;
    if i = 5 then goto 10;
  until i > 10;
  10:
  writeln(i);
end.`,
      purpose: 'goto breaks out of repeat-until loop',
      features: ['goto', 'label', 'repeat-until', 'cross-loop'],
      expectedContains: '5',
    },
    {
      name: 'goto in for loop',
      code: `program test;
label 10;
var i, s: integer;
begin
  s := 0;
  for i := 1 to 10 do begin
    if i = 5 then goto 10;
    s := s + i;
  end;
  10:
  writeln(s);
end.`,
      purpose: 'goto breaks out of for loop',
      features: ['goto', 'label', 'for-loop', 'cross-loop'],
      expectedContains: '10',
    },
    {
      name: 'conditional forward goto',
      code: `program test;
label 10;
var x: integer;
begin
  x := 1;
  if x = 1 then goto 10;
  writeln('not skipped');
  10:
  writeln('skipped');
end.`,
      purpose: 'conditional forward goto only skips when condition true',
      features: ['goto', 'label', 'conditional', 'forward-jump'],
      expectedContains: 'skipped',
    },
    {
      name: 'goto from if-then-else',
      code: `program test;
label 99;
var x: integer;
begin
  x := 2;
  if x = 1 then begin
    writeln('one');
  end else begin
    goto 99;
  end;
  writeln('after');
  99:
  writeln('end');
end.`,
      purpose: 'goto from else branch of if-then-else',
      features: ['goto', 'label', 'if-then-else'],
      expectedContains: 'end',
    },
  ]

  it('should pass goto tests', async () => {
    for (const test of tests) {
      const result = await runVMTest(test)
      if (!result.passed) {
        console.error(`FAIL: ${test.name}: ${result.message}`)
      }
      expect(result.passed).toBe(true)
    }
  })

  it('should reject undeclared label in standard mode', async () => {
    const result = await runVMTest({
      name: 'undeclared-label-standard',
      code: `program test;
begin
  goto 100;
100:
  writeln('ok');
end.`,
      purpose: 'standard Pascal requires LABEL declaration',
      features: ['goto', 'label', 'standard'],
      expectedError: '',
    })
    expect(result.passed).toBe(true)
  })
})