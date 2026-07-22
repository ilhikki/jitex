import {
  AssignmentNode,
  CaseBranchNode,
  CaseStatementNode,
  CompoundStatementNode,
  EmptyStatementNode,
  ExpressionNode,
  ForStatementNode,
  GotoStatementNode,
  IdentifierNode,
  IfStatementNode,
  IntegerLiteralNode,
  LabeledStatementNode,
  ParseResult,
  ParserInput,
  ProcedureCallNode,
  RepeatStatementNode,
  StatementNode,
  WhileStatementNode,
  WithStatementNode,
} from '../ast/types'
import { expectKeyword, expectType, fail, ok, parseList, peek, withLoc } from './helpers'
import { parseExpression, parseIdentifier, parsePrimary } from './expressions'

// ============================================================================
// Statement Parsers
// ============================================================================

// parseStatement — dispatches based on lookahead
export function parseStatement(input: ParserInput): ParseResult<StatementNode> {
  const token = peek(input)

  switch (token.type) {
    case 'BEGIN':
      return parseCompoundStatement(input)

    case 'IF':
      return parseIfStatement(input)

    case 'WHILE':
      return parseWhileStatement(input)

    case 'REPEAT':
      return parseRepeatStatement(input)

    case 'FOR':
      return parseForStatement(input)

    case 'CASE':
      return parseCaseStatement(input)

    case 'GOTO':
      return parseGotoStatement(input)

    case 'WITH':
      return parseWithStatement(input)

    case 'IDENTIFIER':
      // Could be assignment or procedure call
      return parseAssignmentOrCall(input)

    case 'INTEGER':
      // Labeled statement: 9999: statement
      return parseLabeledStatement(input)

    case 'SEMICOLON':
    case 'ELSE':
    case 'END':
    case 'UNTIL':
    case 'EOF':
      // Empty statement
      return ok(
        input.position,
        withLoc({ kind: 'EmptyStatement' } as EmptyStatementNode, token.start, token.end)
      )

    default:
      return ok(
        input.position,
        withLoc({ kind: 'EmptyStatement' } as EmptyStatementNode, token.start, token.end)
      )
  }
}

// BEGIN statements END
export function parseCompoundStatement(input: ParserInput): ParseResult<CompoundStatementNode> {
  const startToken = peek(input)
  const beginResult = expectKeyword(input, 'BEGIN')
  if (!beginResult.success) return fail(beginResult.error, beginResult.position)
  let pos = beginResult.newPosition
  const statements: StatementNode[] = []

  while (peek({ tokens: input.tokens, position: pos }).type !== 'END') {
    const stmtResult = parseStatement({ tokens: input.tokens, position: pos })
    if (!stmtResult.success) return fail(stmtResult.error, stmtResult.position)
    statements.push(stmtResult.astNode)
    pos = stmtResult.newPosition

    // Expect semicolon between statements
    const semi = peek({ tokens: input.tokens, position: pos })
    if (semi.type === 'SEMICOLON') {
      pos++
    } else if (semi.type !== 'END') {
      return fail(
        `Expected ; or END but got ${semi.type} (${semi.content}) at line ${semi.start.line}:${semi.start.column}`,
        pos
      )
    }
  }

  const endResult = expectKeyword({ tokens: input.tokens, position: pos }, 'END')
  if (!endResult.success) return fail(endResult.error, endResult.position)
  pos = endResult.newPosition

  return ok(
    pos,
    withLoc(
      { kind: 'CompoundStatement', statements } as CompoundStatementNode,
      startToken.start,
      endResult.astNode.end
    )
  )
}

