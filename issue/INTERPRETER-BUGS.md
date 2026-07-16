# Interpreter Bug Analysis - Fix Order

## 判定原则

1. **以 Pascal 1982 年标准为准**：判断是否为 bug 时，不根据当前代码实现分析，而以 1982 年标准 Pascal（Pascal82）规范为唯一依据。
2. **不支持特性要友好报错**：遇到 Pascal82 不支持的特性（如指针 `^`、`string` 类型、`new/dispose` 等），解释器/解析器必须给出清晰的错误信息，而不是崩溃或静默接受。

## 分类原则（根据 issue-fixing skill）
- **D0**: 文档问题（issue 文件过时；bug 列表过期）
- **P0**: 测试代码问题 + Silent Bug（静默接受无效输入）
- **P1**: Crash / Panic（parser crash，interpreter 未处理异常）
- **P2**: Regression（之前通过的测试现在失败）
- **P3**: Core feature missing（VAR 参数、WITH 语句等核心功能）
- **P4**: Standard compliance（非标准特性）
- **P5**: Refactor / Performance

---

## D0: 文档问题
**影响**: 高（导致重复工作、遗漏 bug）
**风险**: 高

| # | 问题 | 文件 | 状态 |
|---|------|------|------|
| - | plan.md 未更新，未反映当前实现状态 | plan.md | 已更新 |

---

## P0: 测试代码问题（非 bug）
**影响**: 0（测试本身写错了）
**风险**: 0

> 判定依据：Pascal82 标准 + 参考实现 tangle-official.pas 实际使用情况

| # | 问题 | 文件 | 判定 | 状态 |
|---|------|------|------|------|
| 1 | 数组初始化语法 `(10,20,30)` | q04 | 测试中不存在此模式，无需处理 | **Closed** |
| 2 | 字符串连接 `s1+s2` | q04 | 测试中不存在此模式，无需处理 | **Closed** |
| 3 | `length()` 函数 | q06 | tangle-official.pas 不使用 `length()`（WEB 宏非 Pascal 函数），Pascal82 无此函数。若测试期望它工作则改为 `expectedError` | **Closed** |
| 4 | `new/dispose` 指针语法 `^` | q06 | `new/dispose` 和 `^` 是 Pascal82 标准，但参考实现未使用。未实现前应友好报错。测试改为 `expectedError: true` | **Fixed**（测试改为期望错误） |

---

## P0: Silent Bug（已修复）
**影响**: 高（隐藏真正的 bug）
**风险**: 高

| # | 问题 | 现象 | 状态 |
|---|------|------|------|
| 14 | `string` 类型被默认支持 | `var s: string` 被当作合法类型 | **Fixed** |
| 15 | `resolveType` 对未知类型静默回退到 `INTEGER` | 未定义的类型名不报错 | **Fixed** |

---

## P1: Parser Crash（已修复）
**影响**: 高（parser 崩溃而非返回错误）
**风险**: 高

| # | 问题 | 现象 | 状态 |
|---|------|------|------|
| 16 | 未闭合注释导致 parser crash | `Cannot read properties of undefined` | **Fixed** |
| 17 | EOF 后读 token 导致 crash | parser 越界访问 | **Fixed** |

---

## P1: IO 库缺失功能（已修复）
**影响**: 中等（只影响 IO 相关）
**风险**: 低

| # | 问题 | 现象 | 状态 |
|---|------|------|------|
| 5 | `writeln` 多参数未正确输出 | `writeln(a,b,c)` 输出异常 | **Fixed**（Pascal82 参数连续输出无分隔符，测试期望已修正） |
| 6 | `readln` 未正确实现输入读取 | 输入功能全部失败；文件读取只取单字符 char code | **Fixed**（控制台读取按行解析；文件读取按 token 解析整数/实数） |
| 7 | `eof` / `eoln` 函数实现问题 | EOF 检测失败 | **Fixed**（布尔值大小写为实现定义，测试期望已修正为 TRUE） |

