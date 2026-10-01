// ISO/IEC 7185:1990 - 6.3 Constant-definitions
//
//

import { type PascalTest, runPascalTests } from './harness.ts'

const tests: PascalTest[] = [
  {
    name: '6.3 integer constant',
    code: `program p(output);
const N = 42;
begin
  writeln(N);
end.`,
    purpose: 'constant as unsigned-number denotes an integer value',
    expectedOutput: '42\n',
  },
  {
    name: '6.3 signed integer constant',
    code: `program p(output);
const N = -5;
begin
  writeln(N);
end.`,
    purpose: 'constant may be a signed signed-integer',
    expectedOutput: '-5\n',
  },
  {
    name: '6.3 real constant',
    code: `program p(output);
const R = 2.5;
begin
  writeln(round(R * 2));
end.`,
    purpose:
      'constant as unsigned-real denotes a real value (real output format is implementation-defined, so compare as integer)',
    expectedOutput: '5\n',
  },
  {
    name: '6.3 character constant',
    code: `program p(output);
const C = 'A';
begin
  writeln(C);
end.`,
    purpose: 'constant as a single-element character-string denotes a char value',
    expectedOutput: 'A\n',
  },
  {
    name: '6.3 multi-element character constant',
    code: `program p(output);
const S = 'abc';
begin
  writeln(S);
end.`,
    purpose: 'constant as a multi-element character-string denotes a string value, usable as a write argument',
    expectedOutput: 'abc\n',
  },
  {
    name: '6.3 constant referencing an already-defined constant',
    code: `program p(output);
const A = 10;
      B = A;
begin
  writeln(B);
end.`,
    purpose: 'constant may be a constant-identifier, denoting the same value it denotes',
    expectedOutput: '10\n',
  },

  {
    name: '6.3 constant used as upper bound of array index type',
    code: `program p(output);
const N = 5;
type T = array[1..N] of integer;
var a: T;
begin
  a[N] := 9;
  writeln(a[5]);
end.`,
    purpose: 'constant-identifier may serve as the subrange bound of an index-type',
    expectedOutput: '9\n',
  },
  {
    name: '6.3 constant used as a case label',
    code: `program p(output);
const A = 1;
var x: integer;
begin
  x := 1;
  case x of
    A: writeln('one');
  end;
end.`,
    purpose: 'case-constant may be a constant-identifier',
    expectedOutput: 'one\n',
  },

  {
    name: '6.3 constant must not be an expression',
    code: `program p(output);
const N = 1 + 2;
begin
  writeln(N);
end.`,
    purpose:
      'ISO 6.3: constant may only be a signed number, constant-identifier, or character-string, not an expression',
    expectedError: '',
  },
  {
    name: '6.3 constant must not reference itself',
    code: `program p(output);
const A = A;
begin
  writeln(A);
end.`,
    purpose: 'ISO 6.3: constant must not contain an applied occurrence of the identifier itself',
    expectedError: '',
  },
  {
    name: '6.3 signed constant must denote integer or real',
    code: `program p(output);
const C = 'a';
      D = -C;
begin
  writeln(D);
end.`,
    purpose:
      'ISO 6.3: if constant contains a sign, the constant-identifier must already be defined to denote an integer or real value',
    expectedError: '',
  },
  {
    name: '6.3 constant definition missing equals sign is an error',
    code: `program p(output);
const N 1;
begin
  writeln(N);
end.`,
    purpose: 'ISO 6.3: constant-definition = identifier = constant',
    expectedError: '',
  },
  {
    name: '6.3 constant definition missing constant after equals sign is an error',
    code: `program p(output);
const N = ;
begin
  writeln(N);
end.`,
    purpose: 'ISO 6.3: the right side of the equals sign must be a constant',
    expectedError: '',
  },
  {
    name: '6.3 illegal entry in constant-definition-part is an error',
    code: `program p(output);
const N = 1; = 2;
begin
  writeln(N);
end.`,
    purpose: 'ISO 6.3: every entry in the constant-definition-part must start with an identifier',
    expectedError: '',
  },
  {
    name: '6.3 boolean literals may be constant values',
    code: `program p(output);
const F = true;
begin
  if F then writeln('T');
end.`,
    purpose: 'ISO 6.3/6.4.2.2: true and false are required constant-identifiers and may serve as constants',
    expectedOutput: 'T\n',
  },
  {
    name: '6.3 constant-identifier may be prefixed with an explicit sign',
    code: `program p(output);
const A = 5;
      B = +A;
begin
  writeln(B);
end.`,
    purpose: 'ISO 6.3: constants may carry a sign; the operand is a constant-identifier denoting integer/real',
    expectedOutput: '5\n',
  },
]

runPascalTests('ISO 7185 6.3 - Constant-definitions', tests)
