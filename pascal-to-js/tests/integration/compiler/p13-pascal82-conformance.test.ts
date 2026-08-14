// 测试 Pascal82 规范一致性 — M4.1
// 代码风格模仿 TANGLE.WEB 输出的 Pascal：紧凑、大写
// 这些用例覆盖 ISO 7185 标准中容易出错的边界情况

import { describe } from './_helper.ts'
import { type PascalTest, runPascalTests } from './_helper'

describe('M4.1 Pascal82 Conformance', () => {
  const tests: PascalTest[] = [
    // ==========================================================================
    // ARRAY[CHAR] — 索引范围应为 0..255（Pascal82 §6.4.3.1）
    // ==========================================================================

    {
      name: 'ARRAY[CHAR] 索引范围 0..255',
      code: `PROGRAM TANGLE;TYPE ASCIICODE=0..127;VAR XORD:ARRAY[CHAR]OF ASCIICODE;CH:CHAR;BEGIN XORD[CHR(65)]:=1;XORD[CHR(90)]:=2;WRITELN(XORD[CHR(65)],',',XORD[CHR(90)]);END.`,
      purpose: 'ARRAY[CHAR] 类型索引应覆盖完整 CHAR 范围（0..255），TANGLE 用 XORD[CHR(I)]',
      expectedContains: '1,2',
    },

    {
      name: 'ARRAY[CHAR] 访问极端值',
      code: `PROGRAM TANGLE;VAR A:ARRAY[CHAR]OF INTEGER;BEGIN A[CHR(0)]:=100;A[CHR(255)]:=200;WRITELN(A[CHR(0)],',',A[CHR(255)]);END.`,
      purpose: 'ARRAY[CHAR] 应能访问 CHR(0) 和 CHR(255)，覆盖完整 ASCII 范围',
      expectedContains: '100,200',
    },

    // ==========================================================================
    // ARRAY[BOOLEAN] — 索引范围应为 0..1（Pascal82 §6.4.3.1）
    // ==========================================================================

    {
      name: 'ARRAY[BOOLEAN] 索引范围 0..1',
      code: `PROGRAM TANGLE;VAR FLAG:ARRAY[BOOLEAN]OF INTEGER;BEGIN FLAG[FALSE]:=0;FLAG[TRUE]:=1;WRITELN(FLAG[FALSE],',',FLAG[TRUE]);END.`,
      purpose: 'ARRAY[BOOLEAN] 类型索引应覆盖 FALSE(0) 和 TRUE(1)',
      expectedContains: '0,1',
    },

    // ==========================================================================
    // ARRAY[ENUM] — 索引范围应为 0..n-1（Pascal82 §6.4.3.1）
    // ==========================================================================

    {
      name: 'ARRAY[ENUM] 索引范围 0..values.length-1',
      code: `PROGRAM TANGLE;TYPE COLOR=(RED,GREEN,BLUE);VAR PALETTE:ARRAY[COLOR]OF INTEGER;BEGIN PALETTE[RED]:=1;PALETTE[GREEN]:=2;PALETTE[BLUE]:=3;WRITELN(PALETTE[RED],',',PALETTE[GREEN],',',PALETTE[BLUE]);END.`,
      purpose: 'ARRAY[ENUM] 类型索引应覆盖枚举的完整范围',
      expectedContains: '1,2,3',
    },

    // ==========================================================================
    // TANGLE 风格：ARRAY[CHAR] 初始化循环
    // ==========================================================================

    {
      name: 'TANGLE 风格 CHAR 数组初始化',
      code: `PROGRAM TANGLE;VAR XORD:ARRAY[CHAR]OF INTEGER;I:INTEGER;BEGIN FOR I:=0 TO 127 DO XORD[CHR(I)]:=I+1;WRITELN(XORD[CHR(65)]);END.`,
      purpose: 'TANGLE 初始化 CHAR 数组的模式：FOR 循环遍历 CHR(I)',
      expectedContains: '66',
    },
  ]

  runPascalTests(tests)
})
