import { describe, it, expect } from '@jest/globals'
import { runVMTest, type VMTest } from './_helper'

describe('M4 VM Goto', () => {
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
})