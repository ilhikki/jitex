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
- 调用约定：`{let __c={v:v1}; foo(__c); v1=__c.v;} `
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

---

## 开发步骤记录

### Step 1：核心编译器（已完成 ✅）

1. ✅ 调研旧 runtime/syscalls（`src/runtime/syscalls.ts` 的 `createExtendedSysCalls`）
2. ✅ 实现 `src/il/analysis.ts`
   - `class Analyzer` 完整实现
   - 全局唯一 ID 计数器
   - 作用域栈 + 符号绑定（var/param/func/const/type）
   - 标号信息（labelId + funcId）
   - Block↔Function / Decl↔Function 归属
   - 函数签名（params/locals/retval）
   - with 临时变量分配
   - 表达式类型推断（精确到 i64/f64/bool/char/str/array/rec/set/enum/subrange/file）
   - `allocTempLocal(funcId)` 接口
3. ✅ 实现 `src/il/compiler.ts`
   - 纯函数族：`compileProgram` / `compileStmt` / `compileExpr`
   - 所有控制流 lowering（if/while/for/repeat/case/with/goto/labeled）
   - 所有表达式 lowering（字面量/标识符/二元/一元/函数调用/数组/记录/集合/in）
   - 左值 lowering（简单变量 Assign / 复杂左值 Eval+syscall）
   - 内置函数 → syscall 映射（abs/sqr/sqrt/sin/cos/exp/ln/arctan/trunc/round/ord/chr/pred/succ/odd/length/eof/eoln）
   - 内置过程 → syscall 映射（writeln/write/readln/read/reset/rewrite/close/assign/break/page/get/put）

### Step 2：syscall 实现层（进行中 🚧）

4. ⏳ 新建 `src/il/runtime.ts`：syscall 实现 + RunState
5. ⏳ 新建 `src/il/transform.ts`：入口，实现 ToJsOptions
6. ⏳ 切换 `_helper.ts` 到新管线
7. ⏳ 跑通阶段 A 测试（p01-basics/control-flow/procedures）

### Step 3：完整类型检查（计划中）

8. ⏳ Step 2 类型检查（详见 task.md Phase 6 Step 2）

---

## 已定夺的决策 ✅（用户确认）

### 决策 6：syscall 在 JS codegen 阶段的实现方式 ✅

**确定：由 `SemanticCompiler` 接口解耦，不算重大问题**

`json-code-compiler.ts` 已定义 `SemanticCompiler` 接口：
```typescript
syscallToJs(syscall: JsonCode.Syscall, compiler: JsCompiler): string | undefined
literalToJs(literal: JsonCode.Literal, compiler: JsCompiler): string | undefined
```

具体每个 key 怎么翻译（inline 还是走 dispatcher）由 `transform.ts` 里的 SemanticCompiler 实现决定，不影响 compiler.ts 生成的 JsonCode。开发时按"算术/比较/逻辑/转换 inline，IO/file/cell/mem/set 走 dispatcher"实现，但这是实现细节，不是架构决策。

### 决策 7：syscall 是否异步 ✅

**确定方案 C：全部同步**

- 所有 syscall 同步，文件 IO 用同步 API
- 生成的 JS 代码无 `await`，性能最好
- 文件操作在测试环境无阻塞问题
- 由于 file-model.ts 的方法是 async 签名，需要在 runtime.ts 里写同步版本（参考 file-model 的逻辑）

### 决策 8：maxSteps 步数限制 ✅

**确定方案 B：循环回边处插入步数检查**

- 在 `compiler.ts` 的 `compileWhile` / `compileFor` / `compileRepeat` 里，于 `jumpStmt(L_top)` 之前插入 `eval(syscall("steps.check", []))`
- runtime 的 `steps.check` syscall 实现：`if (++steps > maxSteps) throw`
- goto 死循环靠 syscall 计数兜底（如果有走 dispatcher 的 syscall 在循环体内）
- **原则：对 `json-code-compiler.ts` 的非修复 bug 改动尽量少**——步数检查在 compiler.ts 生成 JsonCode 时插入，json-code-compiler.ts 不需要改

### 决策 9：RunState / 文件 IO 复用 ✅

**确定方案 A：复用 RunState，file-model 逻辑参考但同步化**

- `RunState` 直接 import `src/runtime/run-state.ts`（数据结构复用）
- `file-model.ts` 的 `PascalFile` 类型直接复用
- `createRecordFileOps` 的逻辑参考，但在 `runtime.ts` 里写同步版本（因为决策 7 选 C 全同步，不能直接调用 async 方法）
- 不修改 `file-model.ts` 本身（保持旧 runtime 不变）
- **权衡说明**：决策 7（全同步）与决策 9（复用 file-model）有冲突——file-model 方法是 async 签名。解决方案是"逻辑复用，签名同步化"，即在 runtime.ts 里重新实现一份同步的 file ops，逻辑参考 file-model.ts。这不算重复造轮子，因为同步版本和异步版本是不同的接口契约。

