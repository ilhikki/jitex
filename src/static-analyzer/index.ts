// StaticAnalyzer: AST → JsonCode
// 设计原则：理解控制流和作用域，不理解类型语义（委托 TypePlugin）

import type {
  ProgramNode,
  BlockNode,
  StatementNode,
  ExpressionNode,
  VariableDeclarationNode,
  TypeDeclarationNode,
  ConstDeclarationNode,
  ProcedureDeclarationNode,
  FunctionDeclarationNode,
  IdentifierNode,
  IntegerLiteralNode,
  RealLiteralNode,
  BooleanLiteralNode,
  StringLiteralNode,
  CharLiteralNode,
  BinaryExpressionNode,
  UnaryExpressionNode,
  AssignmentNode,
  IfStatementNode,
  WhileStatementNode,
  ForStatementNode,
  RepeatStatementNode,
  CompoundStatementNode,
  ProcedureCallNode,
  FunctionCallNode,
  ParenthesizedExpressionNode,
  ArrayAccessNode,
  FieldAccessNode,
  GotoStatementNode,
  LabeledStatementNode,
  TypeNode,
  SimpleTypeNode,
  RangeTypeNode,
  ArrayTypeNode,
  RecordTypeNode,
  EnumerationTypeNode,
  ParameterDeclarationNode,
} from '../ast/types'
import type {
  JsonCode,
  JsonInstruction,
  ProcDef,
  VarDecl,
  ParamDef,
  TypeDef,
  Ref,
  SourcePos,
  ArrayType,
} from '../vm/jsoncode'
import type { TypePlugin, TypeTable, CodeGenContext } from '../types'
import { createTypeTable, createCodeGenContext } from '../types'
import { INTEGER_TYPE } from '../types/integer.plugin'
import { BOOLEAN_TYPE as BOOL_TYPE } from '../types/boolean.plugin'
import { STRING_TYPE } from '../types/string.plugin'
import { CHAR_TYPE } from '../types/char.plugin'

// ============================================================================
// 符号表
// ============================================================================

interface VarSymbol {
  name: string
  typeId: string
  ref: Ref
  isVar?: boolean
  declaredLevel: number // 变量声明时的作用域层级
}

interface ProcSymbol {
  name: string
  params: ParamDef[]
  returnType?: string
}

interface Scope {
  kind: 'global' | 'local' | 'with'
  vars: Map<string, VarSymbol>
  types: Map<string, string> // name → typeId
  procs: Map<string, ProcSymbol>
  parent: Scope | null
  level: number // 0=全局, 1=main, 2=嵌套在main中, ...
}

interface ProcInfo {
  name: string
  node: ProcedureDeclarationNode | FunctionDeclarationNode
  parentScope: Scope
  level: number
  isFunc: boolean
}

function createScope(kind: 'global' | 'local' | 'with', parent: Scope | null = null): Scope {
  const level = kind === 'global' ? 0 : parent ? parent.level + 1 : 1
  return {
    kind,
    vars: new Map(),
    types: new Map(),
    procs: new Map(),
    parent,
    level,
  }
}

function lookupVar(scope: Scope, name: string, currentScope?: Scope): VarSymbol | null {
  const upper = name.toUpperCase()
  let s: Scope | null = scope
  while (s) {
    const v = s.vars.get(upper)
    if (v) {
      if (currentScope && v.ref.kind === 'local') {
        const upLevel = currentScope.level - v.declaredLevel
        if (upLevel > 0) {
          return { ...v, ref: { ...v.ref, upLevel } }
        }
      }
      return v
    }
    s = s.parent
  }
  return null
}

function lookupType(scope: Scope, name: string): string | null {
  const upper = name.toUpperCase()
  let s: Scope | null = scope
  while (s) {
    const t = s.types.get(upper)
    if (t) return t
    s = s.parent
  }
  return null
}

function lookupProc(scope: Scope, name: string): ProcSymbol | null {
  const upper = name.toUpperCase()
  let s: Scope | null = scope
  while (s) {
    const p = s.procs.get(upper)
    if (p) return p
    s = s.parent
  }
  return null
}

// ============================================================================
// Analyzer
// ============================================================================

export class StaticAnalyzer {
  private typeTable: TypeTable
  private scope: Scope
  private instructions: JsonInstruction[] = []
  private tempCount = 0
  private labelCount = 0
  private maxTemps = 0

  constructor(plugins: TypePlugin[]) {
    this.typeTable = createTypeTable()
    this.typeTable.register(INTEGER_TYPE)
    this.typeTable.register(BOOL_TYPE)
    this.typeTable.register(STRING_TYPE)
    this.typeTable.register(CHAR_TYPE)
    for (const plugin of plugins) {
      for (const t of plugin.types) {
        if (!this.typeTable.has(t.id)) {
          this.typeTable.register(t)
        }
      }
    }
    this.scope = createScope('global')
  }

