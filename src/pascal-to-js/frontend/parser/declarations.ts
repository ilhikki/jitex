import { expectKeyword, expectType, fail, loc, ok, parseList, peek, withLoc } from './helpers.ts'
import { parseExpression, parseIdentifier } from './expressions.ts'
import { parseType, parseVariableDeclaration } from './types.ts'
import { parseCompoundStatement } from './statements.ts'
import {
  BlockNode,
  ConstDeclarationNode,
  FunctionDeclarationNode,
  IdentifierNode,
  IntegerLiteralNode,
  LabelDeclarationNode,
  ParameterDeclarationNode,
  ParseResult,
  ParserInput,
  ProcedureDeclarationNode,
  ProgramNode,
  TypeDeclarationNode,
  VariableDeclarationNode,
} from '@jitex/pascal-to-js'

// Declaration Parsers

// LABEL label {, label} ;
export function parseLabelDeclaration(input: ParserInput): ParseResult<LabelDeclarationNode> {
  const startToken = peek(input)
  let pos = input.position + 1 // skip LABEL
  const labels: IntegerLiteralNode[] = []

  while (true) {
    const token = peek({ tokens: input.tokens, position: pos })
    if (token.type !== 'INTEGER') {
      return fail(`Expected label number but got ${token.type} at line ${token.start.line}`, pos)
    }
    const value = parseInt(token.content, 10)
    if (value < 0 || value > 9999) {
      return fail(`Label ${value} out of range (0..9999) at line ${token.start.line}`, pos)
    }
    labels.push(
      loc(
        {
          kind: 'IntegerLiteral',
          value,
          raw: token.content,
        } as IntegerLiteralNode,
        token,
      ),
    )
    pos++

    if (peek({ tokens: input.tokens, position: pos }).type !== 'COMMA') {
      break
    }
    pos++
  }

  const semiResult = expectType({ tokens: input.tokens, position: pos }, 'SEMICOLON')
  if (!semiResult.success) {
    return fail(semiResult.error, semiResult.position)
  }
  pos = semiResult.newPosition

  return ok(
    pos,
    withLoc(
      { kind: 'LabelDeclaration', labels } as LabelDeclarationNode,
      startToken.start,
      semiResult.astNode.end,
    ),
  )
}

// CONST { identifier = expression ; }
export function parseConstDeclarations(input: ParserInput): ParseResult<ConstDeclarationNode[]> {
  if (peek(input).type !== 'CONST') {
    return ok(input.position, [])
  }

  let pos = input.position + 1 // skip CONST
  const decls: ConstDeclarationNode[] = []

  while (peek({ tokens: input.tokens, position: pos }).type === 'IDENTIFIER') {
    // 循环条件已确认当前记号是标识符
    const nameStartToken = peek({ tokens: input.tokens, position: pos })
    const nameNode = loc({ kind: 'Identifier', name: nameStartToken.content } as IdentifierNode, nameStartToken)
    pos++

    const eqResult = expectType({ tokens: input.tokens, position: pos }, 'EQUAL')
    if (!eqResult.success) {
      return fail(eqResult.error, eqResult.position)
    }
    pos = eqResult.newPosition

    const valResult = parseExpression({ tokens: input.tokens, position: pos })
    if (!valResult.success) {
      return fail(valResult.error, valResult.position)
    }
    pos = valResult.newPosition

    // Optional semicolon (sometimes missing in web/tangle output)
    if (peek({ tokens: input.tokens, position: pos }).type === 'SEMICOLON') {
      pos++
    }

    decls.push(
      withLoc(
        {
          kind: 'ConstDeclaration',
          name: nameNode,
          value: valResult.astNode,
        } as ConstDeclarationNode,
        nameStartToken.start,
        input.tokens[pos - 1].end,
      ),
    )
  }

  return ok(pos, decls)
}

// TYPE { identifier = type ; }
export function parseTypeDeclarations(input: ParserInput): ParseResult<TypeDeclarationNode[]> {
  if (peek(input).type !== 'TYPE') {
    return ok(input.position, [])
  }

  let pos = input.position + 1 // skip TYPE
  const decls: TypeDeclarationNode[] = []

  while (peek({ tokens: input.tokens, position: pos }).type === 'IDENTIFIER') {
    // 循环条件已确认当前记号是标识符
    const nameStartToken = peek({ tokens: input.tokens, position: pos })
    const nameNode = loc({ kind: 'Identifier', name: nameStartToken.content } as IdentifierNode, nameStartToken)
    pos++

    const eqResult = expectType({ tokens: input.tokens, position: pos }, 'EQUAL')
    if (!eqResult.success) {
      return fail(eqResult.error, eqResult.position)
    }
    pos = eqResult.newPosition

    const typeResult = parseType({ tokens: input.tokens, position: pos })
    if (!typeResult.success) {
      return fail(typeResult.error, typeResult.position)
    }
    pos = typeResult.newPosition

    if (peek({ tokens: input.tokens, position: pos }).type === 'SEMICOLON') {
      pos++
    }

    decls.push(
      withLoc(
        {
          kind: 'TypeDeclaration',
          name: nameNode,
          typeDef: typeResult.astNode,
        } as TypeDeclarationNode,
        nameStartToken.start,
        input.tokens[pos - 1].end,
      ),
    )
  }

  return ok(pos, decls)
}

