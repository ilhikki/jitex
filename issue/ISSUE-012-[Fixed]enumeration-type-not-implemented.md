# Issue: 枚举类型（EnumerationType）未实现

## Date
2026-07-16

## Priority
P2

## Type
Feature missing

## Symptom
`参数类型组合-枚举参数` 测试失败，报错 `Unknown type node kind: EnumerationType`。

测试代码：
```pascal
type Color = (red, green, blue);
procedure PrintColor(c: Color);
begin
  case c of
    red: writeln('red');
    green: writeln('green');
    blue: writeln('blue');
  end;
end;
```

## Root Cause Analysis
Pascal82（ISO 7185）标准支持枚举类型：`type T = (id1, id2, ...);`，每个枚举值对应一个序号（0, 1, 2, ...）。

AST 节点 `EnumerationTypeNode` 已定义（`src/ast/types.ts`），parser 已能解析枚举类型语法，但 `resolveType` 函数（`src/interpreter/types.ts`）没有处理 `EnumerationType` case，落入 default 分支抛出 `Unknown type node kind` 错误。

## Fix Plan
- File: src/interpreter/types.ts
- Change:
  - 在 `resolveType` 中添加 `EnumerationType` case，返回 `SubrangeType('ENUM', INTEGER_TYPE, 0, count-1)`
  - 在 `createState` 中，对枚举类型声明，将枚举值注册为全局常量（值=序号，类型=枚举类型）
- Risk: 低；枚举类型用 SubrangeType 表示，复用现有比较/赋值逻辑

## Fix Applied
- `resolveType` 添加 `EnumerationType` case：用 `SubrangeType(0..n-1)` 表示枚举类型
- `createState` 注册枚举值：`red=0, green=1, blue=2`，类型为枚举类型
- 枚举值比较通过 `SubrangeType.eq` 委托给 `INTEGER_TYPE.eq`，case 语句正常匹配

测试通过：`PrintColor(green)` 输出 `green`。

## Status
Fixed
