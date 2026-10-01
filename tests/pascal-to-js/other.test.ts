//
//

import { type PascalTest, runPascalTests } from './harness.ts'

const tests: PascalTest[] = [
  {
    name: 'empty begin end program',
    code: `program test;
begin
end.`,
    purpose: 'empty statement-sequence is legal; minimal program parses, runs, and produces no output',
    expectedOutput: '',
  },
  {
    name: 'program with input/output program parameters',
    code: 'program test(input, output);\nbegin\n  writeln(7);\nend.',
    purpose:
      'program-parameter-list with input/output allows reading/writing standard text files (output rewrite post-assertion holds)',
    expectedOutput: '7\n',
  },
  {
    name: 'brace block comment at program start',
    code: '{ this is a comment }\nprogram test(output);\nbegin\n  writeln(1);\nend.',
    purpose: 'block comment before program is correctly skipped and does not affect execution',
    expectedOutput: '1\n',
  },
  {
    name: '(* *) style block comment',
    code: '(* another comment *)\nprogram test(output);\nbegin\n  writeln(2);\nend.',
    purpose: 'parenthesis-star style block comment before program is correctly skipped',
    expectedOutput: '2\n',
  },
  {
    name: 'empty comment',
    code: '{}\nprogram test(output);\nbegin\n  writeln(3);\nend.',
    purpose: 'empty brace comment (no commentary content) is handled correctly',
    expectedOutput: '3\n',
  },
  {
    name: 'multi-line block comment',
    code: '{\n  line 1\n  line 2\n  line 3\n}\nprogram test(output);\nbegin\n  writeln(4);\nend.',
    purpose: 'block comment spanning multiple lines is skipped as a whole',
    expectedOutput: '4\n',
  },
  {
    name: 'single-letter identifier',
    code: 'program test(output);\nvar\n  x: integer;\nbegin\n  x := 1;\n  writeln(x);\nend.',
    purpose: 'single-letter variable name is a legal identifier, assignable and readable',
    expectedOutput: '1\n',
  },
  {
    name: 'mixed-case identifier',
    code: 'program test(output);\nvar\n  MyVar: integer;\nbegin\n  myvar := 1;\n  MYVAR := 2;\n  writeln(MyVar);\nend.',
    purpose: 'Pascal identifiers are case-insensitive; three spellings refer to the same variable (last write is 2)',
    expectedOutput: '2\n',
  },
  {
    name: 'zero integer',
    code: 'program test(output);\nvar\n  x: integer;\nbegin\n  x := 0;\n  writeln(x);\nend.',
    purpose: 'zero integer constant assignment and output',
    expectedOutput: '0\n',
  },
  {
    name: 'negative constant',
    code: 'program test(output);\nvar\n  x: integer;\nbegin\n  x := -123;\n  writeln(x);\nend.',
    purpose: 'negative integer expression assignment and output',
    expectedOutput: '-123\n',
  },

  {
    name: 'multiplication has higher precedence than addition',
    code: 'program test(output);\nvar\n  a, b, c: integer;\nbegin\n  a := 2 + 3 * 4;\n  writeln(a);\nend.',
    purpose: 'ISO 6.7.1: * is a multiplying-operator, higher precedence than +; 2+3*4 should be 14',
    expectedOutput: '14\n',
  },
  {
    name: 'parentheses change precedence',
    code: 'program test(output);\nvar\n  a, b, c: integer;\nbegin\n  a := (2 + 3) * 4;\n  writeln(a);\nend.',
    purpose: 'ISO 6.7.1: factor may be a parenthesized expression; (2+3)*4 should be 20',
    expectedOutput: '20\n',
  },
  {
    name: 'NOT has higher precedence than AND',
    code:
      "program test(output);\nvar\n  a, b: boolean;\n  c: boolean;\nbegin\n  a := true;\n  b := false;\n  c := NOT a AND b;\n  if c then writeln('T') else writeln('F');\nend.",
    purpose: 'ISO 6.7.1: NOT is a factor-level operator; NOT a AND b parses as (NOT a) AND b, result false',
    expectedOutput: 'F\n',
  },
  {
    name: 'AND has higher precedence than OR',
    code:
      "program test(output);\nvar\n  a, b, c: boolean;\n  d: boolean;\nbegin\n  a := true;\n  b := true;\n  c := false;\n  d := a OR b AND c;\n  if d then writeln('T') else writeln('F');\nend.",
    purpose:
      'ISO 6.7.1: AND is a multiplying-operator, OR an adding-operator; a OR b AND c parses as a OR (b AND c), result true',
    expectedOutput: 'T\n',
  },

  {
    name: 'global variables visible in main program body',
    code: 'program test(output);\nvar\n  x, y: integer;\nbegin\n  x := 1;\n  y := x + 2;\n  writeln(y);\nend.',
    purpose:
      'variables declared in the main program are visible and participate in computation within the main program scope',
    expectedOutput: '3\n',
  },
  {
    name: 'variables declared inside a procedure',
    code:
      'program test(output);\nprocedure p;\nvar\n  x: integer;\nbegin\n  x := 1;\n  writeln(x);\nend;\nbegin\n  p;\nend.',
    purpose: 'variables declared inside a procedure belong to its local scope and are visible in the procedure body',
    expectedOutput: '1\n',
  },
  {
    name: 'function name as result variable',
    code: 'program test(output);\nfunction f: integer;\nbegin\n  f := 1;\nend;\nbegin\n  writeln(f);\nend.',
    purpose:
      'the function name serves as the result variable in the function scope; activating the function yields its value',
    expectedOutput: '1\n',
  },
  {
    name: 'function parameter scope',
    code:
      'program test(output);\nfunction f(x: integer): integer;\nbegin\n  f := x;\nend;\nbegin\n  writeln(f(9));\nend.',
    purpose: 'formal parameters are visible in the function scope and can serve as the result source',
    expectedOutput: '9\n',
  },
  {
    name: 'one-level nested procedure',
    code:
      "program test(output);\nprocedure outer;\nprocedure inner;\nbegin\n  writeln('inner');\nend;\nbegin\n  inner;\n  writeln('outer');\nend;\nbegin\n  outer;\nend.",
    purpose:
      'the inner procedure is visible and callable within the enclosing outer procedure; output order is inner then outer',
    expectedOutput: 'inner\nouter\n',
  },
  {
    name: 'nested procedure accessing outer variables',
    code:
      'program test(output);\nprocedure outer;\nvar\n  x: integer;\n  procedure inner;\n  begin\n    x := x + 1;\n  end;\nbegin\n  x := 0;\n  inner;\n  writeln(x);\nend;\nbegin\n  outer;\nend.',
    purpose: 'nested procedures can access (and modify) local variables of the enclosing procedure',
    expectedOutput: '1\n',
  },

  {
    name: 'parameterless procedure declaration and call',
    code: "program test(output);\nprocedure Hello;\nbegin\n  writeln('hello');\nend;\nbegin\n  Hello;\nend.",
    purpose: 'declaration and call of a parameterless procedure',
    expectedOutput: 'hello\n',
  },
  {
    name: 'single-parameter procedure declaration and call',
    code:
      'program test(output);\nprocedure PrintNum(n: integer);\nbegin\n  writeln(n);\nend;\nbegin\n  PrintNum(42);\nend.',
    purpose:
      'procedure declaration and call with a single value parameter; the actual argument is passed to the formal parameter',
    expectedOutput: '42\n',
  },
  {
    name: 'parameterless function declaration and call',
    code:
      'program test(output);\nvar\n  x: integer;\nfunction GetAnswer: integer;\nbegin\n  GetAnswer := 42;\nend;\nbegin\n  x := GetAnswer;\n  writeln(x);\nend.',
    purpose: 'declaration and call of a parameterless function; return value assigned to a variable',
    expectedOutput: '42\n',
  },
  {
    name: 'single-parameter function declaration and call',
    code:
      'program test(output);\nvar\n  y: integer;\nfunction Square(x: integer): integer;\nbegin\n  Square := x * x;\nend;\nbegin\n  y := Square(5);\n  writeln(y);\nend.',
    purpose: 'declaration and call of a single-parameter function; Square(5)=25',
    expectedOutput: '25\n',
  },
  {
    name: 'function return value assignment',
    code:
      'program test(output);\nvar\n  m: integer;\nfunction Max(a, b: integer): integer;\nbegin\n  if a > b then\n    Max := a\n  else\n    Max := b;\nend;\nbegin\n  m := Max(10, 20);\n  writeln(m);\nend.',
    purpose: 'assignment to the function name (return value) inside the function body; Max(10,20)=20',
    expectedOutput: '20\n',
  },
  {
    name: 'nested function call',
    code:
      'program test(output);\nvar\n  x: integer;\nfunction Outer: integer;\n  function Inner: integer;\n  begin\n    Inner := 10;\n  end;\nbegin\n  Outer := Inner * 2;\nend;\nbegin\n  x := Outer;\n  writeln(x);\nend.',
    purpose: 'declaration and call of nested functions; the inner function is visible inside the outer function body',
    expectedOutput: '20\n',
  },
  {
    name: 'procedure forward declaration',
    code:
      "program test(output);\nprocedure ForwardProc; forward;\nprocedure ForwardProc;\nbegin\n  writeln('forward');\nend;\nbegin\n  ForwardProc;\nend.",
    purpose:
      'ISO 6.6.1: the forward directive declares the procedure heading first, then the procedure body is given with the same heading',
    expectedOutput: 'forward\n',
  },
  {
    name: 'function forward declaration',
    code:
      'program test(output);\nvar\n  x: integer;\nfunction ForwardFunc: integer; forward;\nfunction ForwardFunc: integer;\nbegin\n  ForwardFunc := 42;\nend;\nbegin\n  x := ForwardFunc;\n  writeln(x);\nend.',
    purpose:
      'ISO 6.6.2: the forward directive declares the function heading first, then the function body is given with the same heading',
    expectedOutput: '42\n',
  },

  {
    name: 'simple recursive procedure',
    code:
      'program test(output);\nprocedure CountDown(n: integer);\nbegin\n  if n > 0 then\n  begin\n    writeln(n);\n    CountDown(n - 1);\n  end;\nend;\nbegin\n  CountDown(3);\nend.',
    purpose: 'simplest direct recursive procedure, outputting 3, 2, 1 in decreasing order',
    expectedOutput: '3\n2\n1\n',
  },
  {
    name: 'factorial recursive function',
    code:
      'program test(output);\nvar\n  f: integer;\nfunction Factorial(n: integer): integer;\nbegin\n  if n <= 1 then\n    Factorial := 1\n  else\n    Factorial := n * Factorial(n - 1);\nend;\nbegin\n  f := Factorial(5);\n  writeln(f);\nend.',
    purpose: 'classic recursive function, 5! = 120',
    expectedOutput: '120\n',
  },
  {
    name: 'two procedures mutually recursive',
    code:
      "program test(output);\nprocedure A(n: integer); forward;\nprocedure B(n: integer);\nbegin\n  if n > 0 then\n    A(n - 1)\n  else\n    writeln('B');\nend;\nprocedure A(n: integer);\nbegin\n  if n > 0 then\n    B(n - 1)\n  else\n    writeln('A');\nend;\nbegin\n  A(10);\nend.",
    purpose:
      'mutual recursion via forward declarations; A(10) after 10 alternating calls reaches the base case of A, outputting A',
    expectedOutput: 'A\n',
  },

  {
    name: 'enumerated type',
    code:
      "program test(output);\ntype\n  Color = (Red, Green, Blue);\nvar\n  c: Color;\nbegin\n  c := Green;\n  if (c > Red) and (c < Blue) then writeln('mid');\nend.",
    purpose: 'ISO 6.4.2.3: enumerated type values are ordered by declaration; Green is between Red and Blue',
    expectedOutput: 'mid\n',
  },
  {
    name: 'record type',
    code:
      "program test(output);\ntype\n  TRec = record\n    x: integer;\n    y: integer;\n  end;\nvar\n  r: TRec;\nbegin\n  r.x := 1;\n  r.y := 2;\n  writeln(r.x, ',', r.y);\nend.",
    purpose: 'record type declaration and field access',
    expectedOutput: '1,2\n',
  },
  {
    name: 'array type',
    code:
      'program test(output);\ntype\n  TArr = array[1..10] of integer;\nvar\n  a: TArr;\nbegin\n  a[1] := 10;\n  writeln(a[1]);\nend.',
    purpose: 'array type declaration and indexing',
    expectedOutput: '10\n',
  },
  {
    name: 'subrange type',
    code:
      'program test(output);\ntype\n  SmallInt = 0..100;\nvar\n  n: SmallInt;\nbegin\n  n := 50;\n  writeln(n);\nend.',
    purpose: 'subrange type declaration and in-range assignment',
    expectedOutput: '50\n',
  },

  {
    name: 'label used for GOTO',
    code:
      'program test(output);\nlabel 99;\nvar\n  x: integer;\nbegin\n  x := 1;\n  goto 99;\n  x := 2;\n99:\n  writeln(x);\nend.',
    purpose:
      'ISO 6.8.2.4: goto continues processing at the program point denoted by the label, skipping x := 2, so output is 1',
    expectedOutput: '1\n',
  },
  {
    name: 'WITH statement',
    code:
      'program test(output);\ntype\n  TRec = record\n    x: integer;\n  end;\nvar\n  r: TRec;\nbegin\n  with r do\n    x := 1;\n  writeln(r.x);\nend.',
    purpose:
      'ISO 6.8.3.10: the with statement creates a local scope for record fields; assignment is equivalent to r.x := 1',
    expectedOutput: '1\n',
  },

  {
    name: 'FILE OF CHAR variable supports text write operations',
    code: `PROGRAM TANGLE(F);
VAR F: FILE OF CHAR;
BEGIN
  REWRITE(F);
  WRITELN(F, 'OK');
END.`,
    purpose:
      'ISO 6.4.3.5: text is a distinct file type denoted by a required type-identifier; text procedures only apply to textfiles; this case covers this implementation allowing text procedures on FILE OF CHAR',
    textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
    expectedFileContains: [{ url: 'F', contains: 'OK' }],
  },
  {
    name: 'PACKED FILE OF CHAR type definition (TANGLE style)',
    code: `PROGRAM TANGLE(TERMOUT);
TYPE TEXTFILE = PACKED FILE OF CHAR;
VAR TERMOUT: TEXTFILE;
BEGIN
  REWRITE(TERMOUT);
  WRITELN(TERMOUT, 'Hello');
END.`,
    purpose:
      'ISO 6.4.3.5: packed file of char is a legal file-type notation usable as a structured type definition; here TEXTFILE is an alias and text is written to it',
    textFiles: new Map<string, Uint8Array>([['TERMOUT', new Uint8Array(0)]]),
    expectedFileContains: [{ url: 'TERMOUT', contains: 'Hello' }],
  },
  {
    name: 'multiple file variables (TANGLE program header declaration)',
    code: `PROGRAM TANGLE(WEBFILE, CHANGEFILE, PASCALFILE);
VAR WEBFILE, CHANGEFILE, PASCALFILE: FILE OF CHAR;
BEGIN
  REWRITE(WEBFILE);
  REWRITE(CHANGEFILE);
  REWRITE(PASCALFILE);
  WRITELN(WEBFILE, 'web');
  WRITELN(CHANGEFILE, 'change');
  WRITELN(PASCALFILE, 'pascal');
END.`,
    purpose: 'program-parameter-list may declare multiple file variables, each bound to a distinct external file',
    textFiles: new Map<string, Uint8Array>([
      ['WEBFILE', new Uint8Array(0)],
      ['CHANGEFILE', new Uint8Array(0)],
      ['PASCALFILE', new Uint8Array(0)],
    ]),
    expectedFileContains: [
      { url: 'WEBFILE', contains: 'web' },
      { url: 'CHANGEFILE', contains: 'change' },
      { url: 'PASCALFILE', contains: 'pascal' },
    ],
  },

  {
    name: 'PAGE outputs form feed character',
    code: `PROGRAM TANGLE(output);
BEGIN
  WRITELN('page1');
  PAGE;
  WRITELN('page2');
END.`,
    purpose:
      'ISO 6.9.5: the effect of PAGE is implementation-defined; this implementation writes a form-feed character (U+000C) between the two lines',
    expectedOutput: 'page1\n\fpage2\n',
  },
  {
    name: 'PAGE with file parameter',
    code: `PROGRAM TANGLE(F);
VAR F: FILE OF CHAR;
BEGIN
  REWRITE(F);
  WRITELN(F, 'before');
  PAGE(F);
  WRITELN(F, 'after');
END.`,
    purpose:
      'ISO 6.9.5: PAGE(f) applies an implementation-defined pagination effect to the file; the order of text before and after is preserved',
    textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
    expectedFileContains: [{ url: 'F', contains: 'before\n\fafter\n' }],
  },

  {
    name: 'TANGLE-style file variable declaration',
    code: `PROGRAM TANGLE(WEBFILE, CHANGEFILE, PASCALFILE, POOL);
VAR WEBFILE, CHANGEFILE, PASCALFILE, POOL: FILE OF CHAR;
BEGIN
  REWRITE(WEBFILE);
  REWRITE(CHANGEFILE);
  REWRITE(PASCALFILE);
  REWRITE(POOL);
  WRITELN('all opened');
END.`,
    purpose:
      'imitates tangle-official.pas program header with four file variable declarations; all REWRITEd then output confirmation',
    expectedOutput: 'all opened\n',
  },
  {
    name: 'TANGLE-style OUTPUTSTATE record',
    code: `PROGRAM TANGLE(output);
TYPE SIXTEENBITS = 0..65535;
     NAMEPOINTER = 0..4000;
     TEXTPOINTER = 0..2000;
     OUTPUTSTATE = RECORD
       ENDFIELD: SIXTEENBITS;
       BYTEFIELD: SIXTEENBITS;
       NAMEFIELD: NAMEPOINTER;
       REPLFIELD: TEXTPOINTER;
       MODFIELD: 0..12287;
     END;
VAR CURSTATE: OUTPUTSTATE;
BEGIN
  CURSTATE.ENDFIELD := 100;
  CURSTATE.NAMEFIELD := 42;
  WRITELN('end=', CURSTATE.ENDFIELD, ' name=', CURSTATE.NAMEFIELD);
END.`,
    purpose:
      'imitates tangle-official.pas OUTPUTSTATE record: field types are integer subranges; assignment and read work correctly',
    expectedOutput: 'end=100 name=42\n',
  },
  {
    name: 'TANGLE-style multi-dimensional array',
    code: `PROGRAM TANGLE(output);
CONST MAXBYTES = 100;
TYPE ASCIICODE = 0..127;
VAR BYTEMEM: ARRAY[0..1, 0..MAXBYTES] OF ASCIICODE;
    I, J: INTEGER;
BEGIN
  FOR I := 0 TO 1 DO
    FOR J := 0 TO 5 DO
      BYTEMEM[I, J] := I * 10 + J;
  WRITELN('byte=', BYTEMEM[1, 3]);
END.`,
    purpose: 'imitates tangle-official.pas BYTEMEM 2D array: index [1,3] writes 1*10+3=13',
    expectedOutput: 'byte=13\n',
  },

  {
    name: 'injection: host-injected function usable as expression',
    code: `program test(output);
begin
  writeln(triple(4));
end.`,
    purpose:
      'AGENTS.md principle A.7/A.8: non-standard capabilities are preferentially provided via injection; injected functions have a definition point at compile time',
    extraCallables: { triple: { kind: 'function', sysCallName: 'test.triple' } },
    extraSyscalls: { 'test.triple': (_ctx, x) => (x as number) * 3 },
    expectedOutput: '12\n',
  },
  {
    name: 'injection: host-injected procedure usable as statement',
    code: `program test(output);
begin
  emit(7);
  writeln('done');
end.`,
    purpose:
      'AGENTS.md principle A.7/A.8: injected procedures have a definition point at compile time and can be called as procedure statements',
    extraCallables: { emit: { kind: 'procedure', sysCallName: 'test.emit' } },
    extraSyscalls: { 'test.emit': (_ctx, x) => x },
    expectedOutput: 'done\n',
  },
  {
    name: 'injection: injection with same name as native procedure requires explicit override',
    code: `program test(output);
begin
  writeln('x');
end.`,
    purpose:
      'AGENTS.md principle A.7: injection by default must not override native required procedures/functions; must be explicitly allowed via allowOverrideNative',
    extraCallables: { writeln: { kind: 'procedure', sysCallName: 'test.writeln' } },
    expectedError: '',
  },
  {
    name: 'injection: same-name entries differing in case in injection table are conflicts',
    code: `program test(output);
begin
  writeln('x');
end.`,
    purpose:
      'AGENTS.md principle A.7: Pascal identifiers are case-insensitive; different spellings of the same name in the injection table constitute a conflict',
    extraCallables: {
      Foo: { kind: 'function', sysCallName: 'test.foo' },
      foo: { kind: 'function', sysCallName: 'test.fooOther' },
    },
    expectedError: '',
  },
]

runPascalTests('Other / unclassified', tests)
