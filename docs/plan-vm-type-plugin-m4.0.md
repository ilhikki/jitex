# Pascal VM 实现规划（TypePlugin 模型）— M4.0 归档

> **阶段**：M4.0 — VM + TypePlugin 模型实现
> **状态**：✅ 已完成（归档）
> **后续阶段**：M4.1 — Pascal82 规范一致性测试与修复（见 [plan-m4.1-pascal82-conformance.md](./plan-m4.1-pascal82-conformance.md)）

## 一、总览

### 核心理念

**类型无关的虚拟机**：VM 不理解任何 Pascal 类型，只理解控制流、变量存取、和类型操作的分派。所有类型语义通过 **TypePlugin** 插件系统完成。

```
源码 → Lexer → Parser（带位置）→ AST（带位置）→ StaticAnalyzer → JsonCode → VM → 结果
                             ↑                         ↑               ↑
                             │                         │               │
                          未冻结                    TypePlugin     TypePlugin
                          （需加位置）              （静态分析用）  （运行时执行用）
```

### 关键修正（v2）

1. **类型定义是对象，不是接口**：`TypeDef` 包含属性和操作，操作是 `{ can, toCode, invoke }` 三元组
2. **Ref 语义化引用**：区分全局引用、局部引用、临时槽位引用
3. **临时变量用栈**：临时槽位数组 + 栈指针，支持退栈（循环中重复使用）
4. **Parser 不冻结**：需要添加 token 位置信息到 AST
5. **SourceMap 嵌入指令**：每条指令自带 `sourcePos`

---

## 二、核心数据结构

### 2.1 SourcePos（源代码位置）

```typescript
interface SourcePos {
  line: number      // 1-based
  column: number    // 1-based
  file?: string
}
```

### 2.2 Ref（变量引用）

```typescript
// 引用类型：三种不同的变量寻址方式
type Ref = GlobalRef | LocalRef | TempRef

interface GlobalRef {
  kind: 'global'
  name: string          // 全局变量名（大写）
}

interface LocalRef {
  kind: 'local'
  name: string          // 局部变量名（大写）
}

interface TempRef {
  kind: 'temp'
  index: number         // 临时槽位索引（0-based）
}

// 辅助函数：引用的字符串表示（用于调试和 Map key）
function refKey(r: Ref): string {
  switch (r.kind) {
    case 'global': return `G:${r.name}`
    case 'local':  return `L:${r.name}`
    case 'temp':   return `T:${r.index}`
  }
}
```

### 2.3 PascalValue（运行时值）

```typescript
// 值是纯数据，不包含方法
interface PascalValue {
  typeId: string        // 类型 ID，对应 TypeDef.id
  raw: unknown          // 原始值，类型特定
}
```

### 2.4 TypeDef（类型定义）

类型定义是**对象字面量**，不是 interface。包含类型属性和操作定义。每个操作是 `{ can, toCode, invoke }` 三元组，要么全有要么全无。

```typescript
// === 类型定义 ===
type TypeDef = IntegerType | RealType | BooleanType | CharType | StringType
             | SubrangeType | ArrayType | RecordType | SetType
             | PointerType | FileType | EnumType

interface TypeBase {
  id: string            // 唯一标识，如 "integer", "array[int,1..10]"
  kind: string          // 种类：integer/real/boolean/...
}

// --- 基础类型 ---
interface IntegerType extends TypeBase {
  kind: 'integer'
  size: 16 | 32 | 64    // 位宽
  signed: boolean
}

interface RealType extends TypeBase {
  kind: 'real'
  size: 32 | 64
}

interface BooleanType extends TypeBase {
  kind: 'boolean'
}

interface CharType extends TypeBase {
  kind: 'char'
}

interface StringType extends TypeBase {
  kind: 'string'
  length?: number       // 可选：定长字符串
}

// --- 复合类型 ---
interface SubrangeType extends TypeBase {
  kind: 'subrange'
  baseTypeId: string    // 基类型
  min: number           // 下界（常量折叠后的值）
  max: number           // 上界
}

interface ArrayType extends TypeBase {
  kind: 'array'
  elementTypeId: string
  dimensions: ArrayDim[]
  isPacked: boolean
}

interface ArrayDim {
  low: number
  high: number
  indexTypeId: string   // 索引类型（通常是 subrange）
}

interface RecordType extends TypeBase {
  kind: 'record'
  fields: RecordField[]
}

interface RecordField {
  name: string
  typeId: string
  offset: number        // 字段偏移（字节或索引）
}

interface SetType extends TypeBase {
  kind: 'set'
  baseTypeId: string
  minOrd: number
  maxOrd: number
}

interface PointerType extends TypeBase {
  kind: 'pointer'
  targetTypeId: string  // 指向的类型
}

interface FileType extends TypeBase {
  kind: 'file'
  elementTypeId?: string
}

interface EnumType extends TypeBase {
  kind: 'enum'
  values: string[]      // 枚举值名称
}
```

### 2.5 TypeOp（类型操作）

每个操作是 `{ can, toCode, invoke }` 三元组。

