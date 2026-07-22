import { describe, test, expect } from '@jest/globals'
import { lex } from '@/lexer/lexer'
import { parseProgram, parseBlock } from '@/parser/declarations'
import { parseExpression } from '@/parser/expressions'
import { parseStatement, parseCompoundStatement as parseCompound } from '@/parser/statements'
import { parseType } from '@/parser/types'
import { nodeToCode } from '@/ast/printer'
import type { ParserInput, AstNode } from '@/ast/types'

function makeInput(source: string): ParserInput {
  return { tokens: lex(source), position: 0 }
}

function parseAndPrint(source: string, parser: (input: ParserInput) => any): string {
  const result = parser(makeInput(source))
  if (!result.success) {
    throw new Error(`Parse failed: ${result.error}`)
  }
  return nodeToCode(result.astNode as AstNode)
}

// ============================================================================
// 表达式
// ============================================================================

describe('Printer: Expressions', () => {
  test('integer literal', () => {
    expect(parseAndPrint('42', parseExpression)).toBe('42')
  })

  test('real literal', () => {
    expect(parseAndPrint('3.14', parseExpression)).toBe('3.14')
  })

  test('string literal', () => {
    expect(parseAndPrint("'hello'", parseExpression)).toBe("'hello'")
  })

  test('string literal with escaped quote', () => {
    expect(parseAndPrint("'it''s'", parseExpression)).toBe("'it''s'")
  })

  test('boolean literal true', () => {
    expect(parseAndPrint('TRUE', parseExpression)).toBe('TRUE')
  })

  test('boolean literal false', () => {
    expect(parseAndPrint('FALSE', parseExpression)).toBe('FALSE')
  })

  test('identifier', () => {
    expect(parseAndPrint('foo', parseExpression)).toBe('foo')
  })

  test('binary expression +', () => {
    expect(parseAndPrint('a + b', parseExpression)).toBe('a + b')
  })

  test('binary expression -', () => {
    expect(parseAndPrint('a - b', parseExpression)).toBe('a - b')
  })

  test('binary expression *', () => {
    expect(parseAndPrint('a * b', parseExpression)).toBe('a * b')
  })

  test('binary expression /', () => {
    expect(parseAndPrint('a / b', parseExpression)).toBe('a / b')
  })

  test('binary expression DIV', () => {
    expect(parseAndPrint('a DIV b', parseExpression)).toBe('a DIV b')
  })

  test('binary expression MOD', () => {
    expect(parseAndPrint('a MOD b', parseExpression)).toBe('a MOD b')
  })

  test('binary expression AND', () => {
    expect(parseAndPrint('a AND b', parseExpression)).toBe('a AND b')
  })

  test('binary expression OR', () => {
    expect(parseAndPrint('a OR b', parseExpression)).toBe('a OR b')
  })

  test('binary expression =', () => {
    expect(parseAndPrint('a = b', parseExpression)).toBe('a = b')
  })

  test('binary expression <>', () => {
    expect(parseAndPrint('a <> b', parseExpression)).toBe('a <> b')
  })

  test('binary expression <', () => {
    expect(parseAndPrint('a < b', parseExpression)).toBe('a < b')
  })

  test('binary expression <=', () => {
    expect(parseAndPrint('a <= b', parseExpression)).toBe('a <= b')
  })

  test('binary expression >', () => {
    expect(parseAndPrint('a > b', parseExpression)).toBe('a > b')
  })

  test('binary expression >=', () => {
    expect(parseAndPrint('a >= b', parseExpression)).toBe('a >= b')
  })

  test('unary minus', () => {
    expect(parseAndPrint('-a', parseExpression)).toBe('- a')
  })

  test('unary NOT', () => {
    expect(parseAndPrint('NOT b', parseExpression)).toBe('NOT b')
  })

  test('parenthesized expression', () => {
    expect(parseAndPrint('(a + b)', parseExpression)).toBe('(a + b)')
  })

  test('function call with args', () => {
    expect(parseAndPrint('foo(1, 2)', parseExpression)).toBe('foo(1, 2)')
  })

  test('function call no args', () => {
    expect(parseAndPrint('bar()', parseExpression)).toBe('bar()')
  })

  test('array access', () => {
    expect(parseAndPrint('arr[i]', parseExpression)).toBe('arr[i]')
  })

  test('array access multi-dim', () => {
    expect(parseAndPrint('arr[i, j]', parseExpression)).toBe('arr[i, j]')
  })

  test('field access', () => {
    expect(parseAndPrint('rec.field', parseExpression)).toBe('rec.field')
  })

  test('set constructor empty', () => {
    expect(parseAndPrint('[]', parseExpression)).toBe('[]')
  })

  test('set constructor single elements', () => {
    expect(parseAndPrint('[1, 2, 3]', parseExpression)).toBe('[1, 2, 3]')
  })

  test('set constructor range', () => {
    expect(parseAndPrint('[1..10]', parseExpression)).toBe('[1..10]')
  })

  test('set constructor mixed', () => {
    expect(parseAndPrint('[1, 3..5, 10]', parseExpression)).toBe('[1, 3..5, 10]')
  })

  test('IN expression', () => {
    expect(parseAndPrint('x IN s', parseExpression)).toBe('x IN s')
  })
})

