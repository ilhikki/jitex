# ISSUE-027: FileType 的 elementTypeId 属性缺失

**状态**: Fixed
**严重程度**: High
**发现时间**: 2026-07-18
**修复时间**: 2026-07-18
**影响范围**: StaticAnalyzer

## 问题描述

TEX82 代码中 `EQTB[K].INT` 访问失败，错误信息为：

```
Type char is not a record (field: INT)
```

通过日志发现 `file-of-record-INT,GR,HH,QQQQ` 类型的 `^` 字段访问返回 `char` 类型，而非预期的 `record-INT,GR,HH,QQQQ`。

## 根因分析

`src/static-analyzer/index.ts` 中 `resolveType` 的 `FileType` 分支创建类型对象时，没有设置 `elementTypeId` 属性：

```typescript
// 修复前
const id = ft.elementType
  ? `file-of-${this.resolveType(ft.elementType, scope).id}`
  : 'file'
return { id, kind: 'file' }  // 缺少 elementTypeId
```

后续 `compileExpr` 中文件缓冲区访问 `F^` 的处理依赖 `elementTypeId`：

```typescript
if (fieldName === '^' && objType?.kind === 'file') {
  const elemTypeId = (objType as any).elementTypeId || 'char'  // 回退到 char
  // ...
}
```

由于 `elementTypeId` 是 undefined，回退到默认值 `'char'`，导致返回错误的类型。

## 修复方案

在 `resolveType` 的 `FileType` 分支中添加 `elementTypeId`：

```typescript
// 修复后
const elementType = ft.elementType ? this.resolveType(ft.elementType, scope) : null
const id = elementType ? `file-of-${elementType.id}` : 'file'
return { id, kind: 'file', elementTypeId: elementType?.id }
```

## 验证结果

- `tests/tex82-compile.test.ts` analyze 阶段不再报 `Type char is not a record` 错误
- 全部 836 个测试通过，无回归

## 备注

- `FILE OF CHAR` 会被特殊处理为 `text` 类型，不受此修复影响
- 此修复使得 `FILE OF <record-type>` 的 `^` 操作能正确返回记录类型
