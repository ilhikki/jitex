import { runInterpreterTest, InterpreterTest } from './_helper'

describe('Q05: Operations and Types', () => {
  describe('Arithmetic Operations', () => {
    const tests: InterpreterTest[] = [
      {
        name: 'addition',
        code: 'program test; var x, y: integer; begin x := 5; y := 3; writeln(x + y); end.',
        purpose: '测试加法运算',
        features: ['arithmetic', 'addition'],
        expectedOutput: '8\n',
      },
      {
        name: 'subtraction',
        code: 'program test; var x, y: integer; begin x := 10; y := 4; writeln(x - y); end.',
        purpose: '测试减法运算',
        features: ['arithmetic', 'subtraction'],
        expectedOutput: '6\n',
      },
      {
        name: 'multiplication',
        code: 'program test; var x, y: integer; begin x := 6; y := 7; writeln(x * y); end.',
        purpose: '测试乘法运算',
        features: ['arithmetic', 'multiplication'],
        expectedOutput: '42\n',
      },
      {
        name: 'division',
        code: 'program test; var x, y: integer; begin x := 15; y := 3; writeln(x / y); end.',
        purpose: '测试除法运算',
        features: ['arithmetic', 'division'],
        expectedOutput: '5\n',
      },
      {
        name: 'integer division (DIV)',
        code: 'program test; var x, y: integer; begin x := 17; y := 5; writeln(x div y); end.',
        purpose: '测试整数除法DIV',
        features: ['arithmetic', 'div'],
        expectedOutput: '3\n',
      },
      {
        name: 'modulus (MOD)',
        code: 'program test; var x, y: integer; begin x := 17; y := 5; writeln(x mod y); end.',
        purpose: '测试取模运算MOD',
        features: ['arithmetic', 'mod'],
        expectedOutput: '2\n',
      },
      {
        name: 'unary minus',
        code: 'program test; var x: integer; begin x := 10; writeln(-x); writeln(-(-x)); end.',
        purpose: '测试负号运算',
        features: ['arithmetic', 'unary_minus'],
        expectedOutput: '-10\n10\n',
      },
      {
        name: 'mixed arithmetic',
        code: 'program test; var a, b, c: integer; begin a := 2; b := 3; c := 4; writeln(a + b * c); end.',
        purpose: '测试混合算术运算',
        features: ['arithmetic', 'mixed_operations'],
        expectedOutput: '14\n',
      },
      {
        name: 'operator precedence',
        code: 'program test; var x, y, z: integer; begin x := 2; y := 3; z := 4; writeln(x + y * z - 1); end.',
        purpose: '测试运算符优先级',
        features: ['arithmetic', 'operator_precedence'],
        expectedOutput: '13\n',
      },
      {
        name: 'parentheses change precedence',
        code: 'program test; var x, y, z: integer; begin x := 2; y := 3; z := 4; writeln((x + y) * z); end.',
        purpose: '测试括号改变优先级',
        features: ['arithmetic', 'parentheses', 'operator_precedence'],
        expectedOutput: '20\n',
      },
    ]
    tests.forEach((t) => test(t.name, () => runInterpreterTest(t)))
  })

  describe('Relational Operations', () => {
    const tests: InterpreterTest[] = [
      {
        name: 'equality (equals)',
        code: "program test; var x, y: integer; begin x := 5; y := 5; if x = y then writeln('equal') else writeln('not equal'); end.",
        purpose: '测试等于运算',
        features: ['relational', 'equality'],
        expectedOutput: 'equal\n',
      },
      {
        name: 'inequality (not equals)',
        code: "program test; var x, y: integer; begin x := 5; y := 3; if x <> y then writeln('not equal') else writeln('equal'); end.",
        purpose: '测试不等于运算',
        features: ['relational', 'inequality'],
        expectedOutput: 'not equal\n',
      },
      {
        name: 'less than',
        code: "program test; var x, y: integer; begin x := 3; y := 5; if x < y then writeln('less') else writeln('not less'); end.",
        purpose: '测试小于运算',
        features: ['relational', 'less_than'],
        expectedOutput: 'less\n',
      },
      {
        name: 'greater than',
        code: "program test; var x, y: integer; begin x := 5; y := 3; if x > y then writeln('greater') else writeln('not greater'); end.",
        purpose: '测试大于运算',
        features: ['relational', 'greater_than'],
        expectedOutput: 'greater\n',
      },
      {
        name: 'less than or equal',
        code: "program test; var x, y, z: integer; begin x := 3; y := 5; z := 3; if x <= y then writeln('ok1'); if x <= z then writeln('ok2'); end.",
        purpose: '测试小于等于运算',
        features: ['relational', 'less_or_equal'],
        expectedOutput: 'ok1\nok2\n',
      },
      {
        name: 'greater than or equal',
        code: "program test; var x, y, z: integer; begin x := 5; y := 3; z := 5; if x >= y then writeln('ok1'); if x >= z then writeln('ok2'); end.",
        purpose: '测试大于等于运算',
        features: ['relational', 'greater_or_equal'],
        expectedOutput: 'ok1\nok2\n',
      },
      {
        name: 'mixed relational operations',
        code: "program test; var x: integer; begin x := 10; if (x > 5) and (x < 15) then writeln('in range'); end.",
        purpose: '测试混合关系运算',
        features: ['relational', 'mixed_operations'],
        expectedOutput: 'in range\n',
      },
    ]
    tests.forEach((t) => test(t.name, () => runInterpreterTest(t)))
  })

  describe('Logical Operations', () => {
    const tests: InterpreterTest[] = [
      {
        name: 'NOT operation',
        code: "program test; var b: boolean; begin b := true; if not b then writeln('false') else writeln('true'); b := false; if not b then writeln('true') else writeln('false'); end.",
        purpose: '测试NOT逻辑运算',
        features: ['logical', 'not'],
        expectedOutput: 'true\ntrue\n',
      },
      {
        name: 'AND operation',
        code: "program test; var a, b: boolean; begin a := true; b := true; if a and b then writeln('true') else writeln('false'); b := false; if a and b then writeln('true') else writeln('false'); end.",
        purpose: '测试AND逻辑运算',
        features: ['logical', 'and'],
        expectedOutput: 'true\nfalse\n',
      },
      {
        name: 'OR operation',
        code: "program test; var a, b: boolean; begin a := false; b := false; if a or b then writeln('true') else writeln('false'); b := true; if a or b then writeln('true') else writeln('false'); end.",
        purpose: '测试OR逻辑运算',
        features: ['logical', 'or'],
        expectedOutput: 'false\ntrue\n',
      },
      {
        name: 'mixed logical operations',
        code: "program test; var a, b, c: boolean; begin a := true; b := false; c := true; if (a and not b) or (not a and c) then writeln('true') else writeln('false'); end.",
        purpose: '测试混合逻辑运算',
        features: ['logical', 'mixed_operations'],
        expectedOutput: 'true\n',
      },
      {
        name: 'logical short circuit AND',
        code: "program test; var x: integer; begin x := 0; if (x > 0) and (10 div x > 0) then writeln('true') else writeln('false'); end.",
        purpose: '测试AND逻辑短路（第一个条件为false时不应执行第二个条件）',
        features: ['logical', 'short_circuit', 'and'],
        expectedOutput: 'false\n',
      },
      {
        name: 'logical short circuit OR',
        code: "program test; var x: integer; begin x := 5; if (x > 0) or (10 div 0 > 0) then writeln('true') else writeln('false'); end.",
        purpose: '测试OR逻辑短路（第一个条件为true时不应执行第二个条件）',
        features: ['logical', 'short_circuit', 'or'],
        expectedOutput: 'true\n',
      },
      {
        name: 'NOT operator precedence',
        code: "program test; var a, b: boolean; begin a := true; b := false; if not a and b then writeln('true') else writeln('false'); if not (a and b) then writeln('true') else writeln('false'); end.",
        purpose: '测试NOT运算符优先级',
        features: ['logical', 'not', 'operator_precedence'],
        expectedOutput: 'false\ntrue\n',
      },
    ]
    tests.forEach((t) => test(t.name, () => runInterpreterTest(t)))
  })

  describe('Set Operations', () => {
    const tests: InterpreterTest[] = [
      {
        name: 'set union',
        code: "program test; type T = set of 1..10; var a, b, c: T; begin a := [1, 2, 3]; b := [3, 4, 5]; c := a + b; if 1 in c then writeln('1'); if 5 in c then writeln('5'); end.",
        purpose: '测试集合并运算',
        features: ['set', 'set_union'],
        expectedOutput: '1\n5\n',
      },
      {
        name: 'set intersection',
        code: "program test; type T = set of 1..10; var a, b, c: T; begin a := [1, 2, 3, 4]; b := [3, 4, 5, 6]; c := a * b; if 3 in c then writeln('3'); if 4 in c then writeln('4'); if 1 in c then writeln('1') else writeln('no 1'); end.",
        purpose: '测试集合交运算',
        features: ['set', 'set_intersection'],
        expectedOutput: '3\n4\nno 1\n',
      },
      {
        name: 'set difference',
        code: "program test; type T = set of 1..10; var a, b, c: T; begin a := [1, 2, 3, 4]; b := [3, 4, 5]; c := a - b; if 1 in c then writeln('1'); if 3 in c then writeln('3') else writeln('no 3'); end.",
        purpose: '测试集合差运算',
        features: ['set', 'set_difference'],
        expectedOutput: '1\nno 3\n',
      },
      {
        name: 'IN operation',
        code: "program test; type T = set of char; var s: T; begin s := ['A', 'B', 'C']; if 'B' in s then writeln('yes'); if 'X' in s then writeln('no') else writeln('not found'); end.",
        purpose: '测试IN集合成员运算',
        features: ['set', 'in_operator'],
        expectedOutput: 'yes\nnot found\n',
      },
      {
        name: 'set assignment',
        code: "program test; type T = set of 1..5; var s1, s2: T; begin s1 := [1, 2]; s2 := s1; s1 := s1 + [3]; if 3 in s1 then writeln('s1 has 3'); if 3 in s2 then writeln('s2 has 3') else writeln('s2 no 3'); end.",
        purpose: '测试集合赋值',
        features: ['set', 'set_assignment'],
        expectedOutput: 's1 has 3\ns2 no 3\n',
      },
    ]
    tests.forEach((t) => test(t.name, () => runInterpreterTest(t)))
  })

  describe('Type Conversions', () => {
    const tests: InterpreterTest[] = [
      {
        name: 'integer to char',
        code: 'program test; var i: integer; var c: char; begin i := 65; c := chr(i); writeln(c); end.',
        purpose: '测试integer转换为char',
        features: ['type_conversion', 'integer_to_char', 'chr_function'],
        expectedOutput: 'A\n',
      },
      {
        name: 'char to integer',
        code: "program test; var c: char; var i: integer; begin c := 'B'; i := ord(c); writeln(i); end.",
        purpose: '测试char转换为integer',
        features: ['type_conversion', 'char_to_integer', 'ord_function'],
        expectedOutput: '66\n',
      },
      {
        name: 'boolean operations',
        code: "program test; var b1, b2, b3: boolean; begin b1 := true; b2 := false; b3 := b1 and b2; if not b3 then writeln('false'); end.",
        purpose: '测试boolean类型运算',
        features: ['type', 'boolean', 'boolean_operations'],
        expectedOutput: 'false\n',
      },
      {
        name: 'subrange type operations',
        code: 'program test; type Age = 0..120; var a: Age; begin a := 25; a := a + 5; writeln(a); end.',
        purpose: '测试子界类型运算',
        features: ['type', 'subrange', 'subrange_operations'],
        expectedOutput: '30\n',
      },
      {
        name: 'enumeration type operations',
        code: "program test; type Color = (Red, Green, Blue); var c: Color; begin c := Green; if c = Green then writeln('green'); writeln(ord(c)); end.",
        purpose: '测试枚举类型运算',
        features: ['type', 'enumeration', 'enum_operations'],
        expectedOutput: 'green\n1\n',
      },
      {
        name: 'mixed type operations',
        code: "program test; var i: integer; var c: char; begin i := ord('A'); writeln(i); c := chr(i); writeln(c); end.",
        purpose: '测试类型混合运算',
        features: ['type_conversion', 'mixed_types'],
        expectedOutput: '65\nA\n',
      },
    ]
    tests.forEach((t) => test(t.name, () => runInterpreterTest(t)))
  })

  describe('Operation Boundaries', () => {
    const tests: InterpreterTest[] = [
      {
        name: 'division by zero',
        code: 'program test; var x: integer; begin x := 10 div 0; end.',
        purpose: '测试除零错误',
        features: ['boundary', 'division_by_zero'],
        expectedError: true,
      },
      {
        name: 'MOD by zero',
        code: 'program test; var x: integer; begin x := 10 mod 0; end.',
        purpose: '测试MOD零错误',
        features: ['boundary', 'mod_by_zero'],
        expectedError: true,
      },
      {
        name: 'negative arithmetic operations',
        code: 'program test; var x, y: integer; begin x := -5; y := 3; writeln(x + y); writeln(x - y); writeln(x * y); writeln(-x); end.',
        purpose: '测试负数运算',
        features: ['boundary', 'negative_operations'],
        expectedOutput: '-2\n-8\n-15\n5\n',
      },
      {
        name: 'large number operations',
        code: 'program test; var x, y: integer; begin x := 100000; y := 200000; writeln(x + y); writeln(x * 2); end.',
        purpose: '测试大数运算',
        features: ['boundary', 'large_numbers'],
        expectedOutput: '300000\n200000\n',
      },
      {
        name: 'zero value operations',
        code: 'program test; var x: integer; begin x := 0; writeln(x + 5); writeln(5 - x); writeln(x * 5); writeln(5 div (x + 1)); end.',
        purpose: '测试零值运算',
        features: ['boundary', 'zero_operations'],
        expectedOutput: '5\n5\n0\n5\n',
      },
      {
        name: 'maximum value operations',
        code: 'program test; var x: integer; begin x := 32767; writeln(x); writeln(x - 1); end.',
        purpose: '测试最大值运算',
        features: ['boundary', 'max_value'],
        expectedOutput: '32767\n32766\n',
      },
      {
        name: 'integer overflow',
        code: 'program test; var x: integer; begin x := 32767; x := x + 1; writeln(x); end.',
        purpose: '测试整数溢出',
        features: ['boundary', 'integer_overflow'],
        expectedOutput: '-32768\n',
      },
      {
        name: 'subrange boundary check',
        code: 'program test; type Age = 0..120; var a: Age; begin a := 120; a := a + 1; end.',
        purpose: '测试子界类型边界检查',
        features: ['boundary', 'subrange_boundary'],
        expectedError: true,
      },
    ]
    tests.forEach((t) => test(t.name, () => runInterpreterTest(t)))
  })
})