```typescript
// === 类型操作三元组 ===
// can:     静态检查：能否执行此操作？返回结果类型或 null
// toCode:  代码生成：生成 JsonCode 指令
// invoke:  运行时执行：输入值，输出结果值

interface UnaryOp {
  can: (operandType: string, typeTable: TypeTable) => string | null
  toCode: (dest: Ref, operand: Ref, ctx: CodeGenContext) => JsonInstruction[]
  invoke: (operand: PascalValue, runtime: RuntimeCtx) => PascalValue
}

interface BinaryOp {
  can: (leftType: string, rightType: string, typeTable: TypeTable) => string | null
  toCode: (dest: Ref, left: Ref, right: Ref, ctx: CodeGenContext) => JsonInstruction[]
  invoke: (left: PascalValue, right: PascalValue, runtime: RuntimeCtx) => PascalValue
}

interface IndexOp {
  can: (arrayType: string, indexType: string, typeTable: TypeTable) => string | null
  toCode: (dest: Ref, array: Ref, index: Ref, ctx: CodeGenContext) => JsonInstruction[]
  invoke: (array: PascalValue, index: PascalValue, runtime: RuntimeCtx) => PascalValue
}

interface FieldOp {
  can: (recordType: string, fieldName: string, typeTable: TypeTable) => string | null
  toCode: (dest: Ref, record: Ref, fieldName: string, ctx: CodeGenContext) => JsonInstruction[]
  invoke: (record: PascalValue, fieldName: string, runtime: RuntimeCtx) => PascalValue
}

interface CompareOp {
  can: (leftType: string, rightType: string, typeTable: TypeTable) => string | null  // 返回 boolean 类型
  toCode: (dest: Ref, left: Ref, right: Ref, op: string, ctx: CodeGenContext) => JsonInstruction[]
  invoke: (left: PascalValue, right: PascalValue, op: string, runtime: RuntimeCtx) => PascalValue
}

interface AssignOp {
  can: (fromType: string, toType: string, typeTable: TypeTable) => boolean
  toCode: (dest: Ref, src: Ref, ctx: CodeGenContext) => JsonInstruction[]
  invoke: (dest: PascalValue, src: PascalValue, runtime: RuntimeCtx) => PascalValue
}

interface ControlOp {
  can: (type: string, typeTable: TypeTable) => boolean  // 能否作为控制条件
  toCode: (cond: Ref, ctx: CodeGenContext) => JsonInstruction[]  // 转换为布尔值
  invoke: (value: PascalValue, runtime: RuntimeCtx) => boolean
}

interface CallOp {
  can: (args: string[], typeTable: TypeTable) => string | null  // 返回值类型
  toCode: (dest: Ref | null, args: Ref[], ctx: CodeGenContext) => JsonInstruction[]
  invoke: (args: PascalValue[], runtime: RuntimeCtx) => PascalValue | void
}

// === TypePlugin：一组类型的操作集合 ===
interface TypePlugin {
  name: string
  version: string

  // 支持的类型列表
  types: TypeDef[]

  // === 操作表（每种操作是一个对象，包含 can/toCode/invoke）===
  ops: {
    literal?: {
      can: (node: any, typeTable: TypeTable) => string | null  // 返回类型 ID
      toCode: (dest: Ref, node: any, ctx: CodeGenContext) => JsonInstruction[]
      invoke: (value: any, typeId: string, runtime: RuntimeCtx) => PascalValue
    }
    assign?: AssignOp
    unary?: Record<string, UnaryOp>       // key: 运算符名（UPPERCASE）
    binary?: Record<string, BinaryOp>     // key: 运算符名
    compare?: Record<string, CompareOp>   // key: =, <>, <, <=, >, >=
    index?: IndexOp
    field?: FieldOp
    control?: ControlOp
    default?: {
      can: (typeId: string, typeTable: TypeTable) => boolean
      toCode: (dest: Ref, typeId: string, ctx: CodeGenContext) => JsonInstruction[]
      invoke: (typeId: string, runtime: RuntimeCtx) => PascalValue
    }
    copy?: {
      can: (typeId: string, typeTable: TypeTable) => boolean
      toCode: (dest: Ref, src: Ref, ctx: CodeGenContext) => JsonInstruction[]
      invoke: (value: PascalValue, runtime: RuntimeCtx) => PascalValue
    }
  }
}

// === 类型表：运行时和编译时共用 ===
interface TypeTable {
  get(id: string): TypeDef | undefined
  has(id: string): boolean
  register(def: TypeDef): void
  all(): TypeDef[]
}
```

### 2.6 CodeGenContext / RuntimeCtx

```typescript
// 静态分析/代码生成上下文
interface CodeGenContext {
  typeTable: TypeTable
  tempBase: number        // 当前临时槽位基址
  tempCount: number       // 已分配的临时槽位数
  sourcePos?: SourcePos   // 当前源代码位置
}

// 运行时上下文
interface RuntimeCtx {
  typeTable: TypeTable
  sysCalls: Map<string, SysCallHandler>
  globalVars: Map<string, PascalValue>
}
```

---

## 三、JsonCode（中间代码）

### 3.1 指令集

```typescript
type JsonInstruction =
  // --- 变量操作 ---
  | DeclareInst       // 声明变量（全局/局部）
  | MoveInst          // 值复制（赋值语义）
  | LiteralInst       // 字面量加载
  | TempAllocInst     // 分配临时槽位
  | TempFreeInst      // 释放临时槽位（退栈）
  
  // --- 控制流 ---
  | JmpInst           // 无条件跳转
  | JmpIfFalseInst    // 条件跳转
  | LabelInst         // 标签
  
  // --- 过程/函数 ---
  | CallInst          // 调用过程/函数
  | RetInst           // 返回
  
  // --- 系统调用 ---
  | SysCallInst       // 系统过程/函数调用（IO 等）
  
  // --- 类型操作 ---
  | TypeOpInst        // 类型操作（委托给 TypePlugin）

// === 具体指令 ===

interface DeclareInst {
  op: 'DECLARE'
  scope: 'global' | 'local'
  name: string
  typeId: string
  sourcePos?: SourcePos
}

interface MoveInst {
  op: 'MOVE'
  dest: Ref
  src: Ref
  sourcePos?: SourcePos
}

interface LiteralInst {
  op: 'LITERAL'
  dest: Ref
  typeId: string
  value: unknown       // 字面量值（原始形式）
  sourcePos?: SourcePos
}

interface TempAllocInst {
  op: 'TEMP_ALLOC'
  count: number        // 分配的槽位数
  sourcePos?: SourcePos
}

interface TempFreeInst {
  op: 'TEMP_FREE'
  count: number        // 释放的槽位数（退栈）
  sourcePos?: SourcePos
}

interface JmpInst {
  op: 'JMP'
  target: string
  sourcePos?: SourcePos
}

interface JmpIfFalseInst {
  op: 'JMP_IF_FALSE'
  cond: Ref
  target: string
  sourcePos?: SourcePos
}

interface LabelInst {
  op: 'LABEL'
  label: string
  sourcePos?: SourcePos
}

interface CallInst {
  op: 'CALL'
  proc: string
  args: Ref[]          // 语义化参数引用
  dest?: Ref           // 返回值存储位置（函数时）
  sourcePos?: SourcePos
}

interface RetInst {
  op: 'RET'
  value?: Ref          // 返回值引用（函数时）
  sourcePos?: SourcePos
}

interface SysCallInst {
  op: 'SYS_CALL'
  proc: string         // 系统过程名（WRITE, READLN, ...）
  args: Ref[]
  dest?: Ref
  sourcePos?: SourcePos
}

interface TypeOpInst {
  op: 'TYPE_OP'
  typeId: string       // 操作所属类型
  opName: string       // 操作名（add, mul, getIndex, ...）
  opKind: 'unary' | 'binary' | 'index' | 'field' | 'compare' | 'assign' | 'default' | 'copy' | 'call'
  dest: Ref
  src: Ref[]           // 操作数引用
  extra?: any          // 额外参数（如字段名、比较运算符）
  sourcePos?: SourcePos
}
```

### 3.2 完整 JsonCode

```typescript
interface JsonCode {
  version: string
  typeTable: TypeDef[]                    // 所有类型定义
  globals: { name: string; typeId: string }[]
  procedures: ProcDef[]
  entry: string                           // 入口过程名（"main"）
  sourceFile?: string
}

interface ProcDef {
  name: string
  params: { name: string; typeId: string; isVar: boolean }[]
  returnType?: string
  locals: { name: string; typeId: string }[]
  maxTemps: number                        // 最大临时槽位数
  body: JsonInstruction[]
  sourcePos?: SourcePos
}
```

