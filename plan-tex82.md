# M4.2 — TEX82 移植与验证

> **当前阶段**：M4.2
> **目标**：跑通 Knuth TEX82，完成从 tex.web → tex.pas → 编译 texbook 的全链路验证
> **前置阶段**：[M4.1 Pascal82 规范一致性](./docs/plan-m4.1-pascal82-conformance.md)（已完成，TANGLE 端到端 + 自举验证通过）
> **指导原则**：用例先行、小步迭代、每个 bug 先开 issue 再修复
> **优先级规则**：项目管理操作（plan.md 维护、提交代码）> 记录问题 > 复现 > 修复

## 一、阶段定位

M4.1 已经通过 TANGLE 验证了 Pascal82 基础一致性。**TEX82 是 Pascal82 一致性的终极试金石**——它是 Knuth 本人写的最复杂的 Pascal 程序之一，用到了 Pascal82 的几乎所有特性。

本阶段的核心不是新增功能，而是**通过 TEX82 暴露剩余的规范偏差，逐项修复**，最终达成：

1. **TANGLE 能编译 tex.web** → 产出 tex.pas
2. **tex.pas 能在 VM 上运行** → 可以编译 .tex 文件
3. **能编译 texbook.tex** → 产出与原版一致的 DVI

## 二、背景与规模

| 项目 | 大小 | 说明 |
|------|------|------|
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
- 过程/函数作为参数（procedural parameters）

## 三、工作原则

1. **用例先行**：先写测试，再让测试通过。不直接在原始文件上动手，所有测试资源复制到 `tests/resources/`。
2. **编译优先于运行**：先保证 parse + analyze（编译）通过，再关心 VM 执行。
3. **小步前进**：一个 issue 一个 commit，不攒大改动。
4. **TANGLE 不动**：M4.1 已经验证 TANGLE 自举正确，M4.2 期间尽量不碰 TANGLE 相关逻辑。
5. **回归必保**：每次改动后 `npx jest --no-coverage` 必须全绿（830+ 测试）。
6. **每个 bug 先开 issue**：在 `issue/` 下记录根因、规范依据、修复方案。
7. **优先级规则**：
   - 最高：用户明确命令
   - 项目管理操作（plan.md 维护、提交代码）
   - 记录问题（可打断修复）
   - 复现（不能打断修复）
   - 最低：修复

## 四、已发现问题（按发现顺序）

### 4.1 ISSUE-026：Parser 不支持变体记录（variant records）
- **状态**：Fixed
- **严重程度**：High
- **发现时间**：2026-07-18
- **修复时间**：2026-07-18
- **影响范围**：Parser / StaticAnalyzer / VM / RecordPlugin
- **问题描述**：TANGLE 编译 tex.web 产出的 tex.pas（353,359 chars）在 parse 阶段失败：`Expected identifier but got CASE (CASE) at line 15:1`
- **根因**：`parseRecordType` 只支持普通字段列表，不支持 `CASE ... OF` 变体部分
- **规范依据**：ISO 7185 §6.4.4（记录类型的变体部分）
- **文档**：`issue/ISSUE-026-[Fixed]variant-record-support.md`
- **修复内容**：
  - Parser：新增 `parseRecordVariantPart` 和 `parseRecordVariant` 函数，支持有/无名 tag、嵌套变体
  - StaticAnalyzer：扩展 `resolveType` 处理变体记录，正确计算字段偏移（固定字段顺序分配，变体字段共享偏移）

### 4.2 ISSUE-027：FileType 的 elementTypeId 属性缺失
- **状态**：Fixed
- **严重程度**：High
- **发现时间**：2026-07-18
- **修复时间**：2026-07-18
- **影响范围**：StaticAnalyzer
- **问题描述**：`EQTB[K].INT` 访问失败，错误信息为 `Type char is not a record (field: INT)`
- **根因**：`resolveType` 创建 FileType 时没有设置 `elementTypeId` 属性，导致 `^` 操作返回默认值 `'char'`
- **修复内容**：在 `resolveType` 的 FileType 处理中添加 `elementTypeId: elementType?.id`

