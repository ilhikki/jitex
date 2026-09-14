/*
 * Pass 4: 声明期与类型定义期的静态检查。
 *
 * 只读 ProgramNode 与 Pass 1 的 result，独立遍历 AST，不介入前三个 pass 的处理流程。
 * 覆盖（ISO 7185）：
 *   6.10    program-parameter-list 的标识符须互不相同
 *   6.6.1   forward 声明的标识符须有对应的 procedure-identification；
 *           一个 identifier 至多关联一个 procedure-block
 *   6.2.2.7 同一 region 内不得出现两个同拼写的定义点（不区分声明种类）
 *   6.2.2.9 定义点须先于应用出现（new-pointer-type 的 domain-type 为例外）
 *   6.4.3.4 set-type 的 base-type 须为 ordinal-type
 *   6.6.2   function-block 须至少含一条对该函数标识符赋值的语句
 *
 * 输入：ProgramNode, DeclarationResult
 * 输出：无（违规直接抛错）
 */

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

/** 内置类型名（ISO 6.4.2.2 的 required simple-types + 实现提供的 text/string 等） */
const BUILTIN_TYPE_NAMES = new Set(Object.keys(SIMPLE_TYPES))

// ============================================================
// Pass 4 入口
// ============================================================

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

  // --------------------------------------------------------
  // ISO 6.10：program-parameter-list 的标识符须互不相同
  // --------------------------------------------------------

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

  // --------------------------------------------------------
  // ISO 6.6.1：forward 声明的标识符须有对应的 procedure-identification
  // --------------------------------------------------------

  private checkForwardResidue(): void {
    const names = [...this.decl.forwardFuncs.keys()].sort()
    if (names.length > 0) {
      throw new Error(
        `FORWARD declaration without a matching definition (ISO 7185 6.6.1): ${names.join(', ')}`,
      )
    }
  }

  // --------------------------------------------------------
  // 逐 block 检查
  // --------------------------------------------------------

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

  // --------------------------------------------------------
  // ISO 6.2.2.7：同一 region 内不得出现同拼写的定义
  // --------------------------------------------------------

  /**
   * ISO 6.2.2.7：同一 region 内不得有两个同拼写的定义点（不区分声明种类）。
   * 另外按 6.6.1，一个 procedure-identifier 至多关联一个 procedure-block；
   * forward 声明与其后的 procedure-identification 合起来只算一个定义点。
   */
  private checkDeclaredNames(block: BlockNode, formalParamNames: string[] = []): void {
    const kinds = new Map<string, string>()
    const declare = (name: string, kind: string) => {
      const key = name.toLowerCase()
      const prev = kinds.get(key)
      if (prev !== undefined) {
        throw new Error(
          `'${name}' is declared twice in the same scope as ${prev} and ${kind} (ISO 7185 6.2.2.7)`,
        )
      }
      kinds.set(key, kind)
    }

    // ISO 6.2.2.7：形参与块内局部声明同属一个 region
    for (const name of formalParamNames) {
      declare(name, 'a formal parameter')
    }
    for (const c of block.constDeclarations) {
      declare(c.name.name, 'a constant')
    }
    for (const t of block.typeDeclarations) {
      declare(t.name.name, 'a type')
    }
    for (const v of block.variableDeclarations) {
      for (const n of v.names) {
        declare(n.name, 'a variable')
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
        declare(d.name.name, 'a procedure')
        continue
      }
      if (prev === 'defined') {
        throw new Error(
          `More than one procedure-block associated with '${d.name.name}' (ISO 7185 6.6.1)`,
        )
      }
      if (prev === undefined) {
        declare(d.name.name, 'a procedure')
      }
      routines.set(key, 'defined')
    }
  }

  // --------------------------------------------------------
  // ISO 6.2.2.9 定义点先于应用 + 6.4.3.4 set-type 的 base-type
  // --------------------------------------------------------

  /** 返回本 block 结束后（含外层）可见的类型名集合 */
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
        // ISO 6.4.1：new-pointer-type 的 domain-type 允许应用出现早于其定义点
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
        // 子界边界是常量表达式，不含类型引用
        return
      case 'EnumerationType':
        // 枚举列举的是值标识符，不含类型引用
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

  /** ISO 6.4.3.4：set-type = 'set' 'of' base-type，base-type = ordinal-type */
  private checkSetBaseType(node: SetTypeNode): void {
    const base = this.decl.typeNodeInfo.get(node.baseType)
    if (base && !isOrdinalType(base)) {
      throw new Error(
        `The base-type of a set-type shall be an ordinal-type (ISO 7185 6.4.3.4), found '${base.tag}'`,
      )
    }
  }

  // --------------------------------------------------------
  // ISO 6.6.2：function-block 须含对函数标识符的赋值语句
  // --------------------------------------------------------

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
