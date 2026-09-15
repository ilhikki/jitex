// ISO/IEC 7185:1990 - 6.1 Lexical tokens
//
// 章节概括：
//   规定 Pascal 程序的词法记号（lexical token）如何由字符构成、以及记号之间如何分隔，
//   并声明本章语法与标准其余部分的语法规则不同。记号分为 special-symbols、identifiers、
//   directives、unsigned-numbers、labels、character-strings 六类；除字符-串内部外，
//   字母的大小写与字体对程序含义均无意义。给出 word-symbol（39 个）、identifier
//   （letter{letter|digit}，长度不限、不得与 word-symbol 同拼写）、directive（仅 forward）、
//   signed/unsigned-number（含 e 比例因子记法）、label（digit-sequence，0..9999）、
//   character-string 的语法与语义。注释（{ } 与 (* *)）与空格、换行构成 token separator：
//   由标识符/word-symbol/label/无符号数构成的相邻记号之间至少需要一个分隔符，记号内不得有分隔符。
//   对不支持参考字符集的处理器提供替代表示：@ 代 ^、( . 代 [、. ) 代 ]，其提供与否为 implementation-defined。
//
// 子章节：
//   6.1.1 General
//   6.1.2 Special-symbols
//   6.1.3 Identifiers
//   6.1.4 Directives
//   6.1.5 Numbers
//   6.1.6 Labels
//   6.1.7 Character-strings
//   6.1.8 Token separators
//   6.1.9 Lexical alternatives

import { type PascalTest, runPascalTests } from './harness.ts'

