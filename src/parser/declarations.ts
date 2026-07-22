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
  StatementNode,
  TypeDeclarationNode,
  VariableDeclarationNode,
} from '../ast/types'
import { expectKeyword, expectType, fail, ok, parseList, peek, withLoc } from './helpers'
import { parseExpression, parseIdentifier } from './expressions'
import { parseType, parseVariableDeclaration } from './types'
import { parseCompoundStatement } from './statements'

// ============================================================================
// Declaration Parsers
// ============================================================================

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
    labels.push({
      kind: 'IntegerLiteral',
      value,
      raw: token.content,
    } as IntegerLiteralNode)
    pos++

    if (peek({ tokens: input.tokens, position: pos }).type !== 'COMMA') break
    pos++
  }

  const semiResult = expectType({ tokens: input.tokens, position: pos }, 'SEMICOLON')
  if (!semiResult.success) return fail(semiResult.error, semiResult.position)
  pos = semiResult.newPosition

  return ok(
    pos,
    withLoc(
      { kind: 'LabelDeclaration', labels } as LabelDeclarationNode,
      startToken.start,
      semiResult.astNode.end
    )
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
    const nameStartToken = peek({ tokens: input.tokens, position: pos })
    const nameResult = parseIdentifier({ tokens: input.tokens, position: pos })
    if (!nameResult.success) return fail(nameResult.error, nameResult.position)
    pos = nameResult.newPosition

    const eqResult = expectType({ tokens: input.tokens, position: pos }, 'EQUAL')
    if (!eqResult.success) return fail(eqResult.error, eqResult.position)
    pos = eqResult.newPosition

    const valResult = parseExpression({ tokens: input.tokens, position: pos })
    if (!valResult.success) return fail(valResult.error, valResult.position)
    pos = valResult.newPosition

    // Optional semicolon (sometimes missing in web/tangle output)
    if (peek({ tokens: input.tokens, position: pos }).type === 'SEMICOLON') {
      pos++
    }

    decls.push(
      withLoc(
        {
          kind: 'ConstDeclaration',
          name: nameResult.astNode,
          value: valResult.astNode,
        } as ConstDeclarationNode,
        nameStartToken.start,
        input.tokens[pos - 1].end
      )
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
    const nameStartToken = peek({ tokens: input.tokens, position: pos })
    const nameResult = parseIdentifier({ tokens: input.tokens, position: pos })
    if (!nameResult.success) return fail(nameResult.error, nameResult.position)
    pos = nameResult.newPosition

    const eqResult = expectType({ tokens: input.tokens, position: pos }, 'EQUAL')
    if (!eqResult.success) return fail(eqResult.error, eqResult.position)
    pos = eqResult.newPosition

    const typeResult = parseType({ tokens: input.tokens, position: pos })
    if (!typeResult.success) return fail(typeResult.error, typeResult.position)
    pos = typeResult.newPosition

    if (peek({ tokens: input.tokens, position: pos }).type === 'SEMICOLON') {
      pos++
    }

    decls.push(
      withLoc(
        {
          kind: 'TypeDeclaration',
          name: nameResult.astNode,
          typeDef: typeResult.astNode,
        } as TypeDeclarationNode,
        nameStartToken.start,
        input.tokens[pos - 1].end
      )
    )
  }

  return ok(pos, decls)
}

// VAR { identifier_list : type ; }
export function parseVariableDeclarations(
  input: ParserInput
): ParseResult<VariableDeclarationNode[]> {
  if (peek(input).type !== 'VAR') {
    return ok(input.position, [])
  }

  let pos = input.position + 1 // skip VAR
  const decls: VariableDeclarationNode[] = []

  while (peek({ tokens: input.tokens, position: pos }).type === 'IDENTIFIER') {
    const declResult = parseVariableDeclaration({ tokens: input.tokens, position: pos })
    if (!declResult.success) return fail(declResult.error, declResult.position)
    pos = declResult.newPosition

    if (peek({ tokens: input.tokens, position: pos }).type === 'SEMICOLON') {
      pos++
    }

    decls.push(declResult.astNode)
  }

  return ok(pos, decls)
}

