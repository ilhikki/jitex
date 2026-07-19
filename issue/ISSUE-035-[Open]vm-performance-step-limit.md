# ISSUE-035: VM 执行速度过慢，1 亿步不足以完成 TRIP 测试

**状态**: Open → 移交 M5 解决
**严重程度**: High
**发现时间**: 2026-07-18
**影响范围**: VM 性能 / TEX82 端到端测试
**移交**: M5（高性能执行）— 详见 `docs/plan-m5-high-performance.md`

## 问题描述

TRIP 测试中，TEX82 运行 100,000,000 步后触发步数限制（step limit exceeded）：
- VM status: terminated (step limit exceeded)
- 仅输出了 "This is TeX, Version 3.14159265"
- trip.log: 0 bytes（未生成）
- trip.dvi: 0 bytes（未生成）
- 单步耗时：~112 秒 / 1 亿步 ≈ 1.12 μs/步（含 JS 开销）
- 按此速度，完整 TRIP 测试可能需要数十亿步

## 现象分析

TTY 输出：`This is TeX, Version 3.14159265displaylimits`
- 前半段是正常的版本输出
- "displaylimits" 像是从 POOL 字符串池里读出来的内容，可能是终端输出或读取逻辑有问题
- 但核心瓶颈是执行速度

## VM 架构分析

当前 VM 是 **TypeScript 解释器**，每条指令都是 JS 函数调用：
- `ExecFunc = (state, runtime, ctx) => Promise<void> | void`
- 每条指令有完整的 JS 函数调用开销
- 还有 async/await 开销（系统调用是异步的）
- 类型操作（TYPE_OP）通过查表调用插件函数

## 可能的优化方向（从轻到重）

1. **提高步数限制**：从 1 亿提到 10 亿，但测试时间会从 2 分钟涨到 20+ 分钟
2. **指令内联 / 减少函数调用**：把常见指令直接写进主循环
3. **移除 async/await**：同步路径上不必要的异步开销
4. **编译为字节码 + WebAssembly**：用 AssemblyScript 或 Rust 重写 VM 核心
5. **编译到 JS 代码**：把 Pascal 程序编译为 JS 函数直接执行（JIT 思路）

## 相关数据

- src/ 共 30 个文件，~318 KB
- VM 核心（vm.ts + state.ts + jsoncode.ts）：~29 KB
- 类型系统（types/ 下 14 个插件）：~284 KB（大部分是类型插件）
- 测试总数：~28 个测试套件
- 当前速度：~890,000 步/秒

## 备注

这是 M4（TRIP 测试）的性能瓶颈。功能正确性问题解决后，性能会成为主要矛盾。

## M4 末尾的优化进展

M4 末尾做了两轮 VM 优化，速度从 89 万步/秒提升到 264 万步/秒（~2.9x）：
1. 主循环区分同步/异步指令（同步指令不 await）
2. TYPE_OP 预绑定（编译时查找 invoke，运行时直接调）

但 264 万步/秒仍不足以在合理时间内完成 TEX82（需数十亿步）。进一步优化解释器的边际收益递减。

## M5 接手

M5 转变思路：从"优化解释器"改为"编译为 JS"。预期加速 5x+，详见 `docs/plan-m5-high-performance.md`。
