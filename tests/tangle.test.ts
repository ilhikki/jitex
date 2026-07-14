import * as fs from 'fs'
import * as path from 'path'
import { parse } from '../src/index'

describe('Tangle Official', () => {
  const pasFile = path.join(__dirname, '..', 'knuth', 'web', 'tangle-official.pas')

  test('should parse tangle-official.pas without error', () => {
    const source = fs.readFileSync(pasFile, 'utf-8')
    const result = parse(source)
    if (!result.success) {
      console.error('Parse error:', result.error, 'at position', result.position)
      // Print surrounding tokens for context
      const tokens = require('../src/lexer/lexer').lex(source)
      const pos = result.position
      const start = Math.max(0, pos - 3)
      const end = Math.min(tokens.length, pos + 3)
      for (let i = start; i < end; i++) {
        const t = tokens[i]
        const marker = i === pos ? ' >>> ' : '     '
        console.error(`${marker}[${i}] ${t.type} (${t.content}) at ${t.start.line}:${t.start.column}`)
      }
    }
    expect(result.success).toBe(true)
  })
})