// ============================================================================
// Procedure / Function Declarations
// ============================================================================

export function parseParameterList(input: ParserInput): ParseResult<ParameterDeclarationNode[]> {
  if (peek(input).type !== 'LPAREN') {
    return ok(input.position, [])
  }

  let pos = input.position + 1 // skip (
  const params: ParameterDeclarationNode[] = []

  while (peek({ tokens: input.tokens, position: pos }).type !== 'RPAREN') {
    const paramStartToken = peek({ tokens: input.tokens, position: pos })
    let isVar = false
    if (peek({ tokens: input.tokens, position: pos }).type === 'VAR') {
      isVar = true
      pos++
    }

    const namesResult = parseList({ tokens: input.tokens, position: pos }, parseIdentifier, 'COMMA')
    if (!namesResult.success) return fail(namesResult.error, namesResult.position)
    pos = namesResult.newPosition

    const colonResult = expectType({ tokens: input.tokens, position: pos }, 'COLON')
    if (!colonResult.success) return fail(colonResult.error, colonResult.position)
    pos = colonResult.newPosition

    const typeResult = parseType({ tokens: input.tokens, position: pos })
    if (!typeResult.success) return fail(typeResult.error, typeResult.position)
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
        input.tokens[pos - 1].end
      )
    )

    if (peek({ tokens: input.tokens, position: pos }).type !== 'SEMICOLON') break
    pos++
  }

  const closeResult = expectType({ tokens: input.tokens, position: pos }, 'RPAREN')
  if (!closeResult.success) return fail(closeResult.error, closeResult.position)
  pos = closeResult.newPosition

  return ok(pos, params)
}

export function parseProcedureDeclaration(
  input: ParserInput,
  outerLabels?: Set<number>
): ParseResult<ProcedureDeclarationNode> {
  const startToken = peek(input)
  let pos = input.position + 1 // skip PROCEDURE

  const nameResult = parseIdentifier({ tokens: input.tokens, position: pos })
  if (!nameResult.success) return fail(nameResult.error, nameResult.position)
  pos = nameResult.newPosition

  const paramsResult = parseParameterList({ tokens: input.tokens, position: pos })
  if (!paramsResult.success) return fail(paramsResult.error, paramsResult.position)
  pos = paramsResult.newPosition

  const semiResult = expectType({ tokens: input.tokens, position: pos }, 'SEMICOLON')
  if (!semiResult.success) return fail(semiResult.error, semiResult.position)
  pos = semiResult.newPosition

  // Check for FORWARD
  if (peek({ tokens: input.tokens, position: pos }).type === 'FORWARD') {
    pos++
    const semiResult2 = expectType({ tokens: input.tokens, position: pos }, 'SEMICOLON')
    if (!semiResult2.success) return fail(semiResult2.error, semiResult2.position)
    pos = semiResult2.newPosition
    return ok(
      pos,
      withLoc(
        {
          kind: 'ProcedureDeclaration',
          name: nameResult.astNode,
          parameters: paramsResult.astNode,
          block: null,
          isForward: true,
        } as ProcedureDeclarationNode,
        startToken.start,
        semiResult2.astNode.end
      )
    )
  }

  // Parse block
  const blockResult = parseBlock({ tokens: input.tokens, position: pos }, outerLabels)
  if (!blockResult.success) return fail(blockResult.error, blockResult.position)
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
      input.tokens[pos - 1].end
    )
  )
}

