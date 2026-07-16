# Issue: readln/read 未正确读取输入

## Date
2026-07-16

## Priority
P1

## Type
Bug

## Symptom
`readln(n)` 无法从控制台输入读取值。`runPasWithInput(['4'], 'readln(n); writeln(n+1)')` 期望输出 '5'，实际输出 '1'（n=0）。

此外，从文件读取整数时只读取单个字符的 char code（例如 '4' 的 ASCII 52）而非完整的整数值 42。

## Root Cause Analysis
`src/interpreter/frames.ts` 的 `handleRead` 函数存在两个问题：

1. **控制台读取**：使用 `state.io.console.read()` 读取每个变量，但 `read()` 返回空字符串（测试 helper 中 `read: () => ''`），导致所有变量被设为默认值 0。`readln()` 只在最后被调用（用于换行），其返回值被忽略。

2. **文件读取**：对整数变量只调用一次 `bufferChar` 并直接当作整数值，导致 `42` 被读取为 `52`（字符 '4' 的 ASCII 码），而非解析多个字符为整数 42。

在 Pascal82 中，`read` 和 `readln` 从文本输入缓冲区读取值。对整数变量，应跳过前导空白，读取连续数字字符，解析为整数。

## Fix Plan
- File: src/interpreter/frames.ts
- Change:
  - 控制台分支：使用 `readln()` 获取整行输入，按空格分割后解析各变量值
  - 文件分支：对整数/实数类型，从文件缓冲区跳过前导空白（含换行），读取连续非空白字符为 token，然后 `parseInt`/`parseFloat` 解析
- Risk: 中等；影响所有 read/readln 调用

## Fix Applied
- 控制台分支重写为：`readln()` 获取整行 → `trim().split(/\s+/)` 分割 token → 按变量类型解析
- 文件分支重写为：对 numeric 类型跳过前导空白/换行 → 读取连续非空白字符为 token → `parseInt`/`parseFloat` 解析；对 char 读取单字符；对 array of char 读取多字符

所有 q06-io 测试（44 个）现已通过，包括 `file write then read roundtrip`（写入 42 再读回得到 42）。

## Status
Fixed
