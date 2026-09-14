// ISO/IEC 7185:1990 - 6.5 Declarations and denotations of variables
//
// 章节概括：
//   规定变量（可被赋予值的实体）的声明与各种指称方式。variable-declaration 的语法为
//   variable-declaration = identifier-list ':' type-denoter；标识符出现构成 variable-identifier 的
//   定义点，region 为块，每个标识符表示一个具有相应类型的不同变量。variable-access 按其种类
//   （entire-variable、component-variable、identified-variable、buffer-variable）分别表示已声明变量、
//   变量的分量、由指针值标识的变量、缓冲区变量。component-variable 分为 indexed-variable
//   （索引表达式须与 index-type 赋值相容，m[k][1] 可缩写为 m[k,1]）与 field-designator
//   （变体分量仅在变体 active 期间可访问，非激活时其分量变 totally-undefined）。
//   identified-variable 由 pointer-variable 指称，nil 或未定义即出错，在存在引用时 dispose 为错误；
//   buffer-variable（file-variable^）与文件变量关联，文本文件的缓冲区为 char 类型。
//
// 子章节：
//   6.5.1 Variable-declarations
//   6.5.2 Entire-variables
//   6.5.3 Component-variables
//     6.5.3.1 General
//     6.5.3.2 Indexed-variables
//     6.5.3.3 Field-designators
//   6.5.4 Identified-variables
//   6.5.5 Buffer-variables

import { type PascalTest, runPascalTests } from './harness.ts'