export function parseFunctionDeclaration(
  input: ParserInput,
  outerLabels?: Set<number>
): ParseResult<FunctionDeclarationNode> {
  const startToken = peek(input)
  let pos = input.position + 1 // skip FUNCTION

  const nameResult = parseIdentifier({ tokens: input.tokens, position: pos })
  if (!nameResult.success) return fail(nameResult.error, nameResult.position)
  pos = nameResult.newPosition

  const paramsResult = parseParameterList({ tokens: input.tokens, position: pos })
  if (!paramsResult.success) return fail(paramsResult.error, paramsResult.position)
  pos = paramsResult.newPosition

  const colonResult = expectType({ tokens: input.tokens, position: pos }, 'COLON')
  if (!colonResult.success) return fail(colonResult.error, colonResult.position)
  pos = colonResult.newPosition

  const returnTypeResult = parseType({ tokens: input.tokens, position: pos })
  if (!returnTypeResult.success) return fail(returnTypeResult.error, returnTypeResult.position)
  pos = returnTypeResult.newPosition

  const semiResult = expectType({ tokens: input.tokens, position: pos }, 'SEMICOLON')
  if (!semiResult.success) return fail(semiResult.error, semiResult.position)
  pos = semiResult.newPosition

  // Check for FORWARD
  if (peek({ tokens: input.tokens, position: pos }).type === 'FORWARD') {
    pos++
    const semiResult2 = expectType({ tokens: input.tokens, position: pos }, 'SEMICOLON')
    if (!semiResult2.success) return fail(semiResult2.error, semiResult2.position)
    pos = semiResult2.newPosition
    return ok(
      pos,
      withLoc(
        {
          kind: 'FunctionDeclaration',
          name: nameResult.astNode,
          parameters: paramsResult.astNode,
          returnType: returnTypeResult.astNode,
          block: null,
          isForward: true,
        } as FunctionDeclarationNode,
        startToken.start,
        semiResult2.astNode.end
      )
    )
  }

  // Parse block
  const blockResult = parseBlock({ tokens: input.tokens, position: pos }, outerLabels)
  if (!blockResult.success) return fail(blockResult.error, blockResult.position)
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
      input.tokens[pos - 1].end
    )
  )
}

// ============================================================================
// Block & Program Parsers
// ============================================================================

export function parseBlock(
  input: ParserInput,
  outerLabels?: Set<number>
): ParseResult<BlockNode> {
  const startToken = peek(input)
  let pos = input.position

  // Label section
  let labelDeclarations: LabelDeclarationNode | null = null
  if (peek({ tokens: input.tokens, position: pos }).type === 'LABEL') {
    const r = parseLabelDeclaration({ tokens: input.tokens, position: pos })
    if (!r.success) return fail(r.error, r.position)
    labelDeclarations = r.astNode
    pos = r.newPosition
  }

  // Const section
  const constResult = parseConstDeclarations({ tokens: input.tokens, position: pos })
  if (!constResult.success) return fail(constResult.error, constResult.position)
  pos = constResult.newPosition

  // Type section
  const typeResult = parseTypeDeclarations({ tokens: input.tokens, position: pos })
  if (!typeResult.success) return fail(typeResult.error, typeResult.position)
  pos = typeResult.newPosition

  // Var section
  const varResult = parseVariableDeclarations({ tokens: input.tokens, position: pos })
  if (!varResult.success) return fail(varResult.error, varResult.position)
  pos = varResult.newPosition

  // Procedure / Function declarations
  const procDecls: ProcedureDeclarationNode[] = []
  const funcDecls: FunctionDeclarationNode[] = []

  // 收集当前 block 可见的 label（外层 + 当前层），传递给嵌套 procedure/function
  const currentLabels = new Set<number>(outerLabels ?? [])
  if (labelDeclarations) {
    for (const l of labelDeclarations.labels) currentLabels.add(l.value)
  }

  while (true) {
    const token = peek({ tokens: input.tokens, position: pos })
    if (token.type === 'PROCEDURE') {
      const r = parseProcedureDeclaration({ tokens: input.tokens, position: pos }, currentLabels)
      if (!r.success) return fail(r.error, r.position)
      procDecls.push(r.astNode)
      pos = r.newPosition
    } else if (token.type === 'FUNCTION') {
      const r = parseFunctionDeclaration({ tokens: input.tokens, position: pos }, currentLabels)
      if (!r.success) return fail(r.error, r.position)
      funcDecls.push(r.astNode)
      pos = r.newPosition
    } else {
      break
    }
  }

  // Compound statement
  const compoundResult = parseCompoundStatement({ tokens: input.tokens, position: pos })
  if (!compoundResult.success) return fail(compoundResult.error, compoundResult.position)
  pos = compoundResult.newPosition

  // Pascal82 语义检查：label 在同一 block 内必须唯一
  const labelCheck = checkDuplicateLabels(compoundResult.astNode)
  if (!labelCheck.success) return fail(labelCheck.error, labelCheck.position)

  // Pascal82 §6.2.1: 声明的 label 必须在 block 的 statement-part 中恰好出现一次
  // §6.8.1: goto 只能跳转到同一 statement-sequence 或包含 goto 的 block 的 statement-part 中的标签
  const gotoCheck = checkGotoTargets(labelDeclarations, compoundResult.astNode, outerLabels)
  if (!gotoCheck.success) return fail(gotoCheck.error, gotoCheck.position)

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
      input.tokens[pos - 1].end
    )
  )
}

