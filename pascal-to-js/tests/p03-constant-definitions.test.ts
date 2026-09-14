// ISO/IEC 7185:1990 - 6.3 Constant-definitions
//
// 章节概括：
//   constant-definition 引入一个标识符来表示一个值，语法为
//   constant-definition = identifier '=' constant，其中 constant 可为带符号的 unsigned-number、
//   constant-identifier，或一个 character-string。规定该标识符在块的 constant-definition-part 中的
//   出现构成其定义点，region 为整个块；constant 中不得包含该标识符自身的应用出现；该标识符的
//   每个应用出现均为 constant-identifier，并表示 constant 所表示的值。若 constant 中含符号，
//   则该 constant-identifier 必须已定义为表示 real 或 integer 类型的值。
//   required constant-identifiers 见 6.4.2.2 与 6.7.2.2。
//
// 子章节：
//   （无下级子章节）

import { type PascalTest, runPascalTests } from './harness.ts'

const tests: PascalTest[] = [
  // constant 的三种形式：signed-number、constant-identifier、character-string
  {
    name: '6.3 整数常量',
    code: `program p(output);
const N = 42;
begin
  writeln(N);
end.`,
    purpose: 'constant 为 unsigned-number 时表示 integer 值',
    expectedOutput: '42\n',
  },
  {
    name: '6.3 带符号的整数常量',
    code: `program p(output);
const N = -5;
begin
  writeln(N);
end.`,
    purpose: 'constant 可以是带符号的 signed-integer',
    expectedOutput: '-5\n',
  },
  {
    name: '6.3 实数常量',
    code: `program p(output);
const R = 2.5;
begin
  writeln(round(R * 2));
end.`,
    purpose: 'constant 为 unsigned-real 时表示 real 值（real 输出格式由实现定义，故转为整数比较）',
    expectedOutput: '5\n',
  },
  {
    name: '6.3 字符常量',
    code: `program p(output);
const C = 'A';
begin
  writeln(C);
end.`,
    purpose: 'constant 为单元素 character-string 时表示 char 值',
    expectedOutput: 'A\n',
  },
  {
    name: '6.3 多元素字符常量',
    code: `program p(output);
const S = 'abc';
begin
  writeln(S);
end.`,
    purpose: 'constant 为多元素 character-string 时表示 string 值，可作为 write 参数',
    expectedOutput: 'abc\n',
  },
  {
    name: '6.3 常量引用已定义的常量',
    code: `program p(output);
const A = 10;
      B = A;
begin
  writeln(B);
end.`,
    purpose: 'constant 可以是 constant-identifier，表示其所表示的同一个值',
    expectedOutput: '10\n',
  },

  // 常量的应用：数组边界、case 标签
  {
    name: '6.3 常量用作数组下标类型的上界',
    code: `program p(output);
const N = 5;
type T = array[1..N] of integer;
var a: T;
begin
  a[N] := 9;
  writeln(a[5]);
end.`,
    purpose: 'constant-identifier 可作为 index-type 的子界边界',
    expectedOutput: '9\n',
  },
  {
    name: '6.3 常量用作 case 标签',
    code: `program p(output);
const A = 1;
var x: integer;
begin
  x := 1;
  case x of
    A: writeln('one');
  end;
end.`,
    purpose: 'case-constant 可以是 constant-identifier',
    expectedOutput: 'one\n',
  },

  // 反向：constant 的合法形式限制
  {
    name: '6.3 常量不得是表达式',
    code: `program p(output);
const N = 1 + 2;
begin
  writeln(N);
end.`,
    purpose: 'ISO 6.3：constant 只能是带符号的数、constant-identifier 或 character-string，不含表达式',
    expectedError: '',
  },
  {
    name: '6.3 常量不得引用自身',
    code: `program p(output);
const A = A;
begin
  writeln(A);
end.`,
    purpose: 'ISO 6.3：constant 中不得包含该标识符自身的应用出现',
    expectedError: '',
  },
  {
    name: '6.3 带符号常量必须表示 integer 或 real',
    code: `program p(output);
const C = 'a';
      D = -C;
begin
  writeln(D);
end.`,
    purpose: 'ISO 6.3：若 constant 中含符号，则该 constant-identifier 必须已定义为表示 integer 或 real 的值',
    expectedError: '',
  },
]

runPascalTests('ISO 7185 6.3 - Constant-definitions', tests)
