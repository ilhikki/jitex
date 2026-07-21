import { lex } from '@/lexer/lexer'
import { ParserInput, ProgramNode, CaseStatementNode } from '@/ast/types'
import { parseStatement } from '@/parser/statements'
import {
  parseProgram,
  parseProcedureDeclaration,
  parseFunctionDeclaration,
  parseBlock,
} from '@/parser/declarations'
import { parse } from '@/index'

function makeInput(source: string): ParserInput {
  return { tokens: lex(source), position: 0 }
}

function stmtOf(source: string) {
  const r = parseStatement(makeInput(source))
  if (!r.success) throw new Error(r.error)
  return r.astNode
}

describe('Parser: CASE statement', () => {
  test('parse CASE with single label', () => {
    const s = stmtOf('case x of 1: y := 2 end') as CaseStatementNode
    expect(s.kind).toBe('CaseStatement')
    expect(s.branches.length).toBe(1)
    expect(s.branches[0].labels.length).toBe(1)
    expect(s.otherwise).toBeNull()
  })

  test('parse CASE with multiple labels per branch', () => {
    const s = stmtOf('case x of 1, 2, 3: y := 4 end') as CaseStatementNode
    expect(s.branches.length).toBe(1)
    expect(s.branches[0].labels.length).toBe(3)
  })

  test('parse CASE with multiple branches', () => {
    const s = stmtOf('case x of 1: y := 2; 3: y := 4 end') as CaseStatementNode
    expect(s.branches.length).toBe(2)
  })

  test('parse CASE with OTHERWISE', () => {
    const s = stmtOf('case x of 1: y := 2; otherwise y := 0 end') as CaseStatementNode
    expect(s.branches.length).toBe(1)
    expect(s.otherwise).not.toBeNull()
  })

  test('parse CASE with only OTHERWISE', () => {
    const s = stmtOf('case x of otherwise y := 0 end') as CaseStatementNode
    expect(s.branches.length).toBe(0)
    expect(s.otherwise).not.toBeNull()
  })

  test('parse CASE with OTHERWISE followed by semicolon before END', () => {
    // Regression: OTHERWISE branch must skip trailing semicolons before END,
    // mirroring ordinary branches. tangle.pas writes `otherwise x := 0;` before `end`.
    const s = stmtOf('case x of 1: y := 2; otherwise y := 0; end') as CaseStatementNode
    expect(s.branches.length).toBe(1)
    expect(s.otherwise).not.toBeNull()
  })

  test('parse CASE with OTHERWISE followed by multiple semicolons before END', () => {
    const s = stmtOf('case x of otherwise y := 0;; end') as CaseStatementNode
    expect(s.branches.length).toBe(0)
    expect(s.otherwise).not.toBeNull()
  })
})

describe('Parser: nested procedures and functions', () => {
  test('parse procedure with nested procedure', () => {
    const source = `procedure outer;
procedure inner;
begin
end;
begin
end;`
    const r = parseProcedureDeclaration(makeInput(source))
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.astNode.name.name).toBe('outer')
      expect(r.astNode.block!.procedureDeclarations.length).toBe(1)
      expect(r.astNode.block!.procedureDeclarations[0].name.name).toBe('inner')
    }
  })

  test('parse function with nested procedure', () => {
    const source = `function outer(x: integer): integer;
procedure inner;
begin
end;
begin
  outer := x;
end;`
    const r = parseFunctionDeclaration(makeInput(source))
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.astNode.name.name).toBe('outer')
      expect(r.astNode.block!.procedureDeclarations.length).toBe(1)
    }
  })

  test('parse procedure with parameters and label declarations', () => {
    const source = `procedure foo(x: integer);
label 10, 20;
var y: integer;
begin
  10: y := x;
  20:
end;`
    const r = parseProcedureDeclaration(makeInput(source))
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.astNode.parameters.length).toBe(1)
      expect(r.astNode.block!.labelDeclarations).not.toBeNull()
      expect(r.astNode.block!.variableDeclarations.length).toBe(1)
    }
  })
})

describe('Parser: full program structure', () => {
  test('parse program with procedure and function', () => {
    const source = `program test;
var x: integer;
procedure setval(n: integer);
begin
  x := n;
end;
function getval: integer;
begin
  getval := x;
end;
begin
  setval(42);
end.`
    const r = parse(source)
    expect(r.success).toBe(true)
    if (r.success) {
      const prog = r.astNode as ProgramNode
      expect(prog.block.variableDeclarations.length).toBe(1)
      expect(prog.block.procedureDeclarations.length).toBe(1)
      expect(prog.block.functionDeclarations.length).toBe(1)
    }
  })

  test('parse program with label + const + type + var + proc + func', () => {
    const source = `program full;
label 99;
const
  pi = 3.14;
type
  color = (red, green, blue);
var
  x: integer;
procedure p;
begin
end;
function f: integer;
begin
  f := 0;
end;
begin
  x := f;
end.`
    const r = parse(source)
    expect(r.success).toBe(true)
    if (r.success) {
      const prog = r.astNode as ProgramNode
      expect(prog.block.labelDeclarations).not.toBeNull()
      expect(prog.block.constDeclarations.length).toBe(1)
      expect(prog.block.typeDeclarations.length).toBe(1)
      expect(prog.block.variableDeclarations.length).toBe(1)
      expect(prog.block.procedureDeclarations.length).toBe(1)
      expect(prog.block.functionDeclarations.length).toBe(1)
    }
  })
})

describe('Parser: WITH statement', () => {
  test('parse WITH statement', () => {
    const s = stmtOf('with r do x := 1')
    expect(s.kind).toBe('WithStatement')
  })

  test('parse WITH multiple variables', () => {
    const s = stmtOf('with a, b do x := 1')
    expect(s.kind).toBe('WithStatement')
  })
})

describe('Parser: error cases', () => {
  test('fail on missing END in CASE', () => {
    const r = parseStatement(makeInput('case x of 1: y := 2'))
    expect(r.success).toBe(false)
  })

  test('fail on malformed expression', () => {
    const r = parseStatement(makeInput('x := +'))
    expect(r.success).toBe(false)
  })
})
