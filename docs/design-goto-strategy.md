# GOTO 编译策略设计

## 一、场景分类（从用例分析）

### 1. 按跳转方向

| 方向 | 示例 | 复杂度 |
|------|------|--------|
| 前向跳转（跳过代码） | `goto 100; ... 100:` | 简单 |
| 后向跳转（模拟循环） | `100: ... goto 100` | 简单 |
| 双向混合 | label 在中间，前后都有跳转 | 中等 |

### 2. 按控制结构交互

| 场景 | 示例 | 当前问题 |
|------|------|----------|
| 跳出 IF/CASE | `if ... then begin goto 100; ... end` | 需正确退出 IF 块 |
| 跳出单层循环 | `while ... do begin ... goto 100; end` | 需跳出循环 |
| 跳出嵌套循环 | `for i:=... do for j:=... do begin goto 100; end` | 需跳出所有层 |
| 跳出状态机内循环 | 状态机 switch 内的 while/for | **break 被 while/for 拦截** |
| 跳入循环 | `goto 100; while ... do 100: ...` | 不安全，Pascal 允许但行为未定义 |

### 3. 按过程边界

| 场景 | Pascal82 | 处理方式 |
|------|----------|----------|
| 同过程内 goto | ✅ 允许 | 编译为 JS 控制流 |
| 跨过程 goto（procedure → main） | ❌ 禁止 | 运行时错误 |
| 跨过程 goto（outer → nested） | ❌ 禁止 | 运行时错误 |
| 递归过程内局部 goto | ✅ 允许 | 每次调用独立处理 |

### 4. 特殊场景

| 场景 | 描述 |
|------|------|
| 多 label 同过程 | 多个 label，跳转关系复杂 |
| label 在循环内 | 可能被多次跳转 |
| 递归函数内 goto | 如 `fib` 用 goto 替代分支 |
| goto 密集代码 | TANGLE/TEX82 大量使用 goto |

## 二、当前状态机方案的问题

```
while (true) {
  switch (__pc) {
    case 0: ...
            while (...) { goto 100 } // ❌ break 只跳出 while，不跳出 switch
    case 1: ...
  }
}
```

**问题**：`goto` 编译为 `__pc=N; break`，但 `break` 被 `switch` 外的 `while/for` 拦截，导致死循环。

**状态机本身的问题**：
1. 性能开销：每循环都检查 `__pc` 和 `switch`
2. 步数限制：需在多处插 `ctx.steps++`
3. 控制流复杂：所有循环/分支都需与状态机交互
4. 调试困难：生成的 JS 代码难以阅读

## 三、分策略方案

### 策略 A：代码复制（适用于简单前向跳转）

**适用条件**：
- 单 label
- 仅前向跳转
- label 后无循环嵌套
- label 与 goto 之间代码量小

**实现**：
```pascal
{ Pascal }
goto 100;
writeln('skipped');
100:
writeln('ok');
```

```js
// JS: 代码复制
{
  let __skip = false
  if (!__skip) {
    console.log('skipped')
  }
}
console.log('ok')
```

或更简单：
```js
// 直接删除被跳过的代码（保守：保留为注释）
// console.log('skipped')
console.log('ok')
```

### 策略 B：while(true) + break（适用于后向跳转/循环模拟）

**适用条件**：
- 单 label
- 后向跳转（模拟循环）
- label 在代码开头

**实现**：
```pascal
{ Pascal }
100:
i := i + 1;
if i < 10 then goto 100;
```

```js
// JS: while(true) 包装
while (true) {
  i = (i + 1) | 0
  if (i < 10) continue
  break
}
```

### 策略 C：标志变量 + 条件跳转（适用于跳出循环）

**适用条件**：
- 单 label
- 从循环内跳出
- label 在循环外

**实现**：
```pascal
{ Pascal }
while i < 10 do begin
  if i = 5 then goto 100;
  i := i + 1;
end;
100:
writeln('exit');
```

```js
// JS: 标志变量
let __goto_100 = false
while (i < 10) {
  if (i === 5) { __goto_100 = true; break }
  i = (i + 1) | 0
}
if (!__goto_100) {
  // 正常退出循环后的代码（如果有）
}
console.log('exit')
```

