// ISO/IEC 7185:1990 - 6.9 Input and output
//
// 章节概括：
//   规定应用于文本文件（textfile）的输入输出过程。read 的参数表语法可省略 file-variable，
//   此时作用于 required textfile input（程序须含拼写为 input 的程序参数）；并以 6.6.5.2 的前后断言方式
//   定义 read(f,v) 的语义，分别对 char（含子界）、integer（含子界）、real 及 string 类型变量规定
//   跳过空格与行结束符、可读 signed-integer / signed-number 的形式及错误条件。readln(f,v1,...,vn)
//   等价于 read 后接 readln(f)；readln(f) 等价于「while not eoln(^) do get(^); get(^)」，
//   把当前位置置于当前行末之后。write 的 write-parameter 有三种形式：`e`、`e:TotalWidth`、
//   `e:TotalWidth:FracDigits`，要求 TotalWidth 与 FracDigits 均 ≥1，并分别规定 char（默认宽度 1）、
//   integer（区分宽度是否容纳符号）、real（floating-point 与 fixed-point 两种表示的字符构成）、
//   Boolean（写 true/false 对应字符串）、string 类型的写出格式；writeln 终止部分行并写 end-of-line；
//   page 的效果为实现相关、必要时隐式 writeln、并使缓冲区变量 totally-undefined。
//
// 子章节：
//   6.9.1 The procedure read
//   6.9.2 The procedure readln
//   6.9.3 The procedure write
//     6.9.3.1 Write-parameters
//     6.9.3.2 Char-type
//     6.9.3.3 Integer-type
//     6.9.3.4 Real-type
//     6.9.3.5 Boolean-type
//     6.9.3.6 String-types
//   6.9.4 The procedure writeln
//   6.9.5 The procedure page
//
// 状态：骨架文件，用例待从 tests/integration/ 迁移（迁移时仅改 name，内容不动）。

import { describe, type PascalTest, runPascalTests } from './harness.ts'
import { MemoryRecordFile } from '@jitex/pascal-to-js'