function parseLabeledStatement(input: ParserInput): ParseResult<StatementNode> {
  // label: statement
  const startToken = peek(input)
  const labelToken = peek(input)
  const labelValue = parseInt(labelToken.content, 10)
  if (labelValue < 0 || labelValue > 9999) {
    return fail(`Label ${labelValue} out of range (0..9999) at line ${labelToken.start.line}`, input.position)
  }
  let pos = input.position + 1

  const colonResult = expectType({ tokens: input.tokens, position: pos }, 'COLON')
  if (!colonResult.success) return fail(colonResult.error, colonResult.position)
  pos = colonResult.newPosition

  const stmtResult = parseStatement({ tokens: input.tokens, position: pos })
  if (!stmtResult.success) return fail(stmtResult.error, stmtResult.position)

  return ok(
    stmtResult.newPosition,
    withLoc(
      {
        kind: 'LabeledStatement',
        label: {
          kind: 'IntegerLiteral',
          value: labelValue,
          raw: labelToken.content,
        } as IntegerLiteralNode,
        statement: stmtResult.astNode,
      } as LabeledStatementNode,
      startToken.start,
      input.tokens[stmtResult.newPosition - 1].end
    )
  )
}

function parseAssignmentOrCall(input: ParserInput): ParseResult<StatementNode> {
  const startToken = peek(input)
  const token = peek(input)

  // Special handling for WRITE/WRITELN — they support format specifiers: expr:width:precision
  if (token.type === 'IDENTIFIER') {
    const upper = token.content.toUpperCase()
    if (upper === 'WRITE' || upper === 'WRITELN') {
      return parseWriteCall(input, upper)
    }
  }

  // Parse an expression first (handles identifier, array access, field access, function call)
  const exprResult = parsePrimary(input)
  if (!exprResult.success) return fail(exprResult.error, exprResult.position)

  let pos = exprResult.newPosition
  const nextToken = peek({ tokens: input.tokens, position: pos })

  if (nextToken.type === 'ASSIGN') {
    // Assignment statement
    pos++
    const rightResult = parseExpression({ tokens: input.tokens, position: pos })
    if (!rightResult.success) return fail(rightResult.error, rightResult.position)
    pos = rightResult.newPosition

    return ok(
      pos,
      withLoc(
        {
          kind: 'Assignment',
          left: exprResult.astNode,
          right: rightResult.astNode,
        } as AssignmentNode,
        startToken.start,
        input.tokens[pos - 1].end
      )
    )
  }

  // If it's a function call without :=, it's a procedure call
  if (exprResult.astNode.kind === 'FunctionCall') {
    return ok(
      pos,
      withLoc(
        {
          kind: 'ProcedureCall',
          name: (exprResult.astNode as any).name,
          arguments: (exprResult.astNode as any).arguments,
        } as ProcedureCallNode,
        startToken.start,
        input.tokens[pos - 1].end
      )
    )
  }

  // If it's just an identifier, it's a procedure call with no args
  if (exprResult.astNode.kind === 'Identifier') {
    return ok(
      pos,
      withLoc(
        {
          kind: 'ProcedureCall',
          name: exprResult.astNode as IdentifierNode,
          arguments: [],
        } as ProcedureCallNode,
        startToken.start,
        input.tokens[pos - 1].end
      )
    )
  }

  return fail(
    `Expected := but got ${nextToken.type} (${nextToken.content}) at line ${nextToken.start.line}:${nextToken.start.column}`,
    pos
  )
}

// Parse WRITE/WRITELN with format specifiers: WRITE([file,] expr[:width[:precision]] {, expr[:width[:precision]]})
function parseWriteCall(input: ParserInput, name: string): ParseResult<StatementNode> {
  const startToken = peek(input)
  let pos = input.position + 1 // skip WRITE/WRITELN
  const args: ExpressionNode[] = []

  if (peek({ tokens: input.tokens, position: pos }).type === 'LPAREN') {
    pos++ // skip (
    while (peek({ tokens: input.tokens, position: pos }).type !== 'RPAREN') {
      const exprResult = parseExpression({ tokens: input.tokens, position: pos })
      if (!exprResult.success) return fail(exprResult.error, exprResult.position)
      pos = exprResult.newPosition

      let arg = exprResult.astNode

      // Check for format specifier: :width[:precision]
      if (peek({ tokens: input.tokens, position: pos }).type === 'COLON') {
        pos++ // skip :
        const widthResult = parseExpression({ tokens: input.tokens, position: pos })
        if (!widthResult.success) return fail(widthResult.error, widthResult.position)
        pos = widthResult.newPosition

        // Wrap in a special node — use BinaryExpression with ":" operator to represent format
        arg = {
          kind: 'BinaryExpression',
          left: arg,
          operator: ':',
          right: widthResult.astNode,
        } as any

        // Check for :precision
        if (peek({ tokens: input.tokens, position: pos }).type === 'COLON') {
          pos++
          const precResult = parseExpression({ tokens: input.tokens, position: pos })
          if (!precResult.success) return fail(precResult.error, precResult.position)
          pos = precResult.newPosition
          arg = {
            kind: 'BinaryExpression',
            left: arg,
            operator: ':',
            right: precResult.astNode,
          } as any
        }
      }

      args.push(arg)

      if (peek({ tokens: input.tokens, position: pos }).type !== 'COMMA') break
      pos++
    }
    const closeResult = expectType({ tokens: input.tokens, position: pos }, 'RPAREN')
    if (!closeResult.success) return fail(closeResult.error, closeResult.position)
    pos = closeResult.newPosition
  }

  return ok(
    pos,
    withLoc(
      {
        kind: 'ProcedureCall',
        name: { kind: 'Identifier', name } as IdentifierNode,
        arguments: args,
      } as ProcedureCallNode,
      startToken.start,
      input.tokens[pos - 1].end
    )
  )
}

