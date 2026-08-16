// string 类型扩展正反测试（AGENTS.md 原则 A.10）
//
// ISO 7185 没有 string 类型（§6.4.3.1）；启用 extensions=['string'] 后才支持。
// 正测试：启用扩展，验证 string 类型 / 拼接 / 字面量正常。
// 反测试：默认配置下，var s: string 必须报错。

import { describe } from '../_helper.ts'
import { type PascalTest, runPascalTests } from '../_helper.ts'

describe('非标扩展：string 类型（正反测试）', () => {
  const tests: PascalTest[] = [
    {
      name: 'string 类型：正向 - 字符串拼接 + 运算符',
      code: `program test;
var s: string;
begin
  s := 'Hello' + ' ' + 'World';
  writeln(s);
end.`,
      purpose: '字符串拼接 + 运算符（extensions=[string] 启用后可用）',
      extensions: ['string'],
      expectedContains: 'Hello World',
    },

    {
      name: 'string 字面量：正向 - 空字符串',
      code: `program test;
var
  s: string;
begin
  s := '';
end.`,
      purpose: '验证空字符串字面量',
      extensions: ['string'],
    },

    {
      name: 'string 字面量：正向 - 单字符字符串',
      code: `program test;
var
  s: string;
begin
  s := 'a';
end.`,
      purpose: '验证单字符字符串',
      extensions: ['string'],
    },

    {
      name: 'string 字面量：正向 - 转义引号（双写单引号）',
      code: `program test;
var
  s: string;
begin
  s := 'it''s';
end.`,
      purpose: '验证 Pascal 中通过双写单引号转义引号',
      extensions: ['string'],
    },

    {
      name: 'string 类型：反向 - 默认配置下应报错',
      code: `program test;
var s: string;
begin
  s := 'hello';
  writeln(s);
end.`,
      purpose: 'Pascal82 没有 string 类型，默认配置下必须报错（ISO 7185 6.4.3.1）',
      expectedError: '',
    },
  ]

  runPascalTests(tests)
})
