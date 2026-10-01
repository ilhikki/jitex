import { DeclarationResult, StatementResult } from '../stage-types.ts'

export function runCheckPass(
  declResult: DeclarationResult,
  stmtResult: StatementResult,
): void {
  checkGotos(declResult, stmtResult)
  checkUndefinedRefs(stmtResult)
}

function checkGotos(
  decl: DeclarationResult,
  stmt: StatementResult,
): void {
  for (const g of stmt.gotoRecords) {
    const labelInfo = findLabel(decl, g.fromFuncId, g.labelVal)
    if (!labelInfo) {
      throw new Error(`Goto to undeclared label: ${g.labelVal}`)
    }

    if (labelInfo.funcId !== g.fromFuncId) {
      if (!isAncestorFunc(decl, labelInfo.funcId, g.fromFuncId)) {
        throw new Error(
          `Goto to label ${g.labelVal} in another procedure is forbidden (ISO 7185 6.8.2.4)`,
        )
      }
    }

    const targetDepth = stmt.labelDepth.get(labelInfo.labelId)
    if (targetDepth !== undefined && targetDepth > g.fromDepth) {
      throw new Error(
        `Goto into structured statement body is forbidden (ISO 7185 6.8.2.4): label ${g.labelVal}`,
      )
    }
  }
}

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