### 4.3 ISSUE-028：外部函数/过程调用未支持
- **状态**：Fixed
- **严重程度**：High
- **发现时间**：2026-07-18
- **修复时间**：2026-07-18
- **影响范围**：StaticAnalyzer
- **问题描述**：TEX82 使用了未声明的外部函数（ERSTAT）和过程（BREAKIN），编译时报错 `Unknown function/procedure`
- **根因**：static-analyzer 对未找到的函数/过程直接抛出异常
- **修复内容**：将未找到的函数/过程调用当作 `SYS_CALL` 处理，返回 `integer` 类型

### 4.4 ISSUE-029：文件缓冲区赋值操作未支持
- **状态**：Fixed
- **严重程度**：High
- **发现时间**：2026-07-18
- **修复时间**：2026-07-18
- **影响范围**：StaticAnalyzer
- **问题描述**：对文件缓冲区 `F^` 的赋值操作失败，错误信息为 `Type file-of-record-INT,GR,HH,QQQQ is not a record`
- **根因**：`compileAssignment` 中的字段访问处理没有特殊处理文件类型的 `^` 操作符
- **修复内容**：在 `compileAssignment` 中添加对文件 `^` 字段的特殊处理，编译为 `SYS_CALL WRITE_FILE`

### 4.5 ISSUE-030：VM 不支持 string 类型的 assign 操作
- **状态**：Fixed
- **严重程度**：High
- **发现时间**：2026-07-18
- **修复时间**：2026-07-18
- **影响范围**：VM
- **问题描述**：TEX82 在 VM 上运行初始化时失败，错误信息为 `VM: unknown op assign.assign for type string`
- **根因**：`runVM` 的 `basePlugins` 数组没有包含 `stringPlugin`
- **修复内容**：在 `basePlugins` 中添加 `stringPlugin`
- **文档**：`issue/ISSUE-030-[Fixed]vm-assign-op-for-string.md`

### 4.6 ISSUE-031：VM 不支持 array-of-char 类型的 assign 操作
- **状态**：Fixed
- **严重程度**：High
- **发现时间**：2026-07-18
- **修复时间**：2026-07-18
- **影响范围**：VM / ArrayPlugin
- **问题描述**：TEX82 在 VM 上运行初始化时失败，错误信息为 `VM: unknown op assign.assign for type array-1..20-of-char`
- **根因**：`ArrayPlugin` 没有实现 `assign` 操作
- **修复内容**：在 `createArrayPlugin` 中添加 `assign` 操作（深拷贝数组）
- **文档**：`issue/ISSUE-031-[Fixed]vm-assign-op-for-array-of-char.md`

### 4.7 ISSUE-032：VM 缺少 TEX82 所需的 SYS_CALL handler
- **状态**：Fixed
- **严重程度**：High
- **发现时间**：2026-07-18
- **修复时间**：2026-07-18
- **影响范围**：VM / io.plugin.ts
- **问题描述**：TEX82 在 VM 上运行时调用未实现的系统调用 `ERSTAT`
- **根因**：`createDefaultSysCalls()` 中没有注册 ERSTAT、BREAKIN、WRITE_FILE 的 handler
- **修复内容**：添加三个 handler（ERSTAT 返回 0、BREAKIN no-op、WRITE_FILE 调用 io.file.write）
- **文档**：`issue/ISSUE-032-[Fixed]vm-missing-syscalls-erstat-breakin-writefile.md`

## 五、任务拆分与优先级

### Phase 0: 基础设施（P0）