// ============================================================================
// 语句
// ============================================================================

describe('Printer: Statements', () => {
  test('empty compound statement', () => {
    expect(parseAndPrint('BEGIN END', parseCompound)).toBe('begin\nend')
  })

  test('single statement compound', () => {
    expect(parseAndPrint('BEGIN x := 1 END', parseCompound)).toBe('begin\n  x := 1\nend')
  })

  test('multiple statements compound', () => {
    expect(parseAndPrint('BEGIN x := 1; y := 2 END', parseCompound)).toBe(
      'begin\n  x := 1;\n  y := 2\nend'
    )
  })

  test('assignment statement', () => {
    expect(parseAndPrint('x := 42', parseStatement)).toBe('x := 42')
  })

  test('if-then statement', () => {
    expect(parseAndPrint('IF x > 0 THEN y := 1', parseStatement)).toBe(
      'if x > 0 then\n  y := 1'
    )
  })

  test('if-then-else statement', () => {
    expect(parseAndPrint('IF x > 0 THEN y := 1 ELSE y := 2', parseStatement)).toBe(
      'if x > 0 then\n  y := 1\nelse\n  y := 2'
    )
  })

  test('if-then compound body', () => {
    const out = parseAndPrint('IF x > 0 THEN BEGIN y := 1; z := 2 END', parseStatement)
    expect(out).toBe('if x > 0 then\nbegin\n  y := 1;\n  z := 2\nend')
  })

  test('while statement', () => {
    expect(parseAndPrint('WHILE x > 0 DO x := x - 1', parseStatement)).toBe(
      'while x > 0 do\n  x := x - 1'
    )
  })

  test('while compound body', () => {
    const out = parseAndPrint(
      'WHILE x > 0 DO BEGIN x := x - 1; y := y + 1 END',
      parseStatement
    )
    expect(out).toBe('while x > 0 do\nbegin\n  x := x - 1;\n  y := y + 1\nend')
  })

  test('repeat statement', () => {
    expect(parseAndPrint('REPEAT x := x + 1 UNTIL x > 10', parseStatement)).toBe(
      'repeat\n  x := x + 1\nuntil x > 10'
    )
  })

  test('repeat multiple statements', () => {
    expect(
      parseAndPrint('REPEAT x := x + 1; y := y * 2 UNTIL x > 10', parseStatement)
    ).toBe('repeat\n  x := x + 1;\n  y := y * 2\nuntil x > 10')
  })

  test('for-to statement', () => {
    expect(parseAndPrint('FOR i := 1 TO 10 DO x := x + i', parseStatement)).toBe(
      'for i := 1 TO 10 do\n  x := x + i'
    )
  })

  test('for-downto statement', () => {
    expect(parseAndPrint('FOR i := 10 DOWNTO 1 DO x := x + i', parseStatement)).toBe(
      'for i := 10 DOWNTO 1 do\n  x := x + i'
    )
  })

  test('for compound body', () => {
    const out = parseAndPrint(
      'FOR i := 1 TO 3 DO BEGIN writeln(i); x := x + i END',
      parseStatement
    )
    expect(out).toBe('for i := 1 TO 3 do\nbegin\n  WRITELN(i);\n  x := x + i\nend')
  })

  test('case statement', () => {
    expect(parseAndPrint('CASE x OF 1: y := 10; 2: y := 20 END', parseStatement)).toBe(
      'case x of\n  1: y := 10;\n  2: y := 20\nend'
    )
  })

  test('case statement with otherwise', () => {
    const out = parseAndPrint(
      'CASE x OF 1: y := 10; 2: y := 20 OTHERWISE y := 0 END',
      parseStatement
    )
    expect(out).toBe(
      'case x of\n  1: y := 10;\n  2: y := 20;\n  otherwise y := 0\nend'
    )
  })

  test('case statement multiple labels', () => {
    expect(
      parseAndPrint('CASE x OF 1, 3: y := 10; 2, 4: y := 20 END', parseStatement)
    ).toBe('case x of\n  1, 3: y := 10;\n  2, 4: y := 20\nend')
  })

  test('goto statement', () => {
    expect(parseAndPrint('GOTO 100', parseStatement)).toBe('goto 100')
  })

  test('labeled statement', () => {
    expect(parseAndPrint('100: x := 1', parseStatement)).toBe('100: x := 1')
  })

  test('with statement', () => {
    expect(parseAndPrint('WITH r DO x := 1', parseStatement)).toBe('with r do\n  x := 1')
  })

  test('with compound body', () => {
    const out = parseAndPrint('WITH r DO BEGIN x := 1; y := 2 END', parseStatement)
    expect(out).toBe('with r do\nbegin\n  x := 1;\n  y := 2\nend')
  })

  test('procedure call no args', () => {
    expect(parseAndPrint('foo', parseStatement)).toBe('foo')
  })

  test('procedure call with args', () => {
    expect(parseAndPrint('writeln(1, 2)', parseStatement)).toBe('WRITELN(1, 2)')
  })
})