// VAR { identifier_list : type ; }
export function parseVariableDeclarations(
  input: ParserInput,
): ParseResult<VariableDeclarationNode[]> {
  if (peek(input).type !== 'VAR') {
    return ok(input.position, [])
  }

  let pos = input.position + 1 // skip VAR
  const decls: VariableDeclarationNode[] = []

  while (peek({ tokens: input.tokens, position: pos }).type === 'IDENTIFIER') {
    const declResult = parseVariableDeclaration({ tokens: input.tokens, position: pos })
    if (!declResult.success) {
      return fail(declResult.error, declResult.position)
    }
    pos = declResult.newPosition

    if (peek({ tokens: input.tokens, position: pos }).type === 'SEMICOLON') {
      pos++
    }

    decls.push(declResult.astNode)
  }

  return ok(pos, decls)
}

// Procedure / Function Declarations
// ISO 7185 6.6.3.1/6.6.3.5: functional-parameter-specification = function-heading
//   function-heading = 'function' identifier [ formal-parameter-list ] ':' result-type
/**
 * ISO 7185 6.6.3.1：procedural-parameter-specification = procedure-heading
 * procedure-heading = 'procedure' identifier [ formal-parameter-list ]
 */
function parseProceduralParameterSection(
  input: ParserInput,
): ParseResult<ParameterDeclarationNode> {
  const startToken = peek(input)
  let pos = input.position + 1 // skip PROCEDURE

  const nameResult = parseIdentifier({ tokens: input.tokens, position: pos })
  if (!nameResult.success) {
    return fail(nameResult.error, nameResult.position)
  }
  pos = nameResult.newPosition

  const paramsResult = parseParameterList({ tokens: input.tokens, position: pos })
  if (!paramsResult.success) {
    return fail(paramsResult.error, paramsResult.position)
  }
  pos = paramsResult.newPosition

  return ok(
    pos,
    withLoc(
      {
        kind: 'ParameterDeclaration',
        names: [nameResult.astNode],
        isVar: false,
        callable: {
          kind: 'procedure',
          parameters: paramsResult.astNode,
        },
      } as ParameterDeclarationNode,
      startToken.start,
      input.tokens[pos - 1].end,
    ),
  )
}

function parseFunctionalParameterSection(
  input: ParserInput,
): ParseResult<ParameterDeclarationNode> {
  const startToken = peek(input)
  let pos = input.position + 1 // skip FUNCTION

  const nameResult = parseIdentifier({ tokens: input.tokens, position: pos })
  if (!nameResult.success) {
    return fail(nameResult.error, nameResult.position)
  }
  pos = nameResult.newPosition

  const paramsResult = parseParameterList({ tokens: input.tokens, position: pos })
  if (!paramsResult.success) {
    return fail(paramsResult.error, paramsResult.position)
  }
  pos = paramsResult.newPosition

  const colonResult = expectType({ tokens: input.tokens, position: pos }, 'COLON')
  if (!colonResult.success) {
    return fail(colonResult.error, colonResult.position)
  }
  pos = colonResult.newPosition

  const returnTypeResult = parseType({ tokens: input.tokens, position: pos })
  if (!returnTypeResult.success) {
    return fail(returnTypeResult.error, returnTypeResult.position)
  }
  pos = returnTypeResult.newPosition

  return ok(
    pos,
    withLoc(
      {
        kind: 'ParameterDeclaration',
        names: [nameResult.astNode],
        isVar: false,
        callable: {
          kind: 'function',
          parameters: paramsResult.astNode,
          returnType: returnTypeResult.astNode,
        },
      } as ParameterDeclarationNode,
      startToken.start,
      input.tokens[pos - 1].end,
    ),
  )
}

