# Issue: 记录类型参数测试代码不符合 Pascal82 标准

## Date
2026-07-16

## Priority
P2

## Type
Test code (非 bug)

## Symptom
`参数类型组合-记录参数` 测试失败，报错 `Expected type definition`。

## Root Cause Analysis
测试代码违反 Pascal82 标准的两处：

1. **使用了非标准类型 `string[10]`**：Pascal82 没有 `string` 类型，也没有 `string[n]` 语法。字符串应表示为 `packed array[1..n] of char`。
2. **块结构顺序错误**：测试把 `procedure` 声明放在 `var` 之前。Pascal82 标准的块结构顺序为：`label → const → type → var → procedure/function → compound`。

parser 严格按 Pascal82 顺序解析，遇到 `procedure` 后再出现 `var` 会报错 `Expected keyword BEGIN but got VAR`，这是符合标准的正确行为。

## Fix Plan
- File: tests/m3.6/q02-parameters.test.ts
- Change:
  - 将 `name: string[10]` 改为 `initial: char`（纯粹测试 record 参数传递，不引入字符串复杂性）
  - 将 `var` 段移到 `procedure` 声明之前，符合 Pascal82 块结构顺序
- Risk: 0（仅测试代码修正）

## Fix Applied
测试代码修正为 Pascal82 标准结构：type → var → procedure → compound。
记录类型作为值参数传递本身工作正常，测试通过。

## Status
Fixed