---

## 四、完整工作流推演

### 4.1 简单算术：`a + b * c`

```
源码:
  var a, b, c: integer;
  a := a + b * c;

AST:
  Assignment(
    left: Identifier("a"),
    right: Binary("+",
      Identifier("a"),
      Binary("*",
        Identifier("b"),
        Identifier("c"))))

StaticAnalyzer 编译过程：
  1. 编译 a → 返回 LocalRef("A")
  2. 编译 b → 返回 LocalRef("B")
  3. 编译 c → 返回 LocalRef("C")
  4. 编译 b * c：
     - 查询 integer 类型的 binary["*"]
     - can("integer", "integer") → "integer" ✓
     - 分配临时槽位 T0
     - toCode(T0, B, C) → [TYPE_OP integer binary.mul dest:T0 src:[B,C]]
     - 返回 T0
  5. 编译 a + T0：
     - 查询 integer 类型的 binary["+"]
     - can("integer", "integer") → "integer" ✓
     - 分配临时槽位 T1
     - toCode(T1, A, T0) → [TYPE_OP integer binary.add dest:T1 src:[A,T0]]
     - 返回 T1
  6. 赋值 a := T1：
     - 查询 integer 类型的 assign
     - can("integer", "integer") → true ✓
     - toCode(A, T1) → [TYPE_OP integer assign dest:A src:[T1]]
  7. 释放临时槽位 TEMP_FREE 2

生成的 JsonCode:
  [
    TEMP_ALLOC 2,
    TYPE_OP integer binary.mul    dest:T0 src:[B, C],
    TYPE_OP integer binary.add    dest:T1 src:[A, T0],
    TYPE_OP integer assign        dest:A src:[T1],
    TEMP_FREE 2
  ]

VM 执行：
  1. TEMP_ALLOC 2 → temps 数组长度 +2
  2. TYPE_OP mul → temps[0] = 12 (假设 b=3, c=4)
  3. TYPE_OP add → temps[1] = 17 (假设 a=5)
  4. TYPE_OP assign → locals["A"] = 17
  5. TEMP_FREE 2 → temps 数组长度 -2
```

### 4.2 数组访问：`a[i] := 5`

```
源码:
  var a: array[1..10] of integer;
      i: integer;
  a[i] := 5;

StaticAnalyzer:
  1. 编译 a → LocalRef("A")  类型: array[1..10] of integer
  2. 编译 i → LocalRef("I")  类型: integer
  3. 编译 5 → 分配 T0，LITERAL T0 integer 5
  4. 检查 setIndex:
     - arrayType.indexOp? 或 单独的 setIndex 操作
     - can("array[1..10]ofinteger", "integer", "integer") → true
     - toCode(dest=A, src=[I, T0]) → TYPE_OP array setIndex dest:A src:[I, T0]
  5. TEMP_FREE 1

生成的 JsonCode:
  [
    TEMP_ALLOC 1,
    LITERAL   integer            dest:T0 value:5,
    TYPE_OP   array setIndex     dest:A src:[I, T0],
    TEMP_FREE 1
  ]

注意：setIndex 是 "in-place" 操作，dest 是数组本身，src[0] 是索引，src[1] 是值。
这和 getIndex（返回新值）不同。
```

### 4.3 记录字段：`p.x := p.y + 1`

```
源码:
  type point = record x, y: integer; end;
  var p: point;
  p.x := p.y + 1;

StaticAnalyzer:
  1. 编译 p.y → 
     - p: LocalRef("P") 类型: point
     - 查 record 类型的 field op
     - can("point", "y") → "integer" ✓
     - 分配 T0
     - toCode(T0, P, "y") → TYPE_OP record field.get dest:T0 src:[P] extra:{field:"y"}
     - 返回 T0
  2. 编译 1 → 分配 T1，LITERAL T1 integer 1
  3. 编译 T0 + T1 →
     - can("integer", "integer") → "integer"
     - 分配 T2
     - toCode(T2, T0, T1) → TYPE_OP integer add dest:T2 src:[T0, T1]
     - 返回 T2
  4. 赋值 p.x := T2 →
     - record 的 field.set 操作
     - can("point", "x", "integer") → true
     - toCode(dest=P, src=[T2]) extra:{field:"x"} → TYPE_OP record field.set dest:P src:[T2] extra:{field:"x"}
  5. TEMP_FREE 3

生成的 JsonCode:
  [
    TEMP_ALLOC 3,
    TYPE_OP record field.get  dest:T0 src:[P]  extra:{field:"y"},
    LITERAL integer          dest:T1 value:1,
    TYPE_OP integer add      dest:T2 src:[T0, T1],
    TYPE_OP record field.set dest:P  src:[T2] extra:{field:"x"},
    TEMP_FREE 3
  ]
```

### 4.4 子界类型：`type T = 1..10; var a: T; a := 5`

```
源码:
  type T = 1..10;
  var a: T;
  a := 5;

StaticAnalyzer:
  1. 类型解析：T → SubrangeType { id:"T", kind:"subrange", baseTypeId:"integer", min:1, max:10 }
  2. 编译 5 → 分配 T0，LITERAL T0 integer 5
  3. 赋值 a := 5:
     - 查 subrange 类型的 assign op
     - can("integer", "T") →
       - 先查 baseType(integer) 的 can → true
       - 再检查 5 是否在 [1,10] 范围内 → 编译期已知，可静态检查
       - 返回 true
     - toCode(dest=A, src=T0) →
       - 先 baseType.toCode（复制）
       - 再加范围检查指令（运行时检查）
       → [
           TYPE_OP subrange assign dest:A src:[T0]
           // invoke 时会先检查范围，再存储
         ]
  4. TEMP_FREE 1

生成的 JsonCode:
  [
    TEMP_ALLOC 1,
    LITERAL   integer         dest:T0 value:5,
    TYPE_OP   subrange assign dest:A  src:[T0],
    TEMP_FREE 1
  ]

VM 执行 (invoke):
  subrange.assign.invoke(value, runtime):
    - intValue = value.raw (5)
    - typeDef = typeTable.get("T") → SubrangeType { min:1, max:10 }
    - 检查 1 <= 5 <= 10 → ✓
    - 返回 PascalValue { typeId:"T", raw:5 }
```

### 4.4.1 子界类型（边界是外部常量）：`const LO=1; HI=10; type T=LO..HI`

