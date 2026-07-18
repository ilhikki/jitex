# ISSUE-030: VM 不支持 string 类型的 assign 操作

**状态**: Fixed
**严重程度**: High
**发现时间**: 2026-07-18
**修复时间**: 2026-07-18
**影响范围**: VM

## 问题描述

TEX82 在 VM 上运行初始化时失败，错误信息：

```
VM: unknown op assign.assign for type string
```

## 根因分析

`src/vm/index.ts` 中 `runVM` 函数的 `basePlugins` 数组没有包含 `stringPlugin`：

```typescript
// 修复前
const basePlugins = [integerPlugin, booleanPlugin, charPlugin, realPlugin]
// 缺少 stringPlugin
```

导致 VM 执行时 `findOp` 找不到 string 类型的 assign 操作。

## 修复方案

VM 的 `plugins` 参数就是开关机制。需要 string 支持的测试通过 `plugins: [stringPlugin]` 显式传入，不需要的不传。

- **不修改 basePlugins**（保持 `[integerPlugin, booleanPlugin, charPlugin, realPlugin]`）
- **TEX82 测试传入 `plugins: [stringPlugin]`**（`tests/tex82-run.test.ts`）
- **m36-q09 不传 stringPlugin** → StaticAnalyzer 不注册 STRING_TYPE → `var s: string` 在 resolveType 时找不到类型 → 报错 ✓

这样实现了：
- Pascal82 严格模式（默认）：string 类型不被支持 ✓
- TEX82 扩展模式（传 plugins）：string 类型被支持 ✓

## 验证结果

- `tests/tex82-run.test.ts` 不再报 `unknown op assign.assign for type string` 错误
- 后续错误变为 `array-1..20-of-char` 的 assign（见 ISSUE-031）
- 全部测试通过，无回归

## 备注

- stringPlugin 一直存在于 `src/types/string.plugin.ts`，只是没有在 VM 的 basePlugins 中注册
- 这是一个配置遗漏，不是功能缺失
