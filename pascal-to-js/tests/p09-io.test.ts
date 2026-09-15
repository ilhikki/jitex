// ISO/IEC 7185:1990 - 6.9 Input and output
//
// 章节概括：
//   规定应用于文本文件（textfile）的输入输出过程。read 的参数表语法可省略 file-variable，
//   此时作用于 required textfile input（程序须含拼写为 input 的程序参数）；并以 6.6.5.2 的前后断言方式
//   定义 read(f,v) 的语义，分别对 char（含子界）、integer（含子界）、real 及 string 类型变量规定
//   跳过空格与行结束符、可读 signed-integer / signed-number 的形式及错误条件。readln(f,v1,...,vn)
//   等价于 read 后接 readln(f)；readln(f) 等价于「while not eoln(^) do get(^); get(^)」，
//   把当前位置置于当前行末之后。write 的 write-parameter 有三种形式：`e`、`e:TotalWidth`、
//   `e:TotalWidth:FracDigits`，要求 TotalWidth 与 FracDigits 均 ≥1，并分别规定 char（默认宽度 1）、
//   integer（区分宽度是否容纳符号）、real（floating-point 与 fixed-point 两种表示的字符构成）、
//   Boolean（写 true/false 对应字符串）、string 类型的写出格式；writeln 终止部分行并写 end-of-line；
//   page 的效果为实现相关、必要时隐式 writeln、并使缓冲区变量 totally-undefined。
//
// 子章节：
//   6.9.1 The procedure read
//   6.9.2 The procedure readln
//   6.9.3 The procedure write
//     6.9.3.1 Write-parameters
//     6.9.3.2 Char-type
//     6.9.3.3 Integer-type
//     6.9.3.4 Real-type
//     6.9.3.5 Boolean-type
//     6.9.3.6 String-types
//   6.9.4 The procedure writeln
//   6.9.5 The procedure page

import { type PascalTest, runPascalTests } from './harness.ts'

