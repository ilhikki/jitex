// M5: JS 编译器 — 从 AST 编译为 JS 代码字符串，new Function() 执行
//
// 设计目标：跳过解释器开销，让 V8 JIT 直接优化生成的代码。
// integer/boolean/char 用裸 JS 值（无 PascalValue 装箱），
// string/array/record/file 通过 plugin.invoke / sysCall 桥接。
//
// 状态：Phase 0 占位，Phase 1 开始实现。
//
// 详见 docs/plan-m5-high-performance.md

export {}
