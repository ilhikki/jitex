# Pascal → JS SourceMap 方案 v3（类型/接口分离，新增完整 API）

> 本文档为方案讨论稿，待用户定夺后实施。决策后把结论写进 `src/compiler/decide.md`。

## 设计原则（用户给定 + 补充）

1. **优先列出模块和模块间的交互**
2. **尽量冻结模块之间的接口**
3. **类型与 class 分离**：接口类型只暴露功能（输入/返回），不暴露存储实现（`Map`、`WeakMap`、数组等）。持久化走 `toJSON()` 方法，不由调用方直接操作内部结构。
4. **ast 重构**：本来就要重构（重复代码多），方向工厂函数 + 强制 loc。铁律 11 不阻止明确的重构任务。
5. **jsoncode 不动**：IR 保持不可变。
6. **分层 sourcemap**：
   - compiler（AST → JsonCode）输出 JsonCode + **JsonCodeSourceMap（功能接口）**
   - json-code-compiler（JsonCode → JS）输出 JS + **JS sourcemap（两个源：JsonCode + Pascal）**
7. **新增完整 API 接口函数，原 transform 不变**：不是改签名，而是 `transform → transformExecutable` 等新函数，原 `transform` 内部调用新函数并兼容旧行为。集成测试不变。
8. **JS 编译格式：兼顾三种运行场景**：
   - a) 动态调用（`new Function('__sys', ...)`，现状）
   - b) `<script/>` 标签引用（全局挂载）
   - c) ES module `import`
9. **无外部依赖**：不引入 `@jridgewell/gen-mappings` 等第三方库，手写 VLQ/base64 编码。
10. **颗粒度从粗开始**：先 statement 级映射，表达式级后续迭代。
11. **id → Pascal 名称映射**（修正之前的误解）：不是 id → JS 位置，而是 VarId / FunctionId / LabelId → 对应的 Pascal 标识符名。
12. **避免非必要特性**。

---

## 模块划分（6 个，接口冻结）

### 模块依赖图

```text
┌──────────┐    parse    ┌──────────────┐
│  lexer   │ ──────────► │   parser     │
│ (frozen) │             │  (frozen)    │
└──────────┘             └──────┬───────┘
                               │ ProgramNode
                               ▼
                        ┌──────────────┐     新增工厂 + 强制 loc
                        │     ast      │  ────────────────────────
                        │  (重构)      │
                        └──────┬───────┘
                               │ ProgramNode (所有节点 loc 必填)
                               ▼
┌───────────────────────────────────────────────────────────────┐
│  compiler  (AST → JsonCode + JsonCodeSourceMap)               │
│  ├─ analysis.ts   (符号表 / 类型 / ID → Pascal 名)            │
│  ├─ compiler.ts   (lowering + JsonCodeSourceMap 写入)          │
│  └─ json-code-source-map.ts  (新增：功能接口 class)           │
└──────────┬────────────────────────────────────────────────────┘
           │ JsonCode.Function + JsonCodeSourceMap (功能接口)
           ▼
┌───────────────────────────────────────────────────────────────┐
│  json-code-compiler (JsonCode → JS + SourceMap + id→PascalName)│
│  └─ json-code-compiler.ts                                      │
└──────────┬────────────────────────────────────────────────────┘
           │ Executable (code + map + idNames + 三种调用格式)
           ▼
┌───────────────────────────────────────────────────────────────┐
│  transform (顶层：新增完整 API，原 transform 内部调用新 API)    │
└───────────────────────────────────────────────────────────────┘
```

---

## 各模块职责与冻结接口

### 模块 1：`src/ast/`（重构）

**职责**：AST 节点类型 + 工厂函数（loc 强制）。

**对外类型（冻结）**：
```typescript
// src/ast/types.ts — 类型定义，不暴露构造
export interface AstNode { kind: string; loc: SourceLocation }  // loc 必填
export type StatementNode = AssignmentNode | IfStatementNode | ...
export type ExpressionNode = IdentifierNode | BinaryExpressionNode | ...
// ... 其余接口类型保持不变
```

**对外功能接口（冻结）**：
```typescript
// src/ast/factory.ts — 新增，class 实现，不暴露字段
export interface AstFactory {
  createProgram(name: IdentifierNode, params: IdentifierNode[], block: BlockNode, loc: SourceLocation): ProgramNode
  createIdentifier(name: string, loc: SourceLocation): IdentifierNode
  createAssignment(left: ExpressionNode, right: ExpressionNode, loc: SourceLocation): AssignmentNode
  createBinaryExpr(left: ExpressionNode, op: string, right: ExpressionNode, loc: SourceLocation): BinaryExpressionNode
  createIntegerLiteral(value: number, raw: string, loc: SourceLocation): IntegerLiteralNode
  // ... 所有节点类型对应一个工厂方法（loc 必填）
}
export const factory: AstFactory
```

