// 其他用例（不符合 ISO 7185 单一章节归属的测试）
//
// 用途：
//   收纳无法明确归入 6.1 - 6.10 任一章节的用例，例如：
//   - 同时跨多个章节、按章节拆分反而失真的综合用例；
//   - 针对本实现特有机制（注入、非标扩展、内存文件系统等）的用例；
//   - 尚无对应 ISO 条文可锚定的探索性/回归用例。
//
// 子章节：
//   （不适用）
//
// 状态：骨架文件，用例待从 tests/integration/ 迁移（迁移时仅改 name，内容不动）。

import { describe } from './harness.ts'
import { type PascalTest, runPascalTests } from './harness.ts'

describe('Other / unclassified', () => {
  const tests: PascalTest[] = [
    // ==========================================================================
    // 从 m3.5 复制的测试用例 - 验证解析和执行
    // ==========================================================================

    // ------------------------------
    // 解析边界测试
    // ------------------------------
    {
      name: '空 begin end 程序',
      code: `program test;
begin
end.`,
      purpose: '验证只有空 compound statement 的最小程序能解析和执行',
    },
    {
      name: '只有 program 声明的程序',
      code: 'program test;\nbegin\nend.',
      purpose: '验证最小完整程序结构：program + 空 begin end',
    },
    {
      name: '无变量无过程的程序',
      code: `program test;

begin
end.`,
      purpose: '验证没有变量和过程声明的程序能正常解析和执行',
    },
    {
      name: '带有程序参数的程序',
      code: 'program test(input, output);\nbegin\nend.',
      purpose: '验证带参数列表的 program 声明',
    },
    {
      name: '花括号块注释在程序开头',
      code: '{ this is a comment }\nprogram test;\nbegin\nend.',
      purpose: '验证块注释出现在程序开头时被正确跳过',
    },
    {
      name: '(* *) 风格块注释',
      code: '(* another comment *)\nprogram test;\nbegin\nend.',
      purpose: '验证圆括号星号风格的块注释',
    },
    {
      name: '空注释',
      code: '{}\nprogram test;\nbegin\nend.',
      purpose: '验证空花括号注释能正确处理',
    },
    {
      name: '多行块注释',
      code: '{\n  line 1\n  line 2\n  line 3\n}\nprogram test;\nbegin\nend.',
      purpose: '验证跨越多行的块注释',
    },
    {
      name: '单字母标识符',
      code: 'program test;\nvar\n  x: integer;\nbegin\n  x := 1;\nend.',
      purpose: '验证单字母变量名是合法标识符',
    },
    {
      name: '大小写混合标识符',
      code: 'program test;\nvar\n  MyVar: integer;\nbegin\n  myvar := 1;\n  MYVAR := 2;\nend.',
      purpose: '验证 Pascal 标识符大小写不敏感',
    },
    {
      name: '零值整数',
      code: 'program test;\nvar\n  x: integer;\nbegin\n  x := 0;\nend.',
      purpose: '验证零值整数常量',
    },
    {
      name: '负数常量',
      code: 'program test;\nvar\n  x: integer;\nbegin\n  x := -123;\nend.',
      purpose: '验证负整数表达式',
    }, // ------------------------------
    // 运算符优先级测试
    // ------------------------------
    {
      name: 'multiply has higher precedence than add',
      code: 'program test;\nvar\n  a, b, c: integer;\nbegin\n  a := 2 + 3 * 4;\nend.',
      purpose: '验证 * 优先级高于 +',
    },
    {
      name: 'parentheses change precedence',
      code: 'program test;\nvar\n  a, b, c: integer;\nbegin\n  a := (2 + 3) * 4;\nend.',
      purpose: '验证括号可以改变优先级',
    },
    {
      name: 'NOT has highest precedence among logical operators',
      code: 'program test;\nvar\n  a, b: boolean;\n  c: boolean;\nbegin\n  c := NOT a AND b;\nend.',
      purpose: '验证 NOT 优先级高于 AND',
    },
    {
      name: 'AND has higher precedence than OR',
      code: 'program test;\nvar\n  a, b, c: boolean;\n  d: boolean;\nbegin\n  d := a OR b AND c;\nend.',
      purpose: '验证 AND 优先级高于 OR',
    }, // ------------------------------
    // 作用域测试
    // ------------------------------
    {
      name: '全局变量在主程序体可见',
      code: 'program test;\nvar\n  x: integer;\nbegin\n  x := 1;\nend.',
      purpose: '验证主程序中声明的变量在主程序作用域内',
    },
    {
      name: '过程内声明的变量',
      code: 'program test;\nprocedure p;\nvar\n  x: integer;\nbegin\n  x := 1;\nend;\nbegin\n  p;\nend.',
      purpose: '验证过程内声明的变量属于过程的局部作用域',
    },
    {
      name: '函数名作为返回值变量',
      code: 'program test;\nfunction f: integer;\nbegin\n  f := 1;\nend;\nbegin\nend.',
      purpose: '验证函数名在函数作用域内作为返回值变量',
    },
    {
      name: '函数参数作用域',
      code: 'program test;\nfunction f(x: integer): integer;\nbegin\n  f := x;\nend;\nbegin\nend.',
      purpose: '验证函数参数在函数作用域内可见',
    },
    {
      name: '一层嵌套过程',
      code:
        'program test;\nprocedure outer;\nprocedure inner;\nbegin\nend;\nbegin\n  inner;\nend;\nbegin\n  outer;\nend.',
      purpose: '验证一层嵌套过程的作用域结构',
    },
    {
      name: '嵌套过程访问外层变量',
      code:
        'program test;\nprocedure outer;\nvar\n  x: integer;\n  procedure inner;\n  begin\n    x := x + 1;\n  end;\nbegin\n  x := 0;\n  inner;\nend;\nbegin\n  outer;\nend.',
      purpose: '验证嵌套过程访问外层作用域的变量',
    }, // ------------------------------
    // 过程和函数测试
    // ------------------------------
    {
      name: '无参过程声明与调用',
      code: 'program test;\nprocedure Hello;\nbegin\nend;\nbegin\n  Hello;\nend.',
      purpose: '测试无参数过程的声明和调用',
    },
    {
      name: '单参过程声明与调用',
      code: 'program test;\nprocedure PrintNum(n: integer);\nbegin\nend;\nbegin\n  PrintNum(42);\nend.',
      purpose: '测试单个值参数的过程声明和调用',
    },
    {
      name: '无参函数声明与调用',
      code:
        'program test;\nvar\n  x: integer;\nfunction GetAnswer: integer;\nbegin\n  GetAnswer := 42;\nend;\nbegin\n  x := GetAnswer;\nend.',
      purpose: '测试无参数函数的声明和调用',
    },
    {
      name: '单参函数声明与调用',
      code:
        'program test;\nvar\n  y: integer;\nfunction Square(x: integer): integer;\nbegin\n  Square := x * x;\nend;\nbegin\n  y := Square(5);\nend.',
      purpose: '测试单个参数函数的声明和调用',
    },
    {
      name: '函数返回值赋值',
      code:
        'program test;\nvar\n  m: integer;\nfunction Max(a, b: integer): integer;\nbegin\n  if a > b then\n    Max := a\n  else\n    Max := b;\nend;\nbegin\n  m := Max(10, 20);\nend.',
      purpose: '测试函数体内对函数名赋值（返回值）',
    },
    {
      name: '嵌套函数调用',
      code:
        'program test;\nvar\n  x: integer;\nfunction Outer: integer;\n  function Inner: integer;\n  begin\n    Inner := 10;\n  end;\nbegin\n  Outer := Inner * 2;\nend;\nbegin\n  x := Outer;\nend.',
      purpose: '测试嵌套函数的声明和调用',
    },
    {
      name: '过程 forward 声明',
      code:
        'program test;\nprocedure ForwardProc; forward;\nprocedure ForwardProc;\nbegin\nend;\nbegin\n  ForwardProc;\nend.',
      purpose: '测试过程的 FORWARD 声明',
    },
    {
      name: '函数 forward 声明',
      code:
        'program test;\nvar\n  x: integer;\nfunction ForwardFunc: integer; forward;\nfunction ForwardFunc: integer;\nbegin\n  ForwardFunc := 42;\nend;\nbegin\n  x := ForwardFunc;\nend.',
      purpose: '测试函数的 FORWARD 声明',
    }, // ------------------------------
    // 递归测试
    // ------------------------------
    {
      name: '简单递归过程',
      code:
        'program test;\nprocedure CountDown(n: integer);\nbegin\n  if n > 0 then\n    CountDown(n - 1);\nend;\nbegin\n  CountDown(10);\nend.',
      purpose: '测试最简单的直接递归过程',
    },
    {
      name: '阶乘递归函数',
      code:
        'program test;\nvar\n  f: integer;\nfunction Factorial(n: integer): integer;\nbegin\n  if n <= 1 then\n    Factorial := 1\n  else\n    Factorial := n * Factorial(n - 1);\nend;\nbegin\n  f := Factorial(5);\nend.',
      purpose: '测试经典的阶乘递归函数模式',
    },
    {
      name: '两个过程相互递归',
      code:
        'program test;\nprocedure A(n: integer); forward;\nprocedure B(n: integer);\nbegin\n  if n > 0 then\n    A(n - 1);\nend;\nprocedure A(n: integer);\nbegin\n  if n > 0 then\n    B(n - 1);\nend;\nbegin\n  A(10);\nend.',
      purpose: '测试两个过程通过 forward 声明实现相互递归',
    }, // ------------------------------
    // 类型测试
    // ------------------------------
    {
      name: '枚举类型',
      code: 'program test;\ntype\n  Color = (Red, Green, Blue);\nvar\n  c: Color;\nbegin\n  c := Red;\nend.',
      purpose: '测试枚举类型的声明和使用',
    },
    {
      name: 'record 类型',
      code:
        'program test;\ntype\n  TRec = record\n    x: integer;\n    y: integer;\n  end;\nvar\n  r: TRec;\nbegin\n  r.x := 1;\n  r.y := 2;\nend.',
      purpose: '测试 record 类型的声明和字段访问',
    },
    {
      name: '数组类型',
      code: 'program test;\ntype\n  TArr = array[1..10] of integer;\nvar\n  a: TArr;\nbegin\n  a[1] := 10;\nend.',
      purpose: '测试数组类型的声明和访问',
    },
    {
      name: '子界类型',
      code: 'program test;\ntype\n  SmallInt = 0..100;\nvar\n  n: SmallInt;\nbegin\n  n := 50;\nend.',
      purpose: '测试子界类型的声明和使用',
    }, // ------------------------------
    // 控制流测试
    // ------------------------------
    {
      name: '只有 OTHERWISE 的 CASE',
      code: 'program test;\nvar\n  x: integer;\nbegin\n  case x of\n    otherwise\n      x := 0;\n  end;\nend.',
      purpose: '验证 CASE 语句可以只有 OTHERWISE 分支',
    },
    {
      name: 'FORWARD 后再定义过程',
      code: 'program test;\nprocedure p; forward;\nprocedure p;\nbegin\nend;\nbegin\n  p;\nend.',
      purpose: '验证 forward 声明后可以再定义过程体',
    },
    {
      name: '标签用于 GOTO',
      code: 'program test;\nlabel 99;\nvar\n  x: integer;\nbegin\n  x := 1;\n  goto 99;\n  x := 2;\n99:\nend.',
      purpose: '验证 GOTO 语句跳转到已声明的标签',
    },
    {
      name: 'WITH 语句',
      code:
        'program test;\ntype\n  TRec = record\n    x: integer;\n  end;\nvar\n  r: TRec;\nbegin\n  with r do\n    x := 1;\nend.',
      purpose: '验证 WITH 语句创建记录字段的局部作用域',
    },

    // ==========================================================================
    // Knuth TeX/TANGLE Pascal 风格特性
    // 这些特性是 UCSD/Turbo Pascal 扩展，被 Knuth 在 WEB 系统中使用
    // 代码风格模仿 tangle-official.pas（紧凑、大写关键字、OTHERS: 等）
    // ==========================================================================

    // ==========================================================================
    // FILE OF CHAR 类型（Knuth 用 TEXTFILE = PACKED FILE OF CHAR）
    // ==========================================================================
    {
      name: 'FILE OF CHAR 等价于 text',
      code: `PROGRAM TANGLE(F);
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
      code: `PROGRAM TANGLE(TEXTFILE, TERMOUT);
TYPE TEXTFILE = PACKED FILE OF CHAR;
VAR TERMOUT: TEXTFILE;
BEGIN
  REWRITE(TERMOUT);
  WRITELN(TERMOUT, 'Hello');
END.`,
      purpose: 'Knuth 风格：TEXTFILE = PACKED FILE OF CHAR 类型定义（tangle-official.pas 中的定义）',
      expectedFileContains: [{ url: 'TERMOUT', contains: 'Hello' }],
    },
    {
      name: '多个 text 文件变量',
      code: `PROGRAM TANGLE(WEBFILE, CHANGEFILE, PASCALFILE);
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
      expectedFileContains: [{ url: 'WEBFILE', contains: 'web' }],
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
    // PAGE 系统过程（ISO 7185 6.6.5.2 标准）
    // ==========================================================================
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
      code: `PROGRAM TANGLE(F);
VAR F: FILE OF CHAR;
BEGIN
  REWRITE(F);
  WRITELN(F, 'before');
  PAGE(F);
  WRITELN(F, 'after');
END.`,
      purpose: 'PAGE 带文件参数（Knuth 风格）',
      expectedFileContains: [
        { url: 'F', contains: 'before' },
      ],
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
