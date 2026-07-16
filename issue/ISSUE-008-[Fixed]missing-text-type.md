# Issue: Pascal82 标准类型 `text` 未预定义

## Date
2026-07-16

## Priority
P3

## Type
Feature

## Symptom
声明 `var f: text;` 时报错 `Undefined type: TEXT`。
在 Pascal82（ISO 7185）中，`text` 是标准预定义类型，等价于 `packed file of char`。

## Root Cause Analysis
`src/interpreter/types/pascal-value.ts` 的 TYPE_TABLE 中缺少 `TEXT` 条目。
Pascal82 预定义类型包括：integer, real, char, boolean, text。
当前 TYPE_TABLE 有前四个，但缺少 `text`。

## Fix Plan
- File: src/interpreter/types/pascal-value.ts
- Change: 在 TYPE_TABLE 中添加 `'TEXT': new FileType('TEXT', CHAR_TYPE)`
- Risk: 低；只是添加一个预定义类型

## Fix Applied
在 TYPE_TABLE 中添加了 `'TEXT': new FileType('TEXT', CHAR_TYPE)`。
所有使用 `var f: text;` 的测试现已通过（rewrite/writeln/reset/readln/eof 等文件操作）。

## Status
Fixed
