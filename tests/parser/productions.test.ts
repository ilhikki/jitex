import { lex } from '../../src/lexer/lexer'
import { ParserInput } from '../../src/ast/types'
import { parseExpression, parseIdentifier, parseExpressionList } from '../../src/parser/expressions'
import { parseType, parseVariableDeclaration } from '../../src/parser/types'
import { parseStatement, parseCompoundStatement } from '../../src/parser/statements'
import {
  parseLabelDeclaration,
  parseConstDeclarations,
  parseTypeDeclarations,
  parseVariableDeclarations,
  parseProcedureDeclaration,
  parseFunctionDeclaration,
  parseParameterList,
  parseBlock,
  parseProgram,
} from '../../src/parser/declarations'

function makeInput(source: string): ParserInput {
  return { tokens: lex(source), position: 0 }
}

// ============================================================================
// Production: identifier
// ============================================================================
describe('Production: identifier', () => {
  test('should parse simple identifier', () => {
    const result = parseIdentifier(makeInput('hello'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('Identifier')
      expect(result.astNode.name).toBe('hello')
    }
  })

  test('should fail on non-identifier', () => {
    const result = parseIdentifier(makeInput('123'))
    expect(result.success).toBe(false)
  })

  test('should parse identifier with digits', () => {
    const result = parseIdentifier(makeInput('var123'))
    expect(result.success).toBe(true)
  })
})

// ============================================================================
// Production: expression
// ============================================================================
describe('Production: expression', () => {
  test('should parse integer literal', () => {
    const result = parseExpression(makeInput('42'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('IntegerLiteral')
      expect((result.astNode as any).value).toBe(42)
    }
  })

  test('should parse string literal', () => {
    const result = parseExpression(makeInput("'hello'"))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('StringLiteral')
    }
  })

  test('should parse identifier', () => {
    const result = parseExpression(makeInput('x'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('Identifier')
    }
  })

  test('should parse binary expression', () => {
    const result = parseExpression(makeInput('a + b'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('BinaryExpression')
      expect((result.astNode as any).operator).toBe('+')
    }
  })

  test('should parse multiplication with higher precedence', () => {
    const result = parseExpression(makeInput('a + b * c'))
    expect(result.success).toBe(true)
    if (result.success) {
      // Should be: a + (b * c)
      expect(result.astNode.kind).toBe('BinaryExpression')
      expect((result.astNode as any).operator).toBe('+')
      expect((result.astNode as any).right.kind).toBe('BinaryExpression')
      expect((result.astNode as any).right.operator).toBe('*')
    }
  })

  test('should parse comparison', () => {
    const result = parseExpression(makeInput('a < b'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('BinaryExpression')
      expect((result.astNode as any).operator).toBe('<')
    }
  })

  test('should parse DIV and MOD', () => {
    const result = parseExpression(makeInput('a DIV b MOD c'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('BinaryExpression')
      expect((result.astNode as any).operator).toBe('MOD')
      expect((result.astNode as any).left.operator).toBe('DIV')
    }
  })

  test('should parse parenthesized expression', () => {
    const result = parseExpression(makeInput('(a + b)'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('ParenthesizedExpression')
    }
  })

  test('should parse unary minus', () => {
    const result = parseExpression(makeInput('-a'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('UnaryExpression')
      expect((result.astNode as any).operator).toBe('-')
    }
  })

  test('should parse NOT', () => {
    const result = parseExpression(makeInput('NOT a'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('UnaryExpression')
      expect((result.astNode as any).operator).toBe('NOT')
    }
  })

  test('should parse function call', () => {
    const result = parseExpression(makeInput('f(x, y)'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('FunctionCall')
      expect((result.astNode as any).arguments).toHaveLength(2)
    }
  })

  test('should parse array access', () => {
    const result = parseExpression(makeInput('a[i]'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('ArrayAccess')
    }
  })

  test('should parse field access', () => {
    const result = parseExpression(makeInput('a.b'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('FieldAccess')
    }
  })

  test('should parse chained access', () => {
    const result = parseExpression(makeInput('a[i].b'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('FieldAccess')
      expect((result.astNode as any).object.kind).toBe('ArrayAccess')
    }
  })

  test('should parse IN expression', () => {
    const result = parseExpression(makeInput('a IN b'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('InExpression')
    }
  })
})

// ============================================================================
// Production: expression_list
// ============================================================================
describe('Production: expression_list', () => {
  test('should parse single expression', () => {
    const result = parseExpressionList(makeInput('x'))
    expect(result.success).toBe(true)
    if (result.success) expect(result.astNode).toHaveLength(1)
  })

  test('should parse multiple expressions', () => {
    const result = parseExpressionList(makeInput('x, y, z'))
    expect(result.success).toBe(true)
    if (result.success) expect(result.astNode).toHaveLength(3)
  })
})

// ============================================================================
// Production: type
// ============================================================================
describe('Production: type', () => {
  test('should parse simple type', () => {
    const result = parseType(makeInput('INTEGER'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('SimpleType')
    }
  })

  test('should parse range type', () => {
    const result = parseType(makeInput('0..255'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('RangeType')
    }
  })

  test('should parse array type', () => {
    const result = parseType(makeInput('ARRAY[0..100]OF INTEGER'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('ArrayType')
    }
  })

  test('should parse packed array', () => {
    const result = parseType(makeInput('PACKED ARRAY[0..1,0..45000]OF ASCIICODE'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('ArrayType')
      expect((result.astNode as any).isPacked).toBe(true)
      expect((result.astNode as any).indexTypes).toHaveLength(2)
    }
  })

  test('should parse record type', () => {
    const result = parseType(makeInput('RECORD X: INTEGER; Y: CHAR END'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('RecordType')
      expect((result.astNode as any).fields).toHaveLength(2)
    }
  })

  test('should parse file type', () => {
    const result = parseType(makeInput('FILE OF CHAR'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('FileType')
    }
  })

  test('should parse packed file', () => {
    const result = parseType(makeInput('PACKED FILE OF CHAR'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('FileType')
      expect((result.astNode as any).isPacked).toBe(true)
    }
  })

  test('should parse enumeration type', () => {
    const result = parseType(makeInput('(RED, GREEN, BLUE)'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('EnumerationType')
      expect((result.astNode as any).values).toHaveLength(3)
    }
  })

  test('should parse set type', () => {
    const result = parseType(makeInput('SET OF 0..7'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('SetType')
    }
  })
})

// ============================================================================
// Production: variable_declaration
// ============================================================================
describe('Production: variable_declaration', () => {
  test('should parse single variable', () => {
    const result = parseVariableDeclaration(makeInput('X: INTEGER'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('VariableDeclaration')
      expect(result.astNode.names).toHaveLength(1)
    }
  })

  test('should parse multiple variables', () => {
    const result = parseVariableDeclaration(makeInput('X, Y, Z: CHAR'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.names).toHaveLength(3)
    }
  })

  test('should parse array variable', () => {
    const result = parseVariableDeclaration(makeInput('BUF: ARRAY[1..10]OF INTEGER'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.type.kind).toBe('ArrayType')
    }
  })
})

// ============================================================================
// Production: statement
// ============================================================================
describe('Production: statement', () => {
  test('should parse assignment', () => {
    const result = parseStatement(makeInput('X := 42'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('Assignment')
    }
  })

  test('should parse assignment with array access', () => {
    const result = parseStatement(makeInput('BUF[I] := 0'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('Assignment')
      expect((result.astNode as any).left.kind).toBe('ArrayAccess')
    }
  })

  test('should parse if statement', () => {
    const result = parseStatement(makeInput('IF X > 0 THEN Y := 1'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('IfStatement')
      expect((result.astNode as any).elseBranch).toBeNull()
    }
  })

  test('should parse if-else statement', () => {
    const result = parseStatement(makeInput('IF X > 0 THEN Y := 1 ELSE Y := 2'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('IfStatement')
      expect((result.astNode as any).elseBranch).not.toBeNull()
    }
  })

  test('should parse while statement', () => {
    const result = parseStatement(makeInput('WHILE X > 0 DO X := X - 1'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('WhileStatement')
    }
  })

  test('should parse repeat statement', () => {
    const result = parseStatement(makeInput('REPEAT X := X - 1 UNTIL X = 0'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('RepeatStatement')
    }
  })

  test('should parse for statement', () => {
    const result = parseStatement(makeInput('FOR I := 1 TO 10 DO SUM := SUM + I'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('ForStatement')
      expect((result.astNode as any).direction).toBe('TO')
    }
  })

  test('should parse for-downto statement', () => {
    const result = parseStatement(makeInput('FOR I := 10 DOWNTO 1 DO SUM := SUM + I'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('ForStatement')
      expect((result.astNode as any).direction).toBe('DOWNTO')
    }
  })

  test('should parse goto statement', () => {
    const result = parseStatement(makeInput('GOTO 9999'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('GotoStatement')
    }
  })

  test('should parse procedure call', () => {
    const result = parseStatement(makeInput('WRITE(X, Y)'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('ProcedureCall')
    }
  })

  test('should parse procedure call without args', () => {
    const result = parseStatement(makeInput('BREAK'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('ProcedureCall')
      expect((result.astNode as any).arguments).toHaveLength(0)
    }
  })

  test('should parse empty statement', () => {
    const result = parseStatement(makeInput(';'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('EmptyStatement')
    }
  })
})

// ============================================================================
// Production: compound_statement
// ============================================================================
describe('Production: compound_statement', () => {
  test('should parse empty compound', () => {
    const result = parseCompoundStatement(makeInput('BEGIN END'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.kind).toBe('CompoundStatement')
      expect(result.astNode.statements).toHaveLength(0)
    }
  })

  test('should parse compound with statements', () => {
    const result = parseCompoundStatement(makeInput('BEGIN X := 1; Y := 2 END'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.statements).toHaveLength(2)
    }
  })

  test('should parse nested compound', () => {
    const result = parseCompoundStatement(makeInput('BEGIN BEGIN X := 1 END END'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.statements[0].kind).toBe('CompoundStatement')
    }
  })
})

// ============================================================================
// Production: label_declaration
// ============================================================================
describe('Production: label_declaration', () => {
  test('should parse single label', () => {
    const result = parseLabelDeclaration(makeInput('LABEL 9999;'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.labels).toHaveLength(1)
      expect(result.astNode.labels[0].value).toBe(9999)
    }
  })

  test('should parse multiple labels', () => {
    const result = parseLabelDeclaration(makeInput('LABEL 10, 20, 30;'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.labels).toHaveLength(3)
    }
  })
})

// ============================================================================
// Production: const_declarations
// ============================================================================
describe('Production: const_declarations', () => {
  test('should parse single const', () => {
    const result = parseConstDeclarations(makeInput('CONST MAX = 100'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode).toHaveLength(1)
      expect(result.astNode[0].name.name).toBe('MAX')
    }
  })

  test('should parse multiple consts', () => {
    const result = parseConstDeclarations(makeInput('CONST MAX = 100; MIN = 0'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode).toHaveLength(2)
    }
  })

  test('should return empty when no CONST keyword', () => {
    const result = parseConstDeclarations(makeInput('VAR'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode).toHaveLength(0)
    }
  })
})

// ============================================================================
// Production: type_declarations
// ============================================================================
describe('Production: type_declarations', () => {
  test('should parse single type declaration', () => {
    const result = parseTypeDeclarations(makeInput('TYPE ASCIICODE = 0..127'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode).toHaveLength(1)
      expect(result.astNode[0].name.name).toBe('ASCIICODE')
      expect(result.astNode[0].typeDef.kind).toBe('RangeType')
    }
  })

  test('should parse multiple type declarations', () => {
    const result = parseTypeDeclarations(makeInput('TYPE A = INTEGER; B = 0..255; C = CHAR'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode).toHaveLength(3)
    }
  })
})

// ============================================================================
// Production: variable_declarations
// ============================================================================
describe('Production: variable_declarations', () => {
  test('should parse single var declaration', () => {
    const result = parseVariableDeclarations(makeInput('VAR X: INTEGER'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode).toHaveLength(1)
    }
  })

  test('should parse multiple var declarations', () => {
    const result = parseVariableDeclarations(makeInput('VAR X: INTEGER; Y, Z: CHAR'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode).toHaveLength(2)
      expect(result.astNode[1].names).toHaveLength(2)
    }
  })
})

// ============================================================================
// Production: parameter_list
// ============================================================================
describe('Production: parameter_list', () => {
  test('should parse empty parameter list', () => {
    const result = parseParameterList(makeInput(''))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode).toHaveLength(0)
    }
  })

  test('should parse single parameter', () => {
    const result = parseParameterList(makeInput('(X: INTEGER)'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode).toHaveLength(1)
      expect(result.astNode[0].isVar).toBe(false)
    }
  })

  test('should parse VAR parameter', () => {
    const result = parseParameterList(makeInput('(VAR F: TEXTFILE)'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode[0].isVar).toBe(true)
    }
  })

  test('should parse multiple parameters', () => {
    const result = parseParameterList(makeInput('(X: INTEGER; VAR Y: CHAR)'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode).toHaveLength(2)
    }
  })
})

// ============================================================================
// Production: procedure_declaration
// ============================================================================
describe('Production: procedure_declaration', () => {
  test('should parse procedure without parameters', () => {
    const result = parseProcedureDeclaration(makeInput('PROCEDURE FOO; BEGIN END;'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.name.name).toBe('FOO')
      expect(result.astNode.parameters).toHaveLength(0)
      expect(result.astNode.isForward).toBe(false)
    }
  })

  test('should parse procedure with parameters', () => {
    const result = parseProcedureDeclaration(makeInput('PROCEDURE BAR(X: INTEGER); BEGIN END;'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.name.name).toBe('BAR')
      expect(result.astNode.parameters).toHaveLength(1)
    }
  })

  test('should parse FORWARD procedure', () => {
    const result = parseProcedureDeclaration(makeInput('PROCEDURE DEBUGHELP; FORWARD;'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.isForward).toBe(true)
      expect(result.astNode.block).toBeNull()
    }
  })
})

// ============================================================================
// Production: function_declaration
// ============================================================================
describe('Production: function_declaration', () => {
  test('should parse function without parameters', () => {
    const result = parseFunctionDeclaration(makeInput('FUNCTION FOO: INTEGER; BEGIN END;'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.name.name).toBe('FOO')
      expect(result.astNode.returnType.kind).toBe('SimpleType')
    }
  })

  test('should parse function with parameters', () => {
    const result = parseFunctionDeclaration(
      makeInput('FUNCTION BAR(X: INTEGER): BOOLEAN; BEGIN END;')
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.parameters).toHaveLength(1)
    }
  })

  test('should parse FORWARD function', () => {
    const result = parseFunctionDeclaration(makeInput('FUNCTION FOO: INTEGER; FORWARD;'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.isForward).toBe(true)
    }
  })
})

// ============================================================================
// Production: block
// ============================================================================
describe('Production: block', () => {
  test('should parse block with declarations', () => {
    const source = 'LABEL 9999; CONST MAX = 100; VAR X: INTEGER; BEGIN X := 1 END'
    const result = parseBlock(makeInput(source))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.labelDeclarations).not.toBeNull()
      expect(result.astNode.constDeclarations).toHaveLength(1)
      expect(result.astNode.variableDeclarations).toHaveLength(1)
      expect(result.astNode.compound.statements).toHaveLength(1)
    }
  })

  test('should parse block with procedures', () => {
    const source = 'PROCEDURE FOO; BEGIN END; BEGIN FOO END'
    const result = parseBlock(makeInput(source))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.procedureDeclarations).toHaveLength(1)
    }
  })
})

// ============================================================================
// Production: program
// ============================================================================
describe('Production: program', () => {
  test('should parse minimal program', () => {
    const result = parseProgram(makeInput('PROGRAM TEST; BEGIN END.'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.name.name).toBe('TEST')
      expect(result.astNode.parameters).toHaveLength(0)
    }
  })

  test('should parse program with parameters', () => {
    const result = parseProgram(makeInput('PROGRAM TANGLE(WEBFILE, CHANGEFILE); BEGIN END.'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.parameters).toHaveLength(2)
    }
  })

  test('should parse program with label and const', () => {
    const result = parseProgram(
      makeInput('PROGRAM TEST; LABEL 9999; CONST MAX = 100; BEGIN GOTO 9999 END.')
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.block.labelDeclarations).not.toBeNull()
      expect(result.astNode.block.constDeclarations).toHaveLength(1)
    }
  })

  test('should parse program with compiler directives', () => {
    const result = parseProgram(makeInput('{$C-,A+,D-} PROGRAM TEST; BEGIN END.'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.astNode.name.name).toBe('TEST')
    }
  })
})
