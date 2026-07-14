import * as fs from 'fs'
import * as path from 'path'
import { parse, ProgramNode, AstNode } from '../src/index'

const pasFile = path.join(__dirname, '..', 'knuth', 'web', 'tangle-official.pas')
const source = fs.readFileSync(pasFile, 'utf-8')
const result = parse(source)

if (!result.success) {
  console.error('Parse error:', result.error)
  process.exit(1)
}

const program = result.astNode as ProgramNode

function printNode(node: AstNode, indent: string = ''): void {
  const kind = node.kind

  switch (kind) {
    case 'Program':
      const p = node as ProgramNode
      console.log(`${indent}PROGRAM ${p.name.name}(${p.parameters.map(p => p.name).join(', ')})`)
      printNode(p.block, indent + '  ')
      break

    case 'Block':
      const b = node as any
      console.log(`${indent}BLOCK`)
      if (b.labelDeclarations) printNode(b.labelDeclarations, indent + '  ')
      b.constDeclarations.forEach((c: AstNode) => printNode(c, indent + '  '))
      b.typeDeclarations.forEach((t: AstNode) => printNode(t, indent + '  '))
      b.variableDeclarations.forEach((v: AstNode) => printNode(v, indent + '  '))
      b.procedureDeclarations.forEach((proc: AstNode) => printNode(proc, indent + '  '))
      b.functionDeclarations.forEach((func: AstNode) => printNode(func, indent + '  '))
      printNode(b.compound, indent + '  ')
      break

    case 'LabelDeclaration':
      const ld = node as any
      console.log(`${indent}LABEL ${ld.labels.map((l: any) => l.value).join(', ')}`)
      break

    case 'ConstDeclaration':
      const cd = node as any
      console.log(`${indent}CONST ${cd.name.name} = ${printExpr(cd.value)}`)
      break

    case 'TypeDeclaration':
      const td = node as any
      console.log(`${indent}TYPE ${td.name.name} = ${printType(td.typeDef)}`)
      break

    case 'VariableDeclaration':
      const vd = node as any
      console.log(`${indent}VAR ${vd.names.map((n: any) => n.name).join(', ')}: ${printType(vd.type)}`)
      break

    case 'ProcedureDeclaration':
      const proc = node as any
      const params = proc.parameters.length > 0 
        ? `(${proc.parameters.map((p: any) => `${p.isVar ? 'VAR ' : ''}${p.names.map((n: any) => n.name).join(', ')}: ${printType(p.type)}`).join('; ')})`
        : ''
      console.log(`${indent}PROCEDURE ${proc.name.name}${params}${proc.isForward ? ' FORWARD' : ''}`)
      if (proc.block) printNode(proc.block, indent + '  ')
      break

    case 'FunctionDeclaration':
      const func = node as any
      const fParams = func.parameters.length > 0
        ? `(${func.parameters.map((p: any) => `${p.isVar ? 'VAR ' : ''}${p.names.map((n: any) => n.name).join(', ')}: ${printType(p.type)}`).join('; ')})`
        : ''
      console.log(`${indent}FUNCTION ${func.name.name}${fParams}: ${printType(func.returnType)}${func.isForward ? ' FORWARD' : ''}`)
      if (func.block) printNode(func.block, indent + '  ')
      break

    case 'CompoundStatement':
      const cs = node as any
      console.log(`${indent}BEGIN`)
      cs.statements.forEach((s: AstNode) => printNode(s, indent + '  '))
      console.log(`${indent}END`)
      break

    case 'Assignment':
      const a = node as any
      console.log(`${indent}${printExpr(a.left)} := ${printExpr(a.right)}`)
      break

    case 'IfStatement':
      const ifs = node as any
      console.log(`${indent}IF ${printExpr(ifs.condition)} THEN`)
      printNode(ifs.thenBranch, indent + '  ')
      if (ifs.elseBranch) {
        console.log(`${indent}ELSE`)
        printNode(ifs.elseBranch, indent + '  ')
      }
      break

    case 'WhileStatement':
      const ws = node as any
      console.log(`${indent}WHILE ${printExpr(ws.condition)} DO`)
      printNode(ws.body, indent + '  ')
      break

    case 'RepeatStatement':
      const rs = node as any
      console.log(`${indent}REPEAT`)
      rs.statements.forEach((s: AstNode) => printNode(s, indent + '  '))
      console.log(`${indent}UNTIL ${printExpr(rs.untilCondition)}`)
      break

    case 'ForStatement':
      const fs = node as any
      console.log(`${indent}FOR ${fs.variable.name} := ${printExpr(fs.initial)} ${fs.direction} ${printExpr(fs.final)} DO`)
      printNode(fs.body, indent + '  ')
      break

    case 'GotoStatement':
      const gs = node as any
      console.log(`${indent}GOTO ${gs.label.value}`)
      break

    case 'ProcedureCall':
      const pc = node as any
      const args = pc.arguments.length > 0 ? `(${pc.arguments.map((a: AstNode) => printExpr(a)).join(', ')})` : ''
      console.log(`${indent}${pc.name.name}${args}`)
      break

    case 'EmptyStatement':
      // Skip empty statements
      break

    default:
      console.log(`${indent}${kind}`)
      break
  }
}