### 策略 D：完整状态机（适用于复杂场景）

**适用条件**：
- 多 label
- label 在嵌套控制流内
- 双向跳转
- goto 密集代码

**实现（修正版）**：

```js
// 确保 break 能跳出所有嵌套结构
__goto_switch: switch (__pc) {
  case 0:
    while (cond) {
      if (need_goto) {
        __pc = 1
        break __goto_switch  // 标签 break，跳出 switch
      }
    }
    break __goto_switch
  case 1:
    // label 1 的代码
    break __goto_switch
}
```

**关键修正**：
1. 用 `labeled break`（`break __goto_switch`）确保跳出 switch
2. 不再需要外层 `while(true)`（由顶层循环统一管理）
3. 状态机仅用于复杂跳转，简单场景用策略 A/B/C

### 策略 E：异常模拟（仅用于跨过程 goto）

**适用条件**：
- 检测到跨过程 goto（编译时分析）
- 仅在运行时抛出异常

**实现**：
```js
// 编译时检测到跨过程 goto，生成抛出代码
throw { __goto: 'label_100', __source: 'proc_name' }

// 在最外层捕获并报错
try {
  // ... 主程序
} catch (e) {
  if (e.__goto) {
    throw new Error(`GOTO across procedure boundary: ${e.__goto}`)
  }
  throw e
}
```

## 四、编译流程

### 阶段 1：静态分析（编译时）

```typescript
interface LabelAnalysis {
  labels: Map<string, {
    position: 'forward' | 'backward' | 'middle',
    inLoop: boolean,
    loopDepth: number,
    jumpSources: string[],  // 哪些 goto 跳到这里
  }>
  gotos: Map<string, {
    target: string,
    inLoop: boolean,
    loopDepth: number,
    crossesLoop: boolean,  // 跳出循环
  }>
  hasCrossProcedure: boolean
  complexity: 'simple' | 'medium' | 'complex'
}
```

### 阶段 2：策略选择

```typescript
function selectStrategy(analysis: LabelAnalysis): 'A' | 'B' | 'C' | 'D' | 'E' {
  if (analysis.hasCrossProcedure) return 'E'

  const labelCount = analysis.labels.size
  if (labelCount === 0) return 'A' // 无 goto，正常编译

  // 检查复杂度
  const hasNestedLoopGoto = analysis.gotos.some(g => g.crossesLoop && g.loopDepth > 1)
  const hasMultipleGoto = analysis.gotos.size > 2

  if (hasNestedLoopGoto || hasMultipleGoto || labelCount > 2) {
    return 'D' // 复杂场景，用状态机
  }

  // 简单场景
  const [label, info] = [...analysis.labels][0]
  const goto = analysis.gotos.find(g => g.target === label)

  if (info.position === 'forward' && !info.inLoop) return 'A'
  if (info.position === 'backward') return 'B'
  if (goto?.crossesLoop) return 'C'

  return 'D' // 兜底
}
```

### 阶段 3：代码生成

根据策略调用对应的代码生成器。

## 五、补充测试用例

### 5.1 边界情况

```typescript
// 1. goto 在嵌套 while 内，label 在最外层
{
  name: 'goto-nested-while-deep',
  code: `program test;
  var i, j, k: integer;
  begin
    for i := 1 to 3 do
      for j := 1 to 3 do
        for k := 1 to 3 do
          if (i=2) and (j=2) and (k=1) then goto 100;
  100:
    writeln('exit');
  end.`,
  expectedContains: 'exit',
}

// 2. 多个 goto 指向同一 label
{
  name: 'goto-multiple-same-label',
  code: `program test;
  var x: integer;
  begin
    x := 1;
    if x = 1 then goto 100;
    x := 2;
    if x = 2 then goto 100;
    x := 3;
  100:
    writeln(x);
  end.`,
  expectedContains: '1',
  expectedNotContains: '2\n3',
}

// 3. label 在 if 内，goto 在 if 外（不安全，应报错或警告）
{
  name: 'goto-into-if-block',
  code: `program test;
  label 100;
  var x: integer;
  begin
    x := 0;
    goto 100;
    x := 1;
    if x = 1 then begin
    100:
      writeln('inside if');
    end;
  end.`,
  expectedError: true, // 或 expectedContains: 'inside if'（取决于 Pascal 实现）
}
```

