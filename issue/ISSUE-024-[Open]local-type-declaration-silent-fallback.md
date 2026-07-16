# Issue: createFunctionFrame 未处理局部 typeDeclarations，导致局部 type 静默回退到全局同名 type

## Date
2026-07-16

## Priority
P0 (Silent Bug)

## Type
Silent

## Symptom
当 procedure/function 内部声明了局部 `type`（如 `procedure p; const n = 5; type T = 1..n; var a: T;`），且全局已存在同名 type T 时，局部 type 声明被静默忽略，`a` 实际使用了全局 T 的定义。

失败测试：
- `Q10 › Scope Isolation › local const bound overflow should error`：期望 `a := 6` 报错（局部 T=1..5），但实际无错误（使用了全局 T=1..10）

直接证据（ts-node 验证）：
```
input:  procedure p; const n = 5; type T = 1..n; var a: T; begin a := 6; writeln(a); end;
output: "6\n"  error: null
期望:   报错（6 > 5）

input:  procedure p; const n = 5; type T = 1..n; var a: T; begin a := 3; writeln(a); end;
output: ""  error: "Undefined type: T"
说明:   单独运行（无全局 T）时报 "Undefined type: T"，
        但在 q10 测试套件中因全局 T=1..10 已注册而静默回退成功
```

## Root Cause Analysis
两层缺陷共同导致 silent fallback：

**层 1：`createFunctionFrame` 不处理局部 `typeDeclarations`**（src/interpreter/frames.ts:138-172）
函数调用时只处理：
- 参数名冲突检查
- `decl.block.constDeclarations`（注册到 fnScope.variables）
- `decl.block.variableDeclarations`（initVariables）

但没有 `decl.block.typeDeclarations.forEach(...)`，导致局部 type 声明完全被忽略。

**层 2：`resolveType` 的 'SimpleType' case 不区分作用域**（src/interpreter/types.ts:175-189）
```typescript
case 'SimpleType': {
  const name = (typeNode as SimpleTypeNode).name.name.toUpperCase()
  const builtin = findType(name)
  if (builtin) return builtin

  // 用户定义的类型
  const typeDecl = state.declarations.types.get(name)  // ← 只查全局 declarations
  if (typeDecl) {
    const resolved = resolveType(typeDecl.typeDef, state)
    registerType(name, resolved)
    return resolved
  }

  throw new Error(`Undefined type: ${name}`)
}
```

`state.declarations` 是全局的 DeclarationTable，没有 scope 链查找机制。当局部 type T 未注册时，会直接查到全局的同名 type T 并使用，没有任何警告。

**Pascal82 规范**（§6.2.2.1, §6.4.1）：
- procedure/function 的块结构顺序：label → const → type → var → procedure/function → begin
- 局部 type 声明应遮蔽同名全局 type，在该函数内使用局部定义
- 类型标识符的作用域遵循标准的标识符作用域规则

## Fix Plan
**File**: `src/interpreter/frames.ts` + `src/interpreter/types.ts`

**Change**：
1. 在 `createFunctionFrame` 中，在 initVariables 之前增加对 `decl.block.typeDeclarations` 的处理：将局部 type 注册到一个局部的 DeclarationTable（或修改 resolveType 接受 scope 参数）
2. 修改 `resolveType` 的 'SimpleType' case：先查局部 scope 的 type 表，再查全局 declarations.types

**Risk**: Medium — 需要修改 resolveType 签名或引入 scope-level type table，可能影响现有调用路径。需要保证全局 type 解析路径不回归。

**两种实现路径**：
- 方案 A（推荐）：在 Scope 上增加 `types: Map<string, TypeDeclarationNode>`，resolveType 沿 scope 链查找
- 方案 B：在 createFunctionFrame 中创建新的 DeclarationTable 包装父 declarations，覆盖 types 字段

## Reproduction
Run: `npx jest tests/m3.6/q10-range.test.ts -t "local const bound overflow should error"`

## Fix
（pending）

## Verification
（pending）

## Status
Open
