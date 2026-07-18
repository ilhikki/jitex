# ISSUE-034: READ 对 char 类型变量错误跳过空白（标准行为 bug）

**状态**: Open
**严重程度**: High
**分类**: 标准行为缺陷（需修核心代码）
**发现时间**: 2026-07-18
**影响范围**: VM / io.plugin.ts readHandler

## 问题描述

`readHandler` 从文件读取时，对所有类型变量统一执行"先跳过空白，再读 token"的逻辑。
但标准 Pascal 中，`READ(F, ch)` 当 ch 是 char 类型时，应读取下一个字符（包括空白），
不跳过任何字符。

导致 TEX82 读取 POOL 文件时，`READ(POOLFILE, M, N)`（M/N 为 char）
错误跳过换行和空格，读到错误内容，报 "TEX.POOL line doesn't begin with two digits"。

## Pascal82 标准依据

ISO 7185 §14.4.4 READ：
- 当变量是 char 类型：`READ(f, c)` 等价于 `c := f^; GET(f)`，
  即读取当前字符（不跳过空白），然后前进。
- 当变量是 integer/real 类型：跳过前导空白和行结束符，读取数字序列。

当前实现对 char 类型也跳过空白，违反标准。

## 复现场景

POOL 文件内容（每行：两位数字 + 字符串）：
```
11buffer size
09pool size
```

TEX82 读取代码：
```pascal
READ(POOLFILE, M, N);  { M, N: char，期望读到 '1','1' }
```

当前实现：跳过空白后读到 "11buffer" 整个 token，M='1' 但后续读取错乱。

## 修复方案（待实施）

**分类：标准行为缺陷，修核心代码（io.plugin.ts readHandler）。**

修改 readHandler 的文件模式分支：
- 若目标变量 typeId 为 'char'：直接读取当前缓冲区字符（bufferChar），不跳过空白，然后 GET 前进。
- 若目标变量为 integer/real/string：保持现有"跳过空白读 token"逻辑。

## 最小复现用例

```pascal
PROGRAM TEST;
VAR F: TEXT;
    C: CHAR;
BEGIN
  REWRITE(F);
  WRITE(F, ' A');     { 第一个字符是空格 }
  RESET(F);
  READ(F, C);         { 标准：C 应为 ' '（空格） }
  WRITELN(C = ' ');   { 应输出 TRUE }
END.
```

## 备注

- 这是标准行为 bug，与 ISSUE-033（非标扩展）独立
- 之前误改了核心 io.plugin.ts，已回滚，需按流程重新修复
