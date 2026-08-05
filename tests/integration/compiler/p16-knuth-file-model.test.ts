/**
 * Pascal-H 文件模型测试（正反测试，AGENTS.md 原则 A.9）。
 *
 * Pascal-H（Knuth WEB 系统使用的 Pascal 方言）中，RESET 后 F^ 未定义，
 * 需要 GET 预读第一个字符。
 * 违反 ISO 7185 6.9.8.1："The procedure-statement reset(f) ...
 * causes the file-buffer variable f^ to denote the first component
 * of the file f (if any)."
 *
 * TeX 的 input_ln 依赖此行为：
 *   if bypass_eoln then if not eof(f) then get(f);  {预读第一个字符}
 *   while not eoln(f) do begin buffer[i]:=f^; get(f); ... end;
 *
 * 正测试：启用 extension 'pascalHFileModel'，验证 GET 是预读（不跳字符）
 * 反测试：默认配置下，RESET 后 F^ 已定义（标准 Pascal），GET 跳过第一个字符
 */
import { runPascalTests, type PascalTest } from './_helper'

const tests: PascalTest[] = [
  // ===== 正测试：启用 pascalHFileModel =====
  {
    name: 'Pascal-H: RESET 后 GET 预读第一个字符（模拟 TeX input_ln）',
    purpose: '启用 pascalHFileModel 后，GET 不跳字符，F^ 获得第一个字符',
    code: `program test;
var f: text;
    buf: array[1..100] of char;
    i, n: integer;
begin
  reset(f, 'input.txt');
  i := 1;
  { 模拟 TeX input_ln 的 bypass_eoln 逻辑 }
  if not eof(f) then get(f);
  { 此时 f^ 应该是第一个字符 'h' }
  while not eoln(f) do
  begin
    buf[i] := f^;
    i := i + 1;
    get(f);
  end;
  n := i - 1;
  i := 1;
  while i <= n do
  begin
    write(buf[i]);
    i := i + 1;
  end;
end.`,
    input: [],
    files: new Map([
      ['input.txt', new Uint8Array(Buffer.from('hello\n'))],
    ]),
    extensions: ['fileEofBufferSpace', 'pascalHFileModel'],
    expectedOutput: 'hello',
  },

  {
    name: 'Pascal-H: 多行文件 bypass_eoln 不丢字符',
    purpose: '启用 pascalHFileModel 后，读取第二行时不丢第一个字符',
    code: `program test;
var f: text;
    line1, line2: array[1..10] of char;
    i, n1, n2: integer;
begin
  reset(f, 'input.txt');
  { 读取第一行 }
  if not eof(f) then get(f);
  i := 1;
  while not eoln(f) do
  begin
    line1[i] := f^;
    i := i + 1;
    get(f);
  end;
  n1 := i - 1;
  { 读取第二行 }
  if not eof(f) then get(f);
  i := 1;
  while not eoln(f) do
  begin
    line2[i] := f^;
    i := i + 1;
    get(f);
  end;
  n2 := i - 1;
  i := 1;
  while i <= n1 do
  begin
    write(line1[i]);
    i := i + 1;
  end;
  write(' ');
  i := 1;
  while i <= n2 do
  begin
    write(line2[i]);
    i := i + 1;
  end;
end.`,
    input: [],
    files: new Map([
      ['input.txt', new Uint8Array(Buffer.from('abc\ntest\n'))],
    ]),
    extensions: ['fileEofBufferSpace', 'pascalHFileModel'],
    expectedOutput: 'abc test',
  },

  // ===== 反测试：默认配置（标准 Pascal），GET 跳过第一个字符 =====
  {
    name: '标准 Pascal: RESET 后 F^ 直接可读，GET 跳过第一个字符',
    purpose: '默认配置下 RESET 后 F^ 已定义（ISO 7185 6.9.8.1），GET 推进到第二个字符',
    code: `program test;
var f: text;
    buf: array[1..100] of char;
    i, n: integer;
begin
  reset(f, 'input.txt');
  { 标准 Pascal: RESET 后 F^ = 'h'，GET 后 F^ = 'e' }
  if not eof(f) then get(f);
  { 此时 f^ 是第二个字符 'e' }
  i := 1;
  while not eoln(f) do
  begin
    buf[i] := f^;
    i := i + 1;
    get(f);
  end;
  n := i - 1;
  i := 1;
  while i <= n do
  begin
    write(buf[i]);
    i := i + 1;
  end;
end.`,
    input: [],
    files: new Map([
      ['input.txt', new Uint8Array(Buffer.from('hello\n'))],
    ]),
    extensions: ['fileEofBufferSpace'],
    // 标准 Pascal: GET 跳过 'h'，读取 "ello"
    expectedOutput: 'ello',
  },

  {
    name: '标准 Pascal: RESET 后直接读 F^（不 GET）',
    purpose: '默认配置下 RESET 后 F^ 已指向第一个字符（ISO 7185 6.9.8.1）',
    code: `program test;
var f: text;
begin
  reset(f, 'input.txt');
  { 不调用 GET，直接读 F^ }
  write(f^);
  get(f);
  write(f^);
end.`,
    input: [],
    files: new Map([
      ['input.txt', new Uint8Array(Buffer.from('AB\n'))],
    ]),
    extensions: ['fileEofBufferSpace'],
    expectedOutput: 'AB',
  },
]

runPascalTests(tests)
