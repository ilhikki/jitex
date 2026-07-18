# ISSUE-026: Parser 不支持变体记录（variant records）

**状态**: Open
**严重程度**: High
**发现时间**: 2026-07-18
**影响范围**: Parser / StaticAnalyzer / VM / RecordPlugin

## 问题描述

TANGLE 编译 tex.web 产出的 tex.pas（353,359 chars）在 parse 阶段失败：

```
Parse error: Expected identifier but got CASE (CASE) at line 15:1 at position 192
```

根因是 parser 的 `parseRecordType` 只支持普通字段列表，不支持 Pascal82 标准的变体记录（variant record）语法。TEX82 大量使用变体记录，这是跑通 TEX82 的必要条件。

## Pascal82 规范依据

**ISO 7185 §6.4.4 记录类型**

记录类型可以有一个变体部分（variant part），语法为：

```
record-type = RECORD field-list END .
field-list = [ (fixed-part [; variant-part] | variant-part) [;] ] .
fixed-part = record-section {; record-section} .
record-section = identifier-list : type-denoter .
variant-part = CASE tag-field type-denoter OF variant {; variant} .
tag-field = [identifier :] .
variant = case-constant-list : ( field-list ) .
case-constant-list = case-constant {, case-constant} .
```

示例：
```pascal
TYPE
  SHAPE = (CIRCLE, RECTANGLE, TRIANGLE);
  FIGURE = RECORD
    COLOR: INTEGER;
    CASE KIND: SHAPE OF
      CIRCLE: (RADIUS: REAL);
      RECTANGLE: (WIDTH, HEIGHT: REAL);
      TRIANGLE: (SIDE: REAL; ANGLE: REAL)
  END;
```

## 修复方案

需要修改以下层级，按实现顺序排列：

### 1. AST 类型 (`src/ast/types.ts`)
- 扩展 `RecordTypeNode`，添加 `variant?: RecordVariantPartNode`
- 新增 `RecordVariantPartNode`：包含 tagName、tagType、variants
- 新增 `RecordVariantNode`：包含 caseLabels、fields、可选嵌套 variant

**当前状态**：已完成基础类型定义（RecordTypeNode 已添加 variant 字段）

### 2. Parser (`src/parser/types.ts`)
- 修改 `parseRecordType`，在解析完固定字段后检查 `CASE` 关键字
- 实现 `parseRecordVariantPart`：解析 `CASE [tag:] type OF`
- 实现 `parseRecordVariant`：解析 `const1, const2: (field-list)`
- 支持嵌套变体（variant 的 field-list 中可以再有 variant part）

**关键挑战**：需要正确处理 `END` 的匹配——固定字段以分号分隔，variant part 结束后才是 `END`

### 3. AST Printer (`src/ast/printer.ts`)
- 支持打印变体记录的完整结构
- 输出格式：`CASE tag: type OF ... END`

### 4. StaticAnalyzer (`src/static-analyzer/index.ts`)
- 处理变体记录的类型解析
- 变体部分共享存储空间（所有 variant 字段在同一内存区域）
- 字段偏移计算：固定字段按顺序分配，变体字段从同一偏移开始
- 符号表：tag 字段和所有 variant 字段都要注册到类型表

### 5. JsonCode 类型 (`src/vm/jsoncode.ts`)
- `RecordType` 的 fields 需要能表达变体字段
- 可能需要新增字段标记（fixed vs variant）或扩展字段结构

### 6. RecordPlugin (`src/types/record.plugin.ts`)
- 支持变体记录的 field access（根据 tag 决定哪个 variant 激活）
- default 值的生成（所有 variant 字段初始化为默认值）
- copy 操作（深拷贝所有字段）

## 实现优先级

| 步骤 | 优先级 | 说明 |
|------|--------|------|
| AST 类型 | P0 | 已完成基础定义 |
| Parser | P0 | 阻塞 tex.pas parse，必须优先完成 |
| AST Printer | P1 | 辅助调试，非阻塞 |
| StaticAnalyzer | P0 | 阻塞 tex.pas analyze |
| JsonCode | P0 | 阻塞代码生成 |
| RecordPlugin | P0 | 阻塞 VM 执行 |

## 测试用例

按 Knuth 风格写测试：

```pascal
PROGRAM TESTVARIANT;
TYPE
  SHAPE = (CIRCLE, RECT, TRI);
  FIG = RECORD
    COL: INTEGER;
    CASE K: SHAPE OF
      CIRCLE: (R: INTEGER);
      RECT: (W, H: INTEGER);
      TRI: (S: INTEGER)
  END;
VAR
  F: FIG;
BEGIN
  F.COL := 1;
  F.K := CIRCLE;
  F.R := 10;
  WRITELN(F.R)
END.
```

## 备注

- 变体记录的 tag 字段可以没有标识符（`CASE INTEGER OF ...`），此时是无名 tag
- 变体记录的所有 variant 共享同一块内存（union 语义）
- TEX82 中有大量变体记录，这是 parse 阶段第一个大障碍
