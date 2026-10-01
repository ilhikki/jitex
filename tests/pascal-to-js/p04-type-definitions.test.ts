// ISO/IEC 7185:1990 - 6.4 Type-definitions
//
//
//   6.4.1 General
//   6.4.2 Simple-types
//     6.4.2.1 General
//     6.4.2.2 Required simple-types
//     6.4.2.3 Enumerated-types
//     6.4.2.4 Subrange-types
//   6.4.3 Structured-types
//     6.4.3.1 General
//     6.4.3.2 Array-types
//     6.4.3.3 Record-types
//     6.4.3.4 Set-types
//     6.4.3.5 File-types
//   6.4.4 Pointer-types
//   6.4.5 Compatible types
//   6.4.6 Assignment-compatibility
//   6.4.7 Example of a type-definition-part

import { type PascalTest, runPascalTests } from './harness.ts'

const tests: PascalTest[] = [
  {
    name: '6.4.1 type-definition introduces a type identifier (alias for integer)',
    code: 'program test(output); type T = integer; var a: T; begin a := 5; writeln(a); end.',
    purpose: '6.4.1: type-definition uses identifier T to denote integer; a has that type',
    expectedOutput: '5\n',
  },
  {
    name: '6.4.1 type-denoter may be an already-defined type identifier',
    code: 'program test(output); type A = 1..5; B = A; var v: B; begin v := 3; writeln(v); end.',
    purpose: '6.4.1: type-denoter = type-identifier; B and A denote the same type',
    expectedOutput: '3\n',
  },
  {
    name:
      '6.4.1 two occurrences of the same new-type denote distinct types, but subranges of the same host are compatible',
    code: 'program test(output); type T1 = 1..10; T2 = 1..10; var a: T1; b: T2; begin a := 4; b := a; writeln(b); end.',
    purpose:
      '6.4.1 each occurrence of new-type denotes a distinct type; 6.4.5 b both are subranges of integer hence compatible, assignment is legal',
    expectedOutput: '4\n',
  },
  {
    name: '6.4.1 two distinct record new-types are not assignable',
    code:
      'program test; type A = record x: integer end; B = record x: integer end; var a: A; b: B; begin a.x := 1; b := a; end.',
    purpose:
      '6.4.1 + 6.4.6 a: A and B are distinct new-types, neither the same type nor compatible; assignment is an error',
    expectedError: '',
  },
  {
    name: '6.4.1 type-denoter must not self-reference (array component is itself)',
    code: 'program test; type T = array[1..2] of T; var a: T; begin a[1] := 1; end.',
    purpose:
      '6.4.1: except for the domain-type of a new-pointer-type, a type-denoter must not contain an applied occurrence of its own identifier',
    expectedError: '',
  },
  {
    name: '6.4.1 the domain-type of a new-pointer-type may forward-reference (recursive record)',
    code: `program test(output);
type
  P = ^Node;
  Node = record value: integer; next: P end;
var
  q: P;
begin
  new(q);
  q^.value := 7;
  writeln(q^.value);
end.`,
    purpose:
      '6.4.1/6.2.2.9: the domain-type of a pointer-type may reference a not-yet-defined type, thus expressing recursive types',
    expectedOutput: '7\n',
  },
  {
    name: '6.4.1 non-pointer types must not forward-reference',
    code: 'program test; type A = array[1..2] of B; B = integer; var a: A; begin a[1] := 1; end.',
    purpose:
      '6.2.2.9 (as opposed to the pointer exception in 6.4.1): the definition of A references the not-yet-defined type B, which is an error',
    expectedError: '',
  },

  // 6.4.2.2 Required simple-types

  {
    name: '6.4.2.2 the four required simple-types may serve as type-denoter',
    code: `program test(output);
type
  I = integer; R = real; Bt = Boolean; C = char;
var
  iv: I; rv: R; bv: Bt; cv: C;
begin
  iv := 3;
  rv := iv;
  bv := true;
  cv := 'x';
  writeln(iv);
  writeln(trunc(rv));
  if bv then writeln('b-ok');
  writeln(cv);
end.`,
    purpose: '6.4.2.2: integer/real/Boolean/char all exist and may be used as type identifiers',
    expectedOutput: '3\n3\nb-ok\nx\n',
  },
  {
    name: '6.4.2.2 real is not an ordinal-type and cannot serve as a subrange bound',
    code: 'program test; type T = 1.0..2.0; var a: T; begin a := 1.5; end.',
    purpose:
      '6.4.2.4: the two constants of a subrange must belong to the same ordinal-type, and real is not an ordinal-type',
    expectedError: '',
  },
  {
    name: '6.4.2.2 real cannot serve as the index-type of an array',
    code: 'program test; var a: array[real] of integer; r: real; begin r := 1.0; a[r] := 1; end.',
    purpose: '6.4.3.2: index-type must be an ordinal-type; real does not satisfy this',
    expectedError: '',
  },
  {
    name: '6.4.2.2 in Boolean, false is the predecessor of true',
    code: "program test(output); begin if false < true then writeln('ok'); end.",
    purpose: '6.4.2.2 c: false is the predecessor of true; their ordinals are 0 and 1',
    expectedOutput: 'ok\n',
  },
  {
    name: '6.4.2.2 digits and upper/lowercase letters of char are each ordered',
    code: "program test(output); begin if ('0' < '9') and ('A' < 'Z') and ('a' < 'z') then writeln('ok'); end.",
    purpose: '6.4.2.2 d: digits 0..9 are numerically ordered; A..Z and a..z are lexicographically ordered',
    expectedOutput: 'ok\n',
  },

  // 6.4.2.3 Enumerated-types

  {
    name: '6.4.2.3 enumeration constants have consecutive ordinals starting from 0',
    code: 'program test(output); type Color = (red, green, blue); begin writeln(ord(red), ord(green), ord(blue)); end.',
    purpose: '6.4.2.3 NOTE: enumeration constants receive consecutive ordinals starting from 0 in declaration order',
    expectedOutput: '012\n',
  },
  {
    name: '6.4.2.3 enumeration constants are ordered by declaration order',
    code:
      "program test(output); type Color = (red, green, blue); begin if (red < green) and (green < blue) then writeln('ok'); end.",
    purpose: '6.4.2.1: the ordering relation of an ordinal-type matches its ordinals (6.4.2.3 increasing in order)',
    expectedOutput: 'ok\n',
  },
  {
    name: '6.4.2.3 succ/pred applied to enumeration values',
    code:
      'program test(output); type Color = (red, green, blue); begin writeln(ord(succ(red))); writeln(ord(pred(blue))); end.',
    purpose:
      '6.4.2.3+6.7.2.2: successor and predecessor of an enumerated type move along increasing/decreasing ordinals',
    expectedOutput: '1\n1\n',
  },
  {
    name: '6.4.2.3 enumerated type may serve as array index-type',
    code:
      'program test(output); type Color = (red, green, blue); var a: array[Color] of integer; begin a[red] := 1; a[blue] := 3; writeln(a[red], a[blue]); end.',
    purpose: '6.4.3.2: index-type is an ordinal-type; enumerated types satisfy this',
    expectedOutput: '13\n',
  },
  {
    name: '6.4.2.3 enumeration constants may serve as case-constants',
    code: `program test(output);
type Color = (red, green, blue);
var c: Color; n: integer;
begin
  c := green;
  case c of
    red: n := 1;
    green: n := 2;
    blue: n := 3
  end;
  writeln(n);
end.`,
    purpose:
      '6.4.2.3: enumeration constants are constant-identifiers, usable as case-constants and type-compatible with the tag expression',
    expectedOutput: '2\n',
  },
  {
    name: '6.4.2.3 assignment and comparison of enumerated type variables',
    code: `program test(output);
type Color = (red, green, blue);
var a, b: Color;
begin
  a := red;
  b := blue;
  if a <> b then writeln('different');
  if a = red then writeln('red');
end.`,
    purpose: '6.4.2.3: enumeration constants may be assigned to same-type variables; same-type values may be compared',
    expectedOutput: 'different\nred\n',
  },
  {
    name: '6.4.2.3 integer literals cannot be assigned to enumerated type variables',
    code: `program test;
type Color = (red, green, blue);
var c: Color;
begin
  c := 5;
end.`,
    purpose:
      '6.4.2.3 + 6.4.6: an enumerated type can only take values of that enumerated type; integer is not assignment-compatible with it',
    expectedError: '',
  },
  {
    name: '6.4.2.3 assignment between different enumerated types is not allowed',
    code: `program test;
type Color = (red, green, blue);
     Light = (on, off);
var c: Color;
    l: Light;
begin
  c := l;
end.`,
    purpose: '6.4.1 + 6.4.6: two enumerated types are distinct and not assignment-compatible with each other',
    expectedError: '',
  },

  // 6.4.2.4 Subrange-types

  {
    name: '6.4.2.4 assignment of integer subrange type',
    code: 'program test(output); type T = 1..10; var a: T; begin a := 5; writeln(a); end.',
    purpose: '6.4.2.4: the host-type of subrange 1..10 is integer; in-range values may be assigned',
    expectedOutput: '5\n',
  },
  {
    name: '6.4.2.4 subrange with negative bounds',
    code: 'program test(output); type T = -10..10; var a: T; begin a := -10; writeln(a); a := 10; writeln(a); end.',
    purpose: '6.4.2.4: subrange bound constants may carry signs (-10..10)',
    expectedOutput: '-10\n10\n',
  },
  {
    name: '6.4.2.4 character subrange',
    code: "program test(output); type T = 'A'..'Z'; var c: T; begin c := 'M'; writeln(c); end.",
    purpose: '6.4.2.4: char is an ordinal-type; character subranges use character constants as bounds',
    expectedOutput: 'M\n',
  },
  {
    name: '6.4.2.4 enumerated subrange (host-type is enumerated type)',
    code: `program test(output);
type Color = (red, green, blue); Sunny = red..blue;
var c: Sunny;
begin
  c := blue;
  writeln(ord(c));
end.`,
    purpose: '6.4.2.4: the host-type of a subrange may be an enumerated type; values are limited to between the bounds',
    expectedOutput: '2\n',
  },
  {
    name: '6.4.2.4 single-value subrange',
    code: 'program test(output); type T = 5..5; var a: T; begin a := 5; writeln(a); end.',
    purpose: '6.4.2.4: the first constant must be less than or equal to the second; 5..5 is legal',
    expectedOutput: '5\n',
  },
  {
    name: '6.4.2.4 a subrange with lower bound greater than upper bound is an error',
    code: 'program test; type T = 10..1; var a: T; begin a := 1; end.',
    purpose: '6.4.2.4: the first constant (minimum) must be less than or equal to the second constant',
    expectedError: '',
  },
  {
    name: '6.4.2.4 the two bound constants of a subrange must belong to the same ordinal-type',
    code: "program test; type T = 'a'..5; var a: T; begin a := 'a'; end.",
    purpose: '6.4.2.4: the two constants must be of the same ordinal-type; mixing char and integer is an error',
    expectedError: '',
  },

  {
    name: '6.4.3.1 the values and access of a packed array are unaffected by packed',
    code: 'program test(output); var a: packed array[1..3] of integer; begin a[1] := 5; writeln(a[1]); end.',
    purpose:
      '6.4.3.1: packed only affects the data-storage representation; it does not change the values of the type or the component correspondence',
    expectedOutput: '5\n',
  },

  // 6.4.3.2 Array-types

  {
    name: '6.4.3.2 Boolean as index-type',
    code:
      'program test(output); var a: array[boolean] of integer; begin a[false] := 0; a[true] := 1; writeln(a[false], a[true]); end.',
    purpose: '6.4.3.2: index-type is an ordinal-type; the two values of Boolean each correspond to one component',
    expectedOutput: '01\n',
  },
  {
    name: '6.4.3.2 char as index-type (index by specific character, no charset range assumption)',
    code:
      "program test(output); var a: array[char] of integer; begin a['A'] := 1; a['B'] := 2; writeln(a['A'], a['B']); end.",
    purpose: '6.4.3.2: index-type is char; each component is mapped one-to-one by the values of the index-type',
    expectedOutput: '12\n',
  },
  {
    name: '6.4.3.2 abbreviated form of multi-dimensional index-type',
    code:
      'program test(output); var a: array[1..2, 1..2] of integer; begin a[1,1] := 1; a[1,2] := 2; a[2,1] := 3; a[2,2] := 4; writeln(a[1,1], a[1,2]); writeln(a[2,1], a[2,2]); end.',
    purpose:
      '6.4.3.2: array[1..2, 1..2] is an abbreviation of array[1..2] of array[1..2]; the full and abbreviated forms are equivalent',
    expectedOutput: '12\n34\n',
  },
  {
    name: '6.4.3.2 abbreviated a[i,j] and full a[i][j] denote the same component',
    code: `program test(output);
var a: array[1..2, 1..2] of integer;
begin
  a[1][2] := 7;
  writeln(a[1,2] + a[1][2]);
end.`,
    purpose: '6.4.3.2: both notations denote the same component; the sum should be 7+7',
    expectedOutput: '14\n',
  },
  {
    name: '6.4.3.2 component-type may be record',
    code: `program test(output);
type Point = record x, y: integer end;
var a: array[1..2] of Point;
begin
  a[1].x := 1;
  a[2].y := 4;
  writeln(a[1].x, a[2].y);
end.`,
    purpose: '6.4.3.2: component-type is any type-denoter and may be a record-type',
    expectedOutput: '14\n',
  },
  {
    name: '6.4.3.2 array index outside index-type is an error',
    code: 'program test; var a: array[1..3] of integer; begin a[5] := 10; end.',
    purpose:
      '6.4.3.2+6.4.6 c: 5 is compatible with index-type 1..3 but not within its closed interval, which is an error',
    expectedError: '',
  },

  {
    name: '6.4.3.2 character-by-character access of string-type',
    code: "program test(output); var s: packed array[1..5] of char; begin s := 'hello'; write(s[1]); write(s[5]); end.",
    purpose: '6.4.3.2: the components of a string-type correspond one-to-one with string elements by increasing index',
    expectedOutput: 'ho',
  },
  {
    name: '6.4.3.2 writing string-type as a whole',
    code: "program test(output); var s: packed array[1..5] of char; begin s := 'hello'; writeln(s); end.",
    purpose:
      '6.9.3.6+6.4.3.2: the value of a string-type may be written as a whole; the default width is the number of components',
    expectedOutput: 'hello\n',
  },
  {
    name: '6.4.5 d assignment between two string-types with the same number of components is allowed',
    code: `program test(output);
type A3 = packed array[1..3] of char; B3 = packed array[1..3] of char;
var a: A3; b: B3;
begin
  a := 'abc';
  b := a;
  writeln(b);
end.`,
    purpose:
      '6.4.5 d+6.4.6 e: A3 and B3 are distinct new-types, but both are 3-component string-types hence compatible',
    expectedOutput: 'abc\n',
  },
  {
    name: '6.4.3.2 assignment between string-types with different numbers of components is not allowed',
    code: "program test(output); var s: packed array[1..10] of char; begin s := 'hello'; writeln(s); end.",
    purpose:
      "6.1.7: 'hello' is a 5-component string-type; 6.4.5 d only makes string-types with the same number of components compatible, so the assignment is an error",
    expectedError: '',
  },

  // 6.4.3.3 Record-types

  {
    name: '6.4.3.3 reading and writing fields of the fixed part',
    code:
      'program test(output); type Point = record x, y: integer end; var p: Point; begin p.x := 10; p.y := 20; writeln(p.x, p.y); end.',
    purpose: '6.4.3.3: each field-identifier in a record-section is associated with a distinct component',
    expectedOutput: '1020\n',
  },
  {
    name: '6.4.3.3 a record with an empty field-list has only a single null value',
    code: "program test(output); type Empty = record end; var e: Empty; begin writeln('ok'); end.",
    purpose: '6.4.3.3: a field-list with neither a fixed-part nor a variant-part is empty, which is a legal type',
    expectedOutput: 'ok\n',
  },
  {
    name: '6.4.3.3 nested record',
    code:
      'program test(output); type Point = record x, y: integer end; Circle = record center: Point; radius: integer end; var c: Circle; begin c.center.x := 10; c.center.y := 20; c.radius := 5; writeln(c.center.x, c.center.y); end.',
    purpose: '6.4.3.3: the type-denoter of a record-section may be another record-type',
    expectedOutput: '1020\n',
  },
  {
    name: '6.4.3.3 whole-record assignment of the same record type',
    code: `program test(output);
type Point = record x, y: integer end;
var p, q: Point;
begin
  p.x := 3;
  p.y := 4;
  q := p;
  writeln(q.x, q.y);
end.`,
    purpose:
      '6.4.6 a: T1 and T2 are the same record type and may serve as file component types; whole assignment is legal',
    expectedOutput: '34\n',
  },
  {
    name: '6.4.3.3 variant-part with tag-field: setting the tag activates the variant and its fields become accessible',
    code: `program test(output);
type
  shape = (circle, square);
  figure = record
    case s: shape of
      circle: (radius: integer);
      square: (side: integer)
  end;
var f: figure;
begin
  f.s := circle;
  f.radius := 5;
  writeln(f.radius);
end.`,
    purpose:
      '6.4.3.3: the selector is a field; its value activates the corresponding variant, and the components of that variant may be read and written',
    expectedOutput: '5\n',
  },
  {
    name: '6.4.3.3 variant-part without tag-field: accessing a component makes the selector take the associated value',
    code: `program test(output);
type
  four_choices = 1..4;
  memory_word = record
    case four_choices of
      1: (int_field: integer);
      2: (gr: real);
      3: (mark: integer);
      4: (tag: integer)
  end;
var m: memory_word;
begin
  m.int_field := 42;
  writeln(m.int_field);
end.`,
    purpose:
      '6.5.3.3: when the selector is not a field, accessing a variant component assigns the associated value to the selector to activate it',
    expectedOutput: '42\n',
  },

  // 6.4.3.4 Set-types

  {
    name: '6.4.3.4 constructing a set of subrange and the in operation',
    code: `program test(output);
type S = set of 1..10;
var a: S;
begin
  a := [2, 4, 6];
  if 4 in a then writeln('4');
  if 5 in a then writeln('5') else writeln('no-5');
end.`,
    purpose: '6.4.3.4: the value of a set-type is the power set of base-type values; in tests membership',
    expectedOutput: '4\nno-5\n',
  },
  {
    name: '6.4.3.4 set of enumerated type',
    code: `program test(output);
type Color = (red, green, blue);
var s: set of Color;
begin
  s := [red, blue];
  if red in s then writeln('red');
  if green in s then writeln('green') else writeln('no-green');
end.`,
    purpose: '6.4.3.4: base-type is an ordinal-type; enumerated types satisfy this',
    expectedOutput: 'red\nno-green\n',
  },
  {
    name: '6.4.3.4 base-type must be an ordinal-type; set of real is an error',
    code: 'program test; type S = set of real; var a: S; begin a := []; end.',
    purpose: '6.4.3.4: base-type = ordinal-type; real is not an ordinal-type',
    expectedError: '',
  },
  {
    name: '6.4.3.4 assignment between sets with compatible base-type is allowed (members within target range)',
    code: `program test(output);
type S1 = set of 1..10; S2 = set of 1..5;
var a: S1; b: S2;
begin
  a := [3];
  b := a;
  if 3 in b then writeln('ok');
end.`,
    purpose:
      '6.4.5 c+6.4.6 d: 1..5 and 1..10 are both integer subranges hence compatible, and member 3 is within the target base-type range',
    expectedOutput: 'ok\n',
  },
  {
    name: '6.4.3.4 constructing a packed set and the in operation',
    code: `program test(output);
type S = packed set of 1..5;
var a: S;
begin
  a := [1, 5];
  if 5 in a then writeln('ok');
end.`,
    purpose: '6.4.3.1+6.4.3.4: the values and set operations of a packed set-type are unaffected by packed',
    expectedOutput: 'ok\n',
  },

  // 6.4.3.5 File-types

  {
    name: '6.4.3.5 record-type may serve as the component type of a file',
    code: `program test(f);
type
  Point = record x, y: integer end;
var
  f: file of Point; p: Point;
begin
  rewrite(f);
  p.x := 4;
  p.y := 2;
  f^ := p;
  put(f);
  reset(f);
  p := f^;
  writeln(p.x, p.y);
end.`,
    purpose: '6.4.3.5: component-type may be any permissible type-denoter; record-type satisfies this',
    expectedOutput: '42\n',
  },
  {
    name: '6.4.3.5 the component type of a file-type must not be a file-type',
    code: 'program test; type F = file of integer; G = file of F; var g: G; begin rewrite(g); end.',
    purpose: '6.4.3.5: a type-denoter denoting a file-type must not serve as a component type',
    expectedError: '',
  },

  // 6.4.4 Pointer-types

  {
    name: '6.4.4 nil value assignment and comparison',
    code: "program test(output); type TP = ^integer; var p: TP; begin p := nil; if p = nil then writeln('nil'); end.",
    purpose: '6.4.4: the value set of a pointer-type contains the unique nil-value; the token nil denotes it',
    expectedOutput: 'nil\n',
  },
  {
    name: '6.4.4 new creates a variable and dereferencing',
    code: 'program test(output); type TP = ^integer; var p: TP; begin new(p); p^ := 7; writeln(p^); end.',
    purpose: '6.4.4: the identifying-value and the identified variable are created only by new; accessible via p^',
    expectedOutput: '7\n',
  },
  {
    name: '6.4.4 assignment between variables of the same pointer-type',
    code: 'program test(output); type TP = ^integer; var p, q: TP; begin new(p); p^ := 3; q := p; writeln(q^); end.',
    purpose:
      '6.4.6 a+6.4.4: p and q belong to the same pointer-type TP; after assignment both identify the same variable',
    expectedOutput: '3\n',
  },
  {
    name: '6.4.4 nil may be assigned to a pointer component of a record',
    code: `program test(output);
type
  Node = record value: integer; next: ^Node end;
var
  p: ^Node;
begin
  new(p);
  p^.value := 1;
  p^.next := nil;
  writeln(p^.value);
end.`,
    purpose:
      '6.4.4 NOTE 2+6.4.6: nil is compatible with any pointer-type, so it may be assigned to a record field of pointer type',
    expectedOutput: '1\n',
  },
  {
    name: '6.4.4 nil is compatible with any pointer-type',
    code: `program test(output);
type PI = ^integer; PR = ^real;
var a: PI; b: PR;
begin
  a := nil;
  b := nil;
  if (a = nil) and (b = nil) then writeln('ok');
end.`,
    purpose:
      '6.4.4 NOTE 2: nil has no single type and may be compatible with any pointer-type per assignment-compatibility rules',
    expectedOutput: 'ok\n',
  },
  {
    name: '6.4.4 assignment between two distinct pointer-types is not allowed',
    code: 'program test; type P = ^integer; Q = ^integer; var p: P; q: Q; begin new(p); q := p; end.',
    purpose: '6.4.1+6.4.6 a: the two occurrences of ^integer are distinct new-pointer-types; assignment is an error',
    expectedError: '',
  },

  // 6.4.6 Assignment-compatibility

  {
    name: '6.4.6 b implicit conversion from integer to real',
    code: 'program test(output); var i: integer; r: real; begin i := 5; r := i; writeln(trunc(r)); end.',
    purpose:
      '6.4.6 b: when T1 is real and T2 is integer they are assignment-compatible, and an integer->real implicit conversion is performed',
    expectedOutput: '5\n',
  },
  {
    name: '6.4.6 assignment from real to integer is not compatible',
    code: 'program test; var i: integer; r: real; begin r := 1.5; i := r; end.',
    purpose:
      '6.4.6: real is not an ordinal-type and does not satisfy a/b/d/e, so real->integer is not assignment-compatible',
    expectedError: '',
  },
  {
    name: '6.4.6 c assigning a subrange value to its host-type (integer)',
    code: 'program test(output); type T = 1..10; var a: T; i: integer; begin a := 5; i := a; writeln(i); end.',
    purpose:
      '6.4.5 b+6.4.6 c: T is a subrange of integer; the two are compatible and the value is within the integer range',
    expectedOutput: '5\n',
  },
  {
    name: '6.4.6 c compatible ordinal-type and value within target range',
    code: 'program test(output); type T = 1..10; var a: T; i: integer; begin i := 5; a := i; writeln(a); end.',
    purpose: '6.4.6 c: integer and subrange T are compatible; value 5 is within the closed interval 1..10 of T',
    expectedOutput: '5\n',
  },
  {
    name: '6.4.6 c compatible ordinal-type but value outside target range is an error',
    code: 'program test; type T = 1..10; var a: T; i: integer; begin i := 100; a := i; end.',
    purpose: '6.4.6 error rule a: T1 and T2 are compatible ordinal-types but value 100 is not within 1..10',
    expectedError: '',
  },
  {
    name: '6.4.6 c integer constant exceeding subrange upper bound is an error',
    code: 'program test; type T = 1..10; var a: T; begin a := 11; end.',
    purpose: '6.4.6 c: constant 11 is compatible with T but not within 1..10, which is an error',
    expectedError: '',
  },
  {
    name: '6.4.6 c arithmetic result exceeding subrange upper bound is an error',
    code: 'program test; type T = 1..10; var a: T; begin a := 8; a := a + 5; end.',
    purpose:
      '6.7.2.1+6.4.6 c: the subrange factor participates in the operation as host-type integer yielding 13, which is not within 1..10',
    expectedError: '',
  },
  {
    name: '6.4.6 c assignment between compatible subranges with value within target range',
    code: 'program test(output); type T1 = 1..10; T2 = 1..5; var a: T1; b: T2; begin a := 3; b := a; writeln(b); end.',
    purpose: '6.4.5 b+6.4.6 c: T1 and T2 are both subranges of integer hence compatible; value 3 is within 1..5',
    expectedOutput: '3\n',
  },
  {
    name: '6.4.6 c assignment between compatible subranges but value outside target range is an error',
    code: 'program test; type T1 = 1..10; T2 = 1..5; var a: T1; b: T2; begin a := 8; b := a; end.',
    purpose: '6.4.6 error rule a: value 8 is not within the target subrange 1..5',
    expectedError: '',
  },
  {
    name: '6.4.6 c character subrange assignment exceeding upper bound is an error',
    code: "program test; type T = 'A'..'C'; var c: T; begin c := 'Z'; end.",
    purpose: "6.4.2.2 d 2)+6.4.6 c: A..Z is lexicographically ordered; 'Z' is not within 'A'..'C'",
    expectedError: '',
  },
  {
    name: '6.4.3.1 packed may prefix a record type',
    code: `program test(output);
type r = packed record x: integer; y: char end;
var v: r;
begin
  v.x := 3;
  v.y := 'A';
  writeln(v.x, v.y);
end.`,
    purpose:
      'ISO 6.4.3.1: packed may prefix the four structured types array/record/file/set; fields of a packed record are still accessible',
    expectedOutput: '3A\n',
  },
  {
    name: '6.4.3.1 packed must not prefix a non-structured type',
    code: 'program test; type t = packed integer; begin end.',
    purpose: 'ISO 6.4.3.1: packed may only prefix array, record, file, and set types',
    expectedError: '',
  },
  {
    name: '6.4.3.2 array missing the index-type list is an error',
    code: 'program test; type t = array of integer; begin end.',
    purpose: 'ISO 6.4.3.2: array-type must provide an index-type list enclosed in brackets',
    expectedError: '',
  },
  {
    name: '6.4.3.2 array missing of is an error',
    code: 'program test; type t = array[1..3] integer; begin end.',
    purpose: 'ISO 6.4.3.2: the index-type list must be followed by of and a component-type',
    expectedError: '',
  },
  {
    name: '6.4.3.2 array missing the right bracket is an error',
    code: 'program test; type t = array[1..3 of integer; begin end.',
    purpose: 'ISO 6.4.3.2: the index-type list must end with a right bracket',
    expectedError: '',
  },
  {
    name: '6.4.3.2 illegal component-type of array is an error',
    code: 'program test; type t = array[1..3] of 5; begin end.',
    purpose: 'ISO 6.4.3.2: of must be followed by a legal type-denoter',
    expectedError: '',
  },
  {
    name: '6.4.3.3 record missing end is an error',
    code: 'program test; type t = record x: integer; begin end.',
    purpose: 'ISO 6.4.3.3: record-type ends with end',
    expectedError: '',
  },
  {
    name: '6.4.3.3 record field missing type is an error',
    code: 'program test; type t = record x; end; begin end.',
    purpose: 'ISO 6.4.3.3: field-declaration is identifier-list : type-denoter',
    expectedError: '',
  },
  {
    name: '6.4.3.3 the field-list of a variant branch may contain multiple fields',
    code: `program test(output);
type r = record
  case tag: integer of
    1: (a: integer; b: char);
    2: (c: real);
end;
var v: r;
begin
  v.tag := 1;
  v.a := 5;
  v.b := 'X';
  writeln(v.a, v.b);
end.`,
    purpose:
      'ISO 6.4.3.3: a variant branch is ( field-list ), which may contain multiple fields separated by semicolons',
    expectedOutput: '5X\n',
  },
  {
    name: '6.4.3.3 variant case-constant missing colon is an error',
    code: 'program test; type r = record case tag: integer of 1 (a: integer) end; begin end.',
    purpose: 'ISO 6.4.3.3: variant = case-constant-list : ( field-list )',
    expectedError: '',
  },
  {
    name: '6.4.3.3 variant field-list missing left parenthesis is an error',
    code: 'program test; type r = record case tag: integer of 1: a: integer end; begin end.',
    purpose: 'ISO 6.4.3.3: the colon of the case-constant-list must be followed by a left parenthesis',
    expectedError: '',
  },
  {
    name: '6.4.2.3 the enumeration value list must be an identifier-list',
    code: 'program test; type t = (1, 2); begin end.',
    purpose: 'ISO 6.4.2.3: the value list of an enumeration-type consists of identifiers',
    expectedError: '',
  },
  {
    name: '6.4.2.3 enumeration value list missing right parenthesis is an error',
    code: 'program test; type t = (a, b; begin end.',
    purpose: 'ISO 6.4.2.3: enumeration-type = ( identifier-list )',
    expectedError: '',
  },
  {
    name: '6.4.4 pointer type missing domain-type is an error',
    code: 'program test; type t = ^; begin end.',
    purpose: 'ISO 6.4.4: pointer-type = ^ domain-type',
    expectedError: '',
  },
  {
    name: '6.4.3.5 file of missing component type is an error',
    code: 'program test; type t = file of ; begin end.',
    purpose: 'ISO 6.4.3.5: file-type must have a component-type after of',
    expectedError: '',
  },
  {
    name: '6.4.3.4 set type missing of is an error',
    code: 'program test; type t = set 1..3; begin end.',
    purpose: 'ISO 6.4.3.4: set-type = set of base-type',
    expectedError: '',
  },
  {
    name: '6.4.1 type-denoter must not be an isolated constant',
    code: 'program test; type t = 5; begin end.',
    purpose:
      'ISO 6.4.1: type-denoter is a type-identifier or a new-type; an isolated constant does not constitute any new-type',
    expectedError: '',
  },
  {
    name: '6.4.2.4 subrange type missing right bound is an error',
    code: 'program test; type t = 1..; begin end.',
    purpose: 'ISO 6.4.2.4: subrange-type = constant .. constant',
    expectedError: '',
  },
  {
    name: '6.4.2.4 Boolean is an ordinal-type and may serve as the base-type of a subrange',
    code: `program test(output);
type t = false..true;
var b: t;
begin
  b := true;
  if b = true then writeln('T') else writeln('F');
end.`,
    purpose:
      'ISO 6.4.2.2 d/6.4.2.4: Boolean is an ordinal type; its values may serve as both bounds of a subrange, and that subrange is compatible with its host type Boolean',
    expectedOutput: 'T\n',
  },
  {
    name: '6.4.3.2 index-type may be an already-defined subrange type identifier',
    code: `program test(output);
type idx = 1..3;
     t = array[idx] of integer;
var a: t;
begin
  a[2] := 7;
  writeln(a[2]);
end.`,
    purpose:
      'ISO 6.4.3.2/6.4.1: index-type is an ordinal-type and may be written as a previously-defined subrange type identifier',
    expectedOutput: '7\n',
  },
  {
    name: '6.4.3.2 assignment between string-types with different numbers of components is not allowed',
    code: `program test;
var a: array[1..2, 1..2] of char;
begin
  a := 'ab';
end.`,
    purpose:
      'ISO 6.4.3.2/6.4.6 e: a string-type is a one-dimensional packed char array with n components; a 2D char array is not a string-type and has a different number of components',
    expectedError: '',
  },
  {
    name: '6.4.1 type definition missing equals sign is an error',
    code: 'program test; type t integer; begin end.',
    purpose: 'ISO 6.4.1: type-definition = identifier = type-denoter',
    expectedError: '',
  },
  {
    name: '6.2.2.9 non-type identifiers must not be used as type names',
    code: `program test;
var v: integer;
type t = v;
begin end.`,
    purpose:
      'ISO 6.2.2.9/6.4.1: an identifier in a type-denoter must have a type definition point; a variable identifier is not a type',
    expectedError: '',
  },
  {
    name: '6.4.1 illegal token at type-denoter is an error',
    code: 'program test; type t = [1; begin end.',
    purpose: 'ISO 6.4.1: type-denoter must be a type-identifier or a legal new-type',
    expectedError: '',
  },
  {
    name: '6.4.3.2 empty index-type list of array is an error',
    code: 'program test; type t = array[;] of integer; begin end.',
    purpose: 'ISO 6.4.3.2: each entry in the index-type list must be a legal ordinal-type',
    expectedError: '',
  },
  {
    name: '6.4.3.4 illegal base-type of set is an error',
    code: 'program test; type t = set of ; begin end.',
    purpose: 'ISO 6.4.3.4: of must be followed by a legal ordinal-type',
    expectedError: '',
  },
  {
    name: '6.4.3.3 illegal tag-type of variant-part is an error',
    code: 'program test; type r = record case tag: ; of 1: (a: integer) end; begin end.',
    purpose: 'ISO 6.4.3.3: variant-part = case [ tag-field : ] tag-type of variant {; variant}',
    expectedError: '',
  },
  {
    name: '6.4.3.3 variant-part missing of is an error',
    code: 'program test; type r = record case tag: integer 1: (a: integer) end; begin end.',
    purpose: 'ISO 6.4.3.3: tag-type must be followed by of',
    expectedError: '',
  },
  {
    name: '6.4.3.3 illegal case-constant-list of variant is an error',
    code: 'program test; type r = record case tag: integer of : (a: integer) end; begin end.',
    purpose: 'ISO 6.4.3.3: variant = case-constant-list : ( field-list )',
    expectedError: '',
  },
  {
    name: '6.4.3.3 illegal field declaration in variant field-list is an error',
    code: 'program test; type r = record case tag: integer of 1: (5) end; begin end.',
    purpose: 'ISO 6.4.3.3: each entry in the field-list must be a legal field-declaration',
    expectedError: '',
  },
  {
    name: '6.4.3.3 variant field-list missing right parenthesis is an error',
    code: 'program test; type r = record case tag: integer of 1: (a: integer end; begin end.',
    purpose: 'ISO 6.4.3.3: the field-list ends with a right parenthesis',
    expectedError: '',
  },
  {
    name: '6.4.3.3 extra semicolons between variants are accepted (implementation leniency)',
    code: `program test(output);
type r = record
  case tag: integer of
    1: (a: integer);;
    2: (b: integer)
end;
var v: r;
begin
  v.tag := 2;
  v.b := 4;
  writeln(v.b);
end.`,
    purpose:
      'ISO 6.4.3.3 variants are separated by a single semicolon; consecutive semicolons are treated as an empty variant; this implementation simply skips them (extension)',
    expectedOutput: '4\n',
  },
  {
    name: '6.4.3.3 a variant-part may be nested within a variant field-list (implementation form terminated by end)',
    code: `program test(output);
type r = record
  case tag: integer of
    1: (a: integer;
        case inner: integer of
          1: (p: char);
          2: (q: char)
        end)
end;
var v: r;
begin
  v.tag := 1;
  v.inner := 1;
  v.p := 'Z';
  writeln(v.p);
end.`,
    purpose:
      'ISO 6.4.3.3 allows a variant-part to be nested inside a field-list (here the nested part is terminated by an inner end per implementation requirement)',
    expectedOutput: 'Z\n',
  },
  {
    name: '6.4.3.2 index-type may be the simple type integer',
    code: `program test;
type t = array[integer] of char;
begin end.`,
    purpose: 'ISO 6.4.3.2: index-type is an ordinal-type; the predefined type integer itself may serve as index-type',
    expectedOutput: '',
  },
  {
    name: '6.4.3.5 file-type may omit the component type',
    code: `program test;
type t = file;
begin end.`,
    purpose: 'ISO 6.4.3.5: file-type = file [ of component-type ]; when of is omitted the component type is undefined',
    expectedOutput: '',
  },
]

runPascalTests('ISO 7185 6.4 - Type-definitions', tests)
