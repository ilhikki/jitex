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
  CaseBranchNode,
  AssignmentNode,
  IdentifierNode,
} from '../ast/types'
import type { Frame, State, Scope, Value } from './types'
import { createScope } from './types'
import { evalExpr, evalCondition } from './evaluator'

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
): Frame & { decl: ProcedureDeclarationNode | FunctionDeclarationNode; savedScope: Scope | null } {
  let phase: 'init' | 'running' = 'init'
  let savedScope: Scope | null = null

  return {
    kind: 'Function',
    done: false,
    decl,
    savedScope,
    step(state: State) {
      if (phase === 'init') {
        const fnScope = createScope(state.currentScope, decl)
        this.savedScope = state.currentScope
        state.currentScope = fnScope

        if (decl.block) {
          decl.block.variableDeclarations.forEach(v => {
            v.names.forEach(n => {
              fnScope.variables.set(n.name.toUpperCase(), 0)
            })
          })
          state.stack.push(createCompoundFrame(decl.block.compound))
        }
        phase = 'running'
        return
      }

      if (this.savedScope) {
        state.currentScope = this.savedScope
        this.savedScope = null
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
      const name = node.name.name.toUpperCase()

      if (name === 'WRITE' || name === 'WRITELN') {
        for (const arg of node.arguments) {
          const value = evalExpr(arg, state.currentScope, state)
          state.outputBuffer.push(String(value))
        }
        if (name === 'WRITELN') {
          state.outputBuffer.push('\n')
        }
        this.done = true
        return
      }

      if (name === 'READ' || name === 'READLN') {
        for (const arg of node.arguments) {
          if (arg.kind === 'Identifier') {
            const varName = (arg as IdentifierNode).name.toUpperCase()
            const inputValue = state.inputQueue.shift() || ''
            const numValue = parseFloat(inputValue)
            state.currentScope.variables.set(varName, isNaN(numValue) ? inputValue : numValue)
          }
        }
        if (name === 'READLN') {
          state.inputQueue.shift()
        }
        this.done = true
        return
      }

      if (name === 'EXIT') {
        while (state.stack.length > 0) {
          const frame = state.stack[state.stack.length - 1]
          if (frame.kind === 'Function') {
            const fnFrame = frame as any
            if (fnFrame.savedScope) {
              state.currentScope = fnFrame.savedScope
            }
            frame.done = true
            state.stack.pop()
            break
          }
          if (frame.kind === 'Program') {
            frame.done = true
            state.stack.pop()
            break
          }
          state.stack.pop()
        }
        this.done = true
        return
      }

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
export function createIfFrame(node: IfStatementNode): Frame {
  let phase: 'eval' | 'done' = 'eval'

  return {
    kind: 'If',
    done: false,
    step(state: State) {
      if (phase === 'eval') {
        const condition = evalCondition(node.condition, state.currentScope, state)
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
export function createWhileFrame(node: WhileStatementNode): Frame {
  let phase: 'eval' | 'running' = 'eval'

  return {
    kind: 'While',
    done: false,
    step(state: State) {
      if (phase === 'eval') {
        const condition = evalCondition(node.condition, state.currentScope, state)
        if (condition) {
          state.stack.push(createStatementFrame(node.body))
          phase = 'running'
        } else {
          this.done = true
        }
        return
      }

      phase = 'eval'
    },
  }
}

// --- RepeatFrame ---
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

      const condition = evalCondition(node.untilCondition, state.currentScope, state)
      if (condition) {
        this.done = true
      } else {
        phase = 'body'
      }
    },
  }
}

// --- ForFrame ---
export function createForFrame(node: ForStatementNode): Frame {
  let phase: 'init' | 'eval' | 'body' = 'init'
  let finalValue: Value | null = null
  let isDownTo = false

  return {
    kind: 'For',
    done: false,
    step(state: State) {
      if (phase === 'init') {
        const initial = evalExpr(node.initial, state.currentScope, state)
        finalValue = evalExpr(node.final, state.currentScope, state)
        isDownTo = node.direction === 'DOWNTO'

        const varName = node.variable.name.toUpperCase()
        state.currentScope.variables.set(varName, initial)

        phase = 'body'
        state.stack.push(createStatementFrame(node.body))
        return
      }

      if (phase === 'body') {
        phase = 'eval'
        return
      }

      if (phase === 'eval') {
        const varName = node.variable.name.toUpperCase()
        const current = state.currentScope.variables.get(varName) ?? 0

        let shouldContinue = false
        if (isDownTo) {
          shouldContinue = (current as number) > (finalValue as number)
        } else {
          shouldContinue = (current as number) < (finalValue as number)
        }

        if (shouldContinue) {
          const increment = isDownTo ? -1 : 1
          state.currentScope.variables.set(varName, (current as number) + increment)
          phase = 'body'
          state.stack.push(createStatementFrame(node.body))
          return
        }
      }

      this.done = true
    },
  }
}

// --- CaseFrame ---
export function createCaseFrame(node: CaseStatementNode): Frame {
  let phase: 'eval' | 'done' = 'eval'

  return {
    kind: 'Case',
    done: false,
    step(state: State) {
      if (phase === 'eval') {
        const exprValue = evalExpr(node.expression, state.currentScope, state)
        let matchedBranch: CaseBranchNode | null = null

        for (const branch of node.branches) {
          for (const label of branch.labels) {
            const labelValue = evalExpr(label, state.currentScope, state)
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
export function createAssignmentFrame(node: AssignmentNode): Frame {
  return {
    kind: 'Assignment',
    done: false,
    step(state: State) {
      const rightValue = evalExpr(node.right, state.currentScope, state)
      assignToLeft(node.left, rightValue, state.currentScope, state)
      this.done = true
    },
  }
}

function assignToLeft(left: ExpressionNode, value: Value, scope: Scope, state: State): void {
  if (left.kind === 'Identifier') {
    const name = (left as IdentifierNode).name.toUpperCase()

    if (scope.functionDecl && scope.functionDecl.name.name.toUpperCase() === name) {
      state.returnValue = value
    } else {
      let targetScope = findVariableScope(name, scope)
      if (targetScope) {
        targetScope.variables.set(name, value)
      } else {
        scope.variables.set(name, value)
      }
    }
  }
}

function findVariableScope(name: string, scope: Scope): Scope | null {
  let s: Scope | null = scope
  while (s) {
    if (s.variables.has(name)) {
      return s
    }
    s = s.parent
  }
  return null
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
      return createAssignmentFrame(stmt as AssignmentNode)

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
