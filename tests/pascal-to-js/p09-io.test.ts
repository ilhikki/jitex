// ISO/IEC 7185:1990 - 6.9 Input and output
//
// Section overview:
//   Specifies the input/output procedures applicable to text files (textfile). The parameter list
//   syntax of read may omit the file-variable, in which case it acts upon the required textfile
//   input (the program must contain a program parameter spelled input); and the semantics of
//   read(f,v) are defined via the pre- and post-assertion style of 6.6.5.2, specifying for char
//   (including subranges), integer (including subranges), real, and string type variables respectively
//   the skipping of spaces and end-of-line characters, the readable forms of signed-integer /
//   signed-number, and error conditions. readln(f,v1,...,vn) is equivalent to read followed by
//   readln(f); readln(f) is equivalent to "while not eoln(^) do get(^); get(^)", placing the
//   current position after the end of the current line. write's write-parameter has three forms:
//   `e`, `e:TotalWidth`, `e:TotalWidth:FracDigits`, requiring both TotalWidth and FracDigits
//   to be >= 1, and respectively specifying the output format for char (default width 1),
//   integer (distinguishing whether the width accommodates the sign), real (character composition
//   of the floating-point and fixed-point representations), Boolean (writing the string corresponding
//   to true/false), and string types; writeln terminates a partial line and writes end-of-line;
//   the effect of page is implementation-defined, implicitly writeln when necessary, and makes the
//   buffer variable totally-undefined.
//
// Subsections:
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

import { type PascalTest, runPascalTests } from './harness.ts'

