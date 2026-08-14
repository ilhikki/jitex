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

import { describe } from './_helper'
import { type PascalTest, runPascalTests } from './_helper'

describe('ISO 7185 file of record (6.4.3.5 / 6.6.5.2)', () => {
  const tests: PascalTest[] = [
    // ==========================================================================
    // file of record 基础读写
    // ==========================================================================

    {
      name: 'file of record: 正向 - 写入并读取简单记录',
      code:
        `program test; type rec = record x: integer; y: integer; end; var f: file of rec; r: rec; begin assign(f,'DATA.BIN'); rewrite(f); r.x := 10; r.y := 20; f^ := r; put(f); close(f); reset(f); r := f^; write(r.x, ',', r.y); end.`,
      purpose: 'ISO 6.4.3.5/6.6.5.2 file of record: 写入记录后重置读取，验证记录字段',
      files: new Map<string, Uint8Array>([['DATA.BIN', new Uint8Array(0)]]),
      expectedContains: '10,20',
    },
    {
      name: 'file of record: 正向 - 多条记录顺序读取',
      code:
        `program test; type rec = record x: integer; end; var f: file of rec; r1, r2: rec; begin assign(f,'DATA.BIN'); rewrite(f); r1.x := 1; f^ := r1; put(f); r2.x := 2; f^ := r2; put(f); close(f); reset(f); r1 := f^; get(f); r2 := f^; write(r1.x + r2.x); end.`,
      purpose: 'ISO 6.6.5.2 file of record: 写入两条记录，顺序读取并求和',
      files: new Map<string, Uint8Array>([['DATA.BIN', new Uint8Array(0)]]),
      expectedContains: '3',
    },
    {
      name: 'file of record: 正向 - 变体 record 字段访问 (int 视图)',
      code:
        `program test; type mw = record case integer of 1: (int: integer); 2: (b0, b1, b2, b3: 0..255); end; var f: file of mw; w: mw; begin assign(f,'DATA.BIN'); rewrite(f); w.int := 42; f^ := w; put(f); close(f); reset(f); w := f^; write(w.int); end.`,
      purpose: 'ISO 6.4.2.3 变体 record: 通过 int 字段访问，模拟 TeX memory_word',
      files: new Map<string, Uint8Array>([['DATA.BIN', new Uint8Array(0)]]),
      expectedContains: '42',
    },
    {
      name: 'file of record: 正向 - 变体 record 字段访问 (字节视图)',
      code:
        `program test; type mw = record case integer of 1: (int: integer); 2: (b0, b1, b2, b3: 0..255); end; var f: file of mw; w: mw; begin assign(f,'DATA.BIN'); rewrite(f); w.b0 := 1; w.b1 := 2; w.b2 := 3; w.b3 := 4; f^ := w; put(f); close(f); reset(f); w := f^; write(w.b0, w.b1, w.b2, w.b3); end.`,
      purpose: 'ISO 6.4.2.3 变体 record: 通过字节字段访问，模拟 TeX four_quarters',
      files: new Map<string, Uint8Array>([['DATA.BIN', new Uint8Array(0)]]),
      expectedContains: '1234',
    },

    // ==========================================================================
    // 字段级赋值（TeX dump_int 宏模式: f^.field := x; put(f)）
    // ==========================================================================

    {
      name: 'file of record: 正向 - 字段级赋值 f^.field := x (TeX dump 模式)',
      code:
        `program test; type rec = record x: integer; y: integer; end; var f: file of rec; begin assign(f,'DATA.BIN'); rewrite(f); f^.x := 10; f^.y := 20; put(f); close(f); reset(f); write(f^.x, ',', f^.y); end.`,
      purpose: 'ISO 6.6.5.2: f^.field := x 修改缓冲区字段，put 写入。TeX dump_int/dump_hh 即此模式',
      files: new Map<string, Uint8Array>([['DATA.BIN', new Uint8Array(0)]]),
      expectedContains: '10,20',
    },
    {
      name: 'file of record: 正向 - 多条字段级赋值顺序写入',
      code:
        `program test; type rec = record x: integer; end; var f: file of rec; begin assign(f,'DATA.BIN'); rewrite(f); f^.x := 1; put(f); f^.x := 2; put(f); f^.x := 3; put(f); close(f); reset(f); write(f^.x); get(f); write(f^.x); get(f); write(f^.x); end.`,
      purpose: 'ISO 6.6.5.2: 多次 f^.field := x; put(f) 顺序写入，get 顺序读取',
      files: new Map<string, Uint8Array>([['DATA.BIN', new Uint8Array(0)]]),
      expectedContains: '123',
    },
    {
      name: 'file of record: 正向 - 变体 record 字段级赋值 (int 视图，TeX dump_int)',
      code:
        `program test; type mw = record case integer of 1: (int: integer); 2: (b0, b1, b2, b3: 0..255); end; var f: file of mw; begin assign(f,'DATA.BIN'); rewrite(f); f^.int := 42; put(f); close(f); reset(f); write(f^.int); end.`,
      purpose: 'ISO 6.4.2.3/6.6.5.2: f^.int := x (TeX dump_int 宏模式)',
      files: new Map<string, Uint8Array>([['DATA.BIN', new Uint8Array(0)]]),
      expectedContains: '42',
    },
    {
      name: 'file of record: 正向 - 变体 record 字段级赋值 (字节视图，TeX dump_qqqq)',
      code:
        `program test; type mw = record case integer of 1: (int: integer); 2: (b0, b1, b2, b3: 0..255); end; var f: file of mw; begin assign(f,'DATA.BIN'); rewrite(f); f^.b0 := 1; f^.b1 := 2; f^.b2 := 3; f^.b3 := 4; put(f); close(f); reset(f); write(f^.b0, f^.b1, f^.b2, f^.b3); end.`,
      purpose: 'ISO 6.4.2.3/6.6.5.2: f^.b0 := x 等 (TeX dump_qqqq 宏模式)',
      files: new Map<string, Uint8Array>([['DATA.BIN', new Uint8Array(0)]]),
      expectedContains: '1234',
    },
  ]

  runPascalTests(tests)
})
