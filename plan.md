# Pascal 解释器项目计划

## 目标
使用 TypeScript 实现一个浏览器环境的 Pascal 解释器，能解析 `tangle-official.pas` 文件。

## 阶段一：AST 实现 ✅

### 1.1 项目初始化 ✅
- 创建 git 仓库
- 配置 TypeScript 项目
- 安装 jest 测试框架

### 1.2 AST 节点定义 ✅
FP 风格，使用 record 和鸭子类型（`kind` 字段）：
- 所有节点定义在 `src/ast/types.ts`
- 纯 interface，不使用 class
- Token 携带位置信息，AST 节点不携带位置信息

### 1.3 Lexer 实现 ✅
纯函数风格：
- `src/lexer/lexer.ts`
- `lex(source) => Token[]`
- Token: `{ type, content, start: Position, end: Position }`
- 位置函数: `createOffsetToPosition(source) => (offset) => Position`

### 1.4 Parser 实现 ✅
纯函数风格：
- 每个函数对应一个产生式
- 输入: `{ tokens, position }`
- 输出: `ParseResult = { success, newPosition, astNode } | { success, error, position }`
- 使用 lookahead 决定分支，不使用 parser comb 遍历
- 文件:
  - `src/parser/helpers.ts` — 工具函数
  - `src/parser/expressions.ts` — 表达式解析
  - `src/parser/types.ts` — 类型解析
  - `src/parser/statements.ts` — 语句解析
  - `src/parser/declarations.ts` — 声明和程序解析

### 1.5 产生式文档 ✅
- `docs/productions.md` — 每个产生式有对应的函数名和节点类型

### 1.6 问题管理 ✅
- `issue/` 目录，每个 issue 单独文件
- ISSUE-001: 预定义标识符被当作关键字 (已修复)
- ISSUE-002: WRITE/WRITELN 格式说明符未解析 (已修复)

### 1.7 单元测试 ✅
- 88 个测试全部通过
- `tests/lexer/lexer.test.ts` — 16 个 lexer 测试
- `tests/parser/productions.test.ts` — 71 个产生式测试
- `tests/tangle.test.ts` — 1 个 tangle-official.pas 集成测试

## 阶段二：解释器实现（后续）
- 实现表达式求值
- 实现语句执行
- 实现程序运行

## 项目结构
```
pascal-ts/
├── src/
│   ├── ast/
│   │   └── types.ts           # AST 节点定义 (FP records)
│   ├── lexer/
│   │   └── lexer.ts            # Lexer (纯函数)
│   ├── parser/
│   │   ├── helpers.ts          # 解析工具函数
│   │   ├── expressions.ts      # 表达式产生式
│   │   ├── types.ts            # 类型产生式
│   │   ├── statements.ts       # 语句产生式
│   │   └── declarations.ts     # 声明和程序产生式
│   └── index.ts                # 入口文件
├── tests/
│   ├── lexer/lexer.test.ts     # Lexer 测试
│   ├── parser/productions.test.ts  # 产生式测试
│   └── tangle.test.ts          # 集成测试
├── docs/
│   └── productions.md          # 产生式文档
├── issue/                      # 问题记录
│   ├── ISSUE-001-*.md
│   └── ISSUE-002-*.md
├── .trae/skills/               # Skill 配置
│   ├── project-management/
│   ├── development/
│   └── issue-fixing/
├── pascal-file/
│   └── tangle-official.pas     # 目标 Pascal 文件
├── plan.md
├── package.json
├── tsconfig.json
└── jest.config.js
```
