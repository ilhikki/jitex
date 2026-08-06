# decide.md — IL 新编译器开发决策记录

> 本文件记录开发过程中的重要决策。已确定的标 ✅，待定夺的标 ❓。

---

## 已确定的设计决策（来自前期设计）✅

1. **两阶段流水线**：Analysis（状态化）+ Compile（纯函数）
2. **依赖反转**：编译阶段无 mutable state，通过 `analysis.symbolOf(node)` 查询
3. **ID 全局唯一**：VarId / LabelId / Function.id 共用一个计数器
4. **JsonCode 去语言绑定**：IR 不依赖 Pascal 也不依赖 JS
5. **代码风格**：哲学一致即可，Analysis 可用 class，Compile 可用 namespace
6. **不复用旧 runtime**：新 runtime 从零写，放在新目录
7. **依赖关系**：transform → compiler → analysis；transform → json-code-compiler

---

## 已定夺的决策 ✅（用户确认）

### 决策 1：运行时值的表示方式 ✅

**确定方案 B：裸值 + 类型编入 key**
- 值用 JS 裸值（number/string/boolean/Array/Object/Set）
- 需要类型信息的 syscall 把类型编进 key：`io.write.char(x)`、`io.write.int(x)`
- 多参数 writeln 展开为多个单参数 write + 末尾 `io.writeln.eol()`

### 决策 2：var 参数传递机制 ✅

**确定方案 A：统一 ref cell**
- 所有 var 参传 `{v: value}`，调用后写回变量
- 调用约定：`{let __c={v:v1}; foo(__c); v1=__c.v;}`
- 被调方用 `p1.v` 访问 var 参数

### 决策 3：变量初始化 ✅

**确定方案 A：编译期生成**
- analysis 提供类型，编译时在函数开头生成初始化
- 简单类型直接赋值（`v1=0; v2=0.0; v3=false; v4='\0'`）
- 复合类型用 syscall（`mem.default.array` 等）

### 决策 4：real 格式化 ✅

保持旧 runtime 格式：`5.00000000000000E+000`（14 位尾数 + 3 位指数）

### 决策 5：goto 跨过程 ✅

复用 json-code-compiler.ts 的 LongJump（throw + catch）机制

### 决策 6：syscall 在 JS codegen 阶段的实现方式 ✅

**确定：由 `SemanticCompiler` 接口解耦，不算重大问题**

`json-code-compiler.ts` 已定义 `SemanticCompiler` 接口。具体每个 key 怎么翻译（inline 还是走 dispatcher）由 `transform.ts` 里的 SemanticCompiler 实现决定，不影响 compiler.ts 生成的 JsonCode。开发时按"算术/比较/逻辑/转换 inline，IO/file/cell/mem/set 走 dispatcher"实现。

### 决策 7：syscall 是否异步 ✅

**确定方案 C：全部同步**
- 所有 syscall 同步，文件 IO 用同步 API
- 生成的 JS 代码无 `await`，性能最好
- 文件操作在测试环境无阻塞问题

### 决策 8：maxSteps 步数限制 ✅

**确定方案 B：循环回边处插入步数检查**
- 在 `compiler.ts` 的 `compileWhile` / `compileFor` / `compileRepeat` 里插入 `steps.check` syscall
- runtime 的 `steps.check`：`if (++steps > maxSteps) throw`

### 决策 9：RunState / 文件 IO 复用 ✅

**确定方案 A：复用 RunState，file-model 逻辑参考但同步化**
- `RunState` 直接 import `src/runtime/run-state.ts`
- `file-model.ts` 的 `PascalFile` 类型直接复用
- 在 `runtime.ts` 里重新实现同步的 file ops，逻辑参考 file-model.ts

### 决策 10：`json-code-compiler.ts` 状态机 case 0 bug ✅（已修复）

**确定方案 A**：在 `compileStateBody` 的 switch 开头总是插入 `case 0:`，利用 switch 穿透语义。

### 决策 11：operator 大小写统一策略 ✅（已修复）

**确定方案 A**：在 `compiler.ts` 的 `compileBinary`/`compileUnary` 入口处 `node.operator.toUpperCase()`。

### 决策 12：标识符大小写不敏感 ✅

analysis 的 `bind`/`lookup`/`withStack.fields`/`typeAliases`/`forwardFuncs`/`globalBindings` 全部用 `name.toLowerCase()` 做 key。

### 决策 13：goto 死循环兜底 ✅

在 `compiler.ts` 的 `compileGoto` 中，每次 goto 跳转前插入 `steps.check` syscall。

### 决策 14：record 字段 subrange 越界检查 ✅

属类型检查范畴，Step 2 完成。

### 决策 15：p11-knuth 文件相关失败 ✅

逐个调试修复。详见下方 bug 列表。

### 决策 16：F^ 在 EOF 时的返回值 ✅

