// ISSUE-033 复现+修复验证：RESET/REWRITE 多参数形式（非标扩展）
// Pascal 扩展：RESET(F, name) / REWRITE(F, name) 等价于 ASSIGN(F, name); RESET/REWRITE(F)
// 通过 createExtendedSysCalls() 启用，不修改核心 io.plugin.ts
//
// 分类：非标扩展，插件实现

import { describe, it, expect } from '@jest/globals'
import { runPascalTest, type PascalTest } from './_helper'
import { createExtendedSysCalls } from '../../src/js-compiler/syscalls'

function text(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

const extendedSysCalls = createExtendedSysCalls()

describe('ISSUE-033: RESET/REWRITE multi-arg (nonstandard)', () => {
  const tests: PascalTest[] = [
    {
      name: 'RESET(F, name) 应关联文件名并读取内容',
      code: `PROGRAM TANGLE;VAR F:FILE OF CHAR;N:INTEGER;BEGIN RESET(F,'DATA.TXT');READ(F,N);WRITELN(N);END.`,
      purpose: '非标 RESET(F, name)：应等价于 ASSIGN(F, name); RESET(F)',
      features: ['reset', 'multi-arg', 'nonstandard', 'issue-033'],
      files: new Map<string, Uint8Array>([['DATA.TXT', text('42')]]),
      expectedContains: '42',
      sysCalls: extendedSysCalls,
    },

    {
      name: 'REWRITE(F, name) 应关联文件名并写入',
      code: `PROGRAM TANGLE;VAR F:FILE OF CHAR;BEGIN REWRITE(F,'OUT.TXT');WRITELN(F,'HELLO');CLOSE(F);END.`,
      purpose: '非标 REWRITE(F, name)：应等价于 ASSIGN(F, name); REWRITE(F)',
      features: ['rewrite', 'multi-arg', 'nonstandard', 'issue-033'],
      files: new Map<string, Uint8Array>([['OUT.TXT', new Uint8Array(0)]]),
      expectedFileContains: [{ url: 'OUT.TXT', contains: 'HELLO' }],
      sysCalls: extendedSysCalls,
    },

    {
      name: 'RESET(F, name, mode) 三参数形式（TEX82 风格）',
      code: `PROGRAM TANGLE;VAR F:FILE OF CHAR;C:CHAR;BEGIN RESET(F,'IN.TXT','/O');READ(F,C);WRITELN(C);END.`,
      purpose: 'TEX82 风格 RESET(F, name, mode)：第三参数 mode 在内存模型中忽略',
      features: ['reset', 'three-arg', 'nonstandard', 'issue-033'],
      files: new Map<string, Uint8Array>([['IN.TXT', text('X')]]),
      expectedContains: 'X',
      sysCalls: extendedSysCalls,
    },
  ]

  for (const t of tests) {
    it(t.name, async () => {
      const result = await runPascalTest(t)
      if (!result.passed) {
        console.error(`  [${t.name}] FAIL: ${result.message}`)
      }
      expect(result.passed).toBe(true)
    })
  }
})
