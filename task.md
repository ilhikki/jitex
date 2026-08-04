# task.md

> 跨对话任务追踪。只保留进行中的任务明细，已完成的只留标题。

## M5 — 高性能 JS 编译器

### Phase 0：基础设施 ✅（明细已删除）
### Phase 1：integer/boolean/基础控制流 ✅（明细已删除）
### Phase 2：char/real/string ✅（明细已删除）
### Phase 3：array/record/set/file/WITH ✅（明细已删除）
### Phase 4：嵌套过程/var参数/goto ✅（明细已删除）

### Phase 5：项目重构 ✅（明细已删除）

---

### Phase 6：完全重新写编译器 🚧

> 旧 Phase 6（性能优化与功能增强）作废。基准测试保留复用。
> 详见 `src/il/req.md`（需求清单）、`src/il/json-code.ts` / `analysis.ts` / `compiler.ts`（设计文档）。

#### 设计原则

- **两阶段流水线**：Analysis（状态化，产出只读 Analysis）+ Compile（纯函数族，零 mutable state）
- **依赖反转**：编译阶段不持 mutable state，通过 `analysis.symbolOf(node)` / `analysis.typeOf(node)` 等查询元信息。不是 compiler 带着 context 找节点，而是节点去 Analysis 查自己的元信息
- **ID 全局唯一**：VarId / LabelId / Function.id 共用一个计数器，任何 ID 自解释，不需要"在哪个 function 里"的上下文
- **JsonCode 去语言绑定**：IR 不依赖 Pascal（上游）也不依赖 JS（下游），注释无上下文可读
- **代码风格**：哲学一致即可（纯函数 / 无隐式状态 / 依赖反转），组织形式可选用 class / namespace / 顶层函数
  - Analysis 阶段天然有状态 → 可用 class（如 `class Analyzer`）
  - Compile 阶段必须无状态 → 可用 namespace 组织纯函数族
  - 不强制完全照搬 parser 的顶层函数风格
- **syscall 精确选择**：Pascal 无泛型，类型在编译期已知，因此编译期就选定具体 syscall key（`i64.add` vs `f64.add`），不做运行时多态分派

#### 进行中

- 6.1：新编译器（分两步走）

  ##### Step 2：完整类型检查 🚧

  目标：在 analysis 阶段加入编译期语义检查，让剩余 20 个 `expectedError` 用例通过。当前 513/533 通过，剩余失败全部是"应报错但未报错"。

  必做（按失败用例分类）：
  - 数组/subrange 边界检查（3 个失败）
    - array bound check（p03-array-record）
    - char assign above upper bound（p03-range）
    - subrange record field overflow（p03-range）
  - goto 语义检查（15 个失败）
    - 跨过程 goto 规则（ISO 7185 6.8.1, 6.8.2.4）：过程→另一过程禁止、外层→内层禁止
    - 跳入非透明块报错（while/for/if/repeat/case/with 体内部 label）
    - 标号重复声明
    - 递归 label 作用域
    - label shadowing 规则
    - goto 死循环检测（backward/mutual infinite loop）
  - 参数名与局部变量同名报错（p04-parameters，1 个）
  - `string` 类型未启用 extensions 时报错（p15-nonstandard，1 个）

  实现要点：
  - 在 `analysis.ts` 的 `analyzeBlock` / `analyzeStmt` / `analyzeExpr` 中加入语义检查
  - 检查失败时抛 `Error`，transform.ts 的 run 函数捕获后返回 RunState(status='error')
  - 参考 `src/compiler/label-analysis.ts` 的 goto 规则实现（不直接复用，逻辑重写）

- 6.2：记录痛点
  - 在开发过程中记录遇到的难受痛点（如 syscall 对齐、类型信息传递、goto 跨过程判定等）

#### 已完成

- 6.1.1：建立基准测试（Phase 5 遗留，新编译器完成后复用）
- 设计文档：`src/il/json-code.ts` / `analysis.ts` / `compiler.ts` 注释
- 需求清单：`src/il/req.md`
- 决策记录：`src/il/decide.md`
- 6.1 Step 1：切换测试 + 新编译器核心 ✅
  - 实现 `src/il/analysis.ts`（Analyzer 类，状态化分析）
  - 实现 `src/il/compiler.ts`（纯函数族，所有 lowering）
  - 实现 `src/il/runtime.ts`（同步 syscall + RunState 复用）
  - 实现 `src/il/transform.ts`（入口，SemanticCompiler 实现）
  - 切换 `_helper.ts` 到新管线
  - 修复 23 个 bug（见 decide.md），tsc 通过
  - 集成测试 513/533 通过，剩余 20 个全部是 expectedError（Step 2 范畴）
  - 非标 extension 机制：`fileEofBufferSpace`（F^ 在 EOF 时返回空格，ISO 7185 6.9.8 未定义行为）

---

## 如何更新本文档

- 新任务 → 在对应阶段"进行中"添加
- 子任务完成 → 删除明细，标题移入同阶段的"已完成"并标记 ✅
- 大任务整个完成 → 保留大任务标题（打 ✅），删除所有子任务明细
- 任务取消 → 完全删除
- 编号规则：不使用编号，用文字描述。大任务用 `###`，子任务用 `####`，具体项用 `-` 列表
