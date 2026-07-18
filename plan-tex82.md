# M4.2 — TEX82 移植与验证

> **当前阶段**：M4.2
> **目标**：跑通 Knuth TEX82，完成从 tex.web → tex.pas → 编译 texbook 的全链路验证
> **前置阶段**：[M4.1 Pascal82 规范一致性](./docs/plan-m4.1-pascal82-conformance.md)（已完成，TANGLE 端到端 + 自举验证通过）
> **指导原则**：用例先行、小步迭代、每个 bug 先开 issue 再修复

## 一、阶段定位

M4.1 已经通过 TANGLE 验证了 Pascal82 基础一致性。**TEX82 是 Pascal82 一致性的终极试金石**——它是 Knuth 本人写的最复杂的 Pascal 程序之一，用到了 Pascal82 的几乎所有特性。

本阶段的核心不是新增功能，而是**通过 TEX82 暴露剩余的规范偏差，逐项修复**，最终达成：

1. **TANGLE 能编译 tex.web** → 产出 tex.pas
2. **tex.pas 能在 VM 上运行** → 可以编译 .tex 文件
3. **能编译 texbook.tex** → 产出与原版一致的 DVI

## 二、背景与规模

| 项目 | 大小 | 说明 |
|---|---|---|
| tex.web | ~1031 KB | TEX 源码（WEB 格式，Pascal + 文档） |
| tangle.web | ~127 KB | TANGLE 源码（对比参考） |
| texbook.tex | ~1380 KB | The TeXbook 源文件 |
| trip.tex | 小 | TRIP 测试（TeX 官方回归测试） |

TEX82 大约是 TANGLE 的 **8 倍**规模。使用的 Pascal 特性更全面：
- 变体记录（variant records）
- WITH 语句的深层嵌套
- 大量文件操作（input/output/terminal/.log/.dvi）
- 指针和动态内存分配
- 集合类型的复杂操作
- 过程/函数作为参数（ procedural parameters）

## 三、工作原则

1. **用例先行**：先写测试，再让测试通过。不直接在原始文件上动手，所有测试资源复制到 `tests/resources/`。
2. **编译优先于运行**：先保证 parse + analyze（编译）通过，再关心 VM 执行。
3. **小步前进**：一个 issue 一个 commit，不攒大改动。
4. **TANGLE 不动**：M4.1 已经验证 TANGLE 自举正确，M4.2 期间尽量不碰 TANGLE 相关逻辑。
5. **回归必保**：每次改动后 `npx jest --no-coverage` 必须全绿（830+ 测试）。
6. **每个 bug 先开 issue**：在 `issue/` 下记录根因、规范依据、修复方案。

## 四、任务拆分与优先级

### Phase 0: 基础设施（P0）

- [x] 复制 tex.web、texbook.tex 等到 `tests/resources/`
- [x] 编写阶段规划文档（本文件）
- [ ] 编写两个编译通过的骨架测试：
  - `tests/tex82-compile.test.ts` — TANGLE 编译 tex.web → tex.pas
  - `tests/tex82-run.test.ts` — tex.pas 的 parse + analyze 通过

### Phase 1: TANGLE 编译 tex.web（P0）

**目标**：用已有的 TANGLE 把 tex.web 转成 Pascal，产出 tex.pas。

- [ ] 跑 TANGLE 处理 tex.web，收集错误
- [ ] 修复 TANGLE 处理大文件时的问题（如有）
- [ ] 验证产出的 tex.pas 非空、包含 `PROGRAM TEX`
- [ ] 产出 tex.pas 保存到 `tests/resources/tex.pas` 供后续使用

**验收标准**：
- TANGLE(tex.web) 正常结束，不报错
- 输出文件大小合理（预计 500KB~1MB）
- 输出包含 `PROGRAM TEX`

### Phase 2: tex.pas 编译通过（P0）

**目标**：parse + analyze 能把 tex.pas 编译成 JsonCode。

- [ ] 跑 parse(tex.pas)，收集语法错误
- [ ] 跑 analyze，收集语义/类型错误
- [ ] 逐项修复，直到生成 JsonCode
- [ ] 验证过程数、类型数、指令数合理

**验收标准**：
- `parse(tex.pas).success === true`
- `analyzer.analyze(ast)` 不抛异常
- JsonCode 结构完整（procedures > 100, types > 50）

### Phase 3: TEX 初始化通过（P1）

