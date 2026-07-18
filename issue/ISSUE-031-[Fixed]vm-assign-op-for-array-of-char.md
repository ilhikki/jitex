# ISSUE-031: VM 不支持 array-of-char 类型的 assign 操作

**状态**: Fixed
**严重程度**: High
**发现时间**: 2026-07-18
**修复时间**: 2026-07-18
**影响范围**: VM / ArrayPlugin

## 问题描述

TEX82 在 VM 上运行初始化时失败，错误信息：

```
VM: unknown op assign.assign for type array-1..20-of-char
```

## 根因分析

`src/types/array.plugin.ts` 中没有实现 `assign` 操作。当对 char 数组（Pascal 中的字符串变量，如 `NAMEOFFILE: ARRAY[1..20] OF CHAR`）进行赋值时，`findOp` 找不到对应的 handler。

## 修复方案

在 `createArrayPlugin` 中添加 `assign` 操作：

```typescript
assign: {
  can: (fromType: string, toType: string) => {
    const fromDef = typeTable.get(fromType)
    const toDef = typeTable.get(toType)
    return fromDef?.kind === 'array' && toDef?.kind === 'array'
  },
  toCode: (dest: Ref, src: Ref, ctx: CodeGenContext): JsonInstruction[] => {
    return [{
      op: 'TYPE_OP',
      typeId: ctx.typeId || 'array',
      opName: 'assign',
      opKind: 'assign',
      dest,
      src: [src],
      sourcePos: ctx.sourcePos,
    }]
  },
  invoke: (dest: PascalValue, src: PascalValue) => {
    const deepCopy = (obj: unknown): unknown => {
      if (Array.isArray(obj)) {
        return obj.map(deepCopy)
      }
      return obj
    }
    return { typeId: src.typeId, raw: deepCopy(src.raw) }
  },
}
```

## 验证结果

- `tests/tex82-run.test.ts` 不再报 `unknown op assign.assign for type array-1..20-of-char` 错误
- 后续错误变为 `unknown system call ERSTAT`（见 ISSUE-032）
- 全部测试通过，无回归

## 备注

- Pascal 中数组赋值是值拷贝（深拷贝），需要复制所有元素
- char 数组在 TEX82 中用作定长字符串，赋值操作非常频繁
- assign 和 copy 的区别：assign 接收 (dest, src)，copy 只接收 (src)
