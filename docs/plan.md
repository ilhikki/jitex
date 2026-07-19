# Pascal Debug Interpreter (PDI) 实现计划

## 原则

- **冻结 parser**：不修改 `src/ast/`、`src/lexer/`、`src/parser/` 下任何文件
- **不设计 bytecode**：第一阶段只实现 AST interpreter
- **State 是唯一运行状态**：`run(state, mode)` 原地修改 state
- **FP 风格**：延续 AST 层的 record + 鸭子类型风格

## 执行模型

```
run(state: State, mode: RunMode): void
```

- `state` 是唯一的运行时状态，`run` 原地修改它
- 每次 `run` 调用推进一个控制步骤
- 要运行到结束，循环调用 `run` 直到 `state.status === 'terminated'`

### RunMode

| Mode        | 行为                 | 状态 |
|-------------|--------------------|------|
| `STEP_INTO` | 推进一个控制步骤，进入函数调用    | ✅ 已实现 |
| `STEP_OVER` | (后续) 推进一个步骤，但不进入函数 | ❌ 未实现 |
| `RUN`       | (后续) 运行到断点或结束      | ❌ 未实现 |

第一阶段只实现 `STEP_INTO`。

## State

```typescript
interface State {
    // 执行栈
    stack: Frame[]

    // 作用域链
    globalScope: Scope
    currentScope: Scope

    // 程序信息
    program: ProgramNode
    declarations: DeclarationTable  // 查表：名字 -> 声明

    // 运行状态
    status: 'running' | 'terminated'
    returnValue: Value | null

    // IO 层 (抽象)
    io: PascalIO             // file: PascalFileOps, console: PascalConsole

    // 系统过程/函数 (注册表)
    systemProcedures: Map<string, ...>
    systemFunctions: Map<string, ...>

    // Debugger observer (后续)
    breakpoints: Set<string>
    watches: Map<string, WatchCallback>
    stepCallback: (() => void) | null
}
```

### Scope

```typescript
interface Scope {
    variables: Map<string, Value>
    parent: Scope | null  // 静态父作用域
    functionDecl: ProcedureDeclarationNode | FunctionDeclarationNode | null
    // functionDecl === null 表示全局作用域
}
```

作用域链遵循 Pascal 的词法嵌套规则：

- 全局作用域 → parent = null
- 过程局部作用域 → parent = 该过程定义所在的作用域（静态链接）

## Frame 设计

每种 statement 定义自己的控制规则。Frame 是执行栈上的一个帧。

```typescript
interface Frame {
    kind: string          // 鸭子类型标识
    done: boolean         // 是否完成
    step(state: State): void  // 推进一个步骤
}
```

`step(state)` 可以做三件事：

1. **修改自身状态**（如推进语句索引）
2. **push 新 Frame**（如进入函数体）
3. **标记自身 done**（让 `run` 自动 pop）

### Frame 类型与 step 行为

| Frame kind      | 对应 AST 节点                                | step 行为                                                              | 状态 |
|-----------------|------------------------------------------|----------------------------------------------------------------------|------|
| `Program`       | `ProgramNode`                            | push 主 block 的 CompoundFrame，然后 done                                 | ✅ |
| `Function`      | `ProcedureCallNode` / `FunctionCallNode` | 建局部 scope，push block 的 CompoundFrame；block done 时 pop scope 并 return | ✅ |
| `Compound`      | `CompoundStatementNode`                  | 逐条 push 子语句的 Frame；全部执行完则 done                                       | ✅ |
| `If`            | `IfStatementNode`                        | 评估条件，push then/else 分支 Frame                                    | ✅ |
| `While`         | `WhileStatementNode`                     | 评估条件，若 true 则 push body Frame，下一轮再检查                            | ✅ |
| `Repeat`        | `RepeatStatementNode`                    | push statements 的 CompoundFrame，完后评估 until 条件                        | ✅ |
| `For`           | `ForStatementNode`                       | 初始化变量，push body Frame，每轮后递增/递减并检查                                    | ✅ |
| `Case`          | `CaseStatementNode`                      | 评估表达式，匹配分支，push 对应 statement Frame                                   | ✅ |
| `Goto`          | `GotoStatementNode`                      | 搜索 label，跳转到对应语句（ unwind/rebuild stack）                              | ✅ |
| `Assignment`    | `AssignmentNode`                         | 评估右值，赋给左值                                                       | ✅ |
| `ProcedureCall` | `ProcedureCallNode`                      | push FunctionFrame                                                   | ✅ |
| `Empty`         | `EmptyStatementNode`                     | 立即 done                                                              | ✅ |

### run 函数逻辑

```
function run(state, mode):
  if state.status === 'terminated': return
  if state.stack.length === 0:
    state.status = 'terminated'
    return

  frame = state.stack[top]
  frame.step(state)

  // 清理 done 的帧
  while state.stack.length > 0 && state.stack[top].done:
    state.stack.pop()
```