  getTypeTable(): TypeTable {
    return this.typeTable
  }

  // ===========================================================================
  // 主入口
  // ===========================================================================

  analyze(program: ProgramNode): JsonCode {
    // 处理全局声明
    this.processBlock(program.block, this.scope)

    // 收集全局变量
    const globals: VarDecl[] = []
    for (const [name, sym] of this.scope.vars) {
      globals.push({ name, typeId: sym.typeId })
    }

    // 第一阶段：收集所有过程信息（栈遍历，建立作用域链）
    const procInfos = this.collectProcedures(program)

    // 第二阶段：编译过程体
    const procedures = this.compileProcedures(procInfos)

    // 编译 main 过程
    const mainBody = this.instructions
    const mainProc: ProcDef = {
      name: 'MAIN',
      params: [],
      locals: globals,
      maxTemps: this.maxTemps,
      body: mainBody,
    }
    procedures.push(mainProc)

    return {
      version: '1.0.0',
      typeTable: this.typeTable.all(),
      globals: [],
      procedures,
      entry: 'MAIN',
      sourceFile: program.name?.name,
    }
  }

  private collectProcedures(program: ProgramNode): ProcInfo[] {
    const procInfos: ProcInfo[] = []

    const stack: { node: any; parentScope: Scope; level: number }[] = []

    for (const proc of program.block.procedureDeclarations) {
      stack.push({ node: proc, parentScope: this.scope, level: 1 })
    }
    for (const func of program.block.functionDeclarations) {
      stack.push({ node: func, parentScope: this.scope, level: 1 })
    }

    while (stack.length > 0) {
      const { node, parentScope, level } = stack.pop()!
      const isFunc = node.kind === 'FunctionDeclaration'
      const name = node.name.name.toUpperCase()

      const localScope = createScope('local', parentScope)

      for (const p of node.parameters) {
        const typeDef = this.resolveType(p.type, localScope)
        if (!this.typeTable.has(typeDef.id)) {
          this.typeTable.register(typeDef)
        }
        for (const nameNode of p.names) {
          const paramName = nameNode.name.toUpperCase()
          localScope.vars.set(paramName, {
            name: paramName,
            typeId: typeDef.id,
            ref: { kind: 'local', name: paramName },
            isVar: p.isVar,
            declaredLevel: level,
          })
        }
      }

      if (isFunc) {
        const funcNode = node as FunctionDeclarationNode
        if (funcNode.returnType) {
          const typeDef = this.resolveType(funcNode.returnType, localScope)
          localScope.vars.set(name, {
            name,
            typeId: typeDef.id,
            ref: { kind: 'local', name },
            declaredLevel: level,
          })
        }
        this.registerFunction(node, parentScope)
      } else {
        this.registerProcedure(node, parentScope)
      }

      if (node.block) {
        for (const c of node.block.constDeclarations) {
          const constName = c.name.name.toUpperCase()
          localScope.vars.set(constName, {
            name: constName,
            typeId: 'integer',
            ref: { kind: 'local', name: constName },
            declaredLevel: level,
          })
        }
        for (const t of node.block.typeDeclarations) {
          this.processTypeDecl(t, localScope)
        }
        for (const v of node.block.variableDeclarations) {
          this.processVarDecl(v, localScope)
        }

        for (const nestedProc of node.block.procedureDeclarations) {
          this.registerProcedure(nestedProc, localScope)
          stack.push({ node: nestedProc, parentScope: localScope, level: level + 1 })
        }
        for (const nestedFunc of node.block.functionDeclarations) {
          this.registerFunction(nestedFunc, localScope)
          stack.push({ node: nestedFunc, parentScope: localScope, level: level + 1 })
        }
      }

      procInfos.push({
        name,
        node,
        parentScope: localScope,
        level,
        isFunc,
      })
    }

    return procInfos
  }