// ============================================================================
// 类型
// ============================================================================

describe('Printer: Types', () => {
  test('simple type integer', () => {
    expect(parseAndPrint('INTEGER', parseType)).toBe('INTEGER')
  })

  test('simple type real', () => {
    expect(parseAndPrint('REAL', parseType)).toBe('REAL')
  })

  test('simple type boolean', () => {
    expect(parseAndPrint('BOOLEAN', parseType)).toBe('BOOLEAN')
  })

  test('simple type char', () => {
    expect(parseAndPrint('CHAR', parseType)).toBe('CHAR')
  })

  test('range type', () => {
    expect(parseAndPrint('1..10', parseType)).toBe('1..10')
  })

  test('range type char', () => {
    expect(parseAndPrint("'a'..'z'", parseType)).toBe("'a'..'z'")
  })

  test('array type', () => {
    expect(parseAndPrint('ARRAY [1..10] OF INTEGER', parseType)).toBe(
      'array[1..10] of INTEGER'
    )
  })

  test('array type multi-dim', () => {
    expect(parseAndPrint('ARRAY [1..10, 1..20] OF REAL', parseType)).toBe(
      'array[1..10, 1..20] of REAL'
    )
  })

  test('packed array type', () => {
    expect(parseAndPrint('PACKED ARRAY [1..10] OF CHAR', parseType)).toBe(
      'packed array[1..10] of CHAR'
    )
  })

  test('record type', () => {
    expect(parseAndPrint('RECORD x: INTEGER; y: INTEGER END', parseType)).toBe(
      'record x: INTEGER; y: INTEGER end'
    )
  })

  test('file type', () => {
    expect(parseAndPrint('FILE OF INTEGER', parseType)).toBe('file of INTEGER')
  })

  test('text file type', () => {
    expect(parseAndPrint('TEXT', parseType)).toBe('TEXT')
  })

  test('set type', () => {
    expect(parseAndPrint('SET OF 1..10', parseType)).toBe('set of 1..10')
  })

  test('enumeration type', () => {
    expect(parseAndPrint('(red, green, blue)', parseType)).toBe('(red, green, blue)')
  })
})

// ============================================================================
// 程序 / 块
// ============================================================================