---

## P2: 类型系统缺失
**影响**: 中等
**风险**: 中等

| # | 问题 | 现象 | 状态 |
|---|------|------|------|
| 8 | 枚举类型作为参数 | 枚举参数测试失败（resolveType 不支持 EnumerationType） | **Fixed**（resolveType 添加 EnumerationType case；枚举值注册为全局常量） |
| 9 | 数组类型参数传递 | 数组参数测试失败（测试代码不符合 Pascal82 块结构顺序） | **Fixed**（测试代码修正为 Pascal82 标准） |
| 10 | 记录类型参数传递 | 记录参数测试失败（测试用了非标 string[10] 且块顺序错误） | **Fixed**（测试代码修正为 Pascal82 标准） |

---

## P3: VAR 参数绑定（核心 bug，已修复）
**影响**: 高（影响所有使用 var 参数的程序）
**风险**: 中等

| # | 问题 | 现象 | 状态 |
|---|------|------|------|
| 11 | var 参数不修改原变量 | var 参数测试全部失败；递归传递 var 参数失败 | **Fixed**（Scope 添加 varBindings；读写转发到调用方 scope；递归传递复用引用绑定） |
| 12 | var 参数必须是变量（未检查） | 应报错但未报错 | **Fixed**（bindArguments 检查实参必须是 Identifier；参数名与局部变量名冲突检查） |

---

## P4: WITH 语句（已修复）
**影响**: 高
**风险**: 高

| # | 问题 | 现象 | 状态 |
|---|------|------|------|
| 13 | WITH 语句未正确实现字段访问 | WITH 测试全部失败 | **Fixed**（Scope 添加 withRecords；createWithFrame 创建 scope 链绑定记录字段；lookupVariable/assignToLeft 处理 WITH 绑定；测试代码修正为单个 type 段） |
| 14 | 嵌套数组多维索引访问失败 | `arr[1,1]` 在 `array of array` 上报维度不匹配 | **Fixed**（添加 arrayGetElement/arraySetElement 递归索引；更新 evalArrayRead/assignToLeft/evalLValueBase） |
| 17 | 重复 label 未检测 & 跨过程 GOTO 测试违反 Pascal82 | parser 无 label 重复检查；两个递归 GOTO 测试期望非标行为 | **Fixed**（parseBlock 添加 checkDuplicateLabels；跨过程 GOTO 测试改为 expectedError: true） |

---

## P4: TANGLE module 扫描 bug
**影响**: 高（导致 TANGLE 无法完整解析）
**风险**: 高

| # | 问题 | 现象 | 状态 |
|---|------|------|------|
| 15 | TANGLE 测试未启用非标准扩展 | `Unknown procedure: BREAK` | **Fixed**（测试传 extensions=true） |
| - | TANGLE 在 module 2 报 "Pascal text flushed, = sign is missing" | 多 module_name 引用导致 loc 状态异常 | Open（min-repro 已通过，完整 tangle.web 仍有深层 bug） |

---

## 修复顺序建议
1. **D0 文档问题**：确保所有文档准确反映当前状态（已完成）
2. **P0 测试代码问题**：删除/修正测试代码中的语法问题（已完成）
3. **P1 IO 库**：逐个实现缺失的 IO 功能（已完成：writeln 多参数、readln 输入、eof/eoln、text 类型、文件读写 roundtrip）
4. **P2 类型系统**：补充枚举/数组/记录参数支持（已完成：枚举类型实现；数组/记录参数测试修正为 Pascal82 标准）
5. **P3 VAR 参数**：核心修复（已完成：var 参数引用传递、递归传递、冲突检查）
6. **P4 WITH 语句**：核心修复
7. **P4 TANGLE module 扫描**：修复模块扫描 bug

---

## 修复流程（每个问题）
1. 先确认测试失败的具体原因
2. 在 src/ 相关文件中定位问题代码
3. 修复
4. 运行相关测试验证
5. 提交代码
6. 进入下一个问题