function text(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

const tests: PascalTest[] = [
  {
    name: '6.9 writeln 无参数写出行结束符',
    code: `program test(output);
begin
  writeln;
end.`,
    purpose: 'ISO 6.9.4：Writeln(f) 终止（可能存在的）部分行，post-assertion 要求 f.L 追加 end-of-line',
    expectedOutput: '\n',
  },
  {
    name: '6.9 write 连续写出不换行',
    code: `program test(output);
begin
  write('hello');
  write('world');
end.`,
    purpose: 'ISO 6.9.3：write 只写字符序列，不写 end-of-line；字符写出默认宽度为分量数（6.9.3.6）',
    expectedOutput: 'helloworld',
  },
  {
    name: '6.9 write 后接 writeln 终止部分行',
    code: `program test(output);
begin
  write('Hello');
  writeln(' World');
  write('Good');
  writeln('bye');
end.`,
    purpose: 'ISO 6.9.3/6.9.4：write 累积到部分行，writeln 写出参数后再写 end-of-line',
    expectedOutput: 'Hello World\nGoodbye\n',
  },
  {
    name: '6.9 writeln 多参数按顺序写出',
    code: `program test(output);
begin
  writeln(1, 2, 3);
end.`,
    purpose:
      'ISO 6.9.3：write(f,p1,...,pn) 等价于依次 write(f,p1); write(f,p2,...)；integer 默认宽度为实现相关（E.10）',
    expectedOutput: '123\n',
  },
  {
    name: '6.9 write 写出 integer',
    code: `program test(output);
begin
  write(123);
end.`,
    purpose: 'ISO 6.9.3.3：写出 e 的十进制表示，不追加 end-of-line',
    expectedOutput: '123',
  },
  {
    name: '6.9 writeln 写出字符字符串',
    code: `program test(output);
begin
  writeln('hello world');
end.`,
    purpose: 'ISO 6.9.3.6：string-type 默认 TotalWidth = 分量数 n，写出全部 n 个字符',
    expectedOutput: 'hello world\n',
  },

  {
    name: '6.9.3.1 write 的 e:TotalWidth 与 e:TotalWidth:FracDigits 形式',
    code: `program test(output);
begin
  write(42:4);
  writeln;
  writeln(3.5:6:1);
end.`,
    purpose: 'ISO 6.9.3.1/6.9.3.3/6.9.3.4.2：42:4 因 4 ≥ IntDigits+1 写出 1 空格+符号空格+42；3.5:6:1 定点写出',
    expectedOutput: '  42\n   3.5\n',
  },

  {
    name: '6.9.3.2 char 字段宽度补前导空格',
    code: `program test(output);
var c: char;
begin
  c := 'A';
  write(c:5);
  writeln;
end.`,
    purpose: 'ISO 6.9.3.2：char 的表示为 (TotalWidth-1) 个空格后接该字符，故 c:5 写出 4 空格 + A',
    expectedOutput: '    A\n',
  },
  {
    name: '6.9.3.2 char 默认宽度为 1',
    code: `program test(output);
var c: char;
begin
  c := 'A';
  writeln(c);
  writeln(c:1);
end.`,
    purpose: 'ISO 6.9.3.2：char 的默认 TotalWidth 为 1，故 c 与 c:1 均只写 1 个字符、无前导空格',
    expectedOutput: 'A\nA\n',
  },

  {
    name: '6.9.3.3 integer 宽度足够补空格、宽度不足写全部字符',
    code: `program test(output);
var i: integer;
begin
  i := 42;
  write(i:6);
  write(i:3);
  write(i:1);
  writeln;
end.`,
    purpose:
      'ISO 6.9.3.3：42:6 → (6-2-1) 空格+符号空格+"42"；42:3 → 恰好容纳故无前导空格；42:1 → 宽度不足时只写符号与数字',
    expectedOutput: '    42 4242\n',
  },
  {
    name: '6.9.3.3 integer 负数的符号与字段宽度',
    code: `program test(output);
begin
  writeln(-42:6);
  writeln(-42:3);
  writeln(-42:1);
end.`,
    purpose: 'ISO 6.9.3.3：负数在宽度足够时写 (TotalWidth-IntDigits-1) 空格 + "-"；宽度不足时只写 "-" 与数字',
    expectedOutput: '   -42\n-42\n-42\n',
  },

  {
    name: '6.9.3.4.2 real 定点表示 :TotalWidth:FracDigits',
    code: `program test(output);
var r: real;
begin
  r := 3.14159;
  writeln(r:8:2);
end.`,
    purpose: 'ISO 6.9.3.4.2：3.14159 舍入到 2 位小数为 3.14，MinNumChars=4，TotalWidth 8 故补 4 个前导空格',
    expectedOutput: '    3.14\n',
  },
  {
    name: '6.9.3.4.2 real 定点表示宽度小于 MinNumChars 时不补前导空格',
    code: `program test(output);
var r: real;
begin
  r := 12.75;
  writeln(r:2:2);
end.`,
    purpose: 'ISO 6.9.3.4.2 NOTE：至少写出 MinNumChars 个字符；TotalWidth 小于该值时不写前导空格，故写出 12.75',
    expectedOutput: '12.75\n',
  },
  {
    name: '6.9.3.4.2 real 定点表示负数',
    code: `program test(output);
var r: real;
begin
  r := -3.5;
  writeln(r:7:1);
end.`,
    purpose: 'ISO 6.9.3.4.2：负数且舍入后非零时 MinNumChars 额外 +1 容纳 "-"，故 TotalWidth 7 时补 3 个前导空格',
    expectedOutput: '   -3.5\n',
  },
  {
    name: '6.9.3.4.2 real 定点表示按 FracDigits 舍入',
    code: `program test(output);
var r: real;
begin
  r := 2.56;
  writeln(r:6:1);
end.`,
    purpose: 'ISO 6.9.3.4.2：2.56 + 0.5*10^-1 = 2.61 后截断到 1 位小数得 2.6，MinNumChars=3，TotalWidth 6 补 3 个空格',
    expectedOutput: '   2.6\n',
  },
  {
    name: '6.9.3.4.1 real 单参写出浮点表示',
    code: `program test(output);
var r: real;
begin
  r := 12.5;
  writeln(r:20);
end.`,
    purpose:
      'ISO 6.9.3.4.1：Write(f,e:TotalWidth) 写浮点表示，尾数为 1.25…；ExpDigits（E.13）、指数字符 e/E（E.14）均为实现相关，故只断言 ISO 确定的尾数前缀 ".25"',
    expectedContains: '.25',
  },

  {
    name: '6.9.3.5 boolean 写出 true 的词形',
    code: `program test(output);
begin
  writeln(true);
end.`,
    purpose:
      'ISO 6.9.3.5：Boolean 写出 true 对应的字符串；每个字母的大小写为实现相关（Annex E.15），故仅断言与大小写无关的 "RUE" 与换行',
    expectedContains: 'RUE\n',
  },
  {
    name: '6.9.3.5 boolean 写出 false 的词形',
    code: `program test(output);
begin
  writeln(false);
end.`,
    purpose:
      'ISO 6.9.3.5：Boolean 写出 false 对应的字符串；字母大小写实现相关（Annex E.15），故仅断言与大小写无关的 "ALSE" 与换行',
    expectedContains: 'ALSE\n',
  },
  {
    name: '6.9 read 整数后 eoln 为真并写出',
    code: `program test(input, output);
var n: integer;
begin
  read(n);
  writeln(eoln);
end.`,
    purpose:
      'ISO 6.9.1c：read(f,v) 读出整数后 f.R 停在行结束符之前，故 eoln 为真；其布尔值按 6.9.3.5 写出（大小写实现相关）',
    input: '7\n',
    expectedContains: 'RUE\n',
  },

  {
    name: '6.9.3.6 string 默认宽度等于分量数',
    code: `program test(output);
var s: packed array [1..5] of char;
begin
  s := 'abcde';
  writeln(s);
  writeln('test');
end.`,
    purpose:
      'ISO 6.9.3.6：string-type 默认 TotalWidth = 分量数 n，写出全部 n 个字符；packed array[1..5] of char 属 string-type（6.4.3.2）',
    expectedOutput: 'abcde\ntest\n',
  },
  {
    name: '6.9.3.6 string 字段宽度：超出时左补空格、不足时截断',
    code: `program test(output);
begin
  writeln('hello':8);
  writeln('hello':3);
end.`,
    purpose:
      'ISO 6.9.3.6：TotalWidth > n 时写 (TotalWidth-n) 个空格加全部字符；1 ≤ TotalWidth ≤ n 时只写前 TotalWidth 个字符',
    expectedOutput: '   hello\nhel\n',
  },

  {
    name: '6.9.1 read char 不跳过前导空格',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;C:CHAR;BEGIN RESET(F);READ(F,C);WRITELN(C);END.`,
    purpose: 'ISO 6.9.1b：read(f,v) 对 char 等价于 v := f↑; get(f)，不跳过空格，故文件首字符为空格时读出空格',
    textFiles: new Map<string, Uint8Array>([['F', text(' A')]]),
    expectedOutput: ' \n',
  },
  {
    name: '6.9.1 read char 逐字符读取（含中间空格）',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;A,B,C:CHAR;BEGIN RESET(F);READ(F,A,B,C);WRITELN(A,B,C);END.`,
    purpose: 'ISO 6.9.1b：read(f,v1,...,vn) 等价于依次 read(f,vi)，char 不跳过任何字符，故逐字读出 "A B"',
    textFiles: new Map<string, Uint8Array>([['F', text('A B')]]),
    expectedOutput: 'A B\n',
  },
  {
    name: '6.9.1 read char 读出文件首字符',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;C:CHAR;BEGIN RESET(F);READ(F,C);WRITELN(C);END.`,
    purpose: 'ISO 6.9.1b：read(f,c) 取缓冲区变量当前字符并 get 推进，故读出首字符 A',
    textFiles: new Map<string, Uint8Array>([['F', text('AB')]]),
    expectedOutput: 'A\n',
  },
  {
    name: '6.9.1 read 整数跳过空格与行结束符',
    code: `program test(input, output);
var a, b: integer;
begin
  read(a);
  read(b);
  writeln(a:1, ' ', b:1);
end.`,
    purpose: 'ISO 6.9.1c NOTE 3：r 表示被跳过的空格与 end-of-line；读取整数可跨行，故 "10\\n20" 读出 10 与 20',
    input: '10\n20',
    expectedOutput: '10 20\n',
  },
  {
    name: '6.9.1 read 整数从文本文件读出',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;N:INTEGER;BEGIN RESET(F);READ(F,N);WRITELN('N=',N);END.`,
    purpose: 'ISO 6.9.1c：read(f,v) 跳过前导空格/行结束符后读 signed-integer 并赋予 v',
    textFiles: new Map<string, Uint8Array>([['F', text('42')]]),
    expectedOutput: 'N=42\n',
  },
  {
    name: '6.9.1 read 连续读出多个整数',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;A,B:INTEGER;BEGIN RESET(F);READ(F,A,B);WRITELN('A=',A,' B=',B);END.`,
    purpose: 'ISO 6.9.1a/c：read(f,A,B) 等价于 read(f,A); read(f,B)，空格作为 r 被跳过',
    textFiles: new Map<string, Uint8Array>([['F', text('10 20')]]),
    expectedOutput: 'A=10 B=20\n',
  },
  {
    name: '6.9.1 read real 从文本读出',
    code: `program test(input, output);
var r: real;
begin
  read(r);
  writeln(r:8:2);
end.`,
    purpose: 'ISO 6.9.1d：read(f,v) 对 real 读 signed-number 并赋予 v；用 6.9.3.4.2 定点形式断言读得的值',
    input: '3.25',
    expectedOutput: '    3.25\n',
  },

  {
    name: '6.9.2 readln 逐行读取整数',
    code: `program test(input, output);
var a, b: integer;
begin
  readln(a);
  readln(b);
  writeln(a:1, ' ', b:1);
end.`,
    purpose: 'ISO 6.9.2：readln(f,v) 等价于 read(f,v); readln(f)，每次读完一行并定位到下一行行首',
    input: '10\n20',
    expectedOutput: '10 20\n',
  },
  {
    name: '6.9.2 readln 多值等价 read 后接 readln（跨行 real）',
    code: `program test(input, output);
var i: integer;
    r: real;
begin
  readln(i, r);
  writeln(i:1);
  writeln(r:8:2);
end.`,
    purpose:
      'ISO 6.9.2/6.9.1d：readln(f,i,r) 等价于 read(f,i); read(f,r); readln(f)，integer 后的行结束符被 real 读取跳过',
    input: '10\n3.14',
    expectedOutput: '10\n    3.14\n',
  },
  {
    name: '6.9.2 readln 无参数跳过当前行',
    code: `program test(input, output);
var c: char;
begin
  readln;
  read(c);
  writeln(c);
end.`,
    purpose: 'ISO 6.9.2：readln(f) 等价于「while not eoln(^) do get(^); get(^)」，把位置放到当前行末之后',
    input: 'abc\nX',
    expectedOutput: 'X\n',
  },
  {
    name: '6.9.2 readln(f) 定位到下一行行首',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;CH:CHAR;BEGIN RESET(F);READLN(F);CH:=F^;WRITE(CH);WRITELN;END.`,
    purpose: 'ISO 6.9.2 NOTE 1：readln 把当前文件位置放到当前行末之后，故缓冲区变量为下一行首字符 L',
    textFiles: new Map<string, Uint8Array>([['F', text('LINE1\nLINE2\n')]]),
    expectedOutput: 'L\n',
  },

  {
    name: '6.9.4 writeln(f) 写出参数并追加行结束符',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN REWRITE(F);WRITELN(F,'HELLO');END.`,
    purpose: 'ISO 6.9.4：writeln(f,p) 等价于 write(f,p); writeln(f)，故文件内容为 HELLO 加 end-of-line',
    textFiles: new Map<string, Uint8Array>([['F', text('')]]),
    expectedFileContains: [{ url: 'F', contains: 'HELLO\n' }],
  },
  {
    name: '6.9.3 write(f) 写多个参数',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN REWRITE(F);WRITE(F,'N=',42);WRITELN(F);END.`,
    purpose: 'ISO 6.9.3：write(f,p1,p2) 等价于 write(f,p1); write(f,p2)，分别写字符字符串与 integer',
    textFiles: new Map<string, Uint8Array>([['F', text('')]]),
    expectedFileContains: [{ url: 'F', contains: 'N=42\n' }],
  },
  {
    name: '6.9.3.3 write 带字段宽度写入文件',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN REWRITE(F);WRITELN(F,'l.',5:1,')');END.`,
    purpose: 'ISO 6.9.3.1/6.9.3.3：5:1 因 1 < IntDigits+1 只写数字 5，故文件内容为 "l.5)" 加 end-of-line',
    textFiles: new Map<string, Uint8Array>([['F', text('')]]),
    expectedFileContains: [{ url: 'F', contains: 'l.5)\n' }],
  },
  {
    name: '6.9.3 write 应用于 Inspection 模式文本文件为错误',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);WRITELN(F,'X');END.`,
    purpose: 'ISO 6.9.3：write 应用于文本文件时，若 f 未定义或 f.M = Inspection 则为错误；reset 后文件处于 Inspection',
    textFiles: new Map<string, Uint8Array>([['F', text('')]]),
    expectedError: 'generation',
  },
  {
    name: '6.9 逐行字符读写往返（read/write 与 eoln/eof 交互）',
    code: `program test(f);
var f: text;
    s: char;
begin
  rewrite(f);
  writeln(f, 'Hello');
  writeln(f, 'World');
  reset(f);
  while not eof(f) do
    begin
      while not eoln(f) do
        begin
          read(f, s);
          write(s);
        end;
      readln(f);
      writeln;
    end;
end.`,
    purpose:
      'ISO 6.9.1b/6.9.2/6.9.4：逐字符 read(f,s)+write(s) 复制，eoln 控制行内循环、eof 控制行循环，readln 换行后 writeln 输出 end-of-line',
    expectedOutput: 'Hello\nWorld\n',
  },

  {
    name: '6.9.5 page 在行末未写 end-of-line 时隐式 writeln',
    code: `program test(output);
begin
  write('abc');
  page;
  writeln('X');
end.`,
    purpose:
      'ISO 6.9.5：若 f.L 非空且 f.L.last 不是 end-of-line，page(f) 须隐式执行 writeln(f)，故其后应出现 abc 与行结束符',
    expectedContains: 'abc\n',
  },
  {
    name: '6.9.5 page 应用于生成模式文本文件',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN REWRITE(F);WRITELN(F,'first');PAGE(F);WRITELN(F,'second');END.`,
    purpose: 'ISO 6.9.5：page(f) 的换页效果实现相关（E.16），但不得破坏已写内容与后续写出，故两行文本均应保留',
    textFiles: new Map<string, Uint8Array>([['F', text('')]]),
    expectedFileContains: [{ url: 'F', contains: 'first' }, { url: 'F', contains: 'second' }],
  },

  {
    name: '6.6 file 作 record 字段时的 rewrite/write/reset',
    code: `program test(output);
type r = record f: file of char end;
var x: r;
begin
  rewrite(x.f);
  write(x.f, 'A');
  reset(x.f);
end.`,
    purpose: 'ISO 6.4.3.3 / 6.6.5.2：record 的 file 字段是 variable-access，可作 rewrite/write/reset 的实参',
  },
  {
    name: '6.6 file 作 record 字段并带 file-name 的 reset',
    code: `program test(output);
type r = record f: file of char end;
var x: r;
begin
  reset(x.f, 'F');
  write('OK');
end.`,
    purpose: '非标 reset(f, name)：file-name 绑定对 record 内 file 字段同样适用',
    textFiles: new Map<string, Uint8Array>([['F', new Uint8Array([0x5a])]]),
    expectedContains: 'OK',
  },
  {
    name: '6.6 file 作数组元素时的 rewrite/write/reset',
    code: `program test(output);
var a: array[1..2] of file of char;
begin
  rewrite(a[1]);
  write(a[1], 'X');
  reset(a[1]);
end.`,
    purpose: 'ISO 6.4.3.2 / 6.6.5.2：file 元素是 variable-access，可作 rewrite/write/reset 的实参',
  },
  {
    name: '6.6 file 作变量参数后在过程内 reset',
    code: `program test(output);
var f: file of char;
procedure p(var g: file of char);
begin
  rewrite(g);
  write(g, 'Q');
  reset(g);
end;
begin
  p(f);
end.`,
    purpose: 'ISO 6.6.3.3 / 6.6.5.2：file 类型的变量参数在过程内可 rewrite/write/reset',
  },
  {
    name: '6.6 file 作二维数组元素（缩写与全形式）',
    code: `program test(output);
var a: array[1..2, 1..2] of file of char;
begin
  rewrite(a[1, 1]);
  write(a[1, 1], 'X');
  reset(a[1, 1]);
  rewrite(a[2][2]);
  write(a[2][2], 'Y');
  reset(a[2][2]);
end.`,
    purpose: 'ISO 6.4.3.2 / 6.6.5.2：多维数组的 file 元素（缩写与全形式等价）可作 rewrite/write/reset 的实参',
  },
  {
    name: '6.6 file 作嵌套 record 的字段',
    code: `program test(output);
type inner = record f: file of char; n: integer end;
     outer = record i: inner; k: char end;
var x: outer;
begin
  x.i.n := 1;
  rewrite(x.i.f);
  write(x.i.f, 'A');
  reset(x.i.f);
  write(x.i.n);
end.`,
    purpose: 'ISO 6.4.3.3 / 6.6.5.2：嵌套 record 里的 file 字段是 variable-access',
    expectedOutput: '1',
  },
  {
    name: '6.6 file 作 record 数组的字段',
    code: `program test(output);
type r = record f: file of char end;
var a: array[1..2] of r;
begin
  rewrite(a[2].f);
  write(a[2].f, 'B');
  reset(a[2].f);
end.`,
    purpose: 'ISO 6.4.3.2 / 6.4.3.3：数组元素的 record 字段（含 file）可作 rewrite/write/reset 的实参',
  },
  {
    name: '6.6 pointer 作 record 数组的字段',
    code: `program test(output);
type node = record v: integer; next: ^node end;
var a: array[1..2] of node;
begin
  new(a[1].next);
  a[1].next^.v := 7;
  write(a[1].next^.v);
  dispose(a[1].next);
end.`,
    purpose: 'ISO 6.4.3.2 / 6.4.4 / 6.6.5.3：数组元素的 record 中的 pointer 字段可 new/解引用/dispose',
    expectedOutput: '7',
  },
  {
    name: '6.6 函数的结果类型不得为 file 类型',
    code: `program test(output);
function f: file of char;
begin
end;
begin
  f;
end.`,
    purpose: 'ISO 6.6.2：function 的 result-type 必须是 simple-type 或 pointer-type；file 作结果类型应报错',
    expectedError: 'function',
  },
  {
    name: '6.9.2 readln 跳过以 CRLF 结束的整行',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;C:CHAR;BEGIN RESET(F);READLN(F);READ(F,C);WRITELN(C);END.`,
    purpose:
      'ISO 6.9.2：readln(f) 等价于 while not eoln(f) do get(f); get(f)，把位置置于当前行末之后；行结束符的具体字符由实现确定（Annex E）',
    textFiles: new Map<string, Uint8Array>([['F', text('AB\r\nCD')]]),
    expectedOutput: 'C\n',
  },
  {
    name: '6.9 空文本文件的 eoln 为真',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);IF EOLN(F)THEN WRITE('EOLN');END.`,
    purpose: 'ISO 6.6.6.5/6.9.5：eoln(f) 在 f.R 为空序列（即 eof(f) 为真）时亦为 true',
    textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
    expectedOutput: 'EOLN',
  },
  {
    name: '6.9.3 对 Inspection 模式的非文本文件 write 为错误',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:PACKED FILE OF 0..255;BEGIN RESET(F);WRITE(F,1);END.`,
    purpose: 'ISO 6.6.5.2/6.9.3：write 要求 f.M=Generation；reset 后文件处于 Inspection，此时 write(f,e) 为 error',
    textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
    expectedError: 'generation',
  },
  {
    name: '6.9.1 在 eof 处读取非文本文件为错误',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:PACKED FILE OF 0..255;B:0..255;BEGIN RESET(F);READ(F,B);END.`,
    purpose: 'ISO 6.9.1/6.6.5.2：read 的前断言要求 not eof(f)，f.R 为空序列时读取为 error',
    textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
    expectedError: '',
  },
  {
    name: '6.9.3.1 TotalWidth 小于 1 为错误',
    code: `program test(output);
begin
  write('abc':0);
end.`,
    purpose: 'ISO 6.9.3.1：write-parameter 的 TotalWidth 须大于 0，TotalWidth < 1 为 error',
    expectedError: 'width',
  },
  {
    name: '6.9.3 写空字符串不产生输出',
    code: `program test(output);
begin
  write('');
  writeln('X');
end.`,
    purpose: 'ISO 6.9.3.6：string-type 值的分量数为 0 时写出 0 个字符',
    expectedOutput: 'X\n',
  },
  {
    name: '6.9.5 page 在文件起始处不写隐式 writeln',
    code: `program test(output);
begin
  page;
  writeln('X');
end.`,
    purpose:
      'ISO 6.9.5：page(f) 仅在 f.L 非空且 f.L.last 不是 end-of-line 时才隐式 writeln(f)；文件起始处 f.L 为空，故不写行结束符',
    expectedOutput: '\fX\n',
  },
  {
    name: '6.9.3.1 write 的 TotalWidth 位置缺少表达式应报错',
    code: `program test(output);
begin
  write(1:);
end.`,
    purpose: 'ISO 6.9.3.1：write-parameter = expression [ : expression [ : expression ] ]',
    expectedError: '',
  },
  {
    name: '6.9.3 write 的实参表缺少右圆括号应报错',
    code: `program test(output);
begin
  write(1;
end.`,
    purpose: 'ISO 6.9.3：write 的 actual-parameter-list 以右圆括号结束',
    expectedError: '',
  },
  {
    name: '6.9.1 read 的实参可为变量参数',
    code: `program test(input, output);
var v: integer;
procedure rd(var x: integer);
begin
  read(x);
end;
begin
  rd(v);
  writeln(v);
end.`,
    purpose: 'ISO 6.9.1/6.6.3.3：read 的 v 须为变量，变量参数在其块内表示实参变量',
    input: '5',
    expectedOutput: '5\n',
  },
]

runPascalTests('ISO 7185 6.9 - Input and output', tests)
