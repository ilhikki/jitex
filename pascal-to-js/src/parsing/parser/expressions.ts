import { ParseResult, ParserInput } from '@/parsing/types.ts'
import { expectType, fail, loc, ok, parseList, peek, withLoc } from './helpers.ts'
import {
  ArrayAccessNode,
  BinaryExpressionNode,
  BooleanLiteralNode,
  CharLiteralNode,
  ExpressionNode,
  FieldAccessNode,
  FunctionCallNode,
  IdentifierNode,
  IntegerLiteralNode,
  ParenthesizedExpressionNode,
  RealLiteralNode,
  SetConstructorNode,
  StringLiteralNode,
  UnaryExpressionNode,
} from '@/parsing/node.ts'

// ============================================================================
// Expression Parsers
// ============================================================================

// parseIdentifier: IDENTIFIER
export function parseIdentifier(input: ParserInput): ParseResult<IdentifierNode> {
  const token = peek(input)
  if (token.type !== 'IDENTIFIER') {
    return fail(
      `Expected identifier but got ${token.type} (${token.content}) at line ${token.start.line}:${token.start.column}`,
      input.position,
    )
  }
  return ok(
    input.position + 1,
    loc({ kind: 'Identifier', name: token.content } as IdentifierNode, token),
  )
}

// parsePrimary — the base factor
export function parsePrimary(input: ParserInput): ParseResult<ExpressionNode> {
  const token = peek(input)

  switch (token.type) {
    case 'INTEGER': {
      return ok(
        input.position + 1,
        withLoc(
          {
            kind: 'IntegerLiteral',
            value: parseInt(token.content, 10),
            raw: token.content,
          } as IntegerLiteralNode,
          token.start,
          token.end,
        ),
      )
    }

    case 'HEX_NUMBER': {
      return ok(
        input.position + 1,
        withLoc(
          {
            kind: 'IntegerLiteral',
            value: parseInt(token.content.substring(1), 16),
            raw: token.content,
          } as IntegerLiteralNode,
          token.start,
          token.end,
        ),
      )
    }

    case 'REAL': {
      return ok(
        input.position + 1,
        withLoc(
          {
            kind: 'RealLiteral',
            value: parseFloat(token.content),
            raw: token.content,
          } as RealLiteralNode,
          token.start,
          token.end,
        ),
      )
    }

    case 'STRING': {
      if (token.content.length === 1) {
        return ok(
          input.position + 1,
          withLoc(
            {
              kind: 'CharLiteral',
              value: token.content,
              raw: token.content,
            } as CharLiteralNode,
            token.start,
            token.end,
          ),
        )
      }
      return ok(
        input.position + 1,
        withLoc(
          {
            kind: 'StringLiteral',
            value: token.content,
            raw: token.content,
          } as StringLiteralNode,
          token.start,
          token.end,
        ),
      )
    }

    case 'CHAR_CODE': {
      // #65 or #$41
      const content = token.content
      let value: number
      if (content[1] === '$') {
        value = parseInt(content.substring(2), 16)
      } else {
        value = parseInt(content.substring(1), 10)
      }
      return ok(
        input.position + 1,
        withLoc(
          {
            kind: 'CharLiteral',
            value: String.fromCharCode(value),
            raw: token.content,
          } as CharLiteralNode,
          token.start,
          token.end,
        ),
      )
    }

    case 'IDENTIFIER':
      // Handle TRUE/FALSE/NIL as identifiers (predefined, not reserved)
      if (token.content.toUpperCase() === 'TRUE') {
        return ok(
          input.position + 1,
          loc({ kind: 'BooleanLiteral', value: true } as BooleanLiteralNode, token),
        )
      }
      if (token.content.toUpperCase() === 'FALSE') {
        return ok(
          input.position + 1,
          loc({ kind: 'BooleanLiteral', value: false } as BooleanLiteralNode, token),
        )
      }
      if (token.content.toUpperCase() === 'NIL') {
        return ok(
          input.position + 1,
          loc({ kind: 'Identifier', name: 'NIL' } as IdentifierNode, token),
        )
      }
      // Could be: identifier, function call, array access, field access
      return parsePostfix(input)

    case 'LPAREN': {
      // Could be parenthesized expression or set constructor
      const startPos = input.position
      const startToken = token
      const afterParen = { tokens: input.tokens, position: startPos + 1 }

      // Check for set constructor: [ ... ]
      // Actually ( ... ) with no colon is just a parenthesized expression
      // Set constructors use [ ] in Pascal

      const exprResult = parseExpression(afterParen)
      if (!exprResult.success) {
        return fail(exprResult.error, exprResult.position)
      }

      let pos = exprResult.newPosition
      const closeResult = expectType({ tokens: input.tokens, position: pos }, 'RPAREN')
      if (!closeResult.success) {
        return fail(closeResult.error, closeResult.position)
      }
      const endToken = closeResult.astNode
      pos = closeResult.newPosition

      return ok(
        pos,
        withLoc(
          {
            kind: 'ParenthesizedExpression',
            expression: exprResult.astNode,
          } as ParenthesizedExpressionNode,
          startToken.start,
          endToken.end,
        ),
      )
    }

    case 'LBRACKET': {
      return parseSetConstructor(input)
    }

    case 'NOT':
      return parseNot(input)

    case 'MINUS': {
      // Unary minus
      const startToken = token
      const afterMinus = { tokens: input.tokens, position: input.position + 1 }
      const operandResult = parseFactor(afterMinus)
      if (!operandResult.success) {
        return fail(operandResult.error, operandResult.position)
      }
      const endToken = peek({ tokens: input.tokens, position: operandResult.newPosition - 1 })
      return ok(
        operandResult.newPosition,
        withLoc(
          {
            kind: 'UnaryExpression',
            operator: '-',
            operand: operandResult.astNode,
          } as UnaryExpressionNode,
          startToken.start,
          endToken.end,
        ),
      )
    }

    case 'PLUS': {
      // Unary plus (no-op but still parse)
      const startToken = token
      const afterPlus = { tokens: input.tokens, position: input.position + 1 }
      const operandResult = parseFactor(afterPlus)
      if (!operandResult.success) {
        return fail(operandResult.error, operandResult.position)
      }
      const endToken = peek({ tokens: input.tokens, position: operandResult.newPosition - 1 })
      return ok(
        operandResult.newPosition,
        withLoc(
          {
            kind: 'UnaryExpression',
            operator: '+',
            operand: operandResult.astNode,
          } as UnaryExpressionNode,
          startToken.start,
          endToken.end,
        ),
      )
    }

    default:
      return fail(
        `Unexpected token ${token.type} (${token.content}) at line ${token.start.line}:${token.start.column}`,
        input.position,
      )
  }
}

