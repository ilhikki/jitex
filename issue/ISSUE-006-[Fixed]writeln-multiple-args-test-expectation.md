# Issue: writeln 多参数测试期望不符合 Pascal82 标准

## Date
2026-07-16

## Priority
P0

## Type
Test

## Symptom
`writeln with multiple arguments` 测试期望输出 `"1 2 3"`（带空格分隔），但实际输出 `"123"`。

## Root Cause Analysis
根据 Pascal82 标准（ISO 7185），`write` 和 `writeln` 的多个参数是连续输出的，不插入分隔符。
参数可以使用 `:width` 格式说明符指定字段宽度，如 `write(1:3, 2:3, 3:3)` 输出 `"  1  2  3"`。
不加格式说明符时，整数使用默认最小宽度（即数值本身的字符数）。

参考实现 tangle-official.pas 确认：`WRITE(TERMOUT,'@',XCHR[123],A:1,'@',XCHR[125])` 多参数连续输出无分隔符。

## Fix Plan
- File: tests/m3.6/q06-io.test.ts
- Change: 将 `expectedContains: '1 2 3'` 改为 `expectedContains: '123'`
- Risk: 无

## Fix
- `tests/m3.6/q06-io.test.ts`: 修正 `writeln with multiple arguments` 测试的 `expectedContains` 为 `'123'`

## Verification
- `writeln with multiple arguments` 测试通过

## Status
Fixed
