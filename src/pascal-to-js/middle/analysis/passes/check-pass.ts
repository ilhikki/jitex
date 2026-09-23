/*
 * Pass 3: 后置检查。
 *
 * 不遍历 AST，只读 Pass 1/2 的 result 做 goto 跨函数检查 + 无定义引用检查。
 * 有错直接抛异常，无错返回 CheckResult。
 *
 * 输入：DeclarationResult, StatementResult
 * 输出：CheckResult
 */

import { DeclarationResult, StatementResult } from '../stage-types.ts'

// Pass 3 入口

export function runCheckPass(
  declResult: DeclarationResult,
  stmtResult: StatementResult,
): void {
  checkGotos(declResult, stmtResult)
  checkUndefinedRefs(stmtResult)
}

// goto 规则检查（ISO 7185 6.8.1, 6.8.2.4）

function checkGotos(
  decl: DeclarationResult,
  stmt: StatementResult,
): void {
  for (const g of stmt.gotoRecords) {
    const labelInfo = findLabel(decl, g.fromFuncId, g.labelVal)
    if (!labelInfo) {
      throw new Error(`Goto to undeclared label: ${g.labelVal}`)
    }
    // 跨过程 goto：仅允许跳到祖先函数的 label
    if (labelInfo.funcId !== g.fromFuncId) {
      if (!isAncestorFunc(decl, labelInfo.funcId, g.fromFuncId)) {
        throw new Error(
          `Goto to label ${g.labelVal} in another procedure is forbidden (ISO 7185 6.8.2.4)`,
        )
      }
    }
    // 跳入非透明块检查：label 深度 > goto 深度 → 跳入结构体内部
    const targetDepth = stmt.labelDepth.get(labelInfo.labelId)
    if (targetDepth !== undefined && targetDepth > g.fromDepth) {
      throw new Error(
        `Goto into structured statement body is forbidden (ISO 7185 6.8.2.4): label ${g.labelVal}`,
      )
    }
  }
}

// 无定义引用检查（ISO 7185: 标识符须先声明后使用）

function checkUndefinedRefs(stmt: StatementResult): void {
  if (stmt.undefinedRefs.length === 0) {
    return
  }
  const lines = stmt.undefinedRefs.map((r) => {
    switch (r.kind) {
      case 'procedure':
        return `unknown procedure ${r.name}`
      case 'function':
        return `unknown function ${r.name}`
      case 'identifier':
        return `undefined identifier ${r.name}`
    }
  })
  throw new Error(`Undefined reference(s):\n${lines.join('\n')}`)
}

// 辅助：沿 parentFuncId 链查找 label

function findLabel(
  decl: DeclarationResult,
  funcId: number,
  labelVal: number,
): { labelId: number; funcId: number } | undefined {
  let fid: number | undefined = funcId
  while (fid !== undefined) {
    const funcLabels = decl.labels.get(fid)
    if (funcLabels) {
      const info = funcLabels.get(labelVal)
      if (info) {
        return info
      }
    }
    const functionInfo = decl.funcInfos.get(fid)
    fid = functionInfo ? functionInfo.parentFuncId : undefined
  }
  return undefined
}

/** 检查 ancestorFuncId 是否是 descFuncId 的祖先（含自身） */
function isAncestorFunc(
  decl: DeclarationResult,
  ancestorFuncId: number,
  descFuncId: number,
): boolean {
  let fid: number | undefined = descFuncId
  while (fid !== undefined) {
    if (fid === ancestorFuncId) {
      return true
    }
    const functionInfo = decl.funcInfos.get(fid)
    fid = functionInfo ? functionInfo.parentFuncId : undefined
  }
  return false
}
