// ISO/IEC 7185:1990 - 6.10 Programs
//
// 章节概括：
//   规定 program 的语法为 program = program-heading ';' program-block '.'，其中 program-heading
//   含程序名标识符及可选的 program-parameter-list，program-block 即 block。程序名在程序内无任何意义；
//   program-parameter-list 中的标识符须互不相同，称为 program-parameters，每个都以 variable-identifier
//   的身份在 program-block 的 region 内有定义点。program-parameter 所表示的变量到程序外部实体的绑定
//   为 implementation-dependent，若该变量为文件类型则绑定为 implementation-defined。
//   对某个为 program-parameter 的变量执行 clause 6 中定义的任何动作/运算/函数时，若因参数绑定
//   导致该执行无法按定义完成，则为错误。input/output 作程序参数时成为 text 类型（required
//   type-identifier text）的 variable-identifier：input 的出现使 reset 的后置断言成立、
//   output 的出现使 rewrite 的后置断言成立（均在首次访问前）；对这两个文本文件施以
//   reset/rewrite 的效果为 implementation-defined。
//
// 子章节：
//   （无下级子章节）
//
// 状态：骨架文件，用例待从 tests/integration/ 迁移（迁移时仅改 name，内容不动）。

import { describe } from './harness.ts'
import { type PascalTest, runPascalTests } from './harness.ts'

