// ISO/IEC 7185:1990 - 6.6 Procedure and function declarations
//
// Section summary:
//   Specifies the declaration syntax and semantics of procedures and functions. procedure-declaration has the forms "directive + procedure-identification",
//   and "procedure-heading + procedure-block". function-declaration is similar and additionally contains a result-type
//   (which must be a simple-type-identifier or pointer-type-identifier). The identifier in a heading constitutes the point of definition;
//   the identifier corresponding to a forward directive must have exactly one application occurrence within the same procedure-and-function-declaration-part;
//   a procedure/function-identifier is associated with at most one block; a function-block must contain at least one assignment statement with the function-identifier
//   as the assignment target. The parameter section specifies the points of definition and binding rules for the four formal-parameter kinds value/variable/procedural/functional
//   (the actual parameter of a variable parameter must be a variable-access, not the selector of a variant or a component of a packed type), parameter list congruity
//   criteria, and (at the extended level) conformant array parameters and conformability rules. Required procedures are defined by pre- and post-conditions for
//   the file handling procedures rewrite/put/reset/get and read/write, the dynamic allocation procedures new/dispose, and the transfer procedures pack/unpack;
//   required functions define the results and error conditions for arithmetic functions (abs, sqr, sin, cos, exp, ln, sqrt, arctan), transfer functions (trunc, round),
//   ordinal functions (ord, chr, succ, pred), and boolean functions (odd, eof, eoln).
//
// Subsections:
//   6.6.1 Procedure-declarations
//   6.6.2 Function-declarations
//   6.6.3 Parameters
//     6.6.3.1 General
//     6.6.3.2 Value parameters
//     6.6.3.3 Variable parameters
//     6.6.3.4 Procedural parameters
//     6.6.3.5 Functional parameters
//     6.6.3.6 Parameter list congruity
//     6.6.3.7 Conformant array parameters
//     6.6.3.8 Conformability
//   6.6.4 Required procedures and functions
//   6.6.5 Required procedures
//     6.6.5.1 General
//     6.6.5.2 File handling procedures
//     6.6.5.3 Dynamic allocation procedures
//     6.6.5.4 Transfer procedures
//   6.6.6 Required functions
//     6.6.6.1 General
//     6.6.6.2 Arithmetic functions
//     6.6.6.3 Transfer functions
//     6.6.6.4 Ordinal functions
//     6.6.6.5 Boolean functions

import { type PascalTest, runPascalTests } from './harness.ts'

