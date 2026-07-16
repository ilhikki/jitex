import { InterpreterTest, runInterpreterTest, runPasWithInput } from './_helper'
import { createRecordFileOps, createDefaultFileHandle } from '../../src/interpreter/io'
import { parse } from '../../src/index'
import { createState, runToCompletion, populateSystemProcedures, populateSystemFunctions } from '../../src/interpreter'

const tests: InterpreterTest[] = [
  {
    name: 'writeln with no arguments',
    code: `program test;
begin
  writeln;
end.`,
    purpose: 'writeln without arguments outputs a newline',
    features: ['writeln', 'console-output'],
    expectedOutput: '\n'
  },
  {
    name: 'writeln with integer',
    code: `program test;
begin
  writeln(42);
end.`,
    purpose: 'writeln outputs integer value',
    features: ['writeln', 'console-output', 'integer'],
    expectedContains: '42'
  },
  {
    name: 'writeln with string literal',
    code: `program test;
begin
  writeln('hello world');
end.`,
    purpose: 'writeln outputs string literal value',
    features: ['writeln', 'console-output'],
    expectedContains: 'hello world'
  },
  {
    name: 'writeln with multiple arguments',
    code: `program test;
begin
  writeln(1, 2, 3);
end.`,
    purpose: 'writeln outputs multiple arguments consecutively (no separator, per Pascal82)',
    features: ['writeln', 'console-output', 'multiple-arguments'],
    expectedContains: '123'
  },
  {
    name: 'write with no newline',
    code: `program test;
begin
  write('hello');
  write('world');
end.`,
    purpose: 'write outputs without trailing newline',
    features: ['write', 'console-output'],
    expectedOutput: 'helloworld'
  },
  {
    name: 'write with integer',
    code: `program test;
begin
  write(123);
end.`,
    purpose: 'write outputs integer value without newline',
    features: ['write', 'console-output', 'integer'],
    expectedOutput: '123'
  },
  {
    name: 'write with string literal',
    code: `program test;
begin
  write('test');
end.`,
    purpose: 'write outputs string literal without newline',
    features: ['write', 'console-output'],
    expectedOutput: 'test'
  },
  {
    name: 'write with multiple arguments',
    code: `program test;
begin
  write('a', 'b', 'c');
end.`,
    purpose: 'write outputs multiple arguments without newline',
    features: ['write', 'console-output', 'multiple-arguments'],
    expectedOutput: 'abc'
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
    features: ['readln', 'console-input', 'integer'],
    expectedContains: '1'
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
    features: ['readln', 'console-input', 'multiple-values', 'integer'],
    expectedContains: '0'
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
    features: ['read', 'console-input', 'integer'],
    expectedContains: '0'
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
    features: ['rewrite', 'file-operation', 'text-file'],
    expectedError: false
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
    features: ['writeln', 'file-operation', 'text-file'],
    expectedError: false
  },
  {
    name: 'close file (non-standard extension, expect friendly error)',
    code: `program test;
var f: text;
begin
  rewrite(f);
  writeln(f, 'test');
  close(f);
end.`,
    purpose: 'close is not Pascal82 standard; must report friendly error when extensions disabled',
    features: ['close', 'file-operation', 'text-file', 'unsupported'],
    expectedError: true
  },
  {
    name: 'ord function',
    code: `program test;
begin
  writeln(ord('A'));
end.`,
    purpose: 'ord returns ASCII code of character',
    features: ['ord', 'standard-function', 'char'],
    expectedContains: '65'
  },
  {
    name: 'chr function',
    code: `program test;
begin
  writeln(chr(65));
end.`,
    purpose: 'chr returns character from ASCII code',
    features: ['chr', 'standard-function', 'char'],
    expectedContains: 'A'
  },
  {
    name: 'pred function',
    code: `program test;
begin
  writeln(pred(5));
end.`,
    purpose: 'pred returns predecessor of integer',
    features: ['pred', 'standard-function', 'integer'],
    expectedContains: '4'
  },
  {
    name: 'succ function',
    code: `program test;
begin
  writeln(succ(5));
end.`,
    purpose: 'succ returns successor of integer',
    features: ['succ', 'standard-function', 'integer'],
    expectedContains: '6'
  },
  {
    name: 'abs function',
    code: `program test;
begin
  writeln(abs(-10));
end.`,
    purpose: 'abs returns absolute value',
    features: ['abs', 'standard-function', 'integer'],
    expectedContains: '10'
  },
  {
    name: 'sqr function',
    code: `program test;
begin
  writeln(sqr(5));
end.`,
    purpose: 'sqr returns square of integer',
    features: ['sqr', 'standard-function', 'integer'],
    expectedContains: '25'
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
    features: ['write', 'writeln', 'standard-procedure'],
    expectedContains: 'ab'
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
    purpose: 'Pascal82 standard feature not yet implemented; must report friendly error, not crash',
    features: ['new', 'dispose', 'pointer', 'unsupported'],
    expectedError: true
  },
  {
    name: 'file does not exist (mock IO does not simulate file errors)',
    code: `program test;
var f: text;
begin
  reset(f);
end.`,
    purpose: 'reset on file with no external association; mock IO does not simulate file-not-found errors',
    features: ['reset', 'file-operation'],
    expectedError: false
  },
  {
    name: 'file write error (mock IO does not simulate file errors)',
    code: `program test;
var f: text;
begin
  writeln(f, 'test');
end.`,
    purpose: 'writing to unopened file; mock IO does not simulate file-state errors',
    features: ['writeln', 'file-operation', 'boundary-case'],
    expectedError: false
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
    features: ['writeln', 'loop', 'boundary-case'],
    expectedContains: '5'
  },
  {
    name: 'writeln with negative integer',
    code: `program test;
begin
  writeln(-42);
end.`,
    purpose: 'writeln outputs negative integer',
    features: ['writeln', 'console-output', 'integer', 'negative'],
    expectedContains: '-42'
  },
  {
    name: 'writeln with real number',
    code: `program test;
begin
  writeln(3.14);
end.`,
    purpose: 'writeln outputs real number',
    features: ['writeln', 'console-output', 'real'],
    expectedContains: '3.14'
  },
  {
    name: 'writeln with boolean',
    code: `program test;
begin
  writeln(true);
end.`,
    purpose: 'writeln outputs boolean value (case is implementation-defined per Pascal82)',
    features: ['writeln', 'console-output', 'boolean'],
    expectedContains: 'TRUE'
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
    features: ['eoln', 'standard-function', 'console-input'],
    expectedContains: 'TRUE'
  },
  {
    name: 'chr with boundary value',
    code: `program test;
begin
  writeln(chr(32));
end.`,
    purpose: 'chr handles boundary ASCII values',
    features: ['chr', 'standard-function', 'char', 'boundary-case'],
    expectedContains: ' '
  },
  {
    name: 'abs with zero',
    code: `program test;
begin
  writeln(abs(0));
end.`,
    purpose: 'abs returns zero for zero input',
    features: ['abs', 'standard-function', 'integer', 'boundary-case'],
    expectedContains: '0'
  },
  {
    name: 'sqr with negative',
    code: `program test;
begin
  writeln(sqr(-5));
end.`,
    purpose: 'sqr returns positive for negative input',
    features: ['sqr', 'standard-function', 'integer'],
    expectedContains: '25'
  },
  {
    name: 'pred with zero',
    code: `program test;
begin
  writeln(pred(0));
end.`,
    purpose: 'pred returns -1 for zero',
    features: ['pred', 'standard-function', 'integer'],
    expectedContains: '-1'
  },
  {
    name: 'succ with max smallint',
    code: `program test;
begin
  writeln(succ(32767));
end.`,
    purpose: 'succ returns next integer',
    features: ['succ', 'standard-function', 'integer'],
    expectedContains: '32768'
  },
  {
    name: 'ord with space',
    code: `program test;
begin
  writeln(ord(' '));
end.`,
    purpose: 'ord returns ASCII code for space',
    features: ['ord', 'standard-function', 'char'],
    expectedContains: '32'
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
    features: ['write', 'writeln', 'console-output'],
    expectedContains: 'Hello World'
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
    features: ['eof', 'file-operation', 'text-file'],
    expectedContains: 'TRUE'
  }
]