```
源码:
  const LO = 1;
        HI = 10;
  type T = LO..HI;
  var a: T;
  a := 5;

StaticAnalyzer:
  1. 常量解析：LO=1, HI=10 注册到符号表
  2. 类型解析：T → SubrangeType { id:"T", kind:"subrange", baseTypeId:"integer", min:1, max:10 }
     - 解析 LO..HI 时，调用常量表达式求值：evaluateConstExpr(LO) → 1, evaluateConstExpr(HI) → 10
     - 将常量值固化到 TypeDef 的 min/max 字段
  3. 后续流程同 4.4

关键点：
  - 子界边界必须是**常量表达式**（Pascal82 §6.4.3.2）
  - 静态分析期执行常量折叠，将表达式结果固化到 TypeDef
  - 运行时不再重新求值边界表达式
  - 边界值是**值类型复制**，不会被后续同名变量影响

生成的 TypeDef（固化后）：
  {
    id: "T",
    kind: "subrange",
    baseTypeId: "integer",
    min: 1,          // 不是 "LO"，是计算后的数值 1
    max: 10          // 不是 "HI"，是计算后的数值 10
  }
```

### 4.4.2 子界类型（边界是常量表达式）：`type T = LO+1..HI*2`

```
源码:
  const LO = 1;
        HI = 5;
  type T = LO + 1 .. HI * 2;  // 等价于 2..10
  var a: T;
  a := 5;

StaticAnalyzer:
  1. 常量解析：LO=1, HI=5
  2. 类型解析：
     - evaluateConstExpr(LO + 1) → 1 + 1 = 2
     - evaluateConstExpr(HI * 2) → 5 * 2 = 10
     - T → SubrangeType { id:"T", baseTypeId:"integer", min:2, max:10 }

生成的 TypeDef：
  {
    id: "T",
    kind: "subrange",
    baseTypeId: "integer",
    min: 2,
    max: 10
  }
```

### 4.4.3 子界类型（边界是子界常量）：`type T=1..10; type U=T..20`

```
源码:
  type T = 1..10;
  type U = T..20;  // 基类型是 T，但 T 的范围是 1..10，所以 U 的有效范围是 1..20

StaticAnalyzer:
  1. 类型解析 T → SubrangeType { id:"T", baseTypeId:"integer", min:1, max:10 }
  2. 类型解析 U：
     - 解析 T..20：
       * evaluateConstExpr(T) → T 是类型，不是常量 → 需要取 T 的 min 值（1）作为下界
       * evaluateConstExpr(20) → 20
     - U → SubrangeType { id:"U", baseTypeId:"integer", min:1, max:20 }

关键点：
  - 子界边界可以是子界类型标识符 → 取该类型的 min 作为下界，max 作为上界
  - 最终基类型都是 integer（或其他序数类型）
```

### 4.4.4 子界类型（边界是字符常量）：`type Letter = 'A'..'Z'`

```
源码:
  type Letter = 'A'..'Z';
  var c: Letter;
  c := 'M';

StaticAnalyzer:
  1. 类型解析：
     - evaluateConstExpr('A') → 65 (ASCII)
     - evaluateConstExpr('Z') → 90 (ASCII)
     - Letter → SubrangeType { id:"Letter", baseTypeId:"char", min:65, max:90 }
  2. 编译 'M' → LITERAL T0 char 77
  3. 赋值 c := T0 → TYPE_OP subrange assign dest:C src:[T0]

VM 执行 (invoke):
  subrange.assign.invoke(value, runtime):
    - charValue = value.raw (77)
    - typeDef = typeTable.get("Letter") → SubrangeType { min:65, max:90 }
    - 检查 65 <= 77 <= 90 → ✓
    - 返回 PascalValue { typeId:"Letter", raw:77 }
```

### 4.4.5 子界类型（边界是布尔常量）：`type Flag = false..true`

```
源码:
  type Flag = false..true;
  var f: Flag;
  f := true;

StaticAnalyzer:
  1. 类型解析：
     - evaluateConstExpr(false) → 0
     - evaluateConstExpr(true) → 1
     - Flag → SubrangeType { id:"Flag", baseTypeId:"boolean", min:0, max:1 }
  2. 编译 true → LITERAL T0 boolean 1
  3. 赋值 f := T0 → TYPE_OP subrange assign dest:F src:[T0]

VM 执行 (invoke):
  subrange.assign.invoke(value, runtime):
    - boolValue = value.raw (1)
    - typeDef = typeTable.get("Flag") → SubrangeType { min:0, max:1 }
    - 检查 0 <= 1 <= 1 → ✓
    - 返回 PascalValue { typeId:"Flag", raw:1 }
```

### 4.4.6 子界类型（运行时范围检查失败）：`a := 11`

```
源码:
  type T = 1..10;
  var a: T;
  a := 11;

生成的 JsonCode:
  [
    TEMP_ALLOC 1,
    LITERAL   integer         dest:T0 value:11,
    TYPE_OP   subrange assign dest:A  src:[T0],
    TEMP_FREE 1
  ]

VM 执行 (invoke):
  subrange.assign.invoke(value, runtime):
    - intValue = value.raw (11)
    - typeDef = typeTable.get("T") → SubrangeType { min:1, max:10 }
    - 检查 1 <= 11 <= 10 → ✗
    - 抛出错误："Range check error: 11 is not in [1..10]"

错误信息：
  VMError {
    message: "Range check error: 11 is not in [1..10]",
    instructionIndex: 2,
    sourcePos: { line: 3, column: 5 }
  }
```

### 4.5 集合操作：`x in [1, 3, 5]`

```
源码:
  var x: integer;
  if x in [1, 3, 5] then ...

StaticAnalyzer:
  1. 编译 x → LocalRef("X") 类型: integer
  2. 编译 [1, 3, 5]:
     - 推断集合基类型: integer
     - 分配 T0 (集合值)
     - LITERAL T0 set-of-integer [1,3,5]
     - 或者用 TYPE_OP set.construct
     - 返回 T0
  3. 编译 x in T0:
     - 查 set 类型的 "in" 操作（binary op）
     - can("integer", "set-of-integer") → "boolean" ✓
     - 分配 T1
     - toCode(T1, X, T0) → TYPE_OP set binary.in dest:T1 src:[X, T0]
     - 返回 T1 (boolean)
  4. if 语句使用 T1 作为条件

生成的 JsonCode:
  [
    TEMP_ALLOC 2,
    LITERAL   set            dest:T0 typeId:"set-of-integer-0-255" value:[1,3,5],
    TYPE_OP   set binary.in  dest:T1 src:[X, T0],
    JMP_IF_FALSE cond:T1 target:_L_else,
    ...
  ]
```

### 4.5.1 集合操作（元素是常量表达式）：`[LO..HI]`