- [x] 复制 tex.web、texbook.tex 等到 `tests/resources/`
- [x] 编写阶段规划文档（本文件）
- [x] 编写两个编译通过的骨架测试：
  - `tests/tex82-tangle.test.ts` — TANGLE 编译 tex.web → tex.pas ✅ 通过
  - `tests/tex82-compile.test.ts` — tex.pas 的 parse + analyze（待 ISSUE-026 修复）
- [x] 创建 `tests/temp/` 目录用于存放临时中间文件

### Phase 1: TANGLE 编译 tex.web（P0）

**目标**：用已有的 TANGLE 把 tex.web 转成 Pascal，产出 tex.pas。

- [x] 跑 TANGLE 处理 tex.web（已完成，耗时 ~226 秒，产出 353,359 chars）
- [x] 修复 TANGLE 处理大文件时的步数限制问题（maxSteps 改为可配置，默认 1 亿，TEX82 测试用 20 亿）
- [x] 验证产出的 tex.pas 非空、包含 `PROGRAM TEX`
- [ ] 产出 tex.pas 保存到 `tests/resources/tex.pas` 供后续使用

**验收标准**：
- TANGLE(tex.web) 正常结束，不报错 ✅
- 输出文件大小合理（353,359 chars）✅
- 输出包含 `PROGRAM TEX` ✅

### Phase 2: tex.pas 编译通过（P0）

**目标**：parse + analyze 能把 tex.pas 编译成 JsonCode。

- [x] 跑 parse(tex.pas)，发现 ISSUE-026（变体记录）
- [x] 修复 ISSUE-026（变体记录支持）
- [x] 跑 analyze，收集语义/类型错误
- [x] 逐项修复，直到生成 JsonCode（修复了 ISSUE-027/028/029）
- [x] 验证过程数、类型数、指令数合理（357 procedures, 112 types, 848 main body instructions）

**验收标准**：
- `parse(tex.pas).success === true` ✅
- `analyzer.analyze(ast)` 不抛异常 ✅
- JsonCode 结构完整（procedures > 100, types > 50）✅

### Phase 3: TEX 初始化通过（P1）

**目标**：VM 能跑完 TEX 的初始化段不崩溃。

- [x] 跑 VM 执行 tex.pas，收集初始化阶段的错误
- [x] 修复 ISSUE-030（string assign 缺失）
- [x] 修复 ISSUE-031（array-of-char assign 缺失）
- [x] 修复 ISSUE-032（ERSTAT/BREAKIN/WRITE_FILE syscall 缺失）
- [x] 验证 VM 状态为 terminated（初始化通过）

**验收标准**：
- VM 能跑完初始化不报错 ✅
- VM 状态为 terminated ✅

### Phase 4: TRIP 测试（P1）

**目标**：用 TRIP 测试（TeX 官方回归测试）验证基本功能。

TRIP 测试是 Knuth 设计的 TeX 官方回归测试，比 texbook 小得多，适合作为中间里程碑。

- [x] 资源已就位：trip.tex, trip.typ 在 `tests/resources/`
- [ ] 用 TEX 编译 trip.tex，收集初始化后的运行时错误
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

## 六、里程碑总览

| 里程碑 | 含义 | 优先级 | 当前状态 |
|--------|------|--------|----------|
| M0 基础设施 | 资源文件 + 测试骨架 + 文档 | P0 | ✅ 完成 |
| M1 TANGLE 编译 tex.web | 产出 tex.pas | P0 | ✅ 完成 |
| M2 tex.pas 编译通过 | parse + analyze → JsonCode | P0 | ✅ 完成 |
| M3 TEX 初始化通过 | VM 跑完初始化段 | P1 | ✅ 完成 |
| M4 TRIP 测试通过 | trip.tex 编译正确 | P1 | 进行中 |
| M5 texbook 编译通过 | 产出 DVI | P2 | 未开始 |

## 七、工作流程