**设计要点**：
- 不暴露「如何构造」的细节（对象字面量 vs class 实例）
- 调用方只能通过 factory 方法获取节点，TS 层面禁止 `{ kind: 'xxx', loc: ... }` 字面量构造（`loc` 字段类型与工厂绑定，或通过 branded type 防止绕过）

---

### 模块 2：`src/lexer/` 和 `src/parser/`（frozen）

**接口不变**：tokenize / parse，parser 内部实现改为使用 ast.factory。

---

### 模块 3：`src/compiler/json-code-source-map.ts`（新增）

**职责**：记录 JsonCode 节点 → Pascal 源位置。**类型与实现分离：只暴露功能，不暴露存储实现。**

**功能接口（冻结）**：
```typescript
// src/compiler/json-code-source-map.ts
import { JsonCode } from '@/compiler/json-code'
import { SourceLocation } from '@/ast/types'

/**
 * JsonCodeSourceMap — JsonCode ↔ Pascal 位置映射的功能接口。
 *
 * 调用方只能通过下述方法操作，不能直接访问内部存储字段。
 * 内部实现（Map / WeakMap / 数组等）可随时替换，不影响 API。
 */
export class JsonCodeSourceMap {
  /** @param sourceFile Pascal 源文件名，写入 sourcemap.sources */
  constructor(sourceFile: string)

  /** 记录一个 JsonCode.Statement 对应 Pascal 节点的位置 */
  addStatement(stmt: JsonCode.Statement, loc: SourceLocation): void

  /** 记录 Statement 内的子表达式对应 Pascal 节点位置（粗颗粒度版本可不实现） */
  addExpression(stmt: JsonCode.Statement, expr: JsonCode.Expr, loc: SourceLocation): void

  /** 查询某条 Statement 对应的 Pascal 位置；找不到返回 undefined */
  findStatement(stmt: JsonCode.Statement): SourceLocation | undefined

  /** 查询某条 Statement 下某个表达式对应的 Pascal 位置；找不到回退到 Statement loc */
  findExpression(stmt: JsonCode.Statement, expr: JsonCode.Expr): SourceLocation | undefined

  /** Pascal 源文件名（只读） */
  get sourceFile(): string

  /** 序列化为 JSON（若需要持久化）。不调用方不能直接用对象字段 */
  toJSON(): { sourceFile: string; entries: Array<{ path: string[]; loc: SourceLocation }> }
}
```

**设计要点**：
- 内部可以是 `Map<JsonCode.Statement, SourceLocation>`，但 class 之外看不到
- 将来要持久化，调 `toJSON()`，不直接 `JSON.stringify(instance)`

---

### 模块 4：`src/compiler/`（Pascal AST → JsonCode + JsonCodeSourceMap）

**职责**：lowering + 写入 JsonCodeSourceMap。

**功能接口（冻结）**：
```typescript
// src/compiler/compiler.ts
import type { Analysis } from '@/compiler/analysis'
import type { ProgramNode } from '@/ast/types'
import { JsonCode } from '@/compiler/json-code'
import { JsonCodeSourceMap } from '@/compiler/json-code-source-map'

/**
 * CompileOutput — Pascal 编译到 JsonCode 的结果。
 * 类型接口，不暴露内部字段。
 */
export interface CompileOutput {
  readonly jsonCode: JsonCode.Function
  readonly sourceMap: JsonCodeSourceMap
  /** id → Pascal 名称（来自 analysis.debugNames），写进 idNames 映射 */
  readonly idNames: ReadonlyMap<number, string>
}

export function compileProgram(
  ast: ProgramNode,
  analysis: Analysis,
  options?: { sourceFile?: string }
): CompileOutput
```

**设计要点**：
- `compileProgram` 返回功能接口对象，不直接返回元组
- `idNames` 直接给出来自 Analysis 的 id → Pascal 名（修正之前的 idLocations 误解）

---

### 模块 5：`src/compiler/json-code-compiler.ts`（JsonCode → JS + SourceMap）

**职责**：翻译 JsonCode 为可执行 JS + sourcemap + id→Pascal 名映射。

