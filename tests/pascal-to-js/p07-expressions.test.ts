// ISO/IEC 7185:1990 - 6.7 Expressions
//
// Section summary:
//   Specifies that an expression denotes a value; gives the syntax and operator precedence for expression / simple-expression / term / factor:
//   not has the highest precedence, followed by multiplicative operators (* / div mod and), then additive operators (+ - or) and sign, with relational operators lowest;
//   sequences of operators of the same precedence are left-associative. A factor whose type is a subrange of T is treated as T, and a set is treated as the corresponding canonical-set-of-T-type.
//   set-constructor: [] denotes a value with no members; a constructor containing a member-designator denotes the set of members determined by it.
//   The order of evaluation of member-designators is implementation-dependent. The operators section gives tables of multiplicative / additive / relational operators
//   and their result types; specifies that x/y is an error when y=0, the conditions for the values of i div j and i mod j, the four properties of maxint,
//   that integer arithmetic must be performed correctly according to mathematical rules (otherwise an error), that real arithmetic and conversion results are approximate with implementation-defined precision;
//   relational operations require operands to be compatible (or of the same set type, or one real and one integer), defines lexicographic comparison for compatible string-types,
//   and defines the in operation. function-designator specifies activation of the function block and returns a result
//   (an error if the result is undefined); actual and formal parameters correspond by position and are equal in number; the order of evaluation and binding is implementation-dependent.
//
// Subsections:
//   6.7.1 General
//   6.7.2 Operators
//     6.7.2.1 General
//     6.7.2.2 Arithmetic operators
//     6.7.2.3 Boolean operators
//     6.7.2.4 Set operators
//     6.7.2.5 Relational operators
//   6.7.3 Function-designators

import { type PascalTest, runPascalTests } from './harness.ts'

