import { lex } from '@/lexer/lexer'
import { CaseStatementNode, ParserInput, ProgramNode } from '@/ast/types'
import { parseStatement } from '@/parser/statements'
import { parseFunctionDeclaration, parseProcedureDeclaration } from '@/parser/declarations'
import { parse } from '@/index'
import { assert, assertEquals, describe, test } from '../../_harness.ts'

function makeInput(source: string): ParserInput {
  return { tokens: lex(source), position: 0 }
}

function stmtOf(source: string) {
  const r = parseStatement(makeInput(source))
  if (!r.success) {
    throw new Error(r.error)
  }
  return r.astNode
}

describe('Parser: CASE statement', () => {
  test('parse CASE with single label', () => {
    const s = stmtOf('case x of 1: y := 2 end') as CaseStatementNode
    assertEquals(s.kind, 'CaseStatement', 'kind=CaseStatement')
    assertEquals(s.branches.length, 1, '1 branch')
    assertEquals(s.branches[0].labels.length, 1, '1 label')
    assert(s.otherwise === null, 'otherwise null')
  })

  test('parse CASE with multiple labels per branch', () => {
    const s = stmtOf('case x of 1, 2, 3: y := 4 end') as CaseStatementNode
    assertEquals(s.branches.length, 1, '1 branch')
    assertEquals(s.branches[0].labels.length, 3, '3 labels')
  })

  test('parse CASE with multiple branches', () => {
    const s = stmtOf('case x of 1: y := 2; 3: y := 4 end') as CaseStatementNode
    assertEquals(s.branches.length, 2, '2 branches')
  })

  test('parse CASE with OTHERWISE', () => {
    const s = stmtOf('case x of 1: y := 2; otherwise y := 0 end') as CaseStatementNode
    assertEquals(s.branches.length, 1, '1 branch')
    assert(s.otherwise !== null, 'otherwise present')
  })

  test('parse CASE with only OTHERWISE', () => {
    const s = stmtOf('case x of otherwise y := 0 end') as CaseStatementNode
    assertEquals(s.branches.length, 0, '0 branches')
    assert(s.otherwise !== null, 'otherwise present')
  })

  test('parse CASE with OTHERWISE followed by semicolon before END', () => {
    const s = stmtOf('case x of 1: y := 2; otherwise y := 0; end') as CaseStatementNode
    assertEquals(s.branches.length, 1, '1 branch')
    assert(s.otherwise !== null, 'otherwise present')
  })

  test('parse CASE with OTHERWISE followed by multiple semicolons before END', () => {
    const s = stmtOf('case x of otherwise y := 0;; end') as CaseStatementNode
    assertEquals(s.branches.length, 0, '0 branches')
    assert(s.otherwise !== null, 'otherwise present')
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
    assert(r.success, 'parse procedure')
    if (!r.success) return
    assertEquals(r.astNode.name.name, 'outer', 'outer name')
    assertEquals(r.astNode.block!.procedureDeclarations.length, 1, 'one nested proc')
    assertEquals(r.astNode.block!.procedureDeclarations[0].name.name, 'inner', 'inner name')
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
    assert(r.success, 'parse function')
    if (!r.success) return
    assertEquals(r.astNode.name.name, 'outer', 'outer name')
    assertEquals(r.astNode.block!.procedureDeclarations.length, 1, 'one nested proc')
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
    assert(r.success, 'parse procedure')
    if (!r.success) return
    assertEquals(r.astNode.parameters.length, 1, '1 param')
    assert(r.astNode.block!.labelDeclarations !== null, 'labels present')
    assertEquals(r.astNode.block!.variableDeclarations.length, 1, '1 var')
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
    assert(r.success, 'parse program')
    if (!r.success) return
    const prog = r.astNode as ProgramNode
    assertEquals(prog.block.variableDeclarations.length, 1, '1 var')
    assertEquals(prog.block.procedureDeclarations.length, 1, '1 proc')
    assertEquals(prog.block.functionDeclarations.length, 1, '1 func')
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
  99:
  x := f;
end.`
    const r = parse(source)
    assert(r.success, 'parse full program')
    if (!r.success) return
    const prog = r.astNode as ProgramNode
    assert(prog.block.labelDeclarations !== null, 'labels present')
    assertEquals(prog.block.constDeclarations.length, 1, '1 const')
    assertEquals(prog.block.typeDeclarations.length, 1, '1 type')
    assertEquals(prog.block.variableDeclarations.length, 1, '1 var')
    assertEquals(prog.block.procedureDeclarations.length, 1, '1 proc')
    assertEquals(prog.block.functionDeclarations.length, 1, '1 func')
  })
})

describe('Parser: WITH statement', () => {
  test('parse WITH statement', () => {
    const s = stmtOf('with r do x := 1')
    assertEquals(s.kind, 'WithStatement', 'WithStatement')
  })

  test('parse WITH multiple variables', () => {
    const s = stmtOf('with a, b do x := 1')
    assertEquals(s.kind, 'WithStatement', 'WithStatement multi')
  })
})

describe('Parser: error cases', () => {
  test('fail on missing END in CASE', () => {
    const r = parseStatement(makeInput('case x of 1: y := 2'))
    assert(!r.success, 'CASE missing END should fail')
  })

  test('fail on malformed expression', () => {
    const r = parseStatement(makeInput('x := +'))
    assert(!r.success, 'malformed expr should fail')
  })
})
