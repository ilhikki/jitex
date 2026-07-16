# Issue: SET type not implemented (P3 Core feature missing)

## Date
2026-07-16

## Priority
P3 (Core feature missing)

## Type
Feature

## Symptom
Five set-operation tests in `tests/m3.6/q05-operations.test.ts` fail with `Unknown type node kind: SetType`. SET is a Pascal82 standard type but was never in the project plan (plan.md M2 covers array/record/file but not set).

Failing tests:
- `Set Operations › set union`
- `Set Operations › set intersection`
- `Set Operations › set difference`
- `Set Operations › IN operation`
- `Set Operations › set assignment`

The error is clear (not silent), but the tests expect SET to work.

## Root Cause Analysis
`resolveType` in `src/interpreter/types.ts` has no `case 'SetType'` branch — it falls through to `throw new Error('Unknown type node kind: SetType')`. Additionally:
- No `SetType` PascalType class exists in `pascal-value.ts`
- `SetConstructorNode` (`[1,2,3]`) is not handled in `evalExpr`
- `InExpressionNode` (`x in s`) is not handled in `evalExpr`
- Set operations (`+`, `-`, `*`) are not dispatched to set semantics in `binaryOp`

The AST already has `SetTypeNode`, `SetConstructorNode`, and `InExpressionNode` defined (src/ast/types.ts) and the parser produces them, so this is purely an interpreter gap.

## Fix Plan
- File: `src/interpreter/types/pascal-value.ts`
  - Add `SetType` class (kind 'set', baseType, min, max; stored as a Set<number> or boolean[]).
  - Add `makeSet`, `createEmptySet` helpers.
  - Add set `add`/`sub`/`mul`/`eq`/`ne`/`le`/`ge`/`lt`/`gt` ops to SetType.
- File: `src/interpreter/types.ts`
  - Add `case 'SetType'` in `resolveType`.
- File: `src/interpreter/evaluator.ts`
  - Handle `SetConstructorNode` in `evalExpr` (build set from element/range pairs).
  - Handle `InExpressionNode` in `evalExpr` (membership test; left is scalar, right is set).
- File: `src/interpreter/types/pascal-value.ts` `binaryOp`
  - Route `+`/`-`/`*` to set ops when operands are sets; route `IN`/`=`/`<>`/`<=`/`>=` accordingly.
- Risk: Medium — new feature; must not regress existing arithmetic dispatch. Set values stored as `Set<number>` (for integer/char base). Subrange/enum base types map members to ordinals.

## Reproduction
Run: `npx jest tests/m3.6/q05-operations.test.ts -t "Set Operations"`

## Fix
Implemented SET type end-to-end:

- `src/interpreter/types/pascal-value.ts`:
  - Added `'set'` to `PascalTypeKind`.
  - Added `SetType` class (kind 'set', baseType, min, max). rawValue is `Set<number>` of element ordinals. Implements `add` (union), `sub` (difference), `mul` (intersection), `eq`/`ne` (equality), `le` (subset), `ge` (superset). `isAssignableFrom` accepts any set type.
  - Added `case 'set'` to `makeDefaultValue` (returns empty `Set<number>`).
  - Updated `coerceToType` to handle set→set assignment: validates each element ordinal is within the target set's `min..max` range, then returns a copy with the target type (avoids shared-reference aliasing).
- `src/interpreter/types.ts`:
  - Added `case 'SetType'` to `resolveType`. Resolves `baseType` and derives `min`/`max` from it (subrange uses its `min`/`max`; char uses 0..255; boolean uses 0..1; integer clamped to 0..255 as an implementation limit).
- `src/interpreter/evaluator.ts`:
  - Added `case 'SetConstructor'` to `evalExpr`: evaluates each `[start, end|null]` pair, expands ranges, stores ordinals in a `Set<number>`. Returns a temp `SetType(INTEGER, 0..255)`; the final target type is applied via `coerceToType` on assignment.
  - Added `case 'InExpression'` to `evalExpr`: evaluates the left scalar and right set, tests membership by ordinal, returns boolean.
  - Added `ordinalOf` helper (integer/subrange→number, char→ASCII code, boolean→0/1).
  - Added `SetConstructor`/`InExpression` cases to `inferExprType` (generic set type / boolean).

Set operations dispatch through existing `binaryOp` → `left.type.add!/sub!/mul!/eq!/...` which now routes to `SetType` methods when the left operand is a set.

## Verification
`npx jest tests/m3.6/q05-operations.test.ts` — all 5 set tests pass (`set union`, `set intersection`, `set difference`, `IN operation`, `set assignment`). Full suite: 876 passed, 1 failed (the excluded tangle-run test, ISSUE-003).

## Status
Fixed
