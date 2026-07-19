# M5 — 高性能执行

> **当前阶段**：M5
> **目标**：在不改变语义的前提下，实现高性能执行引擎，让 TEX82 能在合理时间内完成
> **前置阶段**：[M4 VM + TypePlugin + Pascal82 + TEX82](../plan-tex82.md)（已完成，代码冻结）
> **指导原则**：代码冻结、测试复用、渐进验证、不排除其他方案

## 一、阶段定位

M4 已经完成了 VM + TypePlugin 模型、Pascal82 规范一致性、TEX82 移植验证。827 个测试全绿，TRIP 测试已启动并输出版本号。但 VM 性能瓶颈凸显：1 亿步耗时 32 秒（264 万步/秒），TEX82 完整运行需要数十亿步，当前速度无法接受。

**M5 的核心任务是高性能执行**，让 TEX82 在合理时间内跑完。当前选定方案是**编译为 JS**，但不排除其他可能（栈式 VM、WASM 等），视评估和原型验证结果而定。

## 二、代码冻结声明

以下代码在 M5 期间**冻结，不修改**，作为基线和 fallback：

```
src/
├── ast/                 # ❄️ 冻结
├── lexer/               # ❄️ 冻结
├── parser/              # ❄️ 冻结
├── static-analyzer/     # ❄️ 冻结（AST → JsonCode）
├── types/               # ❄️ 冻结（TypePlugin 系统）
└── vm/                  # ❄️ 冻结（解释执行 VM）
```

M5 的新代码放在新目录下（如 `src/js-compiler/`），不改动上述任何文件。新引擎与现有 VM 通过同一套测试用例验证语义一致性。

## 三、方案评估与选型

### 3.1 已评估方案

| 方案 | 预期加速 | 工程量 | 关键难点 | 结论 |
|------|---------|--------|---------|------|
| 指令融合 | ~1x | 小 | 只是换皮，工作量没少 | ❌ 否决 |
| TYPE_OP 预绑定 | ~1.1x | 小 | findOp 开销占比小 | ✅ 已做（M4 末尾） |
| Ref 索引化 | 1.2-1.3x | 中 | 仍是解释器 | ⚠️ 备选 |
| 栈式 VM（类型化数组） | 3-5x | 中 | 运算指令缺失、复杂类型打折 | ⚠️ 备选 |
| WASM（字符串拼 WAT） | 3-5x | 极大 | 异步死穴、PascalValue 跨边界、plugin 生成 | ❌ 否决 |
| **编译为 JS（从 AST）** | **10-30x** | **中** | var 参数、goto、步数限制 | ✅ **当前选定** |

### 3.2 选定方案：编译为 JS（从 AST）

**为什么从 AST 而不是从 JsonCode**：
- AST 有完整的类型信息（经 StaticAnalyzer 推断），可以按类型生成最优代码
- 能跳过 PascalValue 装箱——integer/boolean/char 直接用 JS 裸值，V8 JIT 可优化为寄存器变量
- JsonCode 的 Ref 模型（global/local/temp + upLevel）会束缚代码生成质量

**生成的代码示例**：

```pascal
{ Pascal }
WHILE I < N DO
BEGIN
  J := J + 1;
  I := I + 1;
  IF (I MOD 100) = 0 THEN WRITELN(J)
END
```

```js
// 编译生成的 JS（integer 用裸 number，无装箱）
while (I < N) {
  J = (J + 1) | 0
  I = (I + 1) | 0
  if ((I - Math.trunc(I / 100) * 100) === 0) {
    await ctx.sysCall('WRITELN', [{ typeId: 'integer', raw: J }])
  }
}
```

**按类型分治的编译策略**：

| 类型 | 编译方式 | 示例 |
|------|---------|------|
| integer | 裸 number + `\| 0` | `I = (I + 1) \| 0` |
| real | 裸 number | `X = X + 0.5` |
| boolean | 裸 boolean | `B = I < N` |
| char | 裸 number (char code) | `C = 65` |
| string | PascalValue + plugin.invoke | `invoke('binary', 'CONCAT', S1, S2)` |
| array/record | PascalValue + plugin.invoke | `invoke('index', A, i)` |
| file | PascalValue + sysCall | `await sysCall('READ', [F])` |

