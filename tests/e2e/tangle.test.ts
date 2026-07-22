import * as fs from 'fs'
import { parse } from '@/index'
import { lex } from '@/lexer/lexer'
import { resourcePath, TANGLE_PAS } from './_helper'
import { describe, test, expect } from 'vitest'

describe.skip('Tangle Official - SKIPPED until Phase 7', () => {
  const pasFile = resourcePath(TANGLE_PAS)

  test('should parse tangle-official.pas without error', () => {
    const source = fs.readFileSync(pasFile, 'utf-8')
    const result = parse(source)
    if (!result.success) {
      console.error('Parse error:', result.error, 'at position', result.position)
      const tokens = lex(source)
      const pos = result.position
      const start = Math.max(0, pos - 3)
      const end = Math.min(tokens.length, pos + 3)
      for (let i = start; i < end; i++) {
        const t = tokens[i]
        const marker = i === pos ? ' >>> ' : '     '
        console.error(
          `${marker}[${i}] ${t.type} (${t.content}) at ${t.start.line}:${t.start.column}`
        )
      }
    }
    expect(result.success).toBe(true)
  })
})
