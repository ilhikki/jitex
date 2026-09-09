import { assert, assertEquals, describe, test } from '../../_harness.ts'
import { lex } from '@/parsing/lexer/lexer.ts'

import { parseBlock, parseProgram } from '@/parsing/parser/declarations.ts'
import { parseExpression } from '@/parsing/parser/expressions.ts'
import { parseCompoundStatement, parseStatement } from '@/parsing/parser/statements.ts'
import { parseType } from '@/parsing/parser/types.ts'
import { AstNode, nodeToCode, ParseResult, ParserInput } from '@jitex/pascal-to-js'

function makeInput(source: string): ParserInput {
  return { tokens: lex(source), position: 0 }
}

function parseAndPrint(source: string, parser: (input: ParserInput) => ParseResult<AstNode>): string {
  const result = parser(makeInput(source))
  if (!result.success) {
    throw new Error(`Parse failed: ${result.error}`)
  }
  return nodeToCode(result.astNode)
}

interface CaseExact {
  name: string
  src: string
  parser: (input: ParserInput) => ParseResult<AstNode>
  expected: string
}

/** 精确相等断言的表驱动批量测试 */
function runExact(group: string, cases: CaseExact[]) {
  describe(group, () => {
    for (const c of cases) {
      test(c.name, () => {
        const printed = parseAndPrint(c.src, c.parser)
        assertEquals(
          printed,
          c.expected,
          `${c.name}: parse→print mismatch.\n  expected: ${JSON.stringify(c.expected)}\n  actual:   ${
            JSON.stringify(printed)
          }`,
        )
      })
    }
  })
}

interface CaseContains {
  name: string
  src: string
  parser: (input: ParserInput) => ParseResult<AstNode>
  contains: string[]
}

/** 子串包含断言的表驱动批量测试 */
function runContains(group: string, cases: CaseContains[]) {
  describe(group, () => {
    for (const c of cases) {
      test(c.name, () => {
        const printed = parseAndPrint(c.src, c.parser)
        for (const sub of c.contains) {
          assert(
            printed.includes(sub),
            `${c.name}: expected output to contain ${JSON.stringify(sub)}.\nActual output: ${JSON.stringify(printed)}`,
          )
        }
      })
    }
  })
}

// ============================================================================
// 表达式
// ============================================================================

runExact('Printer: Expressions', [
  { name: 'integer literal', src: '42', parser: parseExpression, expected: '42' },
  { name: 'real literal', src: '3.14', parser: parseExpression, expected: '3.14' },
  { name: 'string literal', src: "'hello'", parser: parseExpression, expected: "'hello'" },
  { name: 'string literal with escaped quote', src: "'it''s'", parser: parseExpression, expected: "'it''s'" },
  { name: 'boolean literal true', src: 'TRUE', parser: parseExpression, expected: 'TRUE' },
  { name: 'boolean literal false', src: 'FALSE', parser: parseExpression, expected: 'FALSE' },
  { name: 'identifier', src: 'foo', parser: parseExpression, expected: 'foo' },
  { name: 'binary expression +', src: 'a + b', parser: parseExpression, expected: 'a + b' },
  { name: 'binary expression -', src: 'a - b', parser: parseExpression, expected: 'a - b' },
  { name: 'binary expression *', src: 'a * b', parser: parseExpression, expected: 'a * b' },
  { name: 'binary expression /', src: 'a / b', parser: parseExpression, expected: 'a / b' },
  { name: 'binary expression DIV', src: 'a DIV b', parser: parseExpression, expected: 'a DIV b' },
  { name: 'binary expression MOD', src: 'a MOD b', parser: parseExpression, expected: 'a MOD b' },
  { name: 'binary expression AND', src: 'a AND b', parser: parseExpression, expected: 'a AND b' },
  { name: 'binary expression OR', src: 'a OR b', parser: parseExpression, expected: 'a OR b' },
  { name: 'binary expression =', src: 'a = b', parser: parseExpression, expected: 'a = b' },
  { name: 'binary expression <>', src: 'a <> b', parser: parseExpression, expected: 'a <> b' },
  { name: 'binary expression <', src: 'a < b', parser: parseExpression, expected: 'a < b' },
  { name: 'binary expression <=', src: 'a <= b', parser: parseExpression, expected: 'a <= b' },
  { name: 'binary expression >', src: 'a > b', parser: parseExpression, expected: 'a > b' },
  { name: 'binary expression >=', src: 'a >= b', parser: parseExpression, expected: 'a >= b' },
  { name: 'unary minus', src: '-a', parser: parseExpression, expected: '- a' },
  { name: 'unary NOT', src: 'NOT b', parser: parseExpression, expected: 'NOT b' },
  { name: 'parenthesized expression', src: '(a + b)', parser: parseExpression, expected: '(a + b)' },
  { name: 'function call with args', src: 'foo(1, 2)', parser: parseExpression, expected: 'foo(1, 2)' },
  { name: 'function call no args', src: 'bar()', parser: parseExpression, expected: 'bar()' },
  { name: 'array access', src: 'arr[i]', parser: parseExpression, expected: 'arr[i]' },
  { name: 'array access multi-dim', src: 'arr[i, j]', parser: parseExpression, expected: 'arr[i, j]' },
  { name: 'field access', src: 'rec.field', parser: parseExpression, expected: 'rec.field' },
  { name: 'set constructor empty', src: '[]', parser: parseExpression, expected: '[]' },
  { name: 'set constructor single elements', src: '[1, 2, 3]', parser: parseExpression, expected: '[1, 2, 3]' },
  { name: 'set constructor range', src: '[1..10]', parser: parseExpression, expected: '[1..10]' },
  { name: 'set constructor mixed', src: '[1, 3..5, 10]', parser: parseExpression, expected: '[1, 3..5, 10]' },
  { name: 'IN expression', src: 'x IN s', parser: parseExpression, expected: 'x IN s' },
])

