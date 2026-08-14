import { lex } from '@/lexer/lexer'
import { ParserInput } from '@/ast/types'
import { parseExpression, parseExpressionList, parseIdentifier } from '@/parser/expressions'
import { parseType, parseVariableDeclaration } from '@/parser/types'
import { parseCompoundStatement, parseStatement } from '@/parser/statements'
import {
  parseBlock,
  parseConstDeclarations,
  parseFunctionDeclaration,
  parseLabelDeclaration,
  parseParameterList,
  parseProcedureDeclaration,
  parseProgram,
  parseTypeDeclarations,
  parseVariableDeclarations,
} from '@/parser/declarations'
import { assert, assertEquals, describe, test } from '../../_harness.ts'

function makeInput(source: string): ParserInput {
  return { tokens: lex(source), position: 0 }
}

// ============================================================================
// Production: identifier
// ============================================================================
describe('Production: identifier', () => {
  test('should parse simple identifier', () => {
    const result = parseIdentifier(makeInput('hello'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.kind, 'Identifier', 'kind mismatch: ' + result.astNode!.kind + " vs 'Identifier'")
      assertEquals(result.astNode!.name, 'hello', 'result.astNode.name mismatch')
    }
  })

  test('should fail on non-identifier', () => {
    const result = parseIdentifier(makeInput('123'))
    assert(!result.success, 'parse should have failed')
  })

  test('should parse identifier with digits', () => {
    const result = parseIdentifier(makeInput('var123'))
    assert(result.success, 'parse success')
  })
})