  private compileProcedures(procInfos: ProcInfo[]): ProcDef[] {
    const result: ProcDef[] = []

    for (const info of procInfos) {
      const savedInstructions = this.instructions
      const savedTempCount = this.tempCount
      const savedMaxTemps = this.maxTemps
      this.instructions = []
      this.tempCount = 0
      this.maxTemps = 0

      const localScope = info.parentScope

      const params: ParamDef[] = []
      for (const p of info.node.parameters) {
        const typeDef = this.resolveType(p.type, localScope)
        for (const nameNode of p.names) {
          const paramName = nameNode.name.toUpperCase()
          params.push({
            name: paramName,
            typeId: typeDef.id,
            isVar: p.isVar,
          })
        }
      }

      let returnType: string | undefined
      if (info.isFunc) {
        const funcNode = info.node as FunctionDeclarationNode
        if (funcNode.returnType) {
          const typeDef = this.resolveType(funcNode.returnType, localScope)
          returnType = typeDef.id
        }
      }

      if (info.node.block) {
        for (const c of info.node.block.constDeclarations) {
          const constName = c.name.name.toUpperCase()
          const constResult = this.compileExpr(c.value, localScope)
          this.instructions.push({
            op: 'DECLARE',
            scope: 'local',
            name: constName,
            typeId: constResult.typeId,
          })
          this.instructions.push({
            op: 'TYPE_OP',
            typeId: constResult.typeId,
            opName: 'assign',
            opKind: 'assign',
            dest: { kind: 'local', name: constName },
            src: [constResult.ref],
          })
        }

        for (const v of info.node.block.variableDeclarations) {
          this.processVarDecl(v, localScope)
        }

        this.compileCompound(info.node.block.compound, localScope)
      }

      if (info.isFunc && returnType) {
        this.instructions.push({
          op: 'RET',
          value: { kind: 'local', name: info.name },
        })
      } else {
        this.instructions.push({ op: 'RET' })
      }

      const locals: VarDecl[] = []
      for (const [n, sym] of localScope.vars) {
        if (!params.find((p) => p.name === n)) {
          locals.push({ name: n, typeId: sym.typeId })
        }
      }

      const body = this.instructions
      this.instructions = savedInstructions
      this.tempCount = savedTempCount
      this.maxTemps = savedMaxTemps

      result.push({
        name: info.name,
        params,
        returnType,
        locals,
        maxTemps: this.maxTemps,
        body,
        level: info.level,
      })
    }

    return result
  }

  // ===========================================================================
  // 块处理
  // ===========================================================================

  private processBlock(block: BlockNode, scope: Scope): void {
    // 1. 处理 const 声明（注册为变量）
    for (const c of block.constDeclarations) {
      this.processConst(c, scope)
    }

    // 2. 处理 type 声明
    for (const t of block.typeDeclarations) {
      this.processTypeDecl(t, scope)
    }

    // 3. 处理 var 声明
    for (const v of block.variableDeclarations) {
      this.processVarDecl(v, scope)
    }

    // 4. 注册过程/函数
    for (const p of block.procedureDeclarations) {
      this.registerProcedure(p, scope)
    }
    for (const f of block.functionDeclarations) {
      this.registerFunction(f, scope)
    }

    // 5. 编译复合语句
    this.compileCompound(block.compound, scope)
  }

  private processConst(c: ConstDeclarationNode, scope: Scope): void {
    const name = c.name.name.toUpperCase()
    // 编译常量值
    const result = this.compileExpr(c.value, scope)
    // 常量作为全局变量（在 main 中）
    scope.vars.set(name, {
      name,
      typeId: result.typeId,
      ref: { kind: scope.kind === 'global' ? 'global' : 'local', name },
      declaredLevel: scope.level,
    })
    // 生成 DECLARE + 赋值
    this.instructions.push({
      op: 'DECLARE',
      scope: scope.kind === 'global' ? 'global' : 'local',
      name,
      typeId: result.typeId,
    })
    this.instructions.push({
      op: 'TYPE_OP',
      typeId: result.typeId,
      opName: 'assign',
      opKind: 'assign',
      dest: scope.kind === 'global' ? { kind: 'global', name } : { kind: 'local', name },
      src: [result.ref],
    })
  }

  private processTypeDecl(t: TypeDeclarationNode, scope: Scope): void {
    const name = t.name.name.toUpperCase()
    const typeDef = this.resolveType(t.typeDef, scope)
    this.typeTable.register(typeDef)
    scope.types.set(name, typeDef.id)
    
    if (typeDef.kind === 'enum') {
      const enumType = typeDef as any
      for (let i = 0; i < enumType.values.length; i++) {
        const enumValName = enumType.values[i]
        const ref: Ref = scope.kind === 'global' ? { kind: 'global', name: enumValName } : { kind: 'local', name: enumValName }
        scope.vars.set(enumValName, {
          name: enumValName,
          typeId: typeDef.id,
          ref,
          declaredLevel: scope.level,
        })
      }
    }
  }

  private processVarDecl(v: VariableDeclarationNode, scope: Scope): void {
    const typeDef = this.resolveType(v.type, scope)
    if (!this.typeTable.has(typeDef.id)) {
      this.typeTable.register(typeDef)
    }
    for (const nameNode of v.names) {
      const name = nameNode.name.toUpperCase()
      const ref: Ref = scope.kind === 'global' ? { kind: 'global', name } : { kind: 'local', name }
      scope.vars.set(name, { name, typeId: typeDef.id, ref, declaredLevel: scope.level })
      this.instructions.push({
        op: 'DECLARE',
        scope: scope.kind === 'global' ? 'global' : 'local',
        name,
        typeId: typeDef.id,
      })
    }
  }