function parseSetConstructor(input: ParserInput): ParseResult<SetConstructorNode> {
  const startPos = input.position
  const startToken = peek(input)
  // Skip [
  let pos = startPos + 1
  const elements: [ExpressionNode, ExpressionNode | null][] = []

  if (peek({ tokens: input.tokens, position: pos }).type !== 'RBRACKET') {
    while (true) {
      const exprResult = parseExpression({ tokens: input.tokens, position: pos })
      if (!exprResult.success) {
        return fail(exprResult.error, exprResult.position)
      }
      pos = exprResult.newPosition

      let element: [ExpressionNode, ExpressionNode | null] = [exprResult.astNode, null]
      if (peek({ tokens: input.tokens, position: pos }).type === 'DOTDOT') {
        pos++
        const endResult = parseExpression({ tokens: input.tokens, position: pos })
        if (!endResult.success) {
          return fail(endResult.error, endResult.position)
        }
        pos = endResult.newPosition
        element = [exprResult.astNode, endResult.astNode]
      }
      elements.push(element)

      const t = peek({ tokens: input.tokens, position: pos })
      if (t.type !== 'COMMA') {
        break
      }
      pos++
    }
  }

  const closeResult = expectType({ tokens: input.tokens, position: pos }, 'RBRACKET')
  if (!closeResult.success) {
    return fail(closeResult.error, closeResult.position)
  }
  const endToken = closeResult.astNode
  pos = closeResult.newPosition

  return ok(
    pos,
    loc({ kind: 'SetConstructor', elements } as SetConstructorNode, startToken, endToken),
  )
}

