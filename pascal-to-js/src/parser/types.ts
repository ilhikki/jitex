import {
  ArrayTypeNode,
  EnumerationTypeNode,
  FileTypeNode,
  IdentifierNode,
  ParseResult,
  ParserInput,
  PointerTypeNode,
  Position,
  RangeTypeNode,
  RecordTypeNode,
  RecordVariantNode,
  RecordVariantPartNode,
  SetTypeNode,
  SimpleTypeNode,
  TypeNode,
  VariableDeclarationNode,
} from '../ast/types.ts'
import { expectKeyword, expectType, fail, ok, parseList, peek, withLoc } from './helpers.ts'
import { parseExpression, parseIdentifier } from './expressions.ts'

// ============================================================================
// Type Parsers
// ============================================================================

// parseType — dispatches to the correct type parser based on lookahead
export function parseType(input: ParserInput): ParseResult<TypeNode> {
  const token = peek(input)

  switch (token.type) {
    case 'PACKED':
      return parsePackedType(input)

    case 'ARRAY':
      return parseArrayType(input)

    case 'RECORD':
      return parseRecordType(input)

    case 'FILE':
      return parseFileType(input)

    case 'SET':
      return parseSetType(input)

    case 'LPAREN':
      return parseEnumerationType(input)

    case 'CARET':
      // ISO 7185 6.4.4: new-pointer-type = '↑' domain-type
      return parsePointerType(input)

    case 'MINUS':
    case 'PLUS':
    case 'INTEGER':
    case 'HEX_NUMBER':
    case 'STRING':
    case 'CHAR_CODE':
    case 'IDENTIFIER':
    case 'TRUE':
    case 'FALSE':
      // Could be range type or simple type
      return parseRangeOrSimpleType(input)

    default:
      return fail(
        `Expected type but got ${token.type} (${token.content}) at line ${token.start.line}:${token.start.column}`,
        input.position,
      )
  }
}

function parseRangeOrSimpleType(input: ParserInput): ParseResult<TypeNode> {
  const startPos = peek(input).start

  const startResult = parseExpression(input)
  if (!startResult.success) return startResult

  let pos = startResult.newPosition

  if (peek({ tokens: input.tokens, position: pos }).type === 'DOTDOT') {
    pos++
    const endResult = parseExpression({ tokens: input.tokens, position: pos })
    if (!endResult.success) return fail(endResult.error, endResult.position)
    return ok(
      endResult.newPosition,
      withLoc(
        {
          kind: 'RangeType',
          start: startResult.astNode,
          end: endResult.astNode,
        } as RangeTypeNode,
        startPos,
        input.tokens[endResult.newPosition - 1].end,
      ),
    )
  }

  if (startResult.astNode.kind === 'Identifier') {
    return ok(
      pos,
      withLoc(
        {
          kind: 'SimpleType',
          name: startResult.astNode as IdentifierNode,
        } as SimpleTypeNode,
        startPos,
        input.tokens[pos - 1].end,
      ),
    )
  }

  return fail('Expected type definition', pos)
}

function parsePackedType(input: ParserInput): ParseResult<TypeNode> {
  const startPos = peek(input).start
  const afterPacked = { tokens: input.tokens, position: input.position + 1 }
  const token = peek(afterPacked)

  switch (token.type) {
    case 'ARRAY':
      return parseArrayType(afterPacked, true, startPos)

    case 'FILE':
      return parseFileType(afterPacked, true, startPos)

    case 'SET':
      return parseSetType(afterPacked, startPos)

    case 'RECORD':
      return parseRecordType(afterPacked, startPos)

    default:
      return fail(
        `Expected ARRAY/FILE/SET/RECORD after PACKED at line ${token.start.line}`,
        input.position,
      )
  }
}

// ARRAY [ indexType {, indexType} ] OF elementType
function parseArrayType(
  input: ParserInput,
  isPacked: boolean = false,
  startPos?: Position,
): ParseResult<ArrayTypeNode> {
  const start = startPos ?? peek(input).start
  let pos = input.position + 1 // skip ARRAY

  const openResult = expectType({ tokens: input.tokens, position: pos }, 'LBRACKET')
  if (!openResult.success) return fail(openResult.error, openResult.position)
  pos = openResult.newPosition

  const indexResult = parseList({ tokens: input.tokens, position: pos }, parseType, 'COMMA')
  if (!indexResult.success) return fail(indexResult.error, indexResult.position)
  pos = indexResult.newPosition

  const closeResult = expectType({ tokens: input.tokens, position: pos }, 'RBRACKET')
  if (!closeResult.success) return fail(closeResult.error, closeResult.position)
  pos = closeResult.newPosition

  const ofResult = expectKeyword({ tokens: input.tokens, position: pos }, 'OF')
  if (!ofResult.success) return fail(ofResult.error, ofResult.position)
  pos = ofResult.newPosition

  const elemResult = parseType({ tokens: input.tokens, position: pos })
  if (!elemResult.success) return fail(elemResult.error, elemResult.position)
  pos = elemResult.newPosition

  return ok(
    pos,
    withLoc(
      {
        kind: 'ArrayType',
        indexTypes: indexResult.astNode,
        elementType: elemResult.astNode,
        isPacked,
      } as ArrayTypeNode,
      start,
      input.tokens[pos - 1].end,
    ),
  )
}

