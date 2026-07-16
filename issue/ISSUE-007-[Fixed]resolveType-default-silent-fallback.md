# Issue: resolveType default 分支静默返回 INTEGER_TYPE

## Date
2026-07-16

## Priority
P0

## Type
Silent

## Symptom
`resolveType` 函数的 `default` 分支（处理未知的 TypeNode kind）返回 `INTEGER_TYPE` 而不是报错。
这意味着如果遇到无法识别的类型节点类型，解释器会静默地将其当作整数类型处理，而不是给出错误信息。

## Root Cause Analysis
`src/interpreter/types.ts` 第 188-189 行：
```typescript
default:
  return INTEGER_TYPE
```
这违反了 Fail Fast 原则。虽然 `SimpleType` 分支已修复为 throw Error（ISSUE-004），但 `default` 分支仍静默回退。

## Fix Plan
- File: src/interpreter/types.ts
- Change: 将 `default: return INTEGER_TYPE` 改为 `throw new Error(\`Unknown type node kind: ${typeNode.kind}\`)`
- Risk: 低；只会影响之前被静默忽略的未知类型节点

## Fix
- `src/interpreter/types.ts`: 将 `default: return INTEGER_TYPE` 改为 `throw new Error(\`Unknown type node kind: ${typeNode.kind}\`)`

## Verification
- 877 tests, 808 passed, 69 failed (baseline was 805 passed, 72 failed, -3 failures)

## Status
Fixed
