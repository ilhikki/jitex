// ISO 7185 file of record 测试
//
// 依据：ISO 7185:1983
//   - 6.4.3.5 File-types
//     file-type = 'file' 'of' component-type
//     "The component-type shall not be real-type, and shall not be any type
//      whose values are components of a file-type."
//   - 6.6.5.2 File handling procedures (reset/get/put/rewrite)
//
// 测试目的：
//   - 验证 file of record 的读写（TeX 格式文件 word_file = file of memory_word 依赖此功能）
//   - 验证变体 record 的字段访问（fmt_file^.int, fmt_file^.qqqq 等）
//
// 测试原则（AGENTS.md 原则 A）：
//   - 正面测试：标准 ISO 用法，验证功能正常
//   - 反面测试：违反 ISO 约束的用法，应快速失败

import { describe, type PascalTest, runPascalTests } from './harness.ts'
import { MemoryRecordFile } from '@jitex/pascal-to-js'

describe('ISO 7185 file of record (6.4.3.5 / 6.6.5.2)', () => {
  const tests: PascalTest[] = [
    // ==========================================================================
    // file of record 基础读写
    // ==========================================================================

    {
      name: 'file of record: 正向 - 写入并读取简单记录',
      code:
        `program test(f); type rec = record x: integer; y: integer; end; var f: file of rec; r: rec; begin rewrite(f); r.x := 10; r.y := 20; f^ := r; put(f); reset(f); r := f^; write(r.x, ',', r.y); end.`,
      purpose: 'ISO 6.4.3.5/6.6.5.2 file of record: 写入记录后重置读取，验证记录字段',
      recordFiles: new Map([['f', new MemoryRecordFile()]]),
      expectedContains: '10,20',
    },
    {
      name: 'file of record: 正向 - 多条记录顺序读取',
      code:
        `program test(f); type rec = record x: integer; end; var f: file of rec; r1, r2: rec; begin rewrite(f); r1.x := 1; f^ := r1; put(f); r2.x := 2; f^ := r2; put(f); reset(f); r1 := f^; get(f); r2 := f^; write(r1.x + r2.x); end.`,
      purpose: 'ISO 6.6.5.2 file of record: 写入两条记录，顺序读取并求和',
      recordFiles: new Map([['f', new MemoryRecordFile()]]),
      expectedContains: '3',
    },
    {
      name: 'file of record: 正向 - 变体 record 字段访问 (int 视图)',
      code:
        `program test(f); type mw = record case integer of 1: (int: integer); 2: (b0, b1, b2, b3: 0..255); end; var f: file of mw; w: mw; begin rewrite(f); w.int := 42; f^ := w; put(f); reset(f); w := f^; write(w.int); end.`,
      purpose: 'ISO 6.4.2.3 变体 record: 通过 int 字段访问，模拟 TeX memory_word',
      recordFiles: new Map([['f', new MemoryRecordFile()]]),
      expectedContains: '42',
    },
    {
      name: 'file of record: 正向 - 变体 record 字段访问 (字节视图)',
      code:
        `program test(f); type mw = record case integer of 1: (int: integer); 2: (b0, b1, b2, b3: 0..255); end; var f: file of mw; w: mw; begin rewrite(f); w.b0 := 1; w.b1 := 2; w.b2 := 3; w.b3 := 4; f^ := w; put(f); reset(f); w := f^; write(w.b0, w.b1, w.b2, w.b3); end.`,
      purpose: 'ISO 6.4.2.3 变体 record: 通过字节字段访问，模拟 TeX four_quarters',
      recordFiles: new Map([['f', new MemoryRecordFile()]]),
      expectedContains: '1234',
    },

    // ==========================================================================
    // 字段级赋值（TeX dump_int 宏模式: f^.field := x; put(f)）
    // ==========================================================================

    {
      name: 'file of record: 正向 - 字段级赋值 f^.field := x (TeX dump 模式)',
      code:
        `program test(f); type rec = record x: integer; y: integer; end; var f: file of rec; begin rewrite(f); f^.x := 10; f^.y := 20; put(f); reset(f); write(f^.x, ',', f^.y); end.`,
      purpose: 'ISO 6.6.5.2: f^.field := x 修改缓冲区字段，put 写入。TeX dump_int/dump_hh 即此模式',
      recordFiles: new Map([['f', new MemoryRecordFile()]]),
      expectedContains: '10,20',
    },
    {
      name: 'file of record: 正向 - 多条字段级赋值顺序写入',
      code:
        `program test(f); type rec = record x: integer; end; var f: file of rec; begin rewrite(f); f^.x := 1; put(f); f^.x := 2; put(f); f^.x := 3; put(f); reset(f); write(f^.x); get(f); write(f^.x); get(f); write(f^.x); end.`,
      purpose: 'ISO 6.6.5.2: 多次 f^.field := x; put(f) 顺序写入，get 顺序读取',
      recordFiles: new Map([['f', new MemoryRecordFile()]]),
      expectedContains: '123',
    },
    {
      name: 'file of record: 正向 - 变体 record 字段级赋值 (int 视图，TeX dump_int)',
      code:
        `program test(f); type mw = record case integer of 1: (int: integer); 2: (b0, b1, b2, b3: 0..255); end; var f: file of mw; begin rewrite(f); f^.int := 42; put(f); reset(f); write(f^.int); end.`,
      purpose: 'ISO 6.4.2.3/6.6.5.2: f^.int := x (TeX dump_int 宏模式)',
      recordFiles: new Map([['f', new MemoryRecordFile()]]),
      expectedContains: '42',
    },
    {
      name: 'file of record: 正向 - 变体 record 字段级赋值 (字节视图，TeX dump_qqqq)',
      code:
        `program test(f); type mw = record case integer of 1: (int: integer); 2: (b0, b1, b2, b3: 0..255); end; var f: file of mw; begin rewrite(f); f^.b0 := 1; f^.b1 := 2; f^.b2 := 3; f^.b3 := 4; put(f); reset(f); write(f^.b0, f^.b1, f^.b2, f^.b3); end.`,
      purpose: 'ISO 6.4.2.3/6.6.5.2: f^.b0 := x 等 (TeX dump_qqqq 宏模式)',
      recordFiles: new Map([['f', new MemoryRecordFile()]]),
      expectedContains: '1234',
    },
    // ==========================================================================
    // f^ := x 的赋值语义（ISO 6.6.3.3 赋值 = 值拷贝）
    //
    // f^ 是 buffer-variable，`f^ := x` 是赋值语句：写入的是 x 的「值」。
    // 之后再修改 x，不得影响已写入缓冲区的内容。
    // ==========================================================================

    {
      name: 'file of record: 正向 - f^ := r 后再改 r，缓冲区不受影响',
      code:
        `program test(f); type rec = record x: integer; end; var f: file of rec; a, b: rec; begin rewrite(f); a.x := 1; f^ := a; a.x := 2; b := f^; write(b.x); end.`,
      purpose: 'ISO 6.6.3.3: f^ := a 是赋值（值语义），之后改 a 不得改变缓冲区 → 期望读到 1',
      recordFiles: new Map([['f', new MemoryRecordFile()]]),
      expectedContains: '1',
    },
    {
      name: 'file of record: 正向 - f^ := mem[k] 后再改 mem[k]，缓冲区不受影响',
      code:
        `program test(f); type rec = record x: integer; end; var f: file of rec; mem: array[1..3] of rec; b: rec; begin rewrite(f); mem[2].x := 1; f^ := mem[2]; mem[2].x := 2; b := f^; write(b.x); end.`,
      purpose: 'ISO 6.6.3.3: TeX dump_wd(mem[k]) 模式，数组元素是共享视图，赋值后改元素不得改变缓冲区 → 期望 1',
      recordFiles: new Map([['f', new MemoryRecordFile()]]),
      expectedContains: '1',
    },
    {
      name: 'file of record: 正向 - 写入后改写源，已写入的记录不受影响',
      code:
        `program test(f); type rec = record x: integer; end; var f: file of rec; mem: array[1..3] of rec; b: rec; begin rewrite(f); mem[1].x := 1; f^ := mem[1]; put(f); mem[1].x := 9; mem[2].x := 2; f^ := mem[2]; put(f); reset(f); b := f^; write(b.x); get(f); b := f^; write(b.x); end.`,
      purpose: 'ISO 6.6.3.3: put 之后改写源内存，已落盘的记录必须保持原值 → 期望 12（TeX 格式转储的核心不变量）',
      recordFiles: new Map([['f', new MemoryRecordFile()]]),
      expectedContains: '12',
    },

    // ==========================================================================
    // 反面：违反 ISO 前置条件应快速失败
    // ==========================================================================

    {
      name: 'file of record: 反面 - reset 后写缓冲区应报错',
      code:
        `program test(f); type rec = record x: integer; end; var f: file of rec; r: rec; begin rewrite(f); reset(f); f^ := r; end.`,
      purpose: 'ISO 6.6.5.2: rewrite 之前（读状态）写缓冲区违反前置条件',
      recordFiles: new Map([['f', new MemoryRecordFile()]]),
      expectedError: 'pre-assertion',
    },
    {
      name: 'file of record: 反面 - reset 后 put 应报错',
      code:
        `program test(f); type rec = record x: integer; end; var f: file of rec; begin rewrite(f); reset(f); put(f); end.`,
      purpose: 'ISO 6.6.5.2: rewrite 之前（读状态）调用 put 违反前置条件',
      recordFiles: new Map([['f', new MemoryRecordFile()]]),
      expectedError: 'pre-assertion',
    },
  ]

  runPascalTests(tests)
})
