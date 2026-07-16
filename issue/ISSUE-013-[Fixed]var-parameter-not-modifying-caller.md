# Issue: VAR 参数不修改调用方变量

## Date
2026-07-16

## Priority
P3

## Type
Bug (核心功能)

## Symptom
Pascal82 标准的 `var` 参数（引用传递）不工作。函数内修改 var 参数后，调用方变量值不变。

测试 `var参数修改调用方变量` 期望调用方变量被修改，实际值不变。

此外，`var参数必须是变量` 期望传非变量给 var 参数时报错，实际静默接受。

## Root Cause Analysis
`src/interpreter/evaluator.ts` 的 `bindArguments` 中 var 参数处理有多个问题：

1. **赋值不反映到调用方**：`bindArguments` 虽然把调用方变量的 `PascalValue` 对象引用设到函数 scope，但 `assignToLeft`（frames.ts）用 `variables.set(name, finalValue)` **替换**了整个对象，而非修改原对象的 `rawValue`，所以调用方看不到变化。

2. **递归传递 var 参数失败**：当 var 参数作为另一个 var 参数的实参传递时（递归调用），`findVariableScope` 找到的是函数 scope 而非原始调用方 scope，导致引用链断裂。

3. **var 参数必须是变量**：传表达式给 var 参数时静默接受，未报错。Pascal82 标准要求 var 参数实参必须是变量标识符。

4. **参数名与局部变量名冲突未检查**：Pascal82 标准要求参数名不能与局部变量名重复，但当前实现静默覆盖。

## Fix Plan
- File: src/interpreter/types.ts, src/interpreter/evaluator.ts, src/interpreter/frames.ts
- Change:
  - 在 `Scope` 中添加 `varBindings: Map<string, { scope: Scope; name: string }>` 记录 var 参数引用
  - `bindArguments` 设置 varBindings：var 参数的读写转发到调用方 scope
  - `bindArguments` 检查实参是否是 var 参数（递归传递），复用其引用绑定
  - `bindArguments` 检查 var 参数实参必须是 Identifier，否则报错
  - `lookupVariable` 优先检查 varBindings，从调用方 scope 读取最新值
  - `assignToLeft` 检查 varBindings，赋值转发到调用方 scope
  - `createFunctionFrame` 添加参数名与局部变量名冲突检查
- Risk: 中等；影响所有 var 参数调用

## Fix Applied
- Scope 添加 `varBindings` 字段和 `findVarRef` 辅助函数
- `bindArguments` 重写 var 参数处理：
  - 实参必须是 Identifier，否则抛错
  - 用 `findVarRef` 检查实参是否也是 var 参数，复用其引用绑定（支持递归传递）
  - 否则绑定到调用方 scope 的变量
- `lookupVariable` 优先检查 varBindings，从调用方 scope 读取
- `assignToLocal` 检查 varBindings，赋值转发到调用方 scope
- `createFunctionFrame` 添加参数名与局部变量名冲突检查（Pascal82 语义检查）

测试结果：q02-parameters 全部 40 个测试通过，包括 var 参数修改调用方、var 参数必须是变量、多个 var 参数、嵌套/递归过程中的 var 参数。

## Status
Fixed