  private registerProcedure(p: ProcedureDeclarationNode, scope: Scope): void {
    const name = p.name.name.toUpperCase()
    const params = this.compileParams(p.parameters, scope)
    scope.procs.set(name, { name, params })
  }

  private registerFunction(f: FunctionDeclarationNode, scope: Scope): void {
    const name = f.name.name.toUpperCase()
    const params = this.compileParams(f.parameters, scope)
    let returnType: string | undefined
    if (f.returnType) {
      const typeDef = this.resolveType(f.returnType, scope)
      returnType = typeDef.id
    }
    scope.procs.set(name, { name, params, returnType })
  }

  private compileParams(params: ParameterDeclarationNode[], scope: Scope): ParamDef[] {
    const result: ParamDef[] = []
    for (const p of params) {
      const typeDef = this.resolveType(p.type, scope)
      if (!this.typeTable.has(typeDef.id)) {
        this.typeTable.register(typeDef)
      }
      for (const nameNode of p.names) {
        result.push({
          name: nameNode.name.toUpperCase(),
          typeId: typeDef.id,
          isVar: p.isVar,
        })
      }
    }
    return result
  }

  private lookupEnumValue(scope: Scope, name: string): { typeId: string; value: number } | null {
    let s: Scope | null = scope
    while (s) {
      for (const [, typeId] of s.types) {
        const typeDef = this.typeTable.get(typeId)
        if (typeDef && typeDef.kind === 'enum') {
          const enumType = typeDef as any
          const idx = enumType.values.indexOf(name)
          if (idx >= 0) {
            return { typeId, value: idx }
          }
        }
      }
      s = s.parent
    }
    return null
  }

  // ===========================================================================
  // 类型解析
  // ===========================================================================

  private resolveType(typeNode: TypeNode, scope: Scope): TypeDef {
    switch (typeNode.kind) {
      case 'SimpleType': {
        const name = (typeNode as SimpleTypeNode).name.name.toUpperCase()
        // 内置类型用小写注册，先尝试小写查找
        const builtin = this.typeTable.get(name.toLowerCase()) || this.typeTable.get(name)
        if (builtin) return builtin
        // 查用户类型
        const typeId = lookupType(scope, name)
        if (typeId) {
          const def = this.typeTable.get(typeId)
          if (def) return def
        }
        throw new Error(`Undefined type: ${name}`)
      }

      case 'RangeType': {
        const range = typeNode as RangeTypeNode
        const min = this.evaluateConstExpr(range.start, scope)
        const max = this.evaluateConstExpr(range.end, scope)
        const id = `subrange-${min}-${max}-of-integer`
        return {
          id,
          kind: 'subrange',
          baseTypeId: 'integer',
          min,
          max,
        }
      }

      case 'ArrayType': {
        const arr = typeNode as ArrayTypeNode
        const elementType = this.resolveType(arr.elementType, scope)
        if (!this.typeTable.has(elementType.id)) {
          this.typeTable.register(elementType)
        }
        const dimensions = arr.indexTypes.map((idx) => {
          if (idx.kind === 'RangeType') {
            const r = idx as RangeTypeNode
            const low = this.evaluateConstExpr(r.start, scope)
            const high = this.evaluateConstExpr(r.end, scope)
            return { low, high, indexTypeId: 'integer' }
          }
          // 简单类型作为索引
          const idxType = this.resolveType(idx, scope)
          if (idxType.kind === 'subrange') {
            const sub = idxType as any
            return { low: sub.min, high: sub.max, indexTypeId: idxType.id }
          }
          return { low: 0, high: 0, indexTypeId: idxType.id }
        })
        const id = `array-${dimensions.map((d) => `${d.low}..${d.high}`).join(',')}-of-${elementType.id}`
        return {
          id,
          kind: 'array',
          elementTypeId: elementType.id,
          dimensions,
          isPacked: false,
        }
      }

      case 'RecordType': {
        const rec = typeNode as RecordTypeNode
        const fields: { name: string; typeId: string; offset: number }[] = []
        let offset = 0
        for (const fieldDecl of rec.fields) {
          const fieldType = this.resolveType(fieldDecl.type, scope)
          if (!this.typeTable.has(fieldType.id)) {
            this.typeTable.register(fieldType)
          }
          for (const nameNode of fieldDecl.names) {
            fields.push({
              name: nameNode.name.toUpperCase(),
              typeId: fieldType.id,
              offset,
            })
            offset++
          }
        }
        const id = `record-${fields.map((f) => f.name).join(',')}`
        return {
          id,
          kind: 'record',
          fields,
        }
      }

      case 'EnumerationType': {
        const enumType = typeNode as EnumerationTypeNode
        const values = enumType.values.map((v) => v.name.toUpperCase())
        const id = `enum-${values.join(',')}`
        return {
          id,
          kind: 'enum',
          values,
        }
      }

      default:
        throw new Error(`Unsupported type kind: ${typeNode.kind}`)
    }
  }