const tests: PascalTest[] = [
  // 6.1.1 General —— 字符-串之外，字母大小写对程序含义无影响
  {
    name: '6.1 关键字与标识符大小写不敏感',
    code: `PROGRAM P(output);
VAR Value: INTEGER;
BEGIN
  VALUE := 7;
  WRITELN(value);
END.`,
    purpose: '同一标识符的不同大小写拼写指向同一定义，关键字大小写任意',
    expectedOutput: '7\n',
  },

  // 6.1.2 Special-symbols —— 复合符号是单个记号
  {
    name: '6.1 复合符号 <> <= >= 是单个记号',
    code: `program p(output);
var b: integer;
begin
  b := 2;
  if (b >= 1) and (b <= 3) and (b <> 4) then writeln('ok');
end.`,
    purpose: '复合符号不被拆成两个单字符记号',
    expectedOutput: 'ok\n',
  },
  {
    name: '6.1 复合符号 := 与 .. 是单个记号',
    code: `program p(output);
type t = array[1..3] of integer;
var a: t;
begin
  a[2] := 5;
  writeln(a[2]);
end.`,
    purpose: '赋值号 := 与子界号 .. 被识别为单个记号',
    expectedOutput: '5\n',
  },

  // 6.1.3 Identifiers —— 任意长度，可由字母数字组成，不得与 word-symbol 同拼写
  {
    name: '6.1 标识符可以任意长度',
    code: `program p(output);
var InquireWorkstationIdentification: integer;
begin
  InquireWorkstationIdentification := 1;
  writeln(InquireWorkstationIdentification);
end.`,
    purpose: 'ISO 6.1.3 标识符长度不限',
    expectedOutput: '1\n',
  },
  {
    name: '6.1 标识符可由字母和数字组成',
    code: `program p(output);
var WG4: integer;
begin
  WG4 := 4;
  writeln(WG4);
end.`,
    purpose: '标识符 = letter { letter | digit }',
    expectedOutput: '4\n',
  },
  {
    name: '6.1 标识符不得与 word-symbol 同拼写',
    code: `program p;
var begin: integer;
begin
  begin := 1;
end.`,
    purpose: 'ISO 6.1.3 任何标识符不得与 word-symbol 拼写相同',
    expectedError: '',
  },
  {
    name: '6.1 标识符不得以数字开头',
    code: `program p;
var 1x: integer;
begin
end.`,
    purpose: '标识符必须以 letter 开头，digit-sequence 开头是数字记号',
    expectedError: '',
  },

  // 6.1.5 Numbers —— 十进制无符号整数 / 实数，e 为比例因子
  {
    name: '6.1 无符号整数是十进制表示',
    code: `program p(output);
begin
  writeln(123);
  writeln(0);
end.`,
    purpose: 'unsigned-integer 用十进制记号表示 integer 值',
    expectedOutput: '123\n0\n',
  },
  {
    name: '6.1 实数带小数点与小数部分',
    code: `program p(output);
begin
  writeln(trunc(1.5));
end.`,
    purpose: 'unsigned-real = digit-sequence . fractional-part',
    expectedOutput: '1\n',
  },
  {
    name: '6.1 实数可不带小数点直接用 e 比例因子',
    code: `program p(output);
begin
  writeln(trunc(5e3));
end.`,
    purpose: 'ISO 6.1.5：unsigned-real 的第二种形式 digit-sequence e scale-factor，e 表示乘以十的若干次幂',
    expectedOutput: '5000\n',
  },
  {
    name: '6.1 实数的 e 比例因子可带负号',
    code: `program p(output);
begin
  writeln(trunc(5.0e-1 * 10));
end.`,
    purpose: 'ISO 6.1.5：scale-factor = [ sign ] digit-sequence',
    expectedOutput: '5\n',
  },
  {
    name: '6.1 实数的 E 比例因子（大写，带正号）',
    code: `program p(output);
begin
  writeln(trunc(1.0E+3));
end.`,
    purpose: 'scale-factor = [ sign ] digit-sequence，字母大小写不敏感',
    expectedOutput: '1000\n',
  },
  {
    name: '6.1 带符号数是带符号的数记号',
    code: `program p(output);
begin
  writeln(+100);
  writeln(-100);
end.`,
    purpose: 'sign 可以是 + 或 -',
    expectedOutput: '100\n-100\n',
  },

  // 6.1.8 Token separators —— 相邻的标识符/word-symbol/label/无符号数之间至少一个分隔符
  {
    name: '6.1 相邻的整数与标识符之间必须有分隔符',
    code: `program p;
var x: integer;
begin
  x := 1x;
end.`,
    purpose: '无符号数与标识符相邻且无分隔符，不属于任何合法记号序列',
    expectedError: '',
  },

  // 6.1.6 Labels —— digit-sequence，取值闭区间 0..9999
  {
    name: '6.1 标签取值为 9999 时合法',
    code: `program p(output);
label 9999;
begin
  goto 9999;
9999:
  writeln('ok');
end.`,
    purpose: 'ISO 6.1.6 标签取值范围 0..9999，上界合法',
    expectedOutput: 'ok\n',
  },
  {
    name: '6.1 标签超出 9999 不合法',
    code: `program p(output);
label 10000;
begin
  writeln(1);
end.`,
    purpose: 'ISO 6.1.6 标签必须在闭区间 0..9999 内',
    expectedError: '',
  },

  // 6.1.7 Character-strings —— 单元素表示 char，多元素表示 string
  {
    name: '6.1 单元素 character-string 表示 char 值',
    code: `program p(output);
var c: char;
begin
  c := 'A';
  writeln(c);
end.`,
    purpose: '含单个 string-element 的字符-串表示 char-type 的值',
    expectedOutput: 'A\n',
  },
  {
    name: '6.1 连续两个引号表示一个引号字符',
    code: `program p(output);
begin
  writeln('''');
end.`,
    purpose: "apostrophe-image = '' 表示一个引号字符",
    expectedOutput: "'\n",
  },
  {
    name: '6.1 多元素 character-string 表示 string 值',
    code: `program p(output);
begin
  writeln('Pascal');
end.`,
    purpose: '含多个 string-element 的字符-串表示分量数相同的 string-type 值',
    expectedOutput: 'Pascal\n',
  },
  {
    name: '6.1 字符-串的大小写不被忽略',
    code: `program p(output);
var c: char;
begin
  c := 'a';
  if c = 'A' then writeln('same') else writeln('diff');
end.`,
    purpose: '字母大小写不敏感仅适用于字符-串之外，串内区分大小写',
    expectedOutput: 'diff\n',
  },

  // 6.1.8 Token separators —— 注释
  {
    name: '6.1 花括号注释',
    code: `program p(output);
{a comment}
begin
  writeln(1); {trailing}
end.`,
    purpose: 'f g 括起的 commentary 构成注释',
    expectedOutput: '1\n',
  },
  {
    name: '6.1 圆括号星号注释',
    code: `program p(output);
(* a comment *)
begin
  writeln(2);
end.`,
    purpose: '(* *) 是注释的另一种参考表示',
    expectedOutput: '2\n',
  },
  {
    name: '6.1 注释可以跨行',
    code: `program p(output);
{
  line 1
  line 2
}
begin
  writeln(3);
end.`,
    purpose: 'commentary 可以包含换行',
    expectedOutput: '3\n',
  },
  {
    name: '6.1 注释充当记号分隔符',
    code: `program p(output);
var a: integer;
begin
  a{ }:= 1;
  writeln(a);
end.`,
    purpose: '注释、空格、换行都算 token separator',
    expectedOutput: '1\n',
  },
  {
    name: '6.1 花括号注释可以星号右括号结尾',
    code: `program p(output);
{ comment ends with *)
begin
  writeln(4);
end.`,
    purpose: 'ISO 6.1.8 NOTE 1：注释可以以 { 开始、以 *) 结束',
    expectedOutput: '4\n',
  },
  {
    name: '6.1 注释不可嵌套',
    code: `program p(output);
begin
  { outer { inner } writeln(1); }
end.`,
    purpose: '注释在遇到的第一个右定界符处结束，不会嵌套',
    expectedError: '',
  },
  {
    name: '6.1 圆括号星号注释可以右花括号结尾',
    code: `program p(output);
(* comment ends with }
begin
  writeln(5);
end.`,
    purpose: 'ISO 6.1.8：注释以 (* 开始时可被 } 结束，两种结束定界符都能终止注释',
    expectedOutput: '5\n',
  },
  {
    name: '6.1 注释正文以 $ 开头仍是注释',
    code: `program p(output);
{$commentary}
begin
  writeln(6);
end.`,
    purpose: 'ISO 6.1.8：commentary 是任意字符序列，正文内容不影响注释的识别与跳过',
    expectedOutput: '6\n',
  },
  {
    name: '6.1 十六进制记号（非 ISO 记号）不可用',
    code: `program p(output);
begin
  writeln($1A);
end.`,
    purpose:
      'ISO 6.1.5 的 number 只由十进制 digit-sequence 构成，$ 前缀记号不属 ISO 记号；本实现虽能扫出该记号，但其应用不可用（以错误终止）',
    expectedError: '',
  },
  {
    name: '6.1 字符码记号的扫描（非 ISO 记号）',
    code: `program p(output);
begin
  write(#65);
  writeln(#$41);
end.`,
    purpose: "ISO 6.1.6 的字符记号只有 'c' 一种形式，# 前缀的字符码不属 ISO 记号；本实现无条件接受（扩展）",
    expectedOutput: 'AA\n',
  },
  {
    name: '6.7.2.2 双等号比较（非 ISO 记号）不构成关系运算',
    code: `program p(output);
begin
  if 1 == 1 then writeln('eq') else writeln('ne');
end.`,
    purpose:
      'ISO 6.7.2.2 的关系运算符只有 =、<>、<、>、<=、>=、in；== 不属 ISO 记号，其应用不产生 Boolean 结果（以错误终止）',
    expectedError: '',
  },
]

runPascalTests('ISO 7185 6.1 - Lexical tokens', tests)
