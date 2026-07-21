# tests/

> 测试目录。代码即文档——具体测试用例见各测试文件。

## 目录结构

| 目录                    | 层级           | 说明                                           |
| ----------------------- | -------------- | ---------------------------------------------- |
| `unit/`                 | 单元测试       | lexer/parser 单个模块的独立测试                |
| `integration/`          | 集成测试       | 按模块分组的端到端执行测试                     |
| `integration/compiler/` | 编译器集成测试 | JS 编译器执行 Pascal 程序的测试（原 m5 + m36） |
| `integration/parser/`   | 解析器集成测试 | 解析器语法解析测试（原 m3.5）                  |
| `e2e/`                  | 端到端测试     | TEX82 完整编译执行的端到端测试（原 tests-tex） |

## 测试文件命名

- `p{phase}-{feature}.test.ts`：对应 Phase X 的 feature 测试
- `p00-{feature}.test.ts`：基础设施/跨 phase 测试
- `p10+`：兼容性/综合测试（保留原编号）

## 原则

- **引擎无关**：测试接口命名不与引擎耦合（PascalTest/runPascalTest）。
- **最小化权限**：非必要不启用非标扩展。
- **非标测试**：每个非标特性必须有正反测试：
  - 正测试：注入/配置启用非标，验证功能正常
  - 反测试：默认配置下，验证非标特性报错
- **测试 helper**：`integration/_helper.ts` 提供 PascalTest / runPascal / runPascalTest / runPascalTests。

## 如何更新本文档

- 测试原则变更 → 修改对应条目。
- 新增测试目录 → 说明其定位。