function text(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

const tests: PascalTest[] = [
  // 6.6.1 / 6.6.2 Procedure and function declarations, points of definition, and block association

  {
    name: '6.6 Declaration and call of a parameterless procedure',
    code: `program test(output);
        procedure hello;
        begin writeln('HI'); end;
        begin hello; end.`,
    purpose:
      'ISO 6.6.1: the identifier in a procedure-heading constitutes the point of definition; a procedure call activates its block',
    expectedOutput: 'HI\n',
  },
  {
    name: '6.6 Procedure with value parameters',
    code: `program test(output);
        procedure printn(n: integer);
        begin writeln(n); end;
        begin printn(42); end.`,
    purpose:
      'ISO 6.6.3.2: the current value of the value parameter is assigned to the formal parameter variable upon block activation',
    expectedOutput: '42\n',
  },
  {
    name: '6.6 Procedure with variable parameters',
    code: `program test(output);
        var a: integer;
        procedure incvar(var x: integer);
        begin x := x + 1; end;
        begin a := 5; incvar(a); writeln(a); end.`,
    purpose:
      'ISO 6.6.3.3: a variable parameter references the actual parameter variable; assignments to the formal parameter are reflected in the actual parameter',
    expectedOutput: '6\n',
  },
  {
    name: '6.6 Declaration and call of a parameterless function',
    code: `program test(output);
        function getanswer: integer;
        begin getanswer := 42; end;
        begin writeln(getanswer); end.`,
    purpose:
      'ISO 6.6.2: the function-heading defines the function-identifier; assigning to it within the block yields the function result',
    expectedOutput: '42\n',
  },
  {
    name: '6.6 Function with value parameters and a result',
    code: `program test(output);
        function add(a, b: integer): integer;
        begin add := a + b; end;
        begin writeln(add(5, 3)); end.`,
    purpose:
      'ISO 6.6.2/6.6.3.2: a function call activates the block with actual-parameter expressions; the final value of the function-identifier is the result',
    expectedOutput: '8\n',
  },
  {
    name: '6.6 Nested procedures: the point of definition of a procedure-identifier is its innermost block',
    code: `program test(output);
        procedure outer;
          procedure inner;
          begin writeln('IN'); end;
        begin inner; end;
        begin outer; end.`,
    purpose:
      'ISO 6.6.1: the region of a procedure-identifier is the nearest block containing its declaration, so inner is visible within outer',
    expectedOutput: 'IN\n',
  },
  {
    name: '6.6 Recursive function: the function-identifier is visible within its own block',
    code: `program test(output);
        var r: integer;
        function fact(n: integer): integer;
        begin
          if n <= 1 then fact := 1
          else fact := n * fact(n - 1);
        end;
        begin r := fact(5); writeln(r); end.`,
    purpose: "ISO 6.6.2: the function-identifier can be applied within the function's own block (recursion)",
    expectedOutput: '120\n',
  },
  {
    name: '6.6 A nested function can access the formal parameters of an enclosing function',
    code: `program test(output);
        function outer(x: integer): integer;
          function inner(y: integer): integer;
          begin inner := x + y; end;
        begin outer := inner(10); end;
        begin writeln(outer(5)); end.`,
    purpose:
      'ISO 6.6.3.1: the formal parameters of the enclosing function are variable identifiers of its block and can be referenced by the inner function',
    expectedOutput: '15\n',
  },
  {
    name: '6.6 A forward procedure declaration followed by its definition',
    code: `program test(output);
        procedure p; forward;
        procedure q;
        begin p; end;
        procedure p;
        begin writeln('P'); end;
        begin q; end.`,
    purpose:
      'ISO 6.6.1: the identifier of a forward declaration must have an application in the form of a procedure-identification in the same declaration part (i.e. the subsequent definition)',
    expectedOutput: 'P\n',
  },
  {
    name: '6.6 A forward function declaration followed by its definition',
    code: `program test(output);
        function f(n: integer): integer; forward;
        function g(n: integer): integer;
        begin g := f(n) + 1; end;
        function f(n: integer): integer;
        begin f := n * 2; end;
        begin writeln(g(5)); end.`,
    purpose:
      'ISO 6.6.2: the function-identifier of a forward declaration must have an application in the form of a function-identification in the same declaration part',
    expectedOutput: '11\n',
  },
  {
    name: '6.6 Forward declarations used for mutually recursive procedures',
    code: `program test(output);
        procedure ping(n: integer); forward;
        procedure pong(n: integer);
        begin
          if n > 0 then
          begin writeln('PONG'); ping(n - 1); end;
        end;
        procedure ping(n: integer);
        begin
          if n > 0 then
          begin writeln('PING'); pong(n - 1); end;
        end;
        begin ping(3); end.`,
    purpose: 'ISO 6.6.1: forward enables two procedures to call each other',
    expectedOutput: 'PING\nPONG\nPING\n',
  },
  {
    name: '6.6 A forward-declared identifier lacking a subsequent definition should be an error',
    code: `program test(output);
        procedure p; forward;
        begin
        end.`,
    purpose:
      'ISO 6.6.1: if the identifier corresponding to forward has no procedure-identification application, the standard requirement is violated',
    expectedError: '',
  },
  {
    name: '6.6 Associating the same procedure-identifier with two blocks should be an error',
    code: `program test(output);
        procedure p;
        begin end;
        procedure p;
        begin end;
        begin p; end.`,
    purpose: 'ISO 6.6.1: a procedure-identifier is associated with at most one procedure-block',
    expectedError: '',
  },
  {
    name: '6.6 A function block must contain an assignment statement to the function-identifier',
    code: `program test(output);
        function f: integer;
        begin end;
        begin writeln(f); end.`,
    purpose:
      'ISO 6.6.2: a function-block must contain at least one assignment statement with the function-identifier as the assignment target',
    expectedError: '',
  },

  // 6.6.3.1 Points of definition of formal parameters

  {
    name: '6.6 A formal parameter identifier shadows a like-named variable outside the block',
    code: `program test(output);
        var x: integer;
        procedure testparam(x: integer);
        begin writeln(x); end;
        begin x := 100; testparam(42); end.`,
    purpose:
      'ISO 6.6.3.1: an identifier occurring in a value-parameter-specification constitutes the point of definition of the formal parameter, shadowing the like-named outer variable',
    expectedOutput: '42\n',
  },
  {
    name: '6.6 A formal parameter having the same name as a local variable of its block should be an error',
    code: `program test(output);
        procedure testparam(a: integer);
        var a: integer;
        begin a := 10; writeln(a); end;
        begin testparam(5); end.`,
    purpose:
      'ISO 6.6.3.1: the region of the associated variable-identifier of a formal parameter is the block, so no local variable may be declared with the same name',
    expectedError: '',
  },

  // 6.6.3.2 Value parameters

  {
    name: '6.6 Value parameters are passed by value and do not affect the actual parameter variable',
    code: `program test(output);
        var a: integer;
        procedure testvalue(x: integer);
        begin x := x + 1; end;
        begin a := 10; testvalue(a); writeln(a); end.`,
    purpose:
      'ISO 6.6.3.2: a value parameter and the actual parameter are distinct variables; assigning to the formal parameter does not change the actual parameter',
    expectedOutput: '10\n',
  },
  {
    name: '6.6 The actual parameter of a value parameter may be any expression',
    code: `program test(output);
        procedure printvalue(x: integer);
        begin writeln(x); end;
        begin printvalue(5 + 3 * 2); end.`,
    purpose:
      'ISO 6.6.3.2: the actual parameter of a value parameter must be an expression assignment-compatible with the formal parameter',
    expectedOutput: '11\n',
  },
  {
    name: '6.6 Arrays may be value parameters',
    code: `program test(output);
        type intarray = array[1..3] of integer;
        var a: intarray;
        procedure sum(v: intarray);
        begin writeln(v[1] + v[2] + v[3]); end;
        begin a[1] := 10; a[2] := 20; a[3] := 30; sum(a); end.`,
    purpose:
      'ISO 6.6.3.2: the type of the actual-parameter expression of a value parameter must be assignment-compatible with the formal parameter (structured types likewise)',
    expectedOutput: '60\n',
  },
  {
    name: '6.6 Records may be value parameters',
    code: `program test(output);
        type point = record x, y: integer end;
        var p: point;
        procedure printpoint(v: point);
        begin writeln(v.x); writeln(v.y); end;
        begin p.x := 10; p.y := 20; printpoint(p); end.`,
    purpose: 'ISO 6.6.3.2: a value parameter of record type passes the entire structure by value',
    expectedOutput: '10\n20\n',
  },
  {
    name: '6.6 The type of a value parameter must not be a file type',
    code: `program test(output);
        procedure p(x: text);
        begin end;
        begin p(output); end.`,
    purpose:
      'ISO 6.6.3.2: the type possessed by the formal parameter must be a type permitted as a component type of a file-type; a file type does not satisfy this',
    expectedError: '',
  },

  // 6.6.3.3 Variable parameters

  {
    name:
      '6.6 The actual parameter of a variable parameter must be a variable-access; a constant actual parameter should be an error',
    code: `program test(output);
        procedure testvar(var x: integer);
        begin x := 1; end;
        begin testvar(5); end.`,
    purpose:
      'ISO 6.6.3.3: the actual parameter of a variable parameter must be a variable-access; a constant expression is not a variable-access',
    expectedError: '',
  },
  {
    name: '6.6 Array elements as variable parameters',
    code: `program test(output);
        var arr: array[1..3] of integer;
        procedure setit(var x: integer);
        begin x := 42; end;
        begin arr[2] := 0; setit(arr[2]); writeln(arr[2]); end.`,
    purpose:
      'ISO 6.5.1/6.6.3.3: an indexed-variable is a variable-access and may be a variable parameter, writing back to the original component',
    expectedOutput: '42\n',
  },
  {
    name: '6.6 Record fields as variable parameters',
    code: `program test(output);
        type point = record x, y: integer end;
        var p: point;
        procedure setit(var v: integer);
        begin v := 42; end;
        begin p.x := 0; setit(p.x); writeln(p.x); end.`,
    purpose: 'ISO 6.5.1/6.6.3.3: a field-designator is a variable-access and may be a variable parameter',
    expectedOutput: '42\n',
  },
  {
    name: '6.6 Array elements accessed by a variable index as variable parameters',
    code: `program test(output);
        type point = record x, y: integer end;
        var a: array[1..3] of point;
            i: integer;
        procedure setit(var v: integer);
        begin v := 42; end;
        begin i := 2; a[i].x := 0; setit(a[i].x); writeln(a[i].x); end.`,
    purpose:
      'ISO 6.6.3.3: the variable denoted by an actual parameter is determined when accessed; a runtime index is also valid',
    expectedOutput: '42\n',
  },
  {
    name: '6.6 Variant fields of a variant record may be variable parameters',
    code: `program test(output);
        type kind = (kinda, kindb);
             rec = record
               pad: integer;
               case k: kind of
                 kinda: (x: integer);
                 kindb: (y: integer);
             end;
        var r: rec;
        procedure setit(var v: integer);
        begin v := 42; end;
        begin r.k := kinda; r.x := 0; setit(r.x); writeln(r.x); end.`,
    purpose:
      'ISO 6.6.3.3: only the "selector field of a variant" is prohibited; the component fields of the active variant may still be variable parameters',
    expectedOutput: '42\n',
  },
  {
    name: '6.6 Using the selector field of a variant as a variable parameter should be an error',
    code: `program test(output);
        type kind = (kinda, kindb);
             rec = record
               case k: kind of
                 kinda: (x: integer);
                 kindb: (y: integer);
             end;
        var r: rec;
        procedure setkind(var v: kind);
        begin v := kindb; end;
        begin r.k := kinda; setkind(r.k); end.`,
    purpose: 'ISO 6.6.3.3: the actual-parameter variable must not denote the selector field of a variant part',
    expectedError: '',
  },
  {
    name: '6.6 A component of a packed type as a variable parameter should be an error',
    code: `program test(output);
        var a: packed array[1..3] of char;
        procedure setit(var c: char);
        begin c := 'X'; end;
        begin setit(a[1]); end.`,
    purpose: 'ISO 6.6.3.3: the actual-parameter variable must not denote a component of a variable of packed type',
    expectedError: '',
  },
  {
    name: '6.6 The actual-parameter type of a variable parameter must be the same as the formal-parameter type',
    code: `program test(output);
        type small = 1..10;
        var n: integer;
        procedure setit(var x: small);
        begin x := 5; end;
        begin n := 3; setit(n); end.`,
    purpose:
      "ISO 6.6.3.3: the type possessed by the actual parameter must be the same as the type denoted by the formal parameter's type-identifier (integer and a subrange are not the same type)",
    expectedError: '',
  },
  {
    name: '6.6 Pointer dereference as a variable parameter',
    code: `program test(output);
        type ip = ^integer;
        var p: ip;
        procedure setit(var v: integer);
        begin v := 42; end;
        begin new(p); p^ := 0; setit(p^); writeln(p^); dispose(p); end.`,
    purpose: 'ISO 6.5.1/6.6.3.3: an identified-variable is a variable-access and may be a variable parameter',
    expectedOutput: '42\n',
  },
  {
    name: '6.6 File buffer variables as variable parameters',
    code: `program test(f);
        type r = record x: integer end;
        var f: file of r;
            rec: r;
        procedure setit(var v: r);
        begin v.x := 42; end;
        begin
          rewrite(f);
          rec.x := 0;
          f^ := rec;
          setit(f^);
          put(f);
          reset(f);
          rec := f^;
          writeln(rec.x);
        end.`,
    purpose: 'ISO 6.5.1/6.6.3.3: a buffer-variable is a variable-access and may be a variable parameter',
    textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
    expectedOutput: '42\n',
  },

  // 6.6.3.4 / 6.6.3.5 / 6.6.3.6 Procedural parameters, functional parameters, and parameter list congruity

  {
    name: '6.6 A procedure may be a formal parameter',
    code: `program test(output);
        procedure apply(procedure p);
        begin p; end;
        procedure hello;
        begin writeln('HELLO'); end;
        begin apply(hello); end.`,
    purpose:
      'ISO 6.6.3.4: a formal parameter may be a procedure; the actual parameter is a procedure-identifier with a point of definition',
    expectedOutput: 'HELLO\n',
  },
  {
    name: '6.6 A function may be a formal parameter',
    code: `program test(output);
        function apply(function f(x: integer): integer; y: integer): integer;
        begin apply := f(y); end;
        function dbl(x: integer): integer;
        begin dbl := x * 2; end;
        begin writeln(apply(dbl, 21)); end.`,
    purpose:
      'ISO 6.6.3.5: a formal parameter may be a function, and the result-type must denote the same type as the return type of the actual-parameter function',
    expectedOutput: '42\n',
  },
  {
    name: '6.6 Non-congruous parameter lists of procedural parameters should be an error',
    code: `program test(output);
        procedure apply(procedure p(x: integer));
        begin end;
        procedure noparam;
        begin end;
        begin apply(noparam); end.`,
    purpose: 'ISO 6.6.3.4/6.6.3.6: the two formal-parameter-lists must be congruous, or both must be absent',
    expectedError: '',
  },
  {
    name: '6.6 A procedural formal parameter may be called multiple times within the block',
    code: `program test(output);
        var k: integer;
        procedure twice(procedure p);
        begin p; p; end;
        procedure bump;
        begin k := k + 1; end;
        begin k := 0; twice(bump); writeln(k); end.`,
    purpose:
      'ISO 6.6.3.4: the formal parameter denotes the actual-parameter procedure throughout the activation of the block and may be called multiple times',
    expectedOutput: '2\n',
  },
  {
    name: '6.6 A functional formal parameter without a formal-parameter list',
    code: `program test(output);
        function apply(function f: integer): integer;
        begin apply := f + f; end;
        function seven: integer;
        begin seven := 7; end;
        begin writeln(apply(seven)); end.`,
    purpose:
      'ISO 6.6.3.5: a functional-parameter-section may have no formal-parameter list, and the result types must denote the same type',
    expectedOutput: '14\n',
  },
  {
    name: '6.6 A procedural formal parameter may be forwarded to the next-level formal parameter',
    code: `program test(output);
        procedure outer(procedure p);
          procedure inner(procedure q);
          begin q; end;
        begin inner(p); end;
        procedure hello;
        begin writeln('HI'); end;
        begin outer(hello); end.`,
    purpose:
      'ISO 6.6.3.4: a formal parameter may itself be the actual parameter of another procedural formal parameter (chain passing)',
    expectedOutput: 'HI\n',
  },
  {
    name: '6.6 An actual-parameter procedure accesses variables of its enclosing procedure',
    code: `program test(output);
        procedure home;
          var k: integer;
          procedure bump;
          begin k := k + 1; end;
          procedure call(procedure p);
          begin k := 7; p; writeln(k); end;
        begin call(bump); end;
        begin home; end.`,
    purpose:
      'ISO 6.6.3.4 / 6.2.2.5: the formal parameter denotes the actual-parameter procedure, which accesses the variables of its own enclosing procedure',
    expectedOutput: '8\n',
  },
  {
    name: '6.6 A procedural formal parameter with a variable-parameter section',
    code: `program test(output);
        var a: integer;
        procedure apply(procedure p(var x: integer); var y: integer);
        begin p(y); end;
        procedure bump(var v: integer);
        begin v := v + 1; end;
        begin a := 3; apply(bump, a); writeln(a); end.`,
    purpose:
      'ISO 6.6.3.4 / 6.6.3.6 b: the variable-parameter section must be congruous with the formal-parameter list of the actual-parameter procedure',
    expectedOutput: '4\n',
  },
  {
    name: '6.6 A procedural formal parameter with a value-parameter section',
    code: `program test(output);
        procedure apply(procedure p(x: integer); n: integer);
        begin p(n); end;
        procedure show(x: integer);
        begin writeln(x); end;
        begin apply(show, 9); end.`,
    purpose:
      'ISO 6.6.3.4 / 6.6.3.6 a: the value-parameter section must be congruous with the formal-parameter list of the actual-parameter procedure',
    expectedOutput: '9\n',
  },
  {
    name: '6.6 A procedure with multiple formal parameters each corresponding to one actual parameter',
    code: `program test(output);
        procedure two(procedure p; procedure q);
        begin p; q; end;
        procedure a;
        begin writeln('A'); end;
        procedure b;
        begin writeln('B'); end;
        begin two(a, b); end.`,
    purpose: 'ISO 6.7.3: multiple formal parameters correspond one-to-one with multiple actual parameters',
    expectedOutput: 'A\nB\n',
  },
  {
    name: '6.6 The actual parameter of a procedural formal parameter must be a procedure-identifier',
    code: `program test(output);
        var v: integer;
        procedure apply(procedure p);
        begin p; end;
        begin v := 1; apply(v); end.`,
    purpose:
      'ISO 6.6.3.4: the actual parameter must be a procedure-identifier with a point of definition; a variable does not satisfy this',
    expectedError: '',
  },
  {
    name: '6.6 Built-in procedures may not be actual parameters of procedural formal parameters',
    code: `program test(output);
        procedure apply(procedure p);
        begin p; end;
        begin apply(write); end.`,
    purpose:
      'ISO 6.6.3.4: the actual parameter must have a point of definition contained by the program-block; built-in procedures have no point of definition',
    expectedError: '',
  },
  {
    name:
      '6.6 The result-type of a functional formal parameter must be the same as that of the actual-parameter function',
    code: `program test(output);
        function apply(function f: real): real;
        begin apply := f; end;
        function n: integer;
        begin n := 1; end;
        begin writeln(apply(n)); end.`,
    purpose:
      'ISO 6.6.3.5: the result type of the formal-parameter section must denote the same type as the result type of the actual-parameter function',
    expectedError: '',
  },
  {
    name: '6.6 A function-identifier may not be the actual parameter of a procedural formal parameter',
    code: `program test(output);
        procedure apply(procedure p);
        begin p; end;
        function f: integer;
        begin f := 1; end;
        begin apply(f); end.`,
    purpose:
      'ISO 6.6.3.4: the actual parameter must be a procedure-identifier; a function-identifier does not satisfy this',
    expectedError: '',
  },
  {
    name: '6.6 Different types at corresponding positions in the formal-parameter lists should be an error',
    code: `program test(output);
        procedure apply(procedure p(x: integer));
        begin end;
        procedure q(x: real);
        begin end;
        begin apply(q); end.`,
    purpose:
      'ISO 6.6.3.6 a: the type-identifiers of the value-parameter sections at corresponding positions must denote the same type',
    expectedError: '',
  },
  {
    name: '6.6 Mismatch between a value-parameter section and a variable-parameter section should be an error',
    code: `program test(output);
        procedure apply(procedure p(x: integer));
        begin end;
        procedure q(var x: integer);
        begin end;
        begin apply(q); end.`,
    purpose:
      'ISO 6.6.3.6 a/b: corresponding positions must both be value-parameter sections or both be variable-parameter sections',
    expectedError: '',
  },
  {
    name: '6.6 The actual parameter may be a forward-declared procedure',
    code: `program test(output);
        procedure apply(procedure p);
        begin p; end;
        procedure hello; forward;
        procedure hello;
        begin writeln('F'); end;
        begin apply(hello); end.`,
    purpose:
      'ISO 6.6.3.4 / 6.6.1: forward and its subsequent definition constitute the same point of definition and may be used as an actual parameter',
    expectedOutput: 'F\n',
  },
  {
    name: '6.6 A formal-parameter procedure may be called repeatedly within a loop',
    code: `program test(output);
        var k: integer;
        procedure apply(procedure p; n: integer);
        var j: integer;
        begin for j := 1 to n do p; end;
        procedure bump;
        begin k := k + 1; end;
        begin k := 0; apply(bump, 3); writeln(k); end.`,
    purpose: 'ISO 6.6.3.4: the formal parameter may be called throughout the entire activation period of the block',
    expectedOutput: '3\n',
  },
  {
    name: '6.6 A functional formal parameter may be used multiple times within an expression',
    code: `program test(output);
        function apply(function f: integer): integer;
        begin apply := f * f; end;
        function three: integer;
        begin three := 3; end;
        begin writeln(apply(three) + apply(three)); end.`,
    purpose: 'ISO 6.6.3.5: a formal-parameter function may appear in an expression as a factor',
    expectedOutput: '18\n',
  },
  {
    name: '6.6 A formal parameter identifier shadows a like-named outer procedure',
    code: `program test(output);
        procedure p;
        begin writeln('GLOBAL'); end;
        procedure apply(procedure p);
        begin p; end;
        begin apply(p); end.`,
    purpose:
      'ISO 6.6.3.4 / 6.2.2.5: the formal parameter denotes the actual-parameter procedure within its block; the actual parameter may be the like-named outer procedure',
    expectedOutput: 'GLOBAL\n',
  },
  {
    name: '6.6 Duplicate formal-parameter identifier and procedure name in the same region should be an error',
    code: `program test(output);
        procedure apply(procedure p);
          procedure p;
          begin end;
        begin end;
        begin end.`,
    purpose:
      'ISO 6.2.2.7: a formal-parameter identifier and a procedure-identifier in the same region must not both have points of definition',
    expectedError: '',
  },
  {
    name: '6.6 After rewrite(f), f.M is Generation and sequential writes are possible',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN REWRITE(F);WRITELN(F,'HELLO');END.`,
    purpose:
      'ISO 6.6.5.2: the postcondition of rewrite(f) is f.L=f.R=S(), f.M=Generation, and f^ is completely undefined',
    textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
    expectedFileContains: [{ url: 'F', contains: 'HELLO' }],
  },
  {
    name: '6.6 put(f) appends the buffer contents to the file',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;V:CHAR;BEGIN REWRITE(F);V:='A';F^:=V;PUT(F);END.`,
    purpose:
      'ISO 6.6.5.2: the postcondition of put(f) is f.L=f0.L~S(f0^), f.M=Generation, and f^ is completely undefined',
    textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
    expectedFileContains: [{ url: 'F', contains: 'A' }],
  },
  {
    name: '6.6 put without rewrite violates the precondition and should be an error',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN F^:='A';PUT(F);END.`,
    purpose: 'ISO 6.6.5.2: the precondition of put(f) requires f0.M=Generation; otherwise it is an error',
    textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
    expectedError: '',
    maxSteps: 1000,
  },
  {
    name: '6.6 After reset(f), f^ points to the first component',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;CH:CHAR;BEGIN RESET(F);CH:=F^;WRITE(CH);END.`,
    purpose: 'ISO 6.6.5.2: the postcondition of reset(f) is f.M=Inspection and f^=f.R.first (when f.R is non-empty)',
    textFiles: new Map<string, Uint8Array>([['F', text('AB')]]),
    expectedOutput: 'A',
  },
  {
    name: '6.6 After reset on an empty file, eof is true',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);IF EOF(F)THEN WRITE('EMPTY')ELSE WRITE('FULL');END.`,
    purpose: 'ISO 6.6.5.2/6.6.6.5: after reset(f), f.R=S(), so eof(f) is true',
    textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
    expectedOutput: 'EMPTY',
  },
  {
    name: '6.6 get(f) advances f^ to the next component',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;CH:CHAR;BEGIN RESET(F);GET(F);CH:=F^;WRITE(CH);END.`,
    purpose: 'ISO 6.6.5.2: the postcondition of get(f) is f.R=f0.R.rest and f^=f.R.first',
    textFiles: new Map<string, Uint8Array>([['F', text('AB')]]),
    expectedOutput: 'B',
  },
  {
    name: '6.6 get when f.R is empty violates the precondition and should be an error',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);GET(F);GET(F);GET(F);END.`,
    purpose: 'ISO 6.6.5.2: the precondition of get(f) requires f0.R<>S(); a get after reaching end-of-file is an error',
    textFiles: new Map<string, Uint8Array>([['F', text('AB')]]),
    expectedError: '',
    maxSteps: 1000,
  },
  {
    name: '6.6 write/read on a non-text file is equivalent to f^ assignment and get',
    code: `program test(output);
        var f: file of integer;
            v: integer;
        begin
          rewrite(f);
          write(f, 42);
          reset(f);
          read(f, v);
          writeln(v);
        end.`,
    purpose:
      'ISO 6.6.5.2: on a non-text file, read(f,v) is equivalent to v:=f^; get(f), and write(f,e) is equivalent to f^:=e; put(f)',
    expectedOutput: '42\n',
  },
  {
    name: '6.6 f^ buffer variable and put/get for file of record',
    code: `program test(output);
type r = record a: integer; b: char end;
var f: file of r;
    x, y: r;
begin
  rewrite(f);
  x.a := 7;
  x.b := 'Z';
  f^ := x;
  put(f);
  reset(f);
  if eof(f) then writeln('EMPTY') else writeln('HAS');
  y := f^;
  writeln(y.a, y.b);
  get(f);
  if eof(f) then writeln('DONE') else writeln('MORE');
end.`,
    purpose:
      'ISO 6.6.5.2/6.5.5: for a file whose components are records, f^ is a buffer variable of that type; f^:=x makes the buffer variable take the value of x, put(f) appends f^ as a new component of f.L, after reset f^ is f.R.first, and get(f) sets f.R=f.R.rest',
    expectedOutput: 'HAS\n7Z\nDONE\n',
  },
  {
    name: '6.6 Byte-by-byte write/read for file of single-byte subrange',
    code: `program test(output);
var f: packed file of 0..255;
    b: 0..255;
    n: integer;
begin
  rewrite(f);
  write(f, 65);
  write(f, 66);
  reset(f);
  read(f, b);
  n := b;
  writeln(n);
  n := f^;
  writeln(n);
  get(f);
  if eof(f) then writeln('EOF') else writeln('MORE');
end.`,
    purpose:
      'ISO 6.6.5.3/6.6.5.2: on a non-text file, write(f,e) is equivalent to f^:=e; put(f) and read(f,v) is equivalent to v:=f^; get(f); a get after read makes f.R empty, so eof is true',
    expectedOutput: '65\n66\nEOF\n',
  },
  {
    name: '6.6 f^ assignment followed by put(f) on file of integer',
    code: `program test(output);
var f: file of integer;
    v: integer;
begin
  rewrite(f);
  f^ := 42;
  put(f);
  reset(f);
  read(f, v);
  writeln(v);
end.`,
    purpose:
      'ISO 6.6.5.2: f^:=e and put(f) make e a new component of the file; after reset, read(f,v) retrieves the same value (the encoding of f^ is implementation-defined)',
    expectedOutput: '42\n',
  },
  {
    name: '6.6.5.2 reset accepts only one file-variable actual parameter',
    code: `program test(output);
var f: text;
begin
  reset(f, 'NAME');
end.`,
    purpose: 'ISO 6.6.5.2: reset(f) takes only one file-variable actual parameter; file-name is not the ISO form',
    expectedError: '',
  },
  {
    name: '6.6 File variables in the program parameter list are bound to external files before the algorithm starts',
    code: `program test(output, f);
var f: text;
begin
  rewrite(f);
  writeln(f, 'DATA');
end.`,
    purpose:
      'ISO 6.10: file variables in the program-parameter-list must be bound to external files before the algorithm starts; the binding mechanism is implementation-defined',
    programFileUrls: { f: 'MYFILE' },
    expectedFileContains: [{ url: 'f', contains: 'DATA' }],
  },
  {
    name: '6.6.3.1 A formal-parameter list may contain multiple parameter-sections separated by semicolons',
    code: `program test(output);
procedure p(a: integer; b: char);
begin
  writeln(a, b);
end;
begin
  p(1, 'x');
end.`,
    purpose: 'ISO 6.6.3.1: formal-parameter-list = ( formal-parameter-section {; formal-parameter-section} )',
    expectedOutput: '1x\n',
  },
  {
    name: '6.6.3.1 A formal-parameter list missing the closing parenthesis should be an error',
    code: 'program test; procedure p(a: integer; begin end; begin end.',
    purpose: 'ISO 6.6.3.1: a formal-parameter-list ends with a closing parenthesis',
    expectedError: '',
  },
  {
    name: '6.6.3.2 Missing colon after the formal-parameter name list should be an error',
    code: 'program test; procedure p(a integer); begin end; begin end.',
    purpose: 'ISO 6.6.3.1: a formal-parameter-section has the form identifier-list : type-denoter etc.',
    expectedError: '',
  },
  {
    name: '6.6.1 Missing semicolon after the procedure heading should be an error',
    code: 'program test; procedure p begin end; begin end.',
    purpose: 'ISO 6.6.1: after the heading of a procedure-declaration comes a semicolon and a procedure-block',
    expectedError: '',
  },
  {
    name: '6.6.1 The same procedure-identifier may not have two forward declarations',
    code: `program test;
procedure p; forward;
procedure p; forward;
procedure p; begin end;
begin end.`,
    purpose:
      'ISO 6.6.1: the identifier corresponding to a forward directive must have exactly one application occurrence within the same declaration part',
    expectedError: '',
  },
  {
    name: '6.6.1 A forward may not appear after an identifier that already has a procedure body',
    code: `program test;
procedure p; begin end;
procedure p; forward;
begin end.`,
    purpose:
      'ISO 6.6.1: an identifier is associated with at most one procedure-block; a forward declaration must precede its definition',
    expectedError: '',
  },
  {
    name: '6.6.3.4 A procedural formal parameter may not be used in an expression',
    code: `program test;
procedure p(procedure r);
var x: integer;
begin
  x := r + 1;
end;
begin end.`,
    purpose:
      'ISO 6.6.3.4: a procedural formal-parameter identifier may only be used as a procedure statement and may not appear in an expression',
    expectedError: '',
  },
  {
    name: '6.6.3.4 A procedural formal parameter may not be used as a function call',
    code: `program test;
procedure p(procedure r(n: integer));
var x: integer;
begin
  x := r(1);
end;
begin end.`,
    purpose: 'ISO 6.6.3.4: a procedural formal parameter may not be used as a function designator in an expression',
    expectedError: '',
  },
  {
    name: '6.6.3.5 The number of actual parameters of a functional formal parameter must match its heading',
    code: `program test;
function g(a: integer): integer;
begin g := a; end;
procedure p(function f(a: integer): integer);
var x: integer;
begin
  x := f(1, 2);
end;
begin p(g); end.`,
    purpose:
      'ISO 6.6.3.5/6.7.3: an application of a functional formal parameter must supply an actual-parameter list compatible with the formal-parameter list of its heading',
    expectedError: '',
  },
  {
    name: '6.6.3.5 The actual parameter of a callable formal parameter must be a procedure/function identifier',
    code: `program test;
function g(a: integer): integer;
begin g := a; end;
procedure p(function f(a: integer): integer);
begin end;
begin p(g(1)); end.`,
    purpose:
      'ISO 6.6.3.5/6.6.3.4: the actual parameter corresponding to a callable formal parameter must be an identifier of the corresponding type, not the result of a function call',
    expectedError: '',
  },
  {
    name:
      '6.6.3.6 The actual parameter of a callable formal parameter must be congruous with the formal-parameter list (same count)',
    code: `program test;
function g(a: integer): integer;
begin g := a; end;
procedure p(function f(a: integer; b: integer): integer);
begin end;
begin p(g); end.`,
    purpose: 'ISO 6.6.3.6: two formal-parameter-lists being congruous requires the same count',
    expectedError: '',
  },
  {
    name:
      '6.6.3.6 The actual parameter of a callable formal parameter must be congruous with the formal-parameter list (same var attribute)',
    code: `program test;
function g(a: integer): integer;
begin g := a; end;
procedure p(function f(var a: integer): integer);
begin end;
begin p(g); end.`,
    purpose:
      'ISO 6.6.3.6: corresponding sections must both be value-parameter sections or both be variable-parameter sections',
    expectedError: '',
  },
  {
    name:
      '6.6.3.6 The actual parameter of a callable formal parameter must be congruous with the formal-parameter list (same type)',
    code: `program test;
function g(a: integer): integer;
begin g := a; end;
procedure p(function f(a: char): integer);
begin end;
begin p(g); end.`,
    purpose: 'ISO 6.6.3.6: the formal-parameter types at corresponding positions must denote the same type',
    expectedError: '',
  },
  {
    name: '6.6.3.5 The actual parameter corresponding to a functional formal parameter must be a function-identifier',
    code: `program test;
procedure q;
begin end;
procedure p(function f: integer);
begin end;
begin p(q); end.`,
    purpose:
      'ISO 6.6.3.5: the actual parameter corresponding to a functional formal parameter must be a function-identifier (procedure and function are not interchangeable)',
    expectedError: '',
  },
  {
    name: '6.6.3.3 A variable parameter may be passed further as a variable parameter along the call chain',
    code: `program test(output);
var g: integer;
procedure b(var y: integer);
begin
  y := y + 1;
end;
procedure a(var x: integer);
begin
  b(x);
end;
begin
  g := 1;
  a(g);
  writeln(g);
end.`,
    purpose:
      'ISO 6.6.3.3: a variable parameter denotes the actual-parameter variable itself; assignments along the passing chain are visible to the original actual parameter',
    expectedOutput: '2\n',
  },
  {
    name:
      '6.6.3.3 A value parameter is a variable within its block and may be the actual parameter of a variable parameter',
    code: `program test(output);
var g: integer;
procedure b(var y: integer);
begin
  y := 9;
end;
procedure a(z: integer);
begin
  b(z);
  writeln(z);
end;
begin
  g := 1;
  a(g);
  writeln(g);
end.`,
    purpose:
      "ISO 6.6.3.3/6.6.3.2: a value parameter is a local variable; modifications via address-taking do not affect the caller's actual-parameter variable",
    expectedOutput: '9\n1\n',
  },
  {
    name: '6.6.3.2 A record with pointer components is passed by value as a value parameter',
    code: `program test(output);
type node = record v: integer; next: ^node end;
var p: node;
procedure modify(r: node);
begin
  r.v := 99;
  r.next^.v := 7;
end;
begin
  new(p.next);
  p.v := 1;
  p.next^.v := 2;
  modify(p);
  writeln(p.v);
  writeln(p.next^.v);
  dispose(p.next);
end.`,
    purpose:
      'ISO 6.6.3.2/6.4.4: a value parameter is passed by assignment; the record is copied as a whole, so modifications to ordinary fields do not affect the caller, while pointer components copy the identifying-value, so modifications to the pointed variables are visible',
    expectedOutput: '1\n7\n',
  },
  {
    name:
      '6.6.3.2 An array as a value parameter: assignments to formal-parameter elements do not affect the actual parameter',
    code: `program test(output);
type intarray = array[1..3] of integer;
var a: intarray;
procedure modify(v: intarray);
begin
  v[1] := 99;
  v[2] := 98;
  v[3] := 97;
end;
begin
  a[1] := 10;
  a[2] := 20;
  a[3] := 30;
  modify(a);
  writeln(a[1]);
  writeln(a[2]);
  writeln(a[3]);
end.`,
    purpose:
      'ISO 6.6.3.2: an array value parameter is passed by assignment; the array is copied as a whole, so assignments to formal-parameter elements do not affect the actual parameter',
    expectedOutput: '10\n20\n30\n',
  },
  {
    name: '6.6.3.2 An array with pointer components is passed by value as a value parameter',
    code: `program test(output);
type intptr = ^integer;
     ptrarray = array[1..2] of intptr;
var a: ptrarray;
procedure modify(v: ptrarray);
begin
  v[1] := nil;
  v[2]^ := 77;
end;
begin
  new(a[1]);
  a[1]^ := 1;
  new(a[2]);
  a[2]^ := 2;
  modify(a);
  writeln(a[1] <> nil);
  writeln(a[2]^);
  dispose(a[1]);
  dispose(a[2]);
end.`,
    purpose:
      'ISO 6.6.3.2/6.4.4: an array value parameter is copied as a whole, so assigning nil to a formal-parameter element does not affect the actual parameter; while the pointer components in the elements copy the identifying-value, so modifications to the pointed variables are visible',
    expectedOutput: 'TRUE\n77\n',
  },
  {
    name: '6.6.6.2 Required functions must be given the prescribed number of actual parameters',
    code: `program test;
var x: integer;
begin
  x := abs();
end.`,
    purpose:
      'ISO 6.6.6.1/6.6.6.2: required functions such as abs must be given the number of actual parameters consistent with their definition',
    expectedError: '',
  },
  {
    name: '6.6.3.3 The actual parameter of a variable parameter may denote an array component in a record field',
    code: `program test(output);
type r = record a: array[1..2] of integer end;
var v: r;
procedure setIt(var x: integer);
begin
  x := 9;
end;
begin
  setIt(v.a[2]);
  writeln(v.a[2]);
end.`,
    purpose:
      'ISO 6.6.3.3/6.5.3: the actual parameter of a variable parameter must be a variable-access; it is legal when the component is not a component of a packed variable',
    expectedOutput: '9\n',
  },
  {
    name: '6.6.3.4 A procedural formal parameter may not be the actual parameter of a functional formal parameter',
    code: `program test;
procedure outer(procedure f);
  procedure inner(function g: integer);
  begin end;
begin
  inner(f);
end;
begin end.`,
    purpose:
      'ISO 6.6.3.4/6.6.3.5: when a callable formal parameter is the actual parameter of another callable formal parameter, its kind must match that of the target formal parameter',
    expectedError: '',
  },
  {
    name: '6.6.3.5 The result types must denote the same type when functional formal parameters are chained',
    code: `program test;
procedure outer(function f: real);
  procedure inner(function g: integer);
  begin end;
begin
  inner(f);
end;
begin end.`,
    purpose: 'ISO 6.6.3.5: the result types of the two function-identifiers must denote the same type',
    expectedError: '',
  },
  {
    name: '6.6.3.6 The formal-parameter lists must be congruous when callable formal parameters are chained (count)',
    code: `program test;
procedure outer(function f(a: integer): integer);
  procedure inner(function g(a: integer; b: integer): integer);
  begin end;
begin
  inner(f);
end;
begin end.`,
    purpose: 'ISO 6.6.3.6: two formal-parameter-lists being congruous requires the same count',
    expectedError: '',
  },
  {
    name:
      '6.6.3.6 The formal-parameter lists must be congruous when callable formal parameters are chained (var attribute)',
    code: `program test;
procedure outer(function f(a: integer): integer);
  procedure inner(function g(var a: integer): integer);
  begin end;
begin
  inner(f);
end;
begin end.`,
    purpose:
      'ISO 6.6.3.6: corresponding sections must both be value-parameter sections or both be variable-parameter sections',
    expectedError: '',
  },
  {
    name: '6.6.3.6 The formal-parameter lists must be congruous when callable formal parameters are chained (type)',
    code: `program test;
procedure outer(function f(a: integer): integer);
  procedure inner(function g(a: char): integer);
  begin end;
begin
  inner(f);
end;
begin end.`,
    purpose: 'ISO 6.6.3.6: the formal-parameter types at corresponding positions must denote the same type',
    expectedError: '',
  },
  {
    name: '6.6.5.2 put on file of record in the Inspection state violates the precondition',
    code: `program test;
type r = record a: integer end;
var f: file of r;
begin
  reset(f);
  put(f);
end.`,
    purpose: 'ISO 6.6.5.2: the precondition of put(f) requires f.M = Generation',
    expectedError: '',
  },
  {
    name: '6.6.5.2 get on file of record when f.R is empty violates the precondition and should be an error',
    code: `program test;
type r = record a: integer end;
var f: file of r;
begin
  rewrite(f);
  reset(f);
  get(f);
end.`,
    purpose:
      'ISO 6.6.5.2: the precondition of get(f) is not eof(f); this also applies to files whose component type is record',
    expectedError: '',
  },
  {
    name: '6.6.5.2 Assigning to f^ in the Inspection state violates the precondition and should be an error',
    code: `program test;
type r = record a: integer end;
var f: file of r;
    x: r;
begin
  rewrite(f);
  x.a := 1;
  f^ := x;
  put(f);
  reset(f);
  f^ := x;
end.`,
    purpose:
      'ISO 6.6.5.2: the preconditions for assigning to f^ and for put(f) require f.M = Generation; after reset the file is in the Inspection state',
    expectedError: '',
  },
  {
    name: '6.6.5.2 f^ assignment and put on a single-byte-component file',
    code: `program test(output);
var f: packed file of 0..255;
    n: 0..255;
begin
  rewrite(f);
  f^ := 42;
  put(f);
  reset(f);
  n := f^;
  writeln(n);
end.`,
    purpose:
      'ISO 6.6.5.2: f^ is a buffer variable; after assigning to f^, put(f) makes it a new component of f.L, and after reset f^ is that component',
    expectedOutput: '42\n',
  },
  {
    name: '6.6.5.2 Write/read round-trip for file of enumerated type',
    code: `program test(output);
type color = (red, green, blue);
var f: file of color;
    c: color;
begin
  rewrite(f);
  write(f, green);
  reset(f);
  read(f, c);
  if c = green then writeln('green');
end.`,
    purpose:
      'ISO 6.4.3.5/6.6.5.3: the component type of a file-type may be an enumerated type; write/read is equivalent to f^ assignment and get',
    expectedOutput: 'green\n',
  },
  {
    name: '6.6.3.4 A procedural-parameter specification missing an identifier should be an error',
    code: 'program test; procedure p(procedure ); begin end; begin end.',
    purpose: 'ISO 6.6.3.4: procedural-parameter-specification = procedure-heading; an identifier must be given',
    expectedError: '',
  },
  {
    name: '6.6.3.4 An invalid formal-parameter list in a procedural-parameter specification should be an error',
    code: 'program test; procedure p(procedure r(1)); begin end; begin end.',
    purpose: 'ISO 6.6.3.4: the formal-parameter-list in the heading of a procedural formal parameter must be valid',
    expectedError: '',
  },
  {
    name: '6.6.3.5 A functional-parameter specification missing an identifier should be an error',
    code: 'program test; procedure p(function : integer); begin end; begin end.',
    purpose: 'ISO 6.6.3.5: functional-parameter-specification = function-heading; an identifier must be given',
    expectedError: '',
  },
  {
    name: '6.6.3.5 An invalid formal-parameter list in a functional-parameter specification should be an error',
    code: 'program test; procedure p(function f(1): integer); begin end; begin end.',
    purpose: 'ISO 6.6.3.5: the formal-parameter-list in the heading of a functional formal parameter must be valid',
    expectedError: '',
  },
  {
    name: '6.6.3.5 A functional-parameter specification missing the result type should be an error',
    code: 'program test; procedure p(function f integer); begin end; begin end.',
    purpose: 'ISO 6.6.3.5: function-heading = function identifier [ formal-parameter-list ] : result-type',
    expectedError: '',
  },
  {
    name: '6.6.3.5 An invalid result type in a functional-parameter specification should be an error',
    code: 'program test; procedure p(function f: ); begin end; begin end.',
    purpose: 'ISO 6.6.3.5: result-type must be a valid type-denoter',
    expectedError: '',
  },
  {
    name: '6.6.3.1 An invalid type-denoter of a formal parameter should be an error',
    code: 'program test; procedure p(a: ); begin end; begin end.',
    purpose: 'ISO 6.6.3.1: the type-denoter of a formal-parameter-section must be valid',
    expectedError: '',
  },
  {
    name: '6.6.1 An invalid identifier in a procedure declaration should be an error',
    code: 'program test; procedure 5; begin end; begin end.',
    purpose: 'ISO 6.6.1: procedure-heading = procedure identifier ...',
    expectedError: '',
  },
  {
    name: '6.6.1 A semicolon must follow the forward directive',
    code: 'program test; procedure p; forward begin end; begin end.',
    purpose: 'ISO 6.6.1: forward-directive = forward; it ends with a semicolon',
    expectedError: '',
  },
  {
    name: '6.6.1 An invalid block in a procedure declaration should be an error',
    code: `program test;
procedure p;
begin`,
    purpose: 'ISO 6.6.1: a procedure-declaration must contain a valid procedure-block',
    expectedError: '',
  },
  {
    name: '6.6.2 An invalid identifier in a function declaration should be an error',
    code: 'program test; function 5: integer; begin end; begin end.',
    purpose: 'ISO 6.6.2: function-heading = function identifier ...',
    expectedError: '',
  },
  {
    name: '6.6.2 An invalid formal-parameter list of a function should be an error',
    code: 'program test; function f(1): integer; begin end; begin end.',
    purpose: 'ISO 6.6.2: the formal-parameter-list in a function-heading must be valid',
    expectedError: '',
  },
  {
    name: '6.6.2 A function declaration missing the result type should be an error',
    code: 'program test; function f integer; begin end; begin end.',
    purpose: 'ISO 6.6.2: a function declaration must give a result-type',
    expectedError: '',
  },
  {
    name: '6.6.2 An invalid result type of a function should be an error',
    code: 'program test; function f: ; begin end; begin end.',
    purpose: 'ISO 6.6.2: result-type must be a valid type-denoter',
    expectedError: '',
  },
  {
    name: '6.6.2 A semicolon must follow the function heading',
    code: 'program test; function f: integer begin end; begin end.',
    purpose: 'ISO 6.6.2: after the function-heading comes a semicolon and a block',
    expectedError: '',
  },
  {
    name: '6.6.2 A semicolon must follow the function forward directive',
    code: 'program test; function f: integer; forward begin end; begin end.',
    purpose: 'ISO 6.6.2: the forward-directive of a function declaration ends with a semicolon',
    expectedError: '',
  },
  {
    name: '6.6.2 An invalid block in a function declaration should be an error',
    code: `program test;
function f: integer;
begin`,
    purpose: 'ISO 6.6.2: a function-declaration must contain a valid function-block',
    expectedError: '',
  },

  // 6.6.5.3 Dynamic allocation procedures

  {
    name: '6.6 A new variable created by new can be read and written',
    code: `PROGRAM TEST(OUTPUT);TYPE IPTR=^INTEGER;VAR P:IPTR;BEGIN NEW(P);P^:=42;WRITE(P^);DISPOSE(P);END.`,
    purpose:
      'ISO 6.6.5.3: new(p) creates a new variable and a new identifying-value of that pointer type, and assigns them to p',
    expectedOutput: '42',
  },
  {
    name: '6.6 After new, the pointer is no longer nil',
    code:
      `PROGRAM TEST(OUTPUT);TYPE IPTR=^INTEGER;VAR P:IPTR;BEGIN NEW(P);IF P<>NIL THEN WRITE('NOTNIL')ELSE WRITE('NIL');DISPOSE(P);END.`,
    purpose: 'ISO 6.6.5.3/6.4.4: the identifying-value created by new differs from the nil-value',
    expectedOutput: 'NOTNIL',
  },
  {
    name: '6.6 new may be used for record types',
    code:
      `PROGRAM TEST(OUTPUT);TYPE RPTR=^REC;REC=RECORD X:INTEGER;Y:INTEGER END;VAR P:RPTR;BEGIN NEW(P);P^.X:=10;P^.Y:=20;WRITE(P^.X+P^.Y);DISPOSE(P);END.`,
    purpose: "ISO 6.6.5.3: the new variable has the type of the pointer type's domain-type",
    expectedOutput: '30',
  },
  {
    name: '6.6 Dereferencing a nil (or undefined) pointer should be an error',
    code: `PROGRAM TEST(OUTPUT);TYPE IPTR=^INTEGER;VAR P:IPTR;BEGIN P^:=42;END.`,
    purpose: 'ISO 6.5.4: an identified-variable is an error when its pointer-variable is nil or undefined',
    expectedError: '',
    maxSteps: 1000,
  },
  {
    name: '6.6 dispose on an uninitialized (nil) pointer should be an error',
    code: `PROGRAM TEST(OUTPUT);TYPE IPTR=^INTEGER;VAR P:IPTR;BEGIN DISPOSE(P);END.`,
    purpose: 'ISO 6.6.5.3: if q has the nil-value or is undefined, dispose(q) is an error',
    expectedError: '',
    maxSteps: 1000,
  },
  {
    name: '6.6 Accessing the pointed variable after dispose should be an error',
    code: `PROGRAM TEST(OUTPUT);TYPE IPTR=^INTEGER;VAR P:IPTR;BEGIN NEW(P);DISPOSE(P);P^:=42;END.`,
    purpose:
      'ISO 6.6.5.3/6.5.4: after the identifying-value is removed, the variable pointed to by that pointer variable is inaccessible',
    expectedError: '',
    maxSteps: 1000,
  },

  // 6.6.5.4 Transfer procedures (pack / unpack)

  {
    name: '6.6 pack moves consecutive components of a non-packed array into a packed array',
    code: `program test(output);
        var a: array[1..5] of integer;
            z: packed array[1..3] of integer;
        begin
          a[1] := 10; a[2] := 20; a[3] := 30; a[4] := 40; a[5] := 50;
          pack(a, 2, z);
          writeln(z[1]); writeln(z[2]); writeln(z[3]);
        end.`,
    purpose: 'ISO 6.6.5.4: pack(a,i,z) is equivalent to z[j]:=a[k], with k increasing with j starting from i',
    expectedOutput: '20\n30\n40\n',
  },
  {
    name: '6.6 unpack moves the components of a packed array back into a non-packed array',
    code: `program test(output);
        var a: array[1..5] of integer;
            z: packed array[1..3] of integer;
        begin
          z[1] := 1; z[2] := 2; z[3] := 3;
          unpack(z, a, 2);
          writeln(a[2]); writeln(a[3]); writeln(a[4]);
        end.`,
    purpose: 'ISO 6.6.5.4: unpack(z,a,i) is equivalent to a[k]:=z[j], with k increasing with j starting from i',
    expectedOutput: '1\n2\n3\n',
  },

  // 6.6.6.2 Arithmetic functions

  {
    name: '6.6 abs returns the absolute value of the same type for integer arguments',
    code: `PROGRAM TEST(OUTPUT);VAR X:INTEGER;BEGIN X:=-5;WRITE(ABS(X));END.`,
    purpose: 'ISO 6.6.6.2: the result type of abs(x) is the same as the argument, and the value is the absolute value',
    expectedOutput: '5',
  },
  {
    name: '6.6 abs returns the absolute value for real arguments',
    code: `PROGRAM TEST(OUTPUT);VAR X:REAL;BEGIN X:=-3.5;WRITE(TRUNC(ABS(X)*10));END.`,
    purpose:
      'ISO 6.6.6.2: abs returns real for real arguments; trunc is used to convert to integer to avoid depending on the real output format',
    expectedOutput: '35',
  },
  {
    name: '6.6 sqr returns the square for integer arguments',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(SQR(7));END.`,
    purpose: 'ISO 6.6.6.2: sqr(7)=49; the result type is the same as the argument (integer)',
    expectedOutput: '49',
  },
  {
    name: '6.6 sqr returns the square for real arguments',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(TRUNC(SQR(1.5)*100));END.`,
    purpose: 'ISO 6.6.6.2: sqr(1.5)=2.25; trunc is used to convert to integer for comparison',
    expectedOutput: '225',
  },
  {
    name: '6.6 sqrt returns the non-negative square root',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(SQRT(4.0)));END.`,
    purpose: 'ISO 6.6.6.2: sqrt(x) is the non-negative square root of x; the result is always of real-type',
    expectedOutput: '2',
  },
  {
    name: '6.6 sqrt on a negative argument should be an error',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(SQRT(-1.0));END.`,
    purpose: 'ISO 6.6.6.2: when x is negative there is no non-negative square root, so it is an error',
    expectedError: '',
    maxSteps: 1000,
  },
  {
    name: '6.6 ln returns the natural logarithm',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(LN(1.0)));END.`,
    purpose: 'ISO 6.6.6.2: ln(x) is the natural logarithm of x (x>0); ln(1)=0',
    expectedOutput: '0',
  },
  {
    name: '6.6 ln on a non-positive argument should be an error',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(LN(0.0));END.`,
    purpose: 'ISO 6.6.6.2: when x is not greater than zero, ln(x) is an error',
    expectedError: '',
    maxSteps: 1000,
  },
  {
    name: '6.6 exp returns the power of the base of the natural logarithm',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(EXP(0.0)));END.`,
    purpose: 'ISO 6.6.6.2: exp(x) is the x-th power of e, the base of the natural logarithm; exp(0)=1',
    expectedOutput: '1',
  },
  {
    name: '6.6 sin returns the sine value',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(SIN(0.0)));END.`,
    purpose: 'ISO 6.6.6.2: sin(x) is the sine of the radian x; sin(0)=0',
    expectedOutput: '0',
  },
  {
    name: '6.6 cos returns the cosine value',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(COS(0.0)));END.`,
    purpose: 'ISO 6.6.6.2: cos(x) is the cosine of the radian x; cos(0)=1',
    expectedOutput: '1',
  },
  {
    name: '6.6 arctan returns the principal value of the arctangent',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(ARCTAN(0.0)));END.`,
    purpose: 'ISO 6.6.6.2: arctan(x) is the principal value of the arctangent of x (in radians); arctan(0)=0',
    expectedOutput: '0',
  },

  // 6.6.6.3 Transfer functions

  {
    name: '6.6 trunc truncates a positive real number',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(TRUNC(3.7));END.`,
    purpose: 'ISO 6.6.6.3: when x>=0, 0<=x-trunc(x)<1',
    expectedOutput: '3',
  },
  {
    name: '6.6 trunc truncates a negative real number',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(TRUNC(-3.7));END.`,
    purpose: 'ISO 6.6.6.3: when x<0, -1<x-trunc(x)<=0',
    expectedOutput: '-3',
  },
  {
    name: '6.6 round rounds positive numbers as trunc(x+0.5)',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(3.5));END.`,
    purpose: 'ISO 6.6.6.3: when x>=0, round(x) is equivalent to trunc(x+0.5); round(3.5)=4',
    expectedOutput: '4',
  },
  {
    name: '6.6 round rounds negative numbers as trunc(x-0.5)',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(-3.5));END.`,
    purpose: 'ISO 6.6.6.3: when x<0, round(x) is equivalent to trunc(x-0.5); round(-3.5)=-4',
    expectedOutput: '-4',
  },

  // 6.6.6.4 Ordinal functions

  {
    name: '6.6 ord returns 0 and 1 for boolean values',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ORD(FALSE));WRITE(ORD(TRUE));END.`,
    purpose: 'ISO 6.4.2.2: the ordinal numbers of false and true are 0 and 1 respectively',
    expectedOutput: '01',
  },
  {
    name: '6.6 ord returns the integer itself for integers',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ORD(42));END.`,
    purpose: 'ISO 6.4.2.2: the ordinal number of a value of integer-type is the value itself',
    expectedOutput: '42',
  },
  {
    name: '6.6 chr and ord are inverse operations of each other',
    code: `PROGRAM TEST(OUTPUT);VAR C:CHAR;BEGIN C:='A';IF CHR(ORD(C))=C THEN WRITE('OK')ELSE WRITE('BAD');END.`,
    purpose:
      'ISO 6.6.6.4: for any char value ch, chr(ord(ch))=ch (the char character set is implementation-defined, so a round-trip is used)',
    expectedOutput: 'OK',
  },
  {
    name: '6.6 succ returns the successor ordinal value (integer)',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(SUCC(5));END.`,
    purpose:
      'ISO 6.6.6.4: the ordinal number of the result of succ(x) is one greater than that of x; the result type is the same as x',
    expectedOutput: '6',
  },
  {
    name: '6.6 pred returns the predecessor ordinal value (integer)',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(PRED(5));END.`,
    purpose:
      'ISO 6.6.6.4: the ordinal number of the result of pred(x) is one less than that of x; the result type is the same as x',
    expectedOutput: '4',
  },
  {
    name: '6.6 succ holds for digit characters (digit characters are consecutively ordered)',
    code: `PROGRAM TEST(OUTPUT);VAR C:CHAR;BEGIN C:='0';IF SUCC(C)='1' THEN WRITE('OK')ELSE WRITE('BAD');END.`,
    purpose:
      'ISO 6.4.2.2: the subset of characters representing digits 0..9 is numerically ordered and consecutive, so succ(the 0 digit character) is the 1 digit character',
    expectedOutput: 'OK',
  },
  {
    name: '6.6.6.4 succ/pred applied to subranges and enumerations with runtime values',
    code: `program test(output);
type r = 1..10;
     c = (a1, b1, c1);
var x: r;
    y: c;
begin
  x := 5;
  writeln(succ(x));
  writeln(pred(x));
  y := a1;
  writeln(ord(succ(y)));
end.`,
    purpose:
      'ISO 6.6.6.4: the result of succ/pred is its ordinal value - this also holds when the actual parameter is not a compile-time constant (both subranges and enumerations must pass runtime bounds checking)',
    expectedOutput: '6\n4\n1\n',
  },
  {
    name: '6.6 succ on the last value of an enumeration type should be an error',
    code: `PROGRAM TEST(OUTPUT);TYPE COLOR=(RED,GREEN,BLUE);VAR C:COLOR;BEGIN C:=BLUE;C:=SUCC(C);END.`,
    purpose: 'ISO 6.6.6.4: it is an error when there is no value with a greater ordinal number',
    expectedError: '',
    maxSteps: 1000,
  },
  {
    name: '6.6 pred on the first value of an enumeration type should be an error',
    code: `PROGRAM TEST(OUTPUT);TYPE COLOR=(RED,GREEN,BLUE);VAR C:COLOR;BEGIN C:=RED;C:=PRED(C);END.`,
    purpose: 'ISO 6.6.6.4: it is an error when there is no value with a smaller ordinal number',
    expectedError: '',
    maxSteps: 1000,
  },

  // 6.6.6.5 Boolean functions
  {
    name: '6.6 odd returns true for odd numbers',
    code: `PROGRAM TEST(OUTPUT);BEGIN IF ODD(7)THEN WRITE('ODD')ELSE WRITE('EVEN');END.`,
    purpose: 'ISO 6.6.6.5: odd(x) is equivalent to abs(x) mod 2 = 1',
    expectedOutput: 'ODD',
  },
  {
    name: '6.6 odd returns false for even numbers',
    code: `PROGRAM TEST(OUTPUT);BEGIN IF ODD(8)THEN WRITE('ODD')ELSE WRITE('EVEN');END.`,
    purpose: 'ISO 6.6.6.5: odd(x) is equivalent to abs(x) mod 2 = 1',
    expectedOutput: 'EVEN',
  },
  {
    name: '6.6 odd uses the absolute value of the argument (negative odd is still true)',
    code: `PROGRAM TEST(OUTPUT);BEGIN IF ODD(-7)THEN WRITE('ODD')ELSE WRITE('EVEN');END.`,
    purpose:
      'ISO 6.6.6.5: odd(x) is equivalent to abs(x) mod 2 = 1, so the sign of the argument does not affect the result',
    expectedOutput: 'ODD',
  },
  {
    name: '6.6 eof(f) returns true when f.R is an empty sequence',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);IF EOF(F)THEN WRITE('EOF');END.`,
    purpose: 'ISO 6.6.6.5: eof(f) is true when f.R is an empty sequence',
    textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
    expectedOutput: 'EOF',
  },
  {
    name: '6.6 eof(f) returns false when f.R is non-empty',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);IF EOF(F)THEN WRITE('EOF')ELSE WRITE('MORE');END.`,
    purpose: 'ISO 6.6.6.5: eof(f) is true only when f.R is an empty sequence',
    textFiles: new Map<string, Uint8Array>([['F', text('AB')]]),
    expectedOutput: 'MORE',
  },
  {
    name: '6.6 eoln(f) returns true at end-of-line',
    code:
      `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);WHILE NOT EOLN(F)DO GET(F);IF EOLN(F)THEN WRITE('EOLN');END.`,
    purpose: 'ISO 6.6.6.5: eoln(f) is true when f.R.first is an end-of-line component',
    textFiles: new Map<string, Uint8Array>([['F', text('AB\n')]]),
    expectedOutput: 'EOLN',
  },
  {
    name: '6.6 eof with omitted argument applies to input',
    code: `PROGRAM TEST(INPUT,OUTPUT);BEGIN IF EOF THEN WRITE('IN_EOF');END.`,
    purpose:
      'ISO 6.6.6.5: when eof is called with its actual argument omitted, it applies to input, and the program parameter list must contain input',
    expectedOutput: 'IN_EOF',
  },
  {
    name: '6.6 eoln with omitted argument applies to input',
    code: `PROGRAM TEST(INPUT,OUTPUT);BEGIN IF EOLN THEN WRITE('IN_EOLN');END.`,
    purpose:
      'ISO 6.6.6.5: when eoln is called with its actual argument omitted, it applies to input; in this case eof(input) must be false',
    input: '\n',
    expectedOutput: 'IN_EOLN',
  },
]

runPascalTests('ISO 7185 6.6 - Procedure and function declarations', tests)
