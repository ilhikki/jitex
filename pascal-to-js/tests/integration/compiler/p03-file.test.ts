// 测试 VM 内存文件模型（异步）
// 代码风格模仿 TANGLE.WEB 输出的 Pascal：紧凑、大写、TEXTFILE = PACKED FILE OF CHAR
// 这些用例覆盖 RESET/REWRITE/GET/PUT/EOF/EOLN/READ/READLN/WRITE/WRITELN/F^/ASSIGN（ASSIGN 已去除，改用 PROGRAM 参数）

import { describe } from './_helper.ts'
import { type PascalTest, runPascalTests } from './_helper.ts'

function text(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

describe('M5 JS - File Model (async) — ISO 7185 compliant', () => {
  const tests: PascalTest[] = [
    // ==========================================================================
    // REWRITE + WRITE/WRITELN：写入到内存文件
    // ==========================================================================

    {
      name: 'REWRITE + WRITELN 写入单行',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN REWRITE(F);WRITELN(F,'HELLO');END.`,
      purpose: 'REWRITE + WRITELN 写入到内存文件，无 ASSIGN/CLOSE',
      files: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
      expectedFileContains: [{ url: 'F', contains: 'HELLO' }],
    },

    {
      name: 'REWRITE + WRITE 多个参数',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN REWRITE(F);WRITE(F,'N=',42);WRITELN(F);END.`,
      purpose: 'WRITE 多参数写入文件，最后 WRITELN 换行',
      files: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
      expectedFileContains: [{ url: 'F', contains: 'N=42' }],
    },

    {
      name: 'WRITELN with width 写入文件',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN REWRITE(F);WRITELN(F,'l.',5:1,')');END.`,
      purpose: 'TANGLE 风格：WRITELN(F, "l.", LINE:1, ")")',
      files: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
      expectedFileContains: [{ url: 'F', contains: 'l.5)' }],
    },

    // ==========================================================================
    // RESET + EOF：从内存文件读
    // ==========================================================================

    {
      name: 'RESET 空文件 EOF 立即为真',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);IF EOF(F)THEN WRITELN('EMPTY')ELSE WRITELN('NOT EMPTY');END.`,
      purpose: '空文件 RESET 后 EOF 为真',
      files: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
      expectedContains: 'EMPTY',
    },

    {
      name: 'RESET 非空文件 EOF 为假',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);IF EOF(F)THEN WRITELN('EMPTY')ELSE WRITELN('HAS DATA');END.`,
      purpose: '非空文件 RESET 后 EOF 为假',
      files: new Map<string, Uint8Array>([['F', text('hello')]]),
      expectedContains: 'HAS DATA',
    },

    // ==========================================================================
    // F^ + GET：逐字符读取（Knuth INPUTLN 风格）
    // ==========================================================================

    {
      name: 'F^ 读首字符 + GET 推进',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;CH:CHAR;BEGIN RESET(F);CH:=F^;WRITE(CH);GET(F);CH:=F^;WRITE(CH);WRITELN;END.`,
      purpose: 'F^ 读缓冲区字符，GET 推进 offset（tangle INPUTLN 风格）',
      files: new Map<string, Uint8Array>([['F', text('AB')]]),
      expectedContains: 'AB',
    },

    {
      name: 'INPUTLN 风格逐字符循环',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;CH:CHAR;BEGIN RESET(F);WHILE NOT EOLN(F)DO BEGIN CH:=F^;WRITE(CH);GET(F);END;WRITELN;END.`,
      purpose: 'WHILE NOT EOLN(F) DO BEGIN CH:=F^;WRITE(CH);GET(F) END',
      files: new Map<string, Uint8Array>([['F', text('HELLO\n')]]),
      expectedContains: 'HELLO',
    },

    // ==========================================================================
    // EOLN：行结束检测
    // ==========================================================================

    {
      name: 'EOLN 在行尾返回真',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);WHILE NOT EOLN(F)DO GET(F);IF EOLN(F)THEN WRITELN('AT EOLN');END.`,
      purpose: 'GET 推进到行尾时 EOLN 返回真',
      files: new Map<string, Uint8Array>([['F', text('AB\n')]]),
      expectedContains: 'AT EOLN',
    },

    {
      name: 'READLN 跳过当前行',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;CH:CHAR;BEGIN RESET(F);READLN(F);CH:=F^;WRITE(CH);WRITELN;END.`,
      purpose: 'READLN(F) 跳过当前行，下一行首字符可读',
      files: new Map<string, Uint8Array>([['F', text('LINE1\nLINE2\n')]]),
      expectedContains: 'L',
    },

    // ==========================================================================
    // READ/READLN 整数：从文件读数值
    // ==========================================================================

    {
      name: 'READ 从文件读整数',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;N:INTEGER;BEGIN RESET(F);READ(F,N);WRITELN('N=',N);END.`,
      purpose: 'READ(F, N) 从文本文件读整数',
      files: new Map<string, Uint8Array>([['F', text('42')]]),
      expectedContains: 'N=42',
    },

    {
      name: 'READ 多个整数',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;A,B:INTEGER;BEGIN RESET(F);READ(F,A,B);WRITELN('A=',A,' B=',B);END.`,
      purpose: 'READ(F, A, B) 连续读多个整数',
      files: new Map<string, Uint8Array>([['F', text('10 20')]]),
      expectedContains: 'A=10 B=20',
    },

    // ==========================================================================
    // 文件复制：经典 Pascal IO 用例
    // ==========================================================================

    {
      name: '文件复制：INFILE → OUTFILE',
      code: `PROGRAM COPYFILE(OUTPUT,INFILE,OUTFILE);VAR INFILE,OUTFILE:TEXT;CH:CHAR;BEGIN RESET(INFILE);REWRITE(OUTFILE);WHILE NOT EOF(INFILE)DO BEGIN WHILE NOT EOLN(INFILE)DO BEGIN CH:=INFILE^;WRITE(OUTFILE,CH);GET(INFILE);END;WRITELN(OUTFILE);READLN(INFILE);END;END.`,
      purpose: '通过 PROGRAM 头声明文件参数，逐字符复制',
      files: new Map<string, Uint8Array>([
        ['INFILE', text('LINE1\nLINE2\n')],
        ['OUTFILE', new Uint8Array(0)],
      ]),
      programFileUrls: { INFILE: 'INFILE', OUTFILE: 'OUTFILE' },
      expectedFileContains: [{ url: 'OUTFILE', contains: 'LINE1' }],
    },

    {
      name: '文件复制：无 programFileUrls，默认恒等映射（key === value）',
      code: `PROGRAM COPYFILE(OUTPUT,INFILE,OUTFILE);VAR INFILE,OUTFILE:TEXT;CH:CHAR;BEGIN RESET(INFILE);REWRITE(OUTFILE);WHILE NOT EOF(INFILE)DO BEGIN CH:=INFILE^;WRITE(OUTFILE,CH);GET(INFILE);END;END.`,
      purpose: '缺省 programFileUrls 时，程序文件参数名即 files 键名',
      files: new Map<string, Uint8Array>([
        ['INFILE', text('LINE1\nLINE2\n')],
        ['OUTFILE', new Uint8Array(0)],
      ]),
      expectedFileContains: [{ url: 'OUTFILE', contains: 'LINE1' }],
    },

    // ==========================================================================
    // 显式文件参数（无 ASSIGN）
    // ==========================================================================

    {
      name: '程序参数绑定 + RESET + READ',
      code: `PROGRAM TEST(OUTPUT,DATA);VAR DATA:TEXT;N:INTEGER;BEGIN RESET(DATA);READ(DATA,N);WRITELN(N*2);END.`,
      purpose: '通过程序参数绑定文件名，不再使用 ASSIGN',
      files: new Map<string, Uint8Array>([['DATA', text('21')]]),
      expectedContains: '42',
    },

    // ==========================================================================
    // PUT：写入缓冲区（简化 no‑op，但仍需正确执行）
    // ==========================================================================

    {
      name: 'PUT 调用不报错（文本文件）',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN REWRITE(F);PUT(F);WRITELN(F,'AFTER PUT');END.`,
      purpose: 'PUT 在简化实现中是 no‑op，但要能正确执行',
      files: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
      expectedFileContains: [{ url: 'F', contains: 'AFTER PUT' }],
    },

    // ==========================================================================
    // ISSUE-034 复现：READ 对 char 类型不应跳过空白（ISO 7185 §14.4.4）
    // ==========================================================================

    {
      name: 'ISSUE-034: READ char 读取首个字符（非空白）',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;C:CHAR;BEGIN RESET(F);READ(F,C);WRITELN(C);END.`,
      purpose: 'READ(F, C) 读 char：文件首字符为 A，应读到 A',
      files: new Map<string, Uint8Array>([['F', text('AB')]]),
      expectedContains: 'A',
    },

    {
      name: 'ISSUE-034: READ char 不跳过空格（标准行为）',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;C:CHAR;BEGIN RESET(F);READ(F,C);WRITELN(ORD(C));END.`,
      purpose: 'READ(F, C) 读 char：文件首字符为空格(ASCII 32)，标准要求读到空格',
      files: new Map<string, Uint8Array>([['F', text(' A')]]),
      expectedContains: '32',
    },

    {
      name: 'ISSUE-034: 连续 READ char 逐字读取',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;A,B,C:CHAR;BEGIN RESET(F);READ(F,A,B,C);WRITELN(A,B,C);END.`,
      purpose: 'READ(F, A, B, C) 读三个 char：应逐字读取 "A B"（含中间空格）',
      files: new Map<string, Uint8Array>([['F', text('A B')]]),
      expectedContains: 'A B',
    },
  ]

  runPascalTests(tests)
})