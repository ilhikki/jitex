import type {
  ProgramNode,
  CompoundStatementNode,
  ProcedureDeclarationNode,
  FunctionDeclarationNode,
  ProcedureCallNode,
  EmptyStatementNode,
  StatementNode,
} from '../ast/types'
import type { Frame, State, Scope, Value } from './types'
import { createScope } from './types'

// ============================================================================
// Frame constructors — each returns a Frame record
// ============================================================================

// --- ProgramFrame: entry point, push main block's compound ---
// Phase 1: push main compound
// Phase 2: (compound done, we're top again) set done
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
      // Compound is done, we're back on top
      this.done = true
    },
  }
}

// --- CompoundFrame: iterate over statements ---
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

// --- EmptyFrame: immediately done ---
export function createEmptyFrame(_node: EmptyStatementNode): Frame {
  return {
    kind: 'Empty',
    done: true,
    step(_state: State) {},
  }
}

// --- FunctionFrame: manages procedure/function call lifecycle ---
// Phase 'init':    create scope, push block compound, -> 'running'
// Phase 'running': block done (we're top again), restore scope, set done
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

      // phase === 'running': block finished
      if (savedScope) {
        state.currentScope = savedScope
        savedScope = null
      }
      this.done = true
    },
  }
}

// --- ProcedureCallFrame: looks up procedure and pushes FunctionFrame ---
// Sets done immediately — will be cleaned up when it reaches top again
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

      // Unknown — builtin or not implemented, skip
      this.done = true
    },
  }
}

// --- Dispatch: create the right frame for a statement ---
export function createStatementFrame(stmt: StatementNode): Frame {
  switch (stmt.kind) {
    case 'CompoundStatement':
      return createCompoundFrame(stmt as CompoundStatementNode)

    case 'ProcedureCall':
      return createProcedureCallFrame(stmt as ProcedureCallNode)

    case 'EmptyStatement':
      return createEmptyFrame(stmt as EmptyStatementNode)

    case 'Assignment':
      return { kind: 'Assignment', done: true, step() {} }

    case 'IfStatement':
      return {
        kind: 'If',
        done: false,
        step(state: State) {
          state.stack.push(createStatementFrame((stmt as any).thenBranch))
          this.done = true
        },
      }

    case 'WhileStatement':
      return { kind: 'While', done: true, step() {} }

    case 'RepeatStatement':
      return { kind: 'Repeat', done: true, step() {} }

    case 'ForStatement':
      return { kind: 'For', done: true, step() {} }

    case 'GotoStatement':
      return { kind: 'Goto', done: true, step() {} }

    default:
      return { kind: 'Unknown', done: true, step() {} }
  }
}