const tests: PascalTest[] = [
  {
    name: '6.7 Arithmetic precedence: multiplicative operators rank above additive operators',
    code: `program test(output);
var a, b, c: integer;
begin
  a := 2;
  b := 3;
  c := 4;
  writeln(a + b * c);
  writeln(a * b + c);
  writeln((a + b) * c);
end.`,
    purpose:
      'ISO 6.7.1: among the four precedence classes of operators, multiplicative operators rank above additive operators; parentheses can change the grouping',
    expectedOutput: '14\n10\n20\n',
  },
  {
    name: '6.7 Operators of the same precedence are left-associative',
    code: `program test(output);
begin
  writeln(20 - 5 - 3);
  writeln(100 div 10 div 2);
  writeln(8 div 3 * 3);
end.`,
    purpose:
      'ISO 6.7.1: a sequence of operators of the same precedence is left-associative; (20-5)-3=12, (100 div 10) div 2=5, (8 div 3)*3=6',
    expectedOutput: '12\n5\n6\n',
  },
  {
    name: '6.7 Relational operators have the lowest precedence',
    code: `program test(output);
begin
  if 1 + 1 = 2 then writeln('eq-ok');
  if 2 * 3 < 3 * 3 then writeln('lt-ok');
end.`,
    purpose:
      'ISO 6.7.1: relational operators have lower precedence than arithmetic operators; 1+1=2 and 2*3<3*3 evaluate the arithmetic first and then compare',
    expectedOutput: 'eq-ok\nlt-ok\n',
  },
  {
    name: '6.7 Boolean operator precedence: not is highest, and ranks above or',
    code: `program test(output);
var p, q, r: boolean;
begin
  p := true;
  q := false;
  r := false;
  if p or q and r then writeln('or-and');
  if (p or q) and r then writeln('paren') else writeln('not-eval');
  if not p and q then writeln('notp') else writeln('neg');
end.`,
    purpose:
      'ISO 6.7.1: not has the highest precedence and and ranks above or; p or q and r is equivalent to p or (q and r), not p and q is equivalent to (not p) and q',
    expectedOutput: 'or-and\nnot-eval\nneg\n',
  },
  {
    name: '6.7 Addition (Table 3)',
    code: 'program test(output); var x, y: integer; begin x := 5; y := 3; writeln(x + y); end.',
    purpose: 'ISO 6.7.2.2 Table 3: adding two integer operands yields an integer result',
    expectedOutput: '8\n',
  },
  {
    name: '6.7 Subtraction (Table 3)',
    code: 'program test(output); var x, y: integer; begin x := 10; y := 4; writeln(x - y); end.',
    purpose: 'ISO 6.7.2.2 Table 3: subtracting two integer operands yields an integer result',
    expectedOutput: '6\n',
  },
  {
    name: '6.7 Multiplication (Table 3)',
    code: 'program test(output); var x, y: integer; begin x := 6; y := 7; writeln(x * y); end.',
    purpose: 'ISO 6.7.2.2 Table 3: multiplying two integer operands yields an integer result',
    expectedOutput: '42\n',
  },
  {
    name: '6.7 Unary minus (Table 4, integer)',
    code: 'program test(output); var x: integer; begin x := 10; writeln(-x); writeln(-(-x)); end.',
    purpose: 'ISO 6.7.2.2 Table 4: unary sign negation applied to integer yields integer',
    expectedOutput: '-10\n10\n',
  },
  {
    name: '6.7 Division /: result is real (Table 3)',
    code: `program test(output);
var r: real;
i, j: integer;
begin
  i := 15;
  j := 3;
  r := i / j;
  writeln(trunc(r));
  r := 1 / 2;
  writeln(round(r));
end.`,
    purpose:
      'ISO 6.7.2.2 Table 3: although the operands of / are integer, the result is real; 1/2 yields 0.5 (round gives 1), which differs from integer division',
    expectedOutput: '5\n1\n',
  },
  {
    name: '6.7 Integer division div (Table 3)',
    code: 'program test(output); var x, y: integer; begin x := 17; y := 5; writeln(x div y); end.',
    purpose: 'ISO 6.7.2.2 Table 3: 17 div 5 = 3 (satisfying |i|-|j| < |(i div j)*j| <= |i|)',
    expectedOutput: '3\n',
  },
  {
    name: '6.7 Sign rule for div: truncation toward zero',
    code: `program test(output);
var i, j: integer;
begin
  i := -7;
  j := 2;
  writeln(i div j);
  i := 7;
  j := -2;
  writeln(i div j);
  i := -7;
  j := -2;
  writeln(i div j);
end.`,
    purpose:
      'ISO 6.7.2.2: the sign of i div j is positive when i and j have the same sign and negative when they have different signs, i.e., truncation toward zero; (-7) div 2=-3, 7 div (-2)=-3, (-7) div (-2)=3',
    expectedOutput: '-3\n-3\n3\n',
  },
  {
    name: '6.7 Definition of mod: 0 <= i mod j < j',
    code: `program test(output);
var i, j: integer;
begin
  i := -7;
  j := 3;
  writeln(i mod j);
  i := 7;
  j := 3;
  writeln(i mod j);
  i := 5;
  j := 5;
  writeln(i mod j);
end.`,
    purpose: 'ISO 6.7.2.2: i mod j is the value i-k*j satisfying 0 <= i mod j < j; (-7) mod 3=2, 7 mod 3=1, 5 mod 5=0',
    expectedOutput: '2\n1\n0\n',
  },
  {
    name: '6.7 Negative divisor of mod is an error',
    code: `program test(output);
var x, j: integer;
begin
  j := -3;
  x := 10 mod j;
  writeln(x);
end.`,
    purpose:
      '[Category B  D.46] ISO 6.7.2.2: i mod j is an error when j is negative (j <= 0 is an error) - a designated error; §5.1 f) permits declaring in the accompanying documentation that it is not reported; this processor chooses to detect and report it',
    expectedError: '',
  },
  {
    name: '6.7 Zero divisor of div is an error',
    code: `program test(output);
var x, j: integer;
begin
  j := 0;
  x := 10 div j;
  writeln(x);
end.`,
    purpose: 'ISO 6.7.2.2: i div j is an error when j is zero',
    expectedError: '',
  },
  {
    name: '6.7 Zero divisor of mod is an error',
    code: `program test(output);
var x, j: integer;
begin
  j := 0;
  x := 10 mod j;
  writeln(x);
end.`,
    purpose: 'ISO 6.7.2.2: i mod j is an error when j is zero',
    expectedError: '',
  },
  {
    name: '6.7 Mathematical properties of maxint (independent of its specific value)',
    code: `program test(output);
var x: integer;
begin
  x := maxint;
  writeln(x - x);
  if maxint + 0 = maxint then writeln('add-zero');
end.`,
    purpose:
      'ISO 6.7.2.2: maxint is an implementation-defined value, but its arithmetic within its own range must be correct; x-x=0 and maxint+0=maxint',
    expectedOutput: '0\nadd-zero\n',
  },
  {
    name: '6.7 Real arithmetic (Table 3)',
    code: `program test(output);
var r1, r2: real;
begin
  r1 := 2.5;
  r2 := 1.5;
  writeln(trunc(r1 + r2));
  writeln(trunc(r1 - r2));
  writeln(trunc(r1 * r2));
  writeln(trunc(r1 / r2));
end.`,
    purpose:
      'ISO 6.7.2.2 Table 3: the results of + - * / on two real operands are all real (trunc is used to convert to integer to avoid depending on the real output format)',
    expectedOutput: '4\n1\n3\n1\n',
  },
  {
    name: '6.7 Mixed real and integer arithmetic yields real (Table 3)',
    code: `program test(output);
var i: integer;
r: real;
begin
  i := 3;
  r := i + 2.5;
  writeln(trunc(r));
  r := i / 2;
  writeln(trunc(r));
end.`,
    purpose:
      'ISO 6.7.2.2 Table 3: when one operand is integer and the other is real the result is real; 3+2.5=5.5, 3/2=1.5',
    expectedOutput: '5\n1\n',
  },
  {
    name: '6.7 Unary minus (Table 4, real)',
    code: `program test(output);
var r: real;
begin
  r := 3.5;
  writeln(trunc(-r));
  writeln(trunc(-(-r)));
end.`,
    purpose: 'ISO 6.7.2.2 Table 4: unary sign negation applied to real yields real; -3.5 truncates to -3',
    expectedOutput: '-3\n3\n',
  },
  {
    name: '6.7 real and integer are compatible in relational operations',
    code: `program test(output);
var i: integer;
r: real;
begin
  i := 1;
  r := 1.5;
  if i < r then writeln('lt');
  i := 2;
  r := 2.0;
  if i = r then writeln('eq');
end.`,
    purpose: 'ISO 6.7.2.5: relational operators allow one operand to be real and the other integer',
    expectedOutput: 'lt\neq\n',
  },
  {
    name: '6.7 Relational operations = and <>',
    code: `program test(output);
var x, y: integer;
begin
  x := 5;
  y := 5;
  if x = y then writeln('equal');
  y := 3;
  if x <> y then writeln('not equal');
end.`,
    purpose: 'ISO 6.7.2.5: = and <> denote equality and inequality respectively',
    expectedOutput: 'equal\nnot equal\n',
  },
  {
    name: '6.7 Relational operations < > <= >=',
    code: `program test(output);
var x, y, z: integer;
begin
  x := 3;
  y := 5;
  z := 3;
  if x < y then writeln('less');
  if y > x then writeln('greater');
  if x <= z then writeln('le');
  if y >= x then writeln('ge');
end.`,
    purpose:
      'ISO 6.7.2.5: < > <= >= denote less-than, greater-than, less-than-or-equal, and greater-than-or-equal respectively',
    expectedOutput: 'less\ngreater\nle\nge\n',
  },
  {
    name: '6.7 Boolean not operation (6.7.2.3)',
    code: `program test(output);
var b: boolean;
begin
  b := true;
  if not b then writeln('t') else writeln('f');
  b := false;
  if not b then writeln('t') else writeln('f');
end.`,
    purpose:
      'ISO 6.7.2.3: not denotes logical negation; both the operand and the result are of Boolean-type (boolean is not output directly to avoid its case being implementation-defined)',
    expectedOutput: 'f\nt\n',
  },
  {
    name: '6.7 Boolean and operation (6.7.2.3)',
    code: `program test(output);
var a, b: boolean;
begin
  a := true;
  b := true;
  if a and b then writeln('1') else writeln('0');
  b := false;
  if a and b then writeln('1') else writeln('0');
  a := false;
  if a and b then writeln('1') else writeln('0');
end.`,
    purpose: 'ISO 6.7.2.3: and denotes logical conjunction; T and T = T, all others are F',
    expectedOutput: '1\n0\n0\n',
  },
  {
    name: '6.7 Boolean or operation (6.7.2.3)',
    code: `program test(output);
var a, b: boolean;
begin
  a := false;
  b := false;
  if a or b then writeln('1') else writeln('0');
  b := true;
  if a or b then writeln('1') else writeln('0');
  a := true;
  b := false;
  if a or b then writeln('1') else writeln('0');
end.`,
    purpose: 'ISO 6.7.2.3: or denotes logical disjunction; F or F = F, all others are T',
    expectedOutput: '0\n1\n1\n',
  },
  {
    name: '6.7 Mixed boolean operations',
    code: `program test(output);
var a, b, c: boolean;
begin
  a := true;
  b := false;
  c := true;
  if (a and not b) or (not a and c) then writeln('true') else writeln('false');
end.`,
    purpose: 'ISO 6.7.2.3: not/and/or combination, (T and not F) or (not T and T) = T',
    expectedOutput: 'true\n',
  },
  {
    name: '6.7 Boolean is an ordinal type: false < true',
    code: `program test(output);
begin
  if false < true then writeln('ok');
end.`,
    purpose: 'ISO 6.7.2.5 NOTE: Boolean-type is an ordinal type and false is less than true',
    expectedOutput: 'ok\n',
  },
  {
    name: '6.7 Set union operation + (Table 5)',
    code: `program test(output);
type T = set of 1..10;
var a, b, c: T;
begin
  a := [1, 2, 3];
  b := [3, 4, 5];
  c := a + b;
  if 1 in c then writeln('1');
  if 2 in c then writeln('2');
  if 5 in c then writeln('5');
end.`,
    purpose: 'ISO 6.7.2.4 Table 5: x belongs to u+v if and only if it belongs to u or to v',
    expectedOutput: '1\n2\n5\n',
  },
  {
    name: '6.7 Set intersection operation * (Table 5)',
    code: `program test(output);
type T = set of 1..10;
var a, b, c: T;
begin
  a := [1, 2, 3, 4];
  b := [3, 4, 5, 6];
  c := a * b;
  if 3 in c then writeln('3');
  if 4 in c then writeln('4');
  if 1 in c then writeln('1') else writeln('no 1');
end.`,
    purpose: 'ISO 6.7.2.4 Table 5: x belongs to u*v if and only if it belongs to both u and v',
    expectedOutput: '3\n4\nno 1\n',
  },
  {
    name: '6.7 Set difference operation - (Table 5)',
    code: `program test(output);
type T = set of 1..10;
var a, b, c: T;
begin
  a := [1, 2, 3, 4];
  b := [3, 4, 5];
  c := a - b;
  if 1 in c then writeln('1');
  if 2 in c then writeln('2');
  if 3 in c then writeln('3') else writeln('no 3');
end.`,
    purpose: 'ISO 6.7.2.4 Table 5: x belongs to u-v if and only if it belongs to u and not to v',
    expectedOutput: '1\n2\nno 3\n',
  },
  {
    name: '6.7 Set membership operation in (6.7.2.5)',
    code: `program test(output);
type T = set of char;
var s: T;
begin
  s := ['A', 'B', 'C'];
  if 'B' in s then writeln('yes');
  if 'X' in s then writeln('no') else writeln('not found');
end.`,
    purpose:
      'ISO 6.7.2.5: the left operand of in is of ordinal type and the right is of set type; it is true if a member and false otherwise',
    expectedOutput: 'yes\nnot found\n',
  },
  {
    name: '6.7 Set inclusion <= and >=',
    code: `program test(output);
type T = set of 1..10;
var a, b: T;
begin
  a := [1, 2];
  b := [1, 2, 3];
  if a <= b then writeln('subset');
  if b >= a then writeln('superset');
  if b <= a then writeln('in') else writeln('not-subset');
end.`,
    purpose: 'ISO 6.7.2.5: for set types, u <= v means u is included in v, u >= v means v is included in u',
    expectedOutput: 'subset\nsuperset\nnot-subset\n',
  },
  {
    name: '6.7 Set equality = and <>',
    code: `program test(output);
type T = set of 1..10;
var a, b: T;
begin
  a := [1, 2, 3];
  b := [3, 2, 1];
  if a = b then writeln('equal');
  b := [1, 2, 3, 4];
  if a <> b then writeln('not equal');
end.`,
    purpose: 'ISO 6.7.2.5: set equality is independent of the order in which members are written; [1,2,3] = [3,2,1]',
    expectedOutput: 'equal\nnot equal\n',
  },
  {
    name: '6.7 Set constructor [] and member range [x..y]',
    code: `program test(output);
type T = set of 1..10;
var a: T;
begin
  a := [];
  if 1 in a then writeln('has') else writeln('empty');
  a := [5..3];
  if 5 in a then writeln('has5') else writeln('no5');
  a := [3..5];
  if 4 in a then writeln('yes4');
end.`,
    purpose:
      'ISO 6.7.1: [] denotes no members; [x..y] denotes members of the closed interval; when x>y it contains no members; [3..5] contains 4',
    expectedOutput: 'empty\nno5\nyes4\n',
  },
  {
    name: '6.7 Set constructor mixing individual elements and ranges',
    code: `program test(output);
type T = set of 0..20;
var s: T;
begin
  s := [1, 3..5, 10];
  if 1 in s then writeln('1 yes');
  if 4 in s then writeln('4 yes');
  if 10 in s then writeln('10 yes');
  if 2 in s then writeln('2 yes') else writeln('2 no');
end.`,
    purpose:
      'ISO 6.7.1: the member-designator of a set-constructor can be a single expression or an x..y range; [1,3..5,10] contains 1, 3, 4, 5, 10',
    expectedOutput: '1 yes\n4 yes\n10 yes\n2 no\n',
  },
  {
    name: '6.7 A factor of subrange type is treated as its base type',
    code: 'program test(output); type Age = 0..120; var a: Age; begin a := 25; a := a + 5; writeln(a); end.',
    purpose:
      'ISO 6.7.1: a factor whose type is a subrange of T is treated as T, so the Age variable participates in integer addition before assignment-compatibility checking',
    expectedOutput: '30\n',
  },
  {
    name: '6.7 ord and chr are inverses (independent of the specific ordinal values of the character set)',
    code: `program test(output);
var c: char;
i: integer;
begin
  c := 'A';
  i := ord(c);
  if chr(i) = c then writeln('roundtrip');
end.`,
    purpose:
      'ISO 6.6.6.2 transfer functions: ord and chr are inverse operations of each other; only asserts chr(ord(c)) = c, without assuming the specific ordinal value of the character',
    expectedOutput: 'roundtrip\n',
  },
  {
    name: '6.7.3 function-designator: actual parameters correspond to formal parameters by position',
    code: `program test(output);
function subtract(a, b: integer): integer;
begin
  subtract := a - b;
end;
begin
  writeln(subtract(10, 3));
  writeln(subtract(3, 10));
end.`,
    purpose:
      'ISO 6.7.3: actual and formal parameters correspond by position, not by name; the parameter order affects the result',
    expectedOutput: '7\n-7\n',
  },
  {
    name: '6.7.3 function-designator: undefined result is an error',
    code: `program test(output);
function f(x: integer): integer;
var y: integer;
begin
  y := x + 1;
end;
begin
  writeln(f(1));
end.`,
    purpose:
      '[Category B  D.48] ISO 6.7.3: an error occurs if the result is undefined when the function activation ends (f is never assigned within the function body) - a designated error; §5.1 f) permits declaring in the accompanying documentation that it is not reported; this processor chooses to detect and report it',
    expectedError: '',
  },
  {
    name: '6.7.3 function-designator: the number of actual parameters must equal the number of formal parameters',
    code: `program test(output);
function add(a, b: integer): integer;
begin
  add := a + b;
end;
begin
  writeln(add(1, 2, 3));
end.`,
    purpose:
      'ISO 6.7.3: the number of actual parameters must equal the number of formal parameters; passing too many actual parameters should raise an error',
    expectedError: '',
  },
  {
    name: '6.7.3 function-designator: too few actual parameters should raise an error',
    code: `program test(output);
function add(a, b: integer): integer;
begin
  add := a + b;
end;
begin
  writeln(add(1));
end.`,
    purpose:
      'ISO 6.7.3: the number of actual parameters must equal the number of formal parameters; passing too few actual parameters should also raise an error',
    expectedError: '',
  },
  {
    name: '6.7.1 An invalid token in the factor position should raise an error',
    code: `program test;
var x: integer;
begin
  x := * 3;
end.`,
    purpose:
      'ISO 6.7.1: a factor can only be a constant, a variable access, a function-designator, a set-constructor, a parenthesized expression, or not factor',
    expectedError: '',
  },
  {
    name: '6.7.1 A parenthesized expression missing the closing parenthesis should raise an error',
    code: `program test;
var x: integer;
begin
  x := (1 + 2;
end.`,
    purpose: 'ISO 6.7.1: parenthesized-expression = ( expression )',
    expectedError: '',
  },
  {
    name: '6.7.1 A factor missing after not should raise an error',
    code: `program test;
var b: boolean;
begin
  b := not ;
end.`,
    purpose: 'ISO 6.7.1: not factor requires a valid factor following not',
    expectedError: '',
  },
  {
    name: '6.5.3.2 An array index list must not be empty',
    code: `program test;
var a: array[1..3] of integer;
begin
  a[] := 1;
end.`,
    purpose: 'ISO 6.5.3.2: the square brackets of an indexed-variable must contain an index-expression-list',
    expectedError: '',
  },
  {
    name: '6.5.3.3 The field name of a field-designator must be an identifier',
    code: `program test;
type r = record x: integer end;
var v: r;
begin
  v.1 := 1;
end.`,
    purpose: 'ISO 6.5.3.3: field-designator = record-variable . field-identifier',
    expectedError: '',
  },
  {
    name: '6.7.1 A set constructor missing the closing bracket should raise an error',
    code: `program test;
var s: set of 1..3;
begin
  s := [1, 2;
end.`,
    purpose: 'ISO 6.7.1: set-constructor = [ [ element {, element} ] ]',
    expectedError: '',
  },
  {
    name: '6.7.1 An invalid element in a set constructor should raise an error',
    code: `program test;
var s: set of 1..3;
begin
  s := [1, , 2];
end.`,
    purpose: 'ISO 6.7.1: element = expression [ .. expression ]; empty elements are not allowed',
    expectedError: '',
  },
  {
    name: '6.7.1 An invalid upper bound of a range expression in a set constructor should raise an error',
    code: `program test;
var s: set of 1..3;
begin
  s := [1..];
end.`,
    purpose: 'ISO 6.7.1: after .. is given in an element, a second expression must follow',
    expectedError: '',
  },
  {
    name:
      '6.7.1 Constant expressions can be used as array indices (addition, subtraction, multiplication, integer division, remainder)',
    code: `program test(output);
const N = 2;
var a: array[0..10] of integer;
begin
  a[N + 1] := 1;
  a[N * 3] := 2;
  a[7 - N] := 3;
  a[8 div N] := 4;
  a[9 mod 5] := 5;
  writeln(a[3], a[6], a[5], a[4]);
end.`,
    purpose:
      'ISO 6.7.1/6.4.3.2: expressions in an index-expression-list may use additive/multiplicative operators, only requiring their values to be assignment-compatible with the index-type',
    expectedOutput: '1235\n',
  },
  {
    name: '6.4.3.2 An array index outside the index-type range should raise an error',
    code: `program test;
var a: array[1..10] of integer;
begin
  a[11] := 1;
end.`,
    purpose: 'ISO 6.4.3.2/6.4.6 c: the value of an index-expression must fall within the value range of the index-type',
    expectedError: '',
  },
  {
    name: '6.7.1 An invalid expression inside parentheses should raise an error',
    code: `program test;
var x: integer;
begin
  x := (;
end.`,
    purpose: 'ISO 6.7.1: a parenthesized expression must contain a valid expression inside the parentheses',
    expectedError: '',
  },
  {
    name: '6.7.3 An invalid first item in the actual parameter list of a function-designator should raise an error',
    code: `program test(output);
begin
  writeln(abs(;));
end.`,
    purpose: 'ISO 6.7.3: each item in an actual-parameter-list must be a valid expression',
    expectedError: '',
  },
  {
    name:
      '6.7.3 An actual parameter list of a function-designator missing the closing parenthesis should raise an error',
    code: `program test(output);
begin
  writeln(abs(1;));
end.`,
    purpose: 'ISO 6.7.3: an actual-parameter-list ends with a closing parenthesis',
    expectedError: '',
  },
  {
    name: '6.5.3.2 An index list of an array access missing the closing bracket should raise an error',
    code: `program test;
var a: array[1..3] of integer;
begin
  a[1 := 2;
end.`,
    purpose: 'ISO 6.5.3.2: an index-expression-list ends with a closing bracket',
    expectedError: '',
  },
  {
    name: '6.7.1 An invalid operand on the right of a multiplicative operator should raise an error',
    code: `program test;
var x: integer;
begin
  x := 1 * ;
end.`,
    purpose:
      'ISO 6.7.1: term = factor { multiplying-operator factor }; the right side of an operator must be a valid factor',
    expectedError: '',
  },
  {
    name: '6.7.1 A term missing after the sign of a simple-expression should raise an error',
    code: `program test;
var x: integer;
begin
  x := - ;
end.`,
    purpose: 'ISO 6.7.1: simple-expression = [ sign ] term { adding-operator term }',
    expectedError: '',
  },
  {
    name: '6.7.1 An invalid term on the right of an additive operator should raise an error',
    code: `program test;
var x: integer;
begin
  x := 1 + ;
end.`,
    purpose: 'ISO 6.7.1: the right side of an adding-operator in a simple-expression must be a valid term',
    expectedError: '',
  },
  {
    name: '6.7.1 An invalid simple-expression on the right of a relational operator should raise an error',
    code: `program test(output);
begin
  if 1 < then writeln(1);
end.`,
    purpose: 'ISO 6.7.1: expression = simple-expression [ relational-operator simple-expression ]',
    expectedError: '',
  },
  {
    name: '6.5.3.2 Using indexing on a non-array variable should raise an error',
    code: `program test;
var x: integer;
begin
  x := 1;
  x := x[1];
end.`,
    purpose: 'ISO 6.5.3.2: the variable of an indexed-variable must be of array type',
    expectedError: '',
  },
  {
    name: '6.5.3.3 Using a field-designator on a non-record variable should raise an error',
    code: `program test;
var i: integer;
begin
  i := 1;
  i := i.f;
end.`,
    purpose: 'ISO 6.5.3.3: the record-variable of a field-designator must be of record type',
    expectedError: '',
  },
]

runPascalTests('ISO 7185 6.7 - Expressions', tests)
