// ISO/IEC 7185:1990 - 6.5 Declarations and denotations of variables
//
//
//   6.5.1 Variable-declarations
//   6.5.2 Entire-variables
//   6.5.3 Component-variables
//     6.5.3.1 General
//     6.5.3.2 Indexed-variables
//     6.5.3.3 Field-designators
//   6.5.4 Identified-variables
//   6.5.5 Buffer-variables

import { type PascalTest, runPascalTests } from './harness.ts'

function text(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

const tests: PascalTest[] = [
  // 6.5.1 Variable-declarations
  {
    name: '6.5.1 each identifier in a declaration list denotes a distinct variable',
    code: `program p(output);
var a, b: integer;
begin
  a := 1;
  b := 2;
  writeln(a, b);
end.`,
    purpose: 'each identifier in the identifier-list denotes a variable of that type',
    expectedOutput: '12\n',
  },
  {
    name: '6.5.1 the type of a variable is determined by the type-denoter',
    code: `program p(output);
var ch: char;
begin
  ch := 'x';
  writeln(ch);
end.`,
    purpose: 'the type of a variable is the type denoted by the type-denoter in the variable-declaration',
    expectedOutput: 'x\n',
  },

  // 6.5.2 Entire-variables
  {
    name: '6.5.2 the entire variable as a variable access',
    code: `program p(output);
var x: integer;
begin
  x := 5;
  x := x + 1;
  writeln(x);
end.`,
    purpose: 'an entire-variable denotes the declared variable itself, readable and writable',
    expectedOutput: '6\n',
  },

  {
    name: '6.5.3.1 array components are variables',
    code: `program p(output);
var a: array[1..3] of integer;
begin
  a[2] := 7;
  writeln(a[2]);
end.`,
    purpose: 'array components are variables, usable as assignment targets and read objects',
    expectedOutput: '7\n',
  },
  {
    name: '6.5.3.1 record fields are variables',
    code: `program p(output);
type r = record x: integer; end;
var v: r;
begin
  v.x := 9;
  writeln(v.x);
end.`,
    purpose: 'record fields are variables',
    expectedOutput: '9\n',
  },
  {
    name: '6.5.3.1 a component of a component is still a variable',
    code: `program p(output);
type r = record a: array[1..2] of integer; end;
var v: r;
begin
  v.a[1] := 3;
  v.a[2] := 4;
  writeln(v.a[1] + v.a[2]);
end.`,
    purpose:
      'referencing a component constitutes referencing that variable; components of components are likewise accessible',
    expectedOutput: '7\n',
  },

  // 6.5.3.2 Indexed-variables
  {
    name: '6.5.3.2 the index expression value must be assignment-compatible with the index-type',
    code: `program p(output);
var a: array[1..3] of integer;
    i: integer;
begin
  i := 2;
  a[i] := 8;
  writeln(a[i]);
end.`,
    purpose: 'integer and subrange 1..3 are assignment-compatible and may serve as index',
    expectedOutput: '8\n',
  },
  {
    name: '6.5.3.2 incompatible index expression type is illegal',
    code: `program p;
var a: array[1..3] of integer;
    c: char;
begin
  a[c] := 1;
end.`,
    purpose:
      'char and subrange 1..3 are incompatible; the index expression is illegal (ISO 5.1 e requires blocking execution)',
    expectedError: '',
  },
  {
    name: '6.5.3.2 abbreviated a[i,j] equals full a[i][j] (write abbreviated, read full)',
    code: `program p(output);
var m: array[1..2, 1..2] of integer;
begin
  m[1, 2] := 4;
  writeln(m[1][2]);
end.`,
    purpose:
      'ISO 6.5.3.2: the single comma in the abbreviated form replaces ][ in the full form; the two are equivalent',
    expectedOutput: '4\n',
  },
  {
    name: '6.5.3.2 abbreviated a[i,j] equals full a[i][j] (write full, read abbreviated)',
    code: `program p(output);
var m: array[1..2, 1..2] of integer;
begin
  m[2][1] := 5;
  writeln(m[2, 1]);
end.`,
    purpose: 'the full and abbreviated forms denote the same component',
    expectedOutput: '5\n',
  },

  // 6.5.3.3 Field-designators
  {
    name: '6.5.3.3 field designator denotes a record component',
    code: `program p(output);
type
  person = record
    age: integer;
    name: char;
  end;
var p1: person;
begin
  p1.age := 30;
  p1.name := 'A';
  writeln(p1.age, p1.name);
end.`,
    purpose: 'a field-designator denotes the component associated with the field-identifier',
    expectedOutput: '30A\n',
  },
  {
    name: '6.5.3.3 variant components are accessible when the variant is active',
    code: `program p(output);
type
  r = record
    case tag: integer of
      1: (i: integer);
      2: (c: char);
  end;
var v: r;
begin
  v.tag := 1;
  v.i := 42;
  writeln(v.i);
end.`,
    purpose: 'with a tag-field variant part, its components are accessible when the corresponding variant is active',
    expectedOutput: '42\n',
  },
  // 6.5.4 Identified-variables
  {
    name: '6.5.4 p^ denotes the variable pointed to by the pointer',
    code: `program p(output);
type ip = ^integer;
var q: ip;
begin
  new(q);
  q^ := 42;
  writeln(q^);
end.`,
    purpose: 'an identified-variable denotes the variable identified by the value of the pointer-variable',
    expectedOutput: '42\n',
  },
  {
    name: '6.5.4 dereferencing a nil pointer is an error',
    code: `program p(output);
type ip = ^integer;
var q: ip;
begin
  q := nil;
  writeln(q^);
end.`,
    purpose:
      'ISO 6.5.4: it is an error when the pointer-variable of an identified-variable denotes a nil-value (5.1 f allows the processor to document non-reporting)',
    expectedError: '',
  },
  {
    name: '6.5.4 dereferencing an undefined pointer variable is an error',
    code: `program p(output);
type ip = ^integer;
var q: ip;
begin
  writeln(q^);
end.`,
    purpose:
      'ISO 6.5.4: it is an error when the pointer-variable is undefined (ISO 6.2.3.5 specifies variables are totally-undefined at activation start)',
    expectedError: '',
  },

  // 6.5.5 Buffer-variables
  {
    name: '6.5.5 the buffer variable of a text file has char type',
    code: `program p(input, output, f);
var c: char; f: text;
begin
  reset(f);
  c := f^;
  writeln(c);
end.`,
    purpose:
      'ISO 6.5.5: the buffer-variable associated with a textfile has char type; the reset post-assertion in 6.6.5.2 guarantees f^ = f.R.first at this point (the original case reading output^ after write is a D.43 error due to the put post-assertion that f^ is totally-undefined; the expected value cannot be derived from ISO)',
    textFiles: new Map<string, Uint8Array>([['F', text('A')]]),
    programFileUrls: { f: 'F' },
    expectedOutput: 'A\n',
  },
  {
    name: '6.5.1 the identifier list of a variable declaration must not contain empty entries',
    code: 'program test; var a, : integer; begin end.',
    purpose:
      'ISO 6.5.1: variable-declaration = identifier-list : type-denoter; each entry in the identifier-list must be an identifier',
    expectedError: '',
  },
  {
    name: '6.5.1 variable declaration missing colon is an error',
    code: 'program test; var a integer; begin end.',
    purpose: 'ISO 6.5.1: the identifier list must be followed by a colon and a type-denoter',
    expectedError: '',
  },
  {
    name: '6.5.1 illegal type-denoter in variable declaration is an error',
    code: 'program test; var a: 5; begin end.',
    purpose: 'ISO 6.5.1/6.4.1: the type-denoter must be a type-identifier or a new-type',
    expectedError: '',
  },
  {
    name: '6.5.1 illegal entry in variable-declaration-part is an error',
    code: 'program test; var a: integer; b = 1; begin end.',
    purpose: 'ISO 6.5.1: every entry in the variable-declaration-part must be a variable-declaration',
    expectedError: '',
  },
  {
    name: '6.5.3.1 array components may be of enumerated type',
    code: `program test(output);
type color = (red, green, blue);
var a: array[1..3] of color;
begin
  a[1] := red;
  a[2] := green;
  a[3] := blue;
  writeln(ord(a[2]));
  if a[3] > a[1] then writeln('ordered');
end.`,
    purpose:
      'ISO 6.4.2.3/6.5.3.1: the component-type may be an enumerated type; its components participate in ord and relational operations by ordinal number',
    expectedOutput: '1\nordered\n',
  },
  {
    name: '6.5.3.1 subrange-type component values cover the entire closed interval',
    code: `program test(output);
var a: array[1..2] of 0..255;
begin
  a[1] := 200;
  a[2] := a[1] + 5;
  writeln(a[1]);
  writeln(a[2]);
end.`,
    purpose:
      'ISO 6.4.2.4: the value of a subrange-type variable can reach the upper bound side and is not interpreted as negative due to the sign bit',
    expectedOutput: '200\n205\n',
  },
  {
    name: '6.6.6.4 succ exceeding the subrange upper bound is an error',
    code: `program test;
type small = 1..5;
var s: small;
begin
  s := 5;
  s := succ(s);
end.`,
    purpose:
      'ISO 6.6.6.4/6.4.6 c: the result of succ must fall within the value range of the subrange type; otherwise it is an error',
    expectedError: '',
  },
]

runPascalTests('ISO 7185 6.5 - Declarations and denotations of variables', tests)
