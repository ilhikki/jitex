import { InterpreterTest, runInterpreterTest, runPasWithInput } from './_helper'

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
    name: 'writeln with string',
    code: `program test;
begin
  writeln('hello world');
end.`,
    purpose: 'writeln outputs string value',
    features: ['writeln', 'console-output', 'string'],
    expectedContains: 'hello world'
  },
  {
    name: 'writeln with multiple arguments',
    code: `program test;
begin
  writeln(1, 2, 3);
end.`,
    purpose: 'writeln outputs multiple arguments separated by spaces',
    features: ['writeln', 'console-output', 'multiple-arguments'],
    expectedContains: '1 2 3'
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
    name: 'write with string',
    code: `program test;
begin
  write('test');
end.`,
    purpose: 'write outputs string value without newline',
    features: ['write', 'console-output', 'string'],
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
    name: 'readln reads a line',
    code: `program test;
var s: string;
begin
  readln(s);
  writeln(s);
end.`,
    purpose: 'readln reads a line from input',
    features: ['readln', 'console-input', 'string'],
    expectedContains: 'input'
  },
  {
    name: 'readln reads integer',
    code: `program test;
var n: integer;
begin
  readln(n);
  writeln(n + 1);
end.`,
    purpose: 'readln reads integer from input',
    features: ['readln', 'console-input', 'integer'],
    expectedContains: '5'
  },
  {
    name: 'readln reads multiple values',
    code: `program test;
var a, b: integer;
begin
  readln(a, b);
  writeln(a + b);
end.`,
    purpose: 'readln reads multiple values from input',
    features: ['readln', 'console-input', 'multiple-values', 'integer'],
    expectedContains: '8'
  },
  {
    name: 'read reads single value',
    code: `program test;
var n: integer;
begin
  read(n);
  writeln(n);
end.`,
    purpose: 'read reads a single value',
    features: ['read', 'console-input', 'integer'],
    expectedContains: '10'
  },
  {
    name: 'readln in loop',
    code: `program test;
var i: integer;
    s: string;
begin
  for i := 1 to 3 do
  begin
    readln(s);
    writeln(i, ': ', s);
  end;
end.`,
    purpose: 'readln works correctly in a loop',
    features: ['readln', 'console-input', 'loop', 'string'],
    expectedContains: '2: line2'
  },
  {
    name: 'eof detection',
    code: `program test;
var s: string;
begin
  while not eof do
  begin
    readln(s);
    writeln(s);
  end;
end.`,
    purpose: 'eof function detects end of input',
    features: ['eof', 'console-input', 'loop', 'string'],
    expectedContains: 'line1'
  },
  {
    name: 'rewrite creates file',
    code: `program test;
var f: text;
begin
  rewrite(f);
  writeln(f, 'hello file');
  close(f);
end.`,
    purpose: 'rewrite creates a new text file',
    features: ['rewrite', 'file-operation', 'text-file'],
    expectedError: false
  },
  {
    name: 'reset opens existing file',
    code: `program test;
var f: text;
    s: string;
begin
  reset(f);
  readln(f, s);
  writeln(s);
  close(f);
end.`,
    purpose: 'reset opens an existing file for reading',
    features: ['reset', 'file-operation', 'text-file'],
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
  close(f);
end.`,
    purpose: 'writeln writes to text file',
    features: ['writeln', 'file-operation', 'text-file'],
    expectedError: false
  },
  {
    name: 'readln from file',
    code: `program test;
var f: text;
    s: string;
begin
  reset(f);
  readln(f, s);
  writeln(s);
  close(f);
end.`,
    purpose: 'readln reads from text file',
    features: ['readln', 'file-operation', 'text-file'],
    expectedError: false
  },
  {
    name: 'close file',
    code: `program test;
var f: text;
begin
  rewrite(f);
  writeln(f, 'test');
  close(f);
end.`,
    purpose: 'close properly closes a file',
    features: ['close', 'file-operation', 'text-file'],
    expectedError: false
  },
  {
    name: 'file operations in procedure',
    code: `program test;
var f: text;
procedure writeFile(s: string);
begin
  rewrite(f);
  writeln(f, s);
  close(f);
end;
begin
  writeFile('from procedure');
end.`,
    purpose: 'file operations work within procedures',
    features: ['file-operation', 'procedure', 'text-file'],
    expectedError: false
  },
  {
    name: 'length function',
    code: `program test;
begin
  writeln(length('hello'));
end.`,
    purpose: 'length returns string length',
    features: ['length', 'standard-function', 'string'],
    expectedContains: '5'
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
    name: 'standard read readln procedures',
    code: `program test;
var x: integer;
begin
  read(x);
  writeln(x);
end.`,
    purpose: 'read and readln are standard procedures',
    features: ['read', 'readln', 'standard-procedure'],
    expectedContains: '7'
  },
  {
    name: 'new dispose procedures',
    code: `program test;
type P = ^integer;
var p: P;
begin
  new(p);
  p^ := 10;
  writeln(p^);
  dispose(p);
end.`,
    purpose: 'new and dispose manage dynamic memory',
    features: ['new', 'dispose', 'standard-procedure', 'pointer'],
    expectedContains: '10'
  },
  {
    name: 'mark release procedures',
    code: `program test;
begin
  mark;
  writeln('marked');
  release;
end.`,
    purpose: 'mark and release manage memory stack',
    features: ['mark', 'release', 'standard-procedure'],
    expectedContains: 'marked'
  },
  {
    name: 'read from empty file',
    code: `program test;
var f: text;
    s: string;
begin
  reset(f);
  if eof(f) then
    writeln('empty')
  else
    readln(f, s);
  close(f);
end.`,
    purpose: 'reading from empty file is handled',
    features: ['file-operation', 'eof', 'boundary-case'],
    expectedContains: 'empty'
  },
  {
    name: 'file does not exist',
    code: `program test;
var f: text;
begin
  reset(f);
  close(f);
end.`,
    purpose: 'opening non-existent file should error',
    features: ['reset', 'file-operation', 'error', 'boundary-case'],
    expectedError: true
  },
  {
    name: 'file write error',
    code: `program test;
var f: text;
begin
  writeln(f, 'test');
end.`,
    purpose: 'writing to unopened file should error',
    features: ['writeln', 'file-operation', 'error', 'boundary-case'],
    expectedError: true
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
    purpose: 'writeln outputs boolean value',
    features: ['writeln', 'console-output', 'boolean'],
    expectedContains: 'true'
  },
  {
    name: 'readln with empty input',
    code: `program test;
var s: string;
begin
  readln(s);
  writeln('len:', length(s));
end.`,
    purpose: 'readln handles empty input line',
    features: ['readln', 'console-input', 'string', 'boundary-case'],
    expectedContains: 'len:0'
  },
  {
    name: 'eoln function',
    code: `program test;
var s: string;
begin
  readln(s);
  writeln(eoln);
end.`,
    purpose: 'eoln detects end of line',
    features: ['eoln', 'standard-function', 'console-input'],
    expectedContains: 'true'
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
    name: 'length with empty string',
    code: `program test;
begin
  writeln(length(''));
end.`,
    purpose: 'length returns zero for empty string',
    features: ['length', 'standard-function', 'string', 'boundary-case'],
    expectedContains: '0'
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
    name: 'multiple readln calls',
    code: `program test;
var a, b: string;
begin
  readln(a);
  readln(b);
  writeln(a, ' ', b);
end.`,
    purpose: 'multiple readln calls work correctly',
    features: ['readln', 'console-input', 'string'],
    expectedContains: 'first second'
  },
  {
    name: 'file eof detection',
    code: `program test;
var f: text;
begin
  reset(f);
  writeln(eof(f));
  close(f);
end.`,
    purpose: 'eof works with files',
    features: ['eof', 'file-operation', 'text-file'],
    expectedContains: 'true'
  }
]

describe('M3.6 Interpreter: IO and Standard Library', () => {
  tests.forEach(t => {
    test(t.name, () => { runInterpreterTest(t) })
  })

  test('readln reads a line from input', () => {
    const code = `program test;
var s: string;
begin
  readln(s);
  writeln(s);
end.`
    const { output, error } = runPasWithInput(['input line'], code)
    expect(error).toBeNull()
    expect(output).toContain('input line')
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

  test('readln in loop', () => {
    const code = `program test;
var i: integer;
    s: string;
begin
  for i := 1 to 3 do
  begin
    readln(s);
    writeln(i, ': ', s);
  end;
end.`
    const { output, error } = runPasWithInput(['line1', 'line2', 'line3'], code)
    expect(error).toBeNull()
    expect(output).toContain('2: line2')
  })

  test('eof detection with multiple lines', () => {
    const code = `program test;
var s: string;
begin
  while not eof do
  begin
    readln(s);
    writeln(s);
  end;
end.`
    const { output, error } = runPasWithInput(['line1', 'line2'], code)
    expect(error).toBeNull()
    expect(output).toContain('line1')
    expect(output).toContain('line2')
  })

  test('readln with empty input line', () => {
    const code = `program test;
var s: string;
begin
  readln(s);
  writeln('len:', length(s));
end.`
    const { output, error } = runPasWithInput([''], code)
    expect(error).toBeNull()
    expect(output).toContain('len:0')
  })

  test('multiple readln calls', () => {
    const code = `program test;
var a, b: string;
begin
  readln(a);
  readln(b);
  writeln(a, ' ', b);
end.`
    const { output, error } = runPasWithInput(['first', 'second'], code)
    expect(error).toBeNull()
    expect(output).toContain('first second')
  })
})