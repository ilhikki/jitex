import {
  BlockNode,
  FunctionDeclarationNode,
  ProcedureDeclarationNode,
  ProgramNode,
  RecordVariantPartNode,
  SetTypeNode,
  StatementNode,
  TypeNode,
} from '@/frontend/node.ts'
import { SIMPLE_TYPES } from '../analysis-type.ts'
import { DeclarationResult } from '../stage-types.ts'
import { isOrdinalType } from '../type-compat.ts'

const BUILTIN_TYPE_NAMES = new Set(Object.keys(SIMPLE_TYPES))

export function runTypeCheckPass(program: ProgramNode, declResult: DeclarationResult): void {
  const pass = new TypeCheckPass(declResult)
  pass.run(program)
}

class TypeCheckPass {
  private decl: DeclarationResult

  constructor(decl: DeclarationResult) {
    this.decl = decl
  }

  run(program: ProgramNode): void {
    this.checkProgramParameters(program)
    this.checkForwardResidue()
    this.checkBlock(program.block, new Set(BUILTIN_TYPE_NAMES))
  }

  private checkProgramParameters(program: ProgramNode): void {
    const seen = new Set<string>()
    for (const p of program.parameters) {
      const key = p.name.toLowerCase()
      if (seen.has(key)) {
        throw new Error(
          `Duplicate program parameter '${p.name}': the identifiers of the program-parameter-list shall be distinct (ISO 7185 6.10)`,
        )
      }
      seen.add(key)
    }
  }

  private checkForwardResidue(): void {
    const names = [...this.decl.forwardFuncs.keys()].sort()
    if (names.length > 0) {
      throw new Error(
        `FORWARD declaration without a matching definition (ISO 7185 6.6.1): ${names.join(', ')}`,
      )
    }
  }

  private checkBlock(
    block: BlockNode,
    outerTypes: Set<string>,
    formalParamNames: string[] = [],
  ): void {
    this.checkDeclaredNames(block, formalParamNames)
    const availableTypes = this.checkTypeDefinitions(block, outerTypes)
    for (const p of block.procedureDeclarations) {
      if (p.block) {
        const params = p.parameters?.flatMap((pd) => pd.names.map((n) => n.name)) ?? []
        this.checkBlock(p.block, availableTypes, params)
      }
    }
    for (const f of block.functionDeclarations) {
      if (f.block) {
        this.checkFunctionAssignment(f)
        const params = f.parameters?.flatMap((pd) => pd.names.map((n) => n.name)) ?? []
        this.checkBlock(f.block, availableTypes, params)
      }
    }
  }

  private checkDeclaredNames(block: BlockNode, formalParamNames: string[] = []): void {
    const kinds = new Map<string, string>()
    const declareKind = (name: string, kind: string) => {
      const key = name.toLowerCase()
      const prev = kinds.get(key)
      if (prev !== undefined) {
        throw new Error(
          `'${name}' is declared twice in the same scope as ${prev} and ${kind} (ISO 7185 6.2.2.7)`,
        )
      }
      kinds.set(key, kind)
    }

    for (const name of formalParamNames) {
      declareKind(name, 'a formal parameter')
    }
    for (const c of block.constDeclarations) {
      declareKind(c.name.name, 'a constant')
    }
    for (const t of block.typeDeclarations) {
      declareKind(t.name.name, 'a type')
    }
    for (const v of block.variableDeclarations) {
      for (const n of v.names) {
        declareKind(n.name, 'a variable')
      }
    }

    const routines = new Map<string, 'forward' | 'defined'>()
    const routineDecls: (ProcedureDeclarationNode | FunctionDeclarationNode)[] = [
      ...block.procedureDeclarations,
      ...block.functionDeclarations,
    ]
    for (const d of routineDecls) {
      const key = d.name.name.toLowerCase()
      const prev = routines.get(key)
      if (d.isForward) {
        if (prev !== undefined) {
          throw new Error(
            `'${d.name.name}' is declared FORWARD twice (ISO 7185 6.6.1: exactly one applied occurrence shall be a procedure-identification)`,
          )
        }
        routines.set(key, 'forward')
        declareKind(d.name.name, 'a procedure')
        continue
      }
      if (prev === 'defined') {
        throw new Error(
          `More than one procedure-block associated with '${d.name.name}' (ISO 7185 6.6.1)`,
        )
      }
      if (prev === undefined) {
        declareKind(d.name.name, 'a procedure')
      }
      routines.set(key, 'defined')
    }
  }

