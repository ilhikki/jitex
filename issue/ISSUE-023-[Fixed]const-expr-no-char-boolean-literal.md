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

扩展修复（char/boolean 子界的完整支持）：
- `src/interpreter/types.ts` resolveType 'RangeType' case：根据边界字面量类型推断基类型（char 子界→CHAR_TYPE，boolean 子界→BOOLEAN_TYPE）
- `src/interpreter/types/pascal-value.ts` coerceToType：扩展 boolean→integer 为 boolean→integer/subrange，添加范围检查
- `src/interpreter/evaluator.ts` formatValue：对 char/boolean 子界按基类型输出（char 输出字符，boolean 输出 TRUE/FALSE）

## Reproduction
Run: `npx jest tests/m3.6/q10-range.test.ts -t "char subrange basic"`

## Fix
1. `src/interpreter/types.ts`：
   - import 添加 `BooleanLiteralNode`、`CharLiteralNode`
   - `evaluateConstExpr` 添加 `case 'CharLiteral'`（返回 `value.charCodeAt(0)`）和 `case 'BooleanLiteral'`（返回 `value ? 1 : 0`）
   - `resolveType` 'RangeType' case：根据 `sub.start.kind`/`sub.end.kind` 推断 baseType（CharLiteral→CHAR，BooleanLiteral→BOOLEAN，默认 INTEGER）
2. `src/interpreter/types/pascal-value.ts`：
   - `coerceToType` boolean→integer 扩展为 boolean→integer/subrange，添加 checkRange
3. `src/interpreter/evaluator.ts`：
   - import 添加 `SubrangeType`
   - `formatValue` 'subrange' case：根据 `sub.baseType.kind` 输出（char→String.fromCharCode，boolean→TRUE/FALSE，默认数字）

## Verification
- `npx jest tests/m3.6/q10-range.test.ts`：49/49 通过
- `npx jest --no-coverage`：925 通过，1 失败（tangle ISSUE-003 已知问题，非回归）
- 之前基线：876 通过 1 失败（tangle）；修复后：925 通过 1 失败（tangle，同一个），新增 49 测试全通过

## Status
Fixed