// Pascal82 要求同一 block 内不能重复声明 label。跨 block（不同 procedure/function）允许同名 label。
function checkDuplicateLabels(
  stmt: StatementNode | null
): { success: true } | { success: false; error: string; position: number } {
  if (!stmt) return { success: true }
  const seen = new Set<number>()
  return walkForLabels(stmt, seen)
}

function walkForLabels(
  stmt: StatementNode | null | undefined,
  seen: Set<number>
): { success: true } | { success: false; error: string; position: number } {
  if (!stmt) return { success: true }
  if ((stmt as any).kind === 'LabeledStatement') {
    const ls = stmt as any
    const value = ls.label.value
    if (seen.has(value)) {
      return { success: false, error: `Duplicate label ${value}`, position: 0 }
    }
    seen.add(value)
    return walkForLabels(ls.statement, seen)
  }
  if ((stmt as any).kind === 'CompoundStatement') {
    for (const s of (stmt as any).statements) {
      const r = walkForLabels(s, seen)
      if (!r.success) return r
    }
    return { success: true }
  }
  if ((stmt as any).kind === 'IfStatement') {
    const r = walkForLabels((stmt as any).thenBranch, seen)
    if (!r.success) return r
    if ((stmt as any).elseBranch) return walkForLabels((stmt as any).elseBranch, seen)
    return { success: true }
  }
  if ((stmt as any).kind === 'WhileStatement' || (stmt as any).kind === 'ForStatement') {
    return walkForLabels((stmt as any).body, seen)
  }
  if ((stmt as any).kind === 'RepeatStatement') {
    for (const s of (stmt as any).statements) {
      const r = walkForLabels(s, seen)
      if (!r.success) return r
    }
    return { success: true }
  }
  if ((stmt as any).kind === 'CaseStatement') {
    for (const branch of (stmt as any).branches) {
      const r = walkForLabels(branch.statement, seen)
      if (!r.success) return r
    }
    return { success: true }
  }
  if ((stmt as any).kind === 'WithStatement') {
    return walkForLabels((stmt as any).statement, seen)
  }
  return { success: true }
}