```
1. 编写/运行测试 → 发现失败
   ↓
2. 在 issue/ 下开 ISSUE-XXX（优先级最高，可打断修复）
   - 根因分析
   - Pascal82 规范依据（引用 §章节号）
   - 最小复现用例
   - 修复方案
   ↓
3. 复现问题（不能打断修复）
   - 必要时在 tests/temp/ 保存中间文件
   ↓
4. 实现修复（优先级最低）
   - 改 src/ 下相关代码
   - 加最小复现测试到 tests/m4/qXX-*.test.ts
   ↓
5. 验证
   - npx jest --no-coverage 全绿
   - TEX82 测试更接近目标
   ↓
6. 提交
   - commit message: "fix: ISSUE-XXX <简述>"
   - 推进里程碑进度
```

## 八、目录结构约定

```
tests/resources/
├── tangle-official.pas         # 已有：TANGLE 官方 Pascal
├── tangle.web                  # 已有：TANGLE WEB 源
├── tex.web                     # TEX WEB 源（从 knuth/tex82/ 复制）
├── texbook.tex                 # TeXbook 源文件
├── trip.tex                    # TRIP 测试输入
└── trip.typ                    # TRIP 测试预期输出

tests/temp/                     # 测试临时文件目录（可提交）
└── *.txt / *.pas / *.json      # 中间产物、调试输出等

tests/                          # 标准测试（快速）
├── lexer/ parser/ m3.5/ m4/    # 单元/模块测试
└── resources/                  # 测试资源（tex 和 tangle 共用）

tests-tex/                      # TEX82 端到端测试（耗时长，独立目录）
├── tangle-run.test.ts          # TANGLE 端到端测试
├── tangle-bootstrap.test.ts    # TANGLE 自举测试
├── tangle-verify.test.ts       # TANGLE 验证测试
├── tangle.test.ts              # TANGLE 基础测试
├── tex82-tangle.test.ts        # TANGLE 编译 tex.web 的测试
├── tex82-compile.test.ts       # tex.pas 的 parse + analyze 测试
├── tex82-run.test.ts           # TEX82 在 VM 上初始化运行测试
└── tex82-trip.test.ts          # TRIP 回归测试

knuth/
├── web/                        # 已有：TANGLE 相关源文件
└── tex82/                      # 已有：TEX82 原始文件（只读参考，不直接用于测试）

issue/
└── ISSUE-XXX-*.md              # bug 记录
```

## 九、参考资源

- **Pascal82 标准**：ISO 7185
- **TEX82 源码**：`knuth/tex82/tex.web`（1031KB WEB 格式）
- **TANGLE 参考**：`tests/tangle-bootstrap.test.ts`（已验证的 TANGLE 使用方式）
- **TRIP 测试**：`knuth/tex82/trip.tex` + `trip.typ`
- **TeXbook**：`knuth/tex82/texbook.tex`
- **issue 格式参考**：`issue/ISSUE-025-[Fixed]array-char-index.md`
- **测试风格参考**：`tests/m4/q11-knuth-pascal.test.ts`、`tests/m4/q12-file-model.test.ts`

## 十、Issue 跟踪

| Issue | 描述 | 分类 | 状态 |
|-------|------|------|------|
| ISSUE-026 | 变体记录支持 | 标准 | Fixed |
| ISSUE-027~032 | TEX82 初始化系列 | 混合 | Fixed |
| ISSUE-033 | RESET/REWRITE 多参数形式（带文件名） | 非标扩展（插件） | Open |
| ISSUE-034 | READ 对 char 类型错误跳过空白 | 标准行为（核心） | Open |

### M4 阻塞问题

TRIP 测试当前卡在 POOL 文件读取，由 ISSUE-033 + ISSUE-034 共同导致：
1. ISSUE-033：`RESET(POOLFILE, NAMEOFFILE, '/O')` 的文件名参数被忽略，POOL 文件未关联
2. ISSUE-034：`READ(POOLFILE, M, N)`（char）跳过空白，读到错误内容

修复顺序：先 ISSUE-034（标准核心），再 ISSUE-033（非标插件）。
