import * as fs from 'fs'
import * as path from 'path'
import { parse } from '../../src/index'
import {
  createState,
  runToCompletion,
  createRecordFileOps,
  populateSystemProcedures,
  populateSystemFunctions,
} from '../../src/interpreter'

describe('minimal pas repro - issue 003', () => {
  test('WHILE TRUE DO + GOTO in function', () => {
    const pasCode = `program test;
var x: integer;

function test_func: integer;
label 10, 20;
begin
  x := 1;
  10: if x > 3 then goto 20;
      x := x + 1;
      goto 10;
  20: test_func := x;
end;

begin
  if test_func = 4 then
    writeln('OK')
  else
    writeln('FAIL: ', test_func);
end.`

    const parseResult = parse(pasCode)
    if (!parseResult.success) {
      throw new Error(`Parse failed: ${parseResult.error}`)
    }

    const files = new Map<string, Uint8Array>()
    files.set('termout', new Uint8Array(0))

    const fileOps = createRecordFileOps(files)
    let output = ''
    const io = {
      file: fileOps,
      console: {
        write: (text: string) => {
          output += text
        },
        writeln: () => {
          output += '\n'
        },
        read: () => '',
        readln: () => '',
        eof: () => true,
        eoln: () => true,
      },
    }
    const state = createState(parseResult.astNode, io)
    populateSystemProcedures(state, true)
    populateSystemFunctions(state)

    runToCompletion(state)

    console.log('output:', output)
    expect(output).toContain('OK')
  })

  test('nested WHILE TRUE DO loops', () => {
    const pasCode = `program test;
var i, j: integer;

begin
  i := 0;
  while true do begin
    i := i + 1;
    j := 0;
    while true do begin
      j := j + 1;
      if j >= 2 then break;
    end;
    if i >= 3 then break;
  end;
  if i = 3 then
    writeln('OK')
  else
    writeln('FAIL: i=', i);
end.`

    const parseResult = parse(pasCode)
    if (!parseResult.success) {
      throw new Error(`Parse failed: ${parseResult.error}`)
    }

    let output = ''
    const io = {
      file: {
        read: () => '',
        write: () => {},
        readln: () => {},
        writeln: () => {},
        reset: () => {},
        rewrite: () => {},
        close: () => {},
      },
      console: {
        write: (text: string) => {
          output += text
        },
        writeln: () => {
          output += '\n'
        },
        read: () => '',
        readln: () => '',
        eof: () => true,
        eoln: () => true,
      },
    }
    const state = createState(parseResult.astNode, io as any)
    populateSystemProcedures(state, true)
    populateSystemFunctions(state)

    runToCompletion(state)

    console.log('output:', output)
    expect(output).toContain('OK')
  })

  test('simple IF THEN ELSE', () => {
    const pasCode = `program test;
var x: integer;
begin
  x := 1;
  if x = 1 then
    writeln('OK')
  else
    writeln('FAIL');
end.`

    const parseResult = parse(pasCode)
    if (!parseResult.success) {
      throw new Error(`Parse failed: ${parseResult.error}`)
    }

    let output = ''
    const io = {
      file: {
        read: () => '',
        write: () => {},
        readln: () => {},
        writeln: () => {},
        reset: () => {},
        rewrite: () => {},
        close: () => {},
      },
      console: {
        write: (text: string) => {
          output += text
        },
        writeln: () => {
          output += '\n'
        },
        read: () => '',
        readln: () => '',
        eof: () => true,
        eoln: () => true,
      },
    }
    const state = createState(parseResult.astNode, io as any)
    populateSystemProcedures(state, true)
    populateSystemFunctions(state)

    runToCompletion(state)

    console.log('output:', output)
    expect(output).toContain('OK')
  })

  // 测试1：<> 运算符本身（无函数参数）
  test('neq operator with global var', () => {
    const pasCode = `program test;
var x: integer;
begin
  x := 135;
  if x <> 135 then
    writeln('FAIL')
  else
    writeln('OK');
end.`
    const parseResult = parse(pasCode)
    if (!parseResult.success) throw new Error(`Parse failed: ${parseResult.error}`)
    let output = ''
    const io = {
      file: {
        read: () => '',
        write: () => {},
        readln: () => {},
        writeln: () => {},
        reset: () => {},
        rewrite: () => {},
        close: () => {},
      },
      console: {
        write: (text: string) => {
          output += text
        },
        writeln: () => {
          output += '\n'
        },
        read: () => '',
        readln: () => '',
        eof: () => true,
        eoln: () => true,
      },
    }
    const state = createState(parseResult.astNode, io as any)
    populateSystemProcedures(state, true)
    populateSystemFunctions(state)
    runToCompletion(state)
    console.log('output:', output)
    expect(output).toContain('OK')
  })

  // 测试2：函数参数 = 比较
  test('function param eq compare', () => {
    const pasCode = `program test;
var result: integer;
procedure check(t: integer);
begin
  if t = 135 then result := 1 else result := 0;
end;
begin
  result := 0;
  check(135);
  if result = 1 then writeln('OK') else writeln('FAIL');
end.`
    const parseResult = parse(pasCode)
    if (!parseResult.success) throw new Error(`Parse failed: ${parseResult.error}`)
    let output = ''
    const io = {
      file: {
        read: () => '',
        write: () => {},
        readln: () => {},
        writeln: () => {},
        reset: () => {},
        rewrite: () => {},
        close: () => {},
      },
      console: {
        write: (text: string) => {
          output += text
        },
        writeln: () => {
          output += '\n'
        },
        read: () => '',
        readln: () => '',
        eof: () => true,
        eoln: () => true,
      },
    }
    const state = createState(parseResult.astNode, io as any)
    populateSystemProcedures(state, true)
    populateSystemFunctions(state)
    runToCompletion(state)
    console.log('output:', output)
    expect(output).toContain('OK')
  })

  // 测试3：函数参数 <> 比较
  test('function param neq compare', () => {
    const pasCode = `program test;
var result: integer;
procedure check(t: integer);
begin
  if t <> 135 then result := 0 else result := 1;
end;
begin
  result := 0;
  check(135);
  if result = 1 then writeln('OK') else writeln('FAIL');
end.`
    const parseResult = parse(pasCode)
    if (!parseResult.success) throw new Error(`Parse failed: ${parseResult.error}`)
    let output = ''
    const io = {
      file: {
        read: () => '',
        write: () => {},
        readln: () => {},
        writeln: () => {},
        reset: () => {},
        rewrite: () => {},
        close: () => {},
      },
      console: {
        write: (text: string) => {
          output += text
        },
        writeln: () => {
          output += '\n'
        },
        read: () => '',
        readln: () => '',
        eof: () => true,
        eoln: () => true,
      },
    }
    const state = createState(parseResult.astNode, io as any)
    populateSystemProcedures(state, true)
    populateSystemFunctions(state)
    runToCompletion(state)
    console.log('output:', output)
    expect(output).toContain('OK')
  })

  // 模拟 SCANREPL 的关键逻辑：函数参数 T=135，CASE 中检查 T<>135
  test('SCANREPL pattern: function param + <> + GOTO', () => {
    const pasCode = `program test;
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
  if result = 11 then
    writeln('OK')
  else
    writeln('FAIL: result=', result);
end.`

    const parseResult = parse(pasCode)
    if (!parseResult.success) {
      throw new Error(`Parse failed: ${parseResult.error}`)
    }

    let output = ''
    const io = {
      file: {
        read: () => '',
        write: () => {},
        readln: () => {},
        writeln: () => {},
        reset: () => {},
        rewrite: () => {},
        close: () => {},
      },
      console: {
        write: (text: string) => {
          output += text
        },
        writeln: () => {
          output += '\n'
        },
        read: () => '',
        readln: () => '',
        eof: () => true,
        eoln: () => true,
      },
    }
    const state = createState(parseResult.astNode, io as any)
    populateSystemProcedures(state, true)
    populateSystemFunctions(state)

    runToCompletion(state)

    console.log('output:', output)
    expect(output).toContain('OK')
  })
})