```
源码:
  const LO = 1;
        HI = 5;
  var s: set of 1..10;
  s := [LO..HI];  // 等价于 [1..5]

StaticAnalyzer:
  1. 常量解析：LO=1, HI=5
  2. 编译 [LO..HI]:
     - evaluateConstExpr(LO) → 1
     - evaluateConstExpr(HI) → 5
     - 生成集合字面量 [1,2,3,4,5]
     - LITERAL T0 set-of-integer-1-10 [1,2,3,4,5]
  3. 赋值 s := T0 → TYPE_OP set assign dest:S src:[T0]

生成的 JsonCode:
  [
    TEMP_ALLOC 1,
    LITERAL   set            dest:T0 typeId:"set-of-integer-1-10" value:[1,2,3,4,5],
    TYPE_OP   set assign     dest:S  src:[T0],
    TEMP_FREE 1
  ]
```

### 4.6 数组类型（下标是常量表达式）：`array[LO..HI] of integer`

```
源码:
  const LO = 1;
        HI = 10;
  var a: array[LO..HI] of integer;
  a[5] := 100;

StaticAnalyzer:
  1. 常量解析：LO=1, HI=10
  2. 类型解析：
     - evaluateConstExpr(LO) → 1
     - evaluateConstExpr(HI) → 10
     - array[1..10] of integer → ArrayType {
         id: "array[1..10]ofinteger",
         kind: "array",
         elementTypeId: "integer",
         dimensions: [{ low: 1, high: 10, indexTypeId: "integer" }],
         isPacked: false
       }
  3. 编译 a[5]:
     - a → LocalRef("A") 类型: array[1..10]ofinteger
     - 5 → LITERAL T0 integer 5
     - 索引检查：5 在 [1,10] 范围内 → ✓
     - TYPE_OP array getIndex dest:T1 src:[A, T0]
  4. 赋值 a[5] := 100:
     - 100 → LITERAL T2 integer 100
     - TYPE_OP array setIndex dest:A src:[T0, T2]

生成的 JsonCode:
  [
    TEMP_ALLOC 3,
    LITERAL   integer               dest:T0 value:5,
    LITERAL   integer               dest:T2 value:100,
    TYPE_OP   array setIndex        dest:A  src:[T0, T2],
    TEMP_FREE 3
  ]
```

### 4.6.1 数组类型（下标是常量表达式计算）：`array[LO*2..HI+5]`

```
源码:
  const LO = 1;
        HI = 5;
  var a: array[LO*2..HI+5] of integer;  // 等价于 array[2..10]

StaticAnalyzer:
  1. 常量解析：LO=1, HI=5
  2. 类型解析：
     - evaluateConstExpr(LO*2) → 1*2 = 2
     - evaluateConstExpr(HI+5) → 5+5 = 10
     - array[2..10] of integer → ArrayType {
         dimensions: [{ low: 2, high: 10, indexTypeId: "integer" }]
       }
```

### 4.7 记录类型（常量表达式作为字段值）：`const SIZE=10; type R=record len:SIZE..SIZE+10`

```
源码:
  const SIZE = 10;
  type R = record
            len: SIZE..SIZE+10;  // 等价于 len: 10..20
          end;
  var p: R;
  p.len := 15;

StaticAnalyzer:
  1. 常量解析：SIZE=10
  2. 类型解析 R:
     - len 字段类型：evaluateConstExpr(SIZE) → 10, evaluateConstExpr(SIZE+10) → 20
     - len 类型 → SubrangeType { id:"anonymous_subrange_10_20", min:10, max:20 }
     - R → RecordType {
         id: "R",
         fields: [{ name: "len", typeId: "anonymous_subrange_10_20", offset: 0 }]
       }
  3. 编译 p.len := 15:
     - p → LocalRef("P")
     - 15 → LITERAL T0 integer 15
     - TYPE_OP record field.set dest:P src:[T0] extra:{field:"len"}

生成的 JsonCode:
  [
    TEMP_ALLOC 1,
    LITERAL   integer               dest:T0 value:15,
    TYPE_OP   record field.set      dest:P  src:[T0] extra:{field:"len"},
    TEMP_FREE 1
  ]
```

### 4.8 常量表达式的作用域隔离：同名常量不影响已定义类型

```
源码:
  const N = 5;
  type T = 1..N;  // T 的范围是 1..5，N 的值已固化
  const N = 10;   // 重新定义同名常量（Pascal82 不允许，但假设允许）
  var a: T;
  a := 6;         // 应该报错：6 不在 [1..5] 范围内

StaticAnalyzer:
  1. 第一次 const N = 5 → 注册到符号表
  2. 类型解析 T = 1..N:
     - evaluateConstExpr(N) → 5（使用当前符号表中的 N=5）
     - T → SubrangeType { min:1, max:5 }
  3. 第二次 const N = 10 → 符号表中 N 被更新为 10
  4. 但 T 的 min/max 是**值类型复制**，不会被后续 N 的修改影响
  5. 编译 a := 6:
     - 6 → LITERAL T0 integer 6
     - TYPE_OP subrange assign dest:A src:[T0]

VM 执行 (invoke):
  subrange.assign.invoke(value, runtime):
    - typeDef = typeTable.get("T") → SubrangeType { min:1, max:5 }
    - 检查 1 <= 6 <= 5 → ✗
    - 抛出错误："Range check error: 6 is not in [1..5]"

关键点：
  - TypeDef 在定义时就固化了常量表达式的结果
  - 后续同名常量的重新定义不会影响已定义的类型
  - 这符合 Pascal82 的语义：类型是在声明时确定的
```

### 4.8.1 局部常量不影响全局类型

```
源码:
  const N = 5;
  type T = 1..N;  // T 的范围是 1..5
  var a: T;
  
  procedure p;
    const N = 10;  // 局部常量，覆盖全局 N
  begin
    a := 6;        // 应该报错：6 不在 [1..5] 范围内（使用的是全局 T）
  end;

StaticAnalyzer:
  1. 全局 const N = 5 → 注册到全局符号表
  2. 类型解析 T = 1..N → SubrangeType { min:1, max:5 }
  3. 过程 p 内部 const N = 10 → 注册到局部符号表（仅在 p 内可见）
  4. 编译 a := 6（在 p 内）:
     - a → GlobalRef("A") 类型: T
     - 6 → LITERAL T0 integer 6
     - TYPE_OP subrange assign dest:A src:[T0]
     - T 的 min/max 仍是 [1..5]，不受局部 N=10 影响

VM 执行 (invoke):
  subrange.assign.invoke(value, runtime):
    - typeDef = typeTable.get("T") → SubrangeType { min:1, max:5 }
    - 检查 1 <= 6 <= 5 → ✗
    - 抛出错误
```

### 4.9 while 循环（临时变量退栈验证）

