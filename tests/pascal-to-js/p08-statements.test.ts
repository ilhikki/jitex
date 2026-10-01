// ISO/IEC 7185:1990 - 6.8 Statements
//
// Section summary:
//   Statements represent executable algorithmic actions, with the syntax
//   statement = [label ':'] (simple-statement | structured-statement),
//   and three criteria are given for whether a given statement's label can be
//   the target of a given goto statement. simple-statement includes
//   empty-statement, assignment-statement, procedure-statement, and
//   goto-statement: an assignment statement assigns the value of an expression
//   to a variable or a function activation result (requiring
//   assignment-compatibility), and defines the undefined state of a variable
//   and the totally-undefined state of a structured-type variable; a procedure
//   statement activates the corresponding procedure block (the parameter forms
//   of read/readln/write/writeln denote the corresponding required procedures);
//   a goto statement causes processing to continue at the program point denoted
//   by the label and terminates all activations except the relevant one.
//   structured-statement includes compound-statement, conditional-statement
//   (if, case), repetitive-statement (repeat, while, for), and with-statement:
//   a statement-sequence is executed in textual order; the else-matching rule
//   of if (an if without else must not be immediately followed by else); the
//   case-index selection of case and the requirement that case constants be
//   distinct (an error if none match); the repetition semantics of
//   repeat/while/for, where for requires the control-variable to be an
//   entire-variable of an ordinal type and becomes undefined after execution,
//   and defines "threatening a variable" and the equivalent expansion of for;
//   with defines the point of definition and scope of the
//   field-designator-identifier.
//
// Subsections:
//   6.8.1 General
//   6.8.2 Simple-statements
//     6.8.2.1 General
//     6.8.2.2 Assignment-statements
//     6.8.2.3 Procedure-statements
//     6.8.2.4 Goto-statements
//   6.8.3 Structured-statements
//     6.8.3.1 General
//     6.8.3.2 Compound-statements
//     6.8.3.3 Conditional-statements
//     6.8.3.4 If-statements
//     6.8.3.5 Case-statements
//     6.8.3.6 Repetitive-statements
//     6.8.3.7 Repeat-statements
//     6.8.3.8 While-statements
//     6.8.3.9 For-statements
//     6.8.3.10 With-statements

import { type PascalTest, runPascalTests } from './harness.ts'

