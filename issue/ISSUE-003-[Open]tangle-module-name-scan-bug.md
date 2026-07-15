# Issue: TANGLE 在 module 2 报 "Pascal text flushed, = sign is missing"

## Date
2026-07-15

## Symptom
运行 `tests/interpreter/tangle-run.test.ts` 时，TANGLE 解释器在处理 module 2 时报错：

```
! Pascal text flushed, = sign is missing. (l.87)
type
     @<Types in the outer block@>@/
```

错误来自 `scan_module` 的 module_name (135) 分支：
```pascal
135: BEGIN P:=CURMODULE;
  REPEAT NEXTCONTROL:=GETNEXT; UNTIL NEXTCONTROL<>43;
  IF (NEXTCONTROL<>61) AND (NEXTCONTROL<>30) THEN BEGIN
    { Pascal text flushed, = sign is missing }
  END
END;
```

即 module_name 扫描完 `@<Types in the outer block@>` 后，`get_next` 应返回 `=` (61) 或 `==` (30)，但实际返回了 identifier (130, 'type')。

## Root Cause Analysis

通过 LOG_DEBUG 追踪对比 module 1（成功）与 module 2（失败）：

**Module 1（成功）**：`@d banner==...`
- `skip_ahead` 被调用 2 次：返回 131 (control_text)、0 (ignore)
- `while next_control<=132` 多次迭代
- `exit defloop nc=134` (begin_Pascal) → 进入 case 134 分支 ✓
- `scan_repl` 正常完成

**Module 2（失败）**：`type @<Types in the outer block@>@/`
- `skip_ahead` 只调用 1 次：返回 135 (module_name)
- `while next_control<=132` 第一次就退出（135 > 132）
- 进入 case 135 (module_name) 分支
- `repeat next_control:=get_next; until next_control<>43` 中 `get_next` 返回 130 (identifier 'type') 而非 61 ('=')
- 从 `GETNEXT20 loc=0` 看，`get_next` 从新行 loc=0 读取，说明前一次 `get_next`（扫描 module_name `@<Types in the outer block@>`）没有正确推进 loc 到 `@/` 之后，或者推进后又被重置。

**关键观察**：module 2 中 `skip_ahead` 返回 135 后，代码执行 `LOC:=LOC-2; NEXTCONTROL:=GETNEXT`。这一次 `get_next` 重新扫描 module_name 应该把 loc 推进到 `@>` 之后（即 `@/` 之前），但日志显示后续 `get_next`（在 case 135 分支的 repeat 中）从 loc=0 的新行读取，说明 loc 状态在 module_name 扫描后被破坏。

**怀疑点**：bug 在 `src/interpreter/` 中的某个地方，可能是：
1. `get_next` 对 module_name 的扫描（`@<Put module name into |mod_text[1..k]|@>`）对 loc 的修改
2. WHILE 循环迭代逻辑
3. 函数返回值 / 局部变量作用域
4. buffer/loc 状态管理

## Reproduction
最小复现用例：见 `tests/interpreter/tangle-min-repro.test.ts` 的 `case E29`

最小 web 输入：
```
@* Intro.
@ some text here
@p
@<bar@>@/
@<baz@>@/
@ end
```

### 触发条件（通过逐步简化确认）

1. **@p 前必须有 @ text (new_module 分隔)** — 即 @p 不能是第一个 module（`@*` 之后直接 `@p` 不触发）
2. **@p 后的 Pascal text 中必须有 2+ 个 module_name 引用** — 只有 1 个 `@<name@>` 不触发

### 验证矩阵

| Case | 结构 | @ text 前置 | module_name 数 | 触发 bug |
|------|------|------------|---------------|---------|
| E25  | @ text + @p + 1 module_name | ✓ | 1 | ✗ |
| E26  | @ text + @p + 2 module_name | ✓ | 2 | ✓ |
| E27  | @p + 2 module_name (无 @ text) | ✗ | 2 | ✗ |
| E29  | @ text + @p + 2 module_name (最小) | ✓ | 2 | ✓ |

### 根因推测

bug 可能在 interpreter 的 `scan_repl` 执行中：当 Pascal text 中有多个 module_name 引用时，第二个 module_name 扫描后 `loc`/`buffer` 状态被破坏，导致 `get_next` 返回错误值（135 而非继续扫描），使 `scan_repl` 提前退出，`next_control=135` 被传回 `scan_module`，进入 `case 135` (module_name) 分支，检查 `=` 号失败。

