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
  BinaryExpressionNode,
  CaseBranchNode,
  AssignmentNode,
  IdentifierNode,
  ArrayAccessNode,
  FieldAccessNode,
  VariableDeclarationNode,
  ParenthesizedExpressionNode,
  LabeledStatementNode,
} from '../ast/types'
import type { Frame, State, Scope, PascalValue, PascalType } from './types'
import { createScope } from './types'
import {
  evalExpr,
  inferExprType,
  lookupVariableType,
  bindArguments,
  formatValue,
} from './evaluator'
import { resolveType } from './types'
import {
  makeInteger,
  makeReal,
  makeBoolean,
  makeChar,
  makeDefaultValue,
  findType,
  coerceToType,
  binaryOp,
  INTEGER_TYPE,
  REAL_TYPE,
  CHAR_TYPE,
  BOOLEAN_TYPE,
  ArrayType,
  RecordType,
  FileType, PascalArray,
  PascalRecord,
  arrayIndex,
  createEmptyArray,
  getNum,
  getCharCode,
  getStringChars,
  getBoolValue,
} from './types/pascal-value'
import type { PascalFile } from './io'
import { createEmptyFile } from './io'

export function createProgramFrame(program: ProgramNode): Frame {
  let pushed = false
  const compound = program.block.compound
  return {
    kind: 'Program',
    done: false,
    step(state: State) {
      if (!pushed) {
        state.stack.push(createCompoundFrame(compound))
        pushed = true
        return
      }
      this.done = true
    },
    hasTag(label: number): boolean {
      return statementHasLabel(compound, label)
    },
    gotoTag(label: number, state: State): void {
      const frame = createCompoundFrame(compound)
      if (frame.gotoTag) frame.gotoTag(label, state)
      state.stack.push(frame)
      pushed = true
    },
  }
}

export function createCompoundFrame(node: CompoundStatementNode, startIndex: number = 0): Frame {
  let index = startIndex
  const statements = node.statements

  const frame: Frame = {
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
    hasTag(label: number): boolean {
      return statements.some(s => statementHasLabel(s, label))
    },
    gotoTag(label: number, state: State): void {
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i]
        if (stmt.kind === 'LabeledStatement' && (stmt as any).label.value === label) {
          index = i + 1
          state.stack.push(createStatementFrame((stmt as any).statement))
          return
        }
        if (statementHasLabel(stmt, label)) {
          index = i + 1
          pushAndGotoTag(stmt, label, state)
          return
        }
      }
    },
  }
  return frame
}

export function createEmptyFrame(_node: EmptyStatementNode): Frame {
  return { kind: 'Empty', done: true, step() {} }
}