// Pascal82 §6.2.1: 声明的 label 必须在 block 的 statement-part 中恰好出现一次
// §6.8.1: goto 只能跳转到同一 statement-sequence 或包含 goto 的 block 的 statement-part 中的标签
// 非透明块（if/while/for/repeat）内部的标签对外部不可见，但对块内的 goto 可见
function checkGotoTargets(
  labelDecl: LabelDeclarationNode | null,
  compound: StatementNode,
  outerLabels?: Set<number>
): { success: true } | { success: false; error: string; position: number } {
  const allLabels = new Set<number>(outerLabels ?? [])
  collectAllLabels(compound, allLabels)

  if (labelDecl) {
    for (const l of labelDecl.labels) {
      if (!allLabels.has(l.value)) {
        return {
          success: false,
          error: `label ${l.value} not found`,
          position: 0,
        }
      }
    }
  }

  const visibleLabels = new Set<number>(outerLabels ?? [])
  collectTopLevelLabels(compound, visibleLabels)

  return validateGotos(compound, visibleLabels)
}

function collectAllLabels(
  stmt: StatementNode | null | undefined,
  labels: Set<number>
): void {
  if (!stmt) return
  if ((stmt as any).kind === 'LabeledStatement') {
    labels.add((stmt as any).label.value)
    collectAllLabels((stmt as any).statement, labels)
    return
  }
  if ((stmt as any).kind === 'CompoundStatement') {
    for (const s of (stmt as any).statements) collectAllLabels(s, labels)
    return
  }
  if ((stmt as any).kind === 'CaseStatement') {
    for (const branch of (stmt as any).branches) collectAllLabels(branch.statement, labels)
    return
  }
  if ((stmt as any).kind === 'WithStatement') {
    collectAllLabels((stmt as any).statement, labels)
    return
  }
  if ((stmt as any).kind === 'IfStatement') {
    collectAllLabels((stmt as any).thenBranch, labels)
    if ((stmt as any).elseBranch) collectAllLabels((stmt as any).elseBranch, labels)
    return
  }
  if ((stmt as any).kind === 'WhileStatement' || (stmt as any).kind === 'ForStatement') {
    collectAllLabels((stmt as any).body, labels)
    return
  }
  if ((stmt as any).kind === 'RepeatStatement') {
    for (const s of (stmt as any).statements) collectAllLabels(s, labels)
    return
  }
}

function collectTopLevelLabels(
  stmt: StatementNode | null | undefined,
  labels: Set<number>
): void {
  if (!stmt) return
  if ((stmt as any).kind === 'LabeledStatement') {
    labels.add((stmt as any).label.value)
    collectTopLevelLabels((stmt as any).statement, labels)
    return
  }
  if ((stmt as any).kind === 'CompoundStatement') {
    for (const s of (stmt as any).statements) collectTopLevelLabels(s, labels)
    return
  }
  if ((stmt as any).kind === 'CaseStatement') {
    for (const branch of (stmt as any).branches) collectTopLevelLabels(branch.statement, labels)
    return
  }
  if ((stmt as any).kind === 'WithStatement') {
    collectTopLevelLabels((stmt as any).statement, labels)
    return
  }
}