  // ===========================================================================
  // 常量表达式求值
  // ===========================================================================

  private evaluateConstExpr(expr: ExpressionNode, scope: Scope): number {
    switch (expr.kind) {
      case 'IntegerLiteral':
        return (expr as IntegerLiteralNode).value
      case 'RealLiteral':
        return (expr as RealLiteralNode).value
      case 'BooleanLiteral':
        return (expr as BooleanLiteralNode).value ? 1 : 0
      case 'CharLiteral':
        return (expr as any).charCodeAt(0)
      case 'Identifier': {
        const name = (expr as IdentifierNode).name.toUpperCase()
        const sym = lookupVar(scope, name, scope)
        if (sym) {
          // 需要获取常量值
          // 这里简化：假设常量值已存储在变量中
          // 实际上，常量在编译时应该求值
          // 暂时返回 0，后续改进
          return 0
        }
        throw new Error(`Unknown constant: ${name}`)
      }
      case 'BinaryExpression': {
        const bin = expr as BinaryExpressionNode
        const left = this.evaluateConstExpr(bin.left, scope)
        const right = this.evaluateConstExpr(bin.right, scope)
        switch (bin.operator.toUpperCase()) {
          case '+':
            return left + right
          case '-':
            return left - right
          case '*':
            return left * right
          case 'DIV':
            return Math.trunc(left / right)
          case 'MOD':
            return left - Math.trunc(left / right) * right
          default:
            throw new Error(`Unsupported const operator: ${bin.operator}`)
        }
      }
      case 'UnaryExpression': {
        const unary = expr as UnaryExpressionNode
        const val = this.evaluateConstExpr(unary.operand, scope)
        switch (unary.operator.toUpperCase()) {
          case '+':
            return val
          case '-':
            return -val
          default:
            throw new Error(`Unsupported const unary: ${unary.operator}`)
        }
      }
      default:
        throw new Error(`Unsupported constant expression: ${expr.kind}`)
    }
  }

  // ===========================================================================
  // 语句编译
  // ===========================================================================

  private compileCompound(compound: CompoundStatementNode, scope: Scope): void {
    for (const stmt of compound.statements) {
      this.compileStmt(stmt, scope)
    }
  }

  private compileStmt(stmt: StatementNode, scope: Scope): void {
    switch (stmt.kind) {
      case 'Assignment':
        this.compileAssignment(stmt as AssignmentNode, scope)
        break
      case 'CompoundStatement':
        this.compileCompound(stmt as CompoundStatementNode, scope)
        break
      case 'IfStatement':
        this.compileIf(stmt as IfStatementNode, scope)
        break
      case 'WhileStatement':
        this.compileWhile(stmt as WhileStatementNode, scope)
        break
      case 'ForStatement':
        this.compileFor(stmt as ForStatementNode, scope)
        break
      case 'RepeatStatement':
        this.compileRepeat(stmt as RepeatStatementNode, scope)
        break
      case 'ProcedureCall':
        this.compileProcCall(stmt as ProcedureCallNode, scope)
        break
      case 'EmptyStatement':
        break
      case 'LabeledStatement':
        this.compileLabeledStatement(stmt as LabeledStatementNode, scope)
        break
      case 'GotoStatement':
        this.compileGoto(stmt as GotoStatementNode, scope)
        break
      default:
        throw new Error(`Unsupported statement: ${stmt.kind}`)
    }
  }

  private compileAssignment(node: AssignmentNode, scope: Scope): void {
    const rightResult = this.compileExpr(node.right, scope)
    const leftNode = node.left

    if (leftNode.kind === 'Identifier') {
      const name = (leftNode as IdentifierNode).name.toUpperCase()
      const sym = lookupVar(scope, name)
      if (!sym) {
        throw new Error(`Unknown variable: ${name}`)
      }
      this.instructions.push({
        op: 'TYPE_OP',
        typeId: sym.typeId,
        opName: 'assign',
        opKind: 'assign',
        dest: sym.ref,
        src: [rightResult.ref],
      })
    } else if (leftNode.kind === 'ArrayAccess') {
      const arrAccess = leftNode as ArrayAccessNode
      const arr = this.compileExpr(arrAccess.array, scope)
      const arrType = this.typeTable.get(arr.typeId)
      if (!arrType || arrType.kind !== 'array') {
        throw new Error(`Type ${arr.typeId} is not an array`)
      }
      const indexRefs: Ref[] = []
      for (const idxExpr of arrAccess.indices) {
        const idxResult = this.compileExpr(idxExpr, scope)
        indexRefs.push(idxResult.ref)
      }
      this.instructions.push({
        op: 'TYPE_OP',
        typeId: arr.typeId,
        opName: 'SET_INDEX',
        opKind: 'setIndex',
        dest: arr.ref,
        src: [...indexRefs, rightResult.ref],
      })
    } else if (leftNode.kind === 'FieldAccess') {
      const fieldAccess = leftNode as FieldAccessNode
      const obj = this.compileExpr(fieldAccess.object, scope)
      const fieldName = fieldAccess.field.name.toUpperCase()
      const objType = this.typeTable.get(obj.typeId)
      if (!objType || objType.kind !== 'record') {
        throw new Error(`Type ${obj.typeId} is not a record`)
      }
      this.instructions.push({
        op: 'TYPE_OP',
        typeId: obj.typeId,
        opName: 'setField',
        opKind: 'setField',
        dest: obj.ref,
        src: [rightResult.ref],
        extra: { field: fieldName },
      })
    } else {
      throw new Error(`Unsupported assignment target: ${leftNode.kind}`)
    }
  }

