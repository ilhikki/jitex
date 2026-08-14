// Pascal-H 文件模型测试
//
// 验证 pascalHFileModel 扩展下的文件读取行为：
//   - RESET 后 F^ 未定义，需要 GET 预读
//   - inputln (bypass_eoln) 不丢失首字符
//
// 这是 e2e 中 TeX 读取终端输入/文件的基础（Knuth WEB 系统依赖此行为）。

import { describe } from 'vitest'
import { type PascalTest, runPascalTests } from './_helper'

function text(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

describe('Pascal-H File Model (e2e TeX 基础)', () => {
  const tests: PascalTest[] = [
    // ==========================================================================
    // inputln 模拟（bypass_eoln=true）：RESET → GET 预读 → 循环读取
    // ==========================================================================
    {
      name: 'inputln bypass_eoln: 正向 - 不丢失首字符 (pascalHFileModel)',
      code: `program test;
var f: text;
    ch: char;
begin
  assign(f, 'IN.TXT'); reset(f);
  { 模拟 Knuth input_ln: bypass_eoln=true }
  if not eof(f) then get(f);
  if eoln(f) then get(f);
  while not eoln(f) do begin
    ch := f^;
    write(ch);
    get(f);
  end;
end.`,
      purpose: 'pascalHFileModel: RESET 后 GET 预读，循环读取不应丢失首字符',
      expectedContains: 'hello',
      extensions: ['string', 'fileEofBufferSpace', 'pascalHFileModel'],
      files: new Map([['IN.TXT', text('hello\n')]]),
      programFileUrls: { f: 'IN.TXT' },
    },
    {
      name: 'inputln no-bypass: 正向 - 标准 Pascal 模式首字符不丢 (无 pascalHFileModel)',
      code: `program test;
var f: text;
    ch: char;
begin
  assign(f, 'IN.TXT'); reset(f);
  { 标准 Pascal: RESET 后 F^ 已指向首字符，直接读取 }
  if eoln(f) then get(f);
  while not eoln(f) do begin
    ch := f^;
    write(ch);
    get(f);
  end;
end.`,
      purpose: '标准 Pascal (无 pascalHFileModel): RESET 后 F^ 已有值，直接读取',
      expectedContains: 'hello',
      extensions: ['string', 'fileEofBufferSpace'],
      files: new Map([['IN.TXT', text('hello\n')]]),
      programFileUrls: { f: 'IN.TXT' },
    },
    {
      name: 'inputln multi-line: 正向 - 读取多行 (pascalHFileModel)',
      code: `program test;
var f: text;
    ch: char;
    line: integer;
begin
  assign(f, 'IN.TXT'); reset(f);
  for line := 1 to 2 do begin
    if not eof(f) then get(f);
    if eoln(f) then get(f);
    while not eoln(f) do begin
      ch := f^;
      write(ch);
      get(f);
    end;
    writeln;
  end;
end.`,
      purpose: 'pascalHFileModel: 多行读取，每行首字符不丢失',
      expectedContains: 'hello',
      extensions: ['string', 'fileEofBufferSpace', 'pascalHFileModel'],
      files: new Map([['IN.TXT', text('hello\nworld\n')]]),
      programFileUrls: { f: 'IN.TXT' },
    },
  ]

  runPascalTests(tests)
})
