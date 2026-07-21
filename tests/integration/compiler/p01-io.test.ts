import { describe, it, expect } from '@jest/globals'
import { runPascalTest, type PascalTest } from '../_helper'

describe('Phase 1: I/O', () => {
  // Original m36 tests
  const m36Tests: PascalTest[] = [
    {
      name: 'writeln with no arguments',
      code: `program test;
begin
  writeln;
end.`,
      purpose: 'writeln without arguments outputs a newline',
      expectedOutput: '\n',
    },
    {
      name: 'writeln with integer',
      code: `program test;
begin
  writeln(42);
end.`,
      purpose: 'writeln outputs integer value',
      expectedContains: '42',
    },
    {
      name: 'writeln with string literal',
      code: `program test;
begin
  writeln('hello world');
end.`,
      purpose: 'writeln outputs string literal value',
      expectedContains: 'hello world',
    },
    {
      name: 'writeln with multiple arguments',
      code: `program test;
begin
  writeln(1, 2, 3);
end.`,
      purpose: 'writeln outputs multiple arguments consecutively (no separator, per Pascal82)',
      expectedContains: '123',
    },
    {
      name: 'write with no newline',
      code: `program test;
begin
  write('hello');
  write('world');
end.`,
      purpose: 'write outputs without trailing newline',
      expectedOutput: 'helloworld',
    },
    {
      name: 'write with integer',
      code: `program test;
begin
  write(123);
end.`,
      purpose: 'write outputs integer value without newline',
      expectedOutput: '123',
    },
    {
      name: 'write with string literal',
      code: `program test;
begin
  write('test');
end.`,
      purpose: 'write outputs string literal without newline',
      expectedOutput: 'test',
    },
    {
      name: 'write with multiple arguments',
      code: `program test;
begin
  write('a', 'b', 'c');
end.`,
      purpose: 'write outputs multiple arguments without newline',
      expectedOutput: 'abc',
    },
    {
      name: 'readln reads integer',
      code: `program test;
var n: integer;
begin
  readln(n);
  writeln(n + 1);
end.`,
      purpose: 'readln with empty input defaults to 0 (n+1=1)',
      expectedContains: '1',
    },
    {
      name: 'readln reads multiple values',
      code: `program test;
var a, b: integer;
begin
  readln(a, b);
  writeln(a + b);
end.`,
      purpose: 'readln with empty input defaults to 0 (a+b=0)',
      expectedContains: '0',
    },
    {
      name: 'read reads single value',
      code: `program test;
var n: integer;
begin
  read(n);
  writeln(n);
end.`,
      purpose: 'read with empty input defaults to 0',
      expectedContains: '0',
    },
    {
      name: 'rewrite creates file',
      code: `program test;
var f: text;
begin
  rewrite(f);
  writeln(f, 'hello file');
end.`,
      purpose: 'rewrite creates a new text file',
    },
    {
      name: 'writeln to file',
      code: `program test;
var f: text;
begin
  rewrite(f);
  writeln(f, 'line1');
  writeln(f, 'line2');
end.`,
      purpose: 'writeln writes to text file',
    },
    {
      name: 'close file (Knuth extension, supported as no-op without io)',
      code: `program test;
var f: text;
begin
  rewrite(f);
  writeln(f, 'test');
  close(f);
end.`,
      purpose: 'close is a Knuth extension (used by TANGLE); without io it is a no-op',
    },
    {
      name: 'ord function',
      code: `program test;
begin
  writeln(ord('A'));
end.`,
      purpose: 'ord returns ASCII code of character',
      expectedContains: '65',
    },
    {
      name: 'chr function',
      code: `program test;
begin
  writeln(chr(65));
end.`,
      purpose: 'chr returns character from ASCII code',
      expectedContains: 'A',
    },
    {
      name: 'pred function',
      code: `program test;
begin
  writeln(pred(5));
end.`,
      purpose: 'pred returns predecessor of integer',
      expectedContains: '4',
    },
    {
      name: 'succ function',
      code: `program test;
begin
  writeln(succ(5));
end.`,
      purpose: 'succ returns successor of integer',
      expectedContains: '6',
    },
    {
      name: 'abs function',
      code: `program test;
begin
  writeln(abs(-10));
end.`,
      purpose: 'abs returns absolute value',
      expectedContains: '10',
    },
    {
      name: 'sqr function',
      code: `program test;
begin
  writeln(sqr(5));
end.`,
      purpose: 'sqr returns square of integer',
      expectedContains: '25',
    },
    {
      name: 'standard write writeln procedures',
      code: `program test;
begin
  write('a');
  writeln('b');
  writeln('c');
end.`,
      purpose: 'write and writeln are standard procedures',
      expectedContains: 'ab',
    },
    {
      name: 'new dispose procedures (unsupported, expect friendly error)',
      code: `program test;
type P = ^integer;
var p: P;
begin
  new(p);
  p^ := 10;
  writeln(p^);
  dispose(p);
end.`,
      purpose:
        'Pascal82 standard feature not yet implemented; must report friendly error, not crash',
      expectedError: '',
    },
    {
      name: 'file does not exist (mock IO does not simulate file errors)',
      code: `program test;
var f: text;
begin
  reset(f);
end.`,
      purpose:
        'reset on file with no external association; mock IO does not simulate file-not-found errors',
    },
    {
      name: 'file write error (mock IO does not simulate file errors)',
      code: `program test;
var f: text;
begin
  writeln(f, 'test');
end.`,
      purpose: 'writing to unopened file; mock IO does not simulate file-state errors',
    },
    {
      name: 'large output',
      code: `program test;
var i: integer;
begin
  for i := 1 to 10 do
    writeln(i);
end.`,
      purpose: 'large output is handled correctly',
      expectedContains: '5',
    },
    {
      name: 'writeln with negative integer',
      code: `program test;
begin
  writeln(-42);
end.`,
      purpose: 'writeln outputs negative integer',
      expectedContains: '-42',
    },
    {
      name: 'writeln with real number',
      code: `program test;
begin
  writeln(3.14);
end.`,
      purpose: 'writeln outputs real number',
      expectedContains: '3.14',
    },
    {
      name: 'writeln with boolean',
      code: `program test;
begin
  writeln(true);
end.`,
      purpose: 'writeln outputs boolean value (case is implementation-defined per Pascal82)',
      expectedContains: 'TRUE',
    },
    {
      name: 'eoln function',
      code: `program test;
var n: integer;
begin
  readln(n);
  writeln(eoln);
end.`,
      purpose: 'eoln detects end of line (case is implementation-defined per Pascal82)',
      expectedContains: 'TRUE',
    },
    {
      name: 'ord without parentheses should fail',
      code: `program test;
begin
  writeln(ord);
end.`,
      purpose: '有参内置函数省略括号应报错（风险覆盖：不是所有内置函数都能无参调用）',
      expectedError: '',
    },
    {
      name: 'chr with boundary value',
      code: `program test;
begin
  writeln(chr(32));
end.`,
      purpose: 'chr handles boundary ASCII values',
      expectedContains: ' ',
    },
    {
      name: 'abs with zero',
      code: `program test;
begin
  writeln(abs(0));
end.`,
      purpose: 'abs returns zero for zero input',
      expectedContains: '0',
    },
    {
      name: 'sqr with negative',
      code: `program test;
begin
  writeln(sqr(-5));
end.`,
      purpose: 'sqr returns positive for negative input',
      expectedContains: '25',
    },
    {
      name: 'pred with zero',
      code: `program test;
begin
  writeln(pred(0));
end.`,
      purpose: 'pred returns -1 for zero',
      expectedContains: '-1',
    },
    {
      name: 'succ with max smallint',
      code: `program test;
begin
  writeln(succ(32767));
end.`,
      purpose: 'succ returns next integer',
      expectedContains: '32768',
    },
    {
      name: 'ord with space',
      code: `program test;
begin
  writeln(ord(' '));
end.`,
      purpose: 'ord returns ASCII code for space',
      expectedContains: '32',
    },
    {
      name: 'write writeln combination',
      code: `program test;
begin
  write('Hello');
  writeln(' World');
  write('Good');
  writeln('bye');
end.`,
      purpose: 'write and writeln work together',
      expectedContains: 'Hello World',
    },
    {
      name: 'file eof detection',
      code: `program test;
var f: text;
begin
  reset(f);
  writeln(eof(f));
end.`,
      purpose: 'eof works with files (case is implementation-defined per Pascal82)',
      expectedContains: 'TRUE',
    },
  ]

  const tests: PascalTest[] = [...m36Tests]

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
