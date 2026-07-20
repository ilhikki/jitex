# M5 — 高性能执行（JS 编译器）

> **当前阶段**：M5
> **目标**：在不改变语义的前提下，将 Pascal82 编译为 JS 执行，让 TEX82 能在合理时间内完成
> **指导原则**：测试复用、渐进验证、问题驱动

## 一、阶段定位

M5 的核心任务是高性能执行。选定方案是**编译为 JS**（从 AST 直接生成 JS 代码字符串，`new AsyncFunction()` 执行），让 V8 JIT 优化热点代码。

## 二、代码架构

```
src/
├── ast/                 # AST 类型定义
├── lexer/               # 词法分析器
├── parser/              # 语法分析器
└── js-compiler/         # JS 编译器（M5）
    ├── types/           # TypePlugin 系统
    ├── index.ts         # 公开 API
    └── ...
```

前端（AST/Lexer/Parser）保持稳定，JS 编译器持续迭代。

## 三、方案选型

| 方案 | 预期加速 | 结论 |
|------|---------|------|
| 指令融合 | ~1x | ❌ 否决 |
| TYPE_OP 预绑定 | ~1.1x | ✅ 已做（M4 末尾） |
| 栈式 VM | 3-5x | ⚠️ 备选 |
| WASM | 3-5x | ❌ 否决（工程量极大） |
| **编译为 JS（从 AST）** | **10-30x** | ✅ **当前选定** |

**为什么从 AST 而不是 JsonCode**：
- AST 有完整的类型信息，可以按类型生成最优代码
- integer/boolean/char 直接用 JS 裸值，V8 JIT 可优化为寄存器变量
- 跳过 PascalValue 装箱开销

## 四、编译策略

| 类型 | 编译方式 | 示例 |
|------|---------|------|
| integer | 裸 number + `\| 0` | `I = (I + 1) \| 0` |
| real | 裸 number | `X = X + 0.5` |
| boolean | 裸 boolean | `B = I < N` |
| char | 裸 number (char code) | `C = 65` |
| string | PascalValue + plugin.invoke | `invoke('binary', 'CONCAT', S1, S2)` |
| array/record | PascalValue + plugin.invoke | `invoke('index', A, i)` |
| file | PascalValue + sysCall | `await sysCall('READ', [F])` |

## 五、测试策略

### 5.1 测试全部走 JS 编译器

`tests/m5/` 和 `tests-tex/` 下所有测试全部走 JS 编译器。

### 5.2 非标扩展配置化

部分非标扩展（如 goto 无 LABEL 声明）通过配置项开启：

```typescript
runJS(code, {
  allowUndeclaredLabels: true  // 默认 false，标准模式应报错
})
```

标准测试验证**不支持**该特性（应报错），兼容性测试启用该特性验证行为一致。

## 六、任务拆分

### Phase 0: 基础设施 ✅

- [x] 将 `tests/m4/` 重命名为 `tests/m5/`
- [x] 修改 `tests/m5/_helper.ts`：默认走 JS（`engine: 'js'`）
- [x] 创建 `src/js-compiler/` 目录
- [x] `tests-tex/` 下所有执行入口统一改为 `runJS`

### Phase 1: 运行时上下文 + integer/boolean ✅

- [x] RuntimeContext：`{ globals, sysCall, invoke, steps, maxSteps }`
- [x] 表达式编译：IntegerLiteral / BooleanLiteral / Identifier / BinaryExpression / UnaryExpression
- [x] 语句编译：Assignment / IfStatement / WhileStatement / ForStatement / CompoundStatement
- [x] 过程编译：每个 Pascal 过程 → 一个 JS 函数
- [x] SYS_CALL 桥接：`await ctx.sysCall(...)`
- [x] 步数限制：循环开头插检查点
- [x] 边界问题修复（subrange 检查、DIV/MOD 除零）

### Phase 2: char / real / string ✅

- [x] char：裸 number（char code），CHR/ORD 直接编译
- [x] real：裸 number（float），科学计数法输出对齐 pascal82
- [x] string：默认不加载 stringPlugin（与 M4 一致，pascal82 标准）
- [x] 边界问题修复（char subrange 边界检查）

### Phase 3: array / record / set / file ✅

