# ISSUE-032: VM 缺少 TEX82 所需的 SYS_CALL handler

**状态**: Fixed
**严重程度**: High
**发现时间**: 2026-07-18
**修复时间**: 2026-07-18
**影响范围**: VM / io.plugin.ts

## 问题描述

TEX82 在 VM 上运行时调用未实现的系统调用：

```
VM: unknown system call ERSTAT
```

## 根因分析

ISSUE-028 将未找到的函数/过程调用编译为 `SYS_CALL`，但 VM 的 `createDefaultSysCalls()` 中没有注册以下 handler：

| SYS_CALL | 用途 | TEX82 使用场景 |
|---|---|---|
| `ERSTAT` | 文件错误状态（类似 errno） | `AOPENIN := ERSTAT(F) = 0` 检查文件打开是否成功 |
| `BREAKIN` | 交互断点 | 调试用，TEX82 中可设为 no-op |
| `WRITE_FILE` | 写入文件缓冲区 | `F^ := value` 赋值操作（ISSUE-029 生成） |

## 修复方案

在 `src/vm/io.plugin.ts` 中添加三个 handler 并注册到 `createDefaultSysCalls()`：

```typescript
// BREAKIN: TEX82 调试用交互断点，no-op
const breakinHandler: SysCallHandler = async (_args, _state, _runtime) => {
  // no-op
}

// ERSTAT: TEX82 文件错误状态（类似 errno），简化为总是返回 0（成功）
const erstatHandler: SysCallHandler = async (_args, _state, _runtime) => {
  return { typeId: 'integer', raw: 0 }
}

// WRITE_FILE: 写入文件缓冲区（F^ := value 编译为此调用）
const writeFileHandler: SysCallHandler = async (args, _state, runtime) => {
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io
  if (!io) return
  if (args.length < 2) throw new Error('WRITE_FILE requires (file, value) arguments')
  const file = asFileValue(args[0], typeTable)
  if (!file) throw new Error('WRITE_FILE: first argument is not a file')
  const valueArg = args[1] as any
  const value = valueArg.value || valueArg
  const text = typeof value.raw === 'string' ? value.raw : String.fromCharCode(value.raw)
  await io.file.write(file, text)
}
```

注册：
```typescript
map.set('BREAKIN', breakinHandler)
map.set('ERSTAT', erstatHandler)
map.set('WRITE_FILE', writeFileHandler)
```

## 验证结果

- `tests/tex82-run.test.ts` VM 状态从 `error` 变为 `terminated`
- TEX82 初始化阶段通过
- 全部测试通过，无回归

## 备注

- ERSTAT 简化处理为总是返回 0（成功），因为 VM 的文件模型不模拟错误状态
- BREAKIN 是调试用的交互断点，TEX82 正式运行时可以 no-op
- WRITE_FILE 简化处理为调用 `io.file.write`，实际应该更新缓冲区变量（待后续优化）
- **里程碑**：M3（TEX 初始化通过）达成