**功能接口（冻结）**：
```typescript
// src/compiler/json-code-compiler.ts
import { JsonCode } from '@/compiler/json-code'
import { JsonCodeSourceMap } from '@/compiler/json-code-source-map'

/** SourceMap V3（类型接口，字段公开但语义冻结，因为这是标准格式） */
export interface SourceMapV3 {
  version: 3
  sources: string[]              // 两个源：["foo.pas", "JsonCode.virtual.jsoncode"]
  sourcesContent?: string[]       // [pascalSource, jsonCodeText]
  names: string[]                 // Pascal 标识符名（用于 names 段）
  mappings: string                // base64 VLQ 字符串（手写）
}

/** JS 输出格式（面向三种调用场景） */
export type JsFormat =
  | 'exec'      // 兼容现状：返回 "return function f(__sys){...}"，外层 new Function 动态执行
  | 'script'    // <script/> 全局挂 `window.__pascalBinaryName = function(__sys){...}`
  | 'module'    // ES module："export default function f(__sys){...}"

/**
 * Executable — 编译产物的功能接口。
 * 调用方不应该手动拼接字符串，而是通过 as{Format}() 获取对应格式字符串。
 */
export interface Executable {
  /** 源码格式 —— 纯函数体，不含任何包装 */
  readonly functionBody: string
  /** 函数名（默认 v{functionId}_{name} 或匿名） */
  readonly functionName: string | undefined
  /** sourcemap（两个源：Pascal + 虚拟 JsonCode 源） */
  readonly sourceMap: SourceMapV3
  /** id → Pascal 名称（来自上游 analysis），可被调试器用做悬停提示名 */
  readonly idNames: ReadonlyMap<number, string>

  /**
   * 转换为三种格式之一的字符串（新的 format 可通过扩展枚举实现，不破坏已有接口）。
   * @param scriptName script 格式时的全局名，默认 `__pascalBin`
   * @param mapName    如果提供，则在末尾写 `//# sourceMappingURL=xxx.map`
   */
  as(format: 'exec'): string
  as(format: 'script', scriptName?: string, mapName?: string): string
  as(format: 'module', mapName?: string): string
}

export interface ToJsOptions {
  semantic?: SemanticCompiler
  debugNames?: Map<number, string>
  /** 上游传的 JsonCodeSourceMap，用于把 JS 映射透传到 Pascal 源 */
  jsonCodeSourceMap?: JsonCodeSourceMap
  /** Pascal 源码（写入 sourcesContent） */
  pascalSource?: string
  /** JsonCode 源（虚拟文件内容，用于调试 JsonCode 中间层；可选） */
  jsonCodeSource?: string
}

/**
 * 顶层 API：JsonCode → Executable。
 * 注意：返回 Executable（功能对象），不是字符串。
 */
export function toJs(
  fn: JsonCode.Function,
  options?: ToJsOptions & { idNames?: ReadonlyMap<number, string> }
): Executable
```

**设计要点**：
- SourceMap.sources 有 **两个条目**：
  1. `source.pas`：Pascal 真源
  2. `JsonCode.virtual.jsoncode`：虚拟 JsonCode 中间层源（DevTools 中可选看）
- `Executable.as(format)` 统一出口，而不是三个独立函数
- `idNames` 是 VarId → Pascal 名（从 analysis.debugNames），不是 JS 位置
- 零第三方依赖，VLQ/base64 编码手写

---

### 模块 6：`src/compiler/transform.ts`（新增完整 API）

**冻结不变的旧接口**：
```typescript
// 保持现状，内部调用新接口，保证所有集成测试零修改
export function transform(source: string, options?: TransformOptions): string
```

**新增完整 API（冻结）**：
```typescript
// 新增：完整编译到可执行 JS + sourcemap
export function transformExecutable(
  source: string,
  options?: TransformOptions & {
    sourceFile?: string        // 源文件名（写入 map.sources）
    outputFormat?: JsFormat    // 默认 'exec'（与 transform 兼容）
    scriptName?: string        // 当 format = 'script' 时的全局变量名
    emitJsonCodeSource?: boolean  // 是否把 JsonCode 源写进 sourcesContent（默认 true）
  }
): Executable
```

**调用图（保证旧集成测试零修改）**：
```text
transform(source, options)
  → const exe = transformExecutable(source, { ...options, outputFormat: 'exec' })
  → return exe.as('exec')   // 返回纯字符串，与旧行为完全一致

