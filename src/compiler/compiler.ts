import type { BlockNode, ProgramNode, StatementNode } from '../ast/types'
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
import { analyzeLabels, type BlockLabelAnalysis, type LabelAnalysisResult } from './label-analysis'

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
  withVarCounter = 0
  labelAnalysis: LabelAnalysisResult | null = null

  constructor(typeTable: TypeTable) {
    this.typeTable = typeTable
  }

  getLabelAnalysis(block: BlockNode): BlockLabelAnalysis {
    if (!this.labelAnalysis) {
      throw new Error('Label analysis not performed')
    }
    const result = this.labelAnalysis.blockMap.get(block)
    if (!result) {
      throw new Error('No label analysis for block')
    }
    return result
  }

  compile(program: ProgramNode, programFileUrls?: Record<string, string>): string {
    this.labelAnalysis = analyzeLabels(program)

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