export function createFunctionFrame(
  decl: ProcedureDeclarationNode | FunctionDeclarationNode,
  args: ExpressionNode[]
): Frame & { decl: ProcedureDeclarationNode | FunctionDeclarationNode; savedScope: Scope | null } {
  let phase: 'init' | 'running' = 'init'
  let savedScope: Scope | null = null
  const compound = decl.block ? decl.block.compound : null

  return {
    kind: 'Function',
    done: false,
    decl,
    savedScope,
    step(state: State) {
      if (phase === 'init') {
        const callerScope = state.currentScope
        const fnScope = createScope(state.currentScope, decl)
        this.savedScope = state.currentScope
        state.currentScope = fnScope

        if (decl.block) {
          // 初始化局部变量
          decl.block.variableDeclarations.forEach(v => {
            initVariables(v, fnScope, state)
          })
          // 绑定参数
          if (args.length > 0 && decl.parameters.length > 0) {
            bindArguments(decl.parameters, args, fnScope, callerScope, state)
          }
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
    hasTag(label: number): boolean {
      return compound ? statementHasLabel(compound, label) : false
    },
    gotoTag(label: number, state: State): void {
      if (!compound) return
      const frame = createCompoundFrame(compound)
      if (frame.gotoTag) frame.gotoTag(label, state)
      state.stack.push(frame)
      phase = 'running'
    },
  }
}

// 初始化变量声明（支持数组、记录、文件）
function initVariables(v: VariableDeclarationNode, scope: Scope, state: State): void {
  const varType = resolveType(v.type, state)
  v.names.forEach(n => {
    const name = n.name.toUpperCase()
    scope.variables.set(name, makeDefaultValue(varType))
    scope.variableTypes.set(name, varType)
  })
}

function handleBreak(state: State): void {
  while (state.stack.length > 0) {
    const frame = state.stack[state.stack.length - 1]
    if (frame.kind === 'While' || frame.kind === 'Repeat' || frame.kind === 'For') {
      frame.done = true
      state.stack.pop()
      break
    }
    state.stack.pop()
  }
}

function handleExit(state: State): void {
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
}

/**
 * 将所有内置过程注册到 state.systemProcedures 中，
 * 供 createProcedureCallFrame 在用户定义过程未命中时回退查找。
 */
export function populateSystemProcedures(state: State, extensions: boolean = false): void {
  // Pascal82 standard procedures
  state.systemProcedures.set('WRITE', (args, s) => handleWrite(args, s, false))
  state.systemProcedures.set('WRITELN', (args, s) => handleWrite(args, s, true))
  state.systemProcedures.set('READ', (args, s) => handleRead(args, s, false))
  state.systemProcedures.set('READLN', (args, s) => handleRead(args, s, true))
  state.systemProcedures.set('RESET', (args, s) => handleFileReset(args, s))
  state.systemProcedures.set('REWRITE', (args, s) => handleFileRewrite(args, s))
  state.systemProcedures.set('GET', (args, s) => handleFileGet(args, s))
  state.systemProcedures.set('PUT', (args, s) => handleFilePut(args, s))

  // Non-standard extensions (not Pascal82, must be explicitly enabled)
  if (extensions) {
    state.systemProcedures.set('BREAK', (_args, s) => handleBreak(s))
    state.systemProcedures.set('EXIT', (_args, s) => handleExit(s))
    state.systemProcedures.set('CLOSE', (args, s) => handleFileClose(args, s))
    state.systemProcedures.set('ASSIGN', (args, s) => handleFileAssign(args, s))
  }
}

export function createProcedureCallFrame(node: ProcedureCallNode): Frame {
  return {
    kind: 'ProcedureCall',
    done: false,
    step(state: State) {
      const name = node.name.name.toUpperCase()

      // 优先查找用户定义的过程
      const procDecl = state.declarations.findProcedure(name, state.currentScope)
      if (procDecl) {
        const frame = createFunctionFrame(procDecl, node.arguments)
        state.stack.push(frame)
        this.done = true
        return
      }

      // 用户定义的函数以过程形式调用
      const funcDecl = state.declarations.findFunction(name, state.currentScope)
      if (funcDecl) {
        const frame = createFunctionFrame(funcDecl, node.arguments)
        state.stack.push(frame)
        this.done = true
        return
      }

      // 回退到系统过程
      const handler = state.systemProcedures.get(name)
      if (handler) {
        handler(node.arguments, state)
        this.done = true
        return
      }

      throw new Error(`Unknown procedure: ${name}`)
    },
  }
}

// ============================================================================
// READ / READLN
// ============================================================================

function handleRead(args: ExpressionNode[], state: State, isReadln: boolean): void {
  let fileArg: PascalFile | null = null
  const varArgs: { name: string; scope: Scope | null; type: PascalType }[] = []

  for (const arg of args) {
    if (arg.kind !== 'Identifier') {
      throw new Error('READ/READLN requires variable identifiers as arguments')
    }
    const varName = (arg as IdentifierNode).name.toUpperCase()
    const varType = lookupVariableType(varName, state.currentScope) || INTEGER_TYPE
    const targetScope = findVariableScope(varName, state.currentScope)
    if (!targetScope) {
      throw new Error(`Unknown variable '${varName}' in READ/READLN`)
    }

    if (varType.kind === 'file') {
      const value = targetScope.variables.get(varName)
      fileArg = value!.rawValue as PascalFile
    } else {
      varArgs.push({ name: varName, scope: targetScope, type: varType })
    }
  }

  if (fileArg) {
    // File-based read: parse values from file buffer per Pascal82 text-file semantics.
    // For numeric types, skip leading whitespace/line-marks, then read a token of
    // digit/sign characters and parse it. For char, read exactly one character.
    // For array of char, read characters up to array length or line end.
    for (const v of varArgs) {
      let value: PascalValue

      if (v.type.kind === 'char') {
        // char: read exactly one character (may be whitespace)
        const ch = state.io.file.eof(fileArg) ? 0 : state.io.file.bufferChar(fileArg)
        if (!state.io.file.eof(fileArg)) {
          state.io.file.get(fileArg)
        }
        value = makeChar(ch)
      } else if (v.type.kind === 'integer' || v.type.kind === 'real') {
        // numeric: skip leading blanks, tabs, and line marks
        while (!state.io.file.eof(fileArg)) {
          if (state.io.file.eoln(fileArg)) {
            state.io.file.readln(fileArg)
            continue
          }
          const ch = state.io.file.bufferChar(fileArg)
          if (ch === 32 || ch === 9) {
            state.io.file.get(fileArg)
          } else {
            break
          }
        }
        // read token until whitespace or EOF
        let token = ''
        while (!state.io.file.eof(fileArg) && !state.io.file.eoln(fileArg)) {
          const ch = state.io.file.bufferChar(fileArg)
          if (ch === 32 || ch === 9) break
          token += String.fromCharCode(ch)
          state.io.file.get(fileArg)
        }
        if (v.type.kind === 'integer') {
          const num = parseInt(token, 10) || 0
          value = v.type === findType('LONGINT') || v.type === findType('LONGWORD')
            ? { type: v.type, rawValue: BigInt(num) }
            : makeInteger(num)
        } else {
          value = makeReal(parseFloat(token) || 0)
        }
      } else if (v.type.kind === 'array') {
        // array of char: read characters up to array length or line end
        const arrType = v.type as ArrayType
        const elementType = arrType.elementType
        if (elementType.kind === 'char' && arrType.dimensions.length === 1) {
          const dim = arrType.dimensions[0]
          const len = dim.high - dim.low + 1
          const chars: number[] = []
          for (let i = 0; i < len; i++) {
            if (state.io.file.eof(fileArg) || state.io.file.eoln(fileArg)) {
              chars.push(0)
            } else {
              const ch = state.io.file.bufferChar(fileArg)
              chars.push(ch)
              state.io.file.get(fileArg)
            }
          }
          value = { type: v.type, rawValue: chars }
        } else {
          value = makeDefaultValue(v.type)
        }
      } else {
        value = makeDefaultValue(v.type)
      }

      if (v.scope) {
        v.scope.variables.set(v.name, value)
      } else {
        state.currentScope.variables.set(v.name, value)
      }
    }
    if (isReadln) {
      state.io.file.readln(fileArg)
    }
  } else {
    // Console-based read: get input line and parse values from it
    const inputLine = isReadln
      ? state.io.console.readln()
      : state.io.console.read()
    const tokens = inputLine.trim().split(/\s+/).filter(t => t.length > 0)
    let tokenIdx = 0

    for (const v of varArgs) {
      let value: PascalValue
      const input = tokens[tokenIdx++] || ''
      if (v.type.kind === 'char') {
        value = makeChar(input.charCodeAt(0) || 0)
      } else if (v.type.kind === 'integer') {
        const num = parseInt(input, 10) || 0
        value = v.type === findType('LONGINT') || v.type === findType('LONGWORD')
          ? { type: v.type, rawValue: BigInt(num) }
          : makeInteger(num)
      } else if (v.type.kind === 'real') {
        value = makeReal(parseFloat(input) || 0)
      } else if (v.type.kind === 'array') {
        const arrType = v.type as ArrayType
        const elementType = arrType.elementType
        if (elementType.kind === 'char' && arrType.dimensions.length === 1) {
          const dim = arrType.dimensions[0]
          const len = dim.high - dim.low + 1
          const chars: number[] = []
          for (let i = 0; i < len; i++) {
            if (i < input.length) {
              chars.push(input.charCodeAt(i) & 0xFF)
            } else {
              chars.push(0)
            }
          }
          value = { type: v.type, rawValue: chars }
        } else {
          value = makeDefaultValue(v.type)
        }
      } else {
        value = makeDefaultValue(v.type)
      }

      if (v.scope) {
        v.scope.variables.set(v.name, value)
      } else {
        state.currentScope.variables.set(v.name, value)
      }
    }
  }
}

// ============================================================================
// WRITE / WRITELN
// ============================================================================

function formatOutputArg(arg: ExpressionNode, state: State): string {
  if (arg.kind === 'BinaryExpression' && (arg as BinaryExpressionNode).operator === ':') {
    const bin = arg as BinaryExpressionNode
    const value = evalExpr(bin.left, state.currentScope, state)
    const width = getNum(evalExpr(bin.right, state.currentScope, state))
    const str = formatValue(value)
    if (str.length >= width) return str
    return ' '.repeat(width - str.length) + str
  }
  const value = evalExpr(arg, state.currentScope, state)
  return formatValue(value)
}

function handleWrite(args: ExpressionNode[], state: State, writeln: boolean): void {
  if (args.length === 0) {
    if (writeln) state.io.console.writeln()
    return
  }

  const firstValue = evalExpr(args[0], state.currentScope, state)
  if (firstValue.type.kind === 'file') {
    const file = firstValue.rawValue as PascalFile
    for (let i = 1; i < args.length; i++) {
      state.io.file.write(file, formatOutputArg(args[i], state))
    }
    if (writeln) state.io.file.writeln(file)
  } else {
    for (const arg of args) {
      state.io.console.write(formatOutputArg(arg, state))
    }
    if (writeln) state.io.console.writeln()
  }
}

// ============================================================================
// 文件操作
// ============================================================================

function getFileValue(arg: ExpressionNode, state: State): PascalValue | null {
  if (arg.kind === 'Identifier') {
    const name = (arg as IdentifierNode).name.toUpperCase()
    let s: Scope | null = state.currentScope
    while (s) {
      if (s.variables.has(name)) {
        return s.variables.get(name)!
      }
      s = s.parent
    }
  }
  return null
}

function handleFileReset(args: ExpressionNode[], state: State): void {
  if (args.length === 0) return
  const fileValue = getFileValue(args[0], state)
  if (!fileValue || fileValue.type.kind !== 'file') return
  state.io.file.reset(fileValue.rawValue as PascalFile)
}

function handleFileRewrite(args: ExpressionNode[], state: State): void {
  if (args.length === 0) return
  const fileValue = getFileValue(args[0], state)
  if (!fileValue || fileValue.type.kind !== 'file') return
  state.io.file.rewrite(fileValue.rawValue as PascalFile)
}

function handleFileGet(args: ExpressionNode[], state: State): void {
  if (args.length === 0) return
  const fileValue = getFileValue(args[0], state)
  if (!fileValue || fileValue.type.kind !== 'file') return
  state.io.file.get(fileValue.rawValue as PascalFile)
}

function handleFilePut(args: ExpressionNode[], state: State): void {
  if (args.length === 0) return
  const fileValue = getFileValue(args[0], state)
  if (!fileValue || fileValue.type.kind !== 'file') return
  state.io.file.put(fileValue.rawValue as PascalFile)
}

function handleFileClose(args: ExpressionNode[], state: State): void {
  if (args.length === 0) return
  const fileValue = getFileValue(args[0], state)
  if (!fileValue || fileValue.type.kind !== 'file') return
  state.io.file.close(fileValue.rawValue as PascalFile)
}

function handleFileAssign(args: ExpressionNode[], state: State): void {
  if (args.length < 2) throw new Error('ASSIGN requires 2 arguments: file variable and filename')
  const fileValue = getFileValue(args[0], state)
  if (!fileValue || fileValue.type.kind !== 'file') throw new Error('ASSIGN first argument must be a file variable')
  const nameValue = evalExpr(args[1], state.currentScope, state)
  const filename = typeof nameValue.rawValue === 'string'
    ? nameValue.rawValue
    : Array.isArray(nameValue.rawValue)
      ? String.fromCharCode(...nameValue.rawValue)
      : String(nameValue.rawValue)
  state.io.file.assign(fileValue.rawValue as PascalFile, filename)
}

// --- IfFrame ---
export function createIfFrame(node: IfStatementNode): Frame {
  let phase: 'eval' | 'done' = 'eval'

  return {
    kind: 'If',
    done: false,
    step(state: State) {
      if (phase === 'eval') {
        const condition = evalExpr(node.condition, state.currentScope, state)
        const conditionBool = getBoolValue(condition)
        if (conditionBool && node.thenBranch) {
          state.stack.push(createStatementFrame(node.thenBranch))
        } else if (!conditionBool && node.elseBranch) {
          state.stack.push(createStatementFrame(node.elseBranch))
        }
        phase = 'done'
        return
      }
      this.done = true
    },
    hasTag(label: number): boolean {
      return statementHasLabel(node.thenBranch, label) ||
        (node.elseBranch ? statementHasLabel(node.elseBranch, label) : false)
    },
    gotoTag(label: number, state: State): void {
      if (statementHasLabel(node.thenBranch, label)) {
        pushAndGotoTag(node.thenBranch, label, state)
      } else if (node.elseBranch && statementHasLabel(node.elseBranch, label)) {
        pushAndGotoTag(node.elseBranch, label, state)
      }
      phase = 'done'
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
        const condition = evalExpr(node.condition, state.currentScope, state)
        const conditionBool = getBoolValue(condition)
        if (conditionBool) {
          state.stack.push(createStatementFrame(node.body))
          phase = 'running'
        } else {
          this.done = true
        }
        return
      }

      phase = 'eval'
    },
    hasTag(label: number): boolean {
      return statementHasLabel(node.body, label)
    },
    gotoTag(label: number, state: State): void {
      pushAndGotoTag(node.body, label, state)
      phase = 'running'
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

      const condition = evalExpr(node.untilCondition, state.currentScope, state)
      const conditionBool = getBoolValue(condition)
      if (conditionBool) {
        this.done = true
      } else {
        phase = 'body'
      }
    },
    hasTag(label: number): boolean {
      return node.statements.some(s => statementHasLabel(s, label))
    },
    gotoTag(label: number, state: State): void {
      const compound: CompoundStatementNode = {
        kind: 'CompoundStatement',
        statements: node.statements,
      }
      const frame = createCompoundFrame(compound)
      if (frame.gotoTag) frame.gotoTag(label, state)
      state.stack.push(frame)
      phase = 'eval'
    },
  }
}

// --- ForFrame ---
export function createForFrame(node: ForStatementNode): Frame {
  let phase: 'init' | 'eval' | 'body' = 'init'
  let finalValue: PascalValue | null = null
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
        const current = state.currentScope.variables.get(varName)
        if (!current || !finalValue) {
          this.done = true
          return
        }

        const currentNum = getNum(current)
        const finalNum = getNum(finalValue)

        let shouldContinue = false
        if (isDownTo) {
          shouldContinue = currentNum > finalNum
        } else {
          shouldContinue = currentNum < finalNum
        }

        if (shouldContinue) {
          const increment = isDownTo ? -1 : 1
          const newValue = makeInteger(currentNum + increment)
          state.currentScope.variables.set(varName, newValue)
          phase = 'body'
          state.stack.push(createStatementFrame(node.body))
          return
        }
      }

      this.done = true
    },
    hasTag(label: number): boolean {
      return statementHasLabel(node.body, label)
    },
    gotoTag(label: number, state: State): void {
      pushAndGotoTag(node.body, label, state)
      phase = 'eval'
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
            const cmp = binaryOp('=', exprValue, labelValue)
            if (getBoolValue(cmp)) {
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
    hasTag(label: number): boolean {
      return node.branches.some(b => statementHasLabel(b.statement, label)) ||
        (node.otherwise ? statementHasLabel(node.otherwise, label) : false)
    },
    gotoTag(label: number, state: State): void {
      for (const b of node.branches) {
        if (statementHasLabel(b.statement, label)) {
          pushAndGotoTag(b.statement, label, state)
          phase = 'done'
          return
        }
      }
      if (node.otherwise && statementHasLabel(node.otherwise, label)) {
        pushAndGotoTag(node.otherwise, label, state)
        phase = 'done'
      }
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
      let foundIdx = -1
      for (let i = state.stack.length - 1; i >= 0; i--) {
        const frame = state.stack[i]
        if (frame.kind === 'Program' || frame.kind === 'Function') {
          if (frame.hasTag && frame.hasTag(labelValue)) {
            foundIdx = i
          }
          break
        }
        if (frame.hasTag && frame.hasTag(labelValue)) {
          foundIdx = i
          break
        }
      }

      if (foundIdx < 0) {
        throw new Error(`GOTO label ${labelValue} not found`)
      }

      while (state.stack.length > foundIdx + 1) {
        state.stack.pop()
      }

      const target = state.stack[foundIdx]
      if (target.gotoTag) {
        target.gotoTag(labelValue, state)
      }

      this.done = true
    },
  }
}

// --- LabeledFrame ---
export function createLabeledFrame(node: LabeledStatementNode): Frame {
  let pushed = false
  return {
    kind: 'Labeled',
    done: false,
    step(state: State) {
      if (!pushed) {
        state.stack.push(createStatementFrame(node.statement))
        pushed = true
        return
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
    hasTag(label: number): boolean {
      return statementHasLabel(node.body, label)
    },
    gotoTag(label: number, state: State): void {
      pushAndGotoTag(node.body, label, state)
      phase = 'done'
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
      assignToLeft(node.left, rightValue, state)
      this.done = true
    },
  }
}

function assignToLeft(left: ExpressionNode, value: PascalValue, state: State): void {
  if (left.kind === 'Identifier') {
    const name = (left as IdentifierNode).name.toUpperCase()
    const scope = state.currentScope

    if (scope.functionDecl && scope.functionDecl.name.name.toUpperCase() === name) {
      state.returnValue = value
      return
    }

    const targetType = lookupVariableType(name, scope)
    const finalValue = targetType ? coerceToType(value, targetType) : value

    const targetScope = findVariableScope(name, scope)
    if (targetScope) {
      targetScope.variables.set(name, finalValue)
    } else {
      scope.variables.set(name, finalValue)
    }
    return
  }

  if (left.kind === 'ArrayAccess') {
    const access = left as ArrayAccessNode
    const arrValue = evalLValueBase(access.array, state.currentScope, state)
    if (arrValue.type.kind !== 'array') {
      throw new Error('Array assignment target is not an array')
    }
    const arr = arrValue.rawValue as PascalArray
    const indices = access.indices.map(idx => getNum(evalExpr(idx, state.currentScope, state)))
    const flatIndex = arrayIndex(arr, indices)
    arr.elements[flatIndex] = coerceToType(value, arr.elementType)
    return
  }

  if (left.kind === 'FieldAccess') {
    const access = left as FieldAccessNode
    const objValue = evalLValueBase(access.object, state.currentScope, state)
    if (objValue.type.kind !== 'record') {
      throw new Error('Field assignment target is not a record')
    }
    const rec = objValue.rawValue as PascalRecord
    const fieldName = access.field.name.toUpperCase()
    const fieldType = (objValue.type as RecordType).fieldTypes.get(fieldName)
    rec.fields.set(fieldName, fieldType ? coerceToType(value, fieldType) : value)
    return
  }

  throw new Error(`Unsupported assignment target: ${left.kind}`)
}

function evalLValueBase(expr: ExpressionNode, scope: Scope, state: State): PascalValue {
  if (expr.kind === 'Identifier') {
    const value = lookupVariable((expr as IdentifierNode).name.toUpperCase(), scope)
    if (!value) {
      throw new Error(`Unknown variable: ${(expr as IdentifierNode).name}`)
    }
    return value
  }
  if (expr.kind === 'FieldAccess') {
    const access = expr as FieldAccessNode
    const objValue = evalLValueBase(access.object, scope, state)
    if (objValue.type.kind !== 'record') {
      throw new Error(`Field access on non-record type ${objValue.type.name}`)
    }
    const rec = objValue.rawValue as PascalRecord
    const fieldName = access.field.name.toUpperCase()
    const value = rec.fields.get(fieldName)
    if (!value) throw new Error(`Unknown field: ${access.field.name}`)
    return value
  }
  if (expr.kind === 'ArrayAccess') {
    const access = expr as ArrayAccessNode
    const arrValue = evalLValueBase(access.array, scope, state)
    if (arrValue.type.kind !== 'array') {
      throw new Error(`Array access on non-array type ${arrValue.type.name}`)
    }
    const arr = arrValue.rawValue as PascalArray
    const indices = access.indices.map(idx => getNum(evalExpr(idx, scope, state)))
    const flatIndex = arrayIndex(arr, indices)
    return arr.elements[flatIndex]
  }
  if (expr.kind === 'ParenthesizedExpression') {
    return evalLValueBase((expr as ParenthesizedExpressionNode).expression, scope, state)
  }
  throw new Error(`Unsupported lvalue base: ${expr.kind}`)
}

function lookupVariable(name: string, scope: Scope): PascalValue | null {
  let s: Scope | null = scope
  while (s) {
    if (s.variables.has(name)) {
      return s.variables.get(name)!
    }
    s = s.parent
  }
  return null
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

    case 'LabeledStatement':
      return createLabeledFrame(stmt as LabeledStatementNode)

    default:
      return { kind: 'Unknown', done: true, step() {} }
  }
}

// ============================================================================
// 标签查找辅助函数
// ============================================================================

function statementHasLabel(stmt: StatementNode, label: number): boolean {
  switch (stmt.kind) {
    case 'LabeledStatement': {
      const ls = stmt as any
      return ls.label.value === label || statementHasLabel(ls.statement, label)
    }
    case 'CompoundStatement':
      return (stmt as any).statements.some((s: StatementNode) => statementHasLabel(s, label))
    case 'IfStatement': {
      const s = stmt as any
      return statementHasLabel(s.thenBranch, label) ||
        (s.elseBranch ? statementHasLabel(s.elseBranch, label) : false)
    }
    case 'WhileStatement':
    case 'ForStatement':
      return statementHasLabel((stmt as any).body, label)
    case 'RepeatStatement':
      return (stmt as any).statements.some((s: StatementNode) => statementHasLabel(s, label))
    case 'CaseStatement': {
      const s = stmt as any
      return s.branches.some((b: any) => statementHasLabel(b.statement, label)) ||
        (s.otherwise ? statementHasLabel(s.otherwise, label) : false)
    }
    case 'WithStatement':
      return statementHasLabel((stmt as any).body, label)
    default:
      return false
  }
}

function pushAndGotoTag(stmt: StatementNode, label: number, state: State): void {
  const frame = createStatementFrame(stmt)
  state.stack.push(frame)
  if (frame.gotoTag) {
    frame.gotoTag(label, state)
  }
}

// --- Helper for creating function call frames ---
export function createFunctionCallFrame(
  decl: ProcedureDeclarationNode | FunctionDeclarationNode,
  args: ExpressionNode[],
  _state: State
): Frame {
  // 参数绑定在 createFunctionFrame 的 init 阶段处理
  return createFunctionFrame(decl, args)
}