## 里程碑

### M0 — 控制流和函数跳转 ✅

实现 execution stack、FunctionFrame、StatementFrame、procedure call/return、statement traversal。

#### Baby M0 — 最小验证 ✅

只验证机制正确性：

- ✅ 函数调用（push FunctionFrame）
- ✅ 函数返回（pop FunctionFrame + scope 清理）
- ✅ scope 生命周期（创建/销毁）
- ✅ stack trace（打印调用栈）

**Baby M0 测试用例**：见 `tests/interpreter/baby-m0.test.ts`

#### M0 Full — 所有 statement 的控制流 ✅

在 Baby M0 基础上，为每种 statement 实现 Frame：

- ✅ CompoundFrame：语句遍历
- ✅ IfFrame：条件分支
- ✅ WhileFrame / RepeatFrame / ForFrame：循环控制
- ✅ CaseFrame：分支选择
- ✅ GotoFrame：标签跳转
- ✅ AssignmentFrame：占位（M1 实现）
- ✅ EmptyFrame：立即完成

### M1 — 简单表达式和赋值 ✅

- ✅ 实现 expression evaluator：`evalExpr(expr, scope): Value`
- ✅ 支持：整数、字符串、char、boolean 字面量
- ✅ 支持：标识符查找
- ✅ 支持：二元运算 (+ - * / DIV MOD AND OR)
- ✅ 支持：比较运算 (= <> < <= > >=)
- ✅ 支持：一元运算 (NOT - +)
- ✅ 实现 assignment
- ✅ 支持：函数调用作为表达式
- ✅ 执行 knuth/web/tangle-official.pas 为验收标准

### M2 — Pascal 类型系统 ⚠️ 部分实现

- ✅ 实现 range 检查
- ✅ 实现 array / record / file 类型
- ⚠️ 实现 VAR 参数（引用传递）— **部分实现，存在 bug**
- ✅ 实现类型转换

**待修复 bug**：VAR 参数不修改原变量（INTERPRETER-BUGS.md #11）

### M3 — 标准库 ⚠️ 部分实现

- ✅ 实现 I/O：WRITE / WRITELN / READ / READLN
- ⚠️ 实现：RESET / REWRITE / GET / PUT / EOF / EOLN — **部分实现**
- ✅ 实现：CHR / ORD / ROUND / TRUNC / ABS
- ✅ 实现：BREAK / CONTINUE / EXIT
- ✅ **IO 抽象层重构**：PascalFile 抽象为仅含 url+offset 的接口，通过 `state.io`（包含 file 和 console）实现。默认内存实现，控制台默认无操作，可替换为网络/本地文件

**待修复问题**：
- writeln 多参数输出异常（INTERPRETER-BUGS.md #5）
- readln 输入读取问题（INTERPRETER-BUGS.md #6）
- eof/eoln 检测失败（INTERPRETER-BUGS.md #7）

### M4 — VM + TypePlugin + Pascal82 一致性 + TEX82 ✅

- ✅ M4.0：VM + TypePlugin 模型（JsonCode 中间码 + 解释执行）
- ✅ M4.1：Pascal82 规范一致性（TANGLE 端到端 + 自举验证通过）
- ✅ M4.2：TEX82 移植与验证（tex.pas 编译通过、初始化通过、TRIP 测试启动）
- ✅ 性能优化：同步指令跳过 await + TYPE_OP 预绑定（89万→264万步/秒，~2.9x）

> **M4 代码冻结**：`src/` 下所有代码作为基线冻结，M5 不修改，仅作为 fallback 保留。
> 详见 [M5 高性能执行计划](./plan-m5-high-performance.md)

### M5 — 高性能执行 🚧

- 🚯 **代码冻结**：Lexer / Parser / AST / StaticAnalyzer / VM / TypePlugin 全部冻结
- 🎯 **目标**：在不改变语义的前提下，实现高性能执行引擎
- 📌 **当前方案**：编译为 JS（从 AST 直接编译到 JS 代码字符串，`new Function()` 执行）
- 📌 **不排除其他可能**：如栈式 VM、WASM 等，视评估结果而定
- 🔄 **测试复用**：将 `tests/m4` 重命名为 `tests/m5`，复用全部测试用例验证新引擎
- 📄 详见 [M5 高性能执行计划](./plan-m5-high-performance.md)

## 项目结构

