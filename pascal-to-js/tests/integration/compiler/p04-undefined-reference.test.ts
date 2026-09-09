// 无定义引用检查测试（ISO 7185 6.2.1: 标识符须先声明后使用）
//
// analysis 阶段负责检查所有函数/过程调用与变量引用均有定义，
// 否则编译期抛错（而不是运行时才暴露）。
//
// - 反向测试：未声明的变量/函数/过程 → 编译报错
// - 正向测试：内置过程/函数/无参标识符（maxint/nil/eof/eoln）不被误报

import { assert, describe, test } from './_helper.ts'
import { type PascalTest, runPascalTests } from './_helper.ts'
import { run } from '@jitex/pascal-to-js'

const positiveTests: PascalTest[] = [
  {
    name: '正向：内置过程 writeln 可正常调用',
    code: `PROGRAM P;BEGIN WRITELN('ok');END.`,
    purpose: '内置过程不依赖用户声明，不应被误判为无定义',
    expectedOutput: 'ok\n',
  },
  {
    name: '正向：内置函数 abs 可正常调用',
    code: `PROGRAM P;VAR X:INTEGER;BEGIN X:=ABS(-5);WRITELN(X);END.`,
    purpose: '内置函数不依赖用户声明，不应被误判为无定义',
    expectedOutput: '5\n',
  },
  {
    name: '正向：maxint 无参标识符',
    code: `PROGRAM P;VAR X:INTEGER;BEGIN X:=MAXINT;WRITELN(X);END.`,
    purpose: 'maxint 是预定义标识符（ISO 7185 6.1.5），不应被误判为无定义',
    expectedOutput: '2147483647\n',
  },
  {
    name: '正向：nil 无参标识符',
    code: `PROGRAM P;TYPE IP=^INTEGER;VAR P1:IP;BEGIN P1:=NIL;IF P1=NIL THEN WRITELN('nil');END.`,
    purpose: 'nil 是预定义标识符（ISO 7185 6.4.4），不应被误判为无定义',
    expectedOutput: 'nil\n',
  },
  {
    name: '正向：eof 无参标识符',
    code: `PROGRAM P;BEGIN IF EOF THEN WRITELN('eof');END.`,
    purpose: 'eof 无参形式（标准输入）不应被误判为无定义',
    expectedOutput: 'eof\n',
  },
]

const negativeTests: PascalTest[] = [
  {
    name: '反向：引用未声明变量应报错',
    code: `PROGRAM P;VAR X:INTEGER;BEGIN Y:=1;END.`,
    purpose: 'ISO 7185 6.2.1: 变量使用前必须先声明，Y 未声明',
    expectedError: 'undefined identifier',
  },
  {
    name: '反向：调用未声明函数应报错',
    code: `PROGRAM P;VAR X:INTEGER;BEGIN X:=FOO(1);END.`,
    purpose: 'ISO 7185 6.2.1: FOO 未声明，函数调用无定义',
    expectedError: 'unknown function',
  },
  {
    name: '反向：调用未声明过程应报错',
    code: `PROGRAM P;BEGIN BAR;END.`,
    purpose: 'ISO 7185 6.2.1: BAR 未声明，过程调用无定义',
    expectedError: 'unknown procedure',
  },
  {
    name: '反向：嵌套过程中引用未声明变量应报错',
    code: `PROGRAM P;PROCEDURE Q;BEGIN LOCAL:=1;END;BEGIN Q;END.`,
    purpose: '局部作用域内未声明的变量引用同样应报错',
    expectedError: 'undefined identifier',
  },
]

describe('无定义引用检查（analysis 阶段）', () => {
  describe('正向：内置/预定义标识符', () => runPascalTests(positiveTests))
  describe('反向：无定义引用报错', () => runPascalTests(negativeTests))

  test('反向：多个无定义引用一次性全部捕获', () => {
    const state = run(
      `PROGRAM P;VAR X:INTEGER;BEGIN Y:=1;Z:=FOO(2);BAR;END.`,
      { maxSteps: 1e5 },
    )
    assert(state.status === 'error', `expected error, got status=${state.status}`)
    const msg = state.error?.message ?? ''
    assert(msg.includes('undefined identifier Y'), `missing Y in: ${msg}`)
    assert(msg.includes('undefined identifier Z'), `missing Z in: ${msg}`)
    assert(msg.includes('unknown function FOO'), `missing FOO in: ${msg}`)
    assert(msg.includes('unknown procedure BAR'), `missing BAR in: ${msg}`)
  })
})