// IF expression THEN statement [ELSE statement]
function parseIfStatement(input: ParserInput): ParseResult<IfStatementNode> {
  const startToken = peek(input)
  let pos = input.position + 1 // skip IF

  const condResult = parseExpression({ tokens: input.tokens, position: pos })
  if (!condResult.success) return fail(condResult.error, condResult.position)
  pos = condResult.newPosition

  const thenResult = expectKeyword({ tokens: input.tokens, position: pos }, 'THEN')
  if (!thenResult.success) return fail(thenResult.error, thenResult.position)
  pos = thenResult.newPosition

  const thenStmtResult = parseStatement({ tokens: input.tokens, position: pos })
  if (!thenStmtResult.success) return fail(thenStmtResult.error, thenStmtResult.position)
  pos = thenStmtResult.newPosition

  let elseBranch: StatementNode | null = null
  if (peek({ tokens: input.tokens, position: pos }).type === 'ELSE') {
    pos++
    const elseResult = parseStatement({ tokens: input.tokens, position: pos })
    if (!elseResult.success) return fail(elseResult.error, elseResult.position)
    elseBranch = elseResult.astNode
    pos = elseResult.newPosition
  }

  return ok(
    pos,
    withLoc(
      {
        kind: 'IfStatement',
        condition: condResult.astNode,
        thenBranch: thenStmtResult.astNode,
        elseBranch,
      } as IfStatementNode,
      startToken.start,
      input.tokens[pos - 1].end
    )
  )
}

// WHILE expression DO statement
function parseWhileStatement(input: ParserInput): ParseResult<WhileStatementNode> {
  const startToken = peek(input)
  let pos = input.position + 1 // skip WHILE

  const condResult = parseExpression({ tokens: input.tokens, position: pos })
  if (!condResult.success) return fail(condResult.error, condResult.position)
  pos = condResult.newPosition

  const doResult = expectKeyword({ tokens: input.tokens, position: pos }, 'DO')
  if (!doResult.success) return fail(doResult.error, doResult.position)
  pos = doResult.newPosition

  const bodyResult = parseStatement({ tokens: input.tokens, position: pos })
  if (!bodyResult.success) return fail(bodyResult.error, bodyResult.position)
  pos = bodyResult.newPosition

  return ok(
    pos,
    withLoc(
      {
        kind: 'WhileStatement',
        condition: condResult.astNode,
        body: bodyResult.astNode,
      } as WhileStatementNode,
      startToken.start,
      input.tokens[pos - 1].end
    )
  )
}

