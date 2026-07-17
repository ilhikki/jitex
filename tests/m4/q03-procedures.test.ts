// m4 过程和函数测试

import { describe, it, expect } from '@jest/globals'
import { runVMTest, type VMTest } from './_helper'

describe('M4 VM Procedures and Functions', () => {
  const tests: VMTest[] = [
    {
      name: 'simple procedure call',
      code: `program test;
        procedure sayhello;
        begin writeln(1); end;
        begin sayhello; end.`,
      purpose: '简单过程调用',
      features: ['procedure', 'call'],
      expectedOutput: '1\n',
    },
    {
      name: 'procedure with value parameter',
      code: `program test;
        procedure printn(n: integer);
        begin writeln(n); end;
        begin printn(42); end.`,
      purpose: '带值参数的过程',
      features: ['procedure', 'param', 'value-param'],
      expectedOutput: '42\n',
    },
    {
      name: 'procedure with var parameter',
      code: `program test;
        var a: integer;
        procedure incvar(var x: integer);
        begin x := x + 1; end;
        begin a := 5; incvar(a); writeln(a); end.`,
      purpose: '带 var 参数的过程',
      features: ['procedure', 'param', 'var-param'],
      expectedOutput: '6\n',
    },
    {
      name: 'simple function call',
      code: `program test;
        var r: integer;
        function double(n: integer): integer;
        begin double := n * 2; end;
        begin r := double(5); writeln(r); end.`,
      purpose: '简单函数调用',
      features: ['function', 'return', 'call'],
      expectedOutput: '10\n',
    },
    {
      name: 'nested procedure call',
      code: `program test;
        procedure inner;
        begin writeln(1); end;
        procedure outer;
        begin inner; end;
        begin outer; end.`,
      purpose: '嵌套过程调用',
      features: ['procedure', 'nested'],
      expectedOutput: '1\n',
    },
    {
      name: 'recursive factorial',
      code: `program test;
        var r: integer;
        function fact(n: integer): integer;
        begin
          if n <= 1 then fact := 1
          else fact := n * fact(n - 1);
        end;
        begin r := fact(5); writeln(r); end.`,
      purpose: '递归阶乘',
      features: ['function', 'recursion'],
      expectedOutput: '120\n',
    },
  ]

  it('should pass all procedure/function tests', async () => {
    for (const test of tests) {
      const result = await runVMTest(test)
      if (!result.passed) {
        console.error(`FAIL: ${test.name}: ${result.message}`)
      }
      expect(result.passed).toBe(true)
    }
  })
})