```
src/
├── ast/                        # ❄️ 冻结 ✅
├── lexer/                      # ❄️ 冻结 ✅
├── parser/                     # ❄️ 冻结 ✅
├── interpreter/                # 🆕 PDI
│   ├── types.ts                # State, Frame, Scope, Value 类型 + 工厂函数 ✅
│   ├── types/
│   │   └── pascal-value.ts     # PascalValue, PascalType, 类型系统实现 ✅
│   ├── io.ts                   # 抽象 IO 层 (PascalFile, PascalIO, PascalConsole, 默认内存实现) ✅
│   ├── frames.ts               # 所有 Frame 类型 ✅
│   ├── evaluator.ts            # 表达式求值器 + 系统函数注册 ✅
│   ├── run.ts                  # run(state, mode) ✅
│   └── index.ts                # 公开 API ✅
├── tests/
│   ├── lexer/                  # ✅
│   │   └── lexer.test.ts
│   ├── parser/                 # ✅
│   │   ├── productions.test.ts
│   │   └── statements-decls.test.ts
│   ├── m3.5/                   # ✅ Parser 测试 (p01-p08)
│   │   ├── _helper.ts
│   │   ├── p01-parser-boundary.test.ts
│   │   ├── p02-operator-precedence.test.ts
│   │   ├── p03-scope.test.ts
│   │   ├── p04-procedure-function.test.ts
│   │   ├── p05-recursion.test.ts
│   │   ├── p06-error-handling.test.ts
│   │   ├── p07-fuzz.test.ts
│   │   └── p08-parser-robustness.test.ts
│   ├── m3.6/                   # ⚠️ Interpreter 测试 (q01-q07, q09)
│   │   ├── _helper.ts
│   │   ├── q01-scope.test.ts
│   │   ├── q02-parameters.test.ts
│   │   ├── q03-goto.test.ts
│   │   ├── q04-array-record.test.ts
│   │   ├── q05-operations.test.ts
│   │   ├── q06-io.test.ts
│   │   ├── q07-control.test.ts
│   │   └── q09-nonstandard-rejected.test.ts
│   └── interpreter/            # ⚠️ 集成测试
│       ├── baby-m0.test.ts
│       ├── m0-statements.test.ts
│       ├── m1-expressions.test.ts
│       ├── m1-labels.test.ts
│       ├── m2-parameters.test.ts
│       ├── m3-stdlib.test.ts
│       ├── io-record-file-ops.test.ts
│       ├── tangle-min-repro.test.ts
│       ├── tangle-functions.test.ts
│       ├── tangle-run.test.ts
│       └── min-pas-repro.test.ts
└── index.ts                    # 更新入口 ✅
```

## DeclarationTable

从 ProgramNode 提取所有声明，支持按名查找：

```typescript
interface DeclarationTable {
    // 全局声明
    procedures: Map<string, ProcedureDeclarationNode>
    functions: Map<string, FunctionDeclarationNode>
    variables: Map<string, VariableDeclarationNode>
    constants: Map<string, ConstDeclarationNode>
    types: Map<string, TypeDeclarationNode>
    labels: Map<number, StatementNode>  // label -> target statement

    // 嵌套查找：根据 scope 链查找
    findProcedure(name: string, scope: Scope): ProcedureDeclarationNode | null

    findFunction(name: string, scope: Scope): FunctionDeclarationNode | null
}
```

Pascal 的嵌套声明需要考虑：

- 过程/函数内部可以声明自己的过程/函数
- 查找时从当前 scope 开始，沿静态链向上查找

## Value

```typescript
interface PascalValue {
    type: PascalType
    value: number | boolean | string | Uint8Array | null | Map<string, PascalValue>
}
```

## Git 策略

- ✅ 每个 milestone 完成后提交
- ✅ 每个 issue 修复后提交
- ✅ 遵循 issue-fixing skill 的工作流

## 测试策略

- ✅ Baby M0 使用最小 Pascal 程序（手写）
- ✅ 验证 stack 状态而非输出结果
- ✅ 验证 scope 创建/销毁
- ✅ 验证 stackTrace 输出
- ✅ m3.5: 300+ Parser 测试
- ⚠️ m3.6: 300+ Interpreter 运行时测试（部分完成）

## 当前状态

### 已完成
- ✅ Parser (M0-M3.5)：所有 parser 测试通过
- ✅ Lexer：所有 lexer 测试通过
- ✅ M0 控制流：所有 statement frame 实现完成
- ✅ M1 表达式和赋值：表达式求值器完成
- ✅ M2 基础类型系统：array/record/file 类型实现
- ✅ M3 标准库基础：WRITE/WRITELN/READ/READLN 实现
- ✅ IO 抽象层：内存文件操作实现

### 进行中
- ⚠️ P0 测试代码问题：q04/q06 中的非标准语法测试
- ⚠️ P1 IO 库：eof/eoln/get/put 实现
- ⚠️ P2 类型系统：枚举/数组/记录参数传递
- ⚠️ P3 VAR 参数：引用传递修复
- ⚠️ P4 WITH 语句：字段访问实现
- ⚠️ P4 TANGLE module 扫描：修复多 module_name 引用 bug

### 待开始
- ❌ M4 非 debugger 模式
- ❌ 性能优化

## 参考文档

- [issue-fixing skill](.trae/skills/issue-fixing/SKILL.md)：问题修复工作流和优先级矩阵
- [INTERPRETER-BUGS.md](issue/INTERPRETER-BUGS.md)：完整 bug 列表和修复顺序