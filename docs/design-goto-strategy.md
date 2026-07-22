# GOTO 编译策略

## 设计

所有包含 label 声明的 block，其顶层 compound statement 用状态机包裹：

```js
let __pc = 0
__goto_loop: while (true) {
  if (++ctx.steps > ctx.maxSteps) { throw new Error('JS VM: step limit exceeded') }
  switch (__pc) {
    case 0: {
      // 原始 block 的所有语句
      ...
      __pc = -1; continue __goto_loop;
    }
    case 1: {
      // label 888 的剩余代码（从 888 到 block 结尾）
      ...
      __pc = -1; continue __goto_loop;
    }
    case -1: break __goto_loop;
    default: throw new Error('JS VM: invalid __pc value ' + __pc);
  }
}
```

## 循环内的 goto

当循环体（while/for/repeat）内部有 goto 且目标 label 也在循环体内但**不在末尾**时，给循环体生成内层状态机：

```js
while (cond) {
  let __inner_pc_0 = 0
  __inner_loop_0: while (true) {
    switch (__inner_pc_0) {
      case 0: {
        // 循环体的所有语句
        ...
        __inner_pc_0 = -1; continue __inner_loop_0;
      }
      case 1: {
        // label 888 的剩余代码
        ...
        __inner_pc_0 = -1; continue __inner_loop_0;
      }
      case -1: break __inner_loop_0;
      default: throw new Error('JS VM: invalid __inner_pc_0 value ' + __inner_pc_0);
    }
  }
}
```

## goto 代码生成规则

| 场景 | 生成代码 |
|------|----------|
| 不在循环中 | `__pc = N; continue __goto_loop` |
| 在循环内，目标 label 在循环体末尾 | `continue loopLabel` |
| 在循环内，目标 label 在循环体内（非末尾） | `__inner_pc_X = N; continue __inner_loop_X` |
| 在循环内，目标 label 在循环外 | `__pc = N; break loopLabel` |

## label 范围

ISO 7185 6.1.6：label 为 0..9999 的无符号整数。
