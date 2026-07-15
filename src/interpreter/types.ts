import type {
  ProgramNode,
  ProcedureDeclarationNode,
  FunctionDeclarationNode,
  VariableDeclarationNode,
  ConstDeclarationNode,
  TypeDeclarationNode,
  StatementNode,
  BlockNode,
  LabelDeclarationNode,
} from '../ast/types'

// ============================================================================
// Value (M0 placeholder — M1/M2 will extend)
// ============================================================================

export type Value = number | string | boolean | null | undefined

// ============================================================================
// Scope
// ============================================================================

export interface Scope {
  variables: Map<string, Value>
  parent: Scope | null
  functionDecl: ProcedureDeclarationNode | FunctionDeclarationNode | null
}

export function createScope(
  parent: Scope | null = null,
  functionDecl: ProcedureDeclarationNode | FunctionDeclarationNode | null = null
): Scope {
  return {
    variables: new Map(),
    parent,
    functionDecl,
  }
}

// ============================================================================
// DeclarationTable
// ============================================================================

export interface DeclarationTable {
  // Global declarations
  procedures: Map<string, ProcedureDeclarationNode>
  functions: Map<string, FunctionDeclarationNode>
  variables: Map<string, VariableDeclarationNode>
  constants: Map<string, ConstDeclarationNode>
  types: Map<string, TypeDeclarationNode>
  labels: Map<number, StatementNode>

  // Nested declaration lookup: search scope chain for procedures/functions
  findProcedure: (name: string, scope: Scope) => ProcedureDeclarationNode | null
  findFunction: (name: string, scope: Scope) => FunctionDeclarationNode | null
}

// ============================================================================
// Frame
// ============================================================================

export interface Frame {
  kind: string
  done: boolean
  step: (state: State) => void
}

// ============================================================================
// RunMode
// ============================================================================

export type RunMode = 'STEP_INTO' | 'STEP_OVER' | 'RUN'

// ============================================================================
// State
// ============================================================================

export interface State {
  stack: Frame[]
  globalScope: Scope
  currentScope: Scope
  program: ProgramNode
  declarations: DeclarationTable
  status: 'running' | 'terminated'
  returnValue: Value | null

  outputBuffer: string[]
  inputQueue: string[]
}

// ============================================================================
// Helpers
// ============================================================================

export function stackTrace(state: State): string[] {
  const trace: string[] = []
  for (let i = state.stack.length - 1; i >= 0; i--) {
    const frame = state.stack[i]
    if (frame.kind === 'Function') {
      const fnFrame = frame as any
      if (fnFrame.decl) {
        trace.push(fnFrame.decl.name.name)
      }
    }
  }
  return trace
}

export function createDeclarations(block: BlockNode, parentScope: Scope): DeclarationTable {
  const procedures = new Map<string, ProcedureDeclarationNode>()
  const functions = new Map<string, FunctionDeclarationNode>()
  const variables = new Map<string, VariableDeclarationNode>()
  const constants = new Map<string, ConstDeclarationNode>()
  const types = new Map<string, TypeDeclarationNode>()
  const labels = new Map<number, StatementNode>()

  // Collect block-level declarations
  block.procedureDeclarations.forEach(p => {
    if (!p.isForward) procedures.set(p.name.name.toUpperCase(), p)
  })
  block.functionDeclarations.forEach(f => {
    if (!f.isForward) functions.set(f.name.name.toUpperCase(), f)
  })
  block.variableDeclarations.forEach(v => {
    v.names.forEach(n => variables.set(n.name.toUpperCase(), v))
  })
  block.constDeclarations.forEach(c => {
    constants.set(c.name.name.toUpperCase(), c)
  })
  block.typeDeclarations.forEach(t => {
    types.set(t.name.name.toUpperCase(), t)
  })

  // Collect labels from compound statement
  collectLabels(block.compound, labels)

  return {
    procedures,
    functions,
    variables,
    constants,
    types,
    labels,
    findProcedure: (name: string, scope: Scope) => {
      const upper = name.toUpperCase()
      // Search up the scope chain
      let s: Scope | null = scope
      while (s) {
        if (s.functionDecl) {
          const block = s.functionDecl.block
          if (block) {
            for (const p of block.procedureDeclarations) {
              if (p.name.name.toUpperCase() === upper) return p
            }
          }
        }
        s = s.parent
      }
      // Fall back to global
      return procedures.get(upper) || null
    },
    findFunction: (name: string, scope: Scope) => {
      const upper = name.toUpperCase()
      let s: Scope | null = scope
      while (s) {
        if (s.functionDecl) {
          const block = s.functionDecl.block
          if (block) {
            for (const f of block.functionDeclarations) {
              if (f.name.name.toUpperCase() === upper) return f
            }
          }
        }
        s = s.parent
      }
      return functions.get(upper) || null
    },
  }
}

function collectLabels(stmt: StatementNode, labels: Map<number, StatementNode>): void {
  // Search for labeled statements in the compound
  // Labeled statements are stored as INTEGER followed by COLON in the parser
  // The parser treats "label: statement" as a plain statement
  // For M0 we do a simple walk — proper label collection needs position info
  // For now, we skip label collection (M0 Full will handle GOTO)
}

// ============================================================================
// State factory
// ============================================================================

export function createState(program: ProgramNode): State {
  const globalScope = createScope(null, null)
  const declarations = createDeclarations(program.block, globalScope)

  program.block.variableDeclarations.forEach(v => {
    v.names.forEach(n => {
      globalScope.variables.set(n.name.toUpperCase(), 0)
    })
  })

  const state: State = {
    stack: [],
    globalScope,
    currentScope: globalScope,
    program,
    declarations,
    status: 'running',
    returnValue: null,
    outputBuffer: [],
    inputQueue: [],
  }

  return state
}