describe('Printer: Program & Block', () => {
  test('simple program', () => {
    const out = parseAndPrint('PROGRAM test; BEGIN END.', (input) => parseProgram(input))
    expect(out).toContain('program test;')
    expect(out).toContain('begin\nend.')
  })

  test('program with parameters', () => {
    const out = parseAndPrint(
      'PROGRAM test(input, output); BEGIN END.',
      (input) => parseProgram(input)
    )
    expect(out).toContain('program test(input, output);')
  })

  test('block with variable declarations', () => {
    const out = parseAndPrint(
      'VAR x: INTEGER; y: REAL; BEGIN x := 1 END',
      (input) => parseBlock(input)
    )
    expect(out).toContain('var')
    expect(out).toContain('x: INTEGER')
    expect(out).toContain('y: REAL')
  })

  test('block with const declarations', () => {
    const out = parseAndPrint(
      'CONST pi = 3.14; n = 10; BEGIN END',
      (input) => parseBlock(input)
    )
    expect(out).toContain('const')
    expect(out).toContain('pi = 3.14')
    expect(out).toContain('n = 10')
  })

  test('block with type declarations', () => {
    const out = parseAndPrint(
      'TYPE Age = 0..120; Point = RECORD x: INTEGER; y: INTEGER END; BEGIN END',
      (input) => parseBlock(input)
    )
    expect(out).toContain('type')
    expect(out).toContain('Age = 0..120')
  })

  test('block with label declarations', () => {
    const out = parseAndPrint(
      'LABEL 10, 20; BEGIN 10: writeln(1); 20: writeln(2) END',
      (input) => parseBlock(input)
    )
    expect(out).toContain('label')
    expect(out).toContain('10, 20')
  })

  test('block with procedure declaration', () => {
    const out = parseAndPrint(
      'PROCEDURE foo; BEGIN END; BEGIN END',
      (input) => parseBlock(input)
    )
    expect(out).toContain('procedure foo;')
  })

  test('block with function declaration', () => {
    const out = parseAndPrint(
      'FUNCTION bar: INTEGER; BEGIN bar := 1 END; BEGIN END',
      (input) => parseBlock(input)
    )
    expect(out).toContain('function bar: INTEGER')
  })

  test('procedure with parameters', () => {
    const out = parseAndPrint(
      'PROCEDURE foo(x: INTEGER; VAR y: REAL); BEGIN END; BEGIN END',
      (input) => parseBlock(input)
    )
    expect(out).toContain('procedure foo(x: INTEGER; var y: REAL)')
  })

  test('function with parameters', () => {
    const out = parseAndPrint(
      'FUNCTION add(a, b: INTEGER): INTEGER; BEGIN add := a + b END; BEGIN END',
      (input) => parseBlock(input)
    )
    expect(out).toContain('function add(a, b: INTEGER): INTEGER')
  })

  test('forward procedure', () => {
    const out = parseAndPrint(
      'PROCEDURE foo; FORWARD; PROCEDURE bar; BEGIN foo END; BEGIN END',
      (input) => parseBlock(input)
    )
    expect(out).toContain('procedure foo; forward')
  })

  test('forward function', () => {
    const out = parseAndPrint(
      'FUNCTION bar: INTEGER; FORWARD; BEGIN END',
      (input) => parseBlock(input)
    )
    expect(out).toContain('function bar: INTEGER; forward')
  })
})

// ============================================================================
// 幂等性测试：parse -> print -> parse -> print 结果一致
// ============================================================================

describe('Printer: Idempotency', () => {
  function testIdempotent(source: string, parser: (input: ParserInput) => any) {
    const result1 = parser(makeInput(source))
    if (!result1.success) throw new Error(`First parse failed: ${result1.error}`)
    const printed1 = nodeToCode(result1.astNode as AstNode)

    const result2 = parser(makeInput(printed1))
    if (!result2.success) throw new Error(`Second parse failed: ${result2.error}`)
    const printed2 = nodeToCode(result2.astNode as AstNode)

    expect(printed2).toBe(printed1)
  }

  test('expression idempotent', () => {
    testIdempotent('a + b * c', parseExpression)
  })

  test('compound statement idempotent', () => {
    testIdempotent('BEGIN x := 1; y := 2 END', parseCompound)
  })

  test('if statement idempotent', () => {
    testIdempotent('IF x > 0 THEN y := 1 ELSE y := 2', parseStatement)
  })

  test('while statement idempotent', () => {
    testIdempotent('WHILE x > 0 DO x := x - 1', parseStatement)
  })

  test('for statement idempotent', () => {
    testIdempotent('FOR i := 1 TO 10 DO x := x + i', parseStatement)
  })

  test('case statement idempotent', () => {
    testIdempotent('CASE x OF 1: y := 10; 2: y := 20 END', parseStatement)
  })

  test('set constructor idempotent', () => {
    testIdempotent('[1, 3..5, 10]', parseExpression)
  })
})