export function parseParameterList(input: ParserInput): ParseResult<ParameterDeclarationNode[]> {
  if (peek(input).type !== 'LPAREN') {
    return ok(input.position, [])
  }

  let pos = input.position + 1 // skip (
  const params: ParameterDeclarationNode[] = []

  while (peek({ tokens: input.tokens, position: pos }).type !== 'RPAREN') {
    // ISO 7185 6.6.3.1/6.6.3.4：procedural-parameter-specification = procedure-heading
    if (peek({ tokens: input.tokens, position: pos }).type === 'PROCEDURE') {
      const callableResult = parseProceduralParameterSection({ tokens: input.tokens, position: pos })
      if (!callableResult.success) {
        return fail(callableResult.error, callableResult.position)
      }
      params.push(callableResult.astNode)
      pos = callableResult.newPosition

      if (peek({ tokens: input.tokens, position: pos }).type !== 'SEMICOLON') {
        break
      }
      pos++
      continue
    }

    // ISO 7185 6.6.3.1/6.6.3.5：functional-parameter-specification = function-heading
    if (peek({ tokens: input.tokens, position: pos }).type === 'FUNCTION') {
      const callableResult = parseFunctionalParameterSection({ tokens: input.tokens, position: pos })
      if (!callableResult.success) {
        return fail(callableResult.error, callableResult.position)
      }
      params.push(callableResult.astNode)
      pos = callableResult.newPosition

      if (peek({ tokens: input.tokens, position: pos }).type !== 'SEMICOLON') {
        break
      }
      pos++
      continue
    }

    const paramStartToken = peek({ tokens: input.tokens, position: pos })
    let isVar = false
    if (peek({ tokens: input.tokens, position: pos }).type === 'VAR') {
      isVar = true
      pos++
    }

    const namesResult = parseList({ tokens: input.tokens, position: pos }, parseIdentifier, 'COMMA')
    if (!namesResult.success) {
      return fail(namesResult.error, namesResult.position)
    }
    pos = namesResult.newPosition

    const colonResult = expectType({ tokens: input.tokens, position: pos }, 'COLON')
    if (!colonResult.success) {
      return fail(colonResult.error, colonResult.position)
    }
    pos = colonResult.newPosition

    const typeResult = parseType({ tokens: input.tokens, position: pos })
    if (!typeResult.success) {
      return fail(typeResult.error, typeResult.position)
    }
    pos = typeResult.newPosition

    params.push(
      withLoc(
        {
          kind: 'ParameterDeclaration',
          names: namesResult.astNode,
          type: typeResult.astNode,
          isVar,
        } as ParameterDeclarationNode,
        paramStartToken.start,
        input.tokens[pos - 1].end,
      ),
    )

    if (peek({ tokens: input.tokens, position: pos }).type !== 'SEMICOLON') {
      break
    }
    pos++
  }

  pos++ // 循环仅在右圆括号处退出，故此处必为右圆括号

  return ok(pos, params)
}

export function parseProcedureDeclaration(
  input: ParserInput,
  outerLabels?: Set<number>,
): ParseResult<ProcedureDeclarationNode> {
  const startToken = peek(input)
  let pos = input.position + 1 // skip PROCEDURE

  const nameResult = parseIdentifier({ tokens: input.tokens, position: pos })
  if (!nameResult.success) {
    return fail(nameResult.error, nameResult.position)
  }
  pos = nameResult.newPosition

  const paramsResult = parseParameterList({ tokens: input.tokens, position: pos })
  if (!paramsResult.success) {
    return fail(paramsResult.error, paramsResult.position)
  }
  pos = paramsResult.newPosition

  const semiResult = expectType({ tokens: input.tokens, position: pos }, 'SEMICOLON')
  if (!semiResult.success) {
    return fail(semiResult.error, semiResult.position)
  }
  pos = semiResult.newPosition

  // Check for FORWARD
  if (peek({ tokens: input.tokens, position: pos }).type === 'FORWARD') {
    pos++
    const semiResult2 = expectType({ tokens: input.tokens, position: pos }, 'SEMICOLON')
    if (!semiResult2.success) {
      return fail(semiResult2.error, semiResult2.position)
    }
    pos = semiResult2.newPosition
    return ok(
      pos,
      withLoc(
        {
          kind: 'ProcedureDeclaration',
          name: nameResult.astNode,
          parameters: paramsResult.astNode,
          block: undefined,
          isForward: true,
        } as ProcedureDeclarationNode,
        startToken.start,
        semiResult2.astNode.end,
      ),
    )
  }

  // Parse block
  const blockResult = parseBlock({ tokens: input.tokens, position: pos }, outerLabels)
  if (!blockResult.success) {
    return fail(blockResult.error, blockResult.position)
  }
  pos = blockResult.newPosition

  // Optional semicolon after block
  if (peek({ tokens: input.tokens, position: pos }).type === 'SEMICOLON') {
    pos++
  }

  return ok(
    pos,
    withLoc(
      {
        kind: 'ProcedureDeclaration',
        name: nameResult.astNode,
        parameters: paramsResult.astNode,
        block: blockResult.astNode,
        isForward: false,
      } as ProcedureDeclarationNode,
      startToken.start,
      input.tokens[pos - 1].end,
    ),
  )
}

