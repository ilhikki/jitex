import type {
  ProgramNode,
  CompoundStatementNode,
  ProcedureDeclarationNode,
  FunctionDeclarationNode,
  ProcedureCallNode,
  EmptyStatementNode,
  StatementNode,
  IfStatementNode,
  WhileStatementNode,
  RepeatStatementNode,
  ForStatementNode,
  CaseStatementNode,
  GotoStatementNode,
  WithStatementNode,
  ExpressionNode,
  IntegerLiteralNode,
  BooleanLiteralNode,
  IdentifierNode,
  CaseBranchNode,
} from '../ast/types'
import type { Frame, State, Scope, Value } from './types'
import { createScope } from './types'

// ============================================================================
// Mock Expression Evaluator (M0)
// ============================================================================

function evalExpr(expr: ExpressionNode, _scope: Scope): Value {
  switch (expr.kind) {
    case 'IntegerLiteral':
      return (expr as IntegerLiteralNode).value
    case 'BooleanLiteral':
      return (expr as BooleanLiteralNode).value
    case 'Identifier':
      return 0
    default:
      return 0
  }
}

function evalCondition(expr: ExpressionNode, scope: Scope): boolean {
  const value = evalExpr(expr, scope)
  return Boolean(value)
}

// ============================================================================
// Frame constructors
// ============================================================================

export function createProgramFrame(program: ProgramNode): Frame {
  let pushed = false
  return {
    kind: 'Program',
    done: false,
    step(state: State) {
      if (!pushed) {
        state.stack.push(createCompoundFrame(state.program.block.compound))
        pushed = true
        return
      }
      this.done = true
    },
  }
}

export function createCompoundFrame(node: CompoundStatementNode): Frame {
  let index = 0
  const statements = node.statements

  return {
    kind: 'Compound',
    done: false,
    step(state: State) {
      if (index >= statements.length) {
        this.done = true
        return
      }
      state.stack.push(createStatementFrame(statements[index]))
      index++
    },
  }
}

export function createEmptyFrame(_node: EmptyStatementNode): Frame {
  return { kind: 'Empty', done: true, step() {} }
}

export function createFunctionFrame(
  decl: ProcedureDeclarationNode | FunctionDeclarationNode,
  _args: Value[]
): Frame & { decl: ProcedureDeclarationNode | FunctionDeclarationNode } {
  let phase: 'init' | 'running' = 'init'
  let savedScope: Scope | null = null

  return {
    kind: 'Function',
    done: false,
    decl,
    step(state: State) {
      if (phase === 'init') {
        const fnScope = createScope(state.globalScope, decl)
        savedScope = state.currentScope
        state.currentScope = fnScope

        if (decl.block) {
          state.stack.push(createCompoundFrame(decl.block.compound))
        }
        phase = 'running'
        return
      }

      if (savedScope) {
        state.currentScope = savedScope
        savedScope = null
      }
      this.done = true
    },
  }
}

export function createProcedureCallFrame(node: ProcedureCallNode): Frame {
  return {
    kind: 'ProcedureCall',
    done: false,
    step(state: State) {
      const name = node.name.name
      const procDecl = state.declarations.findProcedure(name, state.currentScope)
      if (procDecl) {
        state.stack.push(createFunctionFrame(procDecl, []))
        this.done = true
        return
      }

      const funcDecl = state.declarations.findFunction(name, state.currentScope)
      if (funcDecl) {
        state.stack.push(createFunctionFrame(funcDecl, []))
        this.done = true
        return
      }

      this.done = true
    },
  }
}

// --- IfFrame ---
// Phase 'eval':  evaluate condition, push then/else branch
// Phase 'done':  branch executed, we're top again
export function createIfFrame(node: IfStatementNode): Frame {
  let phase: 'eval' | 'done' = 'eval'

  return {
    kind: 'If',
    done: false,
    step(state: State) {
      if (phase === 'eval') {
        const condition = evalCondition(node.condition, state.currentScope)
        if (condition && node.thenBranch) {
          state.stack.push(createStatementFrame(node.thenBranch))
        } else if (!condition && node.elseBranch) {
          state.stack.push(createStatementFrame(node.elseBranch))
        }
        phase = 'done'
        return
      }
      this.done = true
    },
  }
}

// --- WhileFrame ---
// Phase 'eval':  evaluate condition
//   - if true: push body, -> 'running'
//   - if false: -> 'done'
// Phase 'running': body done (we're top again), -> 'done' (M0: single iteration)
export function createWhileFrame(node: WhileStatementNode): Frame {
  let phase: 'eval' | 'running' = 'eval'

  return {
    kind: 'While',
    done: false,
    step(state: State) {
      if (phase === 'eval') {
        const condition = evalCondition(node.condition, state.currentScope)
        if (condition) {
          state.stack.push(createStatementFrame(node.body))
          phase = 'running'
        } else {
          this.done = true
        }
        return
      }

      this.done = true
    },
  }
}