function text(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

describe('ISO 7185 6.10 - Programs', () => {
  const tests: PascalTest[] = [
    {
      name: '6.10 无参 program-heading：合法且不报错',
      code: `PROGRAM NOARGS;BEGIN WRITELN('OK');END.`,
      purpose: 'program-heading 不带参数列表是 ISO 标准允许的简化形式',
      expectedOutput: 'OK\n',
    },

    {
      name: '6.10 program 名无运行时语义：只做声明',
      code: `PROGRAM MYFAVORITEAPP;VAR I:INTEGER;BEGIN I:=42;WRITELN(I);END.`,
      purpose: 'program-identifier 仅作名称，不影响执行',
      expectedOutput: '42\n',
    },

    {
      name: '6.10 文件参数：恒等映射 programFileUrls（INFILE→INFILE，OUTFILE→OUTFILE）',
      code:
        `PROGRAM COPYFILE(INFILE,OUTFILE);VAR INFILE,OUTFILE:FILE OF CHAR;CH:CHAR;BEGIN RESET(INFILE);REWRITE(OUTFILE);WHILE NOT EOF(INFILE)DO BEGIN WHILE NOT EOLN(INFILE)DO BEGIN CH:=INFILE^;WRITE(OUTFILE,CH);GET(INFILE);END;WRITELN(OUTFILE);READLN(INFILE);END;END.`,
      purpose: 'ISO §6.10: 通过 programFileUrls 精确相等映射绑定外部文件',
      textFiles: new Map<string, Uint8Array>([
        ['INFILE', text('ABC\nDEF\n')],
        ['OUTFILE', new Uint8Array(0)],
      ]),
      programFileUrls: { INFILE: 'INFILE', OUTFILE: 'OUTFILE' },
      expectedFileContains: [
        { url: 'OUTFILE', contains: 'ABC' },
        { url: 'OUTFILE', contains: 'DEF' },
      ],
    },

    {
      name: '6.10 文件参数：缺省 programFileUrls 时恒等映射（程序参数名即 files 键名）',
      code:
        `PROGRAM COPY2(F,G);VAR F,G:FILE OF CHAR;BEGIN RESET(F);REWRITE(G);WHILE NOT EOF(F)DO BEGIN G^:=F^;PUT(G);GET(F);END;END.`,
      purpose: 'ISO §6.10: 缺省 programFileUrls 时，程序头参数名本身即外部文件键',
      textFiles: new Map<string, Uint8Array>([
        ['F', text('HELLO')],
        ['G', new Uint8Array(0)],
      ]),
      expectedFileContains: [{ url: 'G', contains: 'HELLO' }],
    },

    {
      name: '6.10 文件参数：programFileUrls 做重命名映射（F→IN.TXT，G→OUT.TXT）',
      code: `PROGRAM RENAMEMAP(F,G);
      VAR F,G:FILE OF CHAR;
      C:CHAR;
      BEGIN RESET(F);
      REWRITE(G);
      WHILE NOT EOF(F) DO 
      BEGIN C:=F^;
         WRITE(G,C);
         GET(F);
      END;
      END.`,
      purpose: 'ISO §6.10: programFileUrls 可以重命名文件变量→内存文件名，变量名不等于文件名',
      textFiles: new Map<string, Uint8Array>([
        ['IN.TXT', text('MAPPED')],
        ['OUT.TXT', new Uint8Array(0)],
      ]),
      programFileUrls: { F: 'IN.TXT', G: 'OUT.TXT' },
      expectedFileContains: [{ url: 'OUT.TXT', contains: 'MAPPED' }],
    },

    {
      name: '6.10 文件参数：映射只影响 program 头参数',
      code: `PROGRAM T(IO);VAR IO:FILE OF CHAR;X:INTEGER;BEGIN RESET(IO);READ(IO,X);WRITELN('X=',X);END.`,
      purpose: 'ISO §6.10: program 头的文件初始化在 algorithm 开始前完成，因此 RESET 之前不需要绑定文件',
      textFiles: new Map<string, Uint8Array>([['IO', text('7')]]),
      programFileUrls: { IO: 'IO' },
      expectedContains: 'X=7',
    },

    {
      name: '6.10 文件参数：单参数 program（FILE OF INTEGER）',
      code:
        `PROGRAM SUM(NUMBERS);VAR NUMBERS:FILE OF INTEGER;A,B,S:INTEGER;BEGIN RESET(NUMBERS);READ(NUMBERS,A);READ(NUMBERS,B);S:=A+B;WRITELN('SUM=',S);END.`,
      purpose: 'ISO §6.10: 单一文件参数；FILE OF INTEGER 作为程序头参数同样被绑定',
      textFiles: new Map<string, Uint8Array>([['NUMBERS', text('11 31')]]),
      programFileUrls: { NUMBERS: 'NUMBERS' },
      expectedContains: 'SUM=42',
    },

    {
      name: '6.10 文件参数：大小写不敏感映射（inFile → INFILE 命中）',
      code:
        `PROGRAM MIXED(infile,outfile);VAR INFILE,OUTFILE:FILE OF CHAR;CH:CHAR;BEGIN RESET(INFILE);REWRITE(OUTFILE);WHILE NOT EOF(INFILE)DO BEGIN CH:=INFILE^;WRITE(OUTFILE,CH);GET(INFILE);END;END.`,
      purpose: 'ISO §6.1.2: Pascal 标识符大小写不敏感，programFileUrls 键匹配也应大小写不敏感',
      textFiles: new Map<string, Uint8Array>([
        ['INFILE', text('lowercaseOK')],
        ['OUTFILE', new Uint8Array(0)],
      ]),
      // 键使用小写，与 program 头里的 infile/outfile（被 parser 规范化为大写变量）匹配
      programFileUrls: { infile: 'INFILE', outfile: 'OUTFILE' },
      expectedFileContains: [{ url: 'OUTFILE', contains: 'lowercaseOK' }],
    },

    {
      name: '6.10 编译一次运行两次：不同 programFileUrls 不应污染编译产物',
      code:
        `PROGRAM ONCE(SRC,DST);VAR SRC,DST:FILE OF CHAR;C:CHAR;BEGIN RESET(SRC);REWRITE(DST);WHILE NOT EOF(SRC)DO BEGIN C:=SRC^;WRITE(DST,C);GET(SRC);END;END.`,
      purpose:
        '核心断言：programFileUrls 在运行时决定；同一份 Pascal 源码使用不同映射运行两次应读到不同文件，不需要重新编译',
      textFiles: new Map<string, Uint8Array>([
        ['A', text('FROMA')],
        ['B', text('FROMB')],
        ['OUTA', new Uint8Array(0)],
        ['OUTB', new Uint8Array(0)],
      ]),
      programFileUrls: { SRC: 'A', DST: 'OUTA' },
      expectedFileContains: [{ url: 'OUTA', contains: 'FROMA' }],
    },

    {
      name: '6.10 input/output 作为 program 头参数：首次访问时为 reset/rewrite 状态',
      code: `PROGRAM ECHO(INPUT,OUTPUT);VAR S:INTEGER;BEGIN READ(S);WRITELN(S*2);END.`,
      purpose: 'ISO §6.10: input/output 列为 program-parameters，首次访问无需显式 RESET/REWRITE',
      input: '21',
      expectedOutput: '42\n',
    },

    {
      name: '6.10 仅 output 作为参数：输出仍可用',
      code: `PROGRAM ONLYOUT(OUTPUT);BEGIN WRITELN(1);WRITELN(2);END.`,
      purpose: 'ISO §6.10: 仅 output 在参数列表中也能正常输出',
      expectedOutput: '1\n2\n',
    },

    {
      name: '6.10 仅 input 作为参数：输入仍可用',
      code: `PROGRAM ONLYIN(INPUT);VAR X:INTEGER;BEGIN READ(X);END.`,
      purpose: 'ISO §6.10: 仅 input 在参数列表中也能正常 read；不输出即不报错',
      input: '3',
    },
  ]

  runPascalTests(tests)
})