function text(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

const tests: PascalTest[] = [
  // 6.5.1 Variable-declarations
  {
    name: '6.5.1 声明列表中的每个标识符表示一个不同的变量',
    code: `program p(output);
var a, b: integer;
begin
  a := 1;
  b := 2;
  writeln(a, b);
end.`,
    purpose: 'identifier-list 中的每个标识符各表示一个具有该类型的变量',
    expectedOutput: '12\n',
  },
  {
    name: '6.5.1 变量的类型由 type-denoter 决定',
    code: `program p(output);
var ch: char;
begin
  ch := 'x';
  writeln(ch);
end.`,
    purpose: '变量的类型即 variable-declaration 中 type-denoter 所表示的类型',
    expectedOutput: 'x\n',
  },

  // 6.5.2 Entire-variables
  {
    name: '6.5.2 整个变量作为变量访问',
    code: `program p(output);
var x: integer;
begin
  x := 5;
  x := x + 1;
  writeln(x);
end.`,
    purpose: 'entire-variable 表示所声明的那个变量，可读可写',
    expectedOutput: '6\n',
  },

  // 6.5.3.1 General —— 分量是变量
  {
    name: '6.5.3.1 数组分量是变量',
    code: `program p(output);
var a: array[1..3] of integer;
begin
  a[2] := 7;
  writeln(a[2]);
end.`,
    purpose: '数组的分量是变量，可作为赋值目标与读取对象',
    expectedOutput: '7\n',
  },
  {
    name: '6.5.3.1 记录字段是变量',
    code: `program p(output);
type r = record x: integer; end;
var v: r;
begin
  v.x := 9;
  writeln(v.x);
end.`,
    purpose: '记录的字段是变量',
    expectedOutput: '9\n',
  },
  {
    name: '6.5.3.1 分量的分量仍是变量',
    code: `program p(output);
type r = record a: array[1..2] of integer; end;
var v: r;
begin
  v.a[1] := 3;
  v.a[2] := 4;
  writeln(v.a[1] + v.a[2]);
end.`,
    purpose: '对分量的引用构成对该变量的引用，分量的分量同样可访问',
    expectedOutput: '7\n',
  },

  // 6.5.3.2 Indexed-variables
  {
    name: '6.5.3.2 索引表达式的值须与 index-type 赋值相容',
    code: `program p(output);
var a: array[1..3] of integer;
    i: integer;
begin
  i := 2;
  a[i] := 8;
  writeln(a[i]);
end.`,
    purpose: 'integer 与子界 1..3 赋值相容，可作为索引',
    expectedOutput: '8\n',
  },
  {
    name: '6.5.3.2 索引表达式类型不相容不合法',
    code: `program p;
var a: array[1..3] of integer;
    c: char;
begin
  a[c] := 1;
end.`,
    purpose: 'char 与子界 1..3 不相容，索引表达式非法（ISO 5.1 e 要求阻止执行）',
    expectedError: '',
  },
  {
    name: '6.5.3.2 缩写形式 a[i,j] 与全形式 a[i][j] 等价（写后缀读）',
    code: `program p(output);
var m: array[1..2, 1..2] of integer;
begin
  m[1, 2] := 4;
  writeln(m[1][2]);
end.`,
    purpose: 'ISO 6.5.3.2：缩写形式的单个逗号替换全形式中的 ][，两者等价',
    expectedOutput: '4\n',
  },
  {
    name: '6.5.3.2 缩写形式 a[i,j] 与全形式 a[i][j] 等价（写全后缀读）',
    code: `program p(output);
var m: array[1..2, 1..2] of integer;
begin
  m[2][1] := 5;
  writeln(m[2, 1]);
end.`,
    purpose: '全形式与缩写形式指称同一分量',
    expectedOutput: '5\n',
  },

  // 6.5.3.3 Field-designators
  {
    name: '6.5.3.3 字段指示符表示记录分量',
    code: `program p(output);
type
  person = record
    age: integer;
    name: char;
  end;
var p1: person;
begin
  p1.age := 30;
  p1.name := 'A';
  writeln(p1.age, p1.name);
end.`,
    purpose: 'field-designator 表示与 field-identifier 关联的那个分量',
    expectedOutput: '30A\n',
  },
  {
    name: '6.5.3.3 变体激活时可访问其分量',
    code: `program p(output);
type
  r = record
    case tag: integer of
      1: (i: integer);
      2: (c: char);
  end;
var v: r;
begin
  v.tag := 1;
  v.i := 42;
  writeln(v.i);
end.`,
    purpose: '带 tag-field 的变体部分，其分量在对应变体激活时可访问',
    expectedOutput: '42\n',
  },
  // 6.5.4 Identified-variables
  {
    name: '6.5.4 p^ 表示指针所指的变量',
    code: `program p(output);
type ip = ^integer;
var q: ip;
begin
  new(q);
  q^ := 42;
  writeln(q^);
end.`,
    purpose: 'identified-variable 表示由 pointer-variable 的值所标识的那个变量',
    expectedOutput: '42\n',
  },
  {
    name: '6.5.4 nil 指针解引用是错误',
    code: `program p(output);
type ip = ^integer;
var q: ip;
begin
  q := nil;
  writeln(q^);
end.`,
    purpose:
      'ISO 6.5.4：identified-variable 的 pointer-variable 表示 nil-value 时是 error（5.1 f 允许处理器文档化不上报）',
    expectedError: '',
  },
  {
    name: '6.5.4 未定义的指针变量解引用是错误',
    code: `program p(output);
type ip = ^integer;
var q: ip;
begin
  writeln(q^);
end.`,
    purpose: 'ISO 6.5.4：pointer-variable 未定义时是 error（ISO 6.2.3.5 规定变量在激活开始时处于 totally-undefined）',
    expectedError: '',
  },

  // 6.5.5 Buffer-variables
  {
    name: '6.5.5 文本文件的缓冲区变量具有 char 类型',
    code: `program p(input, output, f);
var c: char; f: text;
begin
  reset(f);
  c := f^;
  writeln(c);
end.`,
    purpose:
      'ISO 6.5.5：与 textfile 关联的 buffer-variable 具有 char 类型；6.6.5.2 的 reset 后置断言保证此时 f^ = f.R.first（原用例在 write 之后读 output^，因 put 的后置断言 f^ totally-undefined 而属 D.43 错误，期望值不可由 ISO 推出）',
    textFiles: new Map<string, Uint8Array>([['F', text('A')]]),
    programFileUrls: { f: 'F' },
    expectedOutput: 'A\n',
  },
]

runPascalTests('ISO 7185 6.5 - Declarations and denotations of variables', tests)