const tests: PascalTest[] = [
  // 6.8.2.1 Empty-statement

  {
    name: '6.8 empty-statement contains no symbol and performs no action',
    code: `program test(output);
var i: integer;
begin
  i := 1;
  ;
  i := i + 1;
  ;
  writeln(i);
end.`,
    purpose:
      '6.8.2.1: an empty-statement contains no symbol, denotes no action, and does not affect the result when placed within a statement-sequence',
    expectedOutput: '2\n',
  },
  {
    name: '6.8 a label may prefix an empty-statement',
    code: `program test(output);
label 10;
begin
  goto 10;
  writeln('skipped');
10:
  ;
  writeln('after');
end.`,
    purpose: '6.8.1: a label may prefix an empty-statement; a goto jumps to it to continue with an empty action',
    expectedOutput: 'after\n',
  },

  // 6.8.2.2 Assignment-statements

  {
    name: '6.8 assignment-statement assigns the value of an expression to a variable',
    code: `program test(output);
var x: integer;
    c: char;
    b: boolean;
begin
  x := 3;
  c := 'q';
  b := x > 0;
  if b then
    writeln(c);
end.`,
    purpose:
      '6.8.2.2: an assignment-statement assigns the value of an expression that is assignment-compatible with the variable type to the variable',
    expectedOutput: 'q\n',
  },
  {
    name: '6.8 an integer can be assigned to a real variable (assignment-compatible)',
    code: `program test(output);
var r: real;
    i: integer;
begin
  i := 3;
  r := i;
  if r = 3.0 then
    writeln('compatible');
end.`,
    purpose: '6.8.2.2 / 6.4.6: a value of type integer is assignment-compatible with a real variable',
    expectedOutput: 'compatible\n',
  },
  {
    name: '6.8 assignment-statement requires assignment-compatibility (an incompatible assignment is an error)',
    code: `program test;
var i: integer;
begin
  i := true;
end.`,
    purpose:
      '[Class B . D.49] 6.8.2.2: a value must be assignment-compatible with the variable type; boolean is incompatible with integer, so the program is invalid - a designated error, s5.1 f) permits not reporting it in the accompanying documentation; this processor chooses to detect and report it',
    expectedError: '',
  },
  {
    name: '6.8 variables of the same record type can be assigned as a whole',
    code: `program test(output);
type
  point = record
    x: integer;
    y: integer;
  end;
var
  a, b: point;
begin
  a.x := 4;
  a.y := 5;
  b := a;
  writeln(b.x, b.y);
end.`,
    purpose: '6.4.6: variables of the same record type are assignment-compatible and can be assigned as a whole',
    expectedOutput: '45\n',
  },
  {
    name: '6.8 an assignment-statement can assign to a function-identifier (activation result)',
    code: `program test(output);
function double(n: integer): integer;
begin
  double := n * 2;
end;
begin
  writeln(double(4));
end.`,
    purpose:
      '6.8.2.2: an assignment-statement can assign a value to the activation result denoted by a function-identifier',
    expectedOutput: '8\n',
  },
  {
    name: '6.8 a variable is in an undefined state before assignment and its value is determined after assignment',
    code: `program test(output);
var x: integer;
begin
  x := 7;
  writeln(x);
end.`,
    purpose:
      '6.8.2.2: the state of an unassigned variable is undefined; after assignment its value is determined by the assigned expression',
    expectedOutput: '7\n',
  },

  // 6.8.2.3 Procedure-statements

  {
    name: '6.8 a parameterless procedure-statement activates a procedure block',
    code: `program test(output);
procedure hello;
begin
  writeln('hello');
end;
begin
  hello;
end.`,
    purpose:
      '6.8.2.3: a procedure-statement specifies activation of the procedure block associated with its procedure-identifier',
    expectedOutput: 'hello\n',
  },
  {
    name: '6.8 actual and formal parameters of a procedure-statement correspond by position',
    code: `program test(output);
procedure pair(a, b: char);
begin
  writeln(a, b);
end;
begin
  pair('x', 'y');
end.`,
    purpose:
      '6.8.2.3: actual and formal parameters correspond one-to-one by position in their respective lists and are equal in number',
    expectedOutput: 'xy\n',
  },
  {
    name: '6.8 the read procedure-statement reads a character variable',
    code: `program test(input, output);
var c: char;
begin
  read(c);
  writeln(c);
end.`,
    purpose: '6.8.2.3 / 6.9.1: the procedure-identifier of a read-parameter-list denotes the required procedure read',
    input: 'Z',
    expectedOutput: 'Z\n',
  },
  {
    name: '6.8 the readln procedure-statement reads an integer variable',
    code: `program test(input, output);
var i: integer;
begin
  readln(i);
  writeln(i);
end.`,
    purpose:
      '6.8.2.3 / 6.9.2: the procedure-identifier of a readln-parameter-list denotes the required procedure readln',
    input: '42',
    expectedOutput: '42\n',
  },
  {
    name: '6.8 the write/writeln procedure-statement outputs characters and newlines',
    code: `program test(output);
begin
  write('a');
  write('b');
  writeln;
  writeln('c');
end.`,
    purpose: '6.8.2.3 / 6.9.3: a write/writeln-parameter-list denotes the required procedure write/writeln',
    expectedOutput: 'ab\nc\n',
  },

  // 6.8.2.4 Goto-statements

  {
    name: '6.8 goto jumps forward to skip statements',
    code: `program test(output);
label 10;
begin
  writeln('a');
  goto 10;
  writeln('b');
10:
  writeln('c');
end.`,
    purpose:
      '6.8.2.4 / 6.8.1 b): the label and the goto are in the same statement-sequence, so processing continues at the label',
    expectedOutput: 'a\nc\n',
  },
  {
    name: '6.8 goto jumps backward to form a loop',
    code: `program test(output);
label 20;
var i: integer;
begin
  i := 0;
20:
  i := i + 1;
  writeln(i);
  if i < 3 then
    goto 20;
end.`,
    purpose:
      '6.8.2.4: goto causes processing to continue at the program point denoted by the label, and may go backward to form a loop',
    expectedOutput: '1\n2\n3\n',
  },
  {
    name: '6.8 goto to a label in a statement that contains it (criterion a)',
    code: `program test(output);
label 30;
var i: integer;
begin
  i := 0;
30:
  begin
    i := i + 1;
    writeln(i);
    if i < 3 then
      goto 30;
  end;
  writeln('done');
end.`,
    purpose: '6.8.1 a): the statement S prefixed by the label contains the goto, so that label is allowed as a target',
    expectedOutput: '1\n2\n3\ndone\n',
  },
  {
    name:
      '6.8 goto to a top-level label in the enclosing block (criterion c, the goto is inside a nested compound-statement)',
    code: `program test(output);
label 40;
begin
  writeln('outer');
  begin
    writeln('inner');
    goto 40;
  end;
  writeln('skipped');
40:
  writeln('label');
end.`,
    purpose:
      '6.8.1 c): the label prefixes a statement in the compound-statement of the block statement-part, so a goto anywhere in the block may reference it',
    expectedOutput: 'outer\ninner\nlabel\n',
  },
  {
    name: '6.8 goto can jump out of a while loop',
    code: `program test(output);
label 50;
var i: integer;
begin
  i := 0;
  while i < 10 do
  begin
    i := i + 1;
    if i = 3 then
      goto 50;
    writeln(i);
  end;
50:
  writeln('done');
end.`,
    purpose: '6.8.2.4: goto jumps to a label outside the loop, terminating execution of the repetitive-statement',
    expectedOutput: '1\n2\ndone\n',
  },
  {
    name: '6.8 goto can jump out of a for loop',
    code: `program test(output);
label 60;
var i: integer;
begin
  for i := 1 to 5 do
  begin
    writeln(i);
    if i = 2 then
      goto 60;
  end;
60:
  writeln('done');
end.`,
    purpose:
      '6.8.2.4: goto jumps out of a for-statement (a case of "being left by goto"; the control variable state is no longer constrained)',
    expectedOutput: '1\n2\ndone\n',
  },
  {
    name: '6.8 goto can jump out of a repeat loop',
    code: `program test(output);
label 70;
var i: integer;
begin
  i := 0;
  repeat
    i := i + 1;
    writeln(i);
    if i = 3 then
      goto 70;
  until false;
70:
  writeln('done');
end.`,
    purpose: '6.8.2.4: goto jumps out of a repeat-statement, terminating its repeated execution',
    expectedOutput: '1\n2\n3\ndone\n',
  },
  {
    name: '6.8 goto jumps out of nested loops',
    code: `program test(output);
label 80;
var i, j: integer;
begin
  for i := 1 to 3 do
    for j := 1 to 3 do
    begin
      write(i, j, ' ');
      if (i = 2) and (j = 1) then
        goto 80;
    end;
80:
  writeln('end');
end.`,
    purpose: '6.8.2.4: a single goto jumps out of two layers of for loops, terminating all activations between them',
    expectedOutput: '11 12 13 21 end\n',
  },
  {
    name: '6.8 goto must not jump to an undeclared label',
    code: `program test;
begin
  goto 999;
end.`,
    purpose: '6.8.2.4 / 6.2.1: the label of a goto must be declared in some label-declaration-part',
    expectedError: '',
  },
  {
    name: '6.8 a label must be declared in the label-declaration-part',
    code: `program test(output);
begin
140:
  writeln('ok');
end.`,
    purpose: '6.2.1: a statement label appearing in a block must be declared in the label-declaration-part',
    expectedError: '',
  },
  {
    name: '6.8 the same label must not prefix two statements',
    code: `program test(output);
label 100;
begin
100:
  writeln('first');
100:
  writeln('second');
end.`,
    purpose:
      '6.2.1: the block must closest-contain exactly one statement bearing that label; duplicate prefixes are invalid',
    expectedError: '',
  },
  {
    name: '6.8 a declared but unused label is valid',
    code: `program test(output);
label 110;
begin
  writeln('ok');
end.`,
    purpose: '6.2.1: a label may be declared without a corresponding statement prefix or goto usage',
    expectedOutput: 'ok\n',
  },
  {
    name: '6.8 goto must not jump to a label inside an if branch',
    code: `program test(output);
label 120;
begin
  goto 120;
  if false then
    begin
120:
      writeln('inside');
    end;
  writeln('after');
end.`,
    purpose:
      '6.8.1: the label is neither in the statement-sequence containing the goto nor at the top level of the block statement-part, so it is unreachable',
    expectedError: '',
  },
  {
    name: '6.8 goto must not jump to a label inside a while loop body',
    code: `program test;
label 130;
var i: integer;
begin
  i := 0;
  while i < 3 do
    130: i := i + 1;
  goto 130;
end.`,
    purpose:
      '6.8.1: the label is inside the while-statement body (not at the top level of the block statement-part, nor in the same statement-sequence), so it is unreachable',
    expectedError: '',
  },
  {
    name: '6.8 goto and label in the same statement-sequence (inside an if branch) are valid',
    code: `program test(output);
label 140;
var d: integer;
begin
  d := 0;
  if d = 0 then
  begin
    goto 140;
140:
    d := 1;
  end;
  writeln('done', d);
end.`,
    purpose:
      '6.8.1 b): the statement prefixed by the label and the goto are in the same statement-sequence, so it is allowed',
    expectedOutput: 'done1\n',
  },
  {
    name:
      '6.8 goto from an inner procedure to a top-level label in the main program (terminating intermediate activations)',
    code: `program test(output);
label 150;
procedure outer;
procedure inner;
begin
  writeln('inner');
  goto 150;
  writeln('never inner');
end;
begin
  writeln('outer');
  inner;
  writeln('never outer');
end;
begin
  writeln('main');
  outer;
  writeln('never main');
150:
  writeln('label');
end.`,
    purpose:
      '6.8.2.4 / 6.8.1 c): a goto terminates all activations except the activation containing the program point and any activations enclosing it',
    expectedOutput: 'main\nouter\ninner\nlabel\n',
  },
  {
    name: '6.8 goto from an inner procedure to a top-level label in an outer procedure',
    code: `program test(output);
procedure outer;
label 160;
procedure inner;
begin
  writeln('inner');
  goto 160;
  writeln('never');
end;
begin
  inner;
  writeln('after inner');
160:
  writeln('label 160');
end;
begin
  outer;
end.`,
    purpose:
      '6.8.1 NOTE 2 / c): a goto in an inner block may reference a label at the top level of the statement-part of an outer block',
    expectedOutput: 'inner\nlabel 160\n',
  },
  {
    name: '6.8 goto must not jump to a label inside another procedure',
    code: `program test(output);
procedure p1;
label 170;
begin
170:
  writeln('p1');
end;
procedure p2;
begin
  goto 170;
end;
begin
  p2;
end.`,
    purpose: '6.8.1: the label is not in the block containing the goto or any enclosing block, so it is unreachable',
    expectedError: '',
  },
  {
    name: '6.8 a goto in the main program must not jump to a label inside a procedure',
    code: `program test(output);
procedure p;
label 180;
begin
180:
  writeln('p');
end;
begin
  goto 180;
end.`,
    purpose: '6.8.1: a goto must not enter a block to reference its internal label',
    expectedError: '',
  },
  {
    name: '6.8 goto in a function to a top-level label in the function block',
    code: `program test(output);
function f: integer;
label 190;
begin
  goto 190;
  f := 1;
190:
  f := 2;
end;
begin
  writeln(f);
end.`,
    purpose:
      '6.8.1 c): a goto within a function block may reference a label at the top level of the function block statement-part',
    expectedOutput: '2\n',
  },

  // 6.8.3.2 Compound-statements

  {
    name: '6.8 a compound-statement executes its statement-sequence in textual order',
    code: `program test(output);
var a: integer;
begin
  a := 1;
  writeln(a);
  a := a + 1;
  writeln(a);
  a := a + 1;
  writeln(a);
end.`,
    purpose: '6.8.3.1 / 6.8.3.2: a statement-sequence is executed in textual order (except as modified by goto)',
    expectedOutput: '1\n2\n3\n',
  },
  {
    name: '6.8 compound-statements can be nested',
    code: `program test(output);
begin
  writeln('a');
  begin
    writeln('b');
    begin
      writeln('c');
    end;
  end;
  writeln('d');
end.`,
    purpose:
      '6.8.3.2: a compound-statement is itself a statement and may appear in the statement-sequence of another compound-statement',
    expectedOutput: 'a\nb\nc\nd\n',
  },

  // 6.8.3.4 If-statements

  {
    name: '6.8 if executes the then-statement when the condition is true',
    code: `program test(output);
var x: integer;
begin
  x := 1;
  if x > 0 then
    writeln('positive');
end.`,
    purpose: '6.8.3.4: when the Boolean-expression is true, the statement of the if-statement is executed',
    expectedOutput: 'positive\n',
  },
  {
    name: '6.8 if does not execute the then-statement when the condition is false',
    code: `program test(output);
var x: integer;
begin
  x := -1;
  if x > 0 then
    writeln('positive');
  writeln('done');
end.`,
    purpose: '6.8.3.4: when the Boolean-expression is false and there is no else-part, no branch is executed',
    expectedOutput: 'done\n',
  },
  {
    name: '6.8 if-then-else executes then when the condition is true',
    code: `program test(output);
var x: integer;
begin
  x := 10;
  if x > 5 then
    writeln('greater')
  else
    writeln('less');
end.`,
    purpose: '6.8.3.4: when the condition is true, the then-statement is executed and the else-part is not',
    expectedOutput: 'greater\n',
  },
  {
    name: '6.8 if-then-else executes else when the condition is false',
    code: `program test(output);
var x: integer;
begin
  x := 3;
  if x > 5 then
    writeln('greater')
  else
    writeln('less');
end.`,
    purpose: '6.8.3.4: when the condition is false, the statement of the else-part is executed',
    expectedOutput: 'less\n',
  },
  {
    name: '6.8 else pairs with the nearest unpaired then',
    code: `program test(output);
var a, b: boolean;
begin
  a := true;
  b := false;
  if a then
    if b then
      writeln('a-then-b-then')
    else
      writeln('a-then-b-else');
end.`,
    purpose: '6.8.3.4 NOTE: an else-part pairs with the nearest preceding unpaired then',
    expectedOutput: 'a-then-b-else\n',
  },
  {
    name: '6.8 using a compound-statement so that an if without else is not immediately followed by else',
    code: `program test(output);
var a: boolean;
begin
  a := true;
  if a then
    begin
      if false then
        writeln('inner');
    end
  else
    writeln('outer else');
  writeln('done');
end.`,
    purpose: '6.8.3.4: use begin..end to close the inner if without else, so that else pairs with the outer then',
    expectedOutput: 'done\n',
  },
  {
    name: '6.8 the condition of an if must be a Boolean expression',
    code: `program test(output);
var x: integer;
begin
  x := 1;
  if x then
    writeln('x');
end.`,
    purpose: '6.8.3.4: the Boolean-expression of an if must be of type Boolean; an integer as a condition is invalid',
    expectedError: '',
  },
  {
    name: '6.8 the condition of a while must be a Boolean expression',
    code: `program test;
var x: integer;
begin
  x := 0;
  while x do
    x := x + 1;
end.`,
    purpose: '6.8.3.4: the condition of a while must be of type Boolean; an integer as a condition is invalid',
    expectedError: '',
  },
  {
    name: '6.8 the until condition of a repeat must be a Boolean expression',
    code: `program test;
var x: integer;
begin
  x := 0;
  repeat
    x := x + 1;
  until x;
end.`,
    purpose: '6.8.3.4: the until condition of a repeat must be of type Boolean; an integer as a condition is invalid',
    expectedError: '',
  },
  {
    name: '6.8 a condition combining if with Boolean operators',
    code: `program test(output);
var a, b, c: integer;
begin
  a := 5;
  b := 3;
  c := 7;
  if (a > b) and (c > b) then
    writeln('and ok');
  if (a > 10) or (b < 10) then
    writeln('or ok');
end.`,
    purpose: '6.8.3.4: the condition of an if may be a Boolean expression containing and/or',
    expectedOutput: 'and ok\nor ok\n',
  },
  {
    name: '6.8 an if-statement inside a loop body',
    code: `program test(output);
var i: integer;
begin
  for i := 1 to 4 do
    if i mod 2 = 0 then
      writeln(i);
end.`,
    purpose: '6.8.3.4: an if-statement may serve as the statement body of a for-statement',
    expectedOutput: '2\n4\n',
  },
  {
    name: '6.8 if-then-else in a procedure body',
    code: `program test(output);
procedure check(n: integer);
begin
  if n > 0 then
    writeln('positive')
  else
    writeln('non-positive');
end;
begin
  check(5);
  check(-3);
end.`,
    purpose: '6.8.3.4: an if-statement appears in the statement-part of a procedure block',
    expectedOutput: 'positive\nnon-positive\n',
  },

  // 6.8.3.5 Case-statements

  {
    name: '6.8 case executes the case-list-element whose value matches the case-index',
    code: `program test(output);
var x: integer;
begin
  x := 2;
  case x of
    1: writeln('one');
    2: writeln('two');
    3: writeln('three');
  end;
end.`,
    purpose:
      '6.8.3.5: the value of the case-index designates execution of the statement closest-containing the corresponding case-constant',
    expectedOutput: 'two\n',
  },
  {
    name: '6.8 a case constant list may contain multiple constants',
    code: `program test(output);
var x: integer;
begin
  x := 3;
  case x of
    1, 2: writeln('low');
    3, 4: writeln('high');
  end;
end.`,
    purpose: '6.8.3.5: a case-constant-list may contain multiple case constants',
    expectedOutput: 'high\n',
  },
  {
    name: '6.8 a case branch may be a compound-statement',
    code: `program test(output);
var x: integer;
begin
  x := 2;
  case x of
    1:
      begin
        writeln('one');
      end;
    2:
      begin
        writeln('two');
        writeln('again');
      end;
  end;
end.`,
    purpose: '6.8.3.5: the statement of a case-list-element may be a compound-statement',
    expectedOutput: 'two\nagain\n',
  },
  {
    name: '6.8 the case-index is evaluated only once',
    code: `program test(output);
var n: integer;
function f: integer;
begin
  n := n + 1;
  f := 2;
end;
begin
  n := 0;
  case f of
    1: writeln('one');
    2: writeln('two');
  end;
  writeln(n);
end.`,
    purpose: '6.8.3.5: when executing a case-statement, the case-index is evaluated once',
    expectedOutput: 'two\n1\n',
  },
  {
    name: '6.8 case can be used with the char ordinal type',
    code: `program test(output);
var c: char;
begin
  c := 'b';
  case c of
    'a': writeln('A');
    'b': writeln('B');
    'c': writeln('C');
  end;
end.`,
    purpose: '6.8.3.5: case constants must be of the same ordinal type as the case-index; the char type is applicable',
    expectedOutput: 'B\n',
  },
  {
    name: '6.8 case constants must be distinct',
    code: `program test(output);
var x: integer;
begin
  x := 1;
  case x of
    1: writeln('a');
    1: writeln('b');
  end;
end.`,
    purpose:
      '6.8.3.5: the values denoted by the case constants of each case-constant-list must be distinct; duplicates are invalid',
    expectedError: '',
  },
  {
    name: '6.8 nested case',
    code: `program test(output);
var x, y: integer;
begin
  x := 1;
  y := 2;
  case x of
    1:
      case y of
        1: writeln('1-1');
        2: writeln('1-2');
      end;
    2: writeln('2');
  end;
end.`,
    purpose: '6.8.3.5: the statement of a case-list-element may be another case-statement',
    expectedOutput: '1-2\n',
  },
  {
    name: '6.8 a case inside a loop selects a branch by case-index',
    code: `program test(output);
var i: integer;
begin
  for i := 1 to 4 do
    case i of
      1: writeln('a');
      2, 4: writeln('b');
      3: writeln('c');
    end;
end.`,
    purpose:
      '6.8.3.5: a case-statement may serve as the body of a for-statement, selecting a branch by case-index each time',
    expectedOutput: 'a\nb\nc\nb\n',
  },

  // 6.8.3.7 Repeat-statements

  {
    name: '6.8 repeat executes at least once (the condition is already true initially)',
    code: `program test(output);
var i: integer;
begin
  i := 10;
  repeat
    writeln('once');
    i := i + 1;
  until i > 5;
end.`,
    purpose:
      '6.8.3.7: the Boolean-expression is evaluated after the statement-sequence executes, so the body executes at least once',
    expectedOutput: 'once\n',
  },
  {
    name: '6.8 repeat executes repeatedly until the condition becomes true',
    code: `program test(output);
var i: integer;
begin
  i := 0;
  repeat
    i := i + 1;
    writeln(i);
  until i >= 3;
end.`,
    purpose: '6.8.3.7: the statement-sequence is executed repeatedly until the Boolean-expression is true',
    expectedOutput: '1\n2\n3\n',
  },
  {
    name: '6.8 the statement-sequence of a repeat may contain multiple statements',
    code: `program test(output);
var i, s: integer;
begin
  i := 0;
  s := 0;
  repeat
    i := i + 1;
    s := s + i;
  until i >= 4;
  writeln(s);
end.`,
    purpose: '6.8.3.7: the statement-sequence of a repeat may contain multiple statements separated by semicolons',
    expectedOutput: '10\n',
  },
  {
    name: '6.8 nested repeat',
    code: `program test(output);
var i, j: integer;
begin
  i := 0;
  repeat
    i := i + 1;
    j := 0;
    repeat
      j := j + 1;
      write('*');
    until j >= i;
    writeln;
  until i >= 2;
end.`,
    purpose:
      '6.8.3.7: repeat-statements may be nested; the number of inner repetitions depends on the current state of the outer one',
    expectedOutput: '*\n**\n',
  },

  // 6.8.3.8 While-statements

  {
    name: '6.8 while does not execute the body when the condition is initially false',
    code: `program test(output);
var i: integer;
begin
  i := 5;
  while i < 5 do
    writeln('never');
  writeln('done');
end.`,
    purpose:
      '6.8.3.8: the equivalent expansion of while first checks the condition; when it is false, the statement is not executed',
    expectedOutput: 'done\n',
  },
  {
    name: '6.8 while executes repeatedly until the condition becomes false',
    code: `program test(output);
var i: integer;
begin
  i := 0;
  while i < 3 do
  begin
    i := i + 1;
    writeln(i);
  end;
end.`,
    purpose: '6.8.3.8: the body of a while-statement is executed repeatedly until the Boolean-expression is false',
    expectedOutput: '1\n2\n3\n',
  },
  {
    name: '6.8 the Boolean-expression of a while is re-evaluated before each iteration',
    code: `program test(output);
var n: integer;
function cond: boolean;
begin
  n := n + 1;
  cond := n < 4;
end;
begin
  n := 0;
  while cond do
    writeln(n);
end.`,
    purpose: '6.8.3.8: by the equivalent expansion, the Boolean-expression is re-evaluated before each repetition',
    expectedOutput: '1\n2\n3\n',
  },
  {
    name: '6.8 nested while',
    code: `program test(output);
var i, j: integer;
begin
  i := 0;
  while i < 2 do
  begin
    i := i + 1;
    j := 0;
    while j < 2 do
    begin
      j := j + 1;
      write('x');
    end;
    writeln;
  end;
end.`,
    purpose: '6.8.3.8: while-statements may be nested',
    expectedOutput: 'xx\nxx\n',
  },
  {
    name: '6.8 a while loop in a procedure body',
    code: `program test(output);
procedure count(n: integer);
var i: integer;
begin
  i := 1;
  while i <= n do
  begin
    writeln(i);
    i := i + 1;
  end;
end;
begin
  count(3);
end.`,
    purpose: '6.8.3.8: a while-statement appears in the statement-part of a procedure block',
    expectedOutput: '1\n2\n3\n',
  },

  // 6.8.3.9 For-statements

  {
    name: '6.8 for-to assigns incrementing values to the control variable in sequence',
    code: `program test(output);
var i: integer;
begin
  for i := 1 to 3 do
    writeln(i);
end.`,
    purpose:
      '6.8.3.9: for-to assigns to the control variable in sequence and executes the statement according to the equivalent expansion',
    expectedOutput: '1\n2\n3\n',
  },
  {
    name: '6.8 for-downto assigns decrementing values to the control variable in sequence',
    code: `program test(output);
var i: integer;
begin
  for i := 3 downto 1 do
    writeln(i);
end.`,
    purpose: '6.8.3.9: for-downto uses pred to decrement the control variable according to the equivalent expansion',
    expectedOutput: '3\n2\n1\n',
  },
  {
    name: '6.8 for-to iterates zero times when the initial value is greater than the final value',
    code: `program test(output);
var i: integer;
begin
  for i := 5 to 1 do
    writeln('never');
  writeln('done');
end.`,
    purpose:
      '6.8.3.9: in the equivalent expansion of for-to, the statement is not executed when initial-value > final-value',
    expectedOutput: 'done\n',
  },
  {
    name: '6.8 for-downto iterates zero times when the initial value is less than the final value',
    code: `program test(output);
var i: integer;
begin
  for i := 1 downto 5 do
    writeln('never');
  writeln('done');
end.`,
    purpose:
      '6.8.3.9: in the equivalent expansion of for-downto, the statement is not executed when initial-value < final-value',
    expectedOutput: 'done\n',
  },
  {
    name: '6.8 for-to iterates once when the initial value equals the final value',
    code: `program test(output);
var i: integer;
begin
  for i := 2 to 2 do
    writeln(i);
end.`,
    purpose: '6.8.3.9: the statement executes exactly once when initial-value = final-value',
    expectedOutput: '2\n',
  },
  {
    name: '6.8 the initial-value and final-value of a for are each evaluated once',
    code: `program test(output);
var i, n: integer;
begin
  n := 3;
  for i := 1 to n do
  begin
    writeln('x');
    n := 1;
  end;
end.`,
    purpose:
      '6.8.3.9: the equivalent expansion stores the final-value in an auxiliary variable first, so changing n during the loop does not affect the iteration count',
    expectedOutput: 'x\nx\nx\n',
  },
  {
    name: '6.8 the control variable of a for must be an entire variable',
    code: `program test(output);
var a: array[1..3] of integer;
begin
  for a[1] := 1 to 3 do
    writeln('x');
end.`,
    purpose: '6.8.3.9: the control-variable must syntactically be an entire-variable; an indexed variable is invalid',
    expectedError: '',
  },
  {
    name: '6.8 the control variable is undefined after a for ends and may be reassigned thereafter',
    code: `program test(output);
var i: integer;
begin
  for i := 1 to 2 do
    writeln('x');
  i := 9;
  writeln(i);
end.`,
    purpose:
      '6.8.3.9: after a for-statement executes (without being left by goto), the control variable is undefined and may be reassigned outside the statement',
    expectedOutput: 'x\nx\n9\n',
  },
  {
    name: '6.8 the control variable of a for may be of a subrange ordinal type',
    code: `program test(output);
var i: 1..5;
begin
  for i := 1 to 3 do
    writeln(i);
end.`,
    purpose: '6.8.3.9: the control-variable must be of an ordinal type; a subrange type satisfies this requirement',
    expectedOutput: '1\n2\n3\n',
  },
  {
    name: '6.8 nested for',
    code: `program test(output);
var i, j: integer;
begin
  for i := 1 to 2 do
  begin
    for j := 1 to 2 do
      write('*');
    writeln;
  end;
end.`,
    purpose: '6.8.3.9: for-statements may be nested',
    expectedOutput: '**\n**\n',
  },
  {
    name: '6.8 a for loop in a procedure body sums values',
    code: `program test(output);
procedure sum(n: integer);
var i, s: integer;
begin
  s := 0;
  for i := 1 to n do
    s := s + i;
  writeln(s);
end;
begin
  sum(5);
end.`,
    purpose:
      '6.8.3.9: a for-statement appears in the statement-part of a procedure block, with an assignment-statement as its body',
    expectedOutput: '15\n',
  },
  {
    name: '6.8 the loop upper bound remains valid after a recursive call within a for-loop body',
    code: `program test(output);
function f(k: integer): integer;
var i, s: integer;
begin
  s := 0;
  for i := 1 to k do
  begin
    s := s + 1;
    if i = 1 then
      s := s + f(k - 1);
  end;
  f := s;
end;
begin
  writeln(f(3));
end.`,
    purpose:
      '6.8.3.9: the final-value is evaluated once before the loop starts; a recursive call inside the loop body must not change the loop upper bound of the current level (f(3)=6)',
    expectedOutput: '6\n',
  },

  // 6.8.3.10 With-statements

  {
    name: '6.8 with causes field-identifiers to denote components of the record variable',
    code: `program test(output);
type
  point = record
    x: integer;
    y: integer;
  end;
var
  p: point;
begin
  p.x := 10;
  p.y := 20;
  with p do
  begin
    writeln(x);
    writeln(y);
    x := 30;
  end;
  writeln(p.x);
end.`,
    purpose:
      '6.8.3.10: a single record variable in with defines each field-identifier as a field-designator-identifier',
    expectedOutput: '10\n20\n30\n',
  },
  {
    name: '6.8 with may contain multiple record variables (equivalent to nested with)',
    code: `program test(output);
type
  inner = record
    a: integer;
  end;
  outer = record
    b: integer;
    i: inner;
  end;
var
  o: outer;
begin
  o.b := 1;
  o.i.a := 2;
  with o, o.i do
  begin
    writeln(b);
    writeln(a);
  end;
end.`,
    purpose: '6.8.3.10: with v1,v2 do s is equivalent to with v1 do with v2 do s',
    expectedOutput: '1\n2\n',
  },
  {
    name: '6.8 in nested with, an inner field-identifier shadows a same-named outer field',
    code: `program test(output);
type
  inner = record
    v: integer;
  end;
  outer = record
    v: integer;
    i: inner;
  end;
var
  o: outer;
begin
  o.v := 1;
  o.i.v := 2;
  with o do
  begin
    writeln(v);
    with i do
      writeln(v);
    writeln(v);
  end;
end.`,
    purpose:
      '6.8.3.10 / 6.2.2: the inner with establishes a new point of definition for the field-identifier, shadowing the same-named outer field',
    expectedOutput: '1\n2\n1\n',
  },
  {
    name: '6.8 a field-identifier of with takes precedence over a same-named outer variable',
    code: `program test(output);
type
  r = record
    x: integer;
  end;
var
  x: integer;
  p: r;
begin
  x := 1;
  p.x := 2;
  with p do
    writeln(x);
  writeln(x);
end.`,
    purpose:
      '6.8.3.10: the point of definition of a field-identifier inside a with-statement causes a same-named outer variable to be shadowed',
    expectedOutput: '2\n1\n',
  },
  {
    name: '6.8 the body of a with-statement may contain a nested if and modify fields',
    code: `program test(output);
type
  date = record
    month: integer;
    year: integer;
  end;
var
  d: date;
begin
  d.month := 12;
  d.year := 1999;
  with d do
    if month = 12 then
    begin
      month := 1;
      year := year + 1;
    end
    else
      month := month + 1;
  writeln(d.month);
  writeln(d.year);
end.`,
    purpose:
      '6.8.3.10 example: within the body of a with-statement, a field-identifier directly denotes a component of the record variable',
    expectedOutput: '1\n2000\n',
  },
  {
    name: '6.6.2 assignment to a function-identifier may be embedded within various structured-statements',
    code: `program test(output);
function f1: integer;
var i: integer;
begin
  i := 0;
  while i < 1 do
  begin
    f1 := 1;
    i := i + 1;
  end;
end;
function f2: integer;
begin
  repeat
    f2 := 2;
  until true;
end;
function f3: integer;
var i: integer;
begin
  for i := 1 to 1 do
    f3 := 3;
end;
function f4: integer;
var i: integer;
begin
  i := 1;
  case i of
    1: f4 := 4;
    2: f4 := 0;
  end;
end;
function f5: integer;
type r = record x: integer end;
var v: r;
begin
  with v do
    f5 := 5;
end;
function f6: integer;
label 1;
begin
  1: f6 := 6;
end;
begin
  writeln(f1, f2, f3, f4, f5, f6);
end.`,
    purpose:
      'ISO 6.6.2: a function-block must contain at least one assignment-statement whose target is the function-identifier; that assignment may be located at any statement position',
    expectedOutput: '123456\n',
  },
  {
    name: '6.8.3.4 an if-statement missing then should report an error',
    code: 'program test(output); var b: boolean; begin b := true; if b writeln(1); end.',
    purpose: 'ISO 6.8.3.4: if-statement = if Boolean-expression then statement [ else statement ]',
    expectedError: '',
  },
  {
    name: '6.8.3.5 a while-statement missing do should report an error',
    code: 'program test(output); var b: boolean; begin b := false; while b writeln(1); end.',
    purpose: 'ISO 6.8.3.5: while-statement = while Boolean-expression do statement',
    expectedError: '',
  },
  {
    name: '6.8.3.9 the direction word of a for-statement may only be to or downto',
    code: 'program test(output); var i: integer; begin for i := 1 by 2 do writeln(i); end.',
    purpose: 'ISO 6.8.3.9: for-statement = for ... := ... ( to | downto ) ... do statement',
    expectedError: '',
  },
  {
    name: '6.8.3.9 a for-statement missing do should report an error',
    code: 'program test(output); var i: integer; begin for i := 1 to 2 writeln(i); end.',
    purpose: 'ISO 6.8.3.9: after the final-value there must be do and a statement',
    expectedError: '',
  },
  {
    name: '6.8.3.5 a case-statement missing of should report an error',
    code: 'program test(output); var i: integer; begin i := 1; case i 1: writeln(1); end; end.',
    purpose: 'ISO 6.8.3.5: case-statement = case case-index of case-list-element ... end',
    expectedError: '',
  },
  {
    name: '6.8.3.5 a missing colon after a case constant should report an error',
    code: 'program test(output); var i: integer; begin i := 1; case i of 1 writeln(1); end; end.',
    purpose: 'ISO 6.8.3.5: case-list-element = case-constant-list : statement',
    expectedError: '',
  },
  {
    name: '6.8.2.4 the target of a goto must be a label',
    code: `program test(output);
label 1;
begin
  goto 1x;
  1: writeln(1);
end.`,
    purpose: 'ISO 6.8.2.4: goto-statement = goto label, where a label is a digit sequence',
    expectedError: '',
  },
  {
    name: '6.8.3.10 a with-statement missing do should report an error',
    code: 'program test; type r = record x: integer end; var v: r; begin with v x := 1; end.',
    purpose: 'ISO 6.8.3.10: with-statement = with record-variable-list do statement',
    expectedError: '',
  },
  {
    name: '6.6.5.3 the actual parameter of new must be a variable of pointer type',
    code: 'program test; var i: integer; begin new(i); end.',
    purpose: 'ISO 6.6.5.3: new(q) requires q to be of a pointer-type',
    expectedError: '',
  },
  {
    name: '6.6.5.3 the actual parameter of dispose must be a variable of pointer type',
    code: 'program test; var i: integer; begin dispose(i); end.',
    purpose: 'ISO 6.6.5.3: dispose(q) requires q to be of a pointer-type',
    expectedError: '',
  },
  {
    name: '6.8.3.5 a case label may be a constant-identifier of type char',
    code: `program test(output);
const A = 'a';
      B = 'b';
var c: char;
begin
  c := 'b';
  case c of
    A: writeln('a');
    B: writeln('b');
  end;
end.`,
    purpose: 'ISO 6.8.3.5/6.3: a case-constant may be a constant-identifier, and its value must be distinct',
    expectedOutput: 'b\n',
  },
  {
    name: '6.8.3.5 the case-index may be of type Boolean',
    code: `program test(output);
const T = true;
      F = false;
var b: boolean;
begin
  b := true;
  case b of
    F: writeln('F');
    T: writeln('T');
  end;
end.`,
    purpose:
      'ISO 6.8.3.5/6.4.2.2: Boolean is an ordinal type and may be used as the type of the case-index; its required constant-identifiers may serve as case-constants',
    expectedOutput: 'T\n',
  },
  {
    name: '6.8.2.2 array variables of the same type can be assigned as a whole',
    code: `program test(output);
type t = array[1..3] of integer;
var a, b: t;
begin
  a[1] := 1;
  a[2] := 2;
  a[3] := 3;
  b := a;
  writeln(b[1], b[2], b[3]);
end.`,
    purpose:
      'ISO 6.8.2.2/6.4.6: when the left-hand and right-hand sides of an assignment denote the same type, whole assignment copies the value to each component',
    expectedOutput: '123\n',
  },
  {
    name: '6.8.2.2 an array component whose element type is record can be assigned as a whole',
    code: `program test(output);
type r = record x: integer; y: char end;
var a: array[1..2] of r;
    v: r;
begin
  v.x := 5;
  v.y := 'Q';
  a[2] := v;
  writeln(a[2].x, a[2].y);
end.`,
    purpose:
      'ISO 6.5.3.1/6.8.2.2: an array component is a variable and may serve as an assignment target accepting a record value of the same type',
    expectedOutput: '5Q\n',
  },
  {
    name: '6.8.2.2 a record containing an array field can be assigned as a whole',
    code: `program test(output);
type r = record n: integer; s: array[1..2] of integer end;
var a, b: r;
begin
  a.n := 1;
  a.s[1] := 2;
  a.s[2] := 3;
  b := a;
  writeln(b.n, b.s[1], b.s[2]);
end.`,
    purpose: 'ISO 6.8.2.2: whole assignment of a structured type recursively copies the values of all components',
    expectedOutput: '123\n',
  },
  {
    name: '6.8.2.2 array assignment of pointer elements copies the identifying-value',
    code: `program test(output);
type ip = ^integer;
var a: array[1..2] of ip;
    p: ip;
begin
  new(p);
  p^ := 8;
  a[1] := p;
  a[2] := a[1];
  writeln(a[2]^);
  dispose(p);
end.`,
    purpose:
      'ISO 6.4.4/6.8.2.2: pointer assignment copies the identifying-value, so a[1] and a[2] identify the same variable',
    expectedOutput: '8\n',
  },
  {
    name: '6.8.1 a label prefixing a statement must not exceed the allowed range',
    code: `program test(output);
begin
  10000: writeln(1);
end.`,
    purpose: 'ISO 6.1.6/6.8.1: a label takes a value in 0..9999',
    expectedError: '',
  },
  {
    name: '6.8.1 a label prefixing a statement must be followed by a colon',
    code: `program test(output);
begin
  1 writeln(1);
end.`,
    purpose: 'ISO 6.8.1: label : statement',
    expectedError: '',
  },
  {
    name: '6.8.1 a labeled statement must itself be valid',
    code: `program test(output);
begin
  1: )
end.`,
    purpose: 'ISO 6.8.1: after a label there must be a valid statement',
    expectedError: '',
  },
  {
    name: '6.8.2.2 an assignment-statement missing the assignment operator should report an error',
    code: `program test(output);
var x: integer;
begin
  x 1;
end.`,
    purpose: 'ISO 6.8.2.2: assignment-statement = variable-access := expression',
    expectedError: '',
  },
  {
    name: '6.9.3 an invalid actual-parameter expression of write should report an error',
    code: `program test(output);
begin
  write(1 + );
end.`,
    purpose: 'ISO 6.9.3.1: the expression of a write-parameter must be valid',
    expectedError: '',
  },
  {
    name: '6.9.3.1 a missing expression at the decimal-places position of write should report an error',
    code: `program test(output);
begin
  write(1:2:);
end.`,
    purpose: 'ISO 6.9.3.1: after a write-parameter provides a second colon, there must be an expression',
    expectedError: '',
  },
  {
    name: '6.8.3.4 an invalid condition expression of an if-statement should report an error',
    code: `program test(output);
begin
  if + then writeln(1);
end.`,
    purpose: 'ISO 6.8.3.4: if Boolean-expression then statement',
    expectedError: '',
  },
  {
    name: '6.8.3.4 an invalid then-branch of an if-statement should report an error',
    code: `program test(output);
begin
  if true then )
end.`,
    purpose: 'ISO 6.8.3.4: after then there must be a valid statement',
    expectedError: '',
  },
  {
    name: '6.8.3.4 an invalid else-branch of an if-statement should report an error',
    code: `program test(output);
begin
  if true then writeln(1) else )
end.`,
    purpose: 'ISO 6.8.3.4: after else there must be a valid statement',
    expectedError: '',
  },
  {
    name: '6.8.3.5 an invalid condition expression of a while-statement should report an error',
    code: `program test(output);
begin
  while + do writeln(1);
end.`,
    purpose: 'ISO 6.8.3.5: while Boolean-expression do statement',
    expectedError: '',
  },
  {
    name: '6.8.3.5 an invalid loop body of a while-statement should report an error',
    code: `program test(output);
begin
  while true do )
end.`,
    purpose: 'ISO 6.8.3.5: after do there must be a valid statement',
    expectedError: '',
  },
  {
    name: '6.8.3.6 an invalid statement in the statement-sequence of a repeat-statement should report an error',
    code: `program test(output);
begin
  repeat ) until true;
end.`,
    purpose: 'ISO 6.8.3.6: repeat statement-sequence until Boolean-expression',
    expectedError: '',
  },
  {
    name: '6.8.3.6 adjacent statements in a repeat statement-sequence must be separated by semicolons',
    code: `program test(output);
begin
  repeat writeln(1) writeln(2) until true;
end.`,
    purpose: 'ISO 6.8.3.6: statement-sequence = statement { ; statement }',
    expectedError: '',
  },
  {
    name: '6.8.3.6 an invalid expression after until of repeat should report an error',
    code: `program test(output);
begin
  repeat until + ;
end.`,
    purpose: 'ISO 6.8.3.6: after until there must be a valid Boolean-expression',
    expectedError: '',
  },
  {
    name: '6.8.3.9 the control variable of a for-statement must be an identifier',
    code: `program test(output);
begin
  for 5 := 1 to 2 do writeln(1);
end.`,
    purpose: 'ISO 6.8.3.9: the control variable of a for-statement is a variable-access (identifier)',
    expectedError: '',
  },
  {
    name: '6.8.3.9 an invalid initial-value expression of a for-statement should report an error',
    code: `program test(output);
var i: integer;
begin
  for i := + to 2 do writeln(i);
end.`,
    purpose: 'ISO 6.8.3.9: the initial-value must be a valid expression',
    expectedError: '',
  },
  {
    name: '6.8.3.9 an invalid final-value expression of a for-statement should report an error',
    code: `program test(output);
var i: integer;
begin
  for i := 1 to + do writeln(i);
end.`,
    purpose: 'ISO 6.8.3.9: the final-value must be a valid expression',
    expectedError: '',
  },
  {
    name: '6.8.3.9 an invalid loop body of a for-statement should report an error',
    code: `program test(output);
var i: integer;
begin
  for i := 1 to 2 do )
end.`,
    purpose: 'ISO 6.8.3.9: after do there must be a valid statement',
    expectedError: '',
  },
  {
    name: '6.8.3.7 an invalid selector expression of a case-statement should report an error',
    code: `program test(output);
begin
  case + of
    1: writeln(1);
  end;
end.`,
    purpose: 'ISO 6.8.3.7: case-statement = case case-index of ...',
    expectedError: '',
  },
  {
    name: '6.8.3.7 an invalid case-constant-list of a case should report an error',
    code: `program test(output);
begin
  case 1 of
    : writeln(1);
  end;
end.`,
    purpose: 'ISO 6.8.3.7: case-list-element = case-constant-list : statement',
    expectedError: '',
  },
  {
    name: '6.8.3.7 an invalid statement in a case branch should report an error',
    code: `program test(output);
begin
  case 1 of
    1: )
  end;
end.`,
    purpose: 'ISO 6.8.3.7: after the colon of a case-constant-list there must be a valid statement',
    expectedError: '',
  },
  {
    name: '6.8.2.4 goto must be followed by a label',
    code: `program test(output);
label 1;
begin
  goto ;
  1: writeln(1);
end.`,
    purpose: 'ISO 6.8.2.4: goto-statement = goto label',
    expectedError: '',
  },
  {
    name: '6.8.3.10 an invalid record-variable-list of a with-statement should report an error',
    code: `program test(output);
begin
  with ; do writeln(1);
end.`,
    purpose: 'ISO 6.8.3.10: with record-variable-list do statement',
    expectedError: '',
  },
  {
    name: '6.8.3.10 an invalid body of a with-statement should report an error',
    code: `program test(output);
type r = record x: integer end;
var v: r;
begin
  with v do )
end.`,
    purpose: 'ISO 6.8.3.10: after do there must be a valid statement',
    expectedError: '',
  },
  {
    name: '6.8.3.10 components of a record may be assigned within the body of a with-statement',
    code: `program test(output);
type r = record a: array[1..2] of integer end;
var v: r;
begin
  with v do
  begin
    a[1] := 5;
    a[2] := 6;
  end;
  writeln(v.a[1], v.a[2]);
end.`,
    purpose:
      'ISO 6.8.3.10/6.5.3: within a with body, a field-identifier denotes a component of the record variable, and its component may serve as an assignment target',
    expectedOutput: '56\n',
  },
  {
    name: '6.6.3.1 more actual parameters than formal parameters should report an error',
    code: `program test(output);
procedure q(a: integer);
begin
  writeln(a);
end;
begin
  q(1, 2);
end.`,
    purpose: 'ISO 6.6.3.1: the actual-parameter-list must correspond one-to-one with the formal-parameter-list',
    expectedError: '',
  },
  {
    name:
      '6.8 goto jumps out of an outer loop from an inner loop in one step and executes the statement at the jump target',
    code: `program test(output);
label 97, 98, 99;
var i, j: integer;
begin
  i := 0;
  while i < 5 do
  begin
    i := i + 1;
    j := 0;
    while j < 2 do
    begin
      j := j + 1;
      if i = 2 then goto 97;
    end;
    if i = 3 then goto 98;
    write(i, ' ');
  end;
  write('Y');
  goto 99;
97:
  write('A');
  goto 99;
98:
  write('B');
99:
  writeln('C');
end.`,
    purpose:
      'ISO 6.8.2.4: goto terminates all activations between them and continues at the program point denoted by the tag; the statement at the label must be executed',
    expectedOutput: '1 AC\n',
  },
]

runPascalTests('ISO 7185 6.8 - Statements', tests)
