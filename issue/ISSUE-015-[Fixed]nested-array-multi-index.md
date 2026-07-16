# ISSUE-015: 多维索引访问嵌套数组失败

## 状态
Fixed

## 分类
P3: Core feature missing

## 问题描述
`arr[1,1]` 在 `array[1..2] of array[1..2] of Point` 上访问时报错 "Array index dimension mismatch: expected 1, got 2"。

## Pascal82 标准
Pascal82 中 `array[1..2] of array[1..2] of T` 是合法的嵌套数组类型。`a[i,j]` 是 `a[i][j]` 的语法糖，等价于先取 `a[i]`（得到内层数组），再取 `[j]`。

## 根因
`arrayIndex` 函数严格要求 `indices.length === array.dimensions.length`，不支持多余索引继续访问内层数组。三处调用点均受影响：
- `evalArrayRead`（读）
- `assignToLeft` 的 ArrayAccess 分支（写）
- `evalLValueBase` 的 ArrayAccess 分支（左值基址，用于 `arr[1,1].x`）

## 修复方案
在 `pascal-value.ts` 添加两个辅助函数：
- `arrayGetElement(arr, indices)` — 递归读取，先用前 N 个索引定位当前数组元素，若仍有剩余索引且元素是数组则递归
- `arraySetElement(arr, indices, value)` — 递归写入，同理

更新三处调用点使用新函数。

## 验证
- `nested array record` 测试通过
- 全量测试 834 passed（+7），43 failed（-7），无回归

## 相关文件
- `src/interpreter/types/pascal-value.ts`：arrayGetElement、arraySetElement
- `src/interpreter/evaluator.ts`：evalArrayRead
- `src/interpreter/frames.ts`：assignToLeft、evalLValueBase