**目标**：VM 能跑完 TEX 的初始化段不崩溃。

- [ ] 跑 VM 执行 tex.pas，收集初始化阶段的错误
- [ ] 修复数组越界、类型不匹配等初始化问题
- [ ] 验证 TEX 能进入主循环（或读取输入文件）

**验收标准**：
- VM 能跑完初始化不报错
- 能成功打开 .tex 输入文件

### Phase 4: TRIP 测试（P1）

**目标**：用 TRIP 测试（TeX 官方回归测试）验证基本功能。

TRIP 测试是 Knuth 设计的 TeX 官方回归测试，比 texbook 小得多，适合作为中间里程碑。

- [ ] 用 TEX 编译 trip.tex
- [ ] 对比 trip.typ（预期输出）
- [ ] 修复发现的问题

**验收标准**：
- trip.tex 编译不报错
- 输出与 trip.typ 一致（或差异可解释）

### Phase 5: 编译 texbook（P2）

**目标**：用 TEX 编译 texbook.tex，产出 DVI。

- [ ] 跑 TEX 编译 texbook.tex
- [ ] 收集并修复遇到的问题
- [ ] 验证 DVI 输出非空、结构合理

**验收标准**：
- texbook.tex 编译完成
- 产出 .dvi 文件，大小合理

## 五、里程碑总览

| 里程碑 | 含义 | 优先级 |
|---|---|---|
| M0 基础设施 | 资源文件 + 测试骨架 + 文档 | P0 |
| M1 TANGLE 编译 tex.web | 产出 tex.pas | P0 |
| M2 tex.pas 编译通过 | parse + analyze → JsonCode | P0 |
| M3 TEX 初始化通过 | VM 跑完初始化段 | P1 |
| M4 TRIP 测试通过 | trip.tex 编译正确 | P1 |
| M5 texbook 编译通过 | 产出 DVI | P2 |

## 六、工作流程

```
1. 编写/运行测试 → 发现失败
   ↓
2. 在 issue/ 下开 ISSUE-XXX
   - 根因分析
   - Pascal82 规范依据（引用 §章节号）
   - 最小复现用例
   - 修复方案
   ↓
3. 实现修复
   - 改 src/ 下相关代码
   - 加最小复现测试到 tests/m4/qXX-*.test.ts
   ↓
4. 验证
   - npx jest --no-coverage 全绿
   - TEX82 测试更接近目标
   ↓
5. 提交
   - commit message: "fix: ISSUE-XXX <简述>"
   - 推进里程碑进度
```

## 七、目录结构约定

```
tests/resources/
├── tangle-official.pas         # 已有：TANGLE 官方 Pascal
├── tangle.web                  # 已有：TANGLE WEB 源
├── tex.web                     # 新增：TEX WEB 源（从 knuth/tex82/ 复制）
├── texbook.tex                 # 新增：TeXbook 源文件
├── trip.tex                    # 新增：TRIP 测试输入
├── trip.typ                    # 新增：TRIP 测试预期输出
└── tex.pas                     # 后续产出：TANGLE 编译 tex.web 的结果

tests/
├── tangle-run.test.ts          # 已有：TANGLE 端到端测试
├── tangle-bootstrap.test.ts    # 已有：TANGLE 自举测试
├── tex82-tangle.test.ts        # 新增：TANGLE 编译 tex.web 的测试
└── tex82-run.test.ts           # 新增：TEX 编译/运行测试

knuth/
├── web/                        # 已有：TANGLE 相关源文件
└── tex82/                      # 已有：TEX82 原始文件（只读参考，不直接用于测试）

issue/
└── ISSUE-XXX-*.md              # M4.2 期间新增的 bug 记录
```

## 八、参考资源

- **Pascal82 标准**：ISO 7185
- **TEX82 源码**：`knuth/tex82/tex.web`（1031KB WEB 格式）
- **TANGLE 参考**：`tests/tangle-bootstrap.test.ts`（已验证的 TANGLE 使用方式）
- **TRIP 测试**：`knuth/tex82/trip.tex` + `trip.typ`
- **TeXbook**：`knuth/tex82/texbook.tex`
- **issue 格式参考**：`issue/ISSUE-025-[Fixed]array-char-index.md`
- **测试风格参考**：`tests/m4/q11-knuth-pascal.test.ts`、`tests/m4/q12-file-model.test.ts`