  private compileIf(node: IfStatementNode, scope: Scope): void {
    const condResult = this.compileExpr(node.condition, scope)
    const elseLabel = this.tempLabel('else')
    const endLabel = this.tempLabel('endif')

    this.instructions.push({
      op: 'JMP_IF_FALSE',
      cond: condResult.ref,
      target: node.elseBranch ? elseLabel : endLabel,
    })

    this.compileStmt(node.thenBranch, scope)

    if (node.elseBranch) {
      this.instructions.push({ op: 'JMP', target: endLabel })
      this.instructions.push({ op: 'LABEL', label: elseLabel })
      this.compileStmt(node.elseBranch, scope)
    }

    this.instructions.push({ op: 'LABEL', label: endLabel })
  }

  private compileWhile(node: WhileStatementNode, scope: Scope): void {
    const startLabel = this.tempLabel('while_start')
    const endLabel = this.tempLabel('while_end')

    this.instructions.push({ op: 'LABEL', label: startLabel })

    const condResult = this.compileExpr(node.condition, scope)
    this.instructions.push({
      op: 'JMP_IF_FALSE',
      cond: condResult.ref,
      target: endLabel,
    })

    this.compileStmt(node.body, scope)

    this.instructions.push({ op: 'JMP', target: startLabel })
    this.instructions.push({ op: 'LABEL', label: endLabel })
  }

  private compileFor(node: ForStatementNode, scope: Scope): void {
    const startLabel = this.tempLabel('for_start')
    const endLabel = this.tempLabel('for_end')
    const isDownto = node.direction === 'DOWNTO'

    // 编译初始值和终值
    const startResult = this.compileExpr(node.initial, scope)
    const endResult = this.compileExpr(node.final, scope)

    // 获取循环变量
    if (node.variable.kind !== 'Identifier') {
      throw new Error('For loop variable must be identifier')
    }
    const varName = (node.variable as IdentifierNode).name.toUpperCase()
    const sym = lookupVar(scope, varName)
    if (!sym) {
      throw new Error(`Unknown variable: ${varName}`)
    }

    // 赋初值
    this.instructions.push({
      op: 'TYPE_OP',
      typeId: sym.typeId,
      opName: 'assign',
      opKind: 'assign',
      dest: sym.ref,
      src: [startResult.ref],
    })

    this.instructions.push({ op: 'LABEL', label: startLabel })

    // 比较循环变量和终值（TO 用 <=，DOWNTO 用 >=）
    const compareResult = this.tempVar()
    this.instructions.push({
      op: 'TYPE_OP',
      typeId: sym.typeId,
      opName: 'EQ',
      opKind: 'compare',
      dest: compareResult,
      src: [sym.ref, endResult.ref],
      extra: { op: isDownto ? '>=' : '<=' },
    })

    this.instructions.push({
      op: 'JMP_IF_FALSE',
      cond: compareResult,
      target: endLabel,
    })

    // 循环体
    this.compileStmt(node.body, scope)

    // 递增/递减循环变量
    const oneTemp = this.tempVar()
    this.instructions.push({
      op: 'LITERAL',
      dest: oneTemp,
      typeId: 'integer',
      value: 1,
    })
    const incTemp = this.tempVar()
    this.instructions.push({
      op: 'TYPE_OP',
      typeId: sym.typeId,
      opName: isDownto ? 'SUB' : 'ADD',
      opKind: 'binary',
      dest: incTemp,
      src: [sym.ref, oneTemp],
    })
    this.instructions.push({
      op: 'TYPE_OP',
      typeId: sym.typeId,
      opName: 'assign',
      opKind: 'assign',
      dest: sym.ref,
      src: [incTemp],
    })

    this.instructions.push({ op: 'JMP', target: startLabel })
    this.instructions.push({ op: 'LABEL', label: endLabel })
  }

