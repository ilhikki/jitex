import type { BlockNode, ProgramNode, StatementNode } from '@/ast/types'
import type { TypeTable } from '@/types'
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
import {
  analyzeLabels,
  type BlockLabelAnalysis,
  type LabelAnalysisResult,
  type GotoTarget,
} from './label-analysis'
import type { GotoStatementNode } from '@/ast/types'

/**
 * 循环上下文：当 goto 在循环内部时，需要知道循环的 JS 标签
 * 以便正确生成 continue/break
 */
export interface LoopContext {
  /** JS label 名（如 while_0, for_1） */
  jsLabel: string
  /** 该循环体内部包含的 label 值集合 */
  innerLabels: Set<string>
  /** 循环体末尾的 label 值集合（可用 continue 替代 goto） */
  tailLabels: Set<string>
}

export class Compiler {
  procs = new Map<string, ProcInfo>()
  globalScope = new Scope()
  typeTable: TypeTable
  aliasMap = new Map<string, string>()
  enumConstants = new Map<string, number>()
  constInts = new Map<string, number>()

  // --- goto 状态机上下文 ---
  /** 当前状态机的 label→case 映射，null 表示不在状态机内 */
  labelCases: Map<string, number> | null = null
  /** 当前状态机的 while 循环标签名 */
  labelSwitchName: string | null = null
  /** 当前状态机的 pc 变量名（如 '__pc' 或 '__inner_pc_0'） */
  currentPcVar: string = '__pc'
  /** 循环上下文栈，用于判断 goto 是在循环内还是循环外 */
  loopStack: LoopContext[] = []

  withVarCounter = 0
  labelAnalysis: LabelAnalysisResult | null = null

  /** 当前正在编译的 block 的 analysis（用于 GotoStatement 编译时查 visibleGotoTargets） */
  currentBlockAnalysis: BlockLabelAnalysis | null = null

  /** 当前正在编译的函数/过程 block 的 id（用于判断 goto 是否跨函数） */
  currentFunctionBlockId: number = -1

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

  /**
   * 获取 goto 语句的目标信息（预计算结果）。
   * 生成器通过此方法查询，无需运行时查找。
   *
   * @param gotoNode GotoStatement AST 节点
   * @returns 目标信息（blockId + caseNum），未找到返回 null
   */
  getGotoTarget(gotoNode: GotoStatementNode): GotoTarget | null {
    if (!this.labelAnalysis) return null
    return this.labelAnalysis.gotoTargets.get(gotoNode) ?? null
  }

  compile(program: ProgramNode, programFileUrls?: Record<string, string>): string {
    this.labelAnalysis = analyzeLabels(program)

    collectTypes(this, program.block)

    collectConsts(this, program.block.constDeclarations)
    collectGlobals(this, program.block.variableDeclarations)
    collectProcs(this, program.block.procedureDeclarations, program.block.functionDeclarations)

    const procDefs: string[] = []
    for (const [_name, info] of this.procs) {
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
    // 总是注入 __GotoSignal 类，因为所有 goto 都统一抛出异常
    parts.push(
      'class __GotoSignal extends Error { constructor(targetPc, targetCase) { super("goto escape"); this.targetPc = targetPc; this.targetCase = targetCase; } }'
    )
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

  /** 当前 goto 是否在循环内部 */
  get insideLoop(): boolean {
    return this.loopStack.length > 0
  }

  /** 获取当前最内层循环上下文 */
  get currentLoop(): LoopContext | undefined {
    return this.loopStack[this.loopStack.length - 1]
  }

  /** 判断 goto 目标 label 是否在当前最内层循环体的末尾 */
  isLabelAtLoopTail(labelName: string): boolean {
    const loop = this.currentLoop
    if (!loop) return false
    return loop.tailLabels.has(labelName)
  }
}