// parsePostfix — handles function calls, array access, field access
export function parsePostfix(input: ParserInput): ParseResult<ExpressionNode> {
  const startToken = peek(input)
  const idResult = parseIdentifier(input)
  if (!idResult.success) {
    return fail(idResult.error, idResult.position)
  }

  let pos = idResult.newPosition
  let expr: ExpressionNode = idResult.astNode
  let endPos = peek({ tokens: input.tokens, position: pos - 1 }).end

  while (true) {
    const token = peek({ tokens: input.tokens, position: pos })

    if (token.type === 'LPAREN') {
      // Function call
      pos++
      const args: ExpressionNode[] = []
      if (peek({ tokens: input.tokens, position: pos }).type !== 'RPAREN') {
        const listResult = parseList(
          { tokens: input.tokens, position: pos },
          parseExpression,
          'COMMA',
        )
        if (!listResult.success) {
          return fail(listResult.error, listResult.position)
        }
        args.push(...listResult.astNode)
        pos = listResult.newPosition
      }
      const closeResult = expectType({ tokens: input.tokens, position: pos }, 'RPAREN')
      if (!closeResult.success) {
        return fail(closeResult.error, closeResult.position)
      }
      endPos = closeResult.astNode.end
      pos = closeResult.newPosition
      expr = withLoc(
        { kind: 'FunctionCall', name: idResult.astNode, arguments: args } as FunctionCallNode,
        startToken.start,
        endPos,
      )
    } else if (token.type === 'LBRACKET') {
      // Array access
      pos++
      const indices: ExpressionNode[] = []
      const listResult = parseList(
        { tokens: input.tokens, position: pos },
        parseExpression,
        'COMMA',
      )
      if (!listResult.success) {
        return fail(listResult.error, listResult.position)
      }
      indices.push(...listResult.astNode)
      pos = listResult.newPosition
      const closeResult = expectType({ tokens: input.tokens, position: pos }, 'RBRACKET')
      if (!closeResult.success) {
        return fail(closeResult.error, closeResult.position)
      }
      endPos = closeResult.astNode.end
      pos = closeResult.newPosition
      expr = withLoc(
        { kind: 'ArrayAccess', array: expr, indices } as ArrayAccessNode,
        startToken.start,
        endPos,
      )
    } else if (token.type === 'DOT') {
      // Field access
      pos++
      const fieldResult = parseIdentifier({ tokens: input.tokens, position: pos })
      if (!fieldResult.success) {
        return fail(fieldResult.error, fieldResult.position)
      }
      endPos = peek({ tokens: input.tokens, position: fieldResult.newPosition - 1 }).end
      pos = fieldResult.newPosition
      expr = withLoc(
        { kind: 'FieldAccess', object: expr, field: fieldResult.astNode } as FieldAccessNode,
        startToken.start,
        endPos,
      )
    } else if (token.type === 'CARET') {
      // Pointer dereference (treat as field access for simplicity)
      pos++
      endPos = token.end
      expr = loc(
        {
          kind: 'FieldAccess',
          object: expr,
          field: loc({ kind: 'Identifier', name: '^' } as IdentifierNode, token),
        } as FieldAccessNode,
        startToken.start,
        endPos,
      )
    } else {
      break
    }
  }

  return ok(pos, expr)
}

// parseNot — NOT factor
function parseNot(input: ParserInput): ParseResult<ExpressionNode> {
  const startToken = peek(input)
  const afterNot = { tokens: input.tokens, position: input.position + 1 }
  const operandResult = parseFactor(afterNot)
  if (!operandResult.success) {
    return fail(operandResult.error, operandResult.position)
  }
  const endToken = peek({ tokens: input.tokens, position: operandResult.newPosition - 1 })
  return ok(
    operandResult.newPosition,
    withLoc(
      {
        kind: 'UnaryExpression',
        operator: 'NOT',
        operand: operandResult.astNode,
      } as UnaryExpressionNode,
      startToken.start,
      endToken.end,
    ),
  )
}

// parseFactor — handles multiplication-level operators
export function parseFactor(input: ParserInput): ParseResult<ExpressionNode> {
  return parsePrimary(input)
}

// parseTerm — term: factor { (* | / | DIV | MOD | AND) factor }
export function parseTerm(input: ParserInput): ParseResult<ExpressionNode> {
  const startToken = peek(input)
  const result = parseFactor(input)
  if (!result.success) {
    return result
  }

  let pos = result.newPosition
  let left = result.astNode
  const startPos = startToken.start

  while (true) {
    const token = peek({ tokens: input.tokens, position: pos })
    let operator: string | null = null

    switch (token.type) {
      case 'STAR':
        operator = '*'
        break
      case 'SLASH':
        operator = '/'
        break
      case 'DIV':
        operator = 'DIV'
        break
      case 'MOD':
        operator = 'MOD'
        break
      case 'AND':
        operator = 'AND'
        break
    }

    if (!operator) {
      break
    }

    const rightResult = parseFactor({ tokens: input.tokens, position: pos + 1 })
    if (!rightResult.success) {
      return fail(rightResult.error, rightResult.position)
    }

    const endToken = peek({ tokens: input.tokens, position: rightResult.newPosition - 1 })
    left = withLoc(
      {
        kind: 'BinaryExpression',
        left,
        operator,
        right: rightResult.astNode,
      } as BinaryExpressionNode,
      startPos,
      endToken.end,
    )
    pos = rightResult.newPosition
  }

  return ok(pos, left)
}