  private compileRepeat(node: RepeatStatementNode, scope: Scope): void {
    const startLabel = this.tempLabel('repeat_start')

    this.instructions.push({ op: 'LABEL', label: startLabel })

    for (const stmt of node.statements) {
      this.compileStmt(stmt, scope)
    }

    const condResult = this.compileExpr(node.untilCondition, scope)
    this.instructions.push({
      op: 'JMP_IF_FALSE',
      cond: condResult.ref,
      target: startLabel,
    })
  }

  private compileLabeledStatement(node: LabeledStatementNode, scope: Scope): void {
    const label = `label_${node.label.value}`
    this.instructions.push({ op: 'LABEL', label })
    this.compileStmt(node.statement, scope)
  }

  private compileGoto(node: GotoStatementNode, scope: Scope): void {
    const label = `label_${node.label.value}`
    this.instructions.push({ op: 'JMP', target: label })
  }

  private compileProcCall(node: ProcedureCallNode, scope: Scope): void {
    const name = node.name.name.toUpperCase()

    // 检查是否是系统调用
    const sysCallNames = ['WRITE', 'WRITELN', 'READ', 'READLN']
    if (sysCallNames.includes(name)) {
      const argRefs: Ref[] = []
      for (const arg of node.arguments) {
        const result = this.compileExpr(arg, scope)
        argRefs.push(result.ref)
      }
      this.instructions.push({
        op: 'SYS_CALL',
        proc: name,
        args: argRefs,
      })
      return
    }

    // 用户定义的过程
    const sym = lookupProc(scope, name)
    if (!sym) {
      throw new Error(`Unknown procedure: ${name}`)
    }

    const argRefs: Ref[] = []
    for (const arg of node.arguments) {
      const result = this.compileExpr(arg, scope)
      argRefs.push(result.ref)
    }

    this.instructions.push({
      op: 'CALL',
      proc: name,
      args: argRefs,
    })
  }

  // ===========================================================================
  // 表达式编译
  // ===========================================================================

