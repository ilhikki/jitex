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

import { type PascalTest, runPascalTests } from './harness.ts'

const tests: PascalTest[] = [
  // ==========================================================================
  // 解析边界测试
  // ==========================================================================
  {
    name: '空 begin end 程序',
    code: `program test;
begin
end.`,
    purpose: '空 statement-sequence 合法，最小程序可解析执行且无输出',
    expectedOutput: '',
  },
  {
    name: '带有 input/output 程序参数的程序',
    code: 'program test(input, output);\nbegin\n  writeln(7);\nend.',
    purpose: 'program-parameter-list 含 input/output 时即可对标准文本文件读写（output 的 rewrite 后置断言成立）',
    expectedOutput: '7\n',
  },
  {
    name: '花括号块注释在程序开头',
    code: '{ this is a comment }\nprogram test(output);\nbegin\n  writeln(1);\nend.',
    purpose: '块注释出现在 program 之前时被正确跳过，不影响程序执行',
    expectedOutput: '1\n',
  },
  {
    name: '(* *) 风格块注释',
    code: '(* another comment *)\nprogram test(output);\nbegin\n  writeln(2);\nend.',
    purpose: '圆括号星号风格的块注释出现在 program 之前时被正确跳过',
    expectedOutput: '2\n',
  },
  {
    name: '空注释',
    code: '{}\nprogram test(output);\nbegin\n  writeln(3);\nend.',
    purpose: '空花括号注释（无 commentary 内容）能正确处理',
    expectedOutput: '3\n',
  },
  {
    name: '多行块注释',
    code: '{\n  line 1\n  line 2\n  line 3\n}\nprogram test(output);\nbegin\n  writeln(4);\nend.',
    purpose: '跨越多行的块注释被整体跳过',
    expectedOutput: '4\n',
  },
  {
    name: '单字母标识符',
    code: 'program test(output);\nvar\n  x: integer;\nbegin\n  x := 1;\n  writeln(x);\nend.',
    purpose: '单字母变量名是合法标识符，可正常赋值与读取',
    expectedOutput: '1\n',
  },
  {
    name: '大小写混合标识符',
    code: 'program test(output);\nvar\n  MyVar: integer;\nbegin\n  myvar := 1;\n  MYVAR := 2;\n  writeln(MyVar);\nend.',
    purpose: 'Pascal 标识符大小写不敏感，三种拼写指向同一变量（最后写入 2）',
    expectedOutput: '2\n',
  },
  {
    name: '零值整数',
    code: 'program test(output);\nvar\n  x: integer;\nbegin\n  x := 0;\n  writeln(x);\nend.',
    purpose: '零值整数常量赋值与输出',
    expectedOutput: '0\n',
  },
  {
    name: '负数常量',
    code: 'program test(output);\nvar\n  x: integer;\nbegin\n  x := -123;\n  writeln(x);\nend.',
    purpose: '负整数表达式赋值与输出',
    expectedOutput: '-123\n',
  },

  // ------------------------------
  // 运算符优先级测试
  // ------------------------------
  {
    name: '乘法优先级高于加法',
    code: 'program test(output);\nvar\n  a, b, c: integer;\nbegin\n  a := 2 + 3 * 4;\n  writeln(a);\nend.',
    purpose: 'ISO §6.7.1：* 属于 multiplying-operator，优先级高于 +，2+3*4 应为 14',
    expectedOutput: '14\n',
  },
  {
    name: '括号改变优先级',
    code: 'program test(output);\nvar\n  a, b, c: integer;\nbegin\n  a := (2 + 3) * 4;\n  writeln(a);\nend.',
    purpose: 'ISO §6.7.1：factor 可为括号表达式，(2+3)*4 应为 20',
    expectedOutput: '20\n',
  },
  {
    name: 'NOT 优先级高于 AND',
    code:
      "program test(output);\nvar\n  a, b: boolean;\n  c: boolean;\nbegin\n  a := true;\n  b := false;\n  c := NOT a AND b;\n  if c then writeln('T') else writeln('F');\nend.",
    purpose: 'ISO §6.7.1：NOT 为 factor 级运算符，NOT a AND b 解析为 (NOT a) AND b，结果为 false',
    expectedOutput: 'F\n',
  },
  {
    name: 'AND 优先级高于 OR',
    code:
      "program test(output);\nvar\n  a, b, c: boolean;\n  d: boolean;\nbegin\n  a := true;\n  b := true;\n  c := false;\n  d := a OR b AND c;\n  if d then writeln('T') else writeln('F');\nend.",
    purpose:
      'ISO §6.7.1：AND 为 multiplying-operator、OR 为 adding-operator，a OR b AND c 解析为 a OR (b AND c)，结果为 true',
    expectedOutput: 'T\n',
  },

  // ------------------------------
  // 作用域测试
  // ------------------------------
  {
    name: '全局变量在主程序体可见',
    code: 'program test(output);\nvar\n  x, y: integer;\nbegin\n  x := 1;\n  y := x + 2;\n  writeln(y);\nend.',
    purpose: '主程序中声明的变量在主程序作用域内可见并参与运算',
    expectedOutput: '3\n',
  },
  {
    name: '过程内声明的变量',
    code:
      'program test(output);\nprocedure p;\nvar\n  x: integer;\nbegin\n  x := 1;\n  writeln(x);\nend;\nbegin\n  p;\nend.',
    purpose: '过程内声明的变量属于过程的局部作用域，在过程体内可见',
    expectedOutput: '1\n',
  },
  {
    name: '函数名作为返回值变量',
    code: 'program test(output);\nfunction f: integer;\nbegin\n  f := 1;\nend;\nbegin\n  writeln(f);\nend.',
    purpose: '函数名在函数作用域内作为结果变量，激活函数即取得其值',
    expectedOutput: '1\n',
  },
  {
    name: '函数参数作用域',
    code:
      'program test(output);\nfunction f(x: integer): integer;\nbegin\n  f := x;\nend;\nbegin\n  writeln(f(9));\nend.',
    purpose: '函数形式参数在函数作用域内可见，可作为结果来源',
    expectedOutput: '9\n',
  },
  {
    name: '一层嵌套过程',
    code:
      "program test(output);\nprocedure outer;\nprocedure inner;\nbegin\n  writeln('inner');\nend;\nbegin\n  inner;\n  writeln('outer');\nend;\nbegin\n  outer;\nend.",
    purpose: '内层过程在包含它的外层过程内可见并被调用，输出顺序为 inner 后 outer',
    expectedOutput: 'inner\nouter\n',
  },
  {
    name: '嵌套过程访问外层变量',
    code:
      'program test(output);\nprocedure outer;\nvar\n  x: integer;\n  procedure inner;\n  begin\n    x := x + 1;\n  end;\nbegin\n  x := 0;\n  inner;\n  writeln(x);\nend;\nbegin\n  outer;\nend.',
    purpose: '嵌套过程可访问（并修改）外层过程的局部变量',
    expectedOutput: '1\n',
  },

  // ------------------------------
  // 过程和函数测试
  // ------------------------------
  {
    name: '无参过程声明与调用',
    code: "program test(output);\nprocedure Hello;\nbegin\n  writeln('hello');\nend;\nbegin\n  Hello;\nend.",
    purpose: '无参数过程的声明与调用',
    expectedOutput: 'hello\n',
  },
  {
    name: '单参过程声明与调用',
    code:
      'program test(output);\nprocedure PrintNum(n: integer);\nbegin\n  writeln(n);\nend;\nbegin\n  PrintNum(42);\nend.',
    purpose: '单个值参数的过程声明与调用，实参被传入形参',
    expectedOutput: '42\n',
  },
  {
    name: '无参函数声明与调用',
    code:
      'program test(output);\nvar\n  x: integer;\nfunction GetAnswer: integer;\nbegin\n  GetAnswer := 42;\nend;\nbegin\n  x := GetAnswer;\n  writeln(x);\nend.',
    purpose: '无参数函数的声明与调用，返回值赋给变量',
    expectedOutput: '42\n',
  },
  {
    name: '单参函数声明与调用',
    code:
      'program test(output);\nvar\n  y: integer;\nfunction Square(x: integer): integer;\nbegin\n  Square := x * x;\nend;\nbegin\n  y := Square(5);\n  writeln(y);\nend.',
    purpose: '单个参数函数的声明与调用，Square(5)=25',
    expectedOutput: '25\n',
  },
  {
    name: '函数返回值赋值',
    code:
      'program test(output);\nvar\n  m: integer;\nfunction Max(a, b: integer): integer;\nbegin\n  if a > b then\n    Max := a\n  else\n    Max := b;\nend;\nbegin\n  m := Max(10, 20);\n  writeln(m);\nend.',
    purpose: '函数体内对函数名赋值（返回值），Max(10,20)=20',
    expectedOutput: '20\n',
  },
  {
    name: '嵌套函数调用',
    code:
      'program test(output);\nvar\n  x: integer;\nfunction Outer: integer;\n  function Inner: integer;\n  begin\n    Inner := 10;\n  end;\nbegin\n  Outer := Inner * 2;\nend;\nbegin\n  x := Outer;\n  writeln(x);\nend.',
    purpose: '嵌套函数的声明和调用，内层函数在外层函数体内可见',
    expectedOutput: '20\n',
  },
  {
    name: '过程 forward 声明',
    code:
      "program test(output);\nprocedure ForwardProc; forward;\nprocedure ForwardProc;\nbegin\n  writeln('forward');\nend;\nbegin\n  ForwardProc;\nend.",
    purpose: 'ISO §6.6.1：forward 指令先声明过程头，随后以相同过程头给出过程体',
    expectedOutput: 'forward\n',
  },
  {
    name: '函数 forward 声明',
    code:
      'program test(output);\nvar\n  x: integer;\nfunction ForwardFunc: integer; forward;\nfunction ForwardFunc: integer;\nbegin\n  ForwardFunc := 42;\nend;\nbegin\n  x := ForwardFunc;\n  writeln(x);\nend.',
    purpose: 'ISO §6.6.2：forward 指令先声明函数头，随后以相同函数头给出函数体',
    expectedOutput: '42\n',
  },

  // ------------------------------
  // 递归测试
  // ------------------------------
  {
    name: '简单递归过程',
    code:
      'program test(output);\nprocedure CountDown(n: integer);\nbegin\n  if n > 0 then\n  begin\n    writeln(n);\n    CountDown(n - 1);\n  end;\nend;\nbegin\n  CountDown(3);\nend.',
    purpose: '最简单的直接递归过程，按 3、2、1 递减输出',
    expectedOutput: '3\n2\n1\n',
  },
  {
    name: '阶乘递归函数',
    code:
      'program test(output);\nvar\n  f: integer;\nfunction Factorial(n: integer): integer;\nbegin\n  if n <= 1 then\n    Factorial := 1\n  else\n    Factorial := n * Factorial(n - 1);\nend;\nbegin\n  f := Factorial(5);\n  writeln(f);\nend.',
    purpose: '经典递归函数，5! = 120',
    expectedOutput: '120\n',
  },
  {
    name: '两个过程相互递归',
    code:
      "program test(output);\nprocedure A(n: integer); forward;\nprocedure B(n: integer);\nbegin\n  if n > 0 then\n    A(n - 1)\n  else\n    writeln('B');\nend;\nprocedure A(n: integer);\nbegin\n  if n > 0 then\n    B(n - 1)\n  else\n    writeln('A');\nend;\nbegin\n  A(10);\nend.",
    purpose: '通过 forward 声明实现相互递归；A(10) 经 10 次交替调用后落在 A 的基本情形，输出 A',
    expectedOutput: 'A\n',
  },

  // ------------------------------
  // 类型测试
  // ------------------------------
  {
    name: '枚举类型',
    code:
      "program test(output);\ntype\n  Color = (Red, Green, Blue);\nvar\n  c: Color;\nbegin\n  c := Green;\n  if (c > Red) and (c < Blue) then writeln('mid');\nend.",
    purpose: 'ISO §6.4.2.3：枚举类型的值按声明顺序排列，Green 介于 Red 与 Blue 之间',
    expectedOutput: 'mid\n',
  },
  {
    name: 'record 类型',
    code:
      "program test(output);\ntype\n  TRec = record\n    x: integer;\n    y: integer;\n  end;\nvar\n  r: TRec;\nbegin\n  r.x := 1;\n  r.y := 2;\n  writeln(r.x, ',', r.y);\nend.",
    purpose: 'record 类型的声明与字段访问',
    expectedOutput: '1,2\n',
  },
  {
    name: '数组类型',
    code:
      'program test(output);\ntype\n  TArr = array[1..10] of integer;\nvar\n  a: TArr;\nbegin\n  a[1] := 10;\n  writeln(a[1]);\nend.',
    purpose: '数组类型的声明与下标访问',
    expectedOutput: '10\n',
  },
  {
    name: '子界类型',
    code:
      'program test(output);\ntype\n  SmallInt = 0..100;\nvar\n  n: SmallInt;\nbegin\n  n := 50;\n  writeln(n);\nend.',
    purpose: '子界类型的声明与合法范围内赋值',
    expectedOutput: '50\n',
  },

  // ------------------------------
  // 控制流测试
  // ------------------------------
  {
    name: 'CASE 仅有 OTHERWISE 分支',
    code:
      'program test(output);\nvar\n  x: integer;\nbegin\n  x := 5;\n  case x of\n    otherwise\n      x := 0;\n  end;\n  writeln(x);\nend.',
    purpose: 'ISO §6.8.3.5 的 case 无 otherwise 子句；本实现支持以 otherwise 兜底无匹配值，分支执行后 x 变为 0',
    expectedOutput: '0\n',
  },
  {
    name: '标签用于 GOTO',
    code:
      'program test(output);\nlabel 99;\nvar\n  x: integer;\nbegin\n  x := 1;\n  goto 99;\n  x := 2;\n99:\n  writeln(x);\nend.',
    purpose: 'ISO §6.8.2.4：goto 使处理在标签所指程序点继续，跳过 x := 2，故输出 1',
    expectedOutput: '1\n',
  },
  {
    name: 'WITH 语句',
    code:
      'program test(output);\ntype\n  TRec = record\n    x: integer;\n  end;\nvar\n  r: TRec;\nbegin\n  with r do\n    x := 1;\n  writeln(r.x);\nend.',
    purpose: 'ISO §6.8.3.10：with 语句为记录字段创建局部作用域，赋值等价于 r.x := 1',
    expectedOutput: '1\n',
  },

  // ==========================================================================
  // Knuth TeX/TANGLE Pascal 风格特性
  // 这些代码风格模仿 tangle-official.pas（紧凑、大写关键字、OTHERS: 等）；
  // 其中 FILE OF CHAR 上的文本过程、OTHERS: 分支、PAGE 效果等为本实现扩展/实现相关行为。
  // ==========================================================================

  // ------------------------------
  // FILE OF CHAR 类型（Knuth 用 TEXTFILE = PACKED FILE OF CHAR）
  // ------------------------------
  {
    name: 'FILE OF CHAR 变量可执行文本写操作',
    code: `PROGRAM TANGLE(F);
VAR F: FILE OF CHAR;
BEGIN
  REWRITE(F);
  WRITELN(F, 'OK');
END.`,
    purpose:
      'ISO §6.4.3.5：text 是由 required type-identifier 指称的独立文件类型、文本过程只适用于 textfile；本用例覆盖本实现允许对 FILE OF CHAR 施加文本过程',
    textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
    expectedFileContains: [{ url: 'F', contains: 'OK' }],
  },
  {
    name: 'PACKED FILE OF CHAR 类型定义（TANGLE 风格）',
    code: `PROGRAM TANGLE(TERMOUT);
TYPE TEXTFILE = PACKED FILE OF CHAR;
VAR TERMOUT: TEXTFILE;
BEGIN
  REWRITE(TERMOUT);
  WRITELN(TERMOUT, 'Hello');
END.`,
    purpose:
      'ISO §6.4.3.5：packed file of char 是合法的 file-type 记法，可作为结构化类型定义；此处以 TEXTFILE 为别名并写入文本',
    textFiles: new Map<string, Uint8Array>([['TERMOUT', new Uint8Array(0)]]),
    expectedFileContains: [{ url: 'TERMOUT', contains: 'Hello' }],
  },
  {
    name: '多个文件变量（TANGLE 程序头声明）',
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
    purpose: 'program-parameter-list 可声明多个文件变量，各自绑定到独立的外部文件',
    textFiles: new Map<string, Uint8Array>([
      ['WEBFILE', new Uint8Array(0)],
      ['CHANGEFILE', new Uint8Array(0)],
      ['PASCALFILE', new Uint8Array(0)],
    ]),
    expectedFileContains: [
      { url: 'WEBFILE', contains: 'web' },
      { url: 'CHANGEFILE', contains: 'change' },
      { url: 'PASCALFILE', contains: 'pascal' },
    ],
  },

  // ==========================================================================
  // OTHERS: case 分支（UCSD Pascal 风格，UCSD/Turbo 扩展，Knuth 在 TANGLE 中使用）
  // ==========================================================================
  {
    name: 'OTHERS: 作为 case 默认分支',
    code: `PROGRAM TANGLE(output);
VAR A: INTEGER;
BEGIN
  A := 5;
  CASE A OF
    0: WRITELN('zero');
    1: WRITELN('one');
    OTHERS: WRITELN('other:', A);
  END;
END.`,
    purpose: 'Knuth 风格：OTHERS: 作为 case 默认分支（无匹配 case 常量时执行）',
    expectedOutput: 'other:5\n',
  },
  {
    name: 'OTHERS: 命中分支',
    code: `PROGRAM TANGLE(output);
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
    purpose: 'Knuth 风格：OTHERS: 之前的显式分支命中，不进入默认分支',
    expectedOutput: 'tab\n',
  },
  {
    name: 'OTHERS: 命中默认分支（无匹配）',
    code: `PROGRAM TANGLE(output);
VAR A: INTEGER;
BEGIN
  A := 125;
  CASE A OF
    9: WRITELN('tab');
    10: WRITELN('lf');
    OTHERS: WRITELN('default');
  END;
END.`,
    purpose: 'Knuth 风格：无显式分支匹配时走 OTHERS: 默认分支',
    expectedOutput: 'default\n',
  },
  {
    name: 'OTHERS: 后续语句继续执行',
    code: `PROGRAM TANGLE(output);
VAR A: INTEGER;
BEGIN
  A := 99;
  CASE A OF
    1: WRITELN('one');
    OTHERS: WRITELN('other');
  END;
  WRITELN('after case');
END.`,
    purpose: 'Knuth 风格：OTHERS: 分支执行后继续执行 case 之后的语句',
    expectedOutput: 'other\nafter case\n',
  },

  // ==========================================================================
  // PAGE 系统过程（ISO 7185 6.9.5 定义其为 implementation-defined 效果）
  // ==========================================================================
  {
    name: 'PAGE 输出换页符',
    code: `PROGRAM TANGLE(output);
BEGIN
  WRITELN('page1');
  PAGE;
  WRITELN('page2');
END.`,
    purpose: 'ISO §6.9.5: PAGE 的效果为 implementation-defined；本实现在两行之间写出换页字符（U+000C）',
    expectedOutput: 'page1\n\fpage2\n',
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
    purpose: 'ISO §6.9.5: PAGE(f) 对文件施加 implementation-defined 的分页效果，前后文本顺序保留',
    textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
    expectedFileContains: [{ url: 'F', contains: 'before\n\fafter\n' }],
  },

  // ==========================================================================
  // 综合测试：模仿 TANGLE 中的代码片段
  // ==========================================================================
  {
    name: 'TANGLE 风格字符转义 case',
    code: `PROGRAM TANGLE(output);
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
    purpose: '模仿 tangle-official.pas 的字符转义 case 语句，A=125 命中显式分支',
    expectedOutput: 'dollar\n',
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
    purpose: '模仿 tangle-official.pas 程序头的四个文件变量声明，全部 REWRITE 后输出确认',
    expectedOutput: 'all opened\n',
  },
  {
    name: 'TANGLE 风格 OUTPUTSTATE record',
    code: `PROGRAM TANGLE(output);
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
    purpose: '模仿 tangle-official.pas 的 OUTPUTSTATE record：字段类型为整数子界，赋值与读取正确',
    expectedOutput: 'end=100 name=42\n',
  },
  {
    name: 'TANGLE 风格多维度数组',
    code: `PROGRAM TANGLE(output);
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
    purpose: '模仿 tangle-official.pas 的 BYTEMEM 二维数组：下标 [1,3] 写入 1*10+3=13',
    expectedOutput: 'byte=13\n',
  },
]

runPascalTests('Other / unclassified', tests)
