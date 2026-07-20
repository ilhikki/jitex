// Goto 编译策略

import type { CompoundStatementNode, IntegerLiteralNode } from '../ast/types'
import { Scope } from './item'

export function emitBlockWithGoto(
  compound: CompoundStatementNode,
  scope: Scope,
  indent: number,
  labels: IntegerLiteralNode[]
): string {
  throw new Error('TODO')
}
