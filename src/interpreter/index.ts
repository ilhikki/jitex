export type { State, Scope, Frame, PascalValue, PascalType, DeclarationTable, RunMode, StepCallback } from './types'
export { createState, createScope, createDeclarations, stackTrace } from './types'
export { run, runToCompletion } from './run'
export { createStatementFrame, populateSystemProcedures } from './frames'
export { evalExpr, inferExprType, lookupVariableType, populateSystemFunctions } from './evaluator'
export * from './types/pascal-value'
export type { PascalFile, PascalConsole, PascalFileOps, PascalIO } from './io'
export { createDefaultIO, createDefaultFileHandle, createEmptyFile, createRecordFileOps, createCallbackConsole } from './io'

// Convenience: create state with all system handlers registered
import type { ProgramNode } from '../ast/types'
import { createState as _createState } from './types'
import { populateSystemProcedures as _populateProcs } from './frames'
import { populateSystemFunctions as _populateFuncs } from './evaluator'

export function createInterpreterState(program: ProgramNode) {
  const state = _createState(program)
  _populateProcs(state)
  _populateFuncs(state)
  return state
}