// ============================================================================
// 语句
// ============================================================================

runExact('Printer: Statements', [
  {
    name: 'empty compound statement',
    src: 'BEGIN END',
    parser: parseCompoundStatement,
    expected: 'begin\nend',
  },
  {
    name: 'single statement compound',
    src: 'BEGIN x := 1 END',
    parser: parseCompoundStatement,
    expected: 'begin\n  x := 1\nend',
  },
  {
    name: 'multiple statements compound',
    src: 'BEGIN x := 1; y := 2 END',
    parser: parseCompoundStatement,
    expected: 'begin\n  x := 1;\n  y := 2\nend',
  },
  { name: 'assignment statement', src: 'x := 42', parser: parseStatement, expected: 'x := 42' },
  {
    name: 'if-then statement',
    src: 'IF x > 0 THEN y := 1',
    parser: parseStatement,
    expected: 'if x > 0 then\n  y := 1',
  },
  {
    name: 'if-then-else statement',
    src: 'IF x > 0 THEN y := 1 ELSE y := 2',
    parser: parseStatement,
    expected: 'if x > 0 then\n  y := 1\nelse\n  y := 2',
  },
  {
    name: 'if-then compound body',
    src: 'IF x > 0 THEN BEGIN y := 1; z := 2 END',
    parser: parseStatement,
    expected: 'if x > 0 then\nbegin\n  y := 1;\n  z := 2\nend',
  },
  {
    name: 'while statement',
    src: 'WHILE x > 0 DO x := x - 1',
    parser: parseStatement,
    expected: 'while x > 0 do\n  x := x - 1',
  },
  {
    name: 'while compound body',
    src: 'WHILE x > 0 DO BEGIN x := x - 1; y := y + 1 END',
    parser: parseStatement,
    expected: 'while x > 0 do\nbegin\n  x := x - 1;\n  y := y + 1\nend',
  },
  {
    name: 'repeat statement',
    src: 'REPEAT x := x + 1 UNTIL x > 10',
    parser: parseStatement,
    expected: 'repeat\n  x := x + 1\nuntil x > 10',
  },
  {
    name: 'repeat multiple statements',
    src: 'REPEAT x := x + 1; y := y * 2 UNTIL x > 10',
    parser: parseStatement,
    expected: 'repeat\n  x := x + 1;\n  y := y * 2\nuntil x > 10',
  },
  {
    name: 'for-to statement',
    src: 'FOR i := 1 TO 10 DO x := x + i',
    parser: parseStatement,
    expected: 'for i := 1 TO 10 do\n  x := x + i',
  },
  {
    name: 'for-downto statement',
    src: 'FOR i := 10 DOWNTO 1 DO x := x + i',
    parser: parseStatement,
    expected: 'for i := 10 DOWNTO 1 do\n  x := x + i',
  },
  {
    name: 'for compound body',
    src: 'FOR i := 1 TO 3 DO BEGIN writeln(i); x := x + i END',
    parser: parseStatement,
    expected: 'for i := 1 TO 3 do\nbegin\n  WRITELN(i);\n  x := x + i\nend',
  },
  {
    name: 'case statement',
    src: 'CASE x OF 1: y := 10; 2: y := 20 END',
    parser: parseStatement,
    expected: 'case x of\n  1: y := 10;\n  2: y := 20\nend',
  },
  {
    name: 'case statement with otherwise',
    src: 'CASE x OF 1: y := 10; 2: y := 20 OTHERWISE y := 0 END',
    parser: parseStatement,
    expected: 'case x of\n  1: y := 10;\n  2: y := 20;\n  otherwise y := 0\nend',
  },
  {
    name: 'case statement multiple labels',
    src: 'CASE x OF 1, 3: y := 10; 2, 4: y := 20 END',
    parser: parseStatement,
    expected: 'case x of\n  1, 3: y := 10;\n  2, 4: y := 20\nend',
  },
  { name: 'goto statement', src: 'GOTO 100', parser: parseStatement, expected: 'goto 100' },
  { name: 'labeled statement', src: '100: x := 1', parser: parseStatement, expected: '100: x := 1' },
  {
    name: 'with statement',
    src: 'WITH r DO x := 1',
    parser: parseStatement,
    expected: 'with r do\n  x := 1',
  },
  {
    name: 'with compound body',
    src: 'WITH r DO BEGIN x := 1; y := 2 END',
    parser: parseStatement,
    expected: 'with r do\nbegin\n  x := 1;\n  y := 2\nend',
  },
  { name: 'procedure call no args', src: 'foo', parser: parseStatement, expected: 'foo' },
  {
    name: 'procedure call with args',
    src: 'writeln(1, 2)',
    parser: parseStatement,
    expected: 'WRITELN(1, 2)',
  },
])

