import * as fs from 'fs'
import * as path from 'path'
import { parse, nodeToCode, SourceMap } from '../../src/index'
import type { ProgramNode } from '../../src/ast/types'

const tanglePasPath = path.join(__dirname, '..', 'resources', 'tangle-official.pas')

function parseOrThrow(source: string): ProgramNode {
  const result = parse(source)
  if (!result.success) {
    throw new Error(`Parse failed: ${result.error}`)
  }
  return result.astNode
}

describe('AST printer integration tests (tangle.pas)', () => {
  let originalSource: string

  beforeAll(() => {
    originalSource = fs.readFileSync(tanglePasPath, 'utf-8')
  })

  test('tangle.pas 能成功解析', () => {
    const ast = parseOrThrow(originalSource)
    expect(ast.kind).toBe('Program')
  })

  test('tangle.pas AST 转代码不抛异常', () => {
    const ast = parseOrThrow(originalSource)
    const code = nodeToCode(ast)
    expect(code.length).toBeGreaterThan(0)
  })

  test('tangle.pas 幂等性：s0 -> n0 -> s1 -> n1 -> s2, s1 === s2', () => {
    const n0 = parseOrThrow(originalSource)
    const s1 = nodeToCode(n0)
    const n1 = parseOrThrow(s1)
    const s2 = nodeToCode(n1)
    expect(s2).toBe(s1)
  })

  test('tangle.pas 转代码后可重新解析', () => {
    const n0 = parseOrThrow(originalSource)
    const s1 = nodeToCode(n0)
    const n1 = parseOrThrow(s1)
    expect(n1.kind).toBe('Program')
  })

  test('tangle.pas 转代码包含关键字 program', () => {
    const n0 = parseOrThrow(originalSource)
    const s1 = nodeToCode(n0)
    expect(s1.startsWith('program ')).toBe(true)
  })

  test('tangle.pas 转代码以 end. 结尾', () => {
    const n0 = parseOrThrow(originalSource)
    const s1 = nodeToCode(n0)
    expect(s1.endsWith('end.')).toBe(true)
  })
})

describe('AST printer 幂等性 - 简单程序', () => {
  const cases: { name: string; code: string }[] = [
    {
      name: 'minimal program',
      code: 'program test;\nbegin\nend.',
    },
    {
      name: 'const + var',
      code: 'program test;\nconst\n  c = 10;\nvar\n  a: integer;\nbegin\n  a := c;\nend.',
    },
    {
      name: 'subrange type',
      code: 'program test;\ntype\n  t = 1..10;\nvar\n  a: t;\nbegin\n  a := 5;\nend.',
    },
    {
      name: 'array type',
      code: 'program test;\nvar\n  a: array[1..10] of integer;\nbegin\n  a[1] := 5;\nend.',
    },
    {
      name: 'record type',
      code: 'program test;\ntype\n  r = record\n    x: integer;\n    y: integer;\n  end;\nvar\n  p: r;\nbegin\n  p.x := 1;\nend.',
    },
    {
      name: 'if statement',
      code: 'program test;\nvar\n  a: integer;\nbegin\n  if a > 0 then\n    a := 1;\nend.',
    },
    {
      name: 'if else statement',
      code: 'program test;\nvar\n  a: integer;\nbegin\n  if a > 0 then\n    a := 1\n  else\n    a := 2;\nend.',
    },
    {
      name: 'while loop',
      code: 'program test;\nvar\n  a: integer;\nbegin\n  while a < 10 do\n    a := a + 1;\nend.',
    },
    {
      name: 'for loop',
      code: 'program test;\nvar\n  i: integer;\nbegin\n  for i := 1 to 10 do\n    i := i;\nend.',
    },
    {
      name: 'procedure declaration',
      code: 'program test;\nprocedure p(x: integer);\nbegin\n  x := 1;\nend;\nbegin\nend.',
    },
    {
      name: 'function declaration',
      code: 'program test;\nfunction f(x: integer): integer;\nbegin\n  f := x;\nend;\nbegin\nend.',
    },
  ]

  cases.forEach((c) => {
    test(`幂等: ${c.name}`, () => {
      const n0 = parseOrThrow(c.code)
      const s1 = nodeToCode(n0)
      const n1 = parseOrThrow(s1)
      const s2 = nodeToCode(n1)
      expect(s2).toBe(s1)
    })
  })
})

describe('SourceMap integration tests (tangle.pas)', () => {
  let originalSource: string
  let ast: ProgramNode
  let sourceMap: SourceMap

  beforeAll(() => {
    originalSource = fs.readFileSync(tanglePasPath, 'utf-8')
    ast = parseOrThrow(originalSource)
    sourceMap = new SourceMap(ast)
  })

  test('program 节点有行号信息', () => {
    const info = sourceMap.getNodeLine(ast)
    expect(info).not.toBeNull()
    expect(info!.startLine).toBeGreaterThanOrEqual(1)
    expect(info!.endLine).toBeGreaterThan(1)
  })

  test('行号查找：program 节点覆盖的行范围内能找到节点', () => {
    const info = sourceMap.getNodeLine(ast)
    expect(info).not.toBeNull()
    // 查 program 起始行附近
    const nodes = sourceMap.getNodesAtLine(info!.startLine)
    expect(nodes.length).toBeGreaterThan(0)
  })

  test('模糊查找：有效行号范围内能找到节点', () => {
    const info = sourceMap.getNodeLine(ast)
    expect(info).not.toBeNull()
    const midLine = Math.floor((info!.startLine + info!.endLine) / 2)
    const node = sourceMap.getNodeNearLine(midLine)
    expect(node).not.toBeNull()
  })

  test('模糊查找：超出范围的行号仍能返回最近节点', () => {
    const veryHighLine = 99999
    const node = sourceMap.getNodeNearLine(veryHighLine)
    expect(node).not.toBeNull()
  })
})

describe('SourceMap 集成测试 - 简单程序', () => {
  test('含字面量的程序行号映射', () => {
    const source = `program hello;
const
  c = 42;
var
  a: integer;
begin
  a := c;
end.`
    const ast = parseOrThrow(source)
    const sm = new SourceMap(ast)

    // program 节点有行号信息（因为子树中有字面量 42）
    const programInfo = sm.getNodeLine(ast)
    expect(programInfo).not.toBeNull()
    expect(programInfo!.startLine).toBeGreaterThanOrEqual(1)
    expect(programInfo!.endLine).toBeGreaterThanOrEqual(programInfo!.startLine)

    // 第 3 行（c = 42）应该能找到节点
    const nodes = sm.getNodesAtLine(3)
    expect(nodes.length).toBeGreaterThan(0)
  })

  test('含字面量的程序模糊查找', () => {
    const source = `program hello;
const
  n = 10;
begin
end.`
    const ast = parseOrThrow(source)
    const sm = new SourceMap(ast)

    const node = sm.getNodeNearLine(3)
    expect(node).not.toBeNull()
  })
})