---

## 开发步骤记录（更新）

### Step 1：核心编译器（已完成 ✅）

1. ✅ 调研旧 runtime/syscalls（`src/runtime/syscalls.ts` 的 `createExtendedSysCalls`）
2. ✅ 实现 `src/il/analysis.ts`（完整 Analyzer 类）
3. ✅ 实现 `src/il/compiler.ts`（纯函数族，所有 lowering 完成）

### Step 2：syscall 实现层（进行中 🚧）

4. ⏳ 新建 `src/il/runtime.ts`
   - 同步 syscall 实现（算术/比较/逻辑/转换/IO/file/cell/mem/set）
   - 同步 file ops（参考 file-model.ts 逻辑）
   - RunState 复用 `src/runtime/run-state.ts`
   - steps.check syscall（配合决策 8）
5. ⏳ 新建 `src/il/transform.ts`
   - 实现 `SemanticCompiler` 接口
   - `literalToJs`：i64/f64/str/char/bool → JS 字面量
   - `syscallToJs`：算术 inline，IO/file 走 `__sys` dispatcher
   - 入口函数 `transform(source, options)` → JS 代码字符串
6. ⏳ 在 `compiler.ts` 的循环 lowering 中插入 `steps.check` syscall
7. ⏳ 切换 `_helper.ts` 到新管线
8. ⏳ 跑通阶段 A 测试（p01-basics/control-flow/procedures）

### Step 3：完整类型检查（计划中）

9. ⏳ Step 2 类型检查（详见 task.md Phase 6 Step 2）

---

## 开发步骤记录（最新更新）

### Step 2：syscall 实现层（已完成 ✅）

4. ✅ 新建 `src/il/runtime.ts`：同步 syscall + 同步 file ops + RunState 复用
5. ✅ 新建 `src/il/transform.ts`：`PascalSemanticCompiler` + `transform` + `run`
6. ✅ 在 `compiler.ts` 的 while/for/repeat lowering 中插入 `steps.check`
7. ✅ 切换 `_helper.ts` 到新管线（`runPascal` → `run`）

### Step 3：跑通集成测试（进行中 🚧）

已修复的 bug（按时间顺序）：

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
13. **label per-function 作用域**：`labels` 改为 `Map<funcId, Map<labelValue, ...>>`，`labelInfo(funcId, labelNum)` 沿 parentFuncId 链查找。FuncInfo 加 `parentFuncId`。
14. **subrange 默认值**：用 `ti.low` 而非 0（ISO 7185: 子界变量未初始化取下界）。
15. **boolean subrange**：RangeType 识别 BooleanLiteral 设 baseTag='bool'，`typeSuffix` 按 baseTag 分发。
16. **多维数组初始化**：`createDefaultArray` 支持扁平多维（dims 多个）和嵌套多维（elem 是 array）。
17. **with 字段优先**：`compileIdentifier`/`compileAssignment` 中 with 栈优先于同名外层变量（ISO 7185 6.8.3.10）。
18. **标识符大小写不敏感**：`bind`/`lookup`/`withStack.fields`/`typeAliases`/`forwardFuncs`/`globalBindings` 全部用 `name.toLowerCase()` 做 key（决策 12）。
19. **goto 死循环兜底**：`compileGoto` 中每次跳转前插入 `steps.check` syscall（决策 13）。
20. **文件输出回显**：未绑定 url（url=''）的文件变量写入回显到 stdout，复现旧 runtime 无 io 时的 fallback 行为（决策 15）。
21. **p11-knuth 文件相关**：packed file/text/page 等 3 个已修，仅剩 F^ 在表达式中使用（EOF 时返回值问题，见决策 16）。

### 当前测试状态（阶段 A-F，全量回归 2026-08-04，Step 2 完成后）

