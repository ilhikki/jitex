import { lex } from '@/index'
import { assert, assertEquals, describe, test } from '../_harness.ts'

interface Tok {
  type: string
  content?: string
  start?: { line: number; column: number }
}

function check(token: Tok, expectedType: string, expectedContent?: string, label?: string): void {
  const ctx = label ? `[${label}] ` : ''
  assertEquals(
    token.type,
    expectedType,
    `${ctx}expected type=${expectedType}, got type=${token.type} content=${JSON.stringify(token.content)}`,
  )
  if (expectedContent !== undefined) {
    assertEquals(
      token.content,
      expectedContent,
      `${ctx}type=${expectedType}: expected content=${JSON.stringify(expectedContent)}, got=${
        JSON.stringify(token.content)
      }`,
    )
  }
}

describe('Lexer', () => {
  test('should tokenize identifiers and keywords', () => {
    const t = lex('PROGRAM test BEGIN END')
    check(t[0], 'PROGRAM', 'PROGRAM', '0')
    check(t[1], 'IDENTIFIER', 'test', '1')
    check(t[2], 'BEGIN')
    check(t[3], 'END')
  })

  test('should tokenize integers', () => {
    const t = lex('42 100')
    check(t[0], 'INTEGER', '42', '0')
    check(t[1], 'INTEGER', '100', '1')
  })

  test('should tokenize reals', () => {
    const t = lex('3.14 1.0E5')
    check(t[0], 'REAL', '3.14', '0')
    check(t[1], 'REAL')
  })

  test('should tokenize hex numbers', () => {
    const t = lex('$1A2B')
    check(t[0], 'HEX_NUMBER', '$1A2B', '0')
  })

  test('should tokenize strings', () => {
    const t = lex("'hello world'")
    check(t[0], 'STRING', 'hello world', '0')
  })

  test('should tokenize escaped quotes in strings', () => {
    const t = lex("'it''s ok'")
    check(t[0], 'STRING', "it's ok", '0')
  })

  test('should tokenize char codes with #', () => {
    const t = lex('#65 #$41')
    check(t[0], 'CHAR_CODE', '#65', '0')
    check(t[1], 'CHAR_CODE', '#$41', '1')
  })

  test('should tokenize operators', () => {
    const t = lex(':= <= >= <> .. ==')
    check(t[0], 'ASSIGN', undefined, '0')
    check(t[1], 'LE', undefined, '1')
    check(t[2], 'GE', undefined, '2')
    check(t[3], 'NE', undefined, '3')
    check(t[4], 'DOTDOT', undefined, '4')
    check(t[5], 'EQEQ', undefined, '5')
  })

  test('should skip comments', () => {
    check(lex('{ this is a comment } PROGRAM')[0], 'PROGRAM')
  })

  test('should skip (* *) comments', () => {
    check(lex('(* comment *) PROGRAM')[0], 'PROGRAM')
  })

  test('should skip compiler directives', () => {
    check(lex('{$C-,A+,D-} PROGRAM')[0], 'PROGRAM')
  })

  test('should tokenize case-insensitive keywords', () => {
    const t = lex('program Begin end')
    check(t[0], 'PROGRAM')
    check(t[1], 'BEGIN')
    check(t[2], 'END')
  })

  test('should treat predefined identifiers as IDENTIFIER', () => {
    const t = lex('INTEGER WRITE TRUE')
    check(t[0], 'IDENTIFIER', 'INTEGER', '0')
    check(t[1], 'IDENTIFIER')
    check(t[2], 'IDENTIFIER')
  })

  test('should track positions', () => {
    const t = lex('PROGRAM\ntest')
    assertEquals(t[0].start!.line, 1, 'tok0 line=1')
    assertEquals(t[0].start!.column, 1, 'tok0 col=1')
    assertEquals(t[1].start!.line, 2, 'tok1 line=2')
    assertEquals(t[1].start!.column, 1, 'tok1 col=1')
  })

  test('should handle EOF', () => {
    const t = lex('PROGRAM')
    check(t[t.length - 1], 'EOF')
  })
})