  private checkTypeDefinitions(block: BlockNode, outerTypes: Set<string>): Set<string> {
    const available = new Set(outerTypes)
    for (const t of block.typeDeclarations) {
      this.checkTypeNode(t.typeDef, available, false)
      available.add(t.name.name.toLowerCase())
    }
    return available
  }

  private checkTypeNode(node: TypeNode, available: Set<string>, inPointerDomain: boolean): void {
    switch (node.kind) {
      case 'SimpleType': {
        const name = node.name.name.toLowerCase()
        if (BUILTIN_TYPE_NAMES.has(name) || available.has(name) || inPointerDomain) {
          return
        }
        throw new Error(
          `Type-denoter '${node.name.name}' is used before its defining-point (ISO 7185 6.2.2.9)`,
        )
      }
      case 'PointerType':
        this.checkTypeNode(node.domainType, available, true)
        return
      case 'ArrayType': {
        for (const idx of node.indexTypes) {
          this.checkTypeNode(idx, available, inPointerDomain)
        }
        this.checkTypeNode(node.elementType, available, inPointerDomain)
        return
      }
      case 'RecordType': {
        for (const f of node.fields) {
          this.checkTypeNode(f.type, available, inPointerDomain)
        }
        this.checkVariantPart(node.variant, available, inPointerDomain)
        return
      }
      case 'FileType':
        if (node.elementType) {
          this.checkTypeNode(node.elementType, available, inPointerDomain)
        }
        return
      case 'SetType': {
        this.checkTypeNode(node.baseType, available, inPointerDomain)
        this.checkSetBaseType(node)
        return
      }
      case 'RangeType':
        return
      case 'EnumerationType':
        return
    }
  }

  private checkVariantPart(
    variant: RecordVariantPartNode | undefined,
    available: Set<string>,
    inPointerDomain: boolean,
  ): void {
    if (!variant) {
      return
    }
    this.checkTypeNode(variant.tagType, available, inPointerDomain)
    for (const v of variant.variants) {
      for (const f of v.fields) {
        this.checkTypeNode(f.type, available, inPointerDomain)
      }
      this.checkVariantPart(v.variant, available, inPointerDomain)
    }
  }

  private checkSetBaseType(node: SetTypeNode): void {
    const base = this.decl.typeNodeInfo.get(node.baseType)
    if (base && !isOrdinalType(base)) {
      throw new Error(
        `The base-type of a set-type shall be an ordinal-type (ISO 7185 6.4.3.4), found '${base.tag}'`,
      )
    }
  }

  private checkFunctionAssignment(decl: FunctionDeclarationNode): void {
    const block = decl.block
    if (!block) {
      return
    }
    if (this.hasAssignmentTo(block.compound, decl.name.name)) {
      return
    }
    throw new Error(
      `The function-block of '${decl.name.name}' shall contain at least one assignment to the function-identifier (ISO 7185 6.6.2)`,
    )
  }

  private hasAssignmentTo(stmt: StatementNode, funcName: string): boolean {
    const target = funcName.toLowerCase()
    switch (stmt.kind) {
      case 'CompoundStatement':
        return stmt.statements.some((s) => this.hasAssignmentTo(s, funcName))
      case 'Assignment':
        return stmt.left.kind === 'Identifier' && stmt.left.name.toLowerCase() === target
      case 'IfStatement':
        return (
          this.hasAssignmentTo(stmt.thenBranch, funcName) ||
          (stmt.elseBranch !== undefined && this.hasAssignmentTo(stmt.elseBranch, funcName))
        )
      case 'WhileStatement':
        return this.hasAssignmentTo(stmt.body, funcName)
      case 'RepeatStatement':
        return stmt.statements.some((s) => this.hasAssignmentTo(s, funcName))
      case 'ForStatement':
        return this.hasAssignmentTo(stmt.body, funcName)
      case 'CaseStatement':
        return (
          stmt.branches.some((b) => this.hasAssignmentTo(b.statement, funcName)) ||
          (stmt.otherwise !== undefined && this.hasAssignmentTo(stmt.otherwise, funcName))
        )
      case 'WithStatement':
        return this.hasAssignmentTo(stmt.body, funcName)
      case 'LabeledStatement':
        return this.hasAssignmentTo(stmt.statement, funcName)
      default:
        return false
    }
  }
}
