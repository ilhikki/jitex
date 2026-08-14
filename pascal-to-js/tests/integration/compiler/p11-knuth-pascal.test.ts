// 测试 Knuth TeX/TANGLE 使用的 Pascal 风格特性
// 这些特性是 UCSD/Turbo Pascal 扩展，被 Knuth 在 WEB 系统中使用
// 代码风格模仿 tangle-official.pas（紧凑、大写关键字、OTHERS: 等）

import { describe } from 'vitest'
import { type PascalTest, runPascalTests } from './_helper'
import { pascalHPlugin } from '@/compiler/plugins/pascal-h.plugin'

describe('M5 JS - Knuth Pascal Style', () => {
  const tests: PascalTest[] = [
    // ==========================================================================
    // FILE OF CHAR 类型（Knuth 用 TEXTFILE = PACKED FILE OF CHAR）
    // ==========================================================================

    {
      name: 'FILE OF CHAR 等价于 text',
      code: `PROGRAM TANGLE;
VAR F: FILE OF CHAR;
BEGIN
  REWRITE(F);
  WRITELN('OK');
END.`,
      purpose: 'Knuth 风格：声明 FILE OF CHAR 类型变量，等价于 text',
      expectedContains: 'OK',
    },

    {
      name: 'PACKED FILE OF CHAR 等价于 text',
      code: `PROGRAM TANGLE;
TYPE TEXTFILE = PACKED FILE OF CHAR;
VAR TERMOUT: TEXTFILE;
BEGIN
  REWRITE(TERMOUT);
  WRITELN(TERMOUT, 'Hello');
END.`,
      purpose:
        'Knuth 风格：TEXTFILE = PACKED FILE OF CHAR 类型定义（tangle-official.pas 中的定义）',
      expectedContains: 'Hello',
    },

    {
      name: '多个 text 文件变量',
      code: `PROGRAM TANGLE;
VAR WEBFILE, CHANGEFILE, PASCALFILE: FILE OF CHAR;
BEGIN
  REWRITE(WEBFILE);
  REWRITE(CHANGEFILE);
  REWRITE(PASCALFILE);
  WRITELN(WEBFILE, 'web');
  WRITELN(CHANGEFILE, 'change');
  WRITELN(PASCALFILE, 'pascal');
END.`,
      purpose: 'Knuth 风格：TANGLE 程序头声明的三个文件变量',
      expectedContains: 'web',
    },

    // ==========================================================================
    // OTHERS: case 分支（UCSD Pascal 风格，Knuth 在 TANGLE 中使用）
    // ==========================================================================

    {
      name: 'OTHERS: 作为 case 默认分支',
      code: `PROGRAM TANGLE;
VAR A: INTEGER;
BEGIN
  A := 5;
  CASE A OF
    0: WRITELN('zero');
    1: WRITELN('one');
    OTHERS: WRITELN('other:', A);
  END;
END.`,
      purpose: 'Knuth 风格：OTHERS: 作为 case 默认分支（tangle-official.pas 第 221 行风格）',
      expectedContains: 'other:5',
    },

    {
      name: 'OTHERS: 命中分支',
      code: `PROGRAM TANGLE;
VAR A: INTEGER;
BEGIN
  A := 9;
  CASE A OF
    9: WRITELN('tab');
    10: WRITELN('lf');
    13: WRITELN('cr');
    OTHERS: WRITELN('char');
  END;
END.`,
      purpose: 'Knuth 风格：OTHERS: 之前的显式分支命中（模仿 TANGLE 字符转义 case）',
      expectedContains: 'tab',
    },

    {
      name: 'OTHERS: 命中默认分支（无匹配）',
      code: `PROGRAM TANGLE;
VAR A: INTEGER;
BEGIN
  A := 125;
  CASE A OF
    9: WRITELN('tab');
    10: WRITELN('lf');
    OTHERS: WRITELN('default');
  END;
END.`,
      purpose: 'Knuth 风格：无显式分支匹配时走 OTHERS:',
      expectedContains: 'default',
    },

    {
      name: 'OTHERS: 后续语句继续执行',
      code: `PROGRAM TANGLE;
VAR A: INTEGER;
BEGIN
  A := 99;
  CASE A OF
    1: WRITELN('one');
    OTHERS: WRITELN('other');
  END;
  WRITELN('after case');
END.`,
      purpose: 'Knuth 风格：OTHERS: 分支执行后继续执行 case 后的语句',
      expectedContains: 'other',
    },

    // ==========================================================================
    // BREAK 和 PAGE 系统过程
    // ==========================================================================

    {
      name: 'BREAK 过程不报错',
      code: `PROGRAM TANGLE;
VAR TERMOUT: FILE OF CHAR;
BEGIN
  REWRITE(TERMOUT);
  WRITE(TERMOUT, 'buffered');
  BREAK(TERMOUT);
  WRITELN('done');
END.`,
      purpose: 'Knuth 风格：BREAK 过程刷新输出缓冲区（tangle-official.pas 中 ERROR 过程使用）。启用 pascalHPlugin',
      expectedContains: 'done',
      plugins: [pascalHPlugin],
    },

    {
      name: 'BREAK 无参数',
      code: `PROGRAM TANGLE;
BEGIN
  WRITE('buf');
  BREAK;
  WRITELN('ok');
END.`,
      purpose: 'BREAK 无参数调用。启用 pascalHPlugin',
      expectedContains: 'ok',
      plugins: [pascalHPlugin],
    },

    {
      name: 'PAGE 输出换页符',
      code: `PROGRAM TANGLE;
BEGIN
  WRITELN('page1');
  PAGE;
  WRITELN('page2');
END.`,
      purpose: 'PAGE 过程输出换页符（Knuth 用于分页输出）',
      expectedContains: '\f',
    },

    {
      name: 'PAGE 带文件参数',
      code: `PROGRAM TANGLE;
VAR F: FILE OF CHAR;
BEGIN
  REWRITE(F);
  WRITELN(F, 'before');
  PAGE(F);
  WRITELN(F, 'after');
END.`,
      purpose: 'PAGE 带文件参数（Knuth 风格）',
      expectedContains: 'before',
    },

    // ==========================================================================
    // F^ 文件缓冲区访问（Knuth 在 WEB 系统中读取文件用 F^）
    // ==========================================================================

    {
      name: 'F^ 文件缓冲区访问（启用 fileEofBufferSpace 扩展）',
      code: `PROGRAM TANGLE;
VAR F: FILE OF CHAR;
    CH: CHAR;
BEGIN
  REWRITE(F);
  CH := F^;
  WRITELN('ch=', CH);
END.`,
      purpose: 'Knuth 风格：F^ 访问文件缓冲区（tangle-official.pas 中 INPUTLN 等过程使用）；REWRITE 后 EOF=true，启用 fileEofBufferSpace 扩展',
      extensions: ['fileEofBufferSpace'],
      expectedContains: 'ch=',
    },

    {
      name: 'F^ 赋值给变量（启用 fileEofBufferSpace 扩展）',
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
      name: 'F^ 在表达式中使用（启用 fileEofBufferSpace 扩展）',
      code: `PROGRAM TANGLE;
VAR F: FILE OF CHAR;
BEGIN
  REWRITE(F);
  IF F^ = ' ' THEN WRITELN('space') ELSE WRITELN('other');
END.`,
      purpose: 'F^ 在 if 表达式中使用；REWRITE 后 EOF=true，访问 F^ 属 ISO 7185 6.9.8 未定义行为，启用 fileEofBufferSpace 扩展返回空格',
      extensions: ['fileEofBufferSpace'],
      expectedContains: 'space',
    },

    {
      name: 'F^ 在 EOF 时默认报错（未启用扩展）',
      code: `PROGRAM TANGLE;
VAR F: FILE OF CHAR;
BEGIN
  REWRITE(F);
  IF F^ = ' ' THEN WRITELN('space') ELSE WRITELN('other');
END.`,
      purpose: '反测试：默认配置下 F^ 在 EOF 时访问应报错（ISO 7185 6.9.8 未定义行为）',
      expectedError: 'fileEofBufferSpace',
    },

    // ==========================================================================
    // 综合测试：模仿 TANGLE 中的代码片段
    // ==========================================================================

    {
      name: 'TANGLE 风格字符转义 case',
      code: `PROGRAM TANGLE;
VAR A: INTEGER;
BEGIN
  A := 125;
  CASE A OF
    9: WRITELN('tab');
    10: WRITELN('lf');
    13: WRITELN('cr');
    125: WRITELN('dollar');
    OTHERS: WRITELN('char');
  END;
END.`,
      purpose: '模仿 tangle-official.pas 第 217-221 行的字符转义 case 语句',
      expectedContains: 'dollar',
    },

    {
      name: 'TANGLE 风格 ERROR 过程',
      code: `PROGRAM TANGLE;
VAR TERMOUT: FILE OF CHAR;
    HISTORY: INTEGER;
PROCEDURE ERROR;
BEGIN
  WRITELN(TERMOUT, '. (l.', 1:1, ')');
  BREAK(TERMOUT);
  HISTORY := 2;
END;
BEGIN
  REWRITE(TERMOUT);
  HISTORY := 0;
  ERROR;
  WRITELN('history=', HISTORY);
END.`,
      purpose: '模仿 tangle-official.pas 的 ERROR 过程（使用 BREAK 和文件输出）。启用 pascalHPlugin',
      expectedContains: 'history=2',
      plugins: [pascalHPlugin],
    },

    {
      name: 'TANGLE 风格文件变量声明',
      code: `PROGRAM TANGLE(WEBFILE, CHANGEFILE, PASCALFILE, POOL);
VAR WEBFILE, CHANGEFILE, PASCALFILE, POOL: FILE OF CHAR;
BEGIN
  REWRITE(WEBFILE);
  REWRITE(CHANGEFILE);
  REWRITE(PASCALFILE);
  REWRITE(POOL);
  WRITELN('all opened');
END.`,
      purpose: '模仿 tangle-official.pas 程序头和变量声明',
      expectedContains: 'all opened',
    },

    {
      name: 'TANGLE 风格 OUTPUTSTATE record',
      code: `PROGRAM TANGLE;
TYPE SIXTEENBITS = 0..65535;
     NAMEPOINTER = 0..4000;
     TEXTPOINTER = 0..2000;
     OUTPUTSTATE = RECORD
       ENDFIELD: SIXTEENBITS;
       BYTEFIELD: SIXTEENBITS;
       NAMEFIELD: NAMEPOINTER;
       REPLFIELD: TEXTPOINTER;
       MODFIELD: 0..12287;
     END;
VAR CURSTATE: OUTPUTSTATE;
BEGIN
  CURSTATE.ENDFIELD := 100;
  CURSTATE.NAMEFIELD := 42;
  WRITELN('end=', CURSTATE.ENDFIELD, ' name=', CURSTATE.NAMEFIELD);
END.`,
      purpose: '模仿 tangle-official.pas 的 OUTPUTSTATE record 类型定义',
      expectedContains: 'end=100 name=42',
    },

    {
      name: 'TANGLE 风格多维度数组',
      code: `PROGRAM TANGLE;
CONST MAXBYTES = 100;
TYPE ASCIICODE = 0..127;
VAR BYTEMEM: ARRAY[0..1, 0..MAXBYTES] OF ASCIICODE;
    I, J: INTEGER;
BEGIN
  FOR I := 0 TO 1 DO
    FOR J := 0 TO 5 DO
      BYTEMEM[I, J] := I * 10 + J;
  WRITELN('byte=', BYTEMEM[1, 3]);
END.`,
      purpose: '模仿 tangle-official.pas 的 BYTEMEM 二维数组',
      expectedContains: 'byte=13',
    },
  ]

  runPascalTests(tests)
})