  private compileExpr(node: ExpressionNode, scope: Scope): { ref: Ref; typeId: string } {
    switch (node.kind) {
      case 'IntegerLiteral': {
        const temp = this.tempVar()
        this.instructions.push({
          op: 'LITERAL',
          dest: temp,
          typeId: 'integer',
          value: (node as IntegerLiteralNode).value,
        })
        return { ref: temp, typeId: 'integer' }
      }

      case 'RealLiteral': {
        const temp = this.tempVar()
        this.instructions.push({
          op: 'LITERAL',
          dest: temp,
          typeId: 'real',
          value: (node as RealLiteralNode).value,
        })
        return { ref: temp, typeId: 'real' }
      }

      case 'BooleanLiteral': {
        const temp = this.tempVar()
        this.instructions.push({
          op: 'LITERAL',
          dest: temp,
          typeId: 'boolean',
          value: (node as BooleanLiteralNode).value,
        })
        return { ref: temp, typeId: 'boolean' }
      }

      case 'StringLiteral': {
        const temp = this.tempVar()
        this.instructions.push({
          op: 'LITERAL',
          dest: temp,
          typeId: 'string',
          value: (node as StringLiteralNode).value,
        })
        return { ref: temp, typeId: 'string' }
      }

      case 'CharLiteral': {
        const temp = this.tempVar()
        this.instructions.push({
          op: 'LITERAL',
          dest: temp,
          typeId: 'char',
          value: (node as CharLiteralNode).value,
        })
        return { ref: temp, typeId: 'char' }
      }

      case 'Identifier': {
        const name = (node as IdentifierNode).name.toUpperCase()
        const procSym = lookupProc(scope, name)
        if (procSym && procSym.returnType) {
          const temp = this.tempVar()
          this.instructions.push({
            op: 'CALL',
            proc: name,
            args: [],
            dest: temp,
          })
          return { ref: temp, typeId: procSym.returnType }
        }
        const enumVal = this.lookupEnumValue(scope, name)
        if (enumVal !== null) {
          const temp = this.tempVar()
          this.instructions.push({
            op: 'LITERAL',
            dest: temp,
            typeId: enumVal.typeId,
            value: enumVal.value,
          })
          return { ref: temp, typeId: enumVal.typeId }
        }
        const sym = lookupVar(scope, name, scope)
        if (!sym) {
          throw new Error(`Unknown variable: ${name}`)
        }
        return { ref: sym.ref, typeId: sym.typeId }
      }

      case 'BinaryExpression': {
        const bin = node as BinaryExpressionNode
        const left = this.compileExpr(bin.left, scope)
        const right = this.compileExpr(bin.right, scope)
        const op = bin.operator.toUpperCase()

        // 查找比较运算符
        const compareOps = ['=', '<>', '<', '<=', '>', '>=']
        if (compareOps.includes(op)) {
          const temp = this.tempVar()
          this.instructions.push({
            op: 'TYPE_OP',
            typeId: left.typeId,
            opName: 'EQ',
            opKind: 'compare',
            dest: temp,
            src: [left.ref, right.ref],
            extra: { op: bin.operator },
          })
          return { ref: temp, typeId: 'boolean' }
        }

        // 查找二元运算符
        const opName = this.opToName(op)
        const temp = this.tempVar()
        this.instructions.push({
          op: 'TYPE_OP',
          typeId: left.typeId,
          opName,
          opKind: 'binary',
          dest: temp,
          src: [left.ref, right.ref],
        })
        return { ref: temp, typeId: left.typeId }
      }

      case 'UnaryExpression': {
        const unary = node as UnaryExpressionNode
        const operand = this.compileExpr(unary.operand, scope)
        const op = unary.operator.toUpperCase()
        const opName = op === '-' ? 'NEG' : op === 'NOT' ? 'NOT' : 'POS'
        const temp = this.tempVar()
        this.instructions.push({
          op: 'TYPE_OP',
          typeId: operand.typeId,
          opName,
          opKind: 'unary',
          dest: temp,
          src: [operand.ref],
        })
        return { ref: temp, typeId: operand.typeId }
      }

      case 'FunctionCall': {
        // 函数调用
        const callNode = node as FunctionCallNode
        const name = callNode.name.name.toUpperCase()
        const sym = lookupProc(scope, name)
        if (!sym || !sym.returnType) {
          throw new Error(`Unknown function: ${name}`)
        }

        const argRefs: Ref[] = []
        for (const arg of callNode.arguments) {
          const result = this.compileExpr(arg, scope)
          argRefs.push(result.ref)
        }

        const temp = this.tempVar()
        this.instructions.push({
          op: 'CALL',
          proc: name,
          args: argRefs,
          dest: temp,
        })
        return { ref: temp, typeId: sym.returnType }
      }

      case 'ParenthesizedExpression': {
        const paren = node as ParenthesizedExpressionNode
        return this.compileExpr(paren.expression, scope)
      }

      case 'ArrayAccess': {
        const arrAccess = node as ArrayAccessNode
        const arr = this.compileExpr(arrAccess.array, scope)
        const arrType = this.typeTable.get(arr.typeId)
        if (!arrType || arrType.kind !== 'array') {
          throw new Error(`Type ${arr.typeId} is not an array`)
        }
        const indexResults: { ref: Ref; typeId: string }[] = []
        for (const idxExpr of arrAccess.indices) {
          indexResults.push(this.compileExpr(idxExpr, scope))
        }
        const temp = this.tempVar()
        const indexRefs = indexResults.map((r) => r.ref)
        this.instructions.push({
          op: 'TYPE_OP',
          typeId: arr.typeId,
          opName: 'INDEX',
          opKind: 'index',
          dest: temp,
          src: [arr.ref, ...indexRefs],
        })
        return { ref: temp, typeId: (arrType as ArrayType).elementTypeId }
      }

      case 'FieldAccess': {
        const fieldAccess = node as FieldAccessNode
        const obj = this.compileExpr(fieldAccess.object, scope)
        const fieldName = fieldAccess.field.name.toUpperCase()
        const objType = this.typeTable.get(obj.typeId)
        if (!objType || objType.kind !== 'record') {
          throw new Error(`Type ${obj.typeId} is not a record`)
        }
        const recType = objType as any
        const field = recType.fields.find((f: any) => f.name === fieldName)
        if (!field) {
          throw new Error(`Unknown field: ${fieldName}`)
        }
        const temp = this.tempVar()
        this.instructions.push({
          op: 'TYPE_OP',
          typeId: obj.typeId,
          opName: 'field',
          opKind: 'field',
          dest: temp,
          src: [obj.ref],
          extra: { field: fieldName },
        })
        return { ref: temp, typeId: field.typeId }
      }

      default:
        throw new Error(`Unsupported expression: ${node.kind}`)
    }
  }

  private opToName(op: string): string {
    switch (op) {
      case '+':
        return 'ADD'
      case '-':
        return 'SUB'
      case '*':
        return 'MUL'
      case '/':
        return 'DIV'
      case 'DIV':
        return 'DIV'
      case 'MOD':
        return 'MOD'
      case 'AND':
        return 'AND'
      case 'OR':
        return 'OR'
      default:
        return op
    }
  }

  // ===========================================================================
  // 临时变量和标签生成
  // ===========================================================================

  private tempVar(): Ref {
    const index = this.tempCount++
    if (this.tempCount > this.maxTemps) {
      this.maxTemps = this.tempCount
    }
    return { kind: 'temp', index }
  }

  private tempLabel(prefix: string): string {
    return `_${prefix}_${this.labelCount++}`
  }
}
