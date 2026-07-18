# ISSUE-029: 文件缓冲区赋值操作未支持

**状态**: Fixed
**严重程度**: High
**发现时间**: 2026-07-18
**修复时间**: 2026-07-18
**影响范围**: StaticAnalyzer

## 问题描述

对文件缓冲区 `F^` 的赋值操作失败，错误信息为：

```
Type file-of-record-INT,GR,HH,QQQQ is not a record
```

## 根因分析

`src/static-analyzer/index.ts` 中 `compileAssignment` 的字段访问处理只支持 record 类型，没有特殊处理文件类型的 `^` 操作符：

```typescript
// 修复前
} else if (leftNode.kind === 'FieldAccess') {
  const fieldAccess = leftNode as FieldAccessNode
  const obj = this.compileExpr(fieldAccess.object, scope)
  const fieldName = fieldAccess.field.name.toUpperCase()
  const objType = this.typeTable.get(obj.typeId)
  if (!objType || objType.kind !== 'record') {
    throw new Error(`Type ${obj.typeId} is not a record`)  // 文件类型直接报错
  }
  // ...
}
```

当左值是 `F^`（文件缓冲区访问）时，`objType.kind` 是 `'file'` 而非 `'record'`，导致抛出异常。

## 修复方案

在 `compileAssignment` 中添加对文件 `^` 字段的特殊处理，编译为 `SYS_CALL WRITE_FILE`：

```typescript
// 修复后
} else if (leftNode.kind === 'FieldAccess') {
  const fieldAccess = leftNode as FieldAccessNode
  const obj = this.compileExpr(fieldAccess.object, scope)
  const fieldName = fieldAccess.field.name.toUpperCase()
  const objType = this.typeTable.get(obj.typeId)
  if (!objType) {
    throw new Error(`Unknown type for object: ${obj.typeId}`)
  }
  // 文件缓冲区赋值 F^ := value
  if (fieldName === '^' && objType.kind === 'file') {
    const elemTypeId = (objType as any).elementTypeId || 'char'
    const checkedValue = this.tempVar()
    // 初始化临时变量
    this.instructions.push({
      op: 'TYPE_OP',
      typeId: elemTypeId,
      opName: 'default',
      opKind: 'default',
      dest: checkedValue,
      src: [],
    })
    // 赋值并类型检查
    const valueResult = this.compileExpr(node.right, scope)
    this.instructions.push({
      op: 'TYPE_OP',
      typeId: elemTypeId,
      opName: 'assign',
      opKind: 'assign',
      dest: checkedValue,
      src: [valueResult.ref],
    })
    // 写入文件缓冲区
    this.instructions.push({
      op: 'SYS_CALL',
      proc: 'WRITE_FILE',
      args: [obj.ref, checkedValue],
    })
    return
  }
  if (objType.kind !== 'record') {
    throw new Error(`Type ${obj.typeId} is not a record`)
  }
  // ...
}
```

## 验证结果

- `tests/tex82-compile.test.ts` analyze 阶段不再报 `Type file-of-... is not a record` 错误
- 全部 836 个测试通过，无回归

## 备注

- Pascal 的文件缓冲区 `F^` 既可读也可写
- 读取 `F^` 在 `compileExpr` 中已处理（编译为 `SYS_CALL BUFFER_CHAR`）
- 写入 `F^ := value` 在 `compileAssignment` 中处理（编译为 `SYS_CALL WRITE_FILE`）
- VM 执行阶段需要实现 `WRITE_FILE` 系统调用
