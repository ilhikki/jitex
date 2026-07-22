# ISO 7185 Goto 和 Label 规则汇总

## 1. Label 词法规则 (6.1.6)

- **Label 格式**: Labels 是数字序列（digit-sequence）
- **取值范围**: 0 到 9999（闭区间）
- **拼写**: label 的拼写就是其显式整数值

## 2. Block 和 Label 声明规则 (6.2.1)

- 包含 label-declaration-part 的 block，必须恰好包含一个带有该 label 的 statement
- label 在 label-declaration-part 中的出现是其定义点（defining-point），作用域为该 block
- 每个 label 在其定义 block 内必须有且仅有一个对应的 labeled statement

## 3. Label 作用域规则 (6.2.2)

### 3.1 基本规则
- 每个 label 都有一个定义点（defining-point）
- 定义点的作用域是其所在区域（包括所有嵌套区域）

### 3.2 遮蔽规则 (6.2.2.5)
- 当一个 label 在区域 A 有定义点，而相同拼写的 label 在区域 B（被 A 包含）也有定义点时，区域 B 及其内部所有区域被排除在 A 的作用域之外

### 3.3 唯一性规则 (6.2.2.7)
- 在同一区域内，相同拼写的 label 只能有一个定义点

### 3.4 应用出现规则 (6.2.2.8)
- 在 label 定义点的作用域内，所有相同拼写的 label 出现都是该定义点的应用出现
- 作用域之外的出现不是应用出现

### 3.5 前置规则 (6.2.2.9)
- label 的定义点必须在其所有应用出现之前（在 program-block 内）

## 4. Goto 语句引用规则 (6.8.1)

一个 label L 可以出现在 goto 语句 G 中，当且仅当以下任一条件成立：

| 条件 | 说明 |
|------|------|
| a) | 带有 label L 的语句 S 包含 goto G |
| b) | S 是包含 G 的 statement-sequence 中的一个语句 |
| c) | S 是包含 G 的 block 的 statement-part 的 compound-statement 的 statement-sequence 中的一个语句 |

### 关键推论

> **NOTE 2**: 一个 block 内的 goto 语句可以引用外层 block 中的 label，前提是该 label 前缀于外层 block 嵌套最外层的语句。

这意味着：
- **允许**: `function A(){function B(){goto 999} 999: s; }` — B 内的 goto 可以跳到 A 内的 label（因为 label 在 A 的 statement-sequence 顶层）
- **不允许**: `function A(){if x then begin 999: s end; function B(){goto 999} }` — label 不在最外层

## 5. Goto 执行语义 (6.8.2.4)

- goto 语句指示处理继续到 label 所表示的程序点
- goto 会终止所有中间激活（intervening activations），但保留：
  - 包含目标程序点的激活
  - 该激活内部的所有激活

### 核心限制

> **ISO 规则**: A goto-statement can only jump to a label in the same block or an enclosing block, but cannot enter a block from outside.

这意味着：
1. **允许**: 从内层 block goto 到外层 block 的 label（同层或外层）
2. **禁止**: 从外层 block goto 到内层 block 的 label（不能进入一个 block）
3. **允许**: 跨过程/函数 goto，前提是目标 label 在作用域内（外层 block）

## 6. 总结

```
允许的 goto 方向：
┌─────────────────────────────────────────────────────┐
│  program block (label 100 declared here)            │
│  ┌─────────────────────────────────────────────────┐ │
│  │  procedure A (label 200 declared here)          │ │
│  │  ┌─────────────────────────────────────────────┐ │ │
│  │  │  procedure B                                │ │ │
│  │  │  begin                                      │ │ │
│  │  │    goto 100;  ← 允许：跳到 program block    │ │ │
│  │  │    goto 200;  ← 允许：跳到外层 procedure A  │ │ │
│  │  │    goto 300;  ← 允许：跳到自己的 label      │ │ │
│  │  │ 300: ...                                    │ │ │
│  │  │  end;                                       │ │ │
│  │  └─────────────────────────────────────────────┘ │ │
│  │  200: ...                                       │ │
│  │  end;                                          │ │
│  └─────────────────────────────────────────────────┘ │
│  100: ...                                          │
└─────────────────────────────────────────────────────┘

禁止的 goto 方向：
┌─────────────────────────────────────────────────────┐
│  program block                                     │
│  ┌─────────────────────────────────────────────────┐ │
│  │  procedure A                                   │ │
│  │  begin                                         │ │
│  │    goto 200;  ← 禁止：从外层跳到内层           │ │
│  │    ┌─────────────────────────────────────────┐ │ │
│  │    │  procedure B                            │ │ │
│  │    │  label 200;                             │ │ │
│  │    │  begin                                  │ │ │
│  │    │  200: ...                               │ │ │
│  │    │  end;                                   │ │ │
│  │    └─────────────────────────────────────────┘ │ │
│  │  end;                                         │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```