function text(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

const tests: PascalTest[] = [
  {
    name: '6.9 writeln with no arguments writes end-of-line',
    code: `program test(output);
begin
  writeln;
end.`,
    purpose:
      'ISO 6.9.4: Writeln(f) terminates the (possibly existing) partial line; the post-assertion requires f.L to append end-of-line',
    expectedOutput: '\n',
  },
  {
    name: '6.9 write outputs consecutively without line breaks',
    code: `program test(output);
begin
  write('hello');
  write('world');
end.`,
    purpose:
      'ISO 6.9.3: write only writes the character sequence, no end-of-line; the default width for character output is the number of components (6.9.3.6)',
    expectedOutput: 'helloworld',
  },
  {
    name: '6.9 write followed by writeln terminates a partial line',
    code: `program test(output);
begin
  write('Hello');
  writeln(' World');
  write('Good');
  writeln('bye');
end.`,
    purpose:
      'ISO 6.9.3/6.9.4: write accumulates into a partial line, writeln writes the arguments followed by end-of-line',
    expectedOutput: 'Hello World\nGoodbye\n',
  },
  {
    name: '6.9 writeln outputs multiple arguments in order',
    code: `program test(output);
begin
  writeln(1, 2, 3);
end.`,
    purpose:
      'ISO 6.9.3: write(f,p1,...,pn) is equivalent to write(f,p1); write(f,p2,...) in sequence; the default integer width is implementation-defined (E.10)',
    expectedOutput: '123\n',
  },
  {
    name: '6.9 write outputs integer',
    code: `program test(output);
begin
  write(123);
end.`,
    purpose: 'ISO 6.9.3.3: write the decimal representation of e, no end-of-line appended',
    expectedOutput: '123',
  },
  {
    name: '6.9 writeln outputs a character string',
    code: `program test(output);
begin
  writeln('hello world');
end.`,
    purpose: 'ISO 6.9.3.6: string-type default TotalWidth = number of components n, write all n characters',
    expectedOutput: 'hello world\n',
  },

  {
    name: '6.9.3.1 write forms e:TotalWidth and e:TotalWidth:FracDigits',
    code: `program test(output);
begin
  write(42:4);
  writeln;
  writeln(3.5:6:1);
end.`,
    purpose:
      'ISO 6.9.3.1/6.9.3.3/6.9.3.4.2: 42:4 writes 1 space + sign space + 42 because 4 >= IntDigits+1; 3.5:6:1 writes in fixed-point form',
    expectedOutput: '  42\n   3.5\n',
  },

  {
    name: '6.9.3.2 char field width padded with leading spaces',
    code: `program test(output);
var c: char;
begin
  c := 'A';
  write(c:5);
  writeln;
end.`,
    purpose:
      'ISO 6.9.3.2: the representation of char is (TotalWidth-1) spaces followed by the character, so c:5 writes 4 spaces + A',
    expectedOutput: '    A\n',
  },
  {
    name: '6.9.3.2 char default width is 1',
    code: `program test(output);
var c: char;
begin
  c := 'A';
  writeln(c);
  writeln(c:1);
end.`,
    purpose:
      'ISO 6.9.3.2: the default TotalWidth of char is 1, so both c and c:1 write only 1 character with no leading spaces',
    expectedOutput: 'A\nA\n',
  },

  {
    name: '6.9.3.3 integer padded with spaces when width is sufficient, all characters written when insufficient',
    code: `program test(output);
var i: integer;
begin
  i := 42;
  write(i:6);
  write(i:3);
  write(i:1);
  writeln;
end.`,
    purpose:
      'ISO 6.9.3.3: 42:6 -> (6-2-1) spaces + sign space + "42"; 42:3 -> exactly fits so no leading spaces; 42:1 -> only sign and digits are written when width is insufficient',
    expectedOutput: '    42 4242\n',
  },
  {
    name: '6.9.3.3 integer negative number sign and field width',
    code: `program test(output);
begin
  writeln(-42:6);
  writeln(-42:3);
  writeln(-42:1);
end.`,
    purpose:
      'ISO 6.9.3.3: for negative numbers, when width is sufficient write (TotalWidth-IntDigits-1) spaces + "-"; when insufficient write only "-" and digits',
    expectedOutput: '   -42\n-42\n-42\n',
  },

  {
    name: '6.9.3.4.2 real fixed-point representation :TotalWidth:FracDigits',
    code: `program test(output);
var r: real;
begin
  r := 3.14159;
  writeln(r:8:2);
end.`,
    purpose:
      'ISO 6.9.3.4.2: 3.14159 rounded to 2 decimal places is 3.14, MinNumChars=4, TotalWidth 8 so 4 leading spaces are padded',
    expectedOutput: '    3.14\n',
  },
  {
    name: '6.9.3.4.2 real fixed-point: no leading spaces when width is less than MinNumChars',
    code: `program test(output);
var r: real;
begin
  r := 12.75;
  writeln(r:2:2);
end.`,
    purpose:
      'ISO 6.9.3.4.2 NOTE: at least MinNumChars characters are written; when TotalWidth is less than that value no leading spaces are written, so 12.75 is output',
    expectedOutput: '12.75\n',
  },
  {
    name: '6.9.3.4.2 real fixed-point representation of negative numbers',
    code: `program test(output);
var r: real;
begin
  r := -3.5;
  writeln(r:7:1);
end.`,
    purpose:
      'ISO 6.9.3.4.2: for negative numbers where the rounded value is non-zero, MinNumChars is incremented by 1 to accommodate "-", so TotalWidth 7 pads 3 leading spaces',
    expectedOutput: '   -3.5\n',
  },
  {
    name: '6.9.3.4.2 real fixed-point representation rounded by FracDigits',
    code: `program test(output);
var r: real;
begin
  r := 2.56;
  writeln(r:6:1);
end.`,
    purpose:
      'ISO 6.9.3.4.2: 2.56 + 0.5*10^-1 = 2.61 then truncated to 1 decimal place gives 2.6, MinNumChars=3, TotalWidth 6 pads 3 spaces',
    expectedOutput: '   2.6\n',
  },
  {
    name: '6.9.3.4.1 real single-argument output in floating-point representation',
    code: `program test(output);
var r: real;
begin
  r := 12.5;
  writeln(r:20);
end.`,
    purpose:
      'ISO 6.9.3.4.1: Write(f,e:TotalWidth) writes the floating-point representation, the mantissa is 1.25...; ExpDigits (E.13) and the exponent character e/E (E.14) are both implementation-defined, so only assert the ISO-defined mantissa prefix ".25"',
    expectedContains: '.25',
  },

  {
    name: '6.9.3.5 boolean outputs the lexical form of true',
    code: `program test(output);
begin
  writeln(true);
end.`,
    purpose:
      'ISO 6.9.3.5: Boolean writes the string corresponding to true; the case of each letter is implementation-defined (Annex E.15), so only assert the case-independent "RUE" and newline',
    expectedContains: 'RUE\n',
  },
  {
    name: '6.9.3.5 boolean outputs the lexical form of false',
    code: `program test(output);
begin
  writeln(false);
end.`,
    purpose:
      'ISO 6.9.3.5: Boolean writes the string corresponding to false; letter case is implementation-defined (Annex E.15), so only assert the case-independent "ALSE" and newline',
    expectedContains: 'ALSE\n',
  },
  {
    name: '6.9 after reading an integer eoln is true and is written out',
    code: `program test(input, output);
var n: integer;
begin
  read(n);
  writeln(eoln);
end.`,
    purpose:
      'ISO 6.9.1c: after read(f,v) reads an integer, f.R stops before the end-of-line, so eoln is true; its Boolean value is written per 6.9.3.5 (case is implementation-defined)',
    input: '7\n',
    expectedContains: 'RUE\n',
  },

  {
    name: '6.9.3.6 string default width equals the number of components',
    code: `program test(output);
var s: packed array [1..5] of char;
begin
  s := 'abcde';
  writeln(s);
  writeln('test');
end.`,
    purpose:
      'ISO 6.9.3.6: string-type default TotalWidth = number of components n, write all n characters; packed array[1..5] of char is a string-type (6.4.3.2)',
    expectedOutput: 'abcde\ntest\n',
  },
  {
    name: '6.9.3.6 string field width: pad spaces on the left when exceeded, truncate when insufficient',
    code: `program test(output);
begin
  writeln('hello':8);
  writeln('hello':3);
end.`,
    purpose:
      'ISO 6.9.3.6: when TotalWidth > n, write (TotalWidth-n) spaces plus all characters; when 1 <= TotalWidth <= n, write only the first TotalWidth characters',
    expectedOutput: '   hello\nhel\n',
  },

  {
    name: '6.9.1 read char does not skip leading spaces',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;C:CHAR;BEGIN RESET(F);READ(F,C);WRITELN(C);END.`,
    purpose:
      'ISO 6.9.1b: read(f,v) for char is equivalent to v := f^; get(f), does not skip spaces, so when the first character of the file is a space a space is read',
    textFiles: new Map<string, Uint8Array>([['F', text(' A')]]),
    expectedOutput: ' \n',
  },
  {
    name: '6.9.1 read char reads character by character (including intermediate spaces)',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;A,B,C:CHAR;BEGIN RESET(F);READ(F,A,B,C);WRITELN(A,B,C);END.`,
    purpose:
      'ISO 6.9.1b: read(f,v1,...,vn) is equivalent to read(f,vi) in sequence, char does not skip any characters, so "A B" is read character by character',
    textFiles: new Map<string, Uint8Array>([['F', text('A B')]]),
    expectedOutput: 'A B\n',
  },
  {
    name: '6.9.1 read char reads the first character of the file',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;C:CHAR;BEGIN RESET(F);READ(F,C);WRITELN(C);END.`,
    purpose:
      'ISO 6.9.1b: read(f,c) takes the current character of the buffer variable and advances with get, so the first character A is read',
    textFiles: new Map<string, Uint8Array>([['F', text('AB')]]),
    expectedOutput: 'A\n',
  },
  {
    name: '6.9.1 read integer skips spaces and end-of-line characters',
    code: `program test(input, output);
var a, b: integer;
begin
  read(a);
  read(b);
  writeln(a:1, ' ', b:1);
end.`,
    purpose:
      'ISO 6.9.1c NOTE 3: r denotes the skipped spaces and end-of-line; reading integers can span lines, so "10\\n20" reads 10 and 20',
    input: '10\n20',
    expectedOutput: '10 20\n',
  },
  {
    name: '6.9.1 read integer from a text file',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;N:INTEGER;BEGIN RESET(F);READ(F,N);WRITELN('N=',N);END.`,
    purpose: 'ISO 6.9.1c: read(f,v) skips leading spaces/end-of-line then reads signed-integer and assigns to v',
    textFiles: new Map<string, Uint8Array>([['F', text('42')]]),
    expectedOutput: 'N=42\n',
  },
  {
    name: '6.9.1 read reads multiple integers consecutively',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;A,B:INTEGER;BEGIN RESET(F);READ(F,A,B);WRITELN('A=',A,' B=',B);END.`,
    purpose: 'ISO 6.9.1a/c: read(f,A,B) is equivalent to read(f,A); read(f,B), spaces are skipped as r',
    textFiles: new Map<string, Uint8Array>([['F', text('10 20')]]),
    expectedOutput: 'A=10 B=20\n',
  },
  {
    name: '6.9.1 read real from text',
    code: `program test(input, output);
var r: real;
begin
  read(r);
  writeln(r:8:2);
end.`,
    purpose:
      'ISO 6.9.1d: read(f,v) for real reads signed-number and assigns to v; assert the read value using the 6.9.3.4.2 fixed-point form',
    input: '3.25',
    expectedOutput: '    3.25\n',
  },

  {
    name: '6.9.2 readln reads integers line by line',
    code: `program test(input, output);
var a, b: integer;
begin
  readln(a);
  readln(b);
  writeln(a:1, ' ', b:1);
end.`,
    purpose:
      'ISO 6.9.2: readln(f,v) is equivalent to read(f,v); readln(f), each time reading a line and positioning at the start of the next line',
    input: '10\n20',
    expectedOutput: '10 20\n',
  },
  {
    name: '6.9.2 readln multiple values equivalent to read followed by readln (cross-line real)',
    code: `program test(input, output);
var i: integer;
    r: real;
begin
  readln(i, r);
  writeln(i:1);
  writeln(r:8:2);
end.`,
    purpose:
      'ISO 6.9.2/6.9.1d: readln(f,i,r) is equivalent to read(f,i); read(f,r); readln(f), the end-of-line after the integer is skipped when the real is read',
    input: '10\n3.14',
    expectedOutput: '10\n    3.14\n',
  },
  {
    name: '6.9.2 readln with no arguments skips the current line',
    code: `program test(input, output);
var c: char;
begin
  readln;
  read(c);
  writeln(c);
end.`,
    purpose:
      'ISO 6.9.2: readln(f) is equivalent to "while not eoln(^) do get(^); get(^)", placing the position after the end of the current line',
    input: 'abc\nX',
    expectedOutput: 'X\n',
  },
  {
    name: '6.9.2 readln(f) positions at the start of the next line',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;CH:CHAR;BEGIN RESET(F);READLN(F);CH:=F^;WRITE(CH);WRITELN;END.`,
    purpose:
      'ISO 6.9.2 NOTE 1: readln places the current file position after the end of the current line, so the buffer variable is the first character L of the next line',
    textFiles: new Map<string, Uint8Array>([['F', text('LINE1\nLINE2\n')]]),
    expectedOutput: 'L\n',
  },

  {
    name: '6.9.4 writeln(f) writes arguments and appends end-of-line',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN REWRITE(F);WRITELN(F,'HELLO');END.`,
    purpose:
      'ISO 6.9.4: writeln(f,p) is equivalent to write(f,p); writeln(f), so the file content is HELLO plus end-of-line',
    textFiles: new Map<string, Uint8Array>([['F', text('')]]),
    expectedFileContains: [{ url: 'F', contains: 'HELLO\n' }],
  },
  {
    name: '6.9.3 write(f) writes multiple arguments',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN REWRITE(F);WRITE(F,'N=',42);WRITELN(F);END.`,
    purpose:
      'ISO 6.9.3: write(f,p1,p2) is equivalent to write(f,p1); write(f,p2), writing a character string and an integer respectively',
    textFiles: new Map<string, Uint8Array>([['F', text('')]]),
    expectedFileContains: [{ url: 'F', contains: 'N=42\n' }],
  },
  {
    name: '6.9.3.3 write writes to a file with field width',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN REWRITE(F);WRITELN(F,'l.',5:1,')');END.`,
    purpose:
      'ISO 6.9.3.1/6.9.3.3: 5:1 writes only the digit 5 because 1 < IntDigits+1, so the file content is "l.5)" plus end-of-line',
    textFiles: new Map<string, Uint8Array>([['F', text('')]]),
    expectedFileContains: [{ url: 'F', contains: 'l.5)\n' }],
  },
  {
    name: '6.9.3 write applied to a text file in Inspection mode is an error',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);WRITELN(F,'X');END.`,
    purpose:
      'ISO 6.9.3: when write is applied to a text file, it is an error if f is undefined or f.M = Inspection; after reset the file is in Inspection mode',
    textFiles: new Map<string, Uint8Array>([['F', text('')]]),
    expectedError: 'generation',
  },
  {
    name: '6.9 line-by-line character read/write round-trip (read/write interaction with eoln/eof)',
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
    purpose:
      'ISO 6.9.1b/6.9.2/6.9.4: copy character by character with read(f,s)+write(s), eoln controls the in-line loop, eof controls the line loop, after readln advances the line writeln outputs end-of-line',
    expectedOutput: 'Hello\nWorld\n',
  },

  {
    name: '6.9.5 page implicitly writeln when end-of-line is not written at line end',
    code: `program test(output);
begin
  write('abc');
  page;
  writeln('X');
end.`,
    purpose:
      'ISO 6.9.5: if f.L is non-empty and f.L.last is not end-of-line, page(f) must implicitly execute writeln(f), so abc and end-of-line should appear afterwards',
    expectedContains: 'abc\n',
  },
  {
    name: '6.9.5 page applied to a text file in generation mode',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN REWRITE(F);WRITELN(F,'first');PAGE(F);WRITELN(F,'second');END.`,
    purpose:
      'ISO 6.9.5: the page-break effect of page(f) is implementation-defined (E.16), but must not corrupt already written content or subsequent output, so both lines of text should be preserved',
    textFiles: new Map<string, Uint8Array>([['F', text('')]]),
    expectedFileContains: [{ url: 'F', contains: 'first' }, { url: 'F', contains: 'second' }],
  },

  {
    name: '6.6 rewrite/write/reset when file is a record field',
    code: `program test(output);
type r = record f: file of char end;
var x: r;
begin
  rewrite(x.f);
  write(x.f, 'A');
  reset(x.f);
end.`,
    purpose:
      'ISO 6.4.3.3 / 6.6.5.2: the file field of a record is a variable-access, usable as an argument to rewrite/write/reset',
  },
  {
    name: '6.6 rewrite/write/reset when file is an array element',
    code: `program test(output);
var a: array[1..2] of file of char;
begin
  rewrite(a[1]);
  write(a[1], 'X');
  reset(a[1]);
end.`,
    purpose: 'ISO 6.4.3.2 / 6.6.5.2: a file element is a variable-access, usable as an argument to rewrite/write/reset',
  },
  {
    name: '6.6 file as a variable parameter then reset inside the procedure',
    code: `program test(output);
var f: file of char;
procedure p(var g: file of char);
begin
  rewrite(g);
  write(g, 'Q');
  reset(g);
end;
begin
  p(f);
end.`,
    purpose: 'ISO 6.6.3.3 / 6.6.5.2: file-type variable parameters can be rewrite/write/reset inside the procedure',
  },
  {
    name: '6.6 file as a two-dimensional array element (abbreviated and full forms)',
    code: `program test(output);
var a: array[1..2, 1..2] of file of char;
begin
  rewrite(a[1, 1]);
  write(a[1, 1], 'X');
  reset(a[1, 1]);
  rewrite(a[2][2]);
  write(a[2][2], 'Y');
  reset(a[2][2]);
end.`,
    purpose:
      'ISO 6.4.3.2 / 6.6.5.2: file elements of multidimensional arrays (abbreviated and full forms are equivalent) can be used as arguments to rewrite/write/reset',
  },
  {
    name: '6.6 file as a field of a nested record',
    code: `program test(output);
type inner = record f: file of char; n: integer end;
     outer = record i: inner; k: char end;
var x: outer;
begin
  x.i.n := 1;
  rewrite(x.i.f);
  write(x.i.f, 'A');
  reset(x.i.f);
  write(x.i.n);
end.`,
    purpose: 'ISO 6.4.3.3 / 6.6.5.2: the file field inside a nested record is a variable-access',
    expectedOutput: '1',
  },
  {
    name: '6.6 file as a field of a record array',
    code: `program test(output);
type r = record f: file of char end;
var a: array[1..2] of r;
begin
  rewrite(a[2].f);
  write(a[2].f, 'B');
  reset(a[2].f);
end.`,
    purpose:
      'ISO 6.4.3.2 / 6.4.3.3: the record field (including file) of an array element can be used as an argument to rewrite/write/reset',
  },
  {
    name: '6.6 pointer as a field of a record array',
    code: `program test(output);
type node = record v: integer; next: ^node end;
var a: array[1..2] of node;
begin
  new(a[1].next);
  a[1].next^.v := 7;
  write(a[1].next^.v);
  dispose(a[1].next);
end.`,
    purpose:
      'ISO 6.4.3.2 / 6.4.4 / 6.6.5.3: the pointer field in a record of an array element can be new/dereferenced/disposed',
    expectedOutput: '7',
  },
  {
    name: '6.6 the result type of a function must not be a file type',
    code: `program test(output);
function f: file of char;
begin
end;
begin
  f;
end.`,
    purpose:
      'ISO 6.6.2: the result-type of a function must be a simple-type or pointer-type; file as a result type should report an error',
    expectedError: 'function',
  },
  {
    name: '6.9.2 readln skips an entire line ending with CRLF',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;C:CHAR;BEGIN RESET(F);READLN(F);READ(F,C);WRITELN(C);END.`,
    purpose:
      'ISO 6.9.2: readln(f) is equivalent to while not eoln(f) do get(f); get(f), placing the position after the end of the current line; the specific characters of the end-of-line are implementation-defined (Annex E)',
    textFiles: new Map<string, Uint8Array>([['F', text('AB\r\nCD')]]),
    expectedOutput: 'C\n',
  },
  {
    name: '6.9 eoln is true for an empty text file',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);IF EOLN(F)THEN WRITE('EOLN');END.`,
    purpose: 'ISO 6.6.6.5/6.9.5: eoln(f) is also true when f.R is an empty sequence (i.e. eof(f) is true)',
    textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
    expectedOutput: 'EOLN',
  },
  {
    name: '6.9.3 write is an error for non-text files in Inspection mode',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:PACKED FILE OF 0..255;BEGIN RESET(F);WRITE(F,1);END.`,
    purpose:
      'ISO 6.6.5.2/6.9.3: write requires f.M=Generation; after reset the file is in Inspection, in which case write(f,e) is an error',
    textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
    expectedError: 'generation',
  },
  {
    name: '6.9.1 reading a non-text file at eof is an error',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:PACKED FILE OF 0..255;B:0..255;BEGIN RESET(F);READ(F,B);END.`,
    purpose:
      'ISO 6.9.1/6.6.5.2: the pre-assertion of read requires not eof(f); reading is an error when f.R is an empty sequence',
    textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
    expectedError: '',
  },
  {
    name: '6.9.3.1 TotalWidth less than 1 is an error',
    code: `program test(output);
begin
  write('abc':0);
end.`,
    purpose: 'ISO 6.9.3.1: the TotalWidth of a write-parameter must be greater than 0; TotalWidth < 1 is an error',
    expectedError: 'width',
  },
  {
    name: '6.9.3 writing an empty string produces no output',
    code: `program test(output);
begin
  write('');
  writeln('X');
end.`,
    purpose: 'ISO 6.9.3.6: when the number of components of a string-type value is 0, 0 characters are written',
    expectedOutput: 'X\n',
  },
  {
    name: '6.9.5 page does not write an implicit writeln at the start of a file',
    code: `program test(output);
begin
  page;
  writeln('X');
end.`,
    purpose:
      'ISO 6.9.5: page(f) implicitly writeln(f) only when f.L is non-empty and f.L.last is not end-of-line; at the start of the file f.L is empty, so no end-of-line is written',
    expectedOutput: '\fX\n',
  },
  {
    name: "6.9.3.1 missing expression at write's TotalWidth position should report an error",
    code: `program test(output);
begin
  write(1:);
end.`,
    purpose: 'ISO 6.9.3.1: write-parameter = expression [ : expression [ : expression ] ]',
    expectedError: '',
  },
  {
    name: "6.9.3 write's actual-parameter-list missing closing parenthesis should report an error",
    code: `program test(output);
begin
  write(1;
end.`,
    purpose: "ISO 6.9.3: write's actual-parameter-list ends with a closing parenthesis",
    expectedError: '',
  },
  {
    name: "6.9.1 read's actual argument can be a variable parameter",
    code: `program test(input, output);
var v: integer;
procedure rd(var x: integer);
begin
  read(x);
end;
begin
  rd(v);
  writeln(v);
end.`,
    purpose:
      'ISO 6.9.1/6.6.3.3: the v of read must be a variable; a variable parameter represents the actual argument variable within its block',
    input: '5',
    expectedOutput: '5\n',
  },
  {
    name: '6.9.1 character units at end-of-line are treated as whitespace',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;C:CHAR;BEGIN RESET(F);READ(F,C);WRITELN(ORD(C));END.`,
    purpose:
      'ISO 6.9.1b: the line structure of a text file is delimited by end-of-line; the character unit read at end-of-line denotes whitespace; its specific characters are implementation-defined (Annex E)',
    textFiles: new Map<string, Uint8Array>([['F', text('\r\nX')]]),
    expectedOutput: '32\n',
  },
  {
    name: '6.9.1 skip end-of-line sequences when reading numeric values',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;N:INTEGER;BEGIN RESET(F);READ(F,N);WRITELN(N);END.`,
    purpose:
      'ISO 6.9.1c NOTE 3: when reading integer, spaces and end-of-line are skipped first; the specific characters of end-of-line are implementation-defined',
    textFiles: new Map<string, Uint8Array>([['F', text('\r\n42')]]),
    expectedOutput: '42\n',
  },
  {
    name: '6.5.5 value of the buffer variable at end-of-file (implementation-defined)',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;C:CHAR;BEGIN RESET(F);C:=F^;WRITELN(ORD(C));END.`,
    purpose:
      'ISO 6.5.5/6.6.5.2: the value of the buffer variable when f.R is an empty sequence is not specified by ISO; this implementation returns a whitespace character',
    textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
    expectedOutput: '32\n',
  },
  {
    name: '6.9.1 reading boolean from a text file (non-ISO extension)',
    code: `program test(input, output);
var b: boolean;
begin
  read(b);
  if b then writeln('T') else writeln('F');
end.`,
    purpose:
      'ISO 6.9.1 read only defines reading semantics for variables of type char, integer, and real; reading Boolean is an extension of this implementation',
    input: 'true',
    expectedOutput: 'T\n',
  },
  {
    name: '6.9.1 reading a character unit at end-of-file',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;C:CHAR;BEGIN RESET(F);READ(F,C);WRITELN(ORD(C));END.`,
    purpose:
      'ISO 6.9.1b/6.6.5.2: the pre-assertion of read is not eof(f); when f.R is an empty sequence this implementation returns a whitespace character',
    textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
    expectedOutput: '32\n',
  },
  {
    name: '6.9.3.4.1 real with an integer value is written in floating-point representation',
    code: `program test(output);
var r: real;
begin
  r := 4 / 2;
  writeln(r:20);
end.`,
    purpose:
      "ISO 6.9.3.4.1: with a single write parameter real is written in floating-point representation; the specific characters of the mantissa and exponent are implementation-defined (E.13/E.14), so only assert the mantissa part matching this implementation's form",
    expectedContains: '.0000000E+000',
  },
]

runPascalTests('ISO 7185 6.9 - Input and output', tests)
