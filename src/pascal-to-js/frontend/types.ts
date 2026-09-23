import { Position, Token } from './token.ts'
import { AstNode } from './node.ts'

export interface LexerInput {
  source: string
  offset: number
  offsetToPosition: (offset: number) => Position
}

export interface ParserInput {
  tokens: Token[]
  position: number
}

export type ParseResult<T = AstNode> =
  | { success: true; newPosition: number; astNode: T }
  | { success: false; error: string; position: number }
