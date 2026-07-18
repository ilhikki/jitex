# ISSUE-026: Parser 不支持变体记录（variant records）

**状态**: Fixed
**严重程度**: High
**发现时间**: 2026-07-18
**修复时间**: 2026-07-18
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

## 根因分析

1. **Parser**：`parseRecordType` 只解析固定字段，遇到 `CASE` 关键字直接报错
2. **StaticAnalyzer**：`resolveType` 的 `RecordType` 分支只处理 `rec.fields`，没有处理 `rec.variant`
3. **字段偏移**：变体字段需要共享同一偏移（union 语义），原实现按顺序分配

## 修复方案

### 1. Parser (`src/parser/types.ts`)
- 修改 `parseRecordType`：解析完固定字段后检查 `CASE` 关键字
- 新增 `parseRecordVariantPart`：解析 `CASE [tag:] type OF`
  - 通过检查标识符后的 token（`:` 或 `OF`）区分 tag 名称和类型
  - 支持有名 tag（`CASE K: SHAPE OF`）和无名 tag（`CASE SHAPE OF`）
- 新增 `parseRecordVariant`：解析 `const1, const2: (field-list)`
  - 支持嵌套变体（variant 的 field-list 中可以再有 variant part）
  - 使用 `continue` 而非 `break` 处理嵌套变体后的 `RPAREN` 匹配

### 2. StaticAnalyzer (`src/static-analyzer/index.ts`)
- 扩展 `resolveType` 的 `RecordType` 分支
- 新增 `processVariantPart` 递归函数：
  - 处理 tag 字段（如果有 tagName）
  - 处理每个 variant 的字段（共享 baseOffset）
  - 递归处理嵌套变体
- 字段偏移计算：固定字段顺序分配，变体字段从同一 baseOffset 开始

### 3. 测试 (`tests/m4/q14-variant-record.test.ts`)
- 简单变体记录（有名 tag）
- 无名 tag 变体记录
- 嵌套变体记录

## 验证结果

- `tests/m4/q14-variant-record.test.ts` 全部通过
- `tests/tex82-compile.test.ts` parse 阶段通过
- 全部 836 个测试通过，无回归

## 备注

- 变体记录的 tag 字段可以没有标识符（`CASE INTEGER OF ...`），此时是无名 tag
- 变体记录的所有 variant 共享同一块内存（union 语义）
- TEX82 中有大量变体记录，这是 parse 阶段第一个大障碍
- 当前实现简化处理：所有 variant 字段都注册到类型表，VM 执行阶段暂不区分 active variant