export function parseFunctionDeclaration(
  input: ParserInput,
  outerLabels?: Set<number>,
): ParseResult<FunctionDeclarationNode> {
  const startToken = peek(input)
  let pos = input.position + 1 // skip FUNCTION

  const nameResult = parseIdentifier({ tokens: input.tokens, position: pos })
  if (!nameResult.success) {
    return fail(nameResult.error, nameResult.position)
  }
  pos = nameResult.newPosition

  const paramsResult = parseParameterList({ tokens: input.tokens, position: pos })
  if (!paramsResult.success) {
    return fail(paramsResult.error, paramsResult.position)
  }
  pos = paramsResult.newPosition

  const colonResult = expectType({ tokens: input.tokens, position: pos }, 'COLON')
  if (!colonResult.success) {
    return fail(colonResult.error, colonResult.position)
  }
  pos = colonResult.newPosition

  const returnTypeResult = parseType({ tokens: input.tokens, position: pos })
  if (!returnTypeResult.success) {
    return fail(returnTypeResult.error, returnTypeResult.position)
  }
  pos = returnTypeResult.newPosition

  const semiResult = expectType({ tokens: input.tokens, position: pos }, 'SEMICOLON')
  if (!semiResult.success) {
    return fail(semiResult.error, semiResult.position)
  }
  pos = semiResult.newPosition

  // Check for FORWARD
  if (peek({ tokens: input.tokens, position: pos }).type === 'FORWARD') {
    pos++
    const semiResult2 = expectType({ tokens: input.tokens, position: pos }, 'SEMICOLON')
    if (!semiResult2.success) {
      return fail(semiResult2.error, semiResult2.position)
    }
    pos = semiResult2.newPosition
    return ok(
      pos,
      withLoc(
        {
          kind: 'FunctionDeclaration',
          name: nameResult.astNode,
          parameters: paramsResult.astNode,
          returnType: returnTypeResult.astNode,
          block: undefined,
          isForward: true,
        } as FunctionDeclarationNode,
        startToken.start,
        semiResult2.astNode.end,
      ),
    )
  }

  // Parse block
  const blockResult = parseBlock({ tokens: input.tokens, position: pos }, outerLabels)
  if (!blockResult.success) {
    return fail(blockResult.error, blockResult.position)
  }
  pos = blockResult.newPosition

  if (peek({ tokens: input.tokens, position: pos }).type === 'SEMICOLON') {
    pos++
  }

  return ok(
    pos,
    withLoc(
      {
        kind: 'FunctionDeclaration',
        name: nameResult.astNode,
        parameters: paramsResult.astNode,
        returnType: returnTypeResult.astNode,
        block: blockResult.astNode,
        isForward: false,
      } as FunctionDeclarationNode,
      startToken.start,
      input.tokens[pos - 1].end,
    ),
  )
}

// Block & Program Parsers

