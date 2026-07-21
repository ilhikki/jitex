import { parse } from '../../../src/index'
import { ConformanceTest } from './_helper'

interface RobustnessTest {
  name: string
  code: string
  purpose: string
  features: string[]
  expectCrash?: boolean
  expectSilentAccept?: boolean
}

const crashTests: RobustnessTest[] = [
  {
    name: '未闭合大括号注释不应导致 crash',
    code: 'program test;\n{ unclosed comment\nbegin\nend.',
    purpose: 'lexer 遇到未闭合的 { 注释时，parser 应优雅报错而非 crash',
    features: ['comment', 'unclosed', 'crash', 'error-handling'],
    expectCrash: true,
  },
  {
    name: '未闭合圆括号星号注释不应导致 crash',
    code: 'program test;\n(* unclosed comment\nbegin\nend.',
    purpose: 'lexer 遇到未闭合的 (* 注释时，parser 应优雅报错而非 crash',
    features: ['comment', 'unclosed', 'crash', 'error-handling'],
    expectCrash: true,
  },
  {
    name: '过程内未闭合注释不应导致 crash',
    code: 'program test;\nprocedure p;\n{ unclosed\nbegin\nend;\nbegin\nend.',
    purpose: '过程声明中未闭合注释导致 token 流提前终止时不应 crash',
    features: ['comment', 'procedure', 'unclosed', 'crash'],
    expectCrash: true,
  },
  {
    name: '分号后 EOF 不应导致 crash',
    code: 'program test;',
    purpose: 'program 声明后直接 EOF（只有 program + 分号）不应 crash',
    features: ['eof', 'crash', 'error-handling'],
    expectCrash: true,
  },
  {
    name: 'VAR 后 EOF 不应导致 crash',
    code: 'program test;\nvar',
    purpose: 'var 关键字后直接 EOF 不应 crash',
    features: ['var', 'eof', 'crash', 'error-handling'],
    expectCrash: true,
  },
  {
    name: 'TYPE 后 EOF 不应导致 crash',
    code: 'program test;\ntype',
    purpose: 'type 关键字后直接 EOF 不应 crash',
    features: ['type', 'eof', 'crash', 'error-handling'],
    expectCrash: true,
  },
  {
    name: 'CONST 后 EOF 不应导致 crash',
    code: 'program test;\nconst',
    purpose: 'const 关键字后直接 EOF 不应 crash',
    features: ['const', 'eof', 'crash', 'error-handling'],
    expectCrash: true,
  },
  {
    name: 'LABEL 后 EOF 不应导致 crash',
    code: 'program test;\nlabel',
    purpose: 'label 关键字后直接 EOF 不应 crash',
    features: ['label', 'eof', 'crash', 'error-handling'],
    expectCrash: true,
  },
  {
    name: 'BEGIN 后 EOF 不应导致 crash',
    code: 'program test;\nbegin',
    purpose: 'begin 后直接 EOF 不应 crash',
    features: ['begin', 'eof', 'crash', 'error-handling'],
    expectCrash: true,
  },
  {
    name: 'CASE 后 EOF 不应导致 crash',
    code: 'program test;\nvar x: integer;\nbegin\ncase x of',
    purpose: 'case 语句中间 EOF 不应 crash',
    features: ['case', 'eof', 'crash', 'error-handling'],
    expectCrash: true,
  },
  {
    name: 'REPEAT 后 EOF 不应导致 crash',
    code: 'program test;\nvar x: integer;\nbegin\nrepeat',
    purpose: 'repeat 后直接 EOF 不应 crash',
    features: ['repeat', 'eof', 'crash', 'error-handling'],
    expectCrash: true,
  },
  {
    name: '未闭合字符串注释在表达式中间 EOF 不应 crash',
    code: "program test;\nvar s: string;\nbegin\ns := 'hello;\nend.",
    purpose: '未闭合字符串导致 EOF 时 parser 不应 crash',
    features: ['string', 'unclosed', 'eof', 'crash'],
    expectCrash: true,
  },
]

const silentAcceptTests: RobustnessTest[] = [
  {
    name: '嵌套注释不匹配不应被静默接受',
    code: 'program test;\n{ outer { inner } extra\nbegin\nend.',
    purpose: '{ outer { inner } 中内层 { 应该作为注释内容，外层注释未闭合应报错',
    features: ['comment', 'nested', 'silent-accept', 'error-handling'],
    expectSilentAccept: true,
  },
  {
    name: 'end. 后多余 token 不应被静默接受',
    code: 'program test;\nbegin\nend.\ngarbage tokens here',
    purpose: 'parser 解析完程序后应检查是否消费了所有 token',
    features: ['eof', 'trailing-tokens', 'silent-accept', 'error-handling'],
    expectSilentAccept: true,
  },
  {
    name: 'end. 后多余 PROCEDURE 不应被静默接受',
    code: 'program test;\nbegin\nend.\nprocedure extra;\nbegin\nend;',
    purpose: 'program 结束后多余的过程声明应报错',
    features: ['trailing-tokens', 'silent-accept'],
    expectSilentAccept: true,
  },
  {
    name: 'end. 后多余 VAR 不应被静默接受',
    code: 'program test;\nbegin\nend.\nvar x: integer;',
    purpose: 'program 结束后多余的 var 声明应报错',
    features: ['trailing-tokens', 'silent-accept'],
    expectSilentAccept: true,
  },
]

describe('M3.5 Parser Robustness (crash bugs)', () => {
  crashTests.forEach((t) => {
    test(t.name, () => {
      let threw = false
      try {
        parse(t.code)
      } catch (e) {
        threw = true
      }
      expect(threw).toBe(false)
    })
  })
})

describe('M3.5 Parser Robustness (silent accept bugs)', () => {
  silentAcceptTests.forEach((t) => {
    test(t.name, () => {
      const result = parse(t.code)
      expect(result.success).toBe(false)
    })
  })
})