具体是 interpreter 中哪个函数（WHILE 循环迭代、函数返回值、局部变量作用域等）需要进一步定位。

## 最新追踪：最小复现用例的 LOG_DEBUG 分析

使用最小 web 复现用例：
```
@* Intro.        (行1, 9 chars)
@ some text here (行2, 16 chars)
@p               (行3, 2 chars)
@<bar@>@/        (行4, 9 chars)
@<baz@>@/        (行5, 9 chars)
@ end            (行6, 5 chars)
```

### 执行流程（从 LOG_DEBUG 提取）

| 步骤 | 事件 | loc | limit | 行 | 说明 |
|------|------|-----|-------|----|------|
| 1 | INPUTLN 行1 | - | 9 | 1 | `@* Intro.` |
| 2 | INPUTLN 行2 | - | 16 | 2 | `@ some text here` |
| 3 | module=1 开始 | 2 | 16 | - | new_module，跳过 `@ ` |
| 4 | INPUTLN 行3 | - | 2 | 3 | `@p` |
| 5 | sk=134 (begin_Pascal) | - | - | - | 扫描到 @p |
| 6 | case 134, before scanrepl | - | - | - | 进入 scan_repl |
| 7 | after storetwob | - | - | - | 存储两个字节 |
| 8 | INPUTLN 行4 | - | 9 | 4 | `@<bar@>@/` |
| 9 | GETNEXT20 loc=0, lim=9 | 0 | 9 | - | get_next 从行首开始 |
| 10 | after scanrepl, module=2 | 7 | 9 | - | **scan_repl 返回后 loc=7** |
| 11 | INPUTLN 行5 | - | 9 | 5 | `@<baz@>@/` |
| 12 | sk=135 (module_name) | - | - | - | 扫描到第二个 module_name |
| 13 | gn=135 | - | - | - | get_next 返回 135 |
| 14 | exit defloop nc=135 | - | - | - | 退出定义循环 |
| 15 | case nextcontrol=135 | - | - | - | 进入 module_name case |
| 16 | INPUTLN 行6 | - | 5 | 6 | `@ end` |
| 17 | GETNEXT20 loc=0, lim=5 | 0 | 5 | - | **get_next 从 loc=0 开始** |
| 18 | pascal text flushed mod=2 | - | - | - | ctrl=136 (text) |
| 19 | ERROR at line 6 | - | - | 6 | "= sign is missing" |

### 关键疑点

**问题 1：scan_repl 处理第一个 module_name 后，module 为什么从 1 变成了 2？**

- step 10: `after scanrepl, module=2, loc=7, lim=9`
- 按常理，scan_repl 只是扫描替换文本，不应该改变 module 计数
- 但这里 module 从 1 变成了 2，说明 scan_repl 内部可能调用了 new_module 或类似逻辑

**问题 2：为什么 case 135 中读取了第6行（`@ end`）而不是继续处理第5行？**

- step 15: 进入 `case nextcontrol=135`
- step 16: 立即 INPUTLN 读取第6行
- 按常理，case 135 应该在当前行（第5行）内继续扫描
- 但 loc 可能已经 >= limit 了，所以 get_next 调用 inputln 读取新行

**问题 3：为什么第二个 module_name 扫描后 loc 状态不对？**

- 第一个 module_name (bar) 在第4行，scan_repl 后 loc=7, lim=9
- 第4行有 9 个字符：`@<bar@>@/` (索引 0-8)
- loc=7 对应第 8 个字符（第二个 `@`），这意味着 scan_repl 处理完 `@<bar@>` 后停在了 `@/` 之前
- 这是合理的，因为 `@/` 是行结束标记，由外层逻辑处理

- 然后读取第5行 `@<baz@>@/`，sk=135 (module_name)
- 进入 case 135 后，立即读取了第6行
- 说明在 case 135 中，第一次调用 get_next 就发现 loc >= limit，触发了 inputln

**推测**：`skip_ahead` 扫描 module_name (135) 时正确推进了 loc，但 `case 135` 分支中的 `get_next` 没有正确地从当前 loc 继续，而是某种原因导致 loc 被重置或状态异常。

### 对照组（1 个 module_name，不触发 bug）

对照组 web：
```
@* Intro.
@ some text here
@p
@<bar@>@/
@ end
```

（待补充对照组的 LOG_DEBUG 对比）

## Fix
（待定位）

## Status
Open