// ============================================================================
// 类型
// ============================================================================

runExact('Printer: Types', [
  { name: 'simple type integer', src: 'INTEGER', parser: parseType, expected: 'INTEGER' },
  { name: 'simple type real', src: 'REAL', parser: parseType, expected: 'REAL' },
  { name: 'simple type boolean', src: 'BOOLEAN', parser: parseType, expected: 'BOOLEAN' },
  { name: 'simple type char', src: 'CHAR', parser: parseType, expected: 'CHAR' },
  { name: 'range type', src: '1..10', parser: parseType, expected: '1..10' },
  { name: 'range type char', src: "'a'..'z'", parser: parseType, expected: "'a'..'z'" },
  {
    name: 'array type',
    src: 'ARRAY [1..10] OF INTEGER',
    parser: parseType,
    expected: 'array[1..10] of INTEGER',
  },
  {
    name: 'array type multi-dim',
    src: 'ARRAY [1..10, 1..20] OF REAL',
    parser: parseType,
    expected: 'array[1..10, 1..20] of REAL',
  },
  {
    name: 'packed array type',
    src: 'PACKED ARRAY [1..10] OF CHAR',
    parser: parseType,
    expected: 'packed array[1..10] of CHAR',
  },
  {
    name: 'record type',
    src: 'RECORD x: INTEGER; y: INTEGER END',
    parser: parseType,
    expected: 'record x: INTEGER; y: INTEGER end',
  },
  { name: 'file type', src: 'FILE OF INTEGER', parser: parseType, expected: 'file of INTEGER' },
  { name: 'text file type', src: 'TEXT', parser: parseType, expected: 'TEXT' },
  { name: 'set type', src: 'SET OF 1..10', parser: parseType, expected: 'set of 1..10' },
  {
    name: 'enumeration type',
    src: '(red, green, blue)',
    parser: parseType,
    expected: '(red, green, blue)',
  },
])

// ============================================================================
// 程序 / 块（用 toContain 风格的子串断言）
// ============================================================================

