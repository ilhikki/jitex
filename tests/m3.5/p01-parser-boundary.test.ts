import { ConformanceTest, runParseTest, makeProgram, makeProgramWithVars } from './_helper'

const tests: ConformanceTest[] = [
  // ==========================================================================
  // 1. 空程序与最小程序（5个）
  // ==========================================================================
  {
    name: '空 begin end 程序',
    code: makeProgram(''),
    purpose: '验证只有空 compound statement 的最小程序能解析',
    features: ['program', 'compound-statement', 'empty-body'],
    shouldParse: true,
  },
  {
    name: '只有 program 声明的程序',
    code: 'program test;\nbegin\nend.',
    purpose: '验证最小完整程序结构：program + 空 begin end',
    features: ['program-declaration', 'compound-statement'],
    shouldParse: true,
  },
  {
    name: '无变量无过程的程序',
    code: makeProgram(''),
    purpose: '验证没有变量和过程声明的程序能正常解析',
    features: ['program', 'no-variables', 'no-procedures'],
    shouldParse: true,
  },
  {
    name: '带有程序参数的程序',
    code: 'program test(input, output);\nbegin\nend.',
    purpose: '验证带参数列表的 program 声明',
    features: ['program-declaration', 'program-parameters'],
    shouldParse: true,
  },
  {
    name: '空程序缺少 end 应失败',
    code: 'program test;\nbegin\n.',
    purpose: '验证缺少 END 的程序会正确报错',
    features: ['program', 'missing-end', 'error'],
    shouldParse: false,
  },

  // ==========================================================================
  // 2. 注释边界（5个）
  // ==========================================================================
  {
    name: '花括号块注释在程序开头',
    code: '{ this is a comment }\nprogram test;\nbegin\nend.',
    purpose: '验证块注释出现在程序开头时被正确跳过',
    features: ['comment', 'block-comment', 'curly-brace'],
    shouldParse: true,
  },
  {
    name: '(* *) 风格块注释',
    code: '(* another comment *)\nprogram test;\nbegin\nend.',
    purpose: '验证圆括号星号风格的块注释',
    features: ['comment', 'block-comment', 'paren-star'],
    shouldParse: true,
  },
  {
    name: '注释在语句之间',
    code: makeProgramWithVars('x: integer;',
      'begin\n  { comment before } x := 1;\n  { comment after }\nend.'),
    purpose: '验证注释出现在语句之间的情况',
    features: ['comment', 'statement-separator'],
    shouldParse: true,
  },
  {
    name: '空注释',
    code: '{}\nprogram test;\nbegin\nend.',
    purpose: '验证空花括号注释能正确处理',
    features: ['comment', 'empty-comment'],
    shouldParse: true,
  },
  {
    name: '多行块注释',
    code: '{\n  line 1\n  line 2\n  line 3\n}\nprogram test;\nbegin\nend.',
    purpose: '验证跨越多行的块注释',
    features: ['comment', 'multi-line-comment'],
    shouldParse: true,
  },

  // ==========================================================================
  // 3. 标识符边界（6个）
  // ==========================================================================
  {
    name: '单字母标识符',
    code: makeProgramWithVars('x: integer;', 'begin\n  x := 1;\nend.'),
    purpose: '验证单字母变量名是合法标识符',
    features: ['identifier', 'single-letter', 'variable-declaration'],
    shouldParse: true,
  },
  {
    name: '长标识符',
    code: makeProgramWithVars('thisIsAVeryLongVariableName: integer;',
      'begin\n  thisIsAVeryLongVariableName := 1;\nend.'),
    purpose: '验证较长的标识符能正确解析',
    features: ['identifier', 'long-identifier'],
    shouldParse: true,
  },
  {
    name: '大小写混合标识符',
    code: makeProgramWithVars('MyVar: integer;',
      'begin\n  myvar := 1;\n  MYVAR := 2;\nend.'),
    purpose: '验证 Pascal 标识符大小写不敏感',
    features: ['identifier', 'case-insensitive'],
    shouldParse: true,
  },
  {
    name: '下划线开头的标识符应失败',
    code: makeProgramWithVars('_bad: integer;', ''),
    purpose: '验证以下划线开头的标识符不合法（Pascal 要求字母开头）',
    features: ['identifier', 'underscore', 'error'],
    shouldParse: false,
  },
  {
    name: '数字结尾的标识符',
    code: makeProgramWithVars('var123: integer;',
      'begin\n  var123 := 1;\nend.'),
    purpose: '验证标识符可以以数字结尾',
    features: ['identifier', 'digit-suffix'],
    shouldParse: true,
  },
  {
    name: '保留字作标识符应失败',
    code: makeProgramWithVars('begin: integer;', ''),
    purpose: '验证保留字不能用作变量名',
    features: ['identifier', 'reserved-word', 'error'],
    shouldParse: false,
  },

  // ==========================================================================
  // 4. 整数边界（5个）
  // ==========================================================================
  {
    name: '零值整数',
    code: makeProgramWithVars('x: integer;',
      'begin\n  x := 0;\nend.'),
    purpose: '验证零值整数常量',
    features: ['integer-literal', 'zero'],
    shouldParse: true,
  },
  {
    name: '大整数',
    code: makeProgramWithVars('x: integer;',
      'begin\n  x := 999999;\nend.'),
    purpose: '验证较大的整数值能解析',
    features: ['integer-literal', 'large-number'],
    shouldParse: true,
  },
  {
    name: '负数常量',
    code: makeProgramWithVars('x: integer;',
      'begin\n  x := -123;\nend.'),
    purpose: '验证负整数表达式',
    features: ['integer-literal', 'negative-number', 'unary-minus'],
    shouldParse: true,
  },
  {
    name: '十六进制整数',
    code: makeProgramWithVars('x: integer;',
      'begin\n  x := $1A2B;\nend.'),
    purpose: '验证 $ 前缀的十六进制数',
    features: ['integer-literal', 'hex-number', 'dollar-prefix'],
    shouldParse: true,
  },
  {
    name: '前导零整数',
    code: makeProgramWithVars('x: integer;',
      'begin\n  x := 00123;\nend.'),
    purpose: '验证带前导零的整数（Pascal 中合法）',
    features: ['integer-literal', 'leading-zero'],
    shouldParse: true,
  },

  // ==========================================================================
  // 5. 字符串边界（5个）
  // ==========================================================================
  {
    name: '空字符串',
    code: makeProgramWithVars('s: string;',
      "begin\n  s := '';\nend."),
    purpose: '验证空字符串字面量',
    features: ['string-literal', 'empty-string'],
    shouldParse: true,
  },
  {
    name: '单字符字符串',
    code: makeProgramWithVars('s: string;',
      "begin\n  s := 'a';\nend."),
    purpose: '验证单字符字符串',
    features: ['string-literal', 'single-char'],
    shouldParse: true,
  },
  {
    name: '转义引号（双写单引号）',
    code: makeProgramWithVars('s: string;',
      "begin\n  s := 'it''s';\nend."),
    purpose: '验证 Pascal 中通过双写单引号转义引号',
    features: ['string-literal', 'escaped-quote'],
    shouldParse: true,
  },
  {
    name: '长字符串',
    code: makeProgramWithVars('s: string;',
      "begin\n  s := 'abcdefghijklmnopqrstuvwxyz0123456789';\nend."),
    purpose: '验证较长的字符串字面量',
    features: ['string-literal', 'long-string'],
    shouldParse: true,
  },
  {
    name: '字符串含特殊字符',
    code: makeProgramWithVars('s: string;',
      "begin\n  s := '!@#$%^&*()_+-=[]{}|;:,.<>?';\nend."),
    purpose: '验证字符串中可以包含各种特殊字符',
    features: ['string-literal', 'special-characters'],
    shouldParse: true,
  },

  // ==========================================================================
  // 6. CASE 语句边界（6个）
  // ==========================================================================
  {
    name: '只有 OTHERWISE 的 CASE',
    code: makeProgramWithVars('x: integer;',
      'begin\n  case x of\n    otherwise\n      x := 0;\n  end;\nend.'),
    purpose: '验证 CASE 语句可以只有 OTHERWISE 分支',
    features: ['case-statement', 'otherwise', 'empty-branches'],
    shouldParse: true,
  },
  {
    name: '空 CASE 语句',
    code: makeProgramWithVars('x: integer;',
      'begin\n  case x of\n  end;\nend.'),
    purpose: '验证没有任何分支的空 CASE 语句',
    features: ['case-statement', 'empty-case'],
    shouldParse: true,
  },
  {
    name: '多值 CASE label',
    code: makeProgramWithVars('x, y: integer;',
      'begin\n  case x of\n    1, 2, 3: y := 10;\n    4, 5: y := 20;\n  end;\nend.'),
    purpose: '验证 CASE 分支可以有多个 label 值',
    features: ['case-statement', 'multi-value-label'],
    shouldParse: true,
  },
  {
    name: '嵌套 CASE 语句',
    code: makeProgramWithVars('x, y, z: integer;',
      'begin\n  case x of\n    1:\n      case y of\n        1: z := 10;\n        2: z := 20;\n      end;\n    2: z := 30;\n  end;\nend.'),
    purpose: '验证 CASE 语句可以嵌套',
    features: ['case-statement', 'nested-case'],
    shouldParse: true,
  },
  {
    name: 'CASE 中使用 GOTO',
    code: 'program test;\nlabel 99;\nvar\n  x: integer;\nbegin\n  case x of\n    1: goto 99;\n  end;\n99:\nend.',
    purpose: '验证 CASE 分支中可以使用 GOTO 语句',
    features: ['case-statement', 'goto', 'label'],
    shouldParse: true,
  },
  {
    name: 'CASE label 为表达式',
    code: makeProgramWithVars('x, y: integer;',
      'begin\n  case x of\n    1 + 1: y := 10;\n    3 * 2: y := 20;\n  end;\nend.'),
    purpose: '验证 CASE label 可以是表达式',
    features: ['case-statement', 'expression-label'],
    shouldParse: true,
  },

  // ==========================================================================
  // 7. WITH 语句边界（3个）
  // ==========================================================================
  {
    name: '单记录 WITH 语句',
    code: 'program test;\ntype\n  TRec = record\n    x: integer;\n  end;\nvar\n  r: TRec;\nbegin\n  with r do\n    x := 1;\nend.',
    purpose: '验证单条记录的 WITH 语句',
    features: ['with-statement', 'record', 'single-record'],
    shouldParse: true,
  },
  {
    name: '多记录 WITH 语句',
    code: 'program test;\ntype\n  TRec1 = record\n    x: integer;\n  end;\n  TRec2 = record\n    y: integer;\n  end;\nvar\n  r1: TRec1;\n  r2: TRec2;\nbegin\n  with r1, r2 do\n    begin\n      x := 1;\n      y := 2;\n    end;\nend.',
    purpose: '验证 WITH 语句可以使用多个记录',
    features: ['with-statement', 'multiple-records'],
    shouldParse: true,
  },
  {
    name: '嵌套 WITH 语句',
    code: 'program test;\ntype\n  TInner = record\n    a: integer;\n  end;\n  TOuter = record\n    inner: TInner;\n  end;\nvar\n  o: TOuter;\nbegin\n  with o do\n    with inner do\n      a := 1;\nend.',
    purpose: '验证 WITH 语句可以嵌套',
    features: ['with-statement', 'nested-with'],
    shouldParse: true,
  },

  // ==========================================================================
  // 8. FORWARD 声明（3个）
  // ==========================================================================
  {
    name: '过程 FORWARD 声明',
    code: 'program test;\nprocedure p; forward;\nbegin\n  p;\nend.',
    purpose: '验证过程的 forward 声明',
    features: ['forward-declaration', 'procedure'],
    shouldParse: true,
  },
  {
    name: '函数 FORWARD 声明',
    code: 'program test;\nfunction f: integer; forward;\nbegin\nend.',
    purpose: '验证函数的 forward 声明',
    features: ['forward-declaration', 'function'],
    shouldParse: true,
  },
  {
    name: 'FORWARD 后再定义过程',
    code: 'program test;\nprocedure p; forward;\nprocedure p;\nbegin\nend;\nbegin\n  p;\nend.',
    purpose: '验证 forward 声明后可以再定义过程体',
    features: ['forward-declaration', 'procedure-definition'],
    shouldParse: true,
  },

  // ==========================================================================
  // 9. 标签声明边界（4个）
  // ==========================================================================
  {
    name: '单标签声明',
    code: 'program test;\nlabel 10;\nbegin\n10:\nend.',
    purpose: '验证单个标签声明',
    features: ['label-declaration', 'single-label'],
    shouldParse: true,
  },
  {
    name: '多标签声明',
    code: 'program test;\nlabel 10, 20, 30;\nbegin\n10:\n20:\n30:\nend.',
    purpose: '验证多个标签在同一 LABEL 行声明',
    features: ['label-declaration', 'multiple-labels'],
    shouldParse: true,
  },
  {
    name: '标签号 9999',
    code: 'program test;\nlabel 9999;\nbegin\n9999:\nend.',
    purpose: '验证较大的标签号（9999）',
    features: ['label-declaration', 'large-label-number'],
    shouldParse: true,
  },
  {
    name: '标签用于 GOTO',
    code: 'program test;\nlabel 99;\nvar\n  x: integer;\nbegin\n  x := 1;\n  goto 99;\n  x := 2;\n99:\nend.',
    purpose: '验证 GOTO 语句跳转到已声明的标签',
    features: ['label-declaration', 'goto'],
    shouldParse: true,
  },

  // ==========================================================================
  // 10. 数组索引边界（4个）
  // ==========================================================================
  {
    name: '0..100 范围数组',
    code: 'program test;\ntype\n  TArr = array[0..100] of integer;\nvar\n  a: TArr;\nbegin\n  a[0] := 1;\nend.',
    purpose: '验证从 0 开始的数组索引范围',
    features: ['array', 'index-range', 'zero-based'],
    shouldParse: true,
  },
  {
    name: '负数范围数组',
    code: 'program test;\ntype\n  TArr = array[-10..10] of integer;\nvar\n  a: TArr;\nbegin\n  a[-5] := 1;\nend.',
    purpose: '验证包含负数的数组索引范围',
    features: ['array', 'index-range', 'negative-index'],
    shouldParse: true,
  },
  {
    name: '字符范围数组',
    code: "program test;\ntype\n  TArr = array['a'..'z'] of integer;\nvar\n  a: TArr;\nbegin\n  a['m'] := 1;\nend.",
    purpose: '验证字符类型作为数组索引范围',
    features: ['array', 'index-range', 'char-index'],
    shouldParse: true,
  },
  {
    name: '多维数组',
    code: 'program test;\ntype\n  TArr = array[1..10, 1..20] of integer;\nvar\n  a: TArr;\nbegin\n  a[1, 2] := 3;\nend.',
    purpose: '验证二维数组的声明和访问',
    features: ['array', 'multidimensional-array'],
    shouldParse: true,
  },
]

describe('M3.5 Parser Boundary Conformance', () => {
  tests.forEach(t => {
    test(t.name, () => { runParseTest(t) })
  })
})