// REPEAT statements UNTIL expression
function parseRepeatStatement(input: ParserInput): ParseResult<RepeatStatementNode> {
  const startToken = peek(input)
  let pos = input.position + 1 // skip REPEAT
  const statements: StatementNode[] = []

  while (peek({ tokens: input.tokens, position: pos }).type !== 'UNTIL') {
    const stmtResult = parseStatement({ tokens: input.tokens, position: pos })
    if (!stmtResult.success) return fail(stmtResult.error, stmtResult.position)
    statements.push(stmtResult.astNode)
    pos = stmtResult.newPosition

    const semi = peek({ tokens: input.tokens, position: pos })
    if (semi.type === 'SEMICOLON') {
      pos++
    } else if (semi.type !== 'UNTIL') {
      return fail(
        `Expected ; or UNTIL but got ${semi.type} at line ${semi.start.line}:${semi.start.column}`,
        pos
      )
    }
  }

  const untilResult = expectKeyword({ tokens: input.tokens, position: pos }, 'UNTIL')
  if (!untilResult.success) return fail(untilResult.error, untilResult.position)
  pos = untilResult.newPosition

  const condResult = parseExpression({ tokens: input.tokens, position: pos })
  if (!condResult.success) return fail(condResult.error, condResult.position)
  pos = condResult.newPosition

  return ok(
    pos,
    withLoc(
      {
        kind: 'RepeatStatement',
        statements,
        untilCondition: condResult.astNode,
      } as RepeatStatementNode,
      startToken.start,
      input.tokens[pos - 1].end
    )
  )
}

// FOR identifier := expression (TO|DOWNTO) expression DO statement
function parseForStatement(input: ParserInput): ParseResult<ForStatementNode> {
  const startToken = peek(input)
  let pos = input.position + 1 // skip FOR

  const varResult = parseIdentifier({ tokens: input.tokens, position: pos })
  if (!varResult.success) return fail(varResult.error, varResult.position)
  pos = varResult.newPosition

  const assignResult = expectType({ tokens: input.tokens, position: pos }, 'ASSIGN')
  if (!assignResult.success) return fail(assignResult.error, assignResult.position)
  pos = assignResult.newPosition

  const initResult = parseExpression({ tokens: input.tokens, position: pos })
  if (!initResult.success) return fail(initResult.error, initResult.position)
  pos = initResult.newPosition

  // TO or DOWNTO
  const dirToken = peek({ tokens: input.tokens, position: pos })
  let direction: 'TO' | 'DOWNTO'
  if (dirToken.type === 'TO') {
    direction = 'TO'
    pos++
  } else if (dirToken.type === 'DOWNTO') {
    direction = 'DOWNTO'
    pos++
  } else {
    return fail(
      `Expected TO or DOWNTO but got ${dirToken.type} at line ${dirToken.start.line}`,
      pos
    )
  }

  const finalResult = parseExpression({ tokens: input.tokens, position: pos })
  if (!finalResult.success) return fail(finalResult.error, finalResult.position)
  pos = finalResult.newPosition

  const doResult = expectKeyword({ tokens: input.tokens, position: pos }, 'DO')
  if (!doResult.success) return fail(doResult.error, doResult.position)
  pos = doResult.newPosition

  const bodyResult = parseStatement({ tokens: input.tokens, position: pos })
  if (!bodyResult.success) return fail(bodyResult.error, bodyResult.position)
  pos = bodyResult.newPosition

  return ok(
    pos,
    withLoc(
      {
        kind: 'ForStatement',
        variable: varResult.astNode,
        initial: initResult.astNode,
        final: finalResult.astNode,
        direction,
        body: bodyResult.astNode,
      } as ForStatementNode,
      startToken.start,
      input.tokens[pos - 1].end
    )
  )
}

