import { parse } from '../../src/index'
import {
  createState,
  runToCompletion,
  populateSystemProcedures,
  populateSystemFunctions,
} from '../../src/interpreter'

function runPas(pasCode: string): { output: string; state: any } {
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
  return { output, state }
}

describe('TANGLE functions: extracted unit tests', () => {
  describe('control_code pattern (CASE with multi-value labels)', () => {
    test('CONTROLCODE simplified - basic CASE mapping with OTHERWISE', () => {
      const code = `program test;
function controlcode(c: integer): integer;
begin
  case c of
    64: controlcode := 64;
    39: controlcode := 12;
    34: controlcode := 13;
    36: controlcode := 125;
    32, 9: controlcode := 136;
    68, 100: controlcode := 133;
    70, 102: controlcode := 132;
    123: controlcode := 9;
    125: controlcode := 10;
    80, 112: controlcode := 134;
    84, 116, 94, 46, 58: controlcode := 131;
    38: controlcode := 127;
    60: controlcode := 135;
    61: controlcode := 2;
    92: controlcode := 3;
    otherwise controlcode := 0;
  end;
end;
begin
  writeln(controlcode(64));
  writeln(controlcode(9));
  writeln(controlcode(112));
  writeln(controlcode(46));
  writeln(controlcode(60));
  writeln(controlcode(65));
end.`
      const { output } = runPas(code)
      expect(output).toContain('64')
      expect(output).toContain('136')
      expect(output).toContain('134')
      expect(output).toContain('131')
      expect(output).toContain('135')
      expect(output).toContain('0')
    })
  })

  describe('store_two_byte pattern (procedure with params + global state)', () => {
    test('STORETWOBYTE simplified - procedure params modify global vars', () => {
      const code = `program test;
var hibyte, lobyte, poolptr: integer;
procedure storetwobyte(x: integer);
begin
  hibyte := x div 256;
  lobyte := x mod 256;
  poolptr := poolptr + 2;
end;
begin
  poolptr := 1;
  storetwobyte(1234);
  writeln(hibyte);
  writeln(lobyte);
  writeln(poolptr);
end.`
      const { output } = runPas(code)
      expect(output).toContain('4')
      expect(output).toContain('210')
      expect(output).toContain('3')
    })
  })

  describe('scan_repl pattern (param + CASE + GOTO + nested loops)', () => {
    test('SCANREPL core: param T with CASE and GOTO 30 on mismatch', () => {
      const code = `program test;
var a, counter, result: integer;
procedure scanrepl(t: integer);
label 22, 30;
begin
  counter := 0;
  result := 0;
  while true do begin
    22:
    counter := counter + 1;
    a := counter;
    case a of
      1: if t <> 135 then goto 30 else begin
        result := result + 10;
      end;
      2: if t <> 134 then goto 30 else begin
        result := result + 100;
      end;
      3: goto 30;
    end;
  end;
  30:
  result := result + 1;
end;
begin
  scanrepl(135);
  writeln(result);
end.`
      const { output } = runPas(code)
      expect(output).toContain('11')
    })

    test('SCANREPL with t=134 takes different path', () => {
      const code = `program test;
var a, counter, result: integer;
procedure scanrepl(t: integer);
label 22, 30;
begin
  counter := 0;
  result := 0;
  while true do begin
    22:
    counter := counter + 1;
    a := counter;
    case a of
      1: if t <> 135 then goto 30 else begin
        result := result + 10;
      end;
      2: if t <> 134 then goto 30 else begin
        result := result + 100;
      end;
      3: goto 30;
    end;
  end;
  30:
  result := result + 1;
end;
begin
  scanrepl(134);
  writeln(result);
end.`
      const { output } = runPas(code)
      expect(output).toContain('1')
    })
  })

  describe('mod_lookup pattern (function with nested loops + GOTO exit)', () => {
    test('MODLOOKUP simplified: function returns value after GOTO exit', () => {
      const code = `program test;
function findtarget(target: integer): integer;
label 31;
var p, c: integer;
begin
  p := 1;
  c := 0;
  while p <= 10 do begin
    if p = target then begin c := 1; goto 31; end;
    p := p + 1;
  end;
  31:
  if c = 1 then
    findtarget := p
  else
    findtarget := 0;
end;
begin
  writeln(findtarget(5));
  writeln(findtarget(20));
end.`
      const { output } = runPas(code)
      expect(output).toContain('5')
      expect(output).toContain('0')
    })
  })

  describe('get_next pattern (procedure with GOTO between states)', () => {
    test('GETNEXT simplified: label + GOTO state machine', () => {
      const code = `program test;
var state, result: integer;
procedure getnext;
label 20, 30;
begin
  state := state + 1;
  20:
  if state > 5 then goto 30;
  result := result + state;
  state := state + 1;
  goto 20;
  30:
  result := result * 2;
end;
begin
  state := 0;
  result := 0;
  getnext;
  writeln(result);
end.`
      const { output } = runPas(code)
      // state starts at 1 after state:=state+1
      // 20: state=1→result=1, state=2
      // 20: state=2→result=3, state=3
      // 20: state=3→result=6, state=4
      // 20: state=4→result=10, state=5
      // 20: state=5→result=15, state=6
      // 20: state=6>5→goto 30
      // 30: result=30
      expect(output).toContain('30')
    })
  })
})
