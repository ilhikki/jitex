// 测试 VM 内存文件模型（异步）
// 代码风格模仿 TANGLE.WEB 输出的 Pascal：紧凑、大写、TEXTFILE = PACKED FILE OF CHAR
// 这些用例覆盖 RESET/REWRITE/GET/PUT/EOF/EOLN/READ/READLN/WRITE/WRITELN/F^/ASSIGN

import { describe } from './_helper.ts'
import { type PascalTest, runPascalTests } from './_helper.ts'

function text(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

describe('M5 JS - File Model (async)', () => {
  const tests: PascalTest[] = [
    // ==========================================================================
    // REWRITE + WRITE/WRITELN：写入到内存文件
    // ==========================================================================

    {
      name: 'REWRITE + WRITELN 写入单行',
      code: `PROGRAM TANGLE;VAR F:FILE OF CHAR;BEGIN ASSIGN(F,'OUT.TXT');REWRITE(F);WRITELN(F,'HELLO');CLOSE(F);END.`,
      purpose: 'ASSIGN + REWRITE + WRITELN + CLOSE 写入到内存文件',
      files: new Map<string, Uint8Array>([['OUT.TXT', new Uint8Array(0)]]),
      expectedFileContains: [{ url: 'OUT.TXT', contains: 'HELLO' }],
    },

    {
      name: 'REWRITE + WRITE 多个参数',
      code:
        `PROGRAM TANGLE;VAR F:FILE OF CHAR;BEGIN ASSIGN(F,'OUT.TXT');REWRITE(F);WRITE(F,'N=',42);WRITELN(F);CLOSE(F);END.`,
      purpose: 'WRITE 多参数写入文件，最后 WRITELN 换行',
      files: new Map<string, Uint8Array>([['OUT.TXT', new Uint8Array(0)]]),
      expectedFileContains: [{ url: 'OUT.TXT', contains: 'N=42' }],
    },

    {
      name: 'WRITELN with width 写入文件',
      code:
        `PROGRAM TANGLE;VAR F:FILE OF CHAR;BEGIN ASSIGN(F,'OUT.TXT');REWRITE(F);WRITELN(F,'l.',5:1,')');CLOSE(F);END.`,
      purpose: 'TANGLE 风格：WRITELN(TERMOUT, "l.", LINE:1, ")") 写入文件',
      files: new Map<string, Uint8Array>([['OUT.TXT', new Uint8Array(0)]]),
      expectedFileContains: [{ url: 'OUT.TXT', contains: 'l.5)' }],
    },

    // ==========================================================================
    // RESET + EOF：从内存文件读
    // ==========================================================================

    {
      name: 'RESET 空文件 EOF 立即为真',
      code:
        `PROGRAM TANGLE;VAR F:FILE OF CHAR;BEGIN ASSIGN(F,'EMPTY.TXT');RESET(F);IF EOF(F)THEN WRITELN('EMPTY')ELSE WRITELN('NOT EMPTY');END.`,
      purpose: '空文件 RESET 后 EOF 立即为真',
      files: new Map<string, Uint8Array>([['EMPTY.TXT', new Uint8Array(0)]]),
      expectedContains: 'EMPTY',
    },

    {
      name: 'RESET 非空文件 EOF 为假',
      code:
        `PROGRAM TANGLE;VAR F:FILE OF CHAR;BEGIN ASSIGN(F,'IN.TXT');RESET(F);IF EOF(F)THEN WRITELN('EMPTY')ELSE WRITELN('HAS DATA');END.`,
      purpose: '非空文件 RESET 后 EOF 为假',
      files: new Map<string, Uint8Array>([['IN.TXT', text('hello')]]),
      expectedContains: 'HAS DATA',
    },

    // ==========================================================================
    // F^ + GET：逐字符读取（Knuth INPUTLN 风格）
    // ==========================================================================

    {
      name: 'F^ 读首字符 + GET 推进',
      code:
        `PROGRAM TANGLE;VAR F:FILE OF CHAR;CH:CHAR;BEGIN ASSIGN(F,'IN.TXT');RESET(F);CH:=F^;WRITE(CH);GET(F);CH:=F^;WRITE(CH);WRITELN;END.`,
      purpose: 'F^ 读缓冲区字符，GET 推进 offset（tangle INPUTLN 风格）',
      files: new Map<string, Uint8Array>([['IN.TXT', text('AB')]]),
      expectedContains: 'AB',
    },

    {
      name: 'INPUTLN 风格逐字符循环',
      code:
        `PROGRAM TANGLE;VAR F:FILE OF CHAR;CH:CHAR;BEGIN ASSIGN(F,'IN.TXT');RESET(F);WHILE NOT EOLN(F)DO BEGIN CH:=F^;WRITE(CH);GET(F);END;WRITELN;END.`,
      purpose: 'Knuth INPUTLN 风格：WHILE NOT EOLN(F) DO BEGIN CH:=F^;WRITE(CH);GET(F) END',
      files: new Map<string, Uint8Array>([['IN.TXT', text('HELLO\n')]]),
      expectedContains: 'HELLO',
    },

    // ==========================================================================
    // EOLN：行结束检测
    // ==========================================================================

    {
      name: 'EOLN 在行尾返回真',
      code:
        `PROGRAM TANGLE;VAR F:FILE OF CHAR;BEGIN ASSIGN(F,'IN.TXT');RESET(F);WHILE NOT EOLN(F)DO GET(F);IF EOLN(F)THEN WRITELN('AT EOLN');END.`,
      purpose: 'GET 推进到行尾时 EOLN 返回真',
      files: new Map<string, Uint8Array>([['IN.TXT', text('AB\n')]]),
      expectedContains: 'AT EOLN',
    },

    {
      name: 'READLN 跳过当前行',
      code:
        `PROGRAM TANGLE;VAR F:FILE OF CHAR;CH:CHAR;BEGIN ASSIGN(F,'IN.TXT');RESET(F);READLN(F);CH:=F^;WRITE(CH);WRITELN;END.`,
      purpose: 'READLN(F) 跳过当前行，下一行首字符可读',
      files: new Map<string, Uint8Array>([['IN.TXT', text('LINE1\nLINE2\n')]]),
      expectedContains: 'L',
    },

    // ==========================================================================
    // READ/READLN 整数：从文件读数值
    // ==========================================================================

    {
      name: 'READ 从文件读整数',
      code:
        `PROGRAM TANGLE;VAR F:FILE OF CHAR;N:INTEGER;BEGIN ASSIGN(F,'IN.TXT');RESET(F);READ(F,N);WRITELN('N=',N);END.`,
      purpose: 'READ(F, N) 从文件读整数',
      files: new Map<string, Uint8Array>([['IN.TXT', text('42')]]),
      expectedContains: 'N=42',
    },

    {
      name: 'READ 多个整数',
      code:
        `PROGRAM TANGLE;VAR F:FILE OF CHAR;A,B:INTEGER;BEGIN ASSIGN(F,'IN.TXT');RESET(F);READ(F,A,B);WRITELN('A=',A,' B=',B);END.`,
      purpose: 'READ(F, A, B) 连续读多个整数',
      files: new Map<string, Uint8Array>([['IN.TXT', text('10 20')]]),
      expectedContains: 'A=10 B=20',
    },

    // ==========================================================================
    // 文件复制：经典 Pascal IO 用例
    // ==========================================================================

    {
      name: '文件复制：INFILE → OUTFILE',
      code:
        `PROGRAM COPYFILE(INFILE,OUTFILE);VAR INFILE,OUTFILE:FILE OF CHAR;CH:CHAR;BEGIN RESET(INFILE);REWRITE(OUTFILE);WHILE NOT EOF(INFILE)DO BEGIN WHILE NOT EOLN(INFILE)DO BEGIN CH:=INFILE^;WRITE(OUTFILE,CH);GET(INFILE);END;WRITELN(OUTFILE);READLN(INFILE);END;CLOSE(OUTFILE);END.`,
      purpose: 'TANGLE 风格：通过 PROGRAM 头声明文件参数，逐字符复制',
      files: new Map<string, Uint8Array>([
        ['INFILE', text('LINE1\nLINE2\n')],
        ['OUTFILE', new Uint8Array(0)],
      ]),
      programFileUrls: { INFILE: 'INFILE', OUTFILE: 'OUTFILE' },
      expectedFileContains: [{ url: 'OUTFILE', contains: 'LINE1' }],
    },

    // ==========================================================================
    // ASSIGN 显式调用
    // ==========================================================================

    {
      name: 'ASSIGN + RESET + READ',
      code:
        `PROGRAM TANGLE;VAR F:FILE OF CHAR;N:INTEGER;BEGIN ASSIGN(F,'DATA.TXT');RESET(F);READ(F,N);WRITELN(N*2);END.`,
      purpose: 'ASSIGN 显式绑定文件名，再 RESET + READ',
      files: new Map<string, Uint8Array>([['DATA.TXT', text('21')]]),
      expectedContains: '42',
    },

    // ==========================================================================
    // PUT：写入缓冲区（简化为 no-op，但仍要能正确执行不报错）
    // ==========================================================================

    {
      name: 'PUT 调用不报错',
      code:
        `PROGRAM TANGLE;VAR F:FILE OF CHAR;BEGIN ASSIGN(F,'OUT.TXT');REWRITE(F);PUT(F);WRITELN(F,'AFTER PUT');CLOSE(F);END.`,
      purpose: 'PUT 在简化实现中是 no-op，但要能正确执行',
      files: new Map<string, Uint8Array>([['OUT.TXT', new Uint8Array(0)]]),
      expectedFileContains: [{ url: 'OUT.TXT', contains: 'AFTER PUT' }],
    },

    // ==========================================================================
    // ISSUE-034 复现：READ 对 char 类型不应跳过空白（ISO 7185 §14.4.4）
    // 标准：READ(F, c) 当 c 是 char 时，读取当前字符（含空格），不跳过空白
    // ==============================================================================

    {
      name: 'ISSUE-034: READ char 读取首个字符（非空白）',
      code: `PROGRAM TANGLE;VAR F:FILE OF CHAR;C:CHAR;BEGIN ASSIGN(F,'IN.TXT');RESET(F);READ(F,C);WRITELN(C);END.`,
      purpose: 'READ(F, C) 读 char：文件首字符为 A，应读到 A',
      files: new Map<string, Uint8Array>([['IN.TXT', text('AB')]]),
      expectedContains: 'A',
    },

    {
      name: 'ISSUE-034: READ char 不跳过空格（标准行为）',
      code: `PROGRAM TANGLE;VAR F:FILE OF CHAR;C:CHAR;BEGIN ASSIGN(F,'IN.TXT');RESET(F);READ(F,C);WRITELN(ORD(C));END.`,
      purpose: 'READ(F, C) 读 char：文件首字符为空格(ASCII 32)，标准要求读到空格而非跳过',
      files: new Map<string, Uint8Array>([['IN.TXT', text(' A')]]),
      expectedContains: '32',
    },

    {
      name: 'ISSUE-034: 连续 READ char 逐字读取',
      code:
        `PROGRAM TANGLE;VAR F:FILE OF CHAR;A,B,C:CHAR;BEGIN ASSIGN(F,'IN.TXT');RESET(F);READ(F,A,B,C);WRITELN(A,B,C);END.`,
      purpose: 'READ(F, A, B, C) 读三个 char：应逐字读取 "A B"（含中间空格）',
      files: new Map<string, Uint8Array>([['IN.TXT', text('A B')]]),
      expectedContains: 'A B',
    },
  ]

  runPascalTests(tests)
})
