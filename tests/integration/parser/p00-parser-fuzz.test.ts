import { ConformanceTest, runParseTest, makeProgram, makeProgramWithVars } from './_helper'
import { describe, test, expect } from 'vitest'
function repeatStr(s: string, n: number): string {
  let result = ''
  for (let i = 0; i < n; i++) result += s
  return result
}

function genDeepNested(n: number, inner: string = '  x := 0'): string {
  let result = inner
  for (let i = 0; i < n; i++) {
    result = 'begin\n' + result + '\nend'
  }
  return result
}

function genDeepIf(n: number): string {
  let result = 'x := 0'
  for (let i = 0; i < n; i++) {
    result = `if x > ${i} then\n  ${result}`
  }
  return result
}

function genDeepWhile(n: number): string {
  let result = 'x := x + 1'
  for (let i = 0; i < n; i++) {
    result = `while x < ${i} do\n  ${result}`
  }
  return result
}

function genDeepCase(n: number): string {
  let result = 'x := 0'
  for (let i = 0; i < n; i++) {
    result = `case x of\n  ${i}: ${result};\n  otherwise x := ${i};\nend`
  }
  return result
}

function genDeepWith(n: number): string {
  let result = 'a := 1'
  for (let i = n; i >= 1; i--) {
    result = `with r${i} do\n  ${result}`
  }
  return result
}

function genDeepProc(n: number): string {
  let result = 'procedure p0;\nbegin\nend;'
  for (let i = 1; i <= n; i++) {
    result = `procedure p${i};\n${result}\nbegin\n  p${i - 1};\nend;`
  }
  return result
}

function genDeepParens(n: number, expr: string = 'x'): string {
  let result = expr
  for (let i = 0; i < n; i++) {
    result = '(' + result + ')'
  }
  return result
}

