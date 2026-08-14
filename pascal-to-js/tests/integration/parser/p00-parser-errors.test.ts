import { ConformanceTest, makeProgramWithVars, runParseTests } from './_helper'
import { describe } from 'vitest'

const tests: ConformanceTest[] = [
  // ==========================================================================
  // 1. 程序结构错误（5个）
  // ==========================================================================
  {
    name: '缺少 program 关键字',
    code: 'test;\nbegin\nend.',
    purpose: '验证缺少 PROGRAM 关键字的程序会被正确检测为错误',
    shouldParse: false,
  },
  {
    name: '缺少结束点 end.',
    code: 'program test;\nbegin\nend',
    purpose: '验证程序末尾缺少 DOT（end.）会报错',
    shouldParse: false,
  },
  {
    name: 'program 后无分号',
    code: 'program test\nbegin\nend.',
    purpose: '验证 PROGRAM 声明后缺少分号会报错',
    shouldParse: false,
  },
  {
    name: 'begin 后无对应 end',
    code: 'program test;\nbegin\n  x := 1;\n.',
    purpose: '验证 BEGIN 缺少匹配的 END 会报错',
    shouldParse: false,
  },
  {
    name: '多余的 end',
    code: 'program test;\nbegin\nbegin\nend\nend\nend.',
    purpose: '验证多余的 END 关键字会被检测为错误',
    shouldParse: false,
  },

  // ==========================================================================
  // 2. 声明段错误（6个）
  // ==========================================================================
  {
    name: 'var 块出现在 begin 之后',
    code: 'program test;\nbegin\nvar\n  x: integer;\nend.',
    purpose: '验证 VAR 声明出现在语句部分（BEGIN之后）会报错',
    shouldParse: false,
  },
  {
    name: 'type 声明缺少等号',
    code: 'program test;\ntype\n  TInt integer;\nbegin\nend.',
    purpose: '验证 TYPE 声明中缺少等号会报错',
    shouldParse: false,
  },
  {
    name: 'const 声明缺少等号',
    code: 'program test;\nconst\n  C 123;\nbegin\nend.',
    purpose: '验证 CONST 声明中缺少等号会报错',
    shouldParse: false,
  },
  {
    name: 'label 后无数字',
    code: 'program test;\nlabel abc;\nbegin\nend.',
    purpose: '验证 LABEL 声明后必须跟数字标签，否则报错',

    shouldParse: false,
  },
  {
    name: '重复的 var 声明块',
    code: 'program test;\nvar\n  x: integer;\nvar\n  y: integer;\nbegin\nend.',
    purpose: '验证两个 VAR 块（声明段顺序错误）会报错',
    shouldParse: false,
  },
  {
    name: '变量声明缺少类型',
    code: 'program test;\nvar\n  x: ;\nbegin\nend.',
    purpose: '验证变量声明中冒号后缺少类型会报错',
    shouldParse: false,
  },

  // ==========================================================================
  // 3. 表达式错误（6个）
  // ==========================================================================
  {
    name: '表达式缺少右操作数',
    code: makeProgramWithVars('a: integer;', 'begin\n  a := 5 + ;\nend.'),
    purpose: '验证二元运算符缺少右操作数会报错',
    shouldParse: false,
  },
  {
    name: '表达式缺少左操作数',
    code: makeProgramWithVars('a: integer;', 'begin\n  a := * 5;\nend.'),
    purpose: '验证乘号缺少左操作数会报错（一元运算符只有 +/-/NOT）',
    shouldParse: false,
  },
  {
    name: '括号不匹配 - 缺少右括号',
    code: makeProgramWithVars('a: integer;', 'begin\n  a := (5 + 3;\nend.'),
    purpose: '验证左括号缺少匹配的右括号会报错',
    shouldParse: false,
  },
  {
    name: '运算符连续出现',
    code: makeProgramWithVars('a, b: integer;', 'begin\n  a := b + * 2;\nend.'),
    purpose: '验证连续两个二元运算符（如 + *）会报错',
    shouldParse: false,
  },
  {
    name: '赋值语句 := 写成 =',
    code: makeProgramWithVars('a: integer;', 'begin\n  a = 5;\nend.'),
    purpose: '验证使用 = 代替 := 进行赋值会报错',
    shouldParse: false,
  },
  {
    name: '相等比较 = 写成 :=',
    code: makeProgramWithVars('a, b: integer;', 'begin\n  if a := 5 then\n    b := 1;\nend.'),
    purpose: '验证在条件表达式中使用 := 代替 = 会报错',
    shouldParse: false,
  },

  // ==========================================================================
  // 4. 语句错误（6个）
  // ==========================================================================
  {
    name: 'IF 缺少 THEN',
    code: makeProgramWithVars('x: integer;', 'begin\n  if x > 0\n    x := 1;\nend.'),
    purpose: '验证 IF 语句缺少 THEN 关键字会报错',
    shouldParse: false,
  },
  {
    name: 'WHILE 缺少 DO',
    code: makeProgramWithVars('x: integer;', 'begin\n  while x > 0\n    x := x - 1;\nend.'),
    purpose: '验证 WHILE 语句缺少 DO 关键字会报错',
    shouldParse: false,
  },
  {
    name: 'FOR 缺少 TO/DOWNTO',
    code: makeProgramWithVars('i: integer;', 'begin\n  for i := 1 10 do\n    writeln(i);\nend.'),
    purpose: '验证 FOR 语句缺少 TO 或 DOWNTO 会报错',
    shouldParse: false,
  },
  {
    name: 'CASE 缺少 OF',
    code: makeProgramWithVars('x, y: integer;', 'begin\n  case x\n    1: y := 10;\n  end;\nend.'),
    purpose: '验证 CASE 语句缺少 OF 关键字会报错',
    shouldParse: false,
  },
  {
    name: 'REPEAT 缺少 UNTIL',
    code: makeProgramWithVars('x: integer;', 'begin\n  repeat\n    x := x + 1;\n  end;\nend.'),
    purpose: '验证 REPEAT 语句缺少 UNTIL（误用 END）会报错',
    shouldParse: false,
  },
  {
    name: 'GOTO 后无标签',
    code: 'program test;\nbegin\n  goto;\nend.',
    purpose: '验证 GOTO 语句后缺少标签数字会报错',
    shouldParse: false,
  },

  // ==========================================================================
  // 5. 过程/函数错误（6个）
  // ==========================================================================
  {
    name: '过程声明缺少分号',
    code: 'program test;\nprocedure p\nbegin\nend;\nbegin\nend.',
    purpose: '验证过程声明头后缺少分号会报错',
    shouldParse: false,
  },
  {
    name: '函数缺少返回类型',
    code: 'program test;\nfunction f;\nbegin\nend;\nbegin\nend.',
    purpose: '验证函数声明中缺少返回类型（冒号+类型）会报错',
    shouldParse: false,
  },
  {
    name: '参数列表缺少右括号',
    code: 'program test;\nprocedure p(x: integer;\nbegin\nend;\nbegin\nend.',
    purpose: '验证过程参数列表缺少右括号会报错',
    shouldParse: false,
  },
  {
    name: '过程名缺失',
    code: 'program test;\nprocedure;\nbegin\nend;\nbegin\nend.',
    purpose: '验证 PROCEDURE 后缺少过程名会报错',
    shouldParse: false,
  },
  {
    name: 'forward 后缺少分号',
    code: 'program test;\nprocedure p; forward\nbegin\nend.',
    purpose: '验证 FORWARD 声明后缺少分号会报错',
    shouldParse: false,
  },
  {
    name: '过程体缺少 begin',
    code: 'program test;\nprocedure p;\nend;\nbegin\nend.',
    purpose: '验证过程块中缺少 BEGIN（直接 END）会报错',
    shouldParse: false,
  },

  // ==========================================================================
  // 6. 类型错误（3个）
  // ==========================================================================
  {
    name: '数组类型缺少 OF',
    code: 'program test;\ntype\n  TArr = array[1..10] integer;\nbegin\nend.',
    purpose: '验证数组类型声明中缺少 OF 关键字会报错',
    shouldParse: false,
  },
  {
    name: '记录类型缺少 END',
    code: 'program test;\ntype\n  TRec = record\n    x: integer;\nbegin\nend.',
    purpose: '验证记录类型声明缺少 END 会报错',
    shouldParse: false,
  },
  {
    name: '子界类型缺少 ..',
    code: 'program test;\ntype\n  TRange = 1 100;\nbegin\nend.',
    purpose: '验证子界类型中缺少 .. 运算符会报错',
    shouldParse: false,
  },

  // ==========================================================================
  // 7. 词汇错误（3个）
  // ==========================================================================
  {
    name: '非法字符 @',
    code: 'program @test;\nbegin\nend.',
    purpose: '验证非法字符（如 @）会导致解析失败',
    shouldParse: false,
  },
  {
    name: '未闭合字符串',
    code: "program test;\nvar\n  s: string;\nbegin\n  s := 'hello world;\nend.",
    purpose: '验证未闭合的字符串字面量会导致解析失败',
    shouldParse: false,
  },
  {
    name: '未闭合注释',
    code: 'program test;\n{ this comment never ends\nbegin\nend.',
    purpose: '验证未闭合的块注释会导致解析失败（后续 token 全部被注释吃掉）',
    shouldParse: false,
  },
]

describe('M3.5 Error Handling Conformance', () => {
  runParseTests(tests)
})