// CASE expression OF case_branch {; case_branch} [; OTHERWISE statement] END
function parseCaseStatement(input: ParserInput): ParseResult<CaseStatementNode> {
  const startToken = peek(input)
  let pos = input.position + 1 // skip CASE

  const exprResult = parseExpression({ tokens: input.tokens, position: pos })
  if (!exprResult.success) return fail(exprResult.error, exprResult.position)
  pos = exprResult.newPosition

  const ofResult = expectKeyword({ tokens: input.tokens, position: pos }, 'OF')
  if (!ofResult.success) return fail(ofResult.error, ofResult.position)
  pos = ofResult.newPosition

  const branches: CaseBranchNode[] = []
  let otherwise: StatementNode | null = null

  while (peek({ tokens: input.tokens, position: pos }).type !== 'END') {
    // Check for OTHERWISE / OTHERS (UCSD Pascal 别名)
    // 两种语法：`OTHERWISE statement` 或 `OTHERS: statement`
    const peekTok = peek({ tokens: input.tokens, position: pos })
    if (
      peekTok.type === 'OTHERWISE' ||
      (peekTok.type === 'IDENTIFIER' && peekTok.content.toUpperCase() === 'OTHERS')
    ) {
      pos++
      // 可选冒号（OTHERS: statement 风格）
      if (peek({ tokens: input.tokens, position: pos }).type === 'COLON') {
        pos++
      }
      const stmtResult = parseStatement({ tokens: input.tokens, position: pos })
      if (!stmtResult.success) return fail(stmtResult.error, stmtResult.position)
      otherwise = stmtResult.astNode
      pos = stmtResult.newPosition
      // Skip trailing semicolons before END (same as ordinary branches)
      while (peek({ tokens: input.tokens, position: pos }).type === 'SEMICOLON') {
        pos++
      }
      break
    }

    // Parse case labels
    const labelsResult = parseList(
      { tokens: input.tokens, position: pos },
      parseExpression,
      'COMMA'
    )
    if (!labelsResult.success) return fail(labelsResult.error, labelsResult.position)
    pos = labelsResult.newPosition

    const colonResult = expectType({ tokens: input.tokens, position: pos }, 'COLON')
    if (!colonResult.success) return fail(colonResult.error, colonResult.position)
    pos = colonResult.newPosition

    const stmtResult = parseStatement({ tokens: input.tokens, position: pos })
    if (!stmtResult.success) return fail(stmtResult.error, stmtResult.position)
    pos = stmtResult.newPosition

    branches.push({
      kind: 'CaseBranch',
      labels: labelsResult.astNode,
      statement: stmtResult.astNode,
    } as CaseBranchNode)

    // Skip semicolons
    while (peek({ tokens: input.tokens, position: pos }).type === 'SEMICOLON') {
      pos++
    }
  }

  const endResult = expectKeyword({ tokens: input.tokens, position: pos }, 'END')
  if (!endResult.success) return fail(endResult.error, endResult.position)
  pos = endResult.newPosition

  return ok(
    pos,
    withLoc(
      {
        kind: 'CaseStatement',
        expression: exprResult.astNode,
        branches,
        otherwise,
      } as CaseStatementNode,
      startToken.start,
      endResult.astNode.end
    )
  )
}

// GOTO label
function parseGotoStatement(input: ParserInput): ParseResult<GotoStatementNode> {
  const startToken = peek(input)
  let pos = input.position + 1 // skip GOTO

  const token = peek({ tokens: input.tokens, position: pos })
  if (token.type !== 'INTEGER') {
    return fail(`Expected label after GOTO but got ${token.type} at line ${token.start.line}`, pos)
  }
  pos++

  return ok(
    pos,
    withLoc(
      {
        kind: 'GotoStatement',
        label: {
          kind: 'IntegerLiteral',
          value: parseInt(token.content, 10),
          raw: token.content,
        } as IntegerLiteralNode,
      } as GotoStatementNode,
      startToken.start,
      token.end
    )
  )
}

// WITH expression {, expression} DO statement
function parseWithStatement(input: ParserInput): ParseResult<WithStatementNode> {
  const startToken = peek(input)
  let pos = input.position + 1 // skip WITH

  const recordsResult = parseList({ tokens: input.tokens, position: pos }, parseExpression, 'COMMA')
  if (!recordsResult.success) return fail(recordsResult.error, recordsResult.position)
  pos = recordsResult.newPosition

  const doResult = expectKeyword({ tokens: input.tokens, position: pos }, 'DO')
  if (!doResult.success) return fail(doResult.error, doResult.position)
  pos = doResult.newPosition

  const bodyResult = parseStatement({ tokens: input.tokens, position: pos })
  if (!bodyResult.success) return fail(bodyResult.error, bodyResult.position)
  pos = bodyResult.newPosition

  return ok(
    pos,
    withLoc(
      {
        kind: 'WithStatement',
        records: recordsResult.astNode,
        body: bodyResult.astNode,
      } as WithStatementNode,
      startToken.start,
      input.tokens[pos - 1].end
    )
  )
}