新代码 / e2e 报告：
  transformExecutable(source, { outputFormat: 'module', sourceFile: 'tex.web' })
    .as('module', 'tex.js.map')
  // 并把 exe.sourceMap 序列化写入 tex.js.map 作为 artifact
```

**对 e2e 的影响**：
- 所有集成测试零修改（因为 `transform` 行为不变）
- e2e 报告新增两个 artifact：`tex.js.map` + `tex.jsoncode.virtual.txt`（若需要）
- e2e 阶段 2/10 也新增 `tangle.js.map`

---

## 模块间交互（冻结契约）

### 交互 1：parser → ast.factory
```text
parser 调用 factory.createXxx(...)
  → 返回带强制 loc 的 AST 节点
```

### 交互 2：compiler → JsonCode + JsonCodeSourceMap
```text
compileProgram(ast, analysis, { sourceFile })
  → new JsonCodeSourceMap(sourceFile)
  → lowering 过程中每个 JsonCode.Statement 生成后，调用 sourceMap.addStatement(stmt, node.loc)
  → 返回 CompileOutput { jsonCode, sourceMap, idNames }
```

### 交互 3：json-code-compiler → 上游
```text
toJs(jsonCode, { jsonCodeSourceMap, pascalSource, idNames })
  → 每行 JS 生成时，若当前 stmt 在 jsonCodeSourceMap 中有对应 loc：
       - 写入 JS 行 → Pascal 行 映射（sources[0]）
     否则（或同时）：
       - 写入 JS 行 → JsonCode stmt 下标（sources[1]，虚拟源）
  → 返回 Executable（含 SourceMapV3 + idNames + as(format) 转换）
```

### 交互 4：transform 编排
```text
transformExecutable(source, options):
  1. ast = parseSource(source)
  2. analysis = analyzeProgram(ast, extensions, plugins)
  3. { jsonCode, sourceMap, idNames } = compileProgram(ast, analysis, { sourceFile })
  4. exe = toJs(jsonCode, {
       semantic,
       debugNames: options.debug ? idNames : undefined,
       jsonCodeSourceMap: sourceMap,
       pascalSource: source,
       idNames
     })
  5. return exe
