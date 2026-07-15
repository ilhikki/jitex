import { parse } from '../../src/index'
import {
  createState,
  runToCompletion,
  populateSystemProcedures,
  populateSystemFunctions,
} from '../../src/interpreter'

function runPas(pasCode: string): string {
  const parseResult = parse(pasCode)
  if (!parseResult.success) {
    throw new Error(`Parse failed: ${parseResult.error}`)
  }
  let output = ''
  const io = {
    file: { read: () => '', write: () => {}, readln: () => {}, writeln: () => {}, reset: () => {}, rewrite: () => {}, close: () => {} },
    console: {
      write: (text: string) => { output += text },
      writeln: () => { output += '\n' },
      read: () => '',
      readln: () => '',
      eof: () => true,
      eoln: () => true,
    },
  }
  const state = createState(parseResult.astNode, io as any)
  populateSystemProcedures(state)
  populateSystemFunctions(state)
  runToCompletion(state)
  return output
}

describe('Interpreter: function/procedure parameters', () => {
  describe('procedure parameters', () => {
    test('procedure with single integer param', () => {
      const code = `program test;
procedure setx(n: integer);
begin
  writeln(n);
end;
begin
  setx(42);
end.`
      expect(runPas(code)).toContain('42')
    })

    test('procedure with multiple params', () => {
      const code = `program test;
procedure add(a, b: integer);
begin
  writeln(a + b);
end;
begin
  add(10, 20);
end.`
      expect(runPas(code)).toContain('30')
    })

    test('procedure with expression args', () => {
      const code = `program test;
var x: integer;
procedure show(n: integer);
begin
  writeln(n);
end;
begin
  x := 5;
  show(x * 2 + 1);
end.`
      expect(runPas(code)).toContain('11')
    })

    test('procedure with variable arg', () => {
      const code = `program test;
var x: integer;
procedure show(n: integer);
begin
  writeln(n);
end;
begin
  x := 99;
  show(x);
end.`
      expect(runPas(code)).toContain('99')
    })

    test('procedure no param (baseline)', () => {
      const code = `program test;
procedure hello;
begin
  writeln('hello');
end;
begin
  hello;
end.`
      expect(runPas(code)).toContain('hello')
    })

    test('procedure after var declarations (main program block order)', () => {
      const code = `program test;
var x: integer;
procedure setx(n: integer);
begin
  x := n;
end;
begin
  setx(42);
  writeln(x);
end.`
      expect(runPas(code)).toContain('42')
    })
  })

  describe('function parameters', () => {
    test('function with single integer param', () => {
      const code = `program test;
function double(n: integer): integer;
begin
  double := n * 2;
end;
begin
  writeln(double(21));
end.`
      expect(runPas(code)).toContain('42')
    })

    test('function with multiple params', () => {
      const code = `program test;
function add(a, b: integer): integer;
begin
  add := a + b;
end;
begin
  writeln(add(3, 4));
end.`
      expect(runPas(code)).toContain('7')
    })

    test('function with expression args', () => {
      const code = `program test;
var x: integer;
function sq(n: integer): integer;
begin
  sq := n * n;
end;
begin
  x := 6;
  writeln(sq(x + 1));
end.`
      expect(runPas(code)).toContain('49')
    })

    test('nested function calls', () => {
      const code = `program test;
function double(n: integer): integer;
begin
  double := n * 2;
end;
function triple(n: integer): integer;
begin
  triple := n * 3;
end;
begin
  writeln(double(triple(5)));
end.`
      expect(runPas(code)).toContain('30')
    })

    test('function called as procedure (no return used)', () => {
      const code = `program test;
var r: integer;
function side(n: integer): integer;
begin
  writeln(n);
  side := n + 1;
end;
begin
  side(7);
end.`
      expect(runPas(code)).toContain('7')
    })
  })

  describe('SCANREPL pattern: param + <> + GOTO', () => {
    test('T=135, T<>135 is false (do not goto)', () => {
      const code = `program test;
var result: integer;
procedure scanrepl(t: integer);
label 30;
begin
  result := 0;
  if t <> 135 then goto 30;
  result := 1;
  30:
  result := result + 10;
end;
begin
  scanrepl(135);
  if result = 11 then writeln('OK') else writeln('FAIL:', result);
end.`
      expect(runPas(code)).toContain('OK')
    })

    test('T=134, T<>135 is true (goto early)', () => {
      const code = `program test;
var result: integer;
procedure scanrepl(t: integer);
label 30;
begin
  result := 0;
  if t <> 135 then goto 30;
  result := 1;
  30:
  result := result + 10;
end;
begin
  scanrepl(134);
  if result = 10 then writeln('OK') else writeln('FAIL:', result);
end.`
      expect(runPas(code)).toContain('OK')
    })

    test('CASE + param <> check + GOTO (exact SCANREPL pattern)', () => {
      const code = `program test;
var a, result: integer;
procedure scanrepl(t: integer);
label 22, 30;
begin
  result := 0;
  while true do begin
    22:
    a := 135;
    case a of
      135: if t <> 135 then goto 30 else begin
        result := 1;
        a := 99;
      end;
    end;
    goto 30;
  end;
  30:
  result := result + 10;
end;
begin
  scanrepl(135);
  if result = 11 then writeln('OK') else writeln('FAIL:', result);
end.`
      expect(runPas(code)).toContain('OK')
    })
  })

  describe('unknown procedure/function (fast fail)', () => {
    test('calling unknown procedure throws', () => {
      const code = `program test;
begin
  noproc(1);
end.`
      expect(() => runPas(code)).toThrow()
    })

    test('calling unknown function throws', () => {
      const code = `program test;
var x: integer;
begin
  x := nofunc(1);
end.`
      expect(() => runPas(code)).toThrow()
    })
  })
})
