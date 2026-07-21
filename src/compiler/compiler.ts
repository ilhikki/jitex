import type { ProgramNode, StatementNode } from '../ast/types'
import type { TypeTable } from '../types'
import { ProcInfo, Scope } from './emit/utils'
import {
  collectConsts,
  collectGlobals,
  collectProcs,
  emitBody,
  emitGlobalDecls,
  emitProc,
} from './emit/declarations'
import { collectTypes } from './emit/types'
import { emitStmt as emitStmtImpl } from './emit/statements'

export class Compiler {
  procs = new Map<string, ProcInfo>()
  globalScope = new Scope()
  procBodies: string[] = []
  typeTable: TypeTable
  aliasMap = new Map<string, string>()
  enumConstants = new Map<string, number>()
  constInts = new Map<string, number>()
  labelCases: Map<string, number> | null = null
  labelSwitchName: string | null = null
  gotoMode: 'continue' | 'break' | 'exception' | 'simple' | null = null
  gotoLabel: string | null = null
  allowUndeclaredLabels: boolean
  withVarCounter = 0

  constructor(typeTable: TypeTable, options?: { allowUndeclaredLabels?: boolean }) {
    this.typeTable = typeTable
    this.allowUndeclaredLabels = options?.allowUndeclaredLabels ?? false
  }

  compile(program: ProgramNode, programFileUrls?: Record<string, string>): string {
    collectTypes(this, program.block)

    collectConsts(this, program.block.constDeclarations)
    collectGlobals(this, program.block.variableDeclarations)
    collectProcs(this, program.block.procedureDeclarations, program.block.functionDeclarations)

    const procDefs: string[] = []
    for (const [name, info] of this.procs) {
      if (info.block || info.forwardDef) {
        procDefs.push(emitProc(this, info))
      }
    }

    const globalDecls = emitGlobalDecls(this, program.block)

    const mainBody = emitBody(this, program.block, this.globalScope, 2)

    const assignLines: string[] = []
    if (programFileUrls) {
      for (const [varName, url] of Object.entries(programFileUrls)) {
        assignLines.push(
          `  await ctx.sysCall("ASSIGN", [${varName}, ctx.box('string', ${JSON.stringify(url)})])`
        )
      }
    }

    const parts: string[] = []
    parts.push("'use strict'")
    parts.push(globalDecls)
    parts.push(procDefs.join('\n'))
    if (assignLines.length > 0) {
      parts.push(assignLines.join('\n'))
    }
    parts.push(mainBody)
    return parts.join('\n')
  }

  emitStmt(node: StatementNode, scope: Scope, indent: number): string {
    return emitStmtImpl(this, node, scope, indent)
  }
}