```
源码:
  var i, s: integer;
  while i > 0 do begin
    s := s + i;
    i := i - 1;
  end;

StaticAnalyzer:
  编译 while:
    1. 标签 L_while_start
    2. 编译条件 i > 0:
       - i → LocalRef("I")
       - 0 → 分配 T0, LITERAL T0 integer 0
       - i > 0 → 分配 T1, TYPE_OP integer compare.gt dest:T1 src:[I, T0]
       - 返回 T1
    3. JMP_IF_FALSE T1 → L_while_end
    4. 编译循环体:
       - s := s + i:
         * 分配 T2, TYPE_OP integer add dest:T2 src:[S, I]
         * TYPE_OP integer assign dest:S src:[T2]
       - i := i - 1:
         * 分配 T3, TYPE_OP integer sub dest:T3 src:[I, T0]  (复用 T0?)
         * TYPE_OP integer assign dest:I src:[T3]
    5. TEMP_FREE 4 (T0, T1, T2, T3)
    6. JMP → L_while_start
    7. 标签 L_while_end

生成的 JsonCode:
  [
    LABEL _L_while_start,
    TEMP_ALLOC 4,
    LITERAL integer           dest:T0 value:0,
    TYPE_OP integer compare.gt dest:T1 src:[I, T0],
    JMP_IF_FALSE cond:T1 target:_L_while_end,
    TYPE_OP integer add       dest:T2 src:[S, I],
    TYPE_OP integer assign    dest:S  src:[T2],
    TYPE_OP integer sub       dest:T3 src:[I, T0],
    TYPE_OP integer assign    dest:I  src:[T3],
    TEMP_FREE 4,
    JMP target:_L_while_start,
    LABEL _L_while_end
  ]

验证退栈正确性：
  - 每次循环开始时 TEMP_ALLOC 4
  - 每次循环结束时 TEMP_FREE 4
  - 循环体内临时变量总数不变
  ✓ 正确
```

### 4.7 过程调用 + var 参数

```
源码:
  procedure swap(var a, b: integer);
  var t: integer;
  begin
    t := a;
    a := b;
    b := t;
  end;
  
  var x, y: integer;
  swap(x, y);

StaticAnalyzer:
  编译 swap(x, y):
    1. 查过程 swap → 参数: [var a:integer, var b:integer]
    2. 编译实参 x → GlobalRef("X")
    3. 编译实参 y → GlobalRef("Y")
    4. 生成 CALL:
       CALL proc:"swap" args:[GlobalRef("X"), GlobalRef("Y")]

VM 执行 CALL:
  1. 创建新栈帧
  2. 绑定参数：
     - a → var 参数 → 存储引用 { kind:'ref', target: GlobalRef("X") }
     - b → var 参数 → 存储引用 { kind:'ref', target: GlobalRef("Y") }
  3. 初始化局部变量 t → PascalValue(integer, 0)
  4. pc → 过程 body 第一条指令
  5. 执行过程体:
     - t := a → 读取 a 的引用指向的值，赋给 t
     - a := b → 读取 b 的引用指向的值，写入 a 的引用指向的位置
     - b := t → 读取 t 的值，写入 b 的引用指向的位置
  6. RET → 弹栈帧，pc → 返回地址
```

### 4.8 for 循环

```
源码:
  for i := 1 to 10 do
    writeln(i);

StaticAnalyzer:
  1. 编译 1 → T0 (integer literal)
  2. i := T0 → assign
  3. 编译 10 → T1 (integer literal)
  4. 标签 L_for_start
  5. 编译 i <= 10 → T2 (compare.le)
  6. JMP_IF_FALSE T2 → L_for_end
  7. 编译循环体 writeln(i) → SYS_CALL WRITE [I]
  8. 编译 i := i + 1 → T3 = add(I, 1) → assign(I, T3)
  9. TEMP_FREE ... 
  10. JMP → L_for_start
  11. 标签 L_for_end
```

### 4.9 case 语句

```
源码:
  case x of
    1: writeln('one');
    2, 3: writeln('two or three');
    else writeln('other');
  end;

StaticAnalyzer:
  1. 编译 x → LocalRef("X")
  2. 标签 L_case_end
  3. 对每个分支:
     - 标签 L_branch_N
     - 编译标签值与 x 比较 → Tn
     - JMP_IF_FALSE Tn → L_next_branch
     - 编译分支语句
     - JMP → L_case_end
     - 标签 L_next_branch
  4. else 分支（如果有）
  5. 标签 L_case_end
```

### 4.10 with 语句

```
源码:
  with p do begin
    x := 1;
    y := 2;
  end;

StaticAnalyzer:
  with 的处理：
  - 进入 with 时，在符号表中注册字段别名
  - p.x 的引用直接翻译为字段访问
  - 不生成额外指令，完全是编译期的符号解析

  编译 p.x := 1:
    1. x 在 with 作用域中 → 解析为 p.x
    2. 1 → T0 (literal)
    3. TYPE_OP record field.set dest:P src:[T0] extra:{field:"x"}
```

---

## 五、StaticAnalyzer 工作机制

### 5.1 符号表

```typescript
interface SymbolTable {
  scopes: Scope[]       // 作用域栈
  pushScope(): void
  popScope(): void
  
  // 变量查找（沿作用域链向上）
  lookupVar(name: string): VarSymbol | null
  
  // 类型查找
  lookupType(name: string): string | null  // 返回 typeId
  
  // 过程/函数查找
  lookupProc(name: string): ProcSymbol | null
}

interface Scope {
  kind: 'global' | 'local' | 'with'
  vars: Map<string, VarSymbol>
  types: Map<string, string>  // name → typeId
  procs: Map<string, ProcSymbol>
}

interface VarSymbol {
  name: string
  typeId: string
  ref: Ref              // 对应的引用
}

interface ProcSymbol {
  name: string
  params: { name: string; typeId: string; isVar: boolean }[]
  returnType?: string
}
```

### 5.2 表达式编译算法

```
compileExpr(node):
  输入：AST 表达式节点
  输出：结果存储的 Ref + 结果类型 ID + 生成的指令

  switch node.kind:
    case "Identifier":
      → 查符号表，返回 VarSymbol.ref 和 typeId
      → 不生成指令（直接引用）
    
    case "IntegerLiteral":
      → 分配临时槽位 T
      → 生成 LITERAL T integer node.value
      → 返回 (T, "integer", [LITERAL...])
    
    case "BinaryExpression":
      → 递归编译 left → (leftRef, leftType, leftInstrs)
      → 递归编译 right → (rightRef, rightType, rightInstrs)
      → 遍历 TypePlugin，找支持 leftType op rightType 的 binary op
      → op.can(leftType, rightType) → resultType (或 null)
      → 如果为 null，报错：类型不兼容
      → 分配临时槽位 dest
      → 生成 op.toCode(dest, leftRef, rightRef) → typeOpInstrs
      → 返回 (dest, resultType, leftInstrs + rightInstrs + typeOpInstrs)
    
    case "ArrayAccess":
      → 递归编译 array → (arrayRef, arrayType, arrayInstrs)
      → 递归编译 index → (indexRef, indexType, indexInstrs)
      → 查 arrayType 的 indexOp
      → indexOp.can(arrayType, indexType) → resultType (或 null)
      → 分配临时槽位 dest
      → 生成 indexOp.toCode(dest, arrayRef, indexRef) → indexInstrs
      → 返回 (dest, resultType, arrayInstrs + indexInstrs + indexOpInstrs)
    
    case "FieldAccess":
      → 递归编译 record → (recRef, recType, recInstrs)
      → 查 recType 的 fieldOp
      → fieldOp.can(recType, fieldName) → resultType (或 null)
      → 分配临时槽位 dest
      → 生成 fieldOp.toCode(dest, recRef, fieldName) → fieldInstrs
      → 返回 (dest, resultType, recInstrs + fieldInstrs)
```