| 阶段 | 文件 | 通过/总数 | 备注 |
|------|------|-----------|------|
| A | p01-basics | 59/59 ✅ | — |
| A | p01-control-flow | 53/53 ✅ | — |
| A | p01-procedures | 6/6 ✅ | — |
| B | p01-io | 50/50 ✅ | — |
| B | p04-parameters | 40/40 ✅ | Step 2：参数名同名检查 |
| B | p04-scope | 38/38 ✅ | — |
| C | p03-array-record | 31/31 ✅ | Step 2：数组越界检查 |
| C | p03-range | 49/49 ✅ | Step 2：subrange/char 越界检查 |
| C | p03-variant-record | 3/3 ✅ | — |
| D | p03-file | 17/17 ✅ | — |
| D | p04-goto | 57/57 ✅ | Step 2：goto 语义检查 + label 声明修复 |
| D | p04-goto-advanced | 20/20 ✅ | Step 2：跳入非透明块检查 |
| D | p04-goto-critical | 28/28 ✅ | Step 2：label shadowing 修复 |
| D | p04-goto-fix | 5/5 ✅ | — |
| D | p04-goto-scope-repro | 3/3 ✅ | — |
| E | p04-goto-label-in-block | 4/4 ✅ | — |
| F | p10-conformance | 44/44 ✅ | — |
| F | p13-pascal82-conformance | 5/5 ✅ | — |
| F | p15-nonstandard | 8/8 ✅ | Step 2：string 类型检查 |
| — | p11-knuth-pascal | 20/20 ✅ | 决策 16：fileEofBufferSpace extension |

**总结**：1058/1058 全通过（0 失败）。Step 2 类型检查完成。

### 已发现待修复的 bug（未编号）

22. **applyProgramFileUrls 插入位置错误** ✅（已修复）：`transform.ts` 的 `applyProgramFileUrls` 把 `file.assign` 语句插到 body 最前面（`[...preamble, ...fn.body]`），但变量初始化语句也在 body 开头。导致 `file.assign` 执行时变量还未初始化（undefined），报 `Cannot set properties of undefined (setting 'url')`。
    - 修复：通过 `a.funcInfo(fn.id)` 获取变量初始化数量（`info.locals.length + (info.retval ? 1 : 0)`），在变量初始化之后插入 preamble。p03-file 17/17 全通过。

23. **F^ 在 EOF 时的未定义行为** ✅（已修复，决策 16）：按 AGENTS.md 原则 A，ISO 7185 6.9.8 规定 F^ 在 EOF 时未定义。默认报错，启用 `fileEofBufferSpace` extension 返回空格（UCSD/Borland 扩展）。p11-knuth 20/20 全通过。

### 待定夺的关键决策 ❓

#### 决策 12：标识符大小写不敏感 ✅（用户定夺：现在修）

**确定方案 A**：analysis 的 `bind`/`lookup`/`withStack.fields`/`typeAliases`/`forwardFuncs`/`globalBindings` 全部用 `name.toLowerCase()` 做 key。compiler 的 `resolveSymbol` 也用小写查。

#### 决策 13：goto 死循环兜底 ✅（用户定夺：compileGoto 插 steps.check）

**确定方案 A**：在 `compiler.ts` 的 `compileGoto` 中，每次 goto 跳转前插入 `steps.check` syscall。

#### 决策 14：record 字段 subrange 越界检查 ✅（用户定夺：Step 2 再做）

**确定方案 B**：Step 1 不补全，这些是 expectedError 测试，属类型检查范畴。

#### 决策 15：p11-knuth 文件相关失败 ✅（用户定夺：逐个调试）

**确定方案 A**：逐个调试修复 4 个文件相关 bug。

1. **`compileBinary: unknown operator DIV/MOD`** — `compiler.ts` 中 `compileBinary` 用小写 `'div'`/`'mod'` 比较，但 parser 输出大写 `'DIV'`/`'MOD'`。同理 `compileUnary` 的 `'NOT'`、`compileBinary` 的 `'AND'`/`'OR'`。
   - 修复：`node.operator.toUpperCase()` 后再比较（与原 `compiler/emit/expressions.ts` 一致）

2. **`Unexpected identifier 'v2'`** — `json-code-compiler.ts` 的 `compileStateBody` 有设计缺陷：
   - `__pc` 初始值 0，但 `Analyzer.nextId_` 从 1 开始，label ID 最小是 1
   - 所以 `switch(__pc)` 中 `case 0` 不存在，pc=0 直接走 `default: return;` 提前退出
   - 更严重的是：非 label 的 statement（如变量初始化 `assign`）在 switch 中出现在任何 `case` 之前，JS 语法上这些代码虽然合法但**永远不会被执行**（switch 直接跳到匹配的 case）
   - 表现为：函数体里的变量初始化代码被跳过，后续引用未声明变量报 `Unexpected identifier`

### 待定夺的关键决策 ❓

#### 决策 10：`json-code-compiler.ts` 状态机 case 0 bug 修复策略 ❓

**bug 本质**：`compileStateBody` 的 `switch(__pc)` 中，`__pc=0` 无 case 可匹配，且非 label statement 在 switch 顶层不被执行。

**方案 A（推荐，最小改动）**：在 `compileStateBody` 的 switch 开头**总是**插入 `case 0:`，利用 switch 穿透语义让 pc=0 落到第一个实际 label 或顺序执行非 label statement。
- 改动量：1 行
- 风险：低
- 限制：要求 label ID 永远不为 0（当前 `nextId_=1` 起步，满足）