// parseSimpleExpression — [ (+|-|NOT) ] term { (+|-|OR) term }
export function parseSimpleExpression(input: ParserInput): ParseResult<ExpressionNode> {
  const startToken = peek(input)
  let pos = input.position
  let left: ExpressionNode
  const startPos = startToken.start

  const sign = peek({ tokens: input.tokens, position: pos })
  if (sign.type === 'PLUS' || sign.type === 'MINUS') {
    pos++
    const termResult = parseTerm({ tokens: input.tokens, position: pos })
    if (!termResult.success) {
      return fail(termResult.error, termResult.position)
    }
    pos = termResult.newPosition
    const endToken = peek({ tokens: input.tokens, position: pos - 1 })
    left = withLoc(
      {
        kind: 'UnaryExpression',
        operator: sign.type === 'PLUS' ? '+' : '-',
        operand: termResult.astNode,
      } as UnaryExpressionNode,
      startPos,
      endToken.end,
    )
  } else {
    const termResult = parseTerm({ tokens: input.tokens, position: pos })
    if (!termResult.success) {
      return fail(termResult.error, termResult.position)
    }
    pos = termResult.newPosition
    left = termResult.astNode
  }

  while (true) {
    const token = peek({ tokens: input.tokens, position: pos })
    let operator: string | null = null

    switch (token.type) {
      case 'PLUS':
        operator = '+'
        break
      case 'MINUS':
        operator = '-'
        break
      case 'OR':
        operator = 'OR'
        break
    }

    if (!operator) {
      break
    }

    const rightResult = parseTerm({ tokens: input.tokens, position: pos + 1 })
    if (!rightResult.success) {
      return fail(rightResult.error, rightResult.position)
    }

    const endToken = peek({ tokens: input.tokens, position: rightResult.newPosition - 1 })
    left = withLoc(
      {
        kind: 'BinaryExpression',
        left,
        operator,
        right: rightResult.astNode,
      } as BinaryExpressionNode,
      startPos,
      endToken.end,
    )
    pos = rightResult.newPosition
  }

  return ok(pos, left)
}

// parseExpression — simple_expression [ (= | <> | < | <= | > | >= | IN) simple_expression ]
export function parseExpression(input: ParserInput): ParseResult<ExpressionNode> {
  const startToken = peek(input)
  const leftResult = parseSimpleExpression(input)
  if (!leftResult.success) {
    return leftResult
  }

  let pos = leftResult.newPosition
  let left = leftResult.astNode
  const startPos = startToken.start

  while (true) {
    const token = peek({ tokens: input.tokens, position: pos })
    let operator: string | null = null

    switch (token.type) {
      case 'EQUAL':
        operator = '='
        break
      case 'NE':
        operator = '<>'
        break
      case 'LT':
        operator = '<'
        break
      case 'LE':
        operator = '<='
        break
      case 'GT':
        operator = '>'
        break
      case 'GE':
        operator = '>='
        break
      case 'EQEQ':
        operator = '=='
        break
      case 'IN':
        operator = 'IN'
        break
    }

    if (!operator) {
      break
    }

    const rightResult = parseSimpleExpression({ tokens: input.tokens, position: pos + 1 })
    if (!rightResult.success) {
      return fail(rightResult.error, rightResult.position)
    }

    const endToken = peek({ tokens: input.tokens, position: rightResult.newPosition - 1 })
    left = withLoc(
      {
        kind: operator === 'IN' ? 'InExpression' : 'BinaryExpression',
        left,
        operator,
        right: rightResult.astNode,
      } as ExpressionNode,
      startPos,
      endToken.end,
    )
    pos = rightResult.newPosition
  }

  return ok(pos, left)
}

// Convenience: parse a list of expressions separated by commas
export function parseExpressionList(input: ParserInput): ParseResult<ExpressionNode[]> {
  return parseList(input, parseExpression, 'COMMA')
}