const tests: ConformanceTest[] = [
  // ==========================================================================
  // 1. 深层嵌套（10个）
  // ==========================================================================
  {
    name: '深层嵌套 BEGIN/END（20层）',
    code: makeProgramWithVars('x: integer;', '', genDeepNested(20, '  x := x + 1')),
    purpose: '测试20层 BEGIN/END 复合语句嵌套，验证 parser 递归深度处理能力',
    shouldParse: true,
  },
  {
    name: '深层嵌套 BEGIN/END（50层）',
    code: makeProgramWithVars('x: integer;', '', genDeepNested(30, '  x := x + 1')),
    purpose: '测试30层 BEGIN/END 复合语句嵌套，验证 parser 递归深度处理能力',
    shouldParse: true,
  },
  {
    name: '深层嵌套 IF 语句（20层）',
    code: makeProgramWithVars('x: integer;', '', genDeepIf(20)),
    purpose: '测试20层 IF 语句嵌套，验证条件语句递归解析',
    shouldParse: true,
  },
  {
    name: '深层嵌套 WHILE 语句（20层）',
    code: makeProgramWithVars('x: integer;', '', `begin\n  x := 0;\n  ${genDeepWhile(20)}\nend`),
    purpose: '测试20层 WHILE 循环嵌套，验证循环语句递归解析',
    shouldParse: true,
  },
  {
    name: '深层嵌套 CASE 语句（10层）',
    code: makeProgramWithVars('x: integer;', '', genDeepCase(10)),
    purpose: '测试10层 CASE 语句嵌套，验证多分支语句递归解析',
    shouldParse: true,
  },
  {
    name: '深层嵌套 WITH 语句（10层）',
    code: `program test;
type
  TRec = record
    a: integer;
  end;
var
  r1, r2, r3, r4, r5, r6, r7, r8, r9, r10: TRec;
begin
  ${genDeepWith(10)}
end.`,
    purpose: '测试10层 WITH 语句嵌套，验证记录引用递归解析',
    shouldParse: true,
  },
  {
    name: '深层嵌套过程/函数（10层）',
    code: makeProgram(
      `
${genDeepProc(10)}
`,
      `
  p10
`
    ),
    purpose: '测试10层嵌套过程声明，验证过程声明递归解析',
    shouldParse: true,
  },
  {
    name: '深层嵌套表达式括号（30层）',
    code: makeProgramWithVars(
      'x, y: integer;',
      '',
      `begin\n  y := ${genDeepParens(30, 'x + 1')};\nend`
    ),
    purpose: '测试30层括号嵌套表达式，验证表达式递归解析',
    shouldParse: true,
  },
  {
    name: '深层嵌套 REPEAT-UNTIL（15层）',
    code: makeProgramWithVars(
      'x: integer;',
      '',
      (() => {
        let result = 'x := x + 1'
        for (let i = 0; i < 15; i++) {
          result = `repeat\n  ${result}\nuntil x > ${i}`
        }
        return result
      })()
    ),
    purpose: '测试15层 REPEAT-UNTIL 嵌套，验证 repeat 语句递归解析',
    shouldParse: true,
  },
  {
    name: '深层嵌套 FOR 循环（15层）',
    code: makeProgramWithVars(
      'i1, i2, i3, i4, i5, i6, i7, i8, i9, i10, i11, i12, i13, i14, i15, x: integer;',
      '',
      (() => {
        let result = 'x := x + 1'
        for (let i = 15; i >= 1; i--) {
          result = `for i${i} := 1 to 10 do\n  ${result}`
        }
        return 'x := 0;\n  ' + result
      })()
    ),
    purpose: '测试15层 FOR 循环嵌套，验证 for 语句递归解析',
    shouldParse: true,
  },

  // ==========================================================================
  // 2. 长序列（10个）
  // ==========================================================================
  {
    name: '100个变量声明',
    code: makeProgram(
      (() => {
        const vars: string[] = []
        for (let i = 1; i <= 100; i++) {
          vars.push(`v${i}`)
        }
        return `var\n  ${vars.join(', ')}: integer;\n`
      })(),
      (() => {
        const stmts: string[] = []
        for (let i = 1; i <= 10; i++) {
          stmts.push(`  v${i} := ${i}`)
        }
        return stmts.join(';\n')
      })()
    ),
    purpose: '测试100个变量在单个 VAR 块中声明，验证长声明序列处理',
    shouldParse: true,
  },
  {
    name: '50个过程声明',
    code: makeProgram(
      (() => {
        let procs = ''
        for (let i = 1; i <= 50; i++) {
          procs += `procedure p${i};\nbegin\nend;\n`
        }
        return procs
      })(),
      (() => {
        const calls: string[] = []
        for (let i = 1; i <= 10; i++) {
          calls.push(`  p${i}`)
        }
        return calls.join(';\n')
      })()
    ),
    purpose: '测试50个顶层过程声明，验证长过程序列处理',
    shouldParse: true,
  },
  {
    name: '长参数列表（20个参数）',
    code: makeProgram(
      `
procedure LongParams(
  a1, a2, a3, a4, a5, a6, a7, a8, a9, a10: integer;
  b1, b2, b3, b4, b5, b6, b7, b8, b9, b10: char
);
begin
end;
`,
      `
  LongParams(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j')
`
    ),
    purpose: '测试20个参数的过程声明和调用',
    shouldParse: true,
  },
  {
    name: '长 CASE 语句（30个分支）',
    code: makeProgramWithVars(
      'x, y: integer;',
      '',
      (() => {
        let branches = ''
        for (let i = 1; i <= 30; i++) {
          branches += `    ${i}: y := ${i * 10};\n`
        }
        return `begin\n  case x of\n${branches}  end;\nend`
      })()
    ),
    purpose: '测试30个分支的 CASE 语句，验证长分支序列处理',
    shouldParse: true,
  },
  {
    name: '长表达式链（a+b+...+z）',
    code: makeProgramWithVars(
      'a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p, q, r, s, t, u, v, w, x, y, z, result: integer;',
      '',
      `begin\n  result := a + b + c + d + e + f + g + h + i + j + k + l + m + n + o + p + q + r + s + t + u + v + w + x + y + z;\nend`
    ),
    purpose: '测试26个变量的长加法表达式链',
    shouldParse: true,
  },
  {
    name: '深度嵌套数组索引（10维）',
    code: `program test;
type
  TArr10 = array[1..2, 1..2, 1..2, 1..2, 1..2, 1..2, 1..2, 1..2, 1..2, 1..2] of integer;
var
  a: TArr10;
begin
  a[1, 1, 1, 1, 1, 1, 1, 1, 1, 1] := 42;
end.`,
    purpose: '测试10维数组的声明和访问',
    shouldParse: true,
  },
  {
    name: '长乘法表达式链',
    code: makeProgramWithVars(
      'a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, result: integer;',
      '',
      `begin\n  result := a1 * a2 * a3 * a4 * a5 * a6 * a7 * a8 * a9 * a10;\nend`
    ),
    purpose: '测试10个操作数的长乘法表达式链',
    shouldParse: true,
  },
  {
    name: '长记录字段序列',
    code: `program test;
type
  TBigRec = record
    f1: integer;
    f2: integer;
    f3: integer;
    f4: integer;
    f5: integer;
    f6: integer;
    f7: integer;
    f8: integer;
    f9: integer;
    f10: integer;
    f11: integer;
    f12: integer;
    f13: integer;
    f14: integer;
    f15: integer;
  end;
var
  r: TBigRec;
begin
  r.f1 := 1;
end.`,
    purpose: '测试包含15个字段的记录声明',
    shouldParse: true,
  },
  {
    name: '长过程调用参数列表（20个参数）',
    code: makeProgram(
      `
procedure ManyArgs(n1, n2, n3, n4, n5, n6, n7, n8, n9, n10, n11, n12, n13, n14, n15, n16, n17, n18, n19, n20: integer);
begin
end;
`,
      `
  ManyArgs(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20)
`
    ),
    purpose: '测试20个实参的过程调用',
    shouldParse: true,
  },
  {
    name: '枚举类型长序列（20个值）',
    code: `program test;
type
  TEnum = (e1, e2, e3, e4, e5, e6, e7, e8, e9, e10, e11, e12, e13, e14, e15, e16, e17, e18, e19, e20);
var
  e: TEnum;
begin
  e := e1;
end.`,
    purpose: '测试20个值的枚举类型声明',
    shouldParse: true,
  },

  // ==========================================================================
  // 3. 极端标识符（8个）
  // ==========================================================================
  {
    name: '超长标识符（128字符）',
    code: makeProgramWithVars(
      repeatStr('a', 128) + ': integer;',
      '',
      `begin\n  ${repeatStr('a', 128)} := 42;\nend`
    ),
    purpose: '测试128字符超长标识符',
    shouldParse: true,
  },
  {
    name: '所有字母数字组合标识符',
    code: makeProgramWithVars(
      'a0b1c2d3e4f5g6h7i8j9k0l1m2n3o4p5q6r7s8t9u0v1w2x3y4z5: integer;',
      '',
      'begin\n  a0b1c2d3e4f5g6h7i8j9k0l1m2n3o4p5q6r7s8t9u0v1w2x3y4z5 := 1;\nend'
    ),
    purpose: '测试包含所有字母和数字的标识符',
    shouldParse: true,
  },
  {
    name: '最大合法长度标识符（128字符）',
    code: makeProgramWithVars(
      repeatStr('x', 128) + ': integer;',
      '',
      `begin\n  ${repeatStr('x', 128)} := 100;\nend`
    ),
    purpose: '测试128字符长度标识符（常见最大长度边界）',
    shouldParse: true,
  },
  {
    name: '标识符每个字符都不同',
    code: makeProgramWithVars(
      'abcdefghijklmnopqrstuvwxyz: integer;',
      '',
      'begin\n  abcdefghijklmnopqrstuvwxyz := 1;\nend'
    ),
    purpose: '测试每个字符都不同的标识符（26个不同字母）',
    shouldParse: true,
  },
  {
    name: '全大写超长标识符',
    code: makeProgramWithVars(
      repeatStr('X', 100) + ': integer;',
      '',
      `begin\n  ${repeatStr('X', 100)} := 1;\nend`
    ),
    purpose: '测试100字符全大写标识符',
    shouldParse: true,
  },
  {
    name: '大小写混合超长标识符',
    code: makeProgramWithVars(
      'AbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMnOpQrStUvWxYz: integer;',
      '',
      'begin\n  AbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMnOpQrStUvWxYz := 1;\nend'
    ),
    purpose: '测试大小写交替的长标识符',
    shouldParse: true,
  },
  {
    name: '数字结尾的长标识符',
    code: makeProgramWithVars(
      'var123456789012345678901234567890: integer;',
      '',
      'begin\n  var123456789012345678901234567890 := 1;\nend'
    ),
    purpose: '测试带有长数字后缀的标识符',
    shouldParse: true,
  },
  {
    name: '多个长标识符变量声明',
    code: makeProgramWithVars(
      `${repeatStr('a', 50)}, ${repeatStr('b', 50)}, ${repeatStr('c', 50)}: integer;`,
      '',
      `begin\n  ${repeatStr('a', 50)} := 1;\n  ${repeatStr('b', 50)} := 2;\n  ${repeatStr('c', 50)} := 3;\nend`
    ),
    purpose: '测试多个50字符长标识符在同一声明中',
    shouldParse: true,
  },

  // ==========================================================================
  // 4. 极端整数（5个）
  // ==========================================================================
  {
    name: '非常大的整数（20位）',
    code: makeProgramWithVars('x: integer;', '', `begin\n  x := ${repeatStr('9', 20)};\nend`),
    purpose: '测试20位超大整数字面量',
    shouldParse: true,
  },
  {
    name: '零值整数',
    code: makeProgramWithVars('x: integer;', '', 'begin\n  x := 0;\nend'),
    purpose: '测试零值整数（边界值）',
    shouldParse: true,
  },
  {
    name: '全零长整数',
    code: makeProgramWithVars('x: integer;', '', `begin\n  x := ${repeatStr('0', 20)};\nend`),
    purpose: '测试20个零组成的整数',
    shouldParse: true,
  },
  {
    name: '连续数字长整数',
    code: makeProgramWithVars('x: integer;', '', 'begin\n  x := 12345678901234567890;\nend'),
    purpose: '测试20位连续递增数字的整数',
    shouldParse: true,
  },
  {
    name: '负数大数（20位）',
    code: makeProgramWithVars('x: integer;', '', `begin\n  x := -${repeatStr('9', 20)};\nend`),
    purpose: '测试20位负整数',
    shouldParse: true,
  },

  // ==========================================================================
  // 5. 极端字符串（5个）
  // ==========================================================================
  {
    name: '超长字符串（200字符）',
    code: makeProgramWithVars('s: string;', '', `begin\n  s := '${repeatStr('a', 200)}';\nend`),
    purpose: '测试200字符超长字符串字面量',
    shouldParse: true,
  },
  {
    name: '全是转义引号的字符串',
    code: makeProgramWithVars('s: string;', '', `begin\n  s := '${repeatStr("''", 50)}';\nend`),
    purpose: '测试包含50对转义单引号的字符串（100个引号字符）',
    shouldParse: true,
  },
  {
    name: '空字符串重复出现',
    code: makeProgramWithVars(
      's1, s2, s3, s4, s5, s6, s7, s8, s9, s10: string;',
      '',
      `begin\n  s1 := '';\n  s2 := '';\n  s3 := '';\n  s4 := '';\n  s5 := '';\n  s6 := '';\n  s7 := '';\n  s8 := '';\n  s9 := '';\n  s10 := '';\nend`
    ),
    purpose: '测试多个空字符串字面量连续出现',
    shouldParse: true,
  },
  {
    name: '特殊字符密集字符串',
    code: makeProgramWithVars(
      's: string;',
      '',
      `begin\n  s := '${repeatStr('!@#$%^&*()_+-=[]{}|;:,.?', 10)}';\nend`
    ),
    purpose: '测试包含大量特殊字符的字符串',
    shouldParse: true,
  },
  {
    name: '单字符重复长字符串',
    code: makeProgramWithVars('s: string;', '', `begin\n  s := '${repeatStr('z', 200)}';\nend`),
    purpose: '测试200个相同字符组成的字符串',
    shouldParse: true,
  },

  // ==========================================================================
  // 6. 注释密集（5个）
  // ==========================================================================
  {
    name: '每个 token 之间都有注释',
    code: `program { comment1 } test { comment2 };
var { comment3 }
  x { comment4 } : { comment5 } integer { comment6 } ; { comment7 }
begin { comment8 }
  x { comment9 } := { comment10 } 42 { comment11 } ; { comment12 }
end { comment13 } . { comment14 }`,
    purpose: '测试几乎每个 token 之间都插入注释的情况',
    shouldParse: true,
  },
  {
    name: '巨大注释块（100行）',
    code: `program test;
{
${repeatStr('  this is a very long comment line\n', 100)}}
var
  x: integer;
begin
  x := 1;
end.`,
    purpose: '测试包含100行内容的巨大注释块',
    shouldParse: true,
  },
  {
    name: '行首注释密集',
    code: `{c1}program test;
{c2}var
{c3}  x: integer;
{c4}begin
{c5}  x := 1;
{c6}end.`,
    purpose: '测试每行开头都有注释的情况',
    shouldParse: true,
  },
  {
    name: '行尾注释密集',
    code: `program test; {c1}
var {c2}
  x: integer; {c3}
begin {c4}
  x := 1; {c5}
end. {c6}`,
    purpose: '测试每行结尾都有注释的情况',
    shouldParse: true,
  },
  {
    name: '两种注释风格交替',
    code: `{curly comment}program test;(*paren comment*)
var{another curly}
  x: integer;(*another paren*)
begin{yet another}
  x := 1;(*and another*)
end.{final}`,
    purpose: '测试花括号注释和圆括号星号注释交替出现',
    shouldParse: true,
  },

  // ==========================================================================
  // 7. 空白字符极端（5个）
  // ==========================================================================
  {
    name: '全在一行的程序',
    code: 'program test;var x:integer;begin x:=42; end.',
    purpose: '测试整个程序写在一行上，无多余空白',
    shouldParse: true,
  },
  {
    name: '超多换行的程序',
    code: `program\ntest\n;\nvar\nx\n:\ninteger\n;\nbegin\nx\n:=\n42\n;\nend\n.`,
    purpose: '测试几乎每个 token 后都有换行的情况',
    shouldParse: true,
  },
  {
    name: 'tab 混合空格',
    code: `program test;
var
\tx: integer;
begin
  \tx :=\t42;
end.`,
    purpose: '测试制表符和空格混合使用的缩进',
    shouldParse: true,
  },
  {
    name: '无空格的紧凑代码',
    code: makeProgramWithVars('a,b,c,d,e:integer;', 'begin\na:=b+c*d/e;end.'),
    purpose: '测试表达式中完全没有空格的紧凑代码',
    shouldParse: true,
  },
  {
    name: '全空格无换行超长行',
    code: `program test; var x: integer; begin x := 1; x := 2; x := 3; x := 4; x := 5; x := 6; x := 7; x := 8; x := 9; x := 10; end.`,
    purpose: '测试全部代码在一行，用空格分隔',
    shouldParse: true,
  },

  // ==========================================================================
  // 8. 组合轰炸（22个）
  // ==========================================================================
  {
    name: '过程内包含所有语句类型',
    code: makeProgram(
      `
procedure AllStatements;
label
  10, 20;
var
  x, y, i: integer;
  flag: boolean;
begin
  x := 1;
  if flag then
    x := 2
  else
    x := 3;
  while x < 10 do
    x := x + 1;
  repeat
    x := x - 1
  until x = 0;
  for i := 1 to 10 do
    y := y + i;
  case x of
    1: y := 10;
    2: y := 20;
    otherwise y := 0;
  end;
  goto 10;
10:
  goto 20;
20:
end;
`,
      `
  AllStatements
`
    ),
    purpose: '测试一个过程中包含所有类型的语句',
    shouldParse: true,
  },
  {
    name: '函数 + CASE + WHILE + GOTO 组合',
    code: makeProgram(
      `
function ComplexFunc(n: integer): integer;
label
  99;
var
  i, result: integer;
begin
  i := 0;
  result := 0;
  while i < n do
    begin
      case i of
        0: result := result + 10;
        1: result := result + 20;
        2:
          begin
            if n > 5 then
              goto 99;
            result := result + 30;
          end;
        otherwise result := result + 5;
      end;
      i := i + 1;
    end;
99:
  ComplexFunc := result;
end;
`,
      `
  x := ComplexFunc(10)
`
    ),
    purpose: '测试函数中组合使用 CASE、WHILE 和 GOTO',
    shouldParse: true,
  },
  {
    name: 'FORWARD + 相互递归 + 嵌套过程',
    code: makeProgram(
      `
procedure A(n: integer); forward;
procedure B(n: integer); forward;

procedure Outer;
  procedure Inner;
  begin
    A(5);
  end;
begin
  Inner;
end;

procedure B(n: integer);
begin
  if n > 0 then
    A(n - 1);
end;

procedure A(n: integer);
begin
  if n > 0 then
    B(n - 1);
end;
`,
      `
  Outer
`
    ),
    purpose: '测试 FORWARD 声明、相互递归和嵌套过程的组合',
    shouldParse: true,
  },
  {
    name: 'WITH + 记录 + 数组 + 过程调用',
    code: `program test;
type
  TInner = record
    val: integer;
  end;
  TOuter = record
    inner: array[1..5] of TInner;
    count: integer;
  end;
var
  r: TOuter;
  i: integer;

procedure IncVar(var n: integer);
begin
  n := n + 1;
end;

begin
  with r do
    begin
      count := 0;
      for i := 1 to 5 do
        with inner[i] do
          begin
            val := i * 10;
            IncVar(val);
            IncVar(count);
          end;
    end;
end.`,
    purpose: '测试 WITH、记录、数组和过程调用的组合',
    shouldParse: true,
  },
  {
    name: '复杂表达式 + 函数调用 + 数组访问',
    code: makeProgram(
      `
function Add(a, b: integer): integer;
begin
  Add := a + b;
end;

function Mul(a, b: integer): integer;
begin
  Mul := a * b;
end;
`,
      `
  x := Add(Mul(arr[1], arr[2]) + arr[3], Mul(arr[4] + arr[5], arr[6]))
`
    ),
    purpose: '测试复杂表达式中嵌套函数调用和数组访问',
    shouldParse: true,
  },
  {
    name: '多过程多函数多变量大杂烩',
    code: makeProgram(
      `
const
  MAX = 100;
  MIN = 0;

type
  TColor = (Red, Green, Blue);
  TCount = 0..100;
  TArr = array[1..10] of integer;
  TRec = record
    x, y: integer;
    color: TColor;
  end;

var
  g1, g2, g3: integer;
  gr: TRec;
  ga: TArr;

procedure P1;
begin
end;

procedure P2(n: integer);
begin
end;

function F1: boolean;
begin
  F1 := true;
end;

function F2(a, b: integer): integer;
begin
  F2 := a + b;
end;

procedure P3(var x: integer);
  function InnerF(y: integer): integer;
  begin
    InnerF := y * 2;
  end;
begin
  x := InnerF(x);
end;
`,
      `
  P1;
  P2(5);
  g1 := F2(3, 4);
  P3(g2)
`
    ),
    purpose: '测试常量、类型、变量、过程、函数混合声明的大杂烩程序',
    shouldParse: true,
  },
  {
    name: '标签 + GOTO + 嵌套循环',
    code: `program test;
label
  100, 200, 300;
var
  i, j, k, sum: integer;
begin
  sum := 0;
  for i := 1 to 10 do
    for j := 1 to 10 do
      begin
        if i + j > 15 then
          goto 100;
        k := 0;
        while k < 5 do
          begin
            sum := sum + 1;
            if sum > 50 then
              goto 200;
            k := k + 1;
          end;
      end;
100:
  sum := sum + 10;
200:
  sum := sum + 20;
300:
end.`,
    purpose: '测试标签、GOTO 与多层嵌套循环的组合',
    shouldParse: true,
  },
  {
    name: '枚举 + 集合 + 子界 + 数组',
    code: `program test;
type
  TDay = (Mon, Tue, Wed, Thu, Fri, Sat, Sun);
  TDaySet = set of TDay;
  TDayRange = Mon..Fri;
  TWeekArr = array[TDay] of boolean;
var
  workDays: TDaySet;
  day: TDay;
  weekend: TWeekArr;
  d: TDayRange;
begin
  workDays := [Mon, Tue, Wed, Thu, Fri];
  day := Mon;
  weekend[Sat] := true;
  weekend[Sun] := true;
  d := Mon;
end.`,
    purpose: '测试枚举、集合、子界和数组类型的组合',
    shouldParse: true,
  },
  {
    name: '记录嵌套 + 数组 + WITH',
    code: `program test;
type
  TPoint = record
    x, y: real;
  end;
  TLine = record
    start, endp: TPoint;
    color: integer;
  end;
  TShape = array[1..10] of TLine;
var
  shape: TShape;
  i: integer;
begin
  for i := 1 to 10 do
    with shape[i] do
      with start do
        begin
          x := i;
          y := i * 2;
        end;
end.`,
    purpose: '测试嵌套记录、数组和 WITH 语句的组合',
    shouldParse: true,
  },
  {
    name: '递归函数 + CASE + 数组',
    code: `program test;
type
  TIntArr = array[1..10] of integer;
var
  arr: TIntArr;
  x: integer;

function SumArray(arr: TIntArr; n: integer): integer;
begin
  case n of
    0: SumArray := 0;
    1: SumArray := arr[1];
    otherwise SumArray := arr[n] + SumArray(arr, n - 1);
  end;
end;

begin
  x := SumArray(arr, 5)
end.`,
    purpose: '测试递归函数中使用 CASE 和数组',
    shouldParse: true,
  },
  {
    name: '过程参数 + 嵌套函数 + 复杂表达式',
    code: makeProgram(
      `
function Calc(x: integer; var y: integer): integer;
  function Square(n: integer): integer;
  begin
    Square := n * n;
  end;
  function Cube(n: integer): integer;
  begin
    Cube := n * n * n;
  end;
begin
  y := Square(x) + Cube(x);
  Calc := y mod 100;
end;
`,
      `
  r := Calc(5, x)
`
    ),
    purpose: '测试过程参数、嵌套函数和复杂表达式的组合',
    shouldParse: true,
  },
  {
    name: '多维数组 + 嵌套循环 + 条件',
    code: `program test;
type
  TMatrix = array[1..10, 1..10] of integer;
var
  m: TMatrix;
  i, j, sum: integer;
begin
  sum := 0;
  for i := 1 to 10 do
    for j := 1 to 10 do
      begin
        if i = j then
          m[i, j] := 1
        else
          m[i, j] := 0;
        sum := sum + m[i, j];
      end;
end.`,
    purpose: '测试多维数组、嵌套循环和条件语句的组合',
    shouldParse: true,
  },
  {
    name: 'FORWARD 函数 + 嵌套过程 + 递归',
    code: makeProgram(
      `
function Fib(n: integer): integer; forward;

procedure ComputeFibs;
var
  i: integer;
  function Helper(x: integer): integer;
  begin
    Helper := Fib(x) + Fib(x - 1);
  end;
begin
  for i := 1 to 10 do
    x := Helper(i);
end;

function Fib(n: integer): integer;
begin
  if n <= 2 then
    Fib := 1
  else
    Fib := Fib(n - 1) + Fib(n - 2);
end;
`,
      `
  ComputeFibs
`
    ),
    purpose: '测试 FORWARD 函数、嵌套过程和递归的组合',
    shouldParse: true,
  },
  {
    name: '记录变体（普通记录）+ 数组 + CASE 表达式',
    code: `program test;
type
  TShapeType = (stCircle, stRect);
  TShape = record
    kind: TShapeType;
    x, y: integer;
    radius: integer;
    width, height: integer;
  end;
var
  shapes: array[1..5] of TShape;
  i, area: integer;
begin
  for i := 1 to 5 do
    with shapes[i] do
      case kind of
        stCircle: area := 3 * radius * radius;
        stRect: area := width * height;
      end;
end.`,
    purpose: '测试记录、数组和 CASE 语句的组合',
    shouldParse: true,
  },
  {
    name: '字符串 + 过程调用 + 循环',
    code: makeProgram(
      `
procedure PrintStr(s: string);
begin
end;

function Concat(a, b: string): string;
begin
  Concat := a + b;
end;
`,
      `
  for i := 1 to 10 do
    PrintStr(Concat('hello', 'world'))
`
    ),
    purpose: '测试字符串、过程调用和循环的组合',
    shouldParse: true,
  },
  {
    name: '集合操作 + 枚举 + 布尔表达式',
    code: `program test;
type
  TLetter = (A, B, C, D, E);
  TLetterSet = set of TLetter;
var
  s1, s2, s3: TLetterSet;
  result: boolean;
begin
  s1 := [A, B, C];
  s2 := [B, C, D];
  s3 := s1 + s2;
  result := (A in s1) and (E in s2);
end.`,
    purpose: '测试集合操作、枚举和复杂布尔表达式的组合',
    shouldParse: true,
  },
  {
    name: '多层嵌套 WITH + 多记录字段',
    code: `program test;
type
  TLevel3 = record
    val: integer;
  end;
  TLevel2 = record
    l3: TLevel3;
  end;
  TLevel1 = record
    l2: TLevel2;
  end;
  TRoot = record
    l1: TLevel1;
  end;
var
  r: TRoot;
begin
  with r do
    with l1 do
      with l2 do
        with l3 do
          val := 42;
end.`,
    purpose: '测试4层嵌套 WITH 语句访问深层记录字段',
    shouldParse: true,
  },
  {
    name: 'IF 嵌套 + ELSE 悬挂 + 复合语句',
    code: makeProgramWithVars(
      'a, b, c, x: integer;',
      '',
      `begin\n  if a > 0 then\n    if b > 0 then\n      if c > 0 then\n        x := 1\n      else\n        x := 2\n    else\n      begin\n        x := 3;\n      end\n  else\n    x := 4;\nend`
    ),
    purpose: '测试多层 IF-ELSE 嵌套，验证悬挂 else 绑定',
    shouldParse: true,
  },
  {
    name: 'REPEAT + WHILE + FOR 三种循环嵌套',
    code: makeProgramWithVars(
      'i, j, k, sum: integer;',
      '',
      `begin\n  sum := 0;\n  i := 0;\n  repeat\n    j := 0;\n    while j < 5 do\n      begin\n        for k := 1 to 3 do\n          sum := sum + i + j + k;\n        j := j + 1;\n      end;\n    i := i + 1;\n  until i >= 3;\nend`
    ),
    purpose: '测试 REPEAT、WHILE、FOR 三种循环互相嵌套',
    shouldParse: true,
  },
  {
    name: '常量 + 类型 + 变量 + 过程 + 函数完整声明',
    code: makeProgram(
      `
label
  9999;
const
  PI = 3.14;
  MAX_COUNT = 100;
type
  TCount = 0..MAX_COUNT;
  TData = array[1..10] of TCount;
var
  data: TData;
  total: TCount;
procedure Init;
  var
    i: integer;
  begin
    for i := 1 to 10 do
      data[i] := 0;
  end;
function Sum: integer;
  var
    i, s: integer;
  begin
    s := 0;
    for i := 1 to 10 do
      s := s + data[i];
    Sum := s;
  end;
`,
      `
  9999:
  Init;
  total := Sum
`
    ),
    purpose: '测试包含所有声明段的完整程序结构',
    shouldParse: true,
  },
  {
    name: '数组的数组 + 复杂索引表达式',
    code: `program test;
type
  TInner = array[1..5] of integer;
  TOuter = array[1..5] of TInner;
var
  a: TOuter;
  i, j: integer;
begin
  for i := 1 to 5 do
    for j := 1 to 5 do
      a[i][j] := i * 10 + j;
end.`,
    purpose: '测试数组的数组（多维数组的另一种形式）和复杂索引表达式',
    shouldParse: true,
  },
  {
    name: 'GOTO 跳出多层嵌套 + 标签声明',
    code: `program test;
label
  100, 200, 300;
var
  i, j, k, count: integer;
begin
  count := 0;
  for i := 1 to 10 do
    for j := 1 to 10 do
      for k := 1 to 10 do
        begin
          count := count + 1;
          if count > 100 then
            goto 300;
          if i + j + k > 20 then
            goto 200;
          if i * j * k > 100 then
            goto 100;
        end;
300:
200:
100:
end.`,
    purpose: '测试 GOTO 从多层嵌套循环中跳出，多个标签',
    shouldParse: true,
  },
]

describe('M3.5 Fuzz Tests', () => {
  tests.forEach((t) => {
    test(t.name, () => {
      runParseTest(t)
    })
  })
})
