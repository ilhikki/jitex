# M4.1 — Pascal82 规范一致性测试与修复

> **当前阶段**：M4.1
> **目标**：测试和修复 VM/编译器与 Pascal82 规范不一致的地方
> **前置阶段**：[M4.0 VM + TypePlugin 模型](./plan-vm-type-plugin-m4.0.md)（已完成）

## 一、阶段定位

M4.0 已经完成了 VM + TypePlugin 模型的整体实现，所有基础类型插件、控制流、过程调用、文件 IO 模型都已就位，823 个测试全部通过。

**M4.1 的工作不是新增功能，而是用规范约束现有实现**：通过真实 Pascal 程序（特别是 Knuth TANGLE）暴露的偏差，逐项对齐 Pascal82 标准（ISO 7185）。

## 二、工作原则

1. **以真实程序为镜**：TANGLE 是 Pascal82 的"权威实现样本"。跑不通 TANGLE 的地方，大概率就是规范偏差。
2. **每个 bug 先开 issue**：在 `issue/` 下记录根因、规范依据、修复方案，再写代码。参考已有的 ISSUE-001 ~ ISSUE-024 格式。
3. **修复必有测试**：测试要按 Knuth TANGLE 的紧凑大写 Pascal 风格写（参见 `tests/m4/q11-knuth-pascal.test.ts`、`tests/m4/q12-file-model.test.ts`），而不是按代码内部结构写。
4. **不破坏现有测试**：每次修复后 `npx jest --no-coverage` 必须保持 823+ 测试全绿。若旧测试本身违反 Pascal82，先更新测试再改实现。
5. **小步前进**：一次只修一个规范偏差，一个 commit 只解决一个 issue。

## 三、当前已知偏差

### 3.1 TANGLE 跑不了的根因

TANGLE 第 11 行 `XORD: ARRAY[CHAR] OF ASCIICODE;` 暴露了一个核心规范偏差：

| 项 | 当前实现 | Pascal82 规范 |
|---|---|---|
| `ARRAY[CHAR]` 的索引范围 | `{ low: 0, high: 0 }`（1 个元素） | CHAR 的完整取值范围（0..255 扩展 ASCII / 0..127 Knuth ASCII） |
| 数组初始化 | 只创建 1 个元素 | 应创建 256（或 128）个元素 |
| `XORD[CHR(I)]`（I=0..127） | 立即越界 | 应能正常访问 |

**根因位置**：`src/static-analyzer/index.ts` 中 ArrayType 的维度解析，对非 subrange 的索引类型（CHAR/BOOLEAN/枚举）回退到 `{ low: 0, high: 0 }`。

**不符合 Pascal82 行为**：违反 §6.4.3.1（数组类型定义）。CHAR 在标准 Pascal 中是枚举类型，作为数组索引时必须覆盖其完整取值范围。

### 3.2 待发现的其他偏差

M4.1 的主要工作是逐项发现并修复这类偏差。可能的方向：
- 枚举类型作为数组索引
- BOOLEAN 作为数组索引
- 集合类型的边界计算
- 子界类型的隐式转换规则
- 过程参数的类型兼容性
- 变体记录的处理
- WITH 语句的符号解析边界

## 四、工作流程

```
1. 发现偏差（跑 TANGLE / 写测试用例）
   ↓
2. 在 issue/ 下开 ISSUE-XXX 文档
   - 根因分析
   - Pascal82 规范依据（引用 §章节号）
   - 修复方案
   - 测试用例（Knuth 风格）
   ↓
3. 实现修复
   - 改 src/ 下相关代码
   - 加测试到 tests/m4/qXX-*.test.ts
   ↓
4. 验证
   - npx jest --no-coverage 全绿
   - TANGLE 编译/运行更接近目标
   ↓
5. 提交
   - commit message: "fix: ISSUE-XXX <简述>"
   - 推进 TANGLE 跑通进度
```

## 五、TANGLE 跑通里程碑

TANGLE 是 M4.1 的终极验证用例。跑通路径分几个里程碑：

| 里程碑 | 含义 | 当前状态 |
|---|---|---|
| M1 编译通过 | parse + analyze 成功生成 JsonCode | ✅ 已达成（35 过程 / 41 类型 / 438 指令） |
| M2 初始化通过 | VM 能跑完 TANGLE 的初始化段（数组/变量初始化）不越界 | ❌ 阻塞于 ARRAY[CHAR] 偏差 |
| M3 能读输入文件 | TANGLE 能 RESET webfile/changefile 并读到内容 | ✅ 文件模型已就位（q12 测试验证） |
| M4 能产出 Pascal | TANGLE 能 REWRITE pasfile 并写入内容 | ✅ 文件模型已就位 |
| M5 端到端跑通 | TANGLE(web, change) → pas 与 Knuth 原版输出一致 | ❌ 待 M2 后逐步验证 |

## 六、目录结构约定

```
docs/
├── plan.md                              # M3 PDI 计划（历史归档）
├── plan-ast-phase.md                    # M1 AST 阶段计划（历史归档）
├── plan-vm-type-plugin-m4.0.md          # M4.0 VM+TypePlugin 计划（刚归档）
├── plan-m4.1-pascal82-conformance.md    # M4.1 当前指导文档（本文件）
└── productions.md                       # 产生式参考

issue/
├── ISSUE-001 ~ ISSUE-024                # 已修复的历史 issue
└── ISSUE-025-[Open]array-char-index.md  # M4.1 第一个 issue（待开）

tests/m4/
├── _helper.ts                           # VMTest 接口 + runVMTest
├── q01 ~ q10                            # 基础功能测试
├── q11-knuth-pascal.test.ts             # Knuth 风格语法测试
├── q12-file-model.test.ts               # 异步文件模型测试
└── q13-*.test.ts                        # M4.1 新增的规范一致性测试
```

## 七、参考

- **Pascal82 标准**：ISO 7185
- **TANGLE 源码**：`knuth/web/tangle-official.pas`（783 行，Knuth 原版 Pascal）
- **Knuth Pascal 风格**：紧凑大写、`FILE OF CHAR`、`OTHERS:`、`F^`、`BREAK`/`PAGE`、`PACKED`
- **测试风格参考**：`tests/m4/q11-knuth-pascal.test.ts`、`tests/m4/q12-file-model.test.ts`
- **issue 格式参考**：`issue/ISSUE-019-[Fixed]subrange-boundary-not-enforced.md`
