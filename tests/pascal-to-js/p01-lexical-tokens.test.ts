// ISO/IEC 7185:1990 - 6.1 Lexical tokens
//
//
//   6.1.1 General
//   6.1.2 Special-symbols
//   6.1.3 Identifiers
//   6.1.4 Directives
//   6.1.5 Numbers
//   6.1.6 Labels
//   6.1.7 Character-strings
//   6.1.8 Token separators
//   6.1.9 Lexical alternatives

import { type PascalTest, runPascalTests } from './harness.ts'

const tests: PascalTest[] = [
  {
    name: '6.1 keywords and identifiers are case-insensitive',
    code: `PROGRAM P(output);
VAR Value: INTEGER;
BEGIN
  VALUE := 7;
  WRITELN(value);
END.`,
    purpose: 'different case spellings of the same identifier refer to the same definition; keywords may be any case',
    expectedOutput: '7\n',
  },

  {
    name: '6.1 compound symbols <> <= >= are single tokens',
    code: `program p(output);
var b: integer;
begin
  b := 2;
  if (b >= 1) and (b <= 3) and (b <> 4) then writeln('ok');
end.`,
    purpose: 'compound symbols are not split into two single-character tokens',
    expectedOutput: 'ok\n',
  },
  {
    name: '6.1 compound symbols := and .. are single tokens',
    code: `program p(output);
type t = array[1..3] of integer;
var a: t;
begin
  a[2] := 5;
  writeln(a[2]);
end.`,
    purpose: 'assignment symbol := and subrange symbol .. are recognized as single tokens',
    expectedOutput: '5\n',
  },

  {
    name: '6.1 identifiers may be of any length',
    code: `program p(output);
var InquireWorkstationIdentification: integer;
begin
  InquireWorkstationIdentification := 1;
  writeln(InquireWorkstationIdentification);
end.`,
    purpose: 'ISO 6.1.3 identifiers are unlimited in length',
    expectedOutput: '1\n',
  },
  {
    name: '6.1 identifiers may consist of letters and digits',
    code: `program p(output);
var WG4: integer;
begin
  WG4 := 4;
  writeln(WG4);
end.`,
    purpose: 'identifier = letter { letter | digit }',
    expectedOutput: '4\n',
  },
  {
    name: '6.1 identifiers must not spell the same as a word-symbol',
    code: `program p;
var begin: integer;
begin
  begin := 1;
end.`,
    purpose: 'ISO 6.1.3 no identifier may spell the same as a word-symbol',
    expectedError: '',
  },
  {
    name: '6.1 identifiers must not start with a digit',
    code: `program p;
var 1x: integer;
begin
end.`,
    purpose: 'identifiers must start with a letter; a digit-sequence start is a number token',
    expectedError: '',
  },

  {
    name: '6.1 unsigned integers are decimal',
    code: `program p(output);
begin
  writeln(123);
  writeln(0);
end.`,
    purpose: 'unsigned-integer denotes an integer value using decimal notation',
    expectedOutput: '123\n0\n',
  },
  {
    name: '6.1 unsigned integers with leading zeros are still decimal',
    code: `program p(output);
begin
  writeln(0100000);
  writeln(010);
  writeln(010 + 1);
end.`,
    purpose:
      'unsigned-integer is a decimal digit-sequence; leading zeros only indicate digit count, not base (0100000 = 100000, 010 = 10); generated JS must not write it as a leading-0 literal (parsed as octal in JS sloppy mode)',
    expectedOutput: '100000\n10\n11\n',
  },
  {
    name: '6.1 const values with leading zeros are still decimal',
    code: `program p(output);
const
  k = 0100000;
begin
  writeln(k);
end.`,
    purpose:
      'constant values enter IR via evalLiteral and must also be treated as decimal: const k = 0100000 gives k = 100000',
    expectedOutput: '100000\n',
  },
  {
    name: '6.1 reals with leading zeros and scale factors are still decimal',
    code: `program p(output);
begin
  writeln(trunc(010E2));
end.`,
    purpose:
      'unsigned-real digit-sequence allows leading zeros: 010E2 = 1000; in JS a leading-0 integer immediately followed by E is not a valid exponent notation (octal literals cannot carry a scale factor)',
    expectedOutput: '1000\n',
  },
  {
    name: '6.1 real with decimal point and fractional part',
    code: `program p(output);
begin
  writeln(trunc(1.5));
end.`,
    purpose: 'unsigned-real = digit-sequence . fractional-part',
    expectedOutput: '1\n',
  },
  {
    name: '6.1 real may use e scale factor without decimal point',
    code: `program p(output);
begin
  writeln(trunc(5e3));
end.`,
    purpose:
      'ISO 6.1.5: the second form of unsigned-real is digit-sequence e scale-factor, where e means multiplied by a power of ten',
    expectedOutput: '5000\n',
  },
  {
    name: '6.1 the e scale factor of a real may carry a negative sign',
    code: `program p(output);
begin
  writeln(trunc(5.0e-1 * 10));
end.`,
    purpose: 'ISO 6.1.5: scale-factor = [ sign ] digit-sequence',
    expectedOutput: '5\n',
  },
  {
    name: '6.1 the E scale factor of a real (uppercase, with plus sign)',
    code: `program p(output);
begin
  writeln(trunc(1.0E+3));
end.`,
    purpose: 'scale-factor = [ sign ] digit-sequence, letter case is insignificant',
    expectedOutput: '1000\n',
  },
  {
    name: '6.1 signed numbers are signed number tokens',
    code: `program p(output);
begin
  writeln(+100);
  writeln(-100);
end.`,
    purpose: 'sign may be + or -',
    expectedOutput: '100\n-100\n',
  },

  {
    name: '6.1 adjacent integer and identifier require a separator',
    code: `program p;
var x: integer;
begin
  x := 1x;
end.`,
    purpose: 'unsigned number adjacent to an identifier with no separator is not part of any legal token sequence',
    expectedError: '',
  },

  {
    name: '6.1 label value 9999 is legal',
    code: `program p(output);
label 9999;
begin
  goto 9999;
9999:
  writeln('ok');
end.`,
    purpose: 'ISO 6.1.6 label range is 0..9999, upper bound is legal',
    expectedOutput: 'ok\n',
  },
  {
    name: '6.1 label exceeding 9999 is illegal',
    code: `program p(output);
label 10000;
begin
  writeln(1);
end.`,
    purpose: 'ISO 6.1.6 labels must be within the closed interval 0..9999',
    expectedError: '',
  },

  {
    name: '6.1 single-element character-string denotes a char value',
    code: `program p(output);
var c: char;
begin
  c := 'A';
  writeln(c);
end.`,
    purpose: 'a character-string with a single string-element denotes a char-type value',
    expectedOutput: 'A\n',
  },
  {
    name: '6.1 two consecutive apostrophes denote one apostrophe character',
    code: `program p(output);
begin
  writeln('''');
end.`,
    purpose: "apostrophe-image = '' denotes one apostrophe character",
    expectedOutput: "'\n",
  },
  {
    name: '6.1 multi-element character-string denotes a string value',
    code: `program p(output);
begin
  writeln('Pascal');
end.`,
    purpose:
      'a character-string with multiple string-elements denotes a string-type value with the same number of components',
    expectedOutput: 'Pascal\n',
  },
  {
    name: '6.1 case within a character-string is not ignored',
    code: `program p(output);
var c: char;
begin
  c := 'a';
  if c = 'A' then writeln('same') else writeln('diff');
end.`,
    purpose: 'case-insensitivity applies only outside character-strings; case is significant inside strings',
    expectedOutput: 'diff\n',
  },

  {
    name: '6.1 brace comment',
    code: `program p(output);
{a comment}
begin
  writeln(1); {trailing}
end.`,
    purpose: 'commentary enclosed by { } constitutes a comment',
    expectedOutput: '1\n',
  },
  {
    name: '6.1 parenthesis-star comment',
    code: `program p(output);
(* a comment *)
begin
  writeln(2);
end.`,
    purpose: '(* *) is another reference representation of comments',
    expectedOutput: '2\n',
  },
  {
    name: '6.1 comments may span multiple lines',
    code: `program p(output);
{
  line 1
  line 2
}
begin
  writeln(3);
end.`,
    purpose: 'commentary may contain line breaks',
    expectedOutput: '3\n',
  },
  {
    name: '6.1 comments act as token separators',
    code: `program p(output);
var a: integer;
begin
  a{ }:= 1;
  writeln(a);
end.`,
    purpose: 'comments, spaces, and newlines all count as token separators',
    expectedOutput: '1\n',
  },
  {
    name: '6.1 brace comment may end with star-parenthesis',
    code: `program p(output);
{ comment ends with *)
begin
  writeln(4);
end.`,
    purpose: 'ISO 6.1.8 NOTE 1: a comment may start with { and end with *)',
    expectedOutput: '4\n',
  },
  {
    name: '6.1 comments must not be nested',
    code: `program p(output);
begin
  { outer { inner } writeln(1); }
end.`,
    purpose: 'a comment ends at the first closing delimiter encountered and does not nest',
    expectedError: '',
  },
  {
    name: '6.1 parenthesis-star comment may end with right brace',
    code: `program p(output);
(* comment ends with }
begin
  writeln(5);
end.`,
    purpose: 'ISO 6.1.8: a comment starting with (* may be terminated by }; both closing delimiters can end a comment',
    expectedOutput: '5\n',
  },
  {
    name: '6.1 comment body starting with $ is still a comment',
    code: `program p(output);
{$commentary}
begin
  writeln(6);
end.`,
    purpose:
      'ISO 6.1.8: commentary is any sequence of characters; body content does not affect comment recognition and skipping',
    expectedOutput: '6\n',
  },
]

runPascalTests('ISO 7185 6.1 - Lexical tokens', tests)