**方案 B**：修改 `compiler.ts`，确保每个函数 body 的第一条 statement 是 `labelStmt(0)`（需要让 `nextId` 能产出 0，或单独预留 ID=0 给"函数入口 label"）。
- 改动量：compiler.ts 多处
- 风险：中（要保证 ID=0 不被其他用途占用）

**方案 C**：重构 `compileStateBody`，把 body 按 label 切分成"基本块"，每个基本块用一个 `case` 包裹，pc 初始值设为 body 中第一个 label 的 ID（若无 label 则用 0 并插入 `case 0`）。
- 改动量：重写 `compileStateBody`
- 风险：中
- 优点：语义最清晰，不依赖 switch 穿透

#### 决策 11：operator 大小写统一策略 ❓（轻微，可一起定夺）

parser 输出大写 operator（`'DIV'`/`'MOD'`/`'AND'`/`'OR'`/`'NOT'`），新 `compiler.ts` 用小写比较。

**方案 A（推荐）**：在 `compiler.ts` 的 `compileBinary`/`compileUnary` 入口处 `node.operator.toUpperCase()`，与原 `compiler/emit/expressions.ts` 一致。
**方案 B**：修改 parser，统一输出小写 operator（影响面大，不推荐）。

---

#### 决策 16：F^ 在 EOF 时的返回值 ✅（用户定夺：用非标参数定义未定义行为）

**背景**：测试用例 `p11-knuth-pascal.test.ts` 中 "F^ 在表达式中使用"：
```pascal
REWRITE(F);
IF F^ = ' ' THEN WRITELN('space') ELSE WRITELN('other');
```
REWRITE 后 F 为空文件，EOF=true，访问 F^ 属 ISO 7185 6.9.8 的未定义行为。

**确定方案（按 AGENTS.md 原则 A 标准锚定）**：
- ISO 7185 6.9.8: "After EOF(f) becomes true, the file-buffer-variable f^ is undefined."
- 默认行为：F^ 在 EOF 时访问报错（原则 5/6：未定义行为默认报错）
- 非标 extension `fileEofBufferSpace`：启用后 EOF 时 F^ 返回空格（UCSD/Borland 扩展，Knuth WEB 系统依赖）
- 测试用例启用 extension（原则 9：非标特性配正反测试）

**实现要点**：
1. `RuntimeOptions` / `RuntimeContext` 添加 `extensions` 字段
2. `runtime.ts` 的 `peekFile`：EOF 时若未启用 extension 抛错，启用则返回 `' '`
3. `_helper.ts` 传递 `test.extensions` 到 `run`
4. `transform.ts` 的 `RunOptions` 透传 `extensions`
5. p11-knuth 测试用例启用 `fileEofBufferSpace`，并配反测试（默认报错）

---

#### 决策 17：goto 语义检查采用 ISO 7185 立场（允许跨过程 goto 到祖先函数）

**背景**：测试用例中存在两种立场的跨过程 goto 测试：
- ISO 7185 立场：允许从内层过程 goto 到祖先函数的 label（7 个测试期望成功）
- Pascal82 立场：禁止所有跨过程 goto（3 个 `goto-recursion-*` 测试期望报错）

**决策**：采用 ISO 7185 立场。理由：
1. 编译器遵循 ISO 7185 标准（AGENTS.md 原则 A）
2. 7 个期望成功的测试覆盖了跨过程 goto 的核心场景（过程→主程序、内层→外层、多层嵌套）
3. Pascal82 立场的 3 个测试改为期望成功，与 ISO 7185 一致

**实现**：
- `checkGotos()` 中：`labelInfo.funcId !== fromFuncId` 时，用 `isAncestorFunc` 检查是否为祖先函数
- 祖先函数 label 允许跳转；非祖先函数（平行过程、反向跨过程）禁止

---

#### 决策 18：label 使用位置追踪（longJump 目标 = 使用位置，非声明位置）

**背景**：label 可能在祖先函数声明，但在后代函数使用：
```pascal
program test;        // main 声明 label 30
label 30;
procedure level1;
  procedure level2;
  begin
    ...
30:                   // level2 使用 label 30
    writeln('L2 end');
  end;
```

**问题**：`labelInfo` 返回声明位置的 funcId（main），但 longJump 需跳到使用位置（level2）。
- main 没有 state machine（body 无 label/jump），无法捕获 longJump 的 throw
- throw 0 穿透到顶层，报 "Unexpected error: 0"

**决策**：添加 `labelUseFunc` Map，在 LabeledStatement 分析时记录使用位置 funcId。
- `compileGoto` 用 `labelUseFuncOf(labelId)` 获取使用位置，作为 longJump 的 functionId
- `labelInfo` 仍返回声明位置（用于作用域检查）