function printExpr(node: AstNode): string {
  switch (node.kind) {
    case 'Identifier':
      return (node as any).name
    case 'IntegerLiteral':
      return String((node as any).value)
    case 'RealLiteral':
      return String((node as any).value)
    case 'StringLiteral':
      return `'${(node as any).value}'`
    case 'CharLiteral':
      return `'${(node as any).value}'`
    case 'BooleanLiteral':
      return (node as any).value ? 'TRUE' : 'FALSE'
    case 'BinaryExpression':
      const be = node as any
      return `${printExpr(be.left)} ${be.operator} ${printExpr(be.right)}`
    case 'UnaryExpression':
      const ue = node as any
      return `${ue.operator} ${printExpr(ue.operand)}`
    case 'FunctionCall':
      const fc = node as any
      return `${fc.name.name}(${fc.arguments.map((a: AstNode) => printExpr(a)).join(', ')})`
    case 'ArrayAccess':
      const aa = node as any
      return `${printExpr(aa.array)}[${aa.indices.map((i: AstNode) => printExpr(i)).join(', ')}]`
    case 'FieldAccess':
      const fa = node as any
      return `${printExpr(fa.object)}.${fa.field.name}`
    case 'ParenthesizedExpression':
      return `(${printExpr((node as any).expression)})`
    case 'InExpression':
      const ie = node as any
      return `${printExpr(ie.left)} IN ${printExpr(ie.right)}`
    default:
      return `[${node.kind}]`
  }
}

function printType(node: AstNode): string {
  switch (node.kind) {
    case 'SimpleType':
      return (node as any).name.name
    case 'RangeType':
      const rt = node as any
      return `${printExpr(rt.start)}..${printExpr(rt.end)}`
    case 'ArrayType':
      const at = node as any
      return `${at.isPacked ? 'PACKED ' : ''}ARRAY[${at.indexTypes.map((t: AstNode) => printType(t)).join(', ')}]OF ${printType(at.elementType)}`
    case 'RecordType':
      const rt2 = node as any
      return `RECORD ${rt2.fields.map((f: any) => `${f.names.map((n: any) => n.name).join(', ')}: ${printType(f.type)}`).join('; ')} END`
    case 'FileType':
      const ft = node as any
      return `${ft.isPacked ? 'PACKED ' : ''}FILE${ft.elementType ? ' OF ' + printType(ft.elementType) : ''}`
    case 'SetType':
      return `SET OF ${printType((node as any).baseType)}`
    case 'EnumerationType':
      const et = node as any
      return `(${et.values.map((v: any) => v.name).join(', ')})`
    default:
      return `[${node.kind}]`
  }
}

console.log('=== AST Structure ===')
printNode(program)

console.log('\n\n=== Summary ===')
const block = program.block as any
console.log(`Program: ${program.name.name}`)
console.log(`Parameters: ${program.parameters.length}`)
console.log(`Label declarations: ${block.labelDeclarations ? 1 : 0}`)
console.log(`Const declarations: ${block.constDeclarations.length}`)
console.log(`Type declarations: ${block.typeDeclarations.length}`)
console.log(`Variable declarations: ${block.variableDeclarations.length}`)
console.log(`Procedure declarations: ${block.procedureDeclarations.length}`)
console.log(`Function declarations: ${block.functionDeclarations.length}`)
console.log(`Main statements: ${block.compound.statements.length}`)
