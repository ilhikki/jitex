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

import { type PascalTest, runPascalTests } from './harness.ts'

function text(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

const tests: PascalTest[] = [
  {
    name: '6.10 无参 program-heading：合法且不报错',
    code: `PROGRAM NOARGS(output);BEGIN WRITELN('OK');END.`,
    purpose: 'ISO §6.10: program-heading 的 program-parameter-list 是可选的，省略时仍是合法 program',
    expectedOutput: 'OK\n',
  },

  {
    name: '6.10 program 名无运行时语义：只做声明',
    code: `PROGRAM MYFAVORITEAPP(output);VAR I:INTEGER;BEGIN I:=42;WRITELN(I);END.`,
    purpose: 'ISO §6.10: program-identifier 即程序名，在程序内无任何意义，不影响执行',
    expectedOutput: '42\n',
  },

  {
    name: '6.10 文件参数：恒等映射 programFileUrls（INFILE→INFILE，OUTFILE→OUTFILE）',
    code:
      `PROGRAM COPYFILE(INFILE,OUTFILE);VAR INFILE,OUTFILE:TEXT;CH:CHAR;BEGIN RESET(INFILE);REWRITE(OUTFILE);WHILE NOT EOF(INFILE)DO BEGIN WHILE NOT EOLN(INFILE)DO BEGIN CH:=INFILE^;WRITE(OUTFILE,CH);GET(INFILE);END;WRITELN(OUTFILE);READLN(INFILE);END;END.`,
    purpose:
      'ISO §6.10: program-parameter 到外部实体的绑定为 implementation-defined；本实现用 programFileUrls 指定，此处做恒等映射，两个文本文件按 §6.9 复制',
    textFiles: new Map<string, Uint8Array>([
      ['INFILE', text('ABC\nDEF\n')],
      ['OUTFILE', new Uint8Array(0)],
    ]),
    programFileUrls: { INFILE: 'INFILE', OUTFILE: 'OUTFILE' },
    expectedFileContains: [{ url: 'OUTFILE', contains: 'ABC\nDEF\n' }],
  },

  {
    name: '6.10 文件参数：缺省 programFileUrls 时恒等映射（程序参数名即 files 键名）',
    code:
      `PROGRAM COPY2(F,G);VAR F,G:FILE OF CHAR;BEGIN RESET(F);REWRITE(G);WHILE NOT EOF(F)DO BEGIN G^:=F^;PUT(G);GET(F);END;END.`,
    purpose:
      'ISO §6.10: program-parameter 的文件绑定为 implementation-defined；未指定 programFileUrls 时本实现以参数名本身作为外部文件键，缓冲区赋值 + PUT/GET 逐分量复制',
    textFiles: new Map<string, Uint8Array>([
      ['F', text('HELLO')],
      ['G', new Uint8Array(0)],
    ]),
    expectedFileContains: [{ url: 'G', contains: 'HELLO' }],
  },

  {
    name: '6.10 文件参数：programFileUrls 做重命名映射（F→IN.TXT，G→OUT.TXT）',
    code: `PROGRAM RENAMEMAP(F,G);
      VAR F,G:TEXT;
      C:CHAR;
      BEGIN RESET(F);
      REWRITE(G);
      WHILE NOT EOF(F) DO 
      BEGIN C:=F^;
         WRITE(G,C);
         GET(F);
      END;
      END.`,
    purpose:
      'ISO §6.10: 绑定为 implementation-defined；programFileUrls 可把文件变量重命名映射到内存文件名，变量名不等于外部文件名',
    textFiles: new Map<string, Uint8Array>([
      ['IN.TXT', text('MAPPED')],
      ['OUT.TXT', new Uint8Array(0)],
    ]),
    programFileUrls: { F: 'IN.TXT', G: 'OUT.TXT' },
    expectedFileContains: [{ url: 'OUT.TXT', contains: 'MAPPED' }],
  },

  {
    name: '6.10 程序文件参数的文件绑定与 READ',
    code: `PROGRAM T(IO);VAR IO:TEXT;X:INTEGER;BEGIN RESET(IO);READ(IO,X);WRITELN('X=',X);END.`,
    purpose:
      'ISO §6.10: program-parameter 到外部实体的绑定为 implementation-defined，本实现由 programFileUrls 指定；RESET 后按 §6.9.1 从文本文件读整数',
    textFiles: new Map<string, Uint8Array>([['IO', text('7')]]),
    programFileUrls: { IO: 'IO' },
    expectedOutput: 'X=7\n',
  },

  {
    name: '6.10 单参数 program：text 文件参数（读两个整数求和）',
    code:
      `PROGRAM SUM(NUMBERS);VAR NUMBERS:TEXT;A,B,S:INTEGER;BEGIN RESET(NUMBERS);READ(NUMBERS,A);READ(NUMBERS,B);S:=A+B;WRITELN('SUM=',S);END.`,
    purpose: 'ISO §6.10: program-parameter-list 可只含一个标识符；text 文件参数绑定后按 §6.9.1 连续读出两个整数',
    textFiles: new Map<string, Uint8Array>([['NUMBERS', text('11 31')]]),
    programFileUrls: { NUMBERS: 'NUMBERS' },
    expectedOutput: 'SUM=42\n',
  },

  {
    name: '6.10 program 头参数标识符大小写不敏感（infile 与 INFILE 同一定义点）',
    code:
      `PROGRAM MIXED(infile,outfile);VAR INFILE,OUTFILE:TEXT;CH:CHAR;BEGIN RESET(INFILE);REWRITE(OUTFILE);WHILE NOT EOF(INFILE)DO BEGIN CH:=INFILE^;WRITE(OUTFILE,CH);GET(INFILE);END;END.`,
    purpose:
      'ISO §6.1.1/§6.10: 字符-串之外字母大小写对含义无影响，故 program-parameter 以 infile/outfile 拼写、var 段以 INFILE/OUTFILE 声明仍是同一 variable-identifier（本实现的 programFileUrls 以 program-头中的拼写为键）',
    textFiles: new Map<string, Uint8Array>([
      ['INFILE', text('lowercaseOK')],
      ['OUTFILE', new Uint8Array(0)],
    ]),
    programFileUrls: { infile: 'INFILE', outfile: 'OUTFILE' },
    expectedFileContains: [{ url: 'OUTFILE', contains: 'lowercaseOK' }],
  },

  {
    name: '6.10 program-parameter-list 标识符必须互不相同（重复 → 应报错）',
    code: `PROGRAM DUP(F,F);VAR F:TEXT;BEGIN END.`,
    purpose:
      'ISO §6.10: program-parameter-list 的标识符须互不相同，该要求未被 designated 为 error，故按 §5.1 e) 处理器须判定违规并阻止执行',
    expectedError: '',
  },

  {
    name: '6.10 input/output 作为 program 头参数：首次访问时为 reset/rewrite 状态',
    code: `PROGRAM ECHO(INPUT,OUTPUT);VAR S:INTEGER;BEGIN READ(S);WRITELN(S*2);END.`,
    purpose:
      'ISO §6.10: input/output 列为 program-parameters 后，read/write 无需显式 RESET/REWRITE 即可用（reset/rewrite 的后置断言已在首次访问前成立）',
    input: '21',
    expectedOutput: '42\n',
  },

  {
    name: '6.10 仅 output 作为参数：输出仍可用',
    code: `PROGRAM ONLYOUT(OUTPUT);BEGIN WRITELN(1);WRITELN(2);END.`,
    purpose: 'ISO §6.10: output 列为 program-parameter 使 rewrite 的后置断言成立，writeln 可直接写出',
    expectedOutput: '1\n2\n',
  },

  {
    name: '6.10 只列 input 而未列 output：省略文件参数的 read 可用',
    code: `PROGRAM ONLYIN(INPUT,LOG);VAR LOG:TEXT;X:INTEGER;BEGIN READ(X);REWRITE(LOG);WRITELN(LOG,X+1);END.`,
    purpose:
      'ISO §6.10/§6.9.1: input 作为 program-parameter 使其 reset 后置断言在首次访问前成立，read（省略文件参数）可直接读取；本程序未列 output，故结果写入文件参数 LOG',
    input: '41',
    textFiles: new Map<string, Uint8Array>([['LOG', new Uint8Array(0)]]),
    expectedFileContains: [{ url: 'LOG', contains: '42\n' }],
  },
]

runPascalTests('ISO 7185 6.10 - Programs', tests)
