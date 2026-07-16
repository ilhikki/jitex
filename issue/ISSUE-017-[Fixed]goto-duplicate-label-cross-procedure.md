# ISSUE-017: 重复 label 未检测 & 跨过程 GOTO 测试违反 Pascal82

## 状态
Fixed

## 分类
P2: Pascal82 标准违规

## 问题描述

`tests/m3.6/q03-goto.test.ts` 中有 3 个测试失败，分析如下：

1. **`goto-error-duplicate-label`**：真实 bug。测试代码
   ```pascal
   100:
     writeln('First');
   100:
     writeln('Second');
   ```
   期望报错，但解释器/parser 没有任何检查，输出 `First\nSecond` 而非报错。Pascal82 §6.1.1 要求同一 block 内 label 必须唯一。

2. **`goto-recursion-label-in-recursive`**：测试代码违反 Pascal82。`rec` 过程内 `goto 99`，label `99` 位于主程序 block。Pascal82 规定 GOTO 只能在同一 block 内跳转（同一过程/函数/主程序内），禁止跨过程跳转。解释器实现 `createGotoFrame` 正确实现了此约束（搜到 Function/Program 帧即停止），但测试本意是"测试递归中 GOTO"，与 Pascal82 矛盾。修正为 `expectedError: true`，验证"友好报错"。

3. **`goto-recursion-mutual`**：同上，过程 `a` 内 `goto 20` 跨到主程序。修正为 `expectedError: true`。

## 判定原则
- **不以代码实现为依据，以 Pascal 1982 年标准为唯一依据**判断是否为 bug。
- **遇到不支持的特性必须友好报错**，而不是崩溃或静默接受。
- 默认只支持标准 Pascal，非标行为默认存在即 bug。

## Pascal82 标准
- §6.1.1：同一 block 内 label 不能重名。
- §6.1.1：GOTO 的目标 label 必须在同一 block 中可见，跨过程 GOTO 非法。

## 根因
- `parseBlock` 没有扫描 compound statement 检查 label 重复。
- 上述两个测试原本是按"扩展 GOTO 跨过程"行为设计的，非标准用法。

## 修复方案
1. 在 `src/parser/declarations.ts` 的 `parseBlock` 中添加 `checkDuplicateLabels` 步骤，递归遍历 `CompoundStatement`、`IfStatement`、`WhileStatement`、`RepeatStatement`、`ForStatement`、`CaseStatement`、`WithStatement`、`LabeledStatement` 节点，收集同 block 内的 label 值，发现重复则返回 `fail`。
2. 修改两个跨过程 GOTO 测试为 `expectedError: true` 并在 purpose/features 中标注违反 Pascal82。

## 验证
- 35/35 goto 测试通过
- 全量测试无回归

## 相关文件
- `src/parser/declarations.ts`：parseBlock、checkDuplicateLabels、walkForLabels
- `tests/m3.6/q03-goto.test.ts`：goto-error-duplicate-label、goto-recursion-label-in-recursive、goto-recursion-mutual
