# ISSUE-014: WITH 语句未正确实现字段访问

## 状态
Fixed

## 分类
P3: Core feature missing

## 问题描述
WITH 语句（`with R do S`）未按 Pascal82 标准实现记录字段访问。原实现只是执行 body，没有在作用域中绑定记录字段，导致 WITH 体内的字段标识符无法解析到记录字段。

## Pascal82 标准
`with R do S` 等价于在 S 执行期间，将 R 的字段名加入作用域，S 中出现的字段标识符自动解析为 `R.field`。

`with R1, R2, ... do S` 等价于 `with R1 do with R2 do ... do S`，后绑定的记录优先（内层 scope）。

嵌套 WITH：`with R do with F do x := 10` 中，`F` 是 `R` 的字段时，内层 WITH 应能通过外层 WITH 的字段绑定解析 `F`。

## 影响范围
所有使用 WITH 语句的程序。

## 根因
- `createWithFrame` 未创建作用域链绑定记录字段
- `lookupVariable` / `lookupVariableType` 未检查 WITH 绑定
- `assignToLeft` 未处理 WITH 字段赋值

## 修复方案
1. **Scope 接口**添加 `withRecords: Map<string, PascalValue> | null` 字段（字段名 → 记录值引用）
2. **`findWithRecord`** 辅助函数：沿 scope 链查找 WITH 绑定的记录
3. **`createWithFrame`** 重写：为每个记录创建 scope，将该记录的所有字段名绑定到 `withRecords`
4. **`lookupVariable`**：检查 `withRecords`，返回 `record.fields.get(name)`
5. **`lookupVariableType`**：检查 `withRecords`，返回 `recordType.fieldTypes.get(name)`
6. **`assignToLeft`**：检查 WITH 绑定，赋值到 `record.fields.set(name, value)`

## 测试修正
部分测试代码使用了两个 `type` 段（非 Pascal82 标准，标准要求每个块段只出现一次）：
- `nested WITH`：合并为单个 `type` 段
- `array record as parameter`：合并为单个 `type` 段

## 验证
6 个 WITH 测试全部通过：
- WITH single record
- WITH multiple records
- WITH modify fields
- WITH call procedure
- nested WITH
- WITH variable name conflict

## 相关文件
- `src/interpreter/types.ts`：Scope 接口、findWithRecord
- `src/interpreter/evaluator.ts`：lookupVariable、lookupVariableType
- `src/interpreter/frames.ts`：createWithFrame、assignToLeft
- `tests/m3.6/q04-array-record.test.ts`：测试代码修正