// RECORD field_list END
// field_list = [ (fixed-part [; variant-part] | variant-part) [;] ]
function parseRecordType(input: ParserInput, startPos?: Position): ParseResult<RecordTypeNode> {
  const start = startPos ?? peek(input).start
  let pos = input.position + 1
  const fields: VariableDeclarationNode[] = []
  let variant: RecordVariantPartNode | undefined

  while (true) {
    const token = peek({ tokens: input.tokens, position: pos })
    if (token.type === 'END') {
      break
    }
    if (token.type === 'CASE') {
      const variantResult = parseRecordVariantPart({ tokens: input.tokens, position: pos })
      if (!variantResult.success) return fail(variantResult.error, variantResult.position)
      variant = variantResult.astNode
      pos = variantResult.newPosition
      break
    }

    const fieldResult = parseVariableDeclaration({ tokens: input.tokens, position: pos })
    if (!fieldResult.success) return fail(fieldResult.error, fieldResult.position)
    fields.push(fieldResult.astNode)
    pos = fieldResult.newPosition

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
      { kind: 'RecordType', fields, variant } as RecordTypeNode,
      start,
      input.tokens[pos - 1].end,
    ),
  )
}

// CASE [tag:] type OF variant {; variant}
function parseRecordVariantPart(input: ParserInput): ParseResult<RecordVariantPartNode> {
  const start = peek(input).start
  let pos = input.position + 1

  let tagName: IdentifierNode | undefined
  const afterCaseToken = peek({ tokens: input.tokens, position: pos })
  if (afterCaseToken.type === 'IDENTIFIER') {
    const nextNextToken = peek({ tokens: input.tokens, position: pos + 1 })
    if (nextNextToken.type === 'COLON') {
      const idResult = parseIdentifier({ tokens: input.tokens, position: pos })
      if (!idResult.success) return fail(idResult.error, idResult.position)
      tagName = idResult.astNode
      pos = idResult.newPosition

      const colonResult = expectType({ tokens: input.tokens, position: pos }, 'COLON')
      if (!colonResult.success) return fail(colonResult.error, colonResult.position)
      pos = colonResult.newPosition
    }
  }

  const typeResult = parseType({ tokens: input.tokens, position: pos })
  if (!typeResult.success) return fail(typeResult.error, typeResult.position)
  pos = typeResult.newPosition

  const ofResult = expectKeyword({ tokens: input.tokens, position: pos }, 'OF')
  if (!ofResult.success) return fail(ofResult.error, ofResult.position)
  pos = ofResult.newPosition

  const variants: RecordVariantNode[] = []
  while (true) {
    const token = peek({ tokens: input.tokens, position: pos })
    if (token.type === 'END') {
      break
    }
    if (token.type === 'SEMICOLON') {
      pos++
      continue
    }

    const variantResult = parseRecordVariant({ tokens: input.tokens, position: pos })
    if (!variantResult.success) return fail(variantResult.error, variantResult.position)
    variants.push(variantResult.astNode)
    pos = variantResult.newPosition

    while (peek({ tokens: input.tokens, position: pos }).type === 'SEMICOLON') {
      pos++
    }
  }

  return ok(
    pos,
    withLoc(
      { kind: 'RecordVariantPart', tagName, tagType: typeResult.astNode, variants } as RecordVariantPartNode,
      start,
      input.tokens[pos - 1].end,
    ),
  )
}

// case-constant-list : ( field-list )
function parseRecordVariant(input: ParserInput): ParseResult<RecordVariantNode> {
  const start = peek(input).start
  let pos = input.position

  const caseLabelsResult = parseList(
    { tokens: input.tokens, position: pos },
    parseExpression,
    'COMMA',
  )
  if (!caseLabelsResult.success) return fail(caseLabelsResult.error, caseLabelsResult.position)
  pos = caseLabelsResult.newPosition

  const colonResult = expectType({ tokens: input.tokens, position: pos }, 'COLON')
  if (!colonResult.success) return fail(colonResult.error, colonResult.position)
  pos = colonResult.newPosition

  const openResult = expectType({ tokens: input.tokens, position: pos }, 'LPAREN')
  if (!openResult.success) return fail(openResult.error, openResult.position)
  pos = openResult.newPosition

  const fields: VariableDeclarationNode[] = []
  let variant: RecordVariantPartNode | undefined

  while (true) {
    const token = peek({ tokens: input.tokens, position: pos })
    if (token.type === 'RPAREN') {
      break
    }
    if (token.type === 'CASE') {
      const variantResult = parseRecordVariantPart({ tokens: input.tokens, position: pos })
      if (!variantResult.success) return fail(variantResult.error, variantResult.position)
      variant = variantResult.astNode
      pos = variantResult.newPosition
      if (peek({ tokens: input.tokens, position: pos }).type === 'END') {
        pos++
      }
      continue
    }

    const fieldResult = parseVariableDeclaration({ tokens: input.tokens, position: pos })
    if (!fieldResult.success) return fail(fieldResult.error, fieldResult.position)
    fields.push(fieldResult.astNode)
    pos = fieldResult.newPosition

    while (peek({ tokens: input.tokens, position: pos }).type === 'SEMICOLON') {
      pos++
    }
  }

  const closeResult = expectType({ tokens: input.tokens, position: pos }, 'RPAREN')
  if (!closeResult.success) return fail(closeResult.error, closeResult.position)
  pos = closeResult.newPosition

  return ok(
    pos,
    withLoc(
      { kind: 'RecordVariant', caseLabels: caseLabelsResult.astNode, fields, variant } as RecordVariantNode,
      start,
      input.tokens[pos - 1].end,
    ),
  )
}