function validateGotos(
  stmt: StatementNode | null | undefined,
  validLabels: Set<number>
): { success: true } | { success: false; error: string; position: number } {
  if (!stmt) return { success: true }
  if ((stmt as any).kind === 'GotoStatement') {
    const value = (stmt as any).label.value
    if (!validLabels.has(value)) {
      return {
        success: false,
        error: `GOTO target label ${value} is not declared in this block`,
        position: 0,
      }
    }
    return { success: true }
  }
  if ((stmt as any).kind === 'LabeledStatement') {
    return validateGotos((stmt as any).statement, validLabels)
  }
  if ((stmt as any).kind === 'CompoundStatement') {
    for (const s of (stmt as any).statements) {
      const r = validateGotos(s, validLabels)
      if (!r.success) return r
    }
    return { success: true }
  }
  if ((stmt as any).kind === 'CaseStatement') {
    for (const branch of (stmt as any).branches) {
      const r = validateGotos(branch.statement, validLabels)
      if (!r.success) return r
    }
    return { success: true }
  }
  if ((stmt as any).kind === 'WithStatement') {
    return validateGotos((stmt as any).statement, validLabels)
  }
  if ((stmt as any).kind === 'IfStatement') {
    const thenLabels = new Set(validLabels)
    collectTopLevelLabels((stmt as any).thenBranch, thenLabels)
    let r = validateGotos((stmt as any).thenBranch, thenLabels)
    if (!r.success) return r
    if ((stmt as any).elseBranch) {
      const elseLabels = new Set(validLabels)
      collectTopLevelLabels((stmt as any).elseBranch, elseLabels)
      return validateGotos((stmt as any).elseBranch, elseLabels)
    }
    return { success: true }
  }
  if ((stmt as any).kind === 'WhileStatement') {
    const innerLabels = new Set(validLabels)
    collectTopLevelLabels((stmt as any).body, innerLabels)
    return validateGotos((stmt as any).body, innerLabels)
  }
  if ((stmt as any).kind === 'ForStatement') {
    const innerLabels = new Set(validLabels)
    collectTopLevelLabels((stmt as any).body, innerLabels)
    return validateGotos((stmt as any).body, innerLabels)
  }
  if ((stmt as any).kind === 'RepeatStatement') {
    const innerLabels = new Set(validLabels)
    for (const s of (stmt as any).statements) {
      collectTopLevelLabels(s, innerLabels)
    }
    for (const s of (stmt as any).statements) {
      const r = validateGotos(s, innerLabels)
      if (!r.success) return r
    }
    return { success: true }
  }
  return { success: true }
}

// PROGRAM identifier ( identifier_list ) ; block .
export function parseProgram(input: ParserInput): ParseResult<ProgramNode> {
  const startToken = peek(input)
  let pos = input.position

  // Skip compiler directives and comments (already handled by lexer)
  // Expect PROGRAM keyword
  const progResult = expectKeyword({ tokens: input.tokens, position: pos }, 'PROGRAM')
  if (!progResult.success) return fail(progResult.error, progResult.position)
  pos = progResult.newPosition

  // Program name
  const nameResult = parseIdentifier({ tokens: input.tokens, position: pos })
  if (!nameResult.success) return fail(nameResult.error, nameResult.position)
  pos = nameResult.newPosition

  // Optional program parameters
  const parameters: IdentifierNode[] = []
  if (peek({ tokens: input.tokens, position: pos }).type === 'LPAREN') {
    pos++
    while (peek({ tokens: input.tokens, position: pos }).type !== 'RPAREN') {
      const idResult = parseIdentifier({ tokens: input.tokens, position: pos })
      if (!idResult.success) return fail(idResult.error, idResult.position)
      parameters.push(idResult.astNode)
      pos = idResult.newPosition

      if (peek({ tokens: input.tokens, position: pos }).type !== 'COMMA') break
      pos++
    }
    const closeResult = expectType({ tokens: input.tokens, position: pos }, 'RPAREN')
    if (!closeResult.success) return fail(closeResult.error, closeResult.position)
    pos = closeResult.newPosition
  }

  // Semicolon
  const semiResult = expectType({ tokens: input.tokens, position: pos }, 'SEMICOLON')
  if (!semiResult.success) return fail(semiResult.error, semiResult.position)
  pos = semiResult.newPosition

  // Block
  const blockResult = parseBlock({ tokens: input.tokens, position: pos })
  if (!blockResult.success) return fail(blockResult.error, blockResult.position)
  pos = blockResult.newPosition

  // Final dot
  const dotResult = expectType({ tokens: input.tokens, position: pos }, 'DOT')
  if (!dotResult.success) return fail(dotResult.error, dotResult.position)
  pos = dotResult.newPosition

  // Ensure all tokens are consumed (no trailing garbage after program)
  const trailing = peek({ tokens: input.tokens, position: pos })
  if (trailing.type !== 'EOF') {
    return fail(
      `Unexpected token ${trailing.type} (${trailing.content}) after program end at line ${trailing.start.line}:${trailing.start.column}`,
      pos
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
      dotResult.astNode.end
    )
  )
}