按 AGENTS.md 原则 A 标准锚定：
- ISO 7185 6.9.8: "After EOF(f) becomes true, the file-buffer-variable f^ is undefined."
- 默认行为：F^ 在 EOF 时访问报错
- 非标 extension `fileEofBufferSpace`：启用后 EOF 时 F^ 返回空格（UCSD/Borland 扩展）

### 决策 17：goto 语义检查采用 ISO 7185 立场 ✅

允许从内层过程 goto 到祖先函数的 label（ISO 7185 立场）。

### 决策 18：label 使用位置追踪 ✅

添加 `labelUseFunc` Map，在 LabeledStatement 分析时记录使用位置 funcId。`compileGoto` 用 `labelUseFuncOf(labelId)` 获取使用位置，作为 longJump 的 functionId。

---

## 开发步骤完成记录

### Step 1：核心编译器 ✅

1. ✅ 调研旧 runtime/syscalls
2. ✅ 实现 `src/il/analysis.ts`（完整 Analyzer 类）
3. ✅ 实现 `src/il/compiler.ts`（纯函数族，所有 lowering 完成）

### Step 2：syscall 实现层 ✅

4. ✅ 新建 `src/il/runtime.ts`：同步 syscall + 同步 file ops + RunState 复用
5. ✅ 新建 `src/il/transform.ts`：`PascalSemanticCompiler` + `transform` + `run`
6. ✅ 在 `compiler.ts` 的 while/for/repeat lowering 中插入 `steps.check`
7. ✅ 切换 `_helper.ts` 到新管线
8. ✅ 跑通阶段 A-F 集成测试（1058/1058 全通过）

### Step 3：完整类型检查 ✅

9. ✅ Step 2 类型检查（subrange 越界、数组越界、goto 语义检查等）

### Step 4：E2E 测试 ✅

10. ✅ TANGLE 自举（s1-s7：tangle.web → tangle.pas → 编译 → 运行 → v2===v3）
11. ✅ TEX82 编译运行（s8-s14：tex.web → tex.pas → tex.js → TRIP 测试 100%）
12. ✅ plain.fmt 生成（s15：INITEX 模式 + CM 字体 + hyphen.tex）
13. ✅ tripman.tex 编译（s16：&plain 加载格式 + DVI 163 页输出）

---

## 已修复的 bug 列表

1. **operator 大小写**：`compileBinary`/`compileUnary` 用小写比较，parser 输出大写。入口处 `toUpperCase()`。
2. **状态机 case 0 bug**：`__pc=0` 无 case 匹配，switch 开头插入 `case 0:` 利用穿透。
3. **i64 除零/溢出**：`i64.div`/`i64.mod` 加除零检查，所有 i64 操作 `| 0` 截断。
4. **writeln 格式化**：解析 `x:width` / `x:width:precision` 生成 `io.write.{suffix}.fmt`。
5. **subrange 边界检查**：赋值时生成 `range.check` syscall。
6. **递归函数调用**：函数体内不绑定 funcName → retval，通过 `funcInfo(funcId).retval` 获取。
7. **eof/eoln 类型推断**：Identifier 为 eof/eoln 时 typeInfo 设为 bool。
8. **type 字面量双重 JSON**：`literalToJs` 对 type 直接返回 arg，runtime 不 JSON.parse。
9. **with 语句**：`withStack` 跟踪 record 字段，支持字段访问/赋值/嵌套。
10. **文件写入**：mock IO 未打开时自动初始化为可写。
11. **mem.default.rec 参数错位**：`args[1]` → `args[0]`（修双重 JSON 时漏改）。
12. **无参函数调用省略括号**：`compileIdentifier` 处理 sym.kind==='func' 生成无参 Call。
13. **label per-function 作用域**：`labels` 改为 `Map<funcId, Map<labelValue, ...>>`。
14. **subrange 默认值**：用 `ti.low` 而非 0（ISO 7185: 子界变量未初始化取下界）。
15. **boolean subrange**：RangeType 识别 BooleanLiteral 设 baseTag='bool'。
16. **多维数组初始化**：`createDefaultArray` 支持扁平多维和嵌套多维。
17. **with 字段优先**：with 栈优先于同名外层变量（ISO 7185 6.8.3.10）。
18. **标识符大小写不敏感**：全部用 `name.toLowerCase()` 做 key。
19. **goto 死循环兜底**：`compileGoto` 中每次跳转前插入 `steps.check` syscall。
20. **文件输出回显**：未绑定 url 的文件变量写入回显到 stdout。
21. **p11-knuth 文件相关**：packed file/text/page 等 3 个已修，F^ 在 EOF 时返回空格（决策 16）。
22. **applyProgramFileUrls 插入位置错误**：在变量初始化之后插入 preamble。
23. **F^ 在 EOF 时的未定义行为**：默认报错，启用 `fileEofBufferSpace` extension 返回空格。

---

## 如何更新本文档

- 新决策 → 添加到"已定夺的决策"，按编号顺延
- 决策定夺 → 标记 ✅，从"待定夺"移到"已定夺"
- 开发步骤完成 → 更新对应 Step 的状态
- bug 修复 → 添加到"已修复的 bug 列表"
