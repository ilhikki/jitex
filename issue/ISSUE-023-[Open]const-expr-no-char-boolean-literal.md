# Issue: evaluateConstExpr 不支持 CharLiteral 和 BooleanLiteral

## Date
2026-07-16

## Priority
P3 (Core feature missing)

## Type
Feature

## Symptom
当 char 或 boolean 字面量用于子界类型边界时，`evaluateConstExpr` 抛出 `Unsupported constant expression: CharLiteral` 或 `Unsupported constant expression: BooleanLiteral`。

失败测试：
- `Q10 › Basic Subrange › char subrange basic`：`type T = 'A'..'Z'` → `Unsupported constant expression: CharLiteral`
- `Q10 › Basic Subrange › boolean subrange`：`type T = false..true` → `Unsupported constant expression: BooleanLiteral`

## Root Cause Analysis
`evaluateConstExpr`（src/interpreter/types.ts:284）的 switch 只处理 `IntegerLiteral`、`RealLiteral`、`Identifier`、`BinaryExpression`、`UnaryExpression`，没有 `CharLiteral` 和 `BooleanLiteral` 的 case，落入 default 分支抛出错误。

Pascal82 §6.4.3.2 允许 char 和 boolean 作为子界基类型，边界可以是字面量。

## Fix Plan
- File: `src/interpreter/types.ts`
- Change: 在 `evaluateConstExpr` 中添加 `case 'CharLiteral'`（返回字符的 ASCII 码）和 `case 'BooleanLiteral'`（返回 0 或 1）。
- Risk: Low — 纯新增 case，不影响现有路径。

## Reproduction
Run: `npx jest tests/m3.6/q10-range.test.ts -t "char subrange basic"`

## Fix
（pending）

## Verification
（pending）

## Status
Open
