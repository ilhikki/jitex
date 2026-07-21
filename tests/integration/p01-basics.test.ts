// m4 基础测试：变量声明、赋值、输出

import { describe, it, expect } from '@jest/globals'
import { runPascalTest, type PascalTest } from './_helper'

describe('M5 JS Basic', () => {
  const tests: PascalTest[] = [
    {
      name: 'integer literal output',
      code: `program test; begin writeln(42); end.`,
      purpose: '输出整数字面量',
      features: ['writeln', 'integer-literal'],
      expectedOutput: '42\n',
    },
    {
      name: 'boolean literal output true',
      code: `program test; begin writeln(true); end.`,
      purpose: '输出布尔值 true',
      features: ['writeln', 'boolean-literal'],
      expectedOutput: 'TRUE\n',
    },
    {
      name: 'boolean literal output false',
      code: `program test; begin writeln(false); end.`,
      purpose: '输出布尔值 false',
      features: ['writeln', 'boolean-literal'],
      expectedOutput: 'FALSE\n',
    },
    {
      name: 'variable declaration and assignment',
      code: `program test; var x: integer; begin x := 10; writeln(x); end.`,
      purpose: '变量声明和赋值',
      features: ['var', 'assign', 'writeln'],
      expectedOutput: '10\n',
    },
    {
      name: 'multiple variables',
      code: `program test; var x, y: integer; begin x := 3; y := 7; writeln(x); writeln(y); end.`,
      purpose: '多个变量',
      features: ['var', 'assign', 'writeln'],
      expectedOutput: '3\n7\n',
    },
    {
      name: 'addition',
      code: `program test; var a, b, c: integer; begin a := 5; b := 3; c := a + b; writeln(c); end.`,
      purpose: '整数加法',
      features: ['var', 'assign', 'binary-add', 'writeln'],
      expectedOutput: '8\n',
    },
    {
      name: 'subtraction',
      code: `program test; var a, b, c: integer; begin a := 10; b := 3; c := a - b; writeln(c); end.`,
      purpose: '整数减法',
      features: ['var', 'assign', 'binary-sub', 'writeln'],
      expectedOutput: '7\n',
    },
    {
      name: 'multiplication',
      code: `program test; var a, b, c: integer; begin a := 4; b := 6; c := a * b; writeln(c); end.`,
      purpose: '整数乘法',
      features: ['var', 'assign', 'binary-mul', 'writeln'],
      expectedOutput: '24\n',
    },
    {
      name: 'division',
      code: `program test; var a, b, c: integer; begin a := 20; b := 4; c := a div b; writeln(c); end.`,
      purpose: '整数除法',
      features: ['var', 'assign', 'binary-div', 'writeln'],
      expectedOutput: '5\n',
    },
    {
      name: 'modulo',
      code: `program test; var a, b, c: integer; begin a := 17; b := 5; c := a mod b; writeln(c); end.`,
      purpose: '整数取模',
      features: ['var', 'assign', 'binary-mod', 'writeln'],
      expectedOutput: '2\n',
    },
    {
      name: 'expression with precedence',
      code: `program test; var a, b, c, d: integer; begin a := 2; b := 3; c := 4; d := a + b * c; writeln(d); end.`,
      purpose: '运算符优先级',
      features: ['var', 'assign', 'binary-add', 'binary-mul', 'precedence'],
      expectedOutput: '14\n',
    },
    {
      name: 'parenthesized expression',
      code: `program test; var a, b, c, d: integer; begin a := 2; b := 3; c := 4; d := (a + b) * c; writeln(d); end.`,
      purpose: '括号表达式',
      features: ['var', 'assign', 'paren', 'binary-add', 'binary-mul'],
      expectedOutput: '20\n',
    },
    {
      name: 'unary minus',
      code: `program test; var x: integer; begin x := -5; writeln(x); end.`,
      purpose: '一元负号',
      features: ['var', 'assign', 'unary-neg'],
      expectedOutput: '-5\n',
    },
  ]

  it('should pass all basic tests', async () => {
    for (const test of tests) {
      const result = await runPascalTest(test)
      if (!result.passed) {
        console.error(`FAIL: ${test.name}: ${result.message}`)
      }
      expect(result.passed).toBe(true)
    }
  })
})
