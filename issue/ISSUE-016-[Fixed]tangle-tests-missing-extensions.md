# ISSUE-016: TANGLE 测试未启用非标准扩展导致 BREAK 调用失败

## 状态
Fixed

## 分类
P0: 测试代码问题

## 问题描述
TANGLE Pascal 代码使用 `BREAK` 过程（非标准 Pascal82 扩展），但测试调用 `populateSystemProcedures(state)` 时未传 `extensions=true`，导致 `Unknown procedure: BREAK` 错误。

## 根因
`populateSystemProcedures(state, extensions=false)` 默认不注册非标准过程（BREAK/EXIT/CLOSE/ASSIGN）。TANGLE 代码使用 BREAK，需要显式启用扩展。

## 修复方案
在运行 TANGLE 相关代码的测试中传 `extensions=true`：
- `tests/interpreter/tangle-min-repro.test.ts`（3 处）
- `tests/interpreter/tangle-run.test.ts`（1 处）
- `tests/interpreter/min-pas-repro.test.ts`（7 处，Pascal 代码使用 break）

## 验证
- tangle-min-repro: 7 tests 全部通过
- min-pas-repro: 7 tests 全部通过
- 全量测试 842 passed (+8)，35 failed (-8)

## 相关文件
- `tests/interpreter/tangle-min-repro.test.ts`
- `tests/interpreter/tangle-run.test.ts`
- `tests/interpreter/min-pas-repro.test.ts`
