import { Position, Token } from '../token.ts'
import { LexerInput } from '../types.ts'

// Position helpers

export function createOffsetToPosition(source: string): (offset: number) => Position {
  // Pre-compute line start offsets for O(1) lookup
  const lineStarts: number[] = [0]
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') {
      lineStarts.push(i + 1)
    }
  }

  return (offset: number): Position => {
    // Binary search for line number
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo < hi) {
      const mid = ((lo + hi + 1) / 2) | 0
      if (lineStarts[mid] <= offset) {
        lo = mid
      } else {
        hi = mid - 1
      }
    }
    return {
      line: lo + 1,
      column: offset - lineStarts[lo] + 1,
      offset,
    }
  }
}

// Lexer — pure function: LexerInput => Token[]

// Only true reserved words — predefined identifiers (INTEGER, WRITE, etc.)
// remain as IDENTIFIER tokens and are handled by the parser.
const KEYWORDS = new Set([
  'PROGRAM',
  'LABEL',
  'CONST',
  'TYPE',
  'VAR',
  'PROCEDURE',
  'FUNCTION',
  'BEGIN',
  'END',
  'IF',
  'THEN',
  'ELSE',
  'WHILE',
  'DO',
  'REPEAT',
  'UNTIL',
  'FOR',
  'TO',
  'DOWNTO',
  'GOTO',
  'WITH',
  'AND',
  'OR',
  'NOT',
  'DIV',
  'MOD',
  'OF',
  'ARRAY',
  'RECORD',
  'FILE',
  'PACKED',
  'FORWARD',
  'CASE',
  'OTHERWISE',
  'SET',
  'IN',
])

function isLetter(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
}

function isDigit(c: string): boolean {
  return c >= '0' && c <= '9'
}

function isWhitespace(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r'
}

function isAlphaNum(c: string): boolean {
  return isLetter(c) || isDigit(c) || c === '_'
}