export function parseBlock(input: ParserInput, outerLabels?: Set<number>): ParseResult<BlockNode> {
  const startToken = peek(input)
  let pos = input.position

  // Label section
  let labelDeclarations: LabelDeclarationNode | undefined = undefined
  if (peek({ tokens: input.tokens, position: pos }).type === 'LABEL') {
    const r = parseLabelDeclaration({ tokens: input.tokens, position: pos })
    if (!r.success) {
      return fail(r.error, r.position)
    }
    labelDeclarations = r.astNode
    pos = r.newPosition
  }

  // Const section
  const constResult = parseConstDeclarations({ tokens: input.tokens, position: pos })
  if (!constResult.success) {
    return fail(constResult.error, constResult.position)
  }
  pos = constResult.newPosition

  // Type section
  const typeResult = parseTypeDeclarations({ tokens: input.tokens, position: pos })
  if (!typeResult.success) {
    return fail(typeResult.error, typeResult.position)
  }
  pos = typeResult.newPosition

  // Var section
  const varResult = parseVariableDeclarations({ tokens: input.tokens, position: pos })
  if (!varResult.success) {
    return fail(varResult.error, varResult.position)
  }
  pos = varResult.newPosition

  // Procedure / Function declarations
  const procDecls: ProcedureDeclarationNode[] = []
  const funcDecls: FunctionDeclarationNode[] = []

  // 收集当前 block 可见的 label（外层 + 当前层），传递给嵌套 procedure/function
  const currentLabels = new Set<number>(outerLabels ?? [])
  if (labelDeclarations) {
    for (const l of labelDeclarations.labels) {
      currentLabels.add(l.value)
    }
  }

  while (true) {
    const token = peek({ tokens: input.tokens, position: pos })
    if (token.type === 'PROCEDURE') {
      const r = parseProcedureDeclaration({ tokens: input.tokens, position: pos }, currentLabels)
      if (!r.success) {
        return fail(r.error, r.position)
      }
      procDecls.push(r.astNode)
      pos = r.newPosition
    } else if (token.type === 'FUNCTION') {
      const r = parseFunctionDeclaration({ tokens: input.tokens, position: pos }, currentLabels)
      if (!r.success) {
        return fail(r.error, r.position)
      }
      funcDecls.push(r.astNode)
      pos = r.newPosition
    } else {
      break
    }
  }

  // Compound statement
  const compoundResult = parseCompoundStatement({ tokens: input.tokens, position: pos })
  if (!compoundResult.success) {
    return fail(compoundResult.error, compoundResult.position)
  }
  pos = compoundResult.newPosition

  return ok(
    pos,
    withLoc(
      {
        kind: 'Block',
        labelDeclarations,
        constDeclarations: constResult.astNode,
        typeDeclarations: typeResult.astNode,
        variableDeclarations: varResult.astNode,
        procedureDeclarations: procDecls,
        functionDeclarations: funcDecls,
        compound: compoundResult.astNode,
      } as BlockNode,
      startToken.start,
      input.tokens[pos - 1].end,
    ),
  )
}

export function parseProgram(input: ParserInput): ParseResult<ProgramNode> {
  const startToken = peek(input)
  let pos = input.position

  // Skip compiler directives and comments (already handled by lexer)
  // Expect PROGRAM keyword
  const progResult = expectKeyword({ tokens: input.tokens, position: pos }, 'PROGRAM')
  if (!progResult.success) {
    return fail(progResult.error, progResult.position)
  }
  pos = progResult.newPosition

  // Program name
  const nameResult = parseIdentifier({ tokens: input.tokens, position: pos })
  if (!nameResult.success) {
    return fail(nameResult.error, nameResult.position)
  }
  pos = nameResult.newPosition

  // Optional program parameters
  const parameters: IdentifierNode[] = []
  if (peek({ tokens: input.tokens, position: pos }).type === 'LPAREN') {
    pos++
    while (peek({ tokens: input.tokens, position: pos }).type !== 'RPAREN') {
      const idResult = parseIdentifier({ tokens: input.tokens, position: pos })
      if (!idResult.success) {
        return fail(idResult.error, idResult.position)
      }
      parameters.push(idResult.astNode)
      pos = idResult.newPosition

      if (peek({ tokens: input.tokens, position: pos }).type !== 'COMMA') {
        break
      }
      pos++
    }
    const closeResult = expectType({ tokens: input.tokens, position: pos }, 'RPAREN')
    if (!closeResult.success) {
      return fail(closeResult.error, closeResult.position)
    }
    pos = closeResult.newPosition
  }

  // Semicolon
  const semiResult = expectType({ tokens: input.tokens, position: pos }, 'SEMICOLON')
  if (!semiResult.success) {
    return fail(semiResult.error, semiResult.position)
  }
  pos = semiResult.newPosition

  // Block
  const blockResult = parseBlock({ tokens: input.tokens, position: pos })
  if (!blockResult.success) {
    return fail(blockResult.error, blockResult.position)
  }
  pos = blockResult.newPosition

  // Final dot
  const dotResult = expectType({ tokens: input.tokens, position: pos }, 'DOT')
  if (!dotResult.success) {
    return fail(dotResult.error, dotResult.position)
  }
  pos = dotResult.newPosition

  // Ensure all tokens are consumed (no trailing garbage after program)
  const trailing = peek({ tokens: input.tokens, position: pos })
  if (trailing.type !== 'EOF') {
    return fail(
      `Unexpected token ${trailing.type} (${trailing.content}) after program end at line ${trailing.start.line}:${trailing.start.column}`,
      pos,
    )
  }

  return ok(
    pos,
    withLoc(
      {
        kind: 'Program',
        name: nameResult.astNode,
        parameters,
        block: blockResult.astNode,
      } as ProgramNode,
      startToken.start,
      dotResult.astNode.end,
    ),
  )
}