### 3.3 不排除其他可能

M5 保持方案灵活性。如果编译为 JS 在某些场景（如 goto 密集、过程参数复杂）遇到硬伤，可回退到：
- **栈式 VM**：类型化数组存储 + 精简指令集，3-5x 加速
- **混合模式**：热点过程编译为 JS，其余走 VM

最终方案以原型验证数据为准。

## 四、工作原则

1. **代码冻结**：不修改 `src/` 下任何现有文件。新代码放新目录。
2. **测试复用**：M4 的全部测试用例（`tests/m4/`）重命名为 `tests/m5/`，修改 helper 支持新引擎，测试用例本身不动。
3. **语义一致**：新引擎的输出必须与 VM 完全一致。任何不一致先开 issue。
4. **渐进验证**：先支持 integer + 基本控制流（跑通 bench），再逐步扩展到 string/array/record/file。
5. **性能驱动**：每完成一个类型支持，跑 bench 测效率，确认有实际加速。
6. **VM 作为 fallback**：新引擎处理不了的场景（如跨过程 goto）回退到 VM。

## 五、测试策略

### 5.1 测试目录迁移

```
tests/m4/                    # 重命名为 tests/m5/
├── _helper.ts               # 修改：支持 JS 编译器执行路径
├── q01-basics.test.ts       # 不动
├── q02-control-flow.test.ts # 不动
├── ...                      # 所有测试用例不动
└── q15-issue033-*.test.ts   # 不动
```

### 5.2 _helper.ts 改造

`_helper.ts` 增加新的执行入口，支持选择执行引擎：

```typescript
export interface VMTest {
  name: string
  code: string
  // ... 原有字段不变
  engine?: 'vm' | 'js'  // 执行引擎，默认 'js'（M5 目标），'vm' 作为对比
}

export async function runVM(test: VMTest): Promise<VMState> {
  const engine = test.engine || 'js'
  if (engine === 'js') {
    return await runJS(test.code, { ... })  // 新的 JS 编译器
  }
  return await runVMImpl(test.code, { ... })  // 原 VM（fallback）
}
```

所有测试用例的 `code` 不变，只是执行引擎换了。如果新引擎输出与预期不符，说明有 bug，开 issue 修复。

### 5.3 验收标准

- `tests/m5/` 下所有测试用 `engine: 'js'` 跑通，输出与 `engine: 'vm'` 一致
- `tests-tex/` 下 TEX82 测试在新引擎下能跑通
- bench 测试：1 亿步从 32 秒降到 **5 秒以内**（目标 5x+ 加速）

## 六、任务拆分

### Phase 0: 基础设施（P0）

- [ ] 将 `tests/m4/` 重命名为 `tests/m5/`
- [ ] 修改 `tests/m5/_helper.ts`：增加 `engine` 字段，默认走 VM（此时 JS 编译器还未实现）
- [ ] 确认所有测试仍通过（engine 默认 vm）
- [ ] 创建 `src/js-compiler/` 目录结构

### Phase 1: 运行时上下文 + integer/boolean（P0）

**目标**：让 bench 测试程序在 JS 引擎下跑通，测出加速比。

- [ ] RuntimeContext：`{ globals, sysCall, invoke, steps, maxSteps }`
- [ ] 表达式编译：IntegerLiteral / BooleanLiteral / Identifier / BinaryExpression / UnaryExpression
- [ ] 语句编译：Assignment / IfStatement / WhileStatement / ForStatement / CompoundStatement
- [ ] 过程编译：每个 Pascal 过程 → 一个 JS 函数
- [ ] SYS_CALL 桥接：`await ctx.sysCall(...)`
- [ ] 步数限制：循环开头插检查点

**验收**：bench（1 亿步）在 JS 引擎下跑通，速度 >= 500 万步/秒

### Phase 2: char / real / string（P1）

- [ ] char：裸 number（char code），CHR/ORD 直接编译
- [ ] real：裸 number（float）
- [ ] string：PascalValue + string plugin invoke
- [ ] 对应测试用例跑通

