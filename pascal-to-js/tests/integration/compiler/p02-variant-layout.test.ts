import { describe } from './_helper.ts'
import { type PascalTest, runPascalTests } from './_helper.ts'

// 变体 record 的运行时语义。
//
// 只断言 ISO 7185 可保证的部分（字段读写、下标换算、整体赋值、记录文件）。
// 分支之间的内存重叠方式、字节序，以及「写一个分支再从另一个分支读」属于
// 实现定义 / 错误用法，不在此文件断言；TeX 依赖的那类行为需要单独的扩展行为
// 测试目录来覆盖。

describe('Phase 2: variant record 运行时语义', () => {
  const tests: PascalTest[] = [
    {
      name: 'variant-runtime: 变体 record 的 int 分支读写',
      code: `program test;
type
  four_choices = 1..4;
  memory_word = record
    case four_choices of
      1: (int_field: integer);
      2: (gr: real);
      3: (mark: integer);
      4: (tag: integer)
  end;
var m: memory_word;
begin
  m.int_field := 42;
  writeln(m.int_field);
end.`,
      purpose: '无名变体 record 的 int 分支写入后应立即读到同一值',
      expectedContains: '42',
    },
    {
      name: 'variant-runtime: 过程内用变量下标写、外部用常量下标读',
      code: `program test;
type
  halfword = 0..65535;
  four_choices = 1..4;
  memory_word = record
    case four_choices of
      1: (int_field: integer);
      2: (gr: real);
      3: (mark: integer);
      4: (tag: integer)
  end;
var eqtb: array[1..10] of memory_word;
procedure word_define(p: halfword; w: integer);
begin
  eqtb[p].int_field := w
end;
begin
  word_define(5, 4);
  writeln(eqtb[5].int_field);
end.`,
      purpose: '「变量下标写 + 常量下标读」两条路径必须落在同一槽位',
      expectedContains: '4',
    },
    {
      name: 'variant-runtime: 常量下标写、变量下标读',
      code: `program test;
type
  halfword = 0..65535;
  four_choices = 1..4;
  memory_word = record
    case four_choices of
      1: (int_field: integer);
      2: (gr: real);
      3: (mark: integer);
      4: (tag: integer)
  end;
var eqtb: array[1..10] of memory_word;
    k: halfword;
begin
  eqtb[7].int_field := 1234;
  k := 7;
  writeln(eqtb[k].int_field);
end.`,
      purpose: '反方向：「常量下标写 + 变量下标读」',
      expectedContains: '1234',
    },
    {
      name: 'variant-runtime: 变体 record 数组元素整体赋值',
      code: `program test;
type
  four_choices = 1..4;
  memory_word = record
    case four_choices of
      1: (int_field: integer);
      2: (gr: real);
      3: (mark: integer);
      4: (tag: integer)
  end;
var eqtb: array[1..10] of memory_word;
begin
  eqtb[3].int_field := 555;
  eqtb[8] := eqtb[3];
  writeln(eqtb[8].int_field);
end.`,
      purpose: '变体 record 的整体（字节级）拷贝应保留字段值',
      expectedContains: '555',
    },
    {
      name: 'variant-runtime: file of 变体 record 的 dump/load',
      code: `program test(f);
type
  four_choices = 1..4;
  memory_word = record
    case four_choices of
      1: (int_field: integer);
      2: (gr: real);
      3: (mark: integer);
      4: (tag: integer)
  end;
var f: file of memory_word;
    m: memory_word;
begin
  rewrite(f);
  m.int_field := 42;
  f^ := m;
  put(f);
  reset(f);
  m := f^;
  writeln(m.int_field);
end.`,
      purpose: '记录文件按整条 record 写入/读出，变体字段值应保留',
      expectedContains: '42',
    },
  ]

  runPascalTests(tests)
})