// ISO 7185 6.4.4: '^' domain-type  (domain-type = type-identifier)
function parsePointerType(input: ParserInput): ParseResult<PointerTypeNode> {
  const start = peek(input).start
  let pos = input.position + 1 // skip '^'

  const domainResult = parseType({ tokens: input.tokens, position: pos })
  if (!domainResult.success) return fail(domainResult.error, domainResult.position)
  pos = domainResult.newPosition

  return ok(
    pos,
    withLoc(
      { kind: 'PointerType', domainType: domainResult.astNode } as PointerTypeNode,
      start,
      input.tokens[pos - 1].end,
    ),
  )
}

// FILE OF type  |  FILE
function parseFileType(
  input: ParserInput,
  isPacked: boolean = false,
  startPos?: Position,
): ParseResult<FileTypeNode> {
  const start = startPos ?? peek(input).start
  let pos = input.position + 1 // skip FILE

  let elementType: TypeNode | null = null

  if (peek({ tokens: input.tokens, position: pos }).type === 'OF') {
    pos++
    const elemResult = parseType({ tokens: input.tokens, position: pos })
    if (!elemResult.success) return fail(elemResult.error, elemResult.position)
    pos = elemResult.newPosition
    elementType = elemResult.astNode
  }

  return ok(
    pos,
    withLoc(
      {
        kind: 'FileType',
        elementType,
        isPacked,
      } as FileTypeNode,
      start,
      input.tokens[pos - 1].end,
    ),
  )
}

// SET OF type
function parseSetType(input: ParserInput, startPos?: Position): ParseResult<SetTypeNode> {
  const start = startPos ?? peek(input).start
  let pos = input.position + 1 // skip SET

  const ofResult = expectKeyword({ tokens: input.tokens, position: pos }, 'OF')
  if (!ofResult.success) return fail(ofResult.error, ofResult.position)
  pos = ofResult.newPosition

  const baseResult = parseType({ tokens: input.tokens, position: pos })
  if (!baseResult.success) return fail(baseResult.error, baseResult.position)
  pos = baseResult.newPosition

  return ok(
    pos,
    withLoc(
      { kind: 'SetType', baseType: baseResult.astNode } as SetTypeNode,
      start,
      input.tokens[pos - 1].end,
    ),
  )
}

// ( identifier {, identifier} )
function parseEnumerationType(input: ParserInput): ParseResult<EnumerationTypeNode> {
  const openResult = expectType(input, 'LPAREN')
  if (!openResult.success) return fail(openResult.error, openResult.position)
  const start = openResult.astNode.start
  let pos = openResult.newPosition

  const valuesResult = parseList({ tokens: input.tokens, position: pos }, parseIdentifier, 'COMMA')
  if (!valuesResult.success) return fail(valuesResult.error, valuesResult.position)
  pos = valuesResult.newPosition

  const closeResult = expectType({ tokens: input.tokens, position: pos }, 'RPAREN')
  if (!closeResult.success) return fail(closeResult.error, closeResult.position)
  pos = closeResult.newPosition

  return ok(
    pos,
    withLoc(
      {
        kind: 'EnumerationType',
        values: valuesResult.astNode,
      } as EnumerationTypeNode,
      start,
      closeResult.astNode.end,
    ),
  )
}

// ============================================================================
// Declaration Parsers
// ============================================================================

// identifier_list : type
export function parseVariableDeclaration(input: ParserInput): ParseResult<VariableDeclarationNode> {
  const startPos = peek(input).start

  const namesResult = parseList(input, parseIdentifier, 'COMMA')
  if (!namesResult.success) return fail(namesResult.error, namesResult.position)
  let pos = namesResult.newPosition

  const colonResult = expectType({ tokens: input.tokens, position: pos }, 'COLON')
  if (!colonResult.success) return fail(colonResult.error, colonResult.position)
  pos = colonResult.newPosition

  const typeResult = parseType({ tokens: input.tokens, position: pos })
  if (!typeResult.success) return fail(typeResult.error, typeResult.position)
  pos = typeResult.newPosition

  return ok(
    pos,
    withLoc(
      {
        kind: 'VariableDeclaration',
        names: namesResult.astNode,
        type: typeResult.astNode,
      } as VariableDeclarationNode,
      startPos,
      input.tokens[pos - 1].end,
    ),
  )
}