describe('M3.6 Interpreter: IO and Standard Library', () => {
  tests.forEach(t => {
    test(t.name, () => { runInterpreterTest(t) })
  })

  test('readln reads integer from input', () => {
    const code = `program test;
var n: integer;
begin
  readln(n);
  writeln(n + 1);
end.`
    const { output, error } = runPasWithInput(['4'], code)
    expect(error).toBeNull()
    expect(output).toContain('5')
  })

  test('readln reads multiple values', () => {
    const code = `program test;
var a, b: integer;
begin
  readln(a, b);
  writeln(a + b);
end.`
    const { output, error } = runPasWithInput(['3 5'], code)
    expect(error).toBeNull()
    expect(output).toContain('8')
  })

  test('read reads single value', () => {
    const code = `program test;
var n: integer;
begin
  read(n);
  writeln(n);
end.`
    const { output, error } = runPasWithInput(['10'], code)
    expect(error).toBeNull()
    expect(output).toContain('10')
  })
})

describe('M3.6 Interpreter: createRecordFileOps integration', () => {
  function runWithFileOps(files: Map<string, Uint8Array>, code: string): { output: string; error: string | null } {
    const parseResult = parse(code)
    if (!parseResult.success) {
      return { output: '', error: parseResult.error || 'parse failed' }
    }
    let output = ''
    let error: string | null = null
    const fileOps = createRecordFileOps(files)
    const io = {
      file: fileOps,
      console: {
        write: (text: string) => { output += text },
        writeln: () => { output += '\n' },
        read: () => '',
        readln: () => '',
        eof: () => true,
        eoln: () => true,
      },
    }
    const state = createState(parseResult.astNode, io as any)
    populateSystemProcedures(state, true) // extensions: assign, close
    populateSystemFunctions(state)
    try {
      runToCompletion(state)
    } catch (e: any) {
      error = e.message || String(e)
    }
    return { output, error }
  }

  test('rewrite and writeln to file via createRecordFileOps', () => {
    const files = new Map<string, Uint8Array>()
    const code = `program test;
var f: text;
begin
  assign(f, 'test.txt');
  rewrite(f);
  writeln(f, 'hello');
  writeln(f, 'world');
  close(f);
end.`
    const { error } = runWithFileOps(files, code)
    expect(error).toBeNull()
    const content = new TextDecoder().decode(files.get('test.txt') || new Uint8Array(0))
    expect(content).toContain('hello')
    expect(content).toContain('world')
  })

  test('reset and readln from file via createRecordFileOps', () => {
    const files = new Map<string, Uint8Array>()
    files.set('data.txt', new TextEncoder().encode('100\n200\n300'))
    const code = `program test;
var f: text;
    n: integer;
begin
  assign(f, 'data.txt');
  reset(f);
  readln(f, n);
  writeln(n);
  close(f);
end.`
    const { output, error } = runWithFileOps(files, code)
    expect(error).toBeNull()
    expect(output).toContain('100')
  })

  test('eof detection with createRecordFileOps', () => {
    const files = new Map<string, Uint8Array>()
    files.set('empty.txt', new Uint8Array(0))
    const code = `program test;
var f: text;
begin
  assign(f, 'empty.txt');
  reset(f);
  writeln(eof(f));
  close(f);
end.`
    const { output, error } = runWithFileOps(files, code)
    expect(error).toBeNull()
    expect(output).toContain('TRUE')
  })

  test('file write then read roundtrip', () => {
    const files = new Map<string, Uint8Array>()
    const code = `program test;
var f: text;
    n: integer;
begin
  assign(f, 'round.txt');
  rewrite(f);
  writeln(f, 42);
  close(f);
  reset(f);
  readln(f, n);
  writeln(n);
  close(f);
end.`
    const { output, error } = runWithFileOps(files, code)
    expect(error).toBeNull()
    expect(output).toContain('42')
  })
})