### 5.3 赋值编译算法

```
compileAssign(leftNode, rightNode):
  → 编译 right → (rightRef, rightType, rightInstrs)
  → 编译 left（作为左值）:
     - 如果是 Identifier → varRef = symbol.ref
     - 如果是 ArrayAccess → 编译 array 和 index，记录 (arrayRef, indexRef)
     - 如果是 FieldAccess → 编译 record，记录 (recRef, fieldName)
  
  → 赋值:
     - 如果左值是简单变量:
       - 查左值类型的 assignOp
       - assignOp.can(rightType, leftType) → true/false
       - 生成 assignOp.toCode(leftRef, rightRef)
     - 如果左值是数组元素:
       - 查数组类型的 setIndexOp
       - setIndexOp.can(arrayType, indexType, rightType) → true/false
       - 生成 setIndexOp.toCode(arrayRef, [indexRef, rightRef])
     - 如果左值是记录字段:
       - 查记录类型的 setFieldOp
       - setFieldOp.can(recType, fieldName, rightType) → true/false
       - 生成 setFieldOp.toCode(recRef, [rightRef], {field:fieldName})
```

---

## 六、VM 执行模型

### 6.1 VMState（贫血状态）

```typescript
interface VMState {
  pc: number                          // 程序计数器（当前指令索引）
  currentProc: string                 // 当前过程名
  
  callStack: StackFrame[]             // 调用栈
  globals: Map<string, PascalValue>   // 全局变量
  
  returnValue: PascalValue | null     // 返回值（唯一特殊变量）
  
  outputBuffer: string[]
  inputQueue: string[]
  
  error: VMError | null
  status: 'running' | 'paused' | 'terminated' | 'error'
}

interface StackFrame {
  procName: string
  locals: Map<string, PascalValue>         // 局部变量
  varBindings: Map<string, Ref>             // var 参数绑定（指向外部变量的引用）
  temps: PascalValue[]                      // 临时槽位数组
  tempTop: number                           // 临时槽位栈顶指针
  returnAddress: number
  returnProc: string
  savedSourcePos?: SourcePos
}

interface VMError {
  message: string
  instructionIndex: number
  sourcePos?: SourcePos
  stackTrace: string[]
}
```

### 6.2 变量存取算法

```typescript
function getValue(state: VMState, ref: Ref): PascalValue {
  switch (ref.kind) {
    case 'global':
      return state.globals.get(ref.name)!
    case 'local': {
      const frame = state.callStack[state.callStack.length - 1]
      // 检查是否是 var 参数（绑定到外部）
      const binding = frame.varBindings.get(ref.name)
      if (binding) return getValue(state, binding)
      return frame.locals.get(ref.name)!
    }
    case 'temp': {
      const frame = state.callStack[state.callStack.length - 1]
      return frame.temps[ref.index]
    }
  }
}

function setValue(state: VMState, ref: Ref, value: PascalValue): void {
  switch (ref.kind) {
    case 'global':
      state.globals.set(ref.name, value)
      break
    case 'local': {
      const frame = state.callStack[state.callStack.length - 1]
      const binding = frame.varBindings.get(ref.name)
      if (binding) {
        setValue(state, binding, value)  // 转发到外部
        return
      }
      frame.locals.set(ref.name, value)
      break
    }
    case 'temp': {
      const frame = state.callStack[state.callStack.length - 1]
      frame.temps[ref.index] = value
      break
    }
  }
}
```

### 6.3 指令分派（Lambda 优化前）

```typescript
// 每条指令的执行逻辑
const instructionHandlers: Record<string, (inst: any, state: VMState, runtime: RuntimeCtx) => Promise<void>> = {
  DECLARE: (inst, state) => { ... },
  MOVE: (inst, state) => { ... },
  LITERAL: (inst, state, runtime) => { ... },
  TEMP_ALLOC: (inst, state) => {
    const frame = topFrame(state)
    for (let i = 0; i < inst.count; i++) {
      frame.temps.push(undefined as any)
    }
    state.pc++
  },
  TEMP_FREE: (inst, state) => {
    const frame = topFrame(state)
    frame.temps.splice(frame.temps.length - inst.count, inst.count)
    state.pc++
  },
  JMP: (inst, state) => {
    state.pc = labelMap.get(inst.target)!
  },
  JMP_IF_FALSE: (inst, state, runtime) => {
    const condValue = getValue(state, inst.cond)
    // 用 controlOp 转换为布尔
    const boolResult = runtime.typeTable.get(condValue.typeId)?.ops.control?.invoke(condValue, runtime)
    if (!boolResult) {
      state.pc = labelMap.get(inst.target)!
    } else {
      state.pc++
    }
  },
  LABEL: (inst, state) => { state.pc++ },
  CALL: (inst, state) => {
    // 查找过程定义，创建栈帧，绑定参数，跳转
    ...
  },
  RET: (inst, state) => {
    // 设置返回值，弹栈帧，跳回返回地址
    ...
  },
  SYS_CALL: async (inst, state, runtime) => {
    const handler = runtime.sysCalls.get(inst.proc)
    const args = inst.args.map(r => getValue(state, r))
    const result = await handler!(args, state)
    if (inst.dest && result) {
      setValue(state, inst.dest, result as PascalValue)
    }
    state.pc++
  },
  TYPE_OP: (inst, state, runtime) => {
    const typeDef = runtime.typeTable.get(inst.typeId)!
    const op = getOp(typeDef, inst.opKind, inst.opName)
    const args = inst.src.map(r => getValue(state, r))
    const result = op.invoke(...args, runtime)
    setValue(state, inst.dest, result)
    state.pc++
  },
}
```

### 6.4 Lambda 优化

执行前，将 JsonInstruction[] 编译为 ExecFunc[]：