export function tokenize(input: LexerInput): Token[] {
  const tokens: Token[] = []
  const src = input.source
  const offsetToPos = input.offsetToPosition
  let pos = input.offset

  while (pos < src.length) {
    // Skip whitespace
    if (isWhitespace(src[pos])) {
      pos++
      continue
    }

    // Skip comments: { ... } or (* ... *)
    if (src[pos] === '{') {
      pos++
      // ISO 6.1.8: the construct
      // (`{' | `(*') commentary (`*)' | `}') shall be a comment, so either closing
      // delimiter terminates the comment regardless of which opening delimiter was used.
      while (pos < src.length && src[pos] !== '}' && !(src[pos] === '*' && src[pos + 1] === ')')) {
        pos++
      }
      if (pos < src.length) {
        pos += src[pos] === '}' ? 1 : 2
      }
      continue
    }

    if (src[pos] === '(' && pos + 1 < src.length && src[pos + 1] === '*') {
      pos += 2
      // ISO 6.1.8: `}` also terminates a comment opened with `(*`
      while (pos < src.length) {
        if (src[pos] === '}') {
          pos++
          break
        }
        if (src[pos] === '*' && pos + 1 < src.length && src[pos + 1] === ')') {
          pos += 2
          break
        }
        pos++
      }
      continue
    }

    // Skip WEB-style comments: {:NN} and {NN:} patterns used in tangle
    // These are already handled by the { ... } comment skip above

    // Identifiers and keywords
    if (isLetter(src[pos])) {
      const start = pos
      while (pos < src.length && isAlphaNum(src[pos])) {
        pos++
      }
      const content = src.substring(start, pos)
      const upper = content.toUpperCase()
      const type = KEYWORDS.has(upper) ? upper : 'IDENTIFIER'
      tokens.push({
        type,
        content,
        start: offsetToPos(start),
        end: offsetToPos(pos),
      })
      continue
    }

    // Numbers
    if (isDigit(src[pos])) {
      const start = pos
      while (pos < src.length && isDigit(src[pos])) {
        pos++
      }
      let isReal = false
      // ISO 6.1.5: unsigned-real = digit-sequence '.' [ fractional-part ] [ scale-factor ]
      //                       | digit-sequence scale-factor
      // so the fractional part is optional and a scale-factor may follow the
      // integer part directly (e.g. 5e3).
      if (pos < src.length && src[pos] === '.' && pos + 1 < src.length && src[pos + 1] !== '.') {
        isReal = true
        pos++
        while (pos < src.length && isDigit(src[pos])) {
          pos++
        }
      }
      // Optional scale-factor: ( 'e' | 'E' ) [ sign ] digit-sequence
      if (pos < src.length && (src[pos] === 'e' || src[pos] === 'E')) {
        const afterSign = src[pos + 1] === '+' || src[pos + 1] === '-' ? pos + 2 : pos + 1
        if (afterSign < src.length && isDigit(src[afterSign])) {
          isReal = true
          pos = afterSign
          while (pos < src.length && isDigit(src[pos])) {
            pos++
          }
        }
      }
      tokens.push({
        type: isReal ? 'REAL' : 'INTEGER',
        content: src.substring(start, pos),
        start: offsetToPos(start),
        end: offsetToPos(pos),
      })
      continue
    }

    // String literals
    if (src[pos] === "'") {
      const start = pos
      pos++
      let content = ''
      while (pos < src.length) {
        if (src[pos] === "'") {
          if (pos + 1 < src.length && src[pos + 1] === "'") {
            // Doubled quote = escaped quote
            content += "'"
            pos += 2
          } else {
            pos++
            break
          }
        } else {
          content += src[pos]
          pos++
        }
      }
      tokens.push({
        type: 'STRING',
        content,
        start: offsetToPos(start),
        end: offsetToPos(pos),
      })
      continue
    }

    // Multi-character operators
    const start = pos
    const c = src[pos]
    let type = ''
    let consumed = 1

    switch (c) {
      case ':':
        if (src[pos + 1] === '=') {
          type = 'ASSIGN'
          consumed = 2
        } else {
          type = 'COLON'
        }
        break
      case '<':
        if (src[pos + 1] === '=') {
          type = 'LE'
          consumed = 2
        } else if (src[pos + 1] === '>') {
          type = 'NE'
          consumed = 2
        } else {
          type = 'LT'
        }
        break
      case '>':
        if (src[pos + 1] === '=') {
          type = 'GE'
          consumed = 2
        } else {
          type = 'GT'
        }
        break
      case '.':
        if (src[pos + 1] === '.') {
          type = 'DOTDOT'
          consumed = 2
        } else {
          type = 'DOT'
        }
        break
      case '=':
        type = 'EQUAL'
        break
      case '+':
        type = 'PLUS'
        break
      case '-':
        type = 'MINUS'
        break
      case '*':
        type = 'STAR'
        break
      case '/':
        type = 'SLASH'
        break
      case '(':
        type = 'LPAREN'
        break
      case ')':
        type = 'RPAREN'
        break
      case '[':
        type = 'LBRACKET'
        break
      case ']':
        type = 'RBRACKET'
        break
      case ';':
        type = 'SEMICOLON'
        break
      case ',':
        type = 'COMMA'
        break
      case '^':
        type = 'CARET'
        break
      default:
        type = 'UNKNOWN'
        break
    }

    tokens.push({
      type,
      content: src.substring(start, start + consumed),
      start: offsetToPos(start),
      end: offsetToPos(start + consumed),
    })
    pos += consumed
  }

  tokens.push({
    type: 'EOF',
    content: '',
    start: offsetToPos(pos),
    end: offsetToPos(pos),
  })

  return tokens
}

// Convenience wrapper for simple usage
export function lex(source: string): Token[] {
  const offsetToPosition = createOffsetToPosition(source)
  return tokenize({ source, offset: 0, offsetToPosition })
}
