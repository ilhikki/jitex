import { ConformanceTest, runParseTest, makeProgramWithVars } from './_helper'

const tests: ConformanceTest[] = [
  // =========================================================================
  // 1. 算术运算符优先级（8个）
  // =========================================================================
  {
    name: 'multiply has higher precedence than add',
    code: makeProgramWithVars('a, b, c: integer;', 'begin\n  a := 2 + 3 * 4;\nend.'),
    purpose: '验证 * 优先级高于 +，表达式 2 + 3 * 4 应解析为 2 + (3 * 4)',
    features: ['*', '+', 'assignment', 'integer literal'],
    shouldParse: true,
  },
  {
    name: 'divide has higher precedence than subtract',
    code: makeProgramWithVars('a, b, c: real;', 'begin\n  a := 10.0 - 6.0 / 2.0;\nend.'),
    purpose: '验证 / 优先级高于 -，表达式 10 - 6 / 2 应解析为 10 - (6 / 2)',
    features: ['/', '-', 'assignment', 'real literal'],
    shouldParse: true,
  },
  {
    name: 'DIV has higher precedence than add',
    code: makeProgramWithVars('a, b, c: integer;', 'begin\n  a := 5 + 10 DIV 3;\nend.'),
    purpose: '验证 DIV 优先级高于 +，表达式 5 + 10 DIV 3 应解析为 5 + (10 DIV 3)',
    features: ['DIV', '+', 'assignment', 'integer literal'],
    shouldParse: true,
  },
  {
    name: 'MOD has higher precedence than subtract',
    code: makeProgramWithVars('a, b, c: integer;', 'begin\n  a := 20 - 7 MOD 3;\nend.'),
    purpose: '验证 MOD 优先级高于 -，表达式 20 - 7 MOD 3 应解析为 20 - (7 MOD 3)',
    features: ['MOD', '-', 'assignment', 'integer literal'],
    shouldParse: true,
  },
  {
    name: 'unary minus has higher precedence than multiply',
    code: makeProgramWithVars('a, b: integer;', 'begin\n  a := -b * 5;\nend.'),
    purpose: '验证一元负号优先级高于 *，表达式 -b * 5 应解析为 (-b) * 5',
    features: ['unary -', '*', 'assignment'],
    shouldParse: true,
  },
  {
    name: 'parentheses change precedence',
    code: makeProgramWithVars('a, b, c: integer;', 'begin\n  a := (2 + 3) * 4;\nend.'),
    purpose: '验证括号可以改变优先级，(2 + 3) * 4 先算加法再算乘法',
    features: ['parentheses', '*', '+', 'assignment'],
    shouldParse: true,
  },
  {
    name: 'nested parentheses',
    code: makeProgramWithVars(
      'a, b, c, d: integer;',
      'begin\n  a := ((1 + 2) * (3 - 1)) DIV 2;\nend.'
    ),
    purpose: '验证多层嵌套括号的解析，从最内层开始计算',
    features: ['nested parentheses', '*', '+', '-', 'DIV', 'assignment'],
    shouldParse: true,
  },
  {
    name: 'left associativity of same precedence operators',
    code: makeProgramWithVars('a, b, c, d: integer;', 'begin\n  a := 10 - 3 - 2;\nend.'),
    purpose: '验证同级运算符左结合，10 - 3 - 2 应解析为 (10 - 3) - 2',
    features: ['left associativity', '-', 'assignment'],
    shouldParse: true,
  },

  // =========================================================================
  // 2. 关系运算符（6个）
  // =========================================================================
  {
    name: 'equal operator in expression',
    code: makeProgramWithVars('a, b: integer;\n  flag: boolean;', 'begin\n  flag := a = b;\nend.'),
    purpose: '验证 = 关系运算符优先级低于算术运算符，a = b 作为布尔表达式',
    features: ['=', 'relation operator', 'boolean expression', 'assignment'],
    shouldParse: true,
  },
  {
    name: 'not equal operator in expression',
    code: makeProgramWithVars('a, b: integer;\n  flag: boolean;', 'begin\n  flag := a <> b;\nend.'),
    purpose: '验证 <> 关系运算符在表达式中的解析',
    features: ['<>', 'relation operator', 'boolean expression', 'assignment'],
    shouldParse: true,
  },
  {
    name: 'less than operator in expression',
    code: makeProgramWithVars(
      'a, b: integer;\n  flag: boolean;',
      'begin\n  flag := a < b + 1;\nend.'
    ),
    purpose: '验证 < 优先级低于算术运算符，a < b + 1 应解析为 a < (b + 1)',
    features: ['<', 'relation operator', '+', 'boolean expression'],
    shouldParse: true,
  },
  {
    name: 'greater than operator in expression',
    code: makeProgramWithVars(
      'a, b: integer;\n  flag: boolean;',
      'begin\n  flag := a * 2 > b;\nend.'
    ),
    purpose: '验证 > 优先级低于算术运算符，a * 2 > b 应解析为 (a * 2) > b',
    features: ['>', 'relation operator', '*', 'boolean expression'],
    shouldParse: true,
  },
  {
    name: 'less than or equal operator in expression',
    code: makeProgramWithVars(
      'a, b, c: integer;\n  flag: boolean;',
      'begin\n  flag := a + b <= c;\nend.'
    ),
    purpose: '验证 <= 优先级低于算术运算符，a + b <= c 应解析为 (a + b) <= c',
    features: ['<=', 'relation operator', '+', 'boolean expression'],
    shouldParse: true,
  },
  {
    name: 'greater than or equal operator in expression',
    code: makeProgramWithVars(
      'a, b, c: integer;\n  flag: boolean;',
      'begin\n  flag := a >= b - c;\nend.'
    ),
    purpose: '验证 >= 优先级低于算术运算符，a >= b - c 应解析为 a >= (b - c)',
    features: ['>=', 'relation operator', '-', 'boolean expression'],
    shouldParse: true,
  },

  // =========================================================================
  // 3. 逻辑运算符（6个）
  // =========================================================================
  {
    name: 'NOT has highest precedence among logical operators',
    code: makeProgramWithVars('a, b: boolean;\n  c: boolean;', 'begin\n  c := NOT a AND b;\nend.'),
    purpose: '验证 NOT 优先级高于 AND，NOT a AND b 应解析为 (NOT a) AND b',
    features: ['NOT', 'AND', 'logical operator', 'precedence'],
    shouldParse: true,
  },
  {
    name: 'AND has higher precedence than OR',
    code: makeProgramWithVars(
      'a, b, c: boolean;\n  d: boolean;',
      'begin\n  d := a OR b AND c;\nend.'
    ),
    purpose: '验证 AND 优先级高于 OR，a OR b AND c 应解析为 a OR (b AND c)',
    features: ['AND', 'OR', 'logical operator', 'precedence'],
    shouldParse: true,
  },
  {
    name: 'arithmetic > relation > logic three level mix',
    code: makeProgramWithVars(
      'a, b, c: integer;\n  flag: boolean;',
      'begin\n  flag := a + b > c AND a * 2 < 10;\nend.'
    ),
    purpose: '验证三层优先级：算术 > 关系 > 逻辑，先算算术再算关系最后算逻辑',
    features: ['+', '*', '>', '<', 'AND', 'three-level precedence'],
    shouldParse: true,
  },
  {
    name: 'NOT AND OR mixed expression',
    code: makeProgramWithVars(
      'a, b, c: boolean;\n  d: boolean;',
      'begin\n  d := NOT a AND b OR NOT c;\nend.'
    ),
    purpose: '验证 NOT AND OR 混合表达式的优先级：NOT > AND > OR',
    features: ['NOT', 'AND', 'OR', 'mixed logical operators'],
    shouldParse: true,
  },
  {
    name: 'NOT with relation operator',
    code: makeProgramWithVars(
      'a, b: integer;\n  flag: boolean;',
      'begin\n  flag := NOT (a = b);\nend.'
    ),
    purpose: '验证 NOT 与关系运算符的组合使用，带括号的情况',
    features: ['NOT', '=', 'relation operator', 'parentheses'],
    shouldParse: true,
  },
  {
    name: 'AND with multiple relation operators',
    code: makeProgramWithVars(
      'a, b, c: integer;\n  flag: boolean;',
      'begin\n  flag := a > b AND b > c;\nend.'
    ),
    purpose: '验证 AND 与多个关系运算符组合，a > b AND b > c 的解析',
    features: ['AND', '>', 'relation operator', 'chained condition'],
    shouldParse: true,
  },

  // =========================================================================
  // 4. IN 运算符（3个）
  // =========================================================================
  {
    name: 'IN operator with relation precedence',
    code: makeProgramWithVars(
      'ch: char;\n  flag: boolean;',
      "begin\n  flag := ch IN ['a','b','c'];\nend."
    ),
    purpose: '验证 IN 运算符与关系运算符同级，用于集合成员判断',
    features: ['IN', 'set constructor', 'relation operator', 'char literal'],
    shouldParse: true,
  },
  {
    name: 'IN operator with AND precedence',
    code: makeProgramWithVars(
      'n: integer;\n  flag: boolean;',
      'begin\n  flag := n IN [1..10] AND n > 5;\nend.'
    ),
    purpose: '验证 IN 优先级高于 AND，n IN [1..10] AND n > 5 中 IN 先于 AND',
    features: ['IN', 'AND', 'set constructor', 'precedence'],
    shouldParse: true,
  },
  {
    name: 'IN operator with arithmetic',
    code: makeProgramWithVars(
      'n, m: integer;\n  flag: boolean;',
      'begin\n  flag := n + m IN [1..20];\nend.'
    ),
    purpose: '验证算术运算优先级高于 IN，n + m IN [1..20] 应解析为 (n + m) IN [1..20]',
    features: ['IN', '+', 'arithmetic', 'set constructor', 'precedence'],
    shouldParse: true,
  },

  // =========================================================================
  // 5. set 运算符（4个）
  // =========================================================================
  {
    name: 'set union operator +',
    code: makeProgramWithVars(
      's1, s2: set of 1..10;\n  s3: set of 1..10;',
      'begin\n  s3 := s1 + s2;\nend.'
    ),
    purpose: '验证集合并集运算符 + 的解析',
    features: ['set', '+', 'union', 'set type'],
    shouldParse: true,
  },
  {
    name: 'set intersection operator *',
    code: makeProgramWithVars(
      's1, s2: set of 1..10;\n  s3: set of 1..10;',
      'begin\n  s3 := s1 * s2;\nend.'
    ),
    purpose: '验证集合交集运算符 * 的解析',
    features: ['set', '*', 'intersection', 'set type'],
    shouldParse: true,
  },
  {
    name: 'set difference operator -',
    code: makeProgramWithVars(
      's1, s2: set of 1..10;\n  s3: set of 1..10;',
      'begin\n  s3 := s1 - s2;\nend.'
    ),
    purpose: '验证集合差集运算符 - 的解析',
    features: ['set', '-', 'difference', 'set type'],
    shouldParse: true,
  },
  {
    name: 'set mixed operation precedence',
    code: makeProgramWithVars(
      's1, s2, s3: set of 1..10;\n  s4: set of 1..10;',
      'begin\n  s4 := s1 + s2 * s3;\nend.'
    ),
    purpose: '验证集合运算优先级，* 高于 +，s1 + s2 * s3 应解析为 s1 + (s2 * s3)',
    features: ['set', '*', '+', 'precedence', 'set type'],
    shouldParse: true,
  },

  // =========================================================================
  // 6. 复杂混合表达式（10个）
  // =========================================================================
  {
    name: 'arithmetic relation logic full mix',
    code: makeProgramWithVars(
      'a, b, c, d: integer;\n  flag: boolean;',
      'begin\n  flag := a + b * c > d AND a - b < c OR d = 0;\nend.'
    ),
    purpose: '验证算术、关系、逻辑三层运算符完整混合的解析',
    features: ['+', '-', '*', '>', '<', '=', 'AND', 'OR', 'mixed precedence'],
    shouldParse: true,
  },
  {
    name: 'complex expression with parentheses',
    code: makeProgramWithVars(
      'a, b, c: integer;\n  flag: boolean;',
      'begin\n  flag := (a > b) AND (NOT (c = 0) OR a < b * 2);\nend.'
    ),
    purpose: '验证带多层括号的复杂表达式解析',
    features: ['parentheses', 'AND', 'OR', 'NOT', 'nested', 'complex expression'],
    shouldParse: true,
  },
  {
    name: 'function call in expression',
    code: 'program test;\nvar\n  a, b, result: integer;\nfunction max(x, y: integer): integer;\nbegin\n  max := x\nend;\nbegin\n  result := max(a, b) + 10;\nend.',
    purpose: '验证函数调用在表达式中的解析，函数调用优先级高于算术运算',
    features: ['function call', '+', 'expression', 'function declaration'],
    shouldParse: true,
  },
  {
    name: 'array access in expression',
    code: makeProgramWithVars(
      'arr: array[1..10] of integer;\n  i, result: integer;',
      'begin\n  result := arr[i] * 2 + arr[i + 1];\nend.'
    ),
    purpose: '验证数组访问在表达式中的解析，数组访问优先级高于算术运算',
    features: ['array access', '*', '+', 'array type', 'expression'],
    shouldParse: true,
  },
  {
    name: 'field access with operator precedence',
    code: 'program test;\nvar\n  r: record\n    x: integer;\n    y: integer;\n  end;\n  result: integer;\nbegin\n  result := r.x + r.y * 2;\nend.',
    purpose: '验证字段访问的优先级高于算术运算符，r.x + r.y * 2 的正确解析',
    features: ['field access', 'record', '+', '*', 'precedence'],
    shouldParse: true,
  },
  {
    name: 'nested function calls',
    code: 'program test;\nvar\n  a, b, result: integer;\nfunction f(x: integer): integer;\nbegin\n  f := x\nend;\nfunction g(x: integer): integer;\nbegin\n  g := x\nend;\nbegin\n  result := f(g(a) + b);\nend.',
    purpose: '验证嵌套函数调用的解析，函数参数可以是复杂表达式',
    features: ['nested function call', '+', 'function parameter', 'expression'],
    shouldParse: true,
  },
  {
    name: 'nested array access',
    code: makeProgramWithVars(
      'matrix: array[1..5, 1..5] of integer;\n  i, j, result: integer;',
      'begin\n  result := matrix[i, j] + matrix[i + 1, j - 1] * 2;\nend.'
    ),
    purpose: '验证二维数组访问和表达式混合的解析',
    features: ['nested array access', 'multi-dimensional array', '+', '*', 'expression'],
    shouldParse: true,
  },
  {
    name: 'chained field access',
    code: 'program test;\nvar\n  r: record\n    inner: record\n      val: integer;\n    end;\n  end;\n  result: integer;\nbegin\n  result := r.inner.val * 3 + 1;\nend.',
    purpose: '验证链式字段访问的解析，字段访问是左结合的',
    features: ['chained field access', 'nested record', '*', '+', 'precedence'],
    shouldParse: true,
  },
  {
    name: 'function call result in arithmetic',
    code: 'program test;\nvar\n  a, b, c, result: integer;\nfunction sqr(x: integer): integer;\nbegin\n  sqr := x\nend;\nbegin\n  result := sqr(a) + sqr(b) - sqr(c);\nend.',
    purpose: '验证多个函数调用结果参与算术运算的解析',
    features: ['function call', '+', '-', 'arithmetic expression'],
    shouldParse: true,
  },
  {
    name: 'array access result in boolean expression',
    code: makeProgramWithVars(
      'arr: array[1..10] of integer;\n  i: integer;\n  flag: boolean;',
      'begin\n  flag := arr[i] > 0 AND arr[i] < 100;\nend.'
    ),
    purpose: '验证数组访问结果参与布尔表达式的解析',
    features: ['array access', '>', '<', 'AND', 'boolean expression'],
    shouldParse: true,
  },

  // =========================================================================
  // 7. 赋值语句中的表达式（5个）
  // =========================================================================
  {
    name: 'simple assignment',
    code: makeProgramWithVars('a, b: integer;', 'begin\n  a := b;\nend.'),
    purpose: '验证简单赋值语句的解析',
    features: [':=', 'assignment', 'simple expression'],
    shouldParse: true,
  },
  {
    name: 'complex right-hand side expression',
    code: makeProgramWithVars(
      'a, b, c, d: integer;\n  result: integer;',
      'begin\n  result := a * b + c DIV d - (a + b) MOD c;\nend.'
    ),
    purpose: '验证复杂右值表达式的赋值，包含多种算术运算符和括号',
    features: [':=', '*', '+', 'DIV', '-', 'MOD', 'parentheses', 'complex rvalue'],
    shouldParse: true,
  },
  {
    name: 'multiple variable assignments',
    code: makeProgramWithVars(
      'a, b, c: integer;',
      'begin\n  a := 1;\n  b := 2;\n  c := a + b;\nend.'
    ),
    purpose: '验证多个赋值语句连续出现，Pascal 不支持链式赋值 a:=b:=c',
    features: [':=', 'multiple assignments', 'statement sequence'],
    shouldParse: true,
  },
  {
    name: 'assignment with arithmetic and function call',
    code: 'program test;\nvar\n  a, b, result: integer;\nfunction abs(x: integer): integer;\nbegin\n  abs := x\nend;\nbegin\n  result := abs(a - b) * 2 + 1;\nend.',
    purpose: '验证赋值语句中包含函数调用和算术运算的复杂表达式',
    features: [':=', 'function call', '*', '+', '-', 'complex expression'],
    shouldParse: true,
  },
  {
    name: 'assignment with logical expression',
    code: makeProgramWithVars(
      'a, b: integer;\n  flag: boolean;',
      'begin\n  flag := a > 0 AND b < 10 OR a = b;\nend.'
    ),
    purpose: '验证赋值语句中右值为逻辑表达式的情况',
    features: [':=', 'AND', 'OR', '>', '<', '=', 'logical expression'],
    shouldParse: true,
  },

  // =========================================================================
  // 8. IF/WHILE 条件表达式（5个）
  // =========================================================================
  {
    name: 'complex boolean condition in IF',
    code: makeProgramWithVars(
      'a, b, c: integer;',
      'begin\n  if a > 0 AND b < 10 AND c <> 0 then\n    a := 1;\nend.'
    ),
    purpose: '验证 IF 语句中复杂布尔条件的解析，多个 AND 连接',
    features: ['if statement', 'AND', '>', '<', '<>', 'complex condition'],
    shouldParse: true,
  },
  {
    name: 'AND OR short-circuit structure in WHILE',
    code: makeProgramWithVars(
      'i, n: integer;\n  flag: boolean;',
      'begin\n  while i < n AND flag OR i = 0 do\n    i := i + 1;\nend.'
    ),
    purpose: '验证 WHILE 循环中 AND/OR 混合条件表达式的结构解析',
    features: ['while statement', 'AND', 'OR', '<', '=', 'loop condition'],
    shouldParse: true,
  },
  {
    name: 'NOT combination in condition',
    code: makeProgramWithVars(
      'a, b: integer;\n  done: boolean;',
      'begin\n  if NOT (a > b) AND NOT done then\n    a := a + 1;\nend.'
    ),
    purpose: '验证条件表达式中 NOT 与括号和 AND 组合的解析',
    features: ['if statement', 'NOT', 'AND', 'parentheses', 'condition'],
    shouldParse: true,
  },
  {
    name: 'nested condition with parentheses',
    code: makeProgramWithVars(
      'a, b, c, d: integer;',
      'begin\n  if (a > b AND c < d) OR (a = 0 AND NOT (b = 0)) then\n    c := 1;\nend.'
    ),
    purpose: '验证带嵌套括号的复杂条件表达式的解析',
    features: ['if statement', 'parentheses', 'AND', 'OR', 'NOT', 'nested condition'],
    shouldParse: true,
  },
  {
    name: 'mixed arithmetic relation logic condition',
    code: makeProgramWithVars(
      'x, y, z: integer;\n  valid: boolean;',
      'begin\n  while x + y * 2 > z AND x - y < 10 OR valid do\n    x := x + 1;\nend.'
    ),
    purpose: '验证 WHILE 条件中算术、关系、逻辑运算符完整混合的解析',
    features: ['while statement', '+', '*', '-', '>', '<', 'AND', 'OR', 'mixed condition'],
    shouldParse: true,
  },
]

describe('M3.5 Operator Precedence Conformance', () => {
  tests.forEach((t) => {
    test(t.name, () => {
      runParseTest(t)
    })
  })
})