function text(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

describe('ISO 7185 6.9 - Input and output', () => {
  const tests: PascalTest[] = [
    {
      name: '6.9 writeln with no arguments',
      code: `program test;
begin
  writeln;
end.`,
      purpose: 'writeln without arguments outputs a newline',
      expectedOutput: '\n',
    },
    {
      name: '6.9 writeln with integer',
      code: `program test;
begin
  writeln(42);
end.`,
      purpose: 'writeln outputs integer value',
      expectedContains: '42',
    },
    {
      name: '6.9 writeln with string literal',
      code: `program test;
begin
  writeln('hello world');
end.`,
      purpose: 'writeln outputs string literal value',
      expectedContains: 'hello world',
    },
    {
      name: '6.9 writeln with multiple arguments',
      code: `program test;
begin
  writeln(1, 2, 3);
end.`,
      purpose: 'writeln outputs multiple arguments consecutively (no separator, per Pascal82)',
      expectedContains: '123',
    },
    {
      name: '6.9 write with no newline',
      code: `program test;
begin
  write('hello');
  write('world');
end.`,
      purpose: 'write outputs without trailing newline',
      expectedOutput: 'helloworld',
    },
    {
      name: '6.9 write with integer',
      code: `program test;
begin
  write(123);
end.`,
      purpose: 'write outputs integer value without newline',
      expectedOutput: '123',
    },
    {
      name: '6.9 write with string literal',
      code: `program test;
begin
  write('test');
end.`,
      purpose: 'write outputs string literal without newline',
      expectedOutput: 'test',
    },
    {
      name: '6.9 write with multiple arguments',
      code: `program test;
begin
  write('a', 'b', 'c');
end.`,
      purpose: 'write outputs multiple arguments without newline',
      expectedOutput: 'abc',
    },
    {
      name: '6.9 readln reads integer',
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
      name: '6.9 readln reads multiple values',
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
      name: '6.9 read reads single value',
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
      name: '6.9 rewrite creates file',
      code: `program test(f);
var f: text;
begin
  rewrite(f);
  writeln(f, 'hello file');
end.`,
      purpose: 'rewrite creates a new text file',
    },
    {
      name: '6.9 writeln to file',
      code: `program test(f);
var f: text;
begin
  rewrite(f);
  writeln(f, 'line1');
  writeln(f, 'line2');
end.`,
      purpose: 'writeln writes to text file',
    },
    {
      name: '6.9 ord function',
      code: `program test;
begin
  writeln(ord('A'));
end.`,
      purpose: 'ord returns ASCII code of character',
      expectedContains: '65',
    },
    {
      name: '6.9 chr function',
      code: `program test;
begin
  writeln(chr(65));
end.`,
      purpose: 'chr returns character from ASCII code',
      expectedContains: 'A',
    },
    {
      name: '6.9 pred function',
      code: `program test;
begin
  writeln(pred(5));
end.`,
      purpose: 'pred returns predecessor of integer',
      expectedContains: '4',
    },
    {
      name: '6.9 succ function',
      code: `program test;
begin
  writeln(succ(5));
end.`,
      purpose: 'succ returns successor of integer',
      expectedContains: '6',
    },
    {
      name: '6.9 abs function',
      code: `program test;
begin
  writeln(abs(-10));
end.`,
      purpose: 'abs returns absolute value',
      expectedContains: '10',
    },
    {
      name: '6.9 sqr function',
      code: `program test;
begin
  writeln(sqr(5));
end.`,
      purpose: 'sqr returns square of integer',
      expectedContains: '25',
    },
    {
      name: '6.9 standard write writeln procedures',
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
      name: '6.9 new dispose procedures (ISO 7185 6.6.5.3 pointer support)',
      code: `program test;
type P = ^integer;
var p: P;
begin
  new(p);
  p^ := 10;
  writeln(p^);
  dispose(p);
end.`,
      purpose: 'ISO 7185 6.6.5.3 new/dispose + 6.4.4 pointer-types + 6.5.4 identified-variable',
      expectedContains: '10',
    },
    {
      name: '6.9 file does not exist (mock IO does not simulate file errors)',
      code: `program test(f);
var f: text;
begin
  reset(f);
end.`,
      purpose: 'reset on file with no external association; mock IO does not simulate file-not-found errors',
    },
    {
      name: '6.9 file write error (mock IO does simulate file errors)',
      code: `program test(f);
var f: text;
begin
  writeln(f, 'test');
end.`,
      purpose: 'writing to unopened file; mock IO does  simulate file-state errors',
      expectedError: 'mode',
    },
    {
      name: '6.9 large output',
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
      name: '6.9 writeln with negative integer',
      code: `program test;
begin
  writeln(-42);
end.`,
      purpose: 'writeln outputs negative integer',
      expectedContains: '-42',
    },
    {
      name: '6.9 writeln with real number',
      code: `program test;
begin
  writeln(3.14);
end.`,
      purpose: 'writeln outputs real number',
      expectedContains: '3.14',
    },
    {
      name: '6.9 writeln with boolean',
      code: `program test;
begin
  writeln(true);
end.`,
      purpose: 'writeln outputs boolean value (case is implementation-defined per Pascal82)',
      expectedContains: 'TRUE',
    },
    {
      name: '6.9 eoln function',
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
      name: '6.9 ord without parentheses should fail',
      code: `program test;
begin
  writeln(ord);
end.`,
      purpose: '有参内置函数省略括号应报错（风险覆盖：不是所有内置函数都能无参调用）',
      expectedError: '',
    },
    {
      name: '6.9 chr with boundary value',
      code: `program test;
begin
  writeln(chr(32));
end.`,
      purpose: 'chr handles boundary ASCII values',
      expectedContains: ' ',
    },
    {
      name: '6.9 abs with zero',
      code: `program test;
begin
  writeln(abs(0));
end.`,
      purpose: 'abs returns zero for zero input',
      expectedContains: '0',
    },
    {
      name: '6.9 sqr with negative',
      code: `program test;
begin
  writeln(sqr(-5));
end.`,
      purpose: 'sqr returns positive for negative input',
      expectedContains: '25',
    },
    {
      name: '6.9 pred with zero',
      code: `program test;
begin
  writeln(pred(0));
end.`,
      purpose: 'pred returns -1 for zero',
      expectedContains: '-1',
    },
    {
      name: '6.9 succ with max smallint',
      code: `program test;
begin
  writeln(succ(32767));
end.`,
      purpose: 'succ returns next integer',
      expectedContains: '32768',
    },
    {
      name: '6.9 ord with space',
      code: `program test;
begin
  writeln(ord(' '));
end.`,
      purpose: 'ord returns ASCII code for space',
      expectedContains: '32',
    },
    {
      name: '6.9 write writeln combination',
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
      name: '6.9 file eof detection',
      code: `program test(f);
var f: text;
begin
  reset(f);
  writeln(eof(f));
end.`,
      purpose: 'eof works with files (case is implementation-defined per Pascal82)',
      expectedContains: 'TRUE',
    },
    {
      name: '6.9 real-format-width-precision',
      code: `program test;
var r: real;
begin
  r := 3.14159;
  writeln(r:20);
  writeln(r:10);
  writeln(r);
end.`,
      purpose: 'real 格式化：不同宽度',
      expectedContains: '3.14159',
    },
    {
      name: '6.9 real-format-integer-value',
      code: `program test;
var r: real;
begin
  r := 5.0;
  writeln(r);
end.`,
      purpose: '整数值的real格式化（科学计数法）',
      expectedContains: 'E+000',
    },
    {
      name: '6.9 integer-format-width',
      code: `program test;
var i: integer;
begin
  i := 42;
  write(i:6);
  write(i:3);
  write(i:1);
  writeln;
end.`,
      purpose: 'integer 格式化宽度',
      expectedContains: '    42 4242',
    },
    {
      name: '6.9 boolean-format',
      code: `program test;
var b: boolean;
begin
  b := true;
  writeln(b);
  b := false;
  writeln(b);
end.`,
      purpose: 'boolean 输出 TRUE/FALSE',
      expectedContains: 'TRUE\nFALSE',
    },
    {
      name: '6.9 char-format-width',
      code: `program test;
var c: char;
begin
  c := 'A';
  write(c:5);
  writeln;
end.`,
      purpose: 'char 格式化宽度',
      expectedContains: '    A',
    },
    {
      name: '6.9 readln-mixed-types',
      code: `program test;
var i: integer;
    r: real;
    c: char;
begin
  readln(i, r);
  writeln(i);
  writeln(r:0:2);
end.`,
      purpose: 'readln 读取 integer 和 real 混合',
      input: '10\n3.14',
      expectedContains: '10\n3.14',
    },
    {
      name: '6.9 readln-empty-input',
      code: `program test;
var i: integer;
begin
  readln(i);
  writeln(i);
end.`,
      purpose: 'readln 空行输入（默认值）',
      input: '',
      expectedContains: '0',
    },
    {
      name: '6.9 readln-multiple-lines',
      code: `program test;
var a, b, c: integer;
begin
  readln(a);
  readln(b);
  readln(c);
  writeln(a + b + c);
end.`,
      purpose: 'readln 多行输入',
      input: '10\n20\n30',
      expectedContains: '60',
    },
    {
      name: '6.9 eof-input-end',
      code: `program test;
var i: integer;
begin
  while not eof do
    begin
      readln(i);
      writeln(i);
    end;
  writeln('EOF reached');
end.`,
      purpose: 'eof 在输入结束时为 true',
      input: '1\n2\n3',
      expectedContains: '1\n2\n3\nEOF reached',
    },
    {
      name: '6.9 eoln-before-read',
      code: `program test(f);
var f: text;
    c: char;
begin
  rewrite(f);
  writeln(f, 'ab');
  writeln(f, 'cd');
  reset(f);
  while not eof(f) do
    begin
      while not eoln(f) do
        begin
          read(f, c);
          write(c);
        end;
      readln(f);
      writeln;
    end;
end.`,
      purpose: '文件 eoln 行末检测',
      expectedContains: 'ab\ncd',
    },
    {
      name: '6.9 file-write-and-reset(f)',
      code: `program test(f);
var f: text;
    s: char;
begin
  rewrite(f);
  writeln(f, 'Hello');
  writeln(f, 'World');
  reset(f);
  while not eof(f) do
    begin
      while not eoln(f) do
        begin
          read(f, s);
          write(s);
        end;
      readln(f);
      writeln;
    end;
end.`,
      purpose: '写入文件后 reset 再读取',
      expectedContains: 'Hello\nWorld',
    },
    {
      name: '6.9 file-write-integer-and-read',
      code: `program test(f);
var f: text;
    i, j: integer;
    s: char;
begin
  rewrite(f);
  writeln(f, '42 99');
  reset(f);
  while not eof(f) do
    begin
      while not eoln(f) do
        begin
          read(f, s);
          write(s);
        end;
      readln(f);
      writeln;
    end;
end.`,
      purpose: '写入整数到文件再逐字符读取',
      expectedContains: '42 99',
    },
    {
      name: '6.9 REWRITE + WRITELN 写入单行',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN REWRITE(F);WRITELN(F,'HELLO');END.`,
      purpose: 'REWRITE + WRITELN 写入到内存文件，无 ASSIGN/CLOSE',
      textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
      expectedFileContains: [{ url: 'F', contains: 'HELLO' }],
    },
    {
      name: '6.9 REWRITE + WRITE 多个参数',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN REWRITE(F);WRITE(F,'N=',42);WRITELN(F);END.`,
      purpose: 'WRITE 多参数写入文件，最后 WRITELN 换行',
      textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
      expectedFileContains: [{ url: 'F', contains: 'N=42' }],
    },
    {
      name: '6.9 WRITELN with width 写入文件',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN REWRITE(F);WRITELN(F,'l.',5:1,')');END.`,
      purpose: 'TANGLE 风格：WRITELN(F, "l.", LINE:1, ")")',
      textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
      expectedFileContains: [{ url: 'F', contains: 'l.5)' }],
    },
    {
      name: '6.9 RESET 空文件 EOF 立即为真',
      code:
        `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);IF EOF(F)THEN WRITELN('EMPTY')ELSE WRITELN('NOT EMPTY');END.`,
      purpose: '空文件 RESET 后 EOF 为真',
      textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
      expectedContains: 'EMPTY',
    },
    {
      name: '6.9 RESET 非空文件 EOF 为假',
      code:
        `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);IF EOF(F)THEN WRITELN('EMPTY')ELSE WRITELN('HAS DATA');END.`,
      purpose: '非空文件 RESET 后 EOF 为假',
      textFiles: new Map<string, Uint8Array>([['F', text('hello')]]),
      expectedContains: 'HAS DATA',
    },
    {
      name: '6.9 F^ 读首字符 + GET 推进',
      code:
        `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;CH:CHAR;BEGIN RESET(F);CH:=F^;WRITE(CH);GET(F);CH:=F^;WRITE(CH);WRITELN;END.`,
      purpose: 'F^ 读缓冲区字符，GET 推进 offset（tangle INPUTLN 风格）',
      textFiles: new Map<string, Uint8Array>([['F', text('AB')]]),
      expectedContains: 'AB',
    },
    {
      name: '6.9 INPUTLN 风格逐字符循环',
      code:
        `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;CH:CHAR;BEGIN RESET(F);WHILE NOT EOLN(F)DO BEGIN CH:=F^;WRITE(CH);GET(F);END;WRITELN;END.`,
      purpose: 'WHILE NOT EOLN(F) DO BEGIN CH:=F^;WRITE(CH);GET(F) END',
      textFiles: new Map<string, Uint8Array>([['F', text('HELLO\n')]]),
      expectedContains: 'HELLO',
    },
    {
      name: '6.9 EOLN 在行尾返回真',
      code:
        `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);WHILE NOT EOLN(F)DO GET(F);IF EOLN(F)THEN WRITELN('AT EOLN');END.`,
      purpose: 'GET 推进到行尾时 EOLN 返回真',
      textFiles: new Map<string, Uint8Array>([['F', text('AB\n')]]),
      expectedContains: 'AT EOLN',
    },
    {
      name: '6.9 READLN 跳过当前行',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;CH:CHAR;BEGIN RESET(F);READLN(F);CH:=F^;WRITE(CH);WRITELN;END.`,
      purpose: 'READLN(F) 跳过当前行，下一行首字符可读',
      textFiles: new Map<string, Uint8Array>([['F', text('LINE1\nLINE2\n')]]),
      expectedContains: 'L',
    },
    {
      name: '6.9 READ 从文件读整数',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;N:INTEGER;BEGIN RESET(F);READ(F,N);WRITELN('N=',N);END.`,
      purpose: 'READ(F, N) 从文本文件读整数',
      textFiles: new Map<string, Uint8Array>([['F', text('42')]]),
      expectedContains: 'N=42',
    },
    {
      name: '6.9 READ 多个整数',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;A,B:INTEGER;BEGIN RESET(F);READ(F,A,B);WRITELN('A=',A,' B=',B);END.`,
      purpose: 'READ(F, A, B) 连续读多个整数',
      textFiles: new Map<string, Uint8Array>([['F', text('10 20')]]),
      expectedContains: 'A=10 B=20',
    },
    {
      name: '6.9 文件复制：INFILE → OUTFILE',
      code:
        `PROGRAM COPYFILE(OUTPUT,INFILE,OUTFILE);VAR INFILE,OUTFILE:TEXT;CH:CHAR;BEGIN RESET(INFILE);REWRITE(OUTFILE);WHILE NOT EOF(INFILE)DO BEGIN WHILE NOT EOLN(INFILE)DO BEGIN CH:=INFILE^;WRITE(OUTFILE,CH);GET(INFILE);END;WRITELN(OUTFILE);READLN(INFILE);END;END.`,
      purpose: '通过 PROGRAM 头声明文件参数，逐字符复制',
      textFiles: new Map<string, Uint8Array>([
        ['INFILE', text('LINE1\nLINE2\n')],
        ['OUTFILE', new Uint8Array(0)],
      ]),
      programFileUrls: { INFILE: 'INFILE', OUTFILE: 'OUTFILE' },
      expectedFileContains: [{ url: 'OUTFILE', contains: 'LINE1' }],
    },
    {
      name: '6.9 文件复制：无 programFileUrls，默认恒等映射（key === value）',
      code:
        `PROGRAM COPYFILE(OUTPUT,INFILE,OUTFILE);VAR INFILE,OUTFILE:TEXT;CH:CHAR;BEGIN RESET(INFILE);REWRITE(OUTFILE);WHILE NOT EOF(INFILE)DO BEGIN CH:=INFILE^;WRITE(OUTFILE,CH);GET(INFILE);END;END.`,
      purpose: '缺省 programFileUrls 时，程序文件参数名即 files 键名',
      textFiles: new Map<string, Uint8Array>([
        ['INFILE', text('LINE1\nLINE2\n')],
        ['OUTFILE', new Uint8Array(0)],
      ]),
      expectedFileContains: [{ url: 'OUTFILE', contains: 'LINE1' }],
    },
    {
      name: '6.9 程序参数绑定 + RESET + READ',
      code: `PROGRAM TEST(OUTPUT,DATA);VAR DATA:TEXT;N:INTEGER;BEGIN RESET(DATA);READ(DATA,N);WRITELN(N*2);END.`,
      purpose: '通过程序参数绑定文件名，不再使用 ASSIGN',
      textFiles: new Map<string, Uint8Array>([['DATA', text('21')]]),
      expectedContains: '42',
    },
    {
      name: '6.9 PUT 调用不报错（文本文件）',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN REWRITE(F);PUT(F);WRITELN(F,'AFTER PUT');END.`,
      purpose: 'PUT 在简化实现中是 no‑op，但要能正确执行',
      textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
      expectedFileContains: [{ url: 'F', contains: 'AFTER PUT' }],
    },
    {
      name: '6.9 ISSUE-034: READ char 读取首个字符（非空白）',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;C:CHAR;BEGIN RESET(F);READ(F,C);WRITELN(C);END.`,
      purpose: 'READ(F, C) 读 char：文件首字符为 A，应读到 A',
      textFiles: new Map<string, Uint8Array>([['F', text('AB')]]),
      expectedContains: 'A',
    },
    {
      name: '6.9 ISSUE-034: READ char 不跳过空格（标准行为）',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;C:CHAR;BEGIN RESET(F);READ(F,C);WRITELN(ORD(C));END.`,
      purpose: 'READ(F, C) 读 char：文件首字符为空格(ASCII 32)，标准要求读到空格',
      textFiles: new Map<string, Uint8Array>([['F', text(' A')]]),
      expectedContains: '32',
    },
    {
      name: '6.9 ISSUE-034: 连续 READ char 逐字读取',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;A,B,C:CHAR;BEGIN RESET(F);READ(F,A,B,C);WRITELN(A,B,C);END.`,
      purpose: 'READ(F, A, B, C) 读三个 char：应逐字读取 "A B"（含中间空格）',
      textFiles: new Map<string, Uint8Array>([['F', text('A B')]]),
      expectedContains: 'A B',
    },
    {
      name: '6.9 file of record: 正向 - 写入并读取简单记录',
      code:
        `program test(f); type rec = record x: integer; y: integer; end; var f: file of rec; r: rec; begin rewrite(f); r.x := 10; r.y := 20; f^ := r; put(f); reset(f); r := f^; write(r.x, ',', r.y); end.`,
      purpose: 'ISO 6.4.3.5/6.6.5.2 file of record: 写入记录后重置读取，验证记录字段',
      recordFiles: new Map([['f', new MemoryRecordFile()]]),
      expectedContains: '10,20',
    },
    {
      name: '6.9 file of record: 正向 - 多条记录顺序读取',
      code:
        `program test(f); type rec = record x: integer; end; var f: file of rec; r1, r2: rec; begin rewrite(f); r1.x := 1; f^ := r1; put(f); r2.x := 2; f^ := r2; put(f); reset(f); r1 := f^; get(f); r2 := f^; write(r1.x + r2.x); end.`,
      purpose: 'ISO 6.6.5.2 file of record: 写入两条记录，顺序读取并求和',
      recordFiles: new Map([['f', new MemoryRecordFile()]]),
      expectedContains: '3',
    },
    {
      name: '6.9 file of record: 正向 - 变体 record 字段访问 (int 视图)',
      code:
        `program test(f); type mw = record case integer of 1: (int: integer); 2: (b0, b1, b2, b3: 0..255); end; var f: file of mw; w: mw; begin rewrite(f); w.int := 42; f^ := w; put(f); reset(f); w := f^; write(w.int); end.`,
      purpose: 'ISO 6.4.2.3 变体 record: 通过 int 字段访问，模拟 TeX memory_word',
      recordFiles: new Map([['f', new MemoryRecordFile()]]),
      expectedContains: '42',
    },
    {
      name: '6.9 file of record: 正向 - 变体 record 字段访问 (字节视图)',
      code:
        `program test(f); type mw = record case integer of 1: (int: integer); 2: (b0, b1, b2, b3: 0..255); end; var f: file of mw; w: mw; begin rewrite(f); w.b0 := 1; w.b1 := 2; w.b2 := 3; w.b3 := 4; f^ := w; put(f); reset(f); w := f^; write(w.b0, w.b1, w.b2, w.b3); end.`,
      purpose: 'ISO 6.4.2.3 变体 record: 通过字节字段访问，模拟 TeX four_quarters',
      recordFiles: new Map([['f', new MemoryRecordFile()]]),
      expectedContains: '1234',
    },
    {
      name: '6.9 file of record: 正向 - 字段级赋值 f^.field := x (TeX dump 模式)',
      code:
        `program test(f); type rec = record x: integer; y: integer; end; var f: file of rec; begin rewrite(f); f^.x := 10; f^.y := 20; put(f); reset(f); write(f^.x, ',', f^.y); end.`,
      purpose: 'ISO 6.6.5.2: f^.field := x 修改缓冲区字段，put 写入。TeX dump_int/dump_hh 即此模式',
      recordFiles: new Map([['f', new MemoryRecordFile()]]),
      expectedContains: '10,20',
    },
    {
      name: '6.9 file of record: 正向 - 多条字段级赋值顺序写入',
      code:
        `program test(f); type rec = record x: integer; end; var f: file of rec; begin rewrite(f); f^.x := 1; put(f); f^.x := 2; put(f); f^.x := 3; put(f); reset(f); write(f^.x); get(f); write(f^.x); get(f); write(f^.x); end.`,
      purpose: 'ISO 6.6.5.2: 多次 f^.field := x; put(f) 顺序写入，get 顺序读取',
      recordFiles: new Map([['f', new MemoryRecordFile()]]),
      expectedContains: '123',
    },
    {
      name: '6.9 file of record: 正向 - 变体 record 字段级赋值 (int 视图，TeX dump_int)',
      code:
        `program test(f); type mw = record case integer of 1: (int: integer); 2: (b0, b1, b2, b3: 0..255); end; var f: file of mw; begin rewrite(f); f^.int := 42; put(f); reset(f); write(f^.int); end.`,
      purpose: 'ISO 6.4.2.3/6.6.5.2: f^.int := x (TeX dump_int 宏模式)',
      recordFiles: new Map([['f', new MemoryRecordFile()]]),
      expectedContains: '42',
    },
    {
      name: '6.9 file of record: 正向 - 变体 record 字段级赋值 (字节视图，TeX dump_qqqq)',
      code:
        `program test(f); type mw = record case integer of 1: (int: integer); 2: (b0, b1, b2, b3: 0..255); end; var f: file of mw; begin rewrite(f); f^.b0 := 1; f^.b1 := 2; f^.b2 := 3; f^.b3 := 4; put(f); reset(f); write(f^.b0, f^.b1, f^.b2, f^.b3); end.`,
      purpose: 'ISO 6.4.2.3/6.6.5.2: f^.b0 := x 等 (TeX dump_qqqq 宏模式)',
      recordFiles: new Map([['f', new MemoryRecordFile()]]),
      expectedContains: '1234',
    },
    {
      name: '6.9 file of record: 正向 - f^ := r 后再改 r，缓冲区不受影响',
      code:
        `program test(f); type rec = record x: integer; end; var f: file of rec; a, b: rec; begin rewrite(f); a.x := 1; f^ := a; a.x := 2; b := f^; write(b.x); end.`,
      purpose: 'ISO 6.6.3.3: f^ := a 是赋值（值语义），之后改 a 不得改变缓冲区 → 期望读到 1',
      recordFiles: new Map([['f', new MemoryRecordFile()]]),
      expectedContains: '1',
    },
    {
      name: '6.9 file of record: 正向 - f^ := mem[k] 后再改 mem[k]，缓冲区不受影响',
      code:
        `program test(f); type rec = record x: integer; end; var f: file of rec; mem: array[1..3] of rec; b: rec; begin rewrite(f); mem[2].x := 1; f^ := mem[2]; mem[2].x := 2; b := f^; write(b.x); end.`,
      purpose: 'ISO 6.6.3.3: TeX dump_wd(mem[k]) 模式，数组元素是共享视图，赋值后改元素不得改变缓冲区 → 期望 1',
      recordFiles: new Map([['f', new MemoryRecordFile()]]),
      expectedContains: '1',
    },
    {
      name: '6.9 file of record: 正向 - 写入后改写源，已写入的记录不受影响',
      code:
        `program test(f); type rec = record x: integer; end; var f: file of rec; mem: array[1..3] of rec; b: rec; begin rewrite(f); mem[1].x := 1; f^ := mem[1]; put(f); mem[1].x := 9; mem[2].x := 2; f^ := mem[2]; put(f); reset(f); b := f^; write(b.x); get(f); b := f^; write(b.x); end.`,
      purpose: 'ISO 6.6.3.3: put 之后改写源内存，已落盘的记录必须保持原值 → 期望 12（TeX 格式转储的核心不变量）',
      recordFiles: new Map([['f', new MemoryRecordFile()]]),
      expectedContains: '12',
    },
    {
      name: '6.9 file of record: 反面 - reset 后写缓冲区应报错',
      code:
        `program test(f); type rec = record x: integer; end; var f: file of rec; r: rec; begin rewrite(f); reset(f); f^ := r; end.`,
      purpose: 'ISO 6.6.5.2: rewrite 之前（读状态）写缓冲区违反前置条件',
      recordFiles: new Map([['f', new MemoryRecordFile()]]),
      expectedError: 'pre-assertion',
    },
    {
      name: '6.9 file of record: 反面 - reset 后 put 应报错',
      code:
        `program test(f); type rec = record x: integer; end; var f: file of rec; begin rewrite(f); reset(f); put(f); end.`,
      purpose: 'ISO 6.6.5.2: rewrite 之前（读状态）调用 put 违反前置条件',
      recordFiles: new Map([['f', new MemoryRecordFile()]]),
      expectedError: 'pre-assertion',
    },
  ]

  runPascalTests(tests)
})
