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

| Mode        | 行为                 |
|-------------|--------------------|
| `STEP_INTO` | 推进一个控制步骤，进入函数调用    |
| `STEP_OVER` | (后续) 推进一个步骤，但不进入函数 |
| `RUN`       | (后续) 运行到断点或结束      |

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

| Frame kind      | 对应 AST 节点                                | step 行为                                                              |
|-----------------|------------------------------------------|----------------------------------------------------------------------|
| `Program`       | `ProgramNode`                            | push 主 block 的 CompoundFrame，然后 done                                 |
| `Function`      | `ProcedureCallNode` / `FunctionCallNode` | 建局部 scope，push block 的 CompoundFrame；block done 时 pop scope 并 return |
| `Compound`      | `CompoundStatementNode`                  | 逐条 push 子语句的 Frame；全部执行完则 done                                       |
| `If`            | `IfStatementNode`                        | (M0) 评估条件，push then/else 分支 Frame                                    |
| `While`         | `WhileStatementNode`                     | (M0) 评估条件，若 true 则 push body Frame，下一轮再检查                            |
| `Repeat`        | `RepeatStatementNode`                    | push statements 的 CompoundFrame，完后评估 until 条件                        |
| `For`           | `ForStatementNode`                       | 初始化变量，push body Frame，每轮后递增/递减并检查                                    |
| `Case`          | `CaseStatementNode`                      | 评估表达式，匹配分支，push 对应 statement Frame                                   |
| `Goto`          | `GotoStatementNode`                      | 搜索 label，跳转到对应语句（ unwind/rebuild stack）                              |
| `Assignment`    | `AssignmentNode`                         | (M1) 评估右值，赋给左值                                                       |
| `ProcedureCall` | `ProcedureCallNode`                      | push FunctionFrame                                                   |
| `Empty`         | `EmptyStatementNode`                     | 立即 done                                                              |

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

### M0 — 控制流和函数跳转

实现 execution stack、FunctionFrame、StatementFrame、procedure call/return、statement traversal。

#### Baby M0 — 最小验证

只验证机制正确性：

- ✅ 函数调用（push FunctionFrame）
- ✅ 函数返回（pop FunctionFrame + scope 清理）
- ✅ scope 生命周期（创建/销毁）
- ✅ stack trace（打印调用栈）

不实现：

- ❌ expression 求值（条件用 mock）
- ❌ type system
- ❌ heap / 复杂对象
- ❌ IO (WRITE/READ 等)

**Baby M0 测试用例**：

```pascal
(* test 1: simple call/return + stack trace *)
PROGRAM TEST1;
PROCEDURE FOO;
BEGIN END;
BEGIN FOO END.

(* test 2: nested call + scope *)
PROGRAM TEST2;
PROCEDURE OUTER;
  PROCEDURE INNER;
  BEGIN END;
BEGIN INNER END;
BEGIN OUTER END.

(* test 3: multiple calls + return *)
PROGRAM TEST3;
PROCEDURE A; BEGIN END;
PROCEDURE B; BEGIN A; END;
PROCEDURE C; BEGIN B; END;
BEGIN C END.
```

预期验证：

- 每步 step 后 stack 的深度和 kind 正确
- 进入函数时 scope 创建，退出时 scope 不再可访问
- stackTrace() 输出函数调用链

#### M0 Full — 所有 statement 的控制流

在 Baby M0 基础上，为每种 statement 实现 Frame：

- CompoundFrame：语句遍历
- IfFrame：条件分支（条件求值用 mock，始终走 then）
- WhileFrame / RepeatFrame / ForFrame：循环控制（条件用 mock）
- CaseFrame：分支选择
- GotoFrame：标签跳转
- AssignmentFrame：占位（M1 实现）
- EmptyFrame：立即完成

### M1 — 简单表达式和赋值

- 实现 expression evaluator：`evalExpr(expr, scope): Value`
- 支持：整数、字符串、char、boolean 字面量
- 支持：标识符查找
- 支持：二元运算 (+ - * / DIV MOD AND OR)
- 支持：比较运算 (= <> < <= > >=)
- 支持：一元运算 (NOT - +)
- 实现 assignment
- 支持：函数调用作为表达式
* 执行 knuth/web/tangle-official.pas 为验收标准, 但mock：遇到不认识的类型，循环和 goto 递归第二次遇到时直接跳过。

### M2 — Pascal 类型系统

- 实现 range 检查
- 实现 array / record / file 类型
- 实现 VAR 参数（引用传递）
- 实现类型转换

### M3 — 标准库

- 实现 I/O：WRITE / WRITELN / READ / READLN
- 实现：RESET / REWRITE / GET / PUT / EOF / EOLN
- 实现：CHR / ORD / ROUND / TRUNC / ABS
- 实现：BREAK / CONTINUE / EXIT
- ✅ **IO 抽象层重构**：PascalFile 抽象为仅含 url+offset 的接口，通过 `state.io`（包含 file 和 console）实现。默认内存实现，控制台默认无操作，可替换为网络/本地文件

### M4 — 非 debugger 模式和优化

- 实现 RUN 模式（跳过断点检查，减少帧操作开销）
- 实现 STEP_OVER 模式
- 直接执行模式（不走 step-by-step）
- 性能优化

## 项目结构

```
src/
├── ast/                        # ❄️ 冻结
├── lexer/                      # ❄️ 冻结
├── parser/                     # ❄️ 冻结
├── interpreter/                # 🆕 PDI
│   ├── types.ts                # State, Frame, Scope, Value 类型 + 工厂函数
│   ├── types/
│   │   └── pascal-value.ts     # PascalValue, PascalType, 类型系统实现
│   ├── io.ts                   # 抽象 IO 层 (PascalFile, PascalIO, PascalConsole, 默认内存实现)
│   ├── frames.ts               # 所有 Frame 类型 (Program, Compound, Function, ProcedureCall, If, While, Repeat, For, Case, Goto, Assignment, Empty)
│   ├── evaluator.ts            # 表达式求值器 + 系统函数注册
│   ├── run.ts                  # run(state, mode)
│   └── index.ts                # 公开 API
├── tests/
│   └── interpreter/
│       ├── baby-m0-call-return.test.ts
│       ├── baby-m0-scope.test.ts
│       └── baby-m0-stack-trace.test.ts
└── index.ts                    # 更新入口
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

## Value (M0 占位)

```typescript
type Value = number | string | boolean | null | undefined
// M0 中 Value 不重要，只验证控制流
// M1/M2 会扩展为完整的类型系统
```

## Git 策略

- 每个 milestone 完成后提交
- 每个 issue 修复后提交
- Baby M0 完成后提交
- M0 Full 完成后提交

## 测试策略

- Baby M0 使用最小 Pascal 程序（手写）
- 验证 stack 状态而非输出结果
- 验证 scope 创建/销毁
- 验证 stackTrace 输出