### 5.2 性能测试

```typescript
// 大量 goto 的性能测试（模拟 TANGLE 模式）
{
  name: 'goto-heavy-stress',
  code: `program test;
  label 1, 2, 3, 4, 5, 6, 7, 8, 9, 10;
  var i: integer;
  begin
    i := 0;
  1: i := i + 1; if i > 100 then goto 10 else goto 2;
  2: goto 3;
  3: goto 4;
  4: goto 5;
  5: goto 6;
  6: goto 7;
  7: goto 8;
  8: goto 9;
  9: goto 1;
  10: writeln(i);
  end.`,
  expectedContains: '101',
  // 性能：应在 1 秒内完成
}
```

### 5.3 错误处理增强

```typescript
// 动态不存在的 label（编译时无法检测）
{
  name: 'goto-dynamic-nonexistent',
  code: `program test;
  label 100;
  var x: integer;
  begin
    x := 1;
    case x of
      1: goto 100;
      2: goto 200;  // 不存在的 label
    end;
  100:
    writeln('ok');
  end.`,
  expectedError: true, // 编译时错误：label 200 未定义
}
```

## 六、排查工具

### 6.1 编译结果输出

```typescript
// runJS 增加 debug 选项
export interface JSRunOptions {
  // ...
  debug?: {
    emitJS?: boolean           // 打印生成的 JS 代码
    emitJSFile?: string        // 输出到文件
    labelAnalysis?: boolean    // 打印 label 分析结果
  }
}
```

使用方式：
```typescript
const result = await runJS(code, {
  debug: { emitJS: true }
})
// 输出：
// ===== Generated JS =====
// async function p_proc(ctx) {
//   ...
// }
// ========================
```

### 6.2 失败时自动打印

```typescript
// 测试 helper 失败时自动打印 JS 代码
if (!result.passed && result.state?.__debugJS) {
  console.error('Generated JS code:')
  console.error(result.state.__debugJS)
}
```

### 6.3 命令行工具

```bash
# 编译并输出 JS
npx ts-node -e "
import { compileToJS } from './src/js-compiler'
const js = compileToJS(pascalCode)
console.log(js)
"
```

## 七、实施计划

### Phase 1：基础设施（当前）

1. ✅ 增加 `allowUndeclaredLabels` 配置
2. ✅ 修复状态机 `labeled break` 问题
3. 📝 实现 `compileToJS` 公开 API（用于调试）
4. 📝 增加 `debug.emitJS` 选项

### Phase 2：简单场景优化

1. 📝 实现策略 A（代码复制）
2. 📝 实现策略 B（while+break）
3. 📝 实现策略 C（标志变量）
4. 📝 测试简单场景正确性

### Phase 3：复杂场景修正

1. 📝 实现策略 D（修正状态机）
2. 📝 实现 label 静态分析
3. 📝 策略选择器
4. 📝 测试复杂场景

### Phase 4：验证

1. 📝 全量 m5 测试通过
2. 📝 tests-tex TANGLE 编译测试通过
3. 📝 性能基准：goto 密集代码无明显回退

## 八、风险与备选

| 风险 | 应对 |
|------|------|
| 策略选择错误导致行为不一致 | 静态分析必须覆盖所有边界情况 |
| 代码复制导致代码膨胀 | 限制复制代码量阈值，超阈用状态机 |
| 跨过程 goto 检测遗漏 | 编译时遍历所有 goto，检查 target 是否在当前作用域 |

## 九、总结

**核心原则**：
1. 简单场景用简单方案（A/B/C），避免状态机开销
2. 复杂场景用修正状态机（D），确保 `labeled break` 正确性
3. 跨过程 goto 用异常（E），保持纯 JS 编译不回退 VM
4. 提供调试工具，快速定位问题

**预期效果**：
- 简单 goto 无性能损失
- 复杂 goto 正确执行
- 调试效率提升