runContains('Printer: Program & Block', [
  {
    name: 'simple program',
    src: 'PROGRAM test; BEGIN END.',
    parser: (input) => parseProgram(input),
    contains: ['program test;', 'begin\nend.'],
  },
  {
    name: 'program with parameters',
    src: 'PROGRAM test(input, output); BEGIN END.',
    parser: (input) => parseProgram(input),
    contains: ['program test(input, output);'],
  },
  {
    name: 'block with variable declarations',
    src: 'VAR x: INTEGER; y: REAL; BEGIN x := 1 END',
    parser: (input) => parseBlock(input),
    contains: ['var', 'x: INTEGER', 'y: REAL'],
  },
  {
    name: 'block with const declarations',
    src: 'CONST pi = 3.14; n = 10; BEGIN END',
    parser: (input) => parseBlock(input),
    contains: ['const', 'pi = 3.14', 'n = 10'],
  },
  {
    name: 'block with type declarations',
    src: 'TYPE Age = 0..120; Point = RECORD x: INTEGER; y: INTEGER END; BEGIN END',
    parser: (input) => parseBlock(input),
    contains: ['type', 'Age = 0..120'],
  },
  {
    name: 'block with label declarations',
    src: 'LABEL 10, 20; BEGIN 10: writeln(1); 20: writeln(2) END',
    parser: (input) => parseBlock(input),
    contains: ['label', '10, 20'],
  },
  {
    name: 'block with procedure declaration',
    src: 'PROCEDURE foo; BEGIN END; BEGIN END',
    parser: (input) => parseBlock(input),
    contains: ['procedure foo;'],
  },
  {
    name: 'block with function declaration',
    src: 'FUNCTION bar: INTEGER; BEGIN bar := 1 END; BEGIN END',
    parser: (input) => parseBlock(input),
    contains: ['function bar: INTEGER'],
  },
  {
    name: 'procedure with parameters',
    src: 'PROCEDURE foo(x: INTEGER; VAR y: REAL); BEGIN END; BEGIN END',
    parser: (input) => parseBlock(input),
    contains: ['procedure foo(x: INTEGER; var y: REAL)'],
  },
  {
    name: 'function with parameters',
    src: 'FUNCTION add(a, b: INTEGER): INTEGER; BEGIN add := a + b END; BEGIN END',
    parser: (input) => parseBlock(input),
    contains: ['function add(a, b: INTEGER): INTEGER'],
  },
  {
    name: 'forward procedure',
    src: 'PROCEDURE foo; FORWARD; PROCEDURE bar; BEGIN foo END; BEGIN END',
    parser: (input) => parseBlock(input),
    contains: ['procedure foo; forward'],
  },
  {
    name: 'forward function',
    src: 'FUNCTION bar: INTEGER; FORWARD; BEGIN END',
    parser: (input) => parseBlock(input),
    contains: ['function bar: INTEGER; forward'],
  },
])

// ============================================================================
// 幂等性测试：parse -> print -> parse -> print 结果一致
// ============================================================================

describe('Printer: Idempotency', () => {
  function testIdempotent(name: string, source: string, parser: (input: ParserInput) => ParseResult<AstNode>) {
    test(name, () => {
      const r1 = parser(makeInput(source))
      if (!r1.success) {
        throw new Error(`First parse failed: ${r1.error}`)
      }
      const printed1 = nodeToCode(r1.astNode as AstNode)

      const r2 = parser(makeInput(printed1))
      if (!r2.success) {
        throw new Error(`Second parse failed: ${r2.error}`)
      }
      const printed2 = nodeToCode(r2.astNode as AstNode)

      assertEquals(
        printed2,
        printed1,
        `idempotency failed for ${JSON.stringify(source)}.\n  1st: ${JSON.stringify(printed1)}\n  2nd: ${
          JSON.stringify(printed2)
        }`,
      )
    })
  }

  testIdempotent('expression', 'a + b * c', parseExpression)
  testIdempotent('compound statement', 'BEGIN x := 1; y := 2 END', parseCompoundStatement)
  testIdempotent('if statement', 'IF x > 0 THEN y := 1 ELSE y := 2', parseStatement)
  testIdempotent('while statement', 'WHILE x > 0 DO x := x - 1', parseStatement)
  testIdempotent('for statement', 'FOR i := 1 TO 10 DO x := x + i', parseStatement)
  testIdempotent('case statement', 'CASE x OF 1: y := 10; 2: y := 20 END', parseStatement)
  testIdempotent('set constructor', '[1, 3..5, 10]', parseExpression)
})
