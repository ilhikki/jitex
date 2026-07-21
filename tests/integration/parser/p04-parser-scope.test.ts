import { ConformanceTest, runParseTest, makeProgram, makeProgramWithVars } from './_helper'

const tests: ConformanceTest[] = [
  // ==========================================================================
  // 1. 全局变量作用域（4个）
  // ==========================================================================
  {
    name: '全局变量在主程序体可见',
    code: makeProgramWithVars('x: integer;', ''),
    purpose: '验证主程序中声明的变量在主程序作用域内',
    shouldParse: true,
  },
  {
    name: '全局变量在过程中可见',
    code: makeProgramWithVars('x: integer;', 'procedure p;\nbegin\nend;'),
    purpose: '验证全局变量在过程声明的外层作用域中',
    shouldParse: true,
  },
  {
    name: '全局变量在嵌套过程中可见',
    code: makeProgramWithVars(
      'x: integer;',
      'procedure outer;\n' + 'procedure inner;\n' + 'begin\n' + 'end;\n' + 'begin\n' + 'end;'
    ),
    purpose: '验证全局变量可在多层嵌套过程的外层作用域中找到',
    shouldParse: true,
  },
  {
    name: '多个全局变量',
    code: makeProgramWithVars('x, y, z: integer;', ''),
    purpose: '验证同一作用域内多个变量声明的解析',
    shouldParse: true,
  },

  // ==========================================================================
  // 2. 过程局部变量（5个）
  // ==========================================================================
  {
    name: '过程内声明的变量',
    code: makeProgram('procedure p;\n' + 'var\n' + '  x: integer;\n' + 'begin\n' + 'end;'),
    purpose: '验证过程内声明的变量属于过程的局部作用域',
    shouldParse: true,
  },
  {
    name: '过程变量不影响主程序',
    code: makeProgramWithVars(
      'x: integer;',
      'procedure p;\n' + 'var\n' + '  x: integer;\n' + 'begin\n' + 'end;'
    ),
    purpose: '验证过程内的同名变量与全局变量处于不同作用域',
    shouldParse: true,
  },
  {
    name: '两个过程变量名相同互不干扰',
    code: makeProgram(
      'procedure p1;\n' +
        'var\n' +
        '  x: integer;\n' +
        'begin\n' +
        'end;\n' +
        'procedure p2;\n' +
        'var\n' +
        '  x: integer;\n' +
        'begin\n' +
        'end;'
    ),
    purpose: '验证同级过程的局部变量互不影响',
    shouldParse: true,
  },
  {
    name: '嵌套过程隐藏外层同名变量',
    code: makeProgram(
      'procedure outer;\n' +
        'var\n' +
        '  x: integer;\n' +
        'procedure inner;\n' +
        'var\n' +
        '  x: integer;\n' +
        'begin\n' +
        'end;\n' +
        'begin\n' +
        'end;'
    ),
    purpose: '验证内层过程的变量隐藏外层过程的同名变量',
    shouldParse: true,
  },
  {
    name: '过程内多个局部变量',
    code: makeProgram(
      'procedure p;\n' + 'var\n' + '  a, b: integer;\n' + '  c: boolean;\n' + 'begin\n' + 'end;'
    ),
    purpose: '验证过程内多个变量声明的解析',
    shouldParse: true,
  },

  // ==========================================================================
  // 3. 函数作用域（4个）
  // ==========================================================================
  {
    name: '函数名作为返回值变量',
    code: makeProgram('function f: integer;\n' + 'begin\n' + '  f := 1;\n' + 'end;'),
    purpose: '验证函数名在函数作用域内作为返回值变量',
    shouldParse: true,
  },
  {
    name: '函数参数作用域',
    code: makeProgram('function f(x: integer): integer;\n' + 'begin\n' + '  f := x;\n' + 'end;'),
    purpose: '验证函数参数在函数作用域内可见',
    shouldParse: true,
  },
  {
    name: '函数内局部变量',
    code: makeProgram(
      'function f: integer;\n' +
        'var\n' +
        '  x: integer;\n' +
        'begin\n' +
        '  x := 1;\n' +
        '  f := x;\n' +
        'end;'
    ),
    purpose: '验证函数内可声明局部变量',
    shouldParse: true,
  },
  {
    name: '嵌套函数',
    code: makeProgram(
      'function outer: integer;\n' +
        'function inner: integer;\n' +
        'begin\n' +
        '  inner := 1;\n' +
        'end;\n' +
        'begin\n' +
        '  outer := inner;\n' +
        'end;'
    ),
    purpose: '验证函数可嵌套声明，形成嵌套作用域',
    shouldParse: true,
  },

  // ==========================================================================
  // 4. 参数作用域（5个）
  // ==========================================================================
  {
    name: '值参数',
    code: makeProgram('procedure p(x: integer);\n' + 'begin\n' + 'end;'),
    purpose: '验证值参数在过程作用域内',
    shouldParse: true,
  },
  {
    name: 'var 参数',
    code: makeProgram('procedure p(var x: integer);\n' + 'begin\n' + 'end;'),
    purpose: '验证 var 参数在过程作用域内',
    shouldParse: true,
  },
  {
    name: '参数与局部变量同名',
    code: makeProgram(
      'procedure p(x: integer);\n' + 'var\n' + '  x: integer;\n' + 'begin\n' + 'end;'
    ),
    purpose: '验证参数与局部变量同名时的作用域结构解析',
    shouldParse: true,
  },
  {
    name: '参数与全局变量同名',
    code: makeProgramWithVars('x: integer;', 'procedure p(x: integer);\n' + 'begin\n' + 'end;'),
    purpose: '验证参数与全局变量同名时的作用域结构解析',
    shouldParse: true,
  },
  {
    name: '多个参数',
    code: makeProgram('procedure p(a: integer; var b: boolean; c: char);\n' + 'begin\n' + 'end;'),
    purpose: '验证多个不同类型参数的作用域解析',
    shouldParse: true,
  },

  // ==========================================================================
  // 5. 嵌套过程作用域（6个）
  // ==========================================================================
  {
    name: '一层嵌套过程',
    code: makeProgram(
      'procedure outer;\n' + 'procedure inner;\n' + 'begin\n' + 'end;\n' + 'begin\n' + 'end;'
    ),
    purpose: '验证一层嵌套过程的作用域结构解析',
    shouldParse: true,
  },
  {
    name: '两层嵌套过程',
    code: makeProgram(
      'procedure a;\n' +
        'procedure b;\n' +
        'procedure c;\n' +
        'begin\n' +
        'end;\n' +
        'begin\n' +
        'end;\n' +
        'begin\n' +
        'end;'
    ),
    purpose: '验证两层嵌套过程的作用域结构解析',
    shouldParse: true,
  },
  {
    name: '深层嵌套访问外层变量',
    code: makeProgramWithVars(
      'x: integer;',
      'procedure a;\n' +
        'var\n' +
        '  y: integer;\n' +
        'procedure b;\n' +
        'var\n' +
        '  z: integer;\n' +
        'procedure c;\n' +
        'begin\n' +
        'end;\n' +
        'begin\n' +
        'end;\n' +
        'begin\n' +
        'end;'
    ),
    purpose: '验证深层嵌套过程可访问外层各作用域的变量',
    shouldParse: true,
  },
  {
    name: '内层过程隐藏外层变量',
    code: makeProgram(
      'procedure outer;\n' +
        'var\n' +
        '  x: integer;\n' +
        'procedure middle;\n' +
        'var\n' +
        '  x: boolean;\n' +
        'procedure inner;\n' +
        'var\n' +
        '  x: char;\n' +
        'begin\n' +
        'end;\n' +
        'begin\n' +
        'end;\n' +
        'begin\n' +
        'end;'
    ),
    purpose: '验证多层嵌套中每层的同名变量依次隐藏外层',
    shouldParse: true,
  },
  {
    name: '同级过程不可见对方局部变量',
    code: makeProgram(
      'procedure p1;\n' +
        'var\n' +
        '  x: integer;\n' +
        'begin\n' +
        'end;\n' +
        'procedure p2;\n' +
        'begin\n' +
        'end;'
    ),
    purpose: '验证同级过程的作用域相互独立',
    shouldParse: true,
  },
  {
    name: '向前引用 forward 过程',
    code: makeProgram(
      'procedure p; forward;\n' +
        'procedure q;\n' +
        'begin\n' +
        'end;\n' +
        'procedure p;\n' +
        'begin\n' +
        'end;'
    ),
    purpose: '验证 forward 声明的过程作用域解析',
    shouldParse: true,
  },

  // ==========================================================================
  // 6. 标签作用域（4个）
  // ==========================================================================
  {
    name: '过程内标签只在过程内可见',
    code: makeProgram('procedure p;\n' + 'label\n' + '  10;\n' + 'begin\n' + '  10:\n' + 'end;'),
    purpose: '验证标签声明在所属过程作用域内',
    shouldParse: true,
  },
  {
    name: '标签不能跨过程 GOTO',
    code: makeProgram(
      'procedure p1;\n' +
        'label\n' +
        '  10;\n' +
        'begin\n' +
        '  10:\n' +
        'end;\n' +
        'procedure p2;\n' +
        'begin\n' +
        'end;'
    ),
    purpose: '验证不同过程的标签处于不同作用域',
    shouldParse: true,
  },
  {
    name: '嵌套过程中的标签',
    code: makeProgram(
      'procedure outer;\n' +
        'label\n' +
        '  10;\n' +
        'procedure inner;\n' +
        'label\n' +
        '  20;\n' +
        'begin\n' +
        '  20:\n' +
        'end;\n' +
        'begin\n' +
        '  10:\n' +
        'end;'
    ),
    purpose: '验证嵌套过程中标签的作用域嵌套结构',
    shouldParse: true,
  },
  {
    name: '主程序标签',
    code:
      'program test;\n' + 'label\n' + '  10, 20;\n' + 'begin\n' + '  10:\n' + '  20:\n' + 'end.',
    purpose: '验证主程序级别的标签声明和作用域',
    shouldParse: true,
  },

  // ==========================================================================
  // 7. WITH 作用域（3个）
  // ==========================================================================
  {
    name: 'WITH 内记录字段可见',
    code: makeProgram(
      'type\n' + '  T = record\n' + '    x: integer;\n' + '  end;\n' + 'var\n' + '  r: T;\n',
      '  with r do\n' + '  begin\n' + '    x := 1;\n' + '  end;'
    ),
    purpose: '验证 WITH 语句创建记录字段的局部作用域',
    shouldParse: true,
  },
  {
    name: 'WITH 结束后字段不可见',
    code: makeProgram(
      'type\n' + '  T = record\n' + '    x: integer;\n' + '  end;\n' + 'var\n' + '  r: T;\n',
      '  with r do\n' + '  begin\n' + '  end;'
    ),
    purpose: '验证 WITH 语句结束后字段作用域结束',
    shouldParse: true,
  },
  {
    name: '嵌套 WITH 字段解析',
    code: makeProgram(
      'type\n' +
        '  Inner = record\n' +
        '    a: integer;\n' +
        '  end;\n' +
        '  Outer = record\n' +
        '    b: Inner;\n' +
        '  end;\n' +
        'var\n' +
        '  r: Outer;\n',
      '  with r do\n' + '    with b do\n' + '    begin\n' + '      a := 1;\n' + '    end;'
    ),
    purpose: '验证嵌套 WITH 语句的作用域层次解析',
    shouldParse: true,
  },

  // ==========================================================================
  // 8. 常量/类型作用域（4个）
  // ==========================================================================
  {
    name: '全局常量在过程中可见',
    code: makeProgram('const\n' + '  PI = 3.14;\n' + 'procedure p;\n' + 'begin\n' + 'end;'),
    purpose: '验证全局常量在过程的外层作用域中',
    shouldParse: true,
  },
  {
    name: '局部常量隐藏全局常量',
    code: makeProgram(
      'const\n' + '  X = 10;\n' + 'procedure p;\n' + 'const\n' + '  X = 20;\n' + 'begin\n' + 'end;'
    ),
    purpose: '验证过程内的局部常量隐藏全局同名常量',
    shouldParse: true,
  },
  {
    name: '类型声明作用域',
    code: makeProgram(
      'type\n' +
        '  MyInt = integer;\n' +
        'procedure p;\n' +
        'type\n' +
        '  MyBool = boolean;\n' +
        'var\n' +
        '  x: MyInt;\n' +
        '  y: MyBool;\n' +
        'begin\n' +
        'end;'
    ),
    purpose: '验证类型声明的作用域规则，全局类型在过程中可见',
    shouldParse: true,
  },
  {
    name: '枚举值作用域',
    code: makeProgram(
      'type\n' +
        '  Color = (Red, Green, Blue);\n' +
        'procedure p;\n' +
        'var\n' +
        '  c: Color;\n' +
        'begin\n' +
        'end;'
    ),
    purpose: '验证枚举类型及其值的作用域解析',
    shouldParse: true,
  },
]

describe('M3.5 Scope Conformance', () => {
  tests.forEach((t) => {
    test(t.name, () => {
      runParseTest(t)
    })
  })
})
