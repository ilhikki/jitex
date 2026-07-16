# Issue: 数组类型参数测试代码不符合 Pascal82 标准

## Date
2026-07-16

## Priority
P2

## Type
Test code (非 bug)

## Symptom
`参数类型组合-数组参数` 测试失败，报错 `Expected keyword BEGIN but got VAR (var) at line 8:1`。

## Root Cause Analysis
测试代码违反 Pascal82 标准的两处：

1. **两个连续的 `var` 段**：`var arr: IntArray;` 和 `var s: integer;` 是两个独立的 var 段。Pascal82 标准中每个声明段只出现一次，应合并为 `var arr: IntArray; s: integer;`。
2. **块结构顺序错误**：`procedure` 声明在 `var` 之前。Pascal82 标准的块结构顺序为：`label → const → type → var → procedure/function → compound`。

此外，测试还依赖 `var result: integer`（var 参数），但 var 参数是 Pascal82 标准特性，当前未实现（属于 P3 #11），会作为独立 bug 修复。

parser 严格按 Pascal82 顺序解析，遇到 `procedure` 后再出现 `var` 会报错，这是符合标准的正确行为。

## Fix Plan
- File: tests/m3.6/q02-parameters.test.ts
- Change:
  - 将 `var` 段移到 `function` 声明之前，符合 Pascal82 块结构顺序
  - 合并为单个 `var` 段
  - 改用函数返回值替代 var 参数，纯粹测试数组值参数传递（var 参数作为 P3 #11 单独测试）
- Risk: 0（仅测试代码修正）

## Fix Applied
测试代码修正为 Pascal82 标准结构：type → var → function → compound。
数组类型作为值参数传递本身工作正常，测试通过。

## Status
Fixed