```

---

## 待定夺的关键问题（更聚焦）

### 问题 1：`Executable.as(format)` 设计

| 方案 | 描述 |
|---|---|
| **a) 函数重载（如方案所示）**：`exe.as('exec')`、`exe.as('script', 'myBin', 'x.map')` | TS 友好，但参数顺序略不直觉 |
| **b) options 对象**：`exe.as({ format: 'script', scriptName, mapName })` | 命名清晰，易扩展 |
| **c) 三个独立方法**：`exe.asExec()` / `exe.asScript(name, map)` / `exe.asModule(map)` | 无歧义，IDE 友好 |

**建议**：c（三个独立方法，最清晰，无参数歧义）。

### 问题 2：script 格式的默认全局名

- a) `__pascalBin`
- b) 根据源文件名推导（`tangle.pas` → `__tangleBin`）
- c) 强制调用方传（抛错若缺）

**建议**：b，便于区分多个产物。

### 问题 3：JsonCode 虚拟源是否默认写进 sourcesContent

- a) 是（20KB 级别，可接受，方便调试中间层）
- b) 否（只在开发时通过选项开启）

**建议**：a（两个源都给，用户说"sourcemap 源两个都要"）。

### 问题 4：粗颗粒度起步的具体含义

| 方案 | 描述 |
|---|---|
| **a) 只做语句级映射**：`JsonCode.Statement` → Pascal `loc`，表达式级不处理（一条语句产生的多行 JS 全映射到语句首行） | 最快落地 |
| b) 语句级 + 条件表达式单独处理：`JumpIf.condition` → Pascal 条件表达式 loc | 成本中等 |

**建议**：a。

### 问题 5：`AstNode.loc` 改为必填后的缺失处理

parser 中仍有极少数节点（如格式化 BinaryExpression）构造时缺 loc，ast 重构后这些节点怎么处理？

| 方案 | 描述 |
|---|---|
| **a) 工厂参数里 loc 必填，但缺 loc 时允许工厂做"就近补位"**：比如 `createBinaryExpr(left, op, right, locOrUseChildLoc?)` 若没传就取 `{ start: left.loc.start, end: right.loc.end }` | 调用方省事 |
| b) 严格必填，调用方必须传 | 编译器报错，迫使 parser 侧补齐 |

**建议**：a，工厂内置兜底，减少调用方出错点。

### 问题 6：模块 5 的 VLQ/base64 手写实现

- 需要 1 个 `vlqEncode(n: number[]): string` 函数（约 30-40 行），用于把 mappings 编码成标准 base64 VLQ
- **不需要引入外部依赖**
- 是否需要独立文件 `src/compiler/vlq.ts`？

**建议**：独立文件，可单独测试。

---

## 实施步骤（待定夺后展开）

假设选项定为：c / b / a / a / a / 独立文件

### Phase 0：ast 重构（独立任务，先于 sourcemap）
- `src/ast/types.ts`：`AstNode.loc` 改为必填
- 新增 `src/ast/factory.ts`：所有 `createXxx(..., loc)` 方法，缺 loc 时兜底（左+右节点合并）
- `src/ast/index.ts`：暴露 `export * as factory from './factory'`
- parser 改为调用 `factory.createXxx`
- **集成测试 1058/1058 全通过，e2e 16/16 全通过**

### Phase 1：新增 JsonCodeSourceMap class（模块 3）
- 新建 `src/compiler/json-code-source-map.ts`，按冻结接口实现
- 新增单元测试：addStatement / findStatement / toJSON 轮询

### Phase 2：compiler 输出 CompileOutput（模块 4）
- compiler.ts 的 `compileProgram` 返回类型改为 `CompileOutput`
- lowering 过程中每个 JsonCode.Statement 生成后调用 `sourceMap.addStatement(stmt, node.loc)`
- Analysis 的 debugNames 作为 `idNames` 返回

### Phase 3：手写 VLQ/base64 编码（独立文件）
- `src/compiler/vlq.ts`：`encodeVLQSegment(numbers: number[]): string` 等方法
- 单元测试：标准 sourcemap 用例对拍

### Phase 4：JsCompilerImpl 行号游标 + Executable（模块 5）
- `JsCompilerImpl` 内部维护 `{ line, col }` 游标
- 每条 stmt 生成后收集 `(jsStartLine, sourceIdx, sourceLine, sourceCol)` 映射
- 实现 `SourceMapV3` + `Executable`，两个源都写入
- `Executable.asExec/asScript/asModule` 三种格式输出

### Phase 5：新增 transformExecutable 完整 API（模块 6）
- transformExecutable 返回 `Executable`
- 旧 `transform` 改为调用 `transformExecutable(...).asExec()`
- **集成测试 1058/1058 全通过（因为 transform 行为不变）**

### Phase 6：e2e 报告集成
- stages 2/10：生成 `tangle.js.map` / `tex.js.map`，加为 artifact
- 可选：stage 10 额外输出 `tex.virtual.jsoncode` 作为调试中间层的 artifact

### Phase 7：浏览器调试体验验证
- 用 `outputFormat: 'module'` 生成 tex.js + tex.js.map
- `<script type="module"> import tex82 from './tex.js' </script>` 打开
- 验证 DevTools Sources 面板：同时列出 foo.pas 和 JsonCode 虚拟源两个文件
- 验证断点、单步、错误堆栈回映到 Pascal

---

## 风险与缓解

| 风险 | 概率 | 缓解 |
|---|---|---|
| ast 重构破坏集成测试 | 中 | Phase 0 独立完成，通过所有现有测试再进入 sourcemap |
| `loc` 必填导致 parser 少数节点编译期报错 | 低 | 工厂方法内置兜底合并 loc（左.start + 右.end） |
| VLQ 编码手写有 bug | 低 | 独立 Phase + 单测对拍 |
| Executable 三种格式与旧 transform 不严格等价 | 中 | `transform` 直接走 `asExec()`，字符串逐字节对拍 |
| sourcemap 两个源的 mappings 混淆 | 中 | 先只做 Pascal 源一条映射通过后，再加 JsonCode 源 |

---

## 调研结论

**难度评估**：中等偏下（因为零外部依赖、分层清晰、颗粒度粗、旧 API 不变）。

**关键优势**：
- **所有集成测试零修改**：旧 `transform` 不变，内部调用新 API
- **零新增依赖**：VLQ 手写，无任何 package.json 变动
- **类型/实现分离**：`JsonCodeSourceMap`、`Executable` 全是 class + 方法接口，不暴露存储
- **JsonCode 完全不动**：符合用户给定原则
- **颗粒度从粗到细迭代**：先做 statement 级，保证可落地，表达式级后续加

**建议**：先定夺 6 个问题（或直接采用推荐组合），然后按 Phase 0 顺序实施。
