import { PascalTest, runPascalTests } from './_helper'
import { describe } from './_helper.ts'

const tests: PascalTest[] = [
  // ==========================================================================
  // 从 m3.5 复制的测试用例 - 验证解析和执行
  // ==========================================================================

  // ------------------------------
  // 解析边界测试
  // ------------------------------
  {
    name: '空 begin end 程序',
    code: `program test;
begin
end.`,
    purpose: '验证只有空 compound statement 的最小程序能解析和执行',
  },
  {
    name: '只有 program 声明的程序',
    code: 'program test;\nbegin\nend.',
    purpose: '验证最小完整程序结构：program + 空 begin end',
  },
  {
    name: '无变量无过程的程序',
    code: `program test;

begin
end.`,
    purpose: '验证没有变量和过程声明的程序能正常解析和执行',
  },
  {
    name: '带有程序参数的程序',
    code: 'program test(input, output);\nbegin\nend.',
    purpose: '验证带参数列表的 program 声明',
  },
  {
    name: '花括号块注释在程序开头',
    code: '{ this is a comment }\nprogram test;\nbegin\nend.',
    purpose: '验证块注释出现在程序开头时被正确跳过',
  },
  {
    name: '(* *) 风格块注释',
    code: '(* another comment *)\nprogram test;\nbegin\nend.',
    purpose: '验证圆括号星号风格的块注释',
  },
  {
    name: '空注释',
    code: '{}\nprogram test;\nbegin\nend.',
    purpose: '验证空花括号注释能正确处理',
  },
  {
    name: '多行块注释',
    code: '{\n  line 1\n  line 2\n  line 3\n}\nprogram test;\nbegin\nend.',
    purpose: '验证跨越多行的块注释',
  },
  {
    name: '单字母标识符',
    code: 'program test;\nvar\n  x: integer;\nbegin\n  x := 1;\nend.',
    purpose: '验证单字母变量名是合法标识符',
  },
  {
    name: '大小写混合标识符',
    code: 'program test;\nvar\n  MyVar: integer;\nbegin\n  myvar := 1;\n  MYVAR := 2;\nend.',
    purpose: '验证 Pascal 标识符大小写不敏感',
  },
  {
    name: '零值整数',
    code: 'program test;\nvar\n  x: integer;\nbegin\n  x := 0;\nend.',
    purpose: '验证零值整数常量',
  },
  {
    name: '负数常量',
    code: 'program test;\nvar\n  x: integer;\nbegin\n  x := -123;\nend.',
    purpose: '验证负整数表达式',
  },
  {
    name: '空字符串',
    code: `program test;\nvar\n  s: string;\nbegin\n  s := '';\nend.`,
    purpose: '验证空字符串字面量',
    extensions: ['string'],
  },
  {
    name: '单字符字符串',
    code: `program test;\nvar\n  s: string;\nbegin\n  s := 'a';\nend.`,
    purpose: '验证单字符字符串',
    extensions: ['string'],
  },
  {
    name: '转义引号（双写单引号）',
    code: `program test;\nvar\n  s: string;\nbegin\n  s := 'it''s';\nend.`,
    purpose: '验证 Pascal 中通过双写单引号转义引号',
    extensions: ['string'],
  }, // ------------------------------
  // 运算符优先级测试
  // ------------------------------
  {
    name: 'multiply has higher precedence than add',
    code: 'program test;\nvar\n  a, b, c: integer;\nbegin\n  a := 2 + 3 * 4;\nend.',
    purpose: '验证 * 优先级高于 +',
  },
  {
    name: 'parentheses change precedence',
    code: 'program test;\nvar\n  a, b, c: integer;\nbegin\n  a := (2 + 3) * 4;\nend.',
    purpose: '验证括号可以改变优先级',
  },
  {
    name: 'NOT has highest precedence among logical operators',
    code: 'program test;\nvar\n  a, b: boolean;\n  c: boolean;\nbegin\n  c := NOT a AND b;\nend.',
    purpose: '验证 NOT 优先级高于 AND',
  },
  {
    name: 'AND has higher precedence than OR',
    code: 'program test;\nvar\n  a, b, c: boolean;\n  d: boolean;\nbegin\n  d := a OR b AND c;\nend.',
    purpose: '验证 AND 优先级高于 OR',
  }, // ------------------------------
  // 作用域测试
  // ------------------------------
  {
    name: '全局变量在主程序体可见',
    code: 'program test;\nvar\n  x: integer;\nbegin\n  x := 1;\nend.',
    purpose: '验证主程序中声明的变量在主程序作用域内',
  },
  {
    name: '过程内声明的变量',
    code: 'program test;\nprocedure p;\nvar\n  x: integer;\nbegin\n  x := 1;\nend;\nbegin\n  p;\nend.',
    purpose: '验证过程内声明的变量属于过程的局部作用域',
  },
  {
    name: '函数名作为返回值变量',
    code: 'program test;\nfunction f: integer;\nbegin\n  f := 1;\nend;\nbegin\nend.',
    purpose: '验证函数名在函数作用域内作为返回值变量',
  },
  {
    name: '函数参数作用域',
    code: 'program test;\nfunction f(x: integer): integer;\nbegin\n  f := x;\nend;\nbegin\nend.',
    purpose: '验证函数参数在函数作用域内可见',
  },
  {
    name: '一层嵌套过程',
    code:
      'program test;\nprocedure outer;\nprocedure inner;\nbegin\nend;\nbegin\n  inner;\nend;\nbegin\n  outer;\nend.',
    purpose: '验证一层嵌套过程的作用域结构',
  },
  {
    name: '嵌套过程访问外层变量',
    code:
      'program test;\nprocedure outer;\nvar\n  x: integer;\n  procedure inner;\n  begin\n    x := x + 1;\n  end;\nbegin\n  x := 0;\n  inner;\nend;\nbegin\n  outer;\nend.',
    purpose: '验证嵌套过程访问外层作用域的变量',
  }, // ------------------------------
  // 过程和函数测试
  // ------------------------------
  {
    name: '无参过程声明与调用',
    code: 'program test;\nprocedure Hello;\nbegin\nend;\nbegin\n  Hello;\nend.',
    purpose: '测试无参数过程的声明和调用',
  },
  {
    name: '单参过程声明与调用',
    code: 'program test;\nprocedure PrintNum(n: integer);\nbegin\nend;\nbegin\n  PrintNum(42);\nend.',
    purpose: '测试单个值参数的过程声明和调用',
  },
  {
    name: '无参函数声明与调用',
    code:
      'program test;\nvar\n  x: integer;\nfunction GetAnswer: integer;\nbegin\n  GetAnswer := 42;\nend;\nbegin\n  x := GetAnswer;\nend.',
    purpose: '测试无参数函数的声明和调用',
  },
  {
    name: '单参函数声明与调用',
    code:
      'program test;\nvar\n  y: integer;\nfunction Square(x: integer): integer;\nbegin\n  Square := x * x;\nend;\nbegin\n  y := Square(5);\nend.',
    purpose: '测试单个参数函数的声明和调用',
  },
  {
    name: '函数返回值赋值',
    code:
      'program test;\nvar\n  m: integer;\nfunction Max(a, b: integer): integer;\nbegin\n  if a > b then\n    Max := a\n  else\n    Max := b;\nend;\nbegin\n  m := Max(10, 20);\nend.',
    purpose: '测试函数体内对函数名赋值（返回值）',
  },
  {
    name: '嵌套函数调用',
    code:
      'program test;\nvar\n  x: integer;\nfunction Outer: integer;\n  function Inner: integer;\n  begin\n    Inner := 10;\n  end;\nbegin\n  Outer := Inner * 2;\nend;\nbegin\n  x := Outer;\nend.',
    purpose: '测试嵌套函数的声明和调用',
  },
  {
    name: '过程 forward 声明',
    code:
      'program test;\nprocedure ForwardProc; forward;\nprocedure ForwardProc;\nbegin\nend;\nbegin\n  ForwardProc;\nend.',
    purpose: '测试过程的 FORWARD 声明',
  },
  {
    name: '函数 forward 声明',
    code:
      'program test;\nvar\n  x: integer;\nfunction ForwardFunc: integer; forward;\nfunction ForwardFunc: integer;\nbegin\n  ForwardFunc := 42;\nend;\nbegin\n  x := ForwardFunc;\nend.',
    purpose: '测试函数的 FORWARD 声明',
  }, // ------------------------------
  // 递归测试
  // ------------------------------
  {
    name: '简单递归过程',
    code:
      'program test;\nprocedure CountDown(n: integer);\nbegin\n  if n > 0 then\n    CountDown(n - 1);\nend;\nbegin\n  CountDown(10);\nend.',
    purpose: '测试最简单的直接递归过程',
  },
  {
    name: '阶乘递归函数',
    code:
      'program test;\nvar\n  f: integer;\nfunction Factorial(n: integer): integer;\nbegin\n  if n <= 1 then\n    Factorial := 1\n  else\n    Factorial := n * Factorial(n - 1);\nend;\nbegin\n  f := Factorial(5);\nend.',
    purpose: '测试经典的阶乘递归函数模式',
  },
  {
    name: '两个过程相互递归',
    code:
      'program test;\nprocedure A(n: integer); forward;\nprocedure B(n: integer);\nbegin\n  if n > 0 then\n    A(n - 1);\nend;\nprocedure A(n: integer);\nbegin\n  if n > 0 then\n    B(n - 1);\nend;\nbegin\n  A(10);\nend.',
    purpose: '测试两个过程通过 forward 声明实现相互递归',
  }, // ------------------------------
  // 类型测试
  // ------------------------------
  {
    name: '枚举类型',
    code: 'program test;\ntype\n  Color = (Red, Green, Blue);\nvar\n  c: Color;\nbegin\n  c := Red;\nend.',
    purpose: '测试枚举类型的声明和使用',
  },
  {
    name: 'record 类型',
    code:
      'program test;\ntype\n  TRec = record\n    x: integer;\n    y: integer;\n  end;\nvar\n  r: TRec;\nbegin\n  r.x := 1;\n  r.y := 2;\nend.',
    purpose: '测试 record 类型的声明和字段访问',
  },
  {
    name: '数组类型',
    code: 'program test;\ntype\n  TArr = array[1..10] of integer;\nvar\n  a: TArr;\nbegin\n  a[1] := 10;\nend.',
    purpose: '测试数组类型的声明和访问',
  },
  {
    name: '子界类型',
    code: 'program test;\ntype\n  SmallInt = 0..100;\nvar\n  n: SmallInt;\nbegin\n  n := 50;\nend.',
    purpose: '测试子界类型的声明和使用',
  }, // ------------------------------
  // 控制流测试
  // ------------------------------
  {
    name: '只有 OTHERWISE 的 CASE',
    code: 'program test;\nvar\n  x: integer;\nbegin\n  case x of\n    otherwise\n      x := 0;\n  end;\nend.',
    purpose: '验证 CASE 语句可以只有 OTHERWISE 分支',
  },
  {
    name: 'FORWARD 后再定义过程',
    code: 'program test;\nprocedure p; forward;\nprocedure p;\nbegin\nend;\nbegin\n  p;\nend.',
    purpose: '验证 forward 声明后可以再定义过程体',
  },
  {
    name: '标签用于 GOTO',
    code: 'program test;\nlabel 99;\nvar\n  x: integer;\nbegin\n  x := 1;\n  goto 99;\n  x := 2;\n99:\nend.',
    purpose: '验证 GOTO 语句跳转到已声明的标签',
  },
  {
    name: 'WITH 语句',
    code:
      'program test;\ntype\n  TRec = record\n    x: integer;\n  end;\nvar\n  r: TRec;\nbegin\n  with r do\n    x := 1;\nend.',
    purpose: '验证 WITH 语句创建记录字段的局部作用域',
  },
]

describe('M5 JS - M3.5 Conformance Tests', () => {
  runPascalTests(tests)
})
