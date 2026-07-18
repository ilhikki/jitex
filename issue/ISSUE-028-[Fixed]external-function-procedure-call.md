# ISSUE-028: 外部函数/过程调用未支持

**状态**: Fixed
**严重程度**: High
**发现时间**: 2026-07-18
**修复时间**: 2026-07-18
**影响范围**: StaticAnalyzer

## 问题描述

TEX82 使用了未声明的外部函数和过程，编译时报错：

```
Unknown function: ERSTAT
Unknown procedure: BREAKIN
```

## 根因分析

TEX82 源码中使用了 `ERSTAT(F)` 函数（检查文件操作状态，类似 C 的 errno）和 `BREAKIN` 过程，但这些函数/过程没有在 Pascal 源码中声明——它们是外部系统调用（external procedures）。

`src/static-analyzer/index.ts` 中对未找到的函数/过程直接抛出异常：

```typescript
// 函数调用
const sym = lookupProc(scope, name)
if (!sym || !sym.returnType) {
  throw new Error(`Unknown function: ${name}`)  // 直接报错
}

// 过程调用
const sym = lookupProc(scope, name)
if (!sym) {
  throw new Error(`Unknown procedure: ${name}`)  // 直接报错
}
```

## 修复方案

将未找到的函数/过程调用当作 `SYS_CALL` 处理：

```typescript
// 函数调用修复
const sym = lookupProc(scope, name)
if (!sym || !sym.returnType) {
  const argRefs: Ref[] = []
  for (const arg of callNode.arguments) {
    const result = this.compileExpr(arg, scope)
    argRefs.push(result.ref)
  }
  const temp = this.tempVar()
  this.instructions.push({
    op: 'SYS_CALL',
    proc: name,
    args: argRefs,
    dest: temp,
  })
  return { ref: temp, typeId: 'integer' }  // 默认返回 integer
}

// 过程调用修复
const sym = lookupProc(scope, name)
if (!sym) {
  const argRefs: Ref[] = []
  for (const arg of node.arguments) {
    const result = this.compileExpr(arg, scope)
    argRefs.push(result.ref)
  }
  this.instructions.push({
    op: 'SYS_CALL',
    proc: name,
    args: argRefs,
  })
  return
}
```

## 验证结果

- `tests/tex82-compile.test.ts` analyze 阶段不再报 `Unknown function/procedure` 错误
- 全部 836 个测试通过，无回归

## 备注

- TEX82 中的外部函数/过程包括：`ERSTAT`（文件错误状态）、`BREAKIN`（断点）等
- 这些系统调用在 VM 执行阶段可能需要实现具体的 runtime 支持
- 当前修复仅解决编译阶段的问题，运行阶段的外部函数行为待 Phase 3 处理