### Phase 3: array / record / set / file（P1）

- [ ] array：PascalValue + array plugin invoke（index/setIndex/assign）
- [ ] record：PascalValue + record plugin invoke（field/setField）
- [ ] set：PascalValue + set plugin invoke
- [ ] file：PascalValue + sysCall + io 桥接
- [ ] WITH 语句：展开为字段访问
- [ ] 对应测试用例跑通

### Phase 4: 过程嵌套 / var 参数 / goto（P2）

- [ ] 嵌套过程：JS 闭包天然支持，验证 upLevel 语义
- [ ] var 参数：用包装对象 `{ value: T }` 或数组下标实现引用语义
- [ ] 过程参数：生成 JS 函数对象，带闭包上下文
- [ ] goto：label 语句 / 跳转表 / 异常模拟（评估哪种最实际）
- [ ] 对应测试用例跑通

### Phase 5: TEX82 验证（P2）

- [ ] TRIP 测试在新引擎下跑通
- [ ] 对比 VM 输出一致性
- [ ] 测量 TEX82 实际运行时间
- [ ] 如有硬伤，评估混合模式（热点 JS + 其余 VM）

## 七、难点清单

| 难点 | 严重程度 | 初步方案 |
|------|---------|---------|
| var 参数（传引用） | 高 | 包装对象 `{ value: T }` 或数组下标 |
| 嵌套过程访问外层变量 | 中 | JS 闭包天然支持 |
| 过程作为参数 | 中 | 生成 JS 函数对象 + 闭包 |
| goto 语句（TEX82 大量使用） | 高 | labeled break/continue / 跳转表 / 异常模拟 |
| 步数限制 | 中 | 循环开头插检查点 |
| 异步操作（file IO） | 低 | `async function` + `await` |
| 变体记录 | 中 | PascalValue + record plugin |

## 八、目录结构约定

```
src/
├── ast/                        # ❄️ 冻结
├── lexer/                      # ❄️ 冻结
├── parser/                     # ❄️ 冻结
├── static-analyzer/            # ❄️ 冻结
├── types/                      # ❄️ 冻结
├── vm/                         # ❄️ 冻结（fallback）
└── js-compiler/                # 🆕 M5 新增
    ├── index.ts                # 公开 API：compile(ast) → async function
    ├── context.ts              # RuntimeContext 定义
    ├── expression.ts           # ExpressionNode → JS 代码字符串
    ├── statement.ts            # StatementNode → JS 代码字符串
    ├── procedure.ts            # ProcDecl → JS 函数字符串
    └── helpers.ts              # 类型判断、变量映射等辅助

tests/
├── m5/                         # 从 m4 重命名
│   ├── _helper.ts              # 改造：支持 engine 字段
│   ├── q01 ~ q15              # 测试用例不动
│   └── ...
└── temp/
    └── bench.ts                # 基准测试（增加 engine 选择）
```

## 九、性能目标

| 指标 | M4 基线（VM） | M5 目标（JS 编译） | 加速比 |
|------|-------------|------------------|--------|
| 1 亿步（纯计算） | 32 秒，264 万步/秒 | < 5 秒，> 2000 万步/秒 | 5x+ |
| TEX82 TRIP | 未完成 | 完成且输出一致 | - |
| TEX82 texbook | 不可行 | 可行（合理时间内） | - |

## 十、参考

- **M4 基线**：[plan-tex82.md](../plan-tex82.md)、[plan-m4.1-pascal82-conformance.md](./plan-m4.1-pascal82-conformance.md)
- **现有 VM 实现**：`src/vm/vm.ts`（解释执行）、`src/vm/state.ts`（状态模型）
- **TypePlugin 系统**：`src/types/index.ts`（插件接口）、`src/types/integer.plugin.ts`（参考实现）
- **AST 结构**：`src/ast/types.ts`
- **StaticAnalyzer**：`src/static-analyzer/index.ts`（作用域解析 + 类型推断 + 代码生成参考）
- **基准测试**：`tests/temp/bench.ts`
- **测试 helper**：`tests/m4/_helper.ts`（待重命名为 m5）