- [x] array：PascalValue + 边界检查（多维/嵌套数组支持）
- [x] record：PascalValue + record 字段直接访问
- [x] set：PascalValue + set 运算（union/intersection/difference）
- [x] file：PascalValue + sysCall + io 桥接
- [x] WITH 语句：嵌套 WITH 无 TDZ 冲突，唯一变量名计数
- [x] 边界问题修复（数组越界检查、nested array record 类型推断）

### Phase 4: 过程嵌套 / var 参数 / goto ✅

- [x] 嵌套过程：JS 闭包支持 upLevel 语义
- [x] var 参数：包装对象 `{ value: T }` 实现引用语义
- [x] 过程参数：生成 JS 函数对象 + 闭包上下文
- [x] **goto：分策略方案已完成**
  - [x] 简单前向跳转：代码复制/直接删除（策略 A）
  - [x] 后向跳转：while(true) + continue（策略 B）
  - [x] 跳出循环：labeled break（策略 C）
  - [x] 复杂场景（多 label/嵌套）：状态机 + labeled break（策略 D）
  - [x] 跨过程 goto：普通 Error 抛出，避免死循环
- [x] 测试用例全部改为 pascal82 标准（显式 label 声明，默认不开非标扩展）

### Phase 5: 项目重构 🚧

- [x] 移除 VM 解释器和 static-analyzer 依赖
- [x] TypePlugin 系统整合进 js-compiler
- [x] JS 编译器独立可运行
- [x] syscall 系统移植到 js-compiler
- [x] 清理 issue 目录

### Phase 6: 性能和便利性优化、bug 修复

- [ ] 性能优化：热点代码内联、减少装箱拆箱
- [ ] 开发便利性：更好的错误提示、调试工具
- [ ] bug 修复：边缘场景修复
- [ ] 代码质量：重构、类型完善

### Phase 7: 跑 TEX82

- [ ] TRIP 测试在新引擎下跑通
- [ ] 测量 TEX82 实际运行时间
- [ ] 性能优化（如需要）

## 七、调试工具

### 7.1 打印编译后的 JS

```typescript
// 运行时打印
await runJS(code, { debug: { emitJS: true } })

// 输出到文件
await runJS(code, { debug: { emitJSFile: 'out.js' } })

// 仅编译不执行
import { compileToJS } from './src/js-compiler'
const js = compileToJS(code)
```

### 7.2 测试失败时自动打印

```typescript
const result = await runVMTest({
  name: 'my-test',
  code: '...',
  debugEmitJS: true,  // 失败时自动打印生成的 JS
})
```

## 八、难点与方案

| 难点 | 状态 | 方案 |
|------|------|------|
| var 参数（传引用） | ✅ | 包装对象 `{ value: T }` |
| 嵌套过程访问外层变量 | ✅ | JS 闭包天然支持 |
| 过程作为参数 | ✅ | JS 函数对象 + 闭包 |
| goto 语句 | ✅ | **分策略**：简单场景优化，复杂场景状态机 |
| 步数限制 | ✅ | 循环开头插检查点 |
| 异步操作（file IO） | ✅ | `async function` + `await` |
| 数组越界检查 | ✅ | `ctx.checkArrayIndex` 运行时函数 |
| subrange 边界检查 | ✅ | IIFE 内联检查 + char 特殊处理 |
| 嵌套 WITH 变量冲突 | ✅ | 全局计数器生成唯一临时变量 |
| 多维/嵌套数组类型推断 | ✅ | `arrayElementAfterNIndices` 逐层解析 |

**goto 分策略方案**详见 [docs/design-goto-strategy.md](docs/design-goto-strategy.md)。

## 九、性能目标

| 指标 | 目标 |
|------|------|
| 1 亿步（纯计算） | < 5 秒，> 2000 万步/秒 |
| TEX82 TRIP | 完成且输出一致 |
| TEX82 texbook | 可行（合理时间内） |

## 十、参考

- **主项目计划**：[plan.md](plan.md)
- **goto 策略设计**：[docs/design-goto-strategy.md](docs/design-goto-strategy.md)
- **重构计划**：[docs/plan-refactoring.md](docs/plan-refactoring.md)
- **TypePlugin 系统**：`src/js-compiler/types/`
- **AST 结构**：`src/ast/types.ts`
