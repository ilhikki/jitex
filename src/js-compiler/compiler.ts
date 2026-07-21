// Compiler 主类：构造、compile 入口、公共状态字段、emitStmt thin wrapper。
//
// D2 拆分后方法实现分散在 emit-utils / emit-type / emit-expr / emit-stmt / emit-decl；
// Compiler 类保留公共字段（供独立函数访问）与 compile() 入口，emitStmt 作为 thin
// wrapper 以便 strategy.ts 通过 compiler.emitStmt(...) 调用。
import type { ProgramNode, StatementNode } from '../ast/types'
import type { TypeTable } from './types'
import { ProcInfo, Scope } from './emit-utils'
import {
  collectConsts,
  collectGlobals,
  collectProcs,
  emitBody,
  emitGlobalDecls,
  emitProc,
} from './emit-decl'
import { collectTypes } from './emit-type'
import { emitStmt as emitStmtImpl } from './emit-stmt'

export class Compiler {
  procs = new Map<string, ProcInfo>()
  globalScope = new Scope()
  procBodies: string[] = []
  typeTable: TypeTable
  // 用户类型名 -> typeId（如 ARR -> array-1..5-of-integer）
  aliasMap = new Map<string, string>()
  // enum 值名 -> 序号（如 RED -> 0）
  enumConstants = new Map<string, number>()
  // const integer 名 -> 值（用于类型边界求值）
  constInts = new Map<string, number>()
  // goto 状态机支持：当前过程体的 label -> case 编号映射（null 表示无 goto 上下文）
  labelCases: Map<string, number> | null = null
  labelSwitchName: string | null = null // goto break 用的 JS label 名
  // goto 优化模式：'continue' = 策略 B（后向循环），'break' = 策略 C（跳出循环），null = 正常
  gotoMode: 'continue' | 'break' | 'exception' | null = null
  gotoLabel: string | null = null // 策略 B/C 的 JS label 名
  // 非标扩展配置
  allowUndeclaredLabels: boolean
  // WITH 临时变量计数器（避免嵌套 WITH 变量名冲突）
  withVarCounter = 0

  constructor(typeTable: TypeTable, options?: { allowUndeclaredLabels?: boolean }) {
    this.typeTable = typeTable
    this.allowUndeclaredLabels = options?.allowUndeclaredLabels ?? false
  }

  compile(program: ProgramNode, programFileUrls?: Record<string, string>): string {
    // 0. 收集类型别名 + enum 常量 + const integer
    collectTypes(this, program.block)

    // 1. 收集常量、全局变量、过程/函数
    collectConsts(this, program.block.constDeclarations)
    collectGlobals(this, program.block.variableDeclarations)
    collectProcs(this, program.block.procedureDeclarations, program.block.functionDeclarations)

    // 2. 生成过程函数体
    const procDefs: string[] = []
    for (const [name, info] of this.procs) {
      // 跳过 forward 声明且无实际定义的（罕见，正常 forwardDef 已设置）
      if (info.block || info.forwardDef) {
        procDefs.push(emitProc(this, info))
      }
    }

    // 3. 生成全局变量声明
    const globalDecls = emitGlobalDecls(this, program.block)

    // 4. 生成 main 体（用 emitBody 以支持 main 程序的 goto 标号状态机）
    const mainBody = emitBody(this, program.block, this.globalScope, 2)

    // 4.5 programFileUrls：在 main 体前自动 ASSIGN（TANGLE 风格程序参数）
    const assignLines: string[] = []
    if (programFileUrls) {
      for (const [varName, url] of Object.entries(programFileUrls)) {
        // F 已在 globalDecls 中初始化为 PascalValue（file 句柄）
        // ASSIGN(F, 'url') → ctx.sysCall("ASSIGN", [F, ctx.box('string', url)])
        assignLines.push(
          `  await ctx.sysCall("ASSIGN", [${varName}, ctx.box('string', ${JSON.stringify(url)})])`
        )
      }
    }

    // 5. 组装
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

  // 供 strategy.ts 调用：thin wrapper 转发到 emit-stmt.ts 的独立函数
  emitStmt(node: StatementNode, scope: Scope, indent: number): string {
    return emitStmtImpl(this, node, scope, indent)
  }
}
