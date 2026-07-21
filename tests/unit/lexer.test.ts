import { lex } from '@/index'

describe('Lexer', () => {
  test('should tokenize identifiers and keywords', () => {
    const tokens = lex('PROGRAM test BEGIN END')
    expect(tokens[0].type).toBe('PROGRAM')
    expect(tokens[0].content).toBe('PROGRAM')
    expect(tokens[1].type).toBe('IDENTIFIER')
    expect(tokens[1].content).toBe('test')
    expect(tokens[2].type).toBe('BEGIN')
    expect(tokens[3].type).toBe('END')
  })

  test('should tokenize integers', () => {
    const tokens = lex('42 100')
    expect(tokens[0].type).toBe('INTEGER')
    expect(tokens[0].content).toBe('42')
    expect(tokens[1].type).toBe('INTEGER')
    expect(tokens[1].content).toBe('100')
  })

  test('should tokenize reals', () => {
    const tokens = lex('3.14 1.0E5')
    expect(tokens[0].type).toBe('REAL')
    expect(tokens[0].content).toBe('3.14')
    expect(tokens[1].type).toBe('REAL')
  })

  test('should tokenize hex numbers', () => {
    const tokens = lex('$1A2B')
    expect(tokens[0].type).toBe('HEX_NUMBER')
    expect(tokens[0].content).toBe('$1A2B')
  })

  test('should tokenize strings', () => {
    const tokens = lex("'hello world'")
    expect(tokens[0].type).toBe('STRING')
    expect(tokens[0].content).toBe('hello world')
  })

  test('should tokenize escaped quotes in strings', () => {
    const tokens = lex("'it''s ok'")
    expect(tokens[0].type).toBe('STRING')
    expect(tokens[0].content).toBe("it's ok")
  })

  test('should tokenize char codes with #', () => {
    const tokens = lex('#65 #$41')
    expect(tokens[0].type).toBe('CHAR_CODE')
    expect(tokens[0].content).toBe('#65')
    expect(tokens[1].type).toBe('CHAR_CODE')
    expect(tokens[1].content).toBe('#$41')
  })

  test('should tokenize operators', () => {
    const tokens = lex(':= <= >= <> .. ==')
    expect(tokens[0].type).toBe('ASSIGN')
    expect(tokens[1].type).toBe('LE')
    expect(tokens[2].type).toBe('GE')
    expect(tokens[3].type).toBe('NE')
    expect(tokens[4].type).toBe('DOTDOT')
    expect(tokens[5].type).toBe('EQEQ')
  })

  test('should skip comments', () => {
    const tokens = lex('{ this is a comment } PROGRAM')
    expect(tokens[0].type).toBe('PROGRAM')
  })

  test('should skip (* *) comments', () => {
    const tokens = lex('(* comment *) PROGRAM')
    expect(tokens[0].type).toBe('PROGRAM')
  })

  test('should skip compiler directives', () => {
    const tokens = lex('{$C-,A+,D-} PROGRAM')
    expect(tokens[0].type).toBe('PROGRAM')
  })

  test('should tokenize case-insensitive keywords', () => {
    const tokens = lex('program Begin end')
    expect(tokens[0].type).toBe('PROGRAM')
    expect(tokens[1].type).toBe('BEGIN')
    expect(tokens[2].type).toBe('END')
  })

  test('should treat predefined identifiers as IDENTIFIER', () => {
    const tokens = lex('INTEGER WRITE TRUE')
    expect(tokens[0].type).toBe('IDENTIFIER')
    expect(tokens[0].content).toBe('INTEGER')
    expect(tokens[1].type).toBe('IDENTIFIER')
    expect(tokens[2].type).toBe('IDENTIFIER')
  })

  test('should track positions', () => {
    const tokens = lex('PROGRAM\ntest')
    expect(tokens[0].start.line).toBe(1)
    expect(tokens[0].start.column).toBe(1)
    expect(tokens[1].start.line).toBe(2)
    expect(tokens[1].start.column).toBe(1)
  })

  test('should handle EOF', () => {
    const tokens = lex('PROGRAM')
    expect(tokens[tokens.length - 1].type).toBe('EOF')
  })
})