```typescript
type ExecFunc = (state: VMState, runtime: RuntimeCtx) => Promise<void> | void

function compileToLambda(proc: ProcDef, runtime: RuntimeCtx): ExecFunc[] {
  // 预计算标签映射
  const labelMap = new Map<string, number>()
  proc.body.forEach((inst, i) => {
    if (inst.op === 'LABEL') {
      labelMap.set(inst.label, i)
    }
  })
  
  return proc.body.map((inst, index) => {
    switch (inst.op) {
      case 'JMP': {
        const target = labelMap.get(inst.target)!
        return (state) => { state.pc = target }
      }
      case 'JMP_IF_FALSE': {
        const target = labelMap.get(inst.target)!
        const condRef = inst.cond
        const controlOp = runtime.typeTable.get(...)?.ops.control
        return (state, runtime) => {
          const condVal = getValue(state, condRef)
          if (!controlOp?.invoke(condVal, runtime)) {
            state.pc = target
          } else {
            state.pc = index + 1
          }
        }
      }
      case 'TYPE_OP': {
        const typeDef = runtime.typeTable.get(inst.typeId)!
        const op = getOp(typeDef, inst.opKind, inst.opName)
        const dest = inst.dest
        const srcRefs = inst.src
        return (state, runtime) => {
          const args = srcRefs.map(r => getValue(state, r))
          const result = op.invoke(...args, runtime)
          setValue(state, dest, result)
          state.pc = index + 1
        }
      }
      // ... 其他指令类似
      default:
        return (state) => { state.pc++ }
    }
  })
}
```

---

## 七、类型插件设计

### 7.1 插件组织

```
src/types/
├── index.ts              // TypePlugin 接口 + TypeTable 实现
├── integer.plugin.ts     // 整数类型插件
├── real.plugin.ts        // 实数类型插件
├── boolean.plugin.ts     // 布尔类型插件
├── char.plugin.ts        // 字符类型插件
├── string.plugin.ts      // 字符串类型插件
├── subrange.plugin.ts    // 子界类型插件
├── array.plugin.ts       // 数组类型插件
├── record.plugin.ts      // 记录类型插件
├── set.plugin.ts         // 集合类型插件
├── pointer.plugin.ts     // 指针类型插件
└── file.plugin.ts        // 文件类型插件
```

### 7.2 插件交互

```
类型解析流程：
  AST TypeNode → StaticAnalyzer → 遍历 TypePlugin → 第一个 canResolve 返回 TypeDef

操作分派流程：
  操作请求 → TypeTable → 找到类型定义 → 找到对应操作 → 执行 can/toCode/invoke

类型推断流程：
  表达式 → 编译 → 各操作的 can 返回结果类型 → 向上传递
```

---

## 八、Parser 行号扩展

### 当前状态

- AST 节点上**没有** token/位置信息
- Lexer 生成的 Token 有 start/end Position
- Parser 消费 token 但不保存到 AST

### 需要的改动

1. **AST 节点添加可选字段** `sourcePos?: SourcePos`
2. **Parser 在创建节点时填充 sourcePos**
3. **不修改现有节点的 kind 和语义字段**

```typescript
// ast/types.ts 修改：
interface AstNode {
  kind: string
  sourcePos?: SourcePos  // 新增可选字段
}
```

这是对 AST 类型的扩展，不影响现有逻辑（可选字段）。

---

## 九、查漏补缺检查清单

| 功能 | 支持情况 | 说明 |
|------|---------|------|
| 变量声明 | ✅ | DECLARE 指令 |
| 赋值语句 | ✅ | MOVE / TYPE_OP assign |
| 算术运算 | ✅ | TYPE_OP binary |
| 关系运算 | ✅ | TYPE_OP compare → boolean |
| 逻辑运算 | ✅ | boolean 的 binary op |
| if 语句 | ✅ | JMP_IF_FALSE + JMP |
| while 语句 | ✅ | 标签 + JMP_IF_FALSE |
| repeat 语句 | ✅ | 标签 + 尾部条件判断 |
| for 语句 | ✅ | 初始赋值 + while 模式 |
| case 语句 | ✅ | 多个条件分支 + 跳转 |
| with 语句 | ✅ | 编译期符号别名，无运行时指令 |
| goto 语句 | ✅ | JMP + 标签 |
| 过程调用 | ✅ | CALL 指令 + 栈帧 |
| 函数调用 | ✅ | CALL + dest 引用 |
| var 参数 | ✅ | varBindings 引用转发 |
| 数组访问 | ✅ | TYPE_OP index get/set |
| 记录字段 | ✅ | TYPE_OP field get/set |
| 子界类型 | ✅ | assign 时范围检查 |
| 集合类型 | ✅ | set binary.in, construct |
| 指针类型 | ⚠️ | 需要解引用操作（FieldOp 或专门的 dereference op） |
| 文件类型 | ⚠️ | 需要特殊 IO 处理 |
| 枚举类型 | ✅ | integer 子界 + 常量 |
| 字符串 | ⚠️ | 需要字符串运算（拼接、比较等） |
| 常量折叠 | ✅ | 编译期计算（Literal） |
| 类型检查 | ✅ | can 方法 |
| 错误报告 | ⚠️ | 需要收集所有静态错误 |
| SourceMap | ✅ | 每条指令带 sourcePos |
| 状态序列化 | ✅ | 纯 JSON，可序列化 |
| 异步 IO | ✅ | SYS_CALL async |
| 插件系统 | ✅ | TypePlugin + VMPlugin |
| 临时变量退栈 | ✅ | TEMP_FREE 指令 |
| 嵌套作用域 | ✅ | callStack + 符号表 |

---

## 十、开发规范

### 10.1 命名规范

| 类别 | 规范 | 示例 |
|------|------|------|
| 指令名 | UPPER_SNAKE_CASE | `TYPE_OP`, `JMP_IF_FALSE` |
| 类型 ID | 描述性字符串 | `integer`, `subrange-1-10-of-integer` |
| 临时引用 | `T` + 索引 | `T0`, `T1` |
| 标签 | `_L` + 语义前缀 + 数字 | `_L_while_start_0` |
| 类型插件文件 | `xxx.plugin.ts` | `integer.plugin.ts` |
| 操作名 | camelCase | `add`, `getIndex`, `setField` |

### 10.2 测试规范

1. 集成测试优先：复用 InterpreterTest 格式
2. 单元测试仅限 TypePlugin 的纯函数
3. 不测试内部 API，只测端到端行为
4. JsonCode 用快照测试验证编译结果

### 10.3 提交规范

1. 原子提交
2. 提交前：tsc 通过 + 相关测试通过
3. 不降低总测试通过率

### 10.4 冻结规范

- **Lexer**：冻结（除非需要位置信息扩展）
- **Parser**：暂时不冻结（需要添加 sourcePos）
- **AST Types**：暂时不冻结（需要添加 sourcePos 可选字段）
- 添加后：三者重新冻结