// ============================================================================
// Production: expression
// ============================================================================
describe('Production: expression', () => {
  test('should parse integer literal', () => {
    const result = parseExpression(makeInput('42'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(
        result.astNode!.kind,
        'IntegerLiteral',
        'kind mismatch: ' + result.astNode!.kind + " vs 'IntegerLiteral'",
      )
      assertEquals((result.astNode as any).value, 42, '(.value) mismatch')
    }
  })

  test('should parse string literal', () => {
    const result = parseExpression(makeInput("'hello'"))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(
        result.astNode!.kind,
        'StringLiteral',
        'kind mismatch: ' + result.astNode!.kind + " vs 'StringLiteral'",
      )
    }
  })

  test('should parse identifier', () => {
    const result = parseExpression(makeInput('x'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.kind, 'Identifier', 'kind mismatch: ' + result.astNode!.kind + " vs 'Identifier'")
    }
  })

  test('should parse binary expression', () => {
    const result = parseExpression(makeInput('a + b'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(
        result.astNode!.kind,
        'BinaryExpression',
        'kind mismatch: ' + result.astNode!.kind + " vs 'BinaryExpression'",
      )
      assertEquals((result.astNode as any).operator, '+', '(.operator) mismatch')
    }
  })

  test('should parse multiplication with higher precedence', () => {
    const result = parseExpression(makeInput('a + b * c'))
    assert(result.success, 'parse success')
    if (result.success) {
      // Should be: a + (b * c)
      assertEquals(
        result.astNode!.kind,
        'BinaryExpression',
        'kind mismatch: ' + result.astNode!.kind + " vs 'BinaryExpression'",
      )
      assertEquals((result.astNode as any).operator, '+', '(.operator) mismatch')
      assertEquals((result.astNode as any).right.kind, 'BinaryExpression', '(.right.kind) mismatch')
      assertEquals((result.astNode as any).right.operator, '*', '(.right.operator) mismatch')
    }
  })

  test('should parse comparison', () => {
    const result = parseExpression(makeInput('a < b'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(
        result.astNode!.kind,
        'BinaryExpression',
        'kind mismatch: ' + result.astNode!.kind + " vs 'BinaryExpression'",
      )
      assertEquals((result.astNode as any).operator, '<', '(.operator) mismatch')
    }
  })

  test('should parse DIV and MOD', () => {
    const result = parseExpression(makeInput('a DIV b MOD c'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(
        result.astNode!.kind,
        'BinaryExpression',
        'kind mismatch: ' + result.astNode!.kind + " vs 'BinaryExpression'",
      )
      assertEquals((result.astNode as any).operator, 'MOD', '(.operator) mismatch')
      assertEquals((result.astNode as any).left.operator, 'DIV', '(.left.operator) mismatch')
    }
  })

  test('should parse parenthesized expression', () => {
    const result = parseExpression(makeInput('(a + b)'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(
        result.astNode!.kind,
        'ParenthesizedExpression',
        'kind mismatch: ' + result.astNode!.kind + " vs 'ParenthesizedExpression'",
      )
    }
  })

  test('should parse unary minus', () => {
    const result = parseExpression(makeInput('-a'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(
        result.astNode!.kind,
        'UnaryExpression',
        'kind mismatch: ' + result.astNode!.kind + " vs 'UnaryExpression'",
      )
      assertEquals((result.astNode as any).operator, '-', '(.operator) mismatch')
    }
  })

  test('should parse NOT', () => {
    const result = parseExpression(makeInput('NOT a'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(
        result.astNode!.kind,
        'UnaryExpression',
        'kind mismatch: ' + result.astNode!.kind + " vs 'UnaryExpression'",
      )
      assertEquals((result.astNode as any).operator, 'NOT', '(.operator) mismatch')
    }
  })

  test('should parse function call', () => {
    const result = parseExpression(makeInput('f(x, y)'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(
        result.astNode!.kind,
        'FunctionCall',
        'kind mismatch: ' + result.astNode!.kind + " vs 'FunctionCall'",
      )
      assertEquals((result.astNode as any).arguments.length, 2, 'arguments length expected 2')
    }
  })

  test('should parse array access', () => {
    const result = parseExpression(makeInput('a[i]'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.kind, 'ArrayAccess', 'kind mismatch: ' + result.astNode!.kind + " vs 'ArrayAccess'")
    }
  })

  test('should parse field access', () => {
    const result = parseExpression(makeInput('a.b'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.kind, 'FieldAccess', 'kind mismatch: ' + result.astNode!.kind + " vs 'FieldAccess'")
    }
  })

  test('should parse chained access', () => {
    const result = parseExpression(makeInput('a[i].b'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.kind, 'FieldAccess', 'kind mismatch: ' + result.astNode!.kind + " vs 'FieldAccess'")
      assertEquals((result.astNode as any).object.kind, 'ArrayAccess', '(.object.kind) mismatch')
    }
  })

  test('should parse IN expression', () => {
    const result = parseExpression(makeInput('a IN b'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(
        result.astNode!.kind,
        'InExpression',
        'kind mismatch: ' + result.astNode!.kind + " vs 'InExpression'",
      )
    }
  })
})

// ============================================================================
// Production: expression_list
// ============================================================================
describe('Production: expression_list', () => {
  test('should parse single expression', () => {
    const result = parseExpressionList(makeInput('x'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode.length, 1, 'length mismatch, expected 1')
    }
  })

  test('should parse multiple expressions', () => {
    const result = parseExpressionList(makeInput('x, y, z'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode.length, 3, 'length mismatch, expected 3')
    }
  })
})

// ============================================================================
// Production: type
// ============================================================================
describe('Production: type', () => {
  test('should parse simple type', () => {
    const result = parseType(makeInput('INTEGER'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.kind, 'SimpleType', 'kind mismatch: ' + result.astNode!.kind + " vs 'SimpleType'")
    }
  })

  test('should parse range type', () => {
    const result = parseType(makeInput('0..255'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.kind, 'RangeType', 'kind mismatch: ' + result.astNode!.kind + " vs 'RangeType'")
    }
  })

  test('should parse array type', () => {
    const result = parseType(makeInput('ARRAY[0..100]OF INTEGER'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.kind, 'ArrayType', 'kind mismatch: ' + result.astNode!.kind + " vs 'ArrayType'")
    }
  })

  test('should parse packed array', () => {
    const result = parseType(makeInput('PACKED ARRAY[0..1,0..45000]OF ASCIICODE'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.kind, 'ArrayType', 'kind mismatch: ' + result.astNode!.kind + " vs 'ArrayType'")
      assertEquals((result.astNode as any).isPacked, true, '(.isPacked) mismatch')
      assertEquals((result.astNode as any).indexTypes.length, 2, 'indexTypes length expected 2')
    }
  })

  test('should parse record type', () => {
    const result = parseType(makeInput('RECORD X: INTEGER; Y: CHAR END'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.kind, 'RecordType', 'kind mismatch: ' + result.astNode!.kind + " vs 'RecordType'")
      assertEquals((result.astNode as any).fields.length, 2, 'fields length expected 2')
    }
  })

  test('should parse file type', () => {
    const result = parseType(makeInput('FILE OF CHAR'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.kind, 'FileType', 'kind mismatch: ' + result.astNode!.kind + " vs 'FileType'")
    }
  })

  test('should parse packed file', () => {
    const result = parseType(makeInput('PACKED FILE OF CHAR'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.kind, 'FileType', 'kind mismatch: ' + result.astNode!.kind + " vs 'FileType'")
      assertEquals((result.astNode as any).isPacked, true, '(.isPacked) mismatch')
    }
  })

  test('should parse enumeration type', () => {
    const result = parseType(makeInput('(RED, GREEN, BLUE)'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(
        result.astNode!.kind,
        'EnumerationType',
        'kind mismatch: ' + result.astNode!.kind + " vs 'EnumerationType'",
      )
      assertEquals((result.astNode as any).values.length, 3, 'values length expected 3')
    }
  })

  test('should parse set type', () => {
    const result = parseType(makeInput('SET OF 0..7'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.kind, 'SetType', 'kind mismatch: ' + result.astNode!.kind + " vs 'SetType'")
    }
  })
})

// ============================================================================
// Production: variable_declaration
// ============================================================================
describe('Production: variable_declaration', () => {
  test('should parse single variable', () => {
    const result = parseVariableDeclaration(makeInput('X: INTEGER'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(
        result.astNode!.kind,
        'VariableDeclaration',
        'kind mismatch: ' + result.astNode!.kind + " vs 'VariableDeclaration'",
      )
      assertEquals(result.astNode.names.length, 1, 'length mismatch, expected 1')
    }
  })

  test('should parse multiple variables', () => {
    const result = parseVariableDeclaration(makeInput('X, Y, Z: CHAR'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode.names.length, 3, 'length mismatch, expected 3')
    }
  })

  test('should parse array variable', () => {
    const result = parseVariableDeclaration(makeInput('BUF: ARRAY[1..10]OF INTEGER'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.type.kind, 'ArrayType', 'type.kind mismatch')
    }
  })
})

// ============================================================================
// Production: statement
// ============================================================================
describe('Production: statement', () => {
  test('should parse assignment', () => {
    const result = parseStatement(makeInput('X := 42'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.kind, 'Assignment', 'kind mismatch: ' + result.astNode!.kind + " vs 'Assignment'")
    }
  })

  test('should parse assignment with array access', () => {
    const result = parseStatement(makeInput('BUF[I] := 0'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.kind, 'Assignment', 'kind mismatch: ' + result.astNode!.kind + " vs 'Assignment'")
      assertEquals((result.astNode as any).left.kind, 'ArrayAccess', '(.left.kind) mismatch')
    }
  })

  test('should parse if statement', () => {
    const result = parseStatement(makeInput('IF X > 0 THEN Y := 1'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.kind, 'IfStatement', 'kind mismatch: ' + result.astNode!.kind + " vs 'IfStatement'")
      assert((result.astNode as any).elseBranch === null, 'elseBranch expected null')
    }
  })

  test('should parse if-else statement', () => {
    const result = parseStatement(makeInput('IF X > 0 THEN Y := 1 ELSE Y := 2'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.kind, 'IfStatement', 'kind mismatch: ' + result.astNode!.kind + " vs 'IfStatement'")
      assert((result.astNode as any).elseBranch !== null, 'elseBranch expected not null')
    }
  })

  test('should parse while statement', () => {
    const result = parseStatement(makeInput('WHILE X > 0 DO X := X - 1'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(
        result.astNode!.kind,
        'WhileStatement',
        'kind mismatch: ' + result.astNode!.kind + " vs 'WhileStatement'",
      )
    }
  })

  test('should parse repeat statement', () => {
    const result = parseStatement(makeInput('REPEAT X := X - 1 UNTIL X = 0'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(
        result.astNode!.kind,
        'RepeatStatement',
        'kind mismatch: ' + result.astNode!.kind + " vs 'RepeatStatement'",
      )
    }
  })

  test('should parse for statement', () => {
    const result = parseStatement(makeInput('FOR I := 1 TO 10 DO SUM := SUM + I'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(
        result.astNode!.kind,
        'ForStatement',
        'kind mismatch: ' + result.astNode!.kind + " vs 'ForStatement'",
      )
      assertEquals((result.astNode as any).direction, 'TO', '(.direction) mismatch')
    }
  })

  test('should parse for-downto statement', () => {
    const result = parseStatement(makeInput('FOR I := 10 DOWNTO 1 DO SUM := SUM + I'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(
        result.astNode!.kind,
        'ForStatement',
        'kind mismatch: ' + result.astNode!.kind + " vs 'ForStatement'",
      )
      assertEquals((result.astNode as any).direction, 'DOWNTO', '(.direction) mismatch')
    }
  })

  test('should parse goto statement', () => {
    const result = parseStatement(makeInput('GOTO 9999'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(
        result.astNode!.kind,
        'GotoStatement',
        'kind mismatch: ' + result.astNode!.kind + " vs 'GotoStatement'",
      )
    }
  })

  test('should parse procedure call', () => {
    const result = parseStatement(makeInput('WRITE(X, Y)'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(
        result.astNode!.kind,
        'ProcedureCall',
        'kind mismatch: ' + result.astNode!.kind + " vs 'ProcedureCall'",
      )
    }
  })

  test('should parse procedure call without args', () => {
    const result = parseStatement(makeInput('BREAK'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(
        result.astNode!.kind,
        'ProcedureCall',
        'kind mismatch: ' + result.astNode!.kind + " vs 'ProcedureCall'",
      )
      assertEquals((result.astNode as any).arguments.length, 0, 'arguments length expected 0')
    }
  })

  test('should parse empty statement', () => {
    const result = parseStatement(makeInput(';'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(
        result.astNode!.kind,
        'EmptyStatement',
        'kind mismatch: ' + result.astNode!.kind + " vs 'EmptyStatement'",
      )
    }
  })
})

// ============================================================================
// Production: compound_statement
// ============================================================================
describe('Production: compound_statement', () => {
  test('should parse empty compound', () => {
    const result = parseCompoundStatement(makeInput('BEGIN END'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(
        result.astNode!.kind,
        'CompoundStatement',
        'kind mismatch: ' + result.astNode!.kind + " vs 'CompoundStatement'",
      )
      assertEquals(result.astNode.statements.length, 0, 'length mismatch, expected 0')
    }
  })

  test('should parse compound with statements', () => {
    const result = parseCompoundStatement(makeInput('BEGIN X := 1; Y := 2 END'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode.statements.length, 2, 'length mismatch, expected 2')
    }
  })

  test('should parse nested compound', () => {
    const result = parseCompoundStatement(makeInput('BEGIN BEGIN X := 1 END END'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.statements[0].kind, 'CompoundStatement', 'statements[0].kind mismatch')
    }
  })
})

// ============================================================================
// Production: label_declaration
// ============================================================================
describe('Production: label_declaration', () => {
  test('should parse single label', () => {
    const result = parseLabelDeclaration(makeInput('LABEL 9999;'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.labels.length, 1, 'labels length expected 1')
      assertEquals(result.astNode!.labels[0].value, 9999, 'label value mismatch')
    }
  })

  test('should parse multiple labels', () => {
    const result = parseLabelDeclaration(makeInput('LABEL 10, 20, 30;'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode.labels.length, 3, 'length mismatch, expected 3')
    }
  })
})

// ============================================================================
// Production: const_declarations
// ============================================================================
describe('Production: const_declarations', () => {
  test('should parse single const', () => {
    const result = parseConstDeclarations(makeInput('CONST MAX = 100'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.length, 1, 'const decls length expected 1')
      assertEquals(result.astNode![0].name.name, 'MAX', 'const decl name mismatch')
    }
  })

  test('should parse multiple consts', () => {
    const result = parseConstDeclarations(makeInput('CONST MAX = 100; MIN = 0'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode.length, 2, 'length mismatch, expected 2')
    }
  })

  test('should return empty when no CONST keyword', () => {
    const result = parseConstDeclarations(makeInput('VAR'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode.length, 0, 'length mismatch, expected 0')
    }
  })
})

// ============================================================================
// Production: type_declarations
// ============================================================================
describe('Production: type_declarations', () => {
  test('should parse single type declaration', () => {
    const result = parseTypeDeclarations(makeInput('TYPE ASCIICODE = 0..127'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode.length, 1, 'length mismatch, expected 1')
      assertEquals(result.astNode![0].name.name, 'ASCIICODE', 'type decl name mismatch')
      assertEquals(result.astNode![0].typeDef.kind, 'RangeType', 'typeDef.kind mismatch')
    }
  })

  test('should parse multiple type declarations', () => {
    const result = parseTypeDeclarations(makeInput('TYPE A = INTEGER; B = 0..255; C = CHAR'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode.length, 3, 'length mismatch, expected 3')
    }
  })
})

// ============================================================================
// Production: variable_declarations
// ============================================================================
describe('Production: variable_declarations', () => {
  test('should parse single var declaration', () => {
    const result = parseVariableDeclarations(makeInput('VAR X: INTEGER'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode.length, 1, 'length mismatch, expected 1')
    }
  })

  test('should parse multiple var declarations', () => {
    const result = parseVariableDeclarations(makeInput('VAR X: INTEGER; Y, Z: CHAR'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode.length, 2, 'length mismatch, expected 2')
      assertEquals(result.astNode[1].names.length, 2, 'length mismatch, expected 2')
    }
  })
})

// ============================================================================
// Production: parameter_list
// ============================================================================
describe('Production: parameter_list', () => {
  test('should parse empty parameter list', () => {
    const result = parseParameterList(makeInput(''))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode.length, 0, 'length mismatch, expected 0')
    }
  })

  test('should parse single parameter', () => {
    const result = parseParameterList(makeInput('(X: INTEGER)'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.length, 1, 'type decls length expected 1')
      assertEquals(result.astNode![0].isVar, false, 'decl isVar expected false')
    }
  })

  test('should parse VAR parameter', () => {
    const result = parseParameterList(makeInput('(VAR F: TEXTFILE)'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode![0].isVar, true, 'parameter isVar should be true')
    }
  })

  test('should parse multiple parameters', () => {
    const result = parseParameterList(makeInput('(X: INTEGER; VAR Y: CHAR)'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode.length, 2, 'length mismatch, expected 2')
    }
  })
})

// ============================================================================
// Production: procedure_declaration
// ============================================================================
describe('Production: procedure_declaration', () => {
  test('should parse procedure without parameters', () => {
    const result = parseProcedureDeclaration(makeInput('PROCEDURE FOO; BEGIN END;'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.name.name, 'FOO', 'procedure name (FOO, no params) mismatch')
      assertEquals(result.astNode!.parameters.length, 0, 'parameters length expected 0')
      assertEquals(result.astNode!.isForward, false, 'isForward expected false')
    }
  })

  test('should parse procedure with parameters', () => {
    const result = parseProcedureDeclaration(makeInput('PROCEDURE BAR(X: INTEGER); BEGIN END;'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.name.name, 'BAR', 'procedure name (BAR, with params) mismatch')
      assertEquals(result.astNode!.parameters.length, 1, 'parameters length expected 1')
    }
  })

  test('should parse FORWARD procedure', () => {
    const result = parseProcedureDeclaration(makeInput('PROCEDURE DEBUGHELP; FORWARD;'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.isForward, true, 'isForward mismatch')
      assert(result.astNode!.block === null, 'block expected null (forward)')
    }
  })
})

// ============================================================================
// Production: function_declaration
// ============================================================================
describe('Production: function_declaration', () => {
  test('should parse function without parameters', () => {
    const result = parseFunctionDeclaration(makeInput('FUNCTION FOO: INTEGER; BEGIN END;'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.name.name, 'FOO', 'function name (FOO, no params) mismatch')
      assertEquals(result.astNode!.returnType.kind, 'SimpleType', 'returnType.kind expected SimpleType')
    }
  })

  test('should parse function with parameters', () => {
    const result = parseFunctionDeclaration(
      makeInput('FUNCTION BAR(X: INTEGER): BOOLEAN; BEGIN END;'),
    )
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode.parameters.length, 1, 'length mismatch, expected 1')
    }
  })

  test('should parse FORWARD function', () => {
    const result = parseFunctionDeclaration(makeInput('FUNCTION FOO: INTEGER; FORWARD;'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.isForward, true, 'result.astNode.isForward mismatch')
    }
  })
})

// ============================================================================
// Production: block
// ============================================================================
describe('Production: block', () => {
  test('should parse block with declarations', () => {
    const source = 'LABEL 9999; CONST MAX = 100; VAR X: INTEGER; BEGIN 9999: X := 1 END'
    const result = parseBlock(makeInput(source))
    assert(result.success, 'parse success')
    if (result.success) {
      assert(result.astNode!.labelDeclarations !== null, 'labelDeclarations expected not null')
      assertEquals(result.astNode.constDeclarations.length, 1, 'length mismatch, expected 1')
      assertEquals(result.astNode.variableDeclarations.length, 1, 'length mismatch, expected 1')
    }
  })

  test('should parse block with procedures', () => {
    const source = 'PROCEDURE FOO; BEGIN END; BEGIN FOO END'
    const result = parseBlock(makeInput(source))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode.procedureDeclarations.length, 1, 'length mismatch, expected 1')
    }
  })
})

// ============================================================================
// Production: program
// ============================================================================
describe('Production: program', () => {
  test('should parse minimal program', () => {
    const result = parseProgram(makeInput('PROGRAM TEST; BEGIN END.'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.name.name, 'TEST', 'program name (simple) mismatch')
      assertEquals(result.astNode!.parameters.length, 0, 'program parameters length expected 0')
    }
  })

  test('should parse program with parameters', () => {
    const result = parseProgram(makeInput('PROGRAM TANGLE(WEBFILE, CHANGEFILE); BEGIN END.'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode.parameters.length, 2, 'length mismatch, expected 2')
    }
  })

  test('should parse program with label and const', () => {
    const result = parseProgram(
      makeInput('PROGRAM TEST; LABEL 9999; CONST MAX = 100; BEGIN 9999: GOTO 9999 END.'),
    )
    assert(result.success, 'parse success')
    if (result.success) {
      assert(result.astNode!.block.labelDeclarations !== null, 'block.labelDeclarations expected not null')
      assertEquals(result.astNode!.block.constDeclarations.length, 1, 'block.constDeclarations length expected 1')
    }
  })

  test('should parse program with compiler directives', () => {
    const result = parseProgram(makeInput('{$C-,A+,D-} PROGRAM TEST; BEGIN END.'))
    assert(result.success, 'parse success')
    if (result.success) {
      assertEquals(result.astNode!.name.name, 'TEST', 'program name (second TEST) mismatch')
    }
  })
})
