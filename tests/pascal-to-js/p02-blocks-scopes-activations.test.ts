// ISO/IEC 7185:1990 - 6.2 Blocks, scopes, and activations
//
//
//   6.2.1 Blocks
//   6.2.2 Scopes
//   6.2.3 Activations

import { type PascalTest, runPascalTests } from './harness.ts'

const tests: PascalTest[] = [
  {
    name: '6.2 main program can access global variables',
    code: `program test(output);
var x: integer;
begin
  x := 42;
  writeln(x);
end.`,
    purpose: 'the scope of a global variable covers the entire program block',
    expectedOutput: '42\n',
  },
  {
    name: '6.2 procedure can access global variables',
    code: `program test(output);
var x: integer;
procedure show;
begin
  writeln(x);
end;
begin
  x := 100;
  show;
end.`,
    purpose: 'the procedure body is within the scope of the global variable',
    expectedOutput: '100\n',
  },
  {
    name: '6.2 nested procedure can access global variables',
    code: `program test(output);
var x: integer;
procedure outer;
procedure inner;
begin
  writeln(x);
end;
begin
  inner;
end;
begin
  x := 200;
  outer;
end.`,
    purpose:
      'scope is the region and all enclosing regions; nested procedures are also within the global variable scope',
    expectedOutput: '200\n',
  },
  {
    name: '6.2 function can access global variables',
    code: `program test(output);
var x: integer;
function getx: integer;
begin
  getx := x;
end;
begin
  x := 50;
  writeln(getx);
end.`,
    purpose: 'the function body is within the scope of the global variable',
    expectedOutput: '50\n',
  },
  {
    name: '6.2 multiple global variables are all visible',
    code: `program test(output);
var a, b, c: integer;
procedure calc;
begin
  writeln(a + b + c);
end;
begin
  a := 1;
  b := 2;
  c := 3;
  calc;
end.`,
    purpose: 'multiple identifiers in the same variable-declaration each denote a distinct variable',
    expectedOutput: '6\n',
  },

  {
    name: '6.2 local variables inside a procedure',
    code: `program test(output);
procedure proc;
var x: integer;
begin
  x := 10;
  writeln(x);
end;
begin
  proc;
end.`,
    purpose: 'the region of a variable declared in a procedure is that procedure block',
    expectedOutput: '10\n',
  },
  {
    name: '6.2 local variables inside a function',
    code: `program test(output);
function func: integer;
var x: integer;
begin
  x := 20;
  func := x;
end;
begin
  writeln(func);
end.`,
    purpose: 'the region of a variable declared in a function is that function block',
    expectedOutput: '20\n',
  },
  {
    name: '6.2 local variable shadows same-named global variable',
    code: `program test(output);
var x: integer;
procedure proc;
var x: integer;
begin
  x := 99;
  writeln(x);
end;
begin
  x := 1;
  proc;
  writeln(x);
end.`,
    purpose:
      'ISO 6.2.2.5: an inner same-named definition point excludes the outer definition point from the inner scope',
    expectedOutput: '99\n1\n',
  },
  {
    name: '6.2 inner local variable shadows outer local variable',
    code: `program test(output);
procedure outer;
var x: integer;
procedure inner;
var x: integer;
begin
  x := 3;
  writeln(x);
end;
begin
  x := 2;
  inner;
  writeln(x);
end;
begin
  outer;
end.`,
    purpose: 'the same-named local variable of an inner procedure shadows that of the outer procedure',
    expectedOutput: '3\n2\n',
  },
  {
    name: '6.2 local variables of sibling procedures do not affect each other',
    code: `program test(output);
procedure proc1;
var x: integer;
begin
  x := 10;
  writeln(x);
end;
procedure proc2;
var x: integer;
begin
  x := 20;
  writeln(x);
end;
begin
  proc1;
  proc2;
end.`,
    purpose: 'each procedure has its own namespace; same-named local variables are distinct entities',
    expectedOutput: '10\n20\n',
  },
  {
    name: '6.2 local variable is not visible outside its scope',
    code: `program test(output);
procedure proc;
var x: integer;
begin
  x := 5;
end;
begin
  writeln(x);
end.`,
    purpose:
      'ISO 6.2.2: a local variable inside a procedure is not in the scope of the main program block; referencing it is an error',
    expectedError: 'undefined identifier',
  },

  {
    name: '6.2 value parameter does not modify the actual argument',
    code: `program test(output);
var a: integer;
procedure setx(n: integer);
begin
  n := n + 1;
  writeln(n);
end;
begin
  a := 10;
  setx(a);
  writeln(a);
end.`,
    purpose:
      'a value parameter is a local variable assigned at call time; assigning to it does not affect the actual argument',
    expectedOutput: '11\n10\n',
  },
  {
    name: '6.2 var parameter modifies the actual argument',
    code: `program test(output);
var a: integer;
procedure setx(var n: integer);
begin
  n := n + 1;
end;
begin
  a := 10;
  setx(a);
  writeln(a);
end.`,
    purpose:
      'a variable parameter denotes the same variable as the actual argument; assigning to it modifies the actual argument',
    expectedOutput: '11\n',
  },
  {
    name: '6.2 formal parameter shadows same-named global variable',
    code: `program test(output);
var x: integer;
procedure proc(x: integer);
begin
  writeln(x);
end;
begin
  x := 100;
  proc(5);
end.`,
    purpose:
      'the definition point of a formal parameter shadows same-named outer definition points within its procedure block',
    expectedOutput: '5\n',
  },
  {
    name: '6.2 formal parameter shadows same-named local variable',
    code: `program test(output);
procedure outer;
var x: integer;
procedure inner(x: integer);
begin
  writeln(x);
end;
begin
  x := 10;
  inner(20);
end;
begin
  outer;
end.`,
    purpose: 'the formal parameter of an inner procedure shadows the same-named definition point of the outer variable',
    expectedOutput: '20\n',
  },
  {
    name: '6.2 nested procedure can access formal parameters of the enclosing procedure',
    code: `program test(output);
procedure outer(a: integer);
procedure inner;
begin
  writeln(a);
end;
begin
  inner;
end;
begin
  outer(42);
end.`,
    purpose: 'the formal parameter of an outer procedure is visible within the scope of its nested procedure',
    expectedOutput: '42\n',
  },
  {
    name: '6.2 nested function can access enclosing procedure parameters',
    code: `program test(output);
procedure outer(n: integer);
function inner: integer;
begin
  inner := n * 2;
end;
begin
  writeln(inner);
end;
begin
  outer(10);
end.`,
    purpose: 'the outer procedure parameter is visible within the scope of the nested function',
    expectedOutput: '20\n',
  },
  {
    name: '6.2 function formal parameter shadows outer local variable',
    code: `program test(output);
procedure outer;
var x: integer;
function inner(x: integer): integer;
begin
  inner := x + 1;
end;
begin
  x := 10;
  writeln(inner(5));
end;
begin
  outer;
end.`,
    purpose:
      'the function formal parameter shadows the same-named definition point of the outer procedure local variable',
    expectedOutput: '6\n',
  },
  {
    name: '6.2 multiple formal parameters',
    code: `program test(output);
procedure calc(a, b, c: integer);
begin
  writeln(a + b + c);
end;
begin
  calc(1, 2, 3);
end.`,
    purpose: 'multiple identifiers in the same parameter-group each denote a formal parameter',
    expectedOutput: '6\n',
  },

  {
    name: '6.2 function name serves as result variable inside function body',
    code: `program test(output);
function double(n: integer): integer;
begin
  double := n * 2;
end;
begin
  writeln(double(5));
end.`,
    purpose:
      'ISO 6.6.2: the function identifier can be used as an assignment target within the function block; the assigned value is the function result',
    expectedOutput: '10\n',
  },
  {
    name: '6.2 function call result participates in an expression',
    code: `program test(output);
function add(a, b: integer): integer;
begin
  add := a + b;
end;
begin
  writeln(add(3, 4) * 2);
end.`,
    purpose: 'a function-designator denotes the result value of a function activation and may be used in an expression',
    expectedOutput: '14\n',
  },
  {
    name: '6.2 return value of nested function',
    code: `program test(output);
procedure outer;
function inner(n: integer): integer;
begin
  inner := n * 3;
end;
begin
  writeln(inner(5));
end;
begin
  outer;
end.`,
    purpose: 'a nested function can be called within the scope of its enclosing block',
    expectedOutput: '15\n',
  },
  {
    name: '6.2 return value of recursive function',
    code: `program test(output);
function fact(n: integer): integer;
begin
  if n = 0 then
    fact := 1
  else
    fact := n * fact(n - 1);
end;
begin
  writeln(fact(5));
end.`,
    purpose: 'the scope of a function identifier covers its own function block, so it can be called recursively',
    expectedOutput: '120\n',
  },

  {
    name: '6.2 goto and label inside a procedure',
    code: `program test(output);
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
    purpose: 'the scope of a label matches its block; a goto target inside a procedure is within the same block',
    expectedOutput: 'ok\n',
  },
  {
    name: '6.2 goto and label in the main program',
    code: `program test(output);
label 20;
begin
  goto 20;
  writeln('skipped');
  20:
  writeln('done');
end.`,
    purpose: 'a label declared in the main program block can serve as a goto target within that block',
    expectedOutput: 'done\n',
  },
  {
    name: '6.2 goto from a procedure to a label in the enclosing block',
    code: `program test(output);
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
    purpose:
      'ISO 6.8.1 c) / 6.8.2.4: a label declared in an outer block can still serve as a goto target inside nested blocks',
    expectedOutput: 'start\nend\n',
  },
  {
    name: '6.2 label in a nested procedure',
    code: `program test(output);
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
    purpose: 'label declaration and use are within the same procedure block',
    expectedOutput: 'yes\n',
  },
  {
    name: '6.2 same-named labels in different scopes do not conflict',
    code: `program test(output);
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
    purpose:
      'a label is determined by its definition point in a block; same-named numeric labels in different blocks are distinct entities',
    expectedOutput: 'p1\np2\n',
  },

  {
    name: '6.2 procedure can access global constants',
    code: `program test(output);
const PI = 3.14;
begin
  writeln(round(PI * 100));
end.`,
    purpose:
      'the scope of a global constant definition point covers the entire program block (real output format is implementation-defined, so compare as integer)',
    expectedOutput: '314\n',
  },
  {
    name: '6.2 local constant shadows same-named global constant',
    code: `program test(output);
const x = 10;
procedure proc;
const x = 20;
begin
  writeln(x);
end;
begin
  proc;
end.`,
    purpose: 'an inner constant definition point shadows a same-named outer constant',
    expectedOutput: '20\n',
  },
  {
    name: '6.2 local constant inside a procedure',
    code: `program test(output);
procedure proc;
const LIMIT = 100;
begin
  writeln(LIMIT);
end;
begin
  proc;
end.`,
    purpose: 'constants may be declared inside a procedure block; their scope is that procedure block',
    expectedOutput: '100\n',
  },
  {
    name: '6.2 constant visible inside a nested procedure',
    code: `program test(output);
procedure outer;
const C = 50;
procedure inner;
begin
  writeln(C);
end;
begin
  inner;
end;
begin
  outer;
end.`,
    purpose: 'constants of an outer procedure are visible within the scope of its nested procedure',
    expectedOutput: '50\n',
  },
  {
    name: '6.2 procedure can access global types',
    code: `program test(output);
type T = integer;
var x: T;
procedure proc;
var y: T;
begin
  y := 10;
  writeln(y);
end;
begin
  proc;
end.`,
    purpose: 'the scope of a global type identifier covers the entire program block',
    expectedOutput: '10\n',
  },
  {
    name: '6.2 local type defined inside a procedure',
    code: `program test(output);
procedure proc;
type T = integer;
var x: T;
begin
  x := 20;
  writeln(x);
end;
begin
  proc;
end.`,
    purpose: 'types may be declared inside a procedure block; their scope is that procedure block',
    expectedOutput: '20\n',
  },

  {
    name: '6.2 accessing record fields across scopes',
    code: `program test(output);
type
  Person = record
    age: integer;
  end;
var p: Person;
procedure setAge(a: integer);
begin
  p.age := a;
end;
begin
  setAge(30);
  writeln(p.age);
end.`,
    purpose: 'components of a global variable are accessible within the procedure scope',
    expectedOutput: '30\n',
  },
  {
    name: '6.2 using array types across scopes',
    code: `program test(output);
type
  Arr = array[1..5] of integer;
var a: Arr;
procedure fill;
var i: integer;
begin
  for i := 1 to 5 do
    a[i] := i;
  writeln(a[3]);
end;
begin
  fill;
end.`,
    purpose: 'components of a global array variable are accessible inside the procedure',
    expectedOutput: '3\n',
  },
  {
    name: '6.2 using enumerated types across scopes',
    code: `program test(output);
type
  Color = (red, green, blue);
var c: Color;
procedure setColor;
begin
  c := green;
  if c = green then writeln('ok');
end;
begin
  setColor;
end.`,
    purpose: 'both global types and global variables are accessible inside the procedure',
    expectedOutput: 'ok\n',
  },
  {
    name: '6.2 procedure can indirectly modify state via global variables',
    code: `program test(output);
var x: integer;
procedure proc;
var temp: integer;
begin
  temp := x;
  x := temp + 1;
end;
begin
  x := 5;
  proc;
  writeln(x);
end.`,
    purpose:
      'local variables in a procedure and global variables are distinct entities; global variables can be modified by the procedure',
    expectedOutput: '6\n',
  },

  {
    name: '6.2.2.7 type and var in the same region must not spell the same',
    code: `program test;
type P = ^integer;
var p: P;
begin
  new(p);
  p^ := 1;
end.`,
    purpose:
      'ISO 6.2.2.7: any two definition points with the same spelling in the same region are not allowed (type P and var p)',
    expectedError: '',
  },
  {
    name: '6.2.2.7 const and var in the same region must not spell the same',
    code: `program test;
const N = 1;
var n: integer;
begin
  n := N;
end.`,
    purpose: 'ISO 6.2.2.7: const N and var n have the same spelling in the same region, not allowed',
    expectedError: '',
  },

  {
    name: '6.2 positive: built-in procedure writeln can be called normally',
    code: `PROGRAM P(output);BEGIN WRITELN('ok');END.`,
    purpose: 'required procedures do not depend on user declaration and should not be misjudged as undefined',
    expectedOutput: 'ok\n',
  },
  {
    name: '6.2 positive: built-in function abs can be called normally',
    code: `PROGRAM P(output);VAR X:INTEGER;BEGIN X:=ABS(-5);WRITELN(X);END.`,
    purpose: 'required functions do not depend on user declaration and should not be misjudged as undefined',
    expectedOutput: '5\n',
  },
  {
    name: '6.2 positive: maxint is a predefined constant',
    code: `PROGRAM P(output);BEGIN IF MAXINT > 0 THEN WRITELN('positive');END.`,
    purpose:
      'ISO 6.7.2.2: maxint denotes the maximum value of the integer type; its concrete value is implementation-defined, so only assert it is positive',
    expectedOutput: 'positive\n',
  },
  {
    name: '6.2 positive: nil is a parameterless identifier',
    code: `PROGRAM P(output);TYPE IP=^INTEGER;VAR P1:IP;BEGIN P1:=NIL;IF P1=NIL THEN WRITELN('nil');END.`,
    purpose: 'ISO 6.4.4: nil is a predefined value of pointer-type and should not be misjudged as undefined',
    expectedOutput: 'nil\n',
  },
  {
    name: '6.2 positive: eof is a parameterless identifier',
    code: `PROGRAM P(INPUT);BEGIN IF EOF THEN WRITELN('eof');END.`,
    purpose: 'ISO 6.9.1: omitting the file-variable applies to the program parameter input; eof is true on empty input',
    expectedOutput: 'eof\n',
  },
  {
    name: '6.2 negative: referencing an undeclared variable is an error',
    code: `PROGRAM P;VAR X:INTEGER;BEGIN Y:=1;END.`,
    purpose: 'ISO 6.2.2: the definition point of a variable must precede its applied occurrence; Y is undeclared',
    expectedError: 'undefined identifier',
  },
  {
    name: '6.2 negative: calling an undeclared function is an error',
    code: `PROGRAM P;VAR X:INTEGER;BEGIN X:=FOO(1);END.`,
    purpose: 'ISO 6.2.2: FOO is undeclared; its applied occurrence cannot be located',
    expectedError: 'unknown function',
  },
  {
    name: '6.2 negative: calling an undeclared procedure is an error',
    code: `PROGRAM P;BEGIN BAR;END.`,
    purpose: 'ISO 6.2.2: BAR is undeclared; its applied occurrence cannot be located',
    expectedError: 'unknown procedure',
  },
  {
    name: '6.2 negative: referencing undeclared variable in a nested procedure is an error',
    code: `PROGRAM P;PROCEDURE Q;BEGIN LOCAL:=1;END;BEGIN Q;END.`,
    purpose: 'referencing an undeclared variable in a local scope also violates declare-before-use',
    expectedError: 'undefined identifier',
  },
  {
    name: '6.2 a single label declaration may contain multiple comma-separated labels',
    code: `program p(output);
label 1, 2;
var x: integer;
begin
  x := 0;
  goto 2;
1: x := 1;
2: writeln(x);
end.`,
    purpose: 'ISO 6.2.2: label-declaration = label {, label}; one declaration may list multiple labels',
    expectedOutput: '0\n',
  },
  {
    name: '6.2 the same label must not be declared twice in the same label declaration part',
    code: `program p(output);
label 1, 1;
begin
  1: writeln('x');
end.`,
    purpose: 'ISO 6.2.2.7: there must be no duplicate definition points in the same region',
    expectedError: '',
  },
  {
    name: '6.2 label must be a digit sequence',
    code: `program p(output);
label abc;
begin
  writeln('x');
end.`,
    purpose: 'ISO 6.1.6: a label is a digit-sequence; other forms are not legal labels',
    expectedError: '',
  },
  {
    name: '6.2 label declaration must end with a semicolon',
    code: `program p(output);
label 1
begin
  writeln('x');
end.`,
    purpose: 'ISO 6.2.2: each entry in the label-declaration-part is terminated by a semicolon',
    expectedError: '',
  },
  {
    name: '6.2 label value must not exceed the allowed range',
    code: `program p(output);
label 10000;
begin
  10000: writeln('x');
end.`,
    purpose: 'ISO 6.1.6: the range of label values is 0..9999',
    expectedError: '',
  },
]

runPascalTests('ISO 7185 6.2 - Blocks, scopes, and activations', tests)
