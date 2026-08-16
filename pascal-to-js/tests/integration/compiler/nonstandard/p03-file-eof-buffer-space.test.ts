// fileEofBufferSpace 扩展正反测试（AGENTS.md 原则 A.10）
//
// ISO 7185 6.9.8 定义：EOF 状态下访问文件缓冲区 F^ 是未定义行为。
// 启用 extensions=['fileEofBufferSpace'] 后，EOF 时 F^ 返回空格（Knuth TANGLE 依赖此行为）。
// 正测试：启用扩展，验证 F^ 可访问。
// 反测试：默认配置下，EOF 时访问 F^ 必须报错。

import { describe } from '../_helper.ts'
import { type PascalTest, runPascalTests } from '../_helper.ts'

describe('非标扩展：fileEofBufferSpace（F^ 文件缓冲区，正反测试）', () => {
  const tests: PascalTest[] = [
    {
      name: 'F^ 正向：文件缓冲区访问',
      code: `PROGRAM TANGLE;
VAR F: FILE OF CHAR;
    CH: CHAR;
BEGIN
  REWRITE(F);
  CH := F^;
  WRITELN('ch=', CH);
END.`,
      purpose:
        'Knuth 风格：F^ 访问文件缓冲区（tangle-official.pas 中 INPUTLN 等过程使用）；REWRITE 后 EOF=true，启用 fileEofBufferSpace 扩展',
      extensions: ['fileEofBufferSpace'],
      expectedContains: 'ch=',
    },

    {
      name: 'F^ 正向：赋值给变量',
      code: `PROGRAM TANGLE;
VAR F: FILE OF CHAR;
    X: CHAR;
BEGIN
  REWRITE(F);
  X := F^;
  WRITELN('x=', X);
END.`,
      purpose: 'F^ 赋值给 char 变量；REWRITE 后 EOF=true，启用 fileEofBufferSpace 扩展',
      extensions: ['fileEofBufferSpace'],
      expectedContains: 'x=',
    },

    {
      name: 'F^ 正向：在表达式中使用',
      code: `PROGRAM TANGLE;
VAR F: FILE OF CHAR;
BEGIN
  REWRITE(F);
  IF F^ = ' ' THEN WRITELN('space') ELSE WRITELN('other');
END.`,
      purpose: 'F^ 在 if 表达式中使用；REWRITE 后 EOF=true，启用 fileEofBufferSpace 扩展返回空格',
      extensions: ['fileEofBufferSpace'],
      expectedContains: 'space',
    },

    {
      name: 'F^ 反向：EOF 时默认报错（未启用扩展）',
      code: `PROGRAM TANGLE;
VAR F: FILE OF CHAR;
BEGIN
  REWRITE(F);
  IF F^ = ' ' THEN WRITELN('space') ELSE WRITELN('other');
END.`,
      purpose: '反测试：默认配置下 F^ 在 EOF 时访问应报错（ISO 7185 6.9.8 未定义行为）',
      expectedError: 'fileEofBufferSpace',
    },
  ]

  runPascalTests(tests)
})
