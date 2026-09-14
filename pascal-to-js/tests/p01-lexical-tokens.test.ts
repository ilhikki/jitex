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
//
// 状态：骨架文件，用例待从 tests/integration/ 迁移（迁移时仅改 name，内容不动）。

import { describe } from './harness.ts'
import { type PascalTest, runPascalTests } from './harness.ts'

describe('ISO 7185 6.1 - Lexical tokens', () => {
  const tests: PascalTest[] = []

  runPascalTests(tests)
})