// --- RepeatFrame ---
// Phase 'body':  push statements compound
// Phase 'eval':  body done, -> 'done' (M0: single iteration)
export function createRepeatFrame(node: RepeatStatementNode): Frame {
  let phase: 'body' | 'eval' = 'body'

  return {
    kind: 'Repeat',
    done: false,
    step(state: State) {
      if (phase === 'body') {
        const compound: CompoundStatementNode = {
          kind: 'CompoundStatement',
          statements: node.statements,
        }
        state.stack.push(createCompoundFrame(compound))
        phase = 'eval'
        return
      }

      this.done = true
    },
  }
}

// --- ForFrame ---
// Phase 'init':  initialize variable (skip in M0), push body, -> 'running'
// Phase 'running': body done (we're top again), increment, check boundary
//   - if within range: push body again, -> 'running'
//   - if out of range: -> 'done'
// Note: M0 uses mock values - direction is ignored
export function createForFrame(node: ForStatementNode): Frame {
  let phase: 'init' | 'running' = 'init'

  return {
    kind: 'For',
    done: false,
    step(state: State) {
      if (phase === 'init') {
        state.stack.push(createStatementFrame(node.body))
        phase = 'running'
        return
      }

      // M0: execute body once then done
      // M1 will handle proper iteration
      this.done = true
    },
  }
}

// --- CaseFrame ---
// Phase 'eval':  evaluate expression, match branch, push statement
// Phase 'done':  branch executed, we're top again
export function createCaseFrame(node: CaseStatementNode): Frame {
  let phase: 'eval' | 'done' = 'eval'

  return {
    kind: 'Case',
    done: false,
    step(state: State) {
      if (phase === 'eval') {
        const exprValue = evalExpr(node.expression, state.currentScope)
        let matchedBranch: CaseBranchNode | null = null

        for (const branch of node.branches) {
          for (const label of branch.labels) {
            const labelValue = evalExpr(label, state.currentScope)
            if (exprValue === labelValue) {
              matchedBranch = branch
              break
            }
          }
          if (matchedBranch) break
        }

        if (matchedBranch) {
          state.stack.push(createStatementFrame(matchedBranch.statement))
        } else if (node.otherwise) {
          state.stack.push(createStatementFrame(node.otherwise))
        }

        phase = 'done'
        return
      }
      this.done = true
    },
  }
}

// --- GotoFrame ---
// Phase 'find':  find label target in declarations, rebuild stack to target
// Phase 'done':  jump completed
// Note: M0 uses simple approach - just skip to next statement
export function createGotoFrame(node: GotoStatementNode): Frame {
  const labelValue = (node.label as IntegerLiteralNode).value

  return {
    kind: 'Goto',
    done: false,
    step(state: State) {
      const targetStmt = state.declarations.labels.get(labelValue)
      if (targetStmt) {
        state.stack.push(createStatementFrame(targetStmt))
      }
      this.done = true
    },
  }
}

// --- WithFrame ---
// Phase 'init':  create scope for record fields (skip in M0), push body
// Phase 'done':  body done, cleanup scope
export function createWithFrame(node: WithStatementNode): Frame {
  let phase: 'init' | 'done' = 'init'

  return {
    kind: 'With',
    done: false,
    step(state: State) {
      if (phase === 'init') {
        state.stack.push(createStatementFrame(node.body))
        phase = 'done'
        return
      }
      this.done = true
    },
  }
}

// --- AssignmentFrame ---
// M0: skip evaluation, just done
export function createAssignmentFrame(_node: any): Frame {
  return { kind: 'Assignment', done: true, step() {} }
}

// --- Dispatch ---
export function createStatementFrame(stmt: StatementNode): Frame {
  switch (stmt.kind) {
    case 'CompoundStatement':
      return createCompoundFrame(stmt as CompoundStatementNode)

    case 'ProcedureCall':
      return createProcedureCallFrame(stmt as ProcedureCallNode)

    case 'EmptyStatement':
      return createEmptyFrame(stmt as EmptyStatementNode)

    case 'Assignment':
      return createAssignmentFrame(stmt)

    case 'IfStatement':
      return createIfFrame(stmt as IfStatementNode)

    case 'WhileStatement':
      return createWhileFrame(stmt as WhileStatementNode)

    case 'RepeatStatement':
      return createRepeatFrame(stmt as RepeatStatementNode)

    case 'ForStatement':
      return createForFrame(stmt as ForStatementNode)

    case 'CaseStatement':
      return createCaseFrame(stmt as CaseStatementNode)

    case 'GotoStatement':
      return createGotoFrame(stmt as GotoStatementNode)

    case 'WithStatement':
      return createWithFrame(stmt as WithStatementNode)

    default:
      return { kind: 'Unknown', done: true, step() {} }
  }
}
