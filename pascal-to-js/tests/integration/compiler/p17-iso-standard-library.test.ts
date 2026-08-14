// ISO 7185 标准库正反测试
//
// 依据：ISO 7185:1983
//   - 6.6.5 Required procedures
//     - 6.6.5.2 File handling procedures (rewrite/put/reset/get/read/readln/write/writeln/page)
//     - 6.6.5.3 Dynamic allocation procedures (new/dispose)
//     - 6.6.5.4 Transfer procedures (pack/unpack)
//   - 6.6.6 Required functions
//     - 6.6.6.2 Arithmetic functions (abs/sqr/sin/cos/exp/ln/sqrt/arctan)
//     - 6.6.6.3 Transfer functions (trunc/round)
//     - 6.6.6.4 Ordinal functions (ord/chr/succ/pred)
//     - 6.6.6.5 Boolean functions (odd/eof/eoln)
//
// 测试原则（AGENTS.md 原则 A）：
//   - 正面测试：标准 ISO 用法，验证功能正常
//   - 反面测试：违反 ISO 约束的用法，应快速失败
//   - 反面测试使用 maxSteps 限制，确保即使死循环也能快速结束
//   - 反面测试优先用 expectedError 检查错误消息，便于定位问题

import { describe } from './_helper'
import { type PascalTest, runPascalTests } from './_helper'

function text(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

describe('ISO 7185 Standard Library (6.6.5 / 6.6.6)', () => {
  const tests: PascalTest[] = [
    // ==========================================================================
    // 6.6.5.2 File handling procedures
    // ==========================================================================

    // --- rewrite / put / write / writeln ---
    {
      name: '6.6.5.2 rewrite(f): 正向 - 创建新文件用于写入',
      code: `program test; var f: file of char; begin assign(f,'OUT.TXT'); rewrite(f); writeln(f,'hello'); close(f); end.`,
      purpose: 'ISO 6.6.5.2 rewrite(f) post-assertion: f.M = Generation, f.L = f.R = S()',
      files: new Map<string, Uint8Array>([['OUT.TXT', new Uint8Array(0)]]),
      expectedFileContains: [{ url: 'OUT.TXT', contains: 'hello' }],
    },
    {
      name: '6.6.5.2 put(f): 正向 - 将缓冲区内容追加到文件',
      code: `program test; var f: file of integer; v: integer; begin assign(f,'OUT.TXT'); rewrite(f); v := 42; f^ := v; put(f); close(f); end.`,
      purpose: 'ISO 6.6.5.2 put(f) pre-assertion: f.M = Generation, f^ is not undefined',
      files: new Map<string, Uint8Array>([['OUT.TXT', new Uint8Array(0)]]),
      expectedFileContains: [{ url: 'OUT.TXT', contains: '42' }],
    },
    {
      name: '6.6.5.2 put(f): 反向 - 未 rewrite 直接 put 应失败',
      code: `program test; var f: file of integer; begin assign(f,'OUT.TXT'); f^ := 42; put(f); end.`,
      purpose: 'ISO 6.6.5.2 put(f) pre-assertion violated: f.M != Generation',
      files: new Map<string, Uint8Array>([['OUT.TXT', new Uint8Array(0)]]),
      expectedError: '',
      maxSteps: 1000,
    },

    // --- reset / get / read / readln ---
    {
      name: '6.6.5.2 reset(f): 正向 - 打开文件用于读取，F^ 指向首字符',
      code: `program test; var f: file of char; ch: char; begin assign(f,'IN.TXT'); reset(f); ch := f^; write(ch); end.`,
      purpose: 'ISO 6.6.5.2 reset(f) post-assertion: f.M = Inspection, f^ = f.R.first',
      files: new Map<string, Uint8Array>([['IN.TXT', text('AB')]]),
      expectedContains: 'A',
    },
    {
      name: '6.6.5.2 reset(f): 正向 - 空文件 reset 后 EOF 为真',
      code: `program test; var f: file of char; begin assign(f,'EMPTY.TXT'); reset(f); if eof(f) then write('EMPTY') else write('NOT EMPTY'); end.`,
      purpose: 'ISO 6.6.5.2 reset(f) post-assertion: f.R = S() => f^ undefined, eof true',
      files: new Map<string, Uint8Array>([['EMPTY.TXT', new Uint8Array(0)]]),
      expectedContains: 'EMPTY',
    },
    {
      name: '6.6.5.2 get(f): 正向 - 推进到下一个组件',
      code: `program test; var f: file of char; ch: char; begin assign(f,'IN.TXT'); reset(f); get(f); ch := f^; write(ch); end.`,
      purpose: 'ISO 6.6.5.2 get(f) post-assertion: f.R = f0.R.rest, f^ = f.R.first',
      files: new Map<string, Uint8Array>([['IN.TXT', text('AB')]]),
      expectedContains: 'B',
    },
    {
      name: '6.6.5.2 get(f): 反向 - EOF 后 get 应失败',
      code: `program test; var f: file of char; begin assign(f,'IN.TXT'); reset(f); get(f); get(f); get(f); end.`,
      purpose: 'ISO 6.6.5.2 get(f) pre-assertion violated: f0.R is S() (EOF)',
      files: new Map<string, Uint8Array>([['IN.TXT', text('AB')]]),
      expectedError: '',
      maxSteps: 1000,
    },
    {
      name: '6.6.5.2 read(f, v): 正向 - 从文件读整数',
      code: `program test; var f: file of char; n: integer; begin assign(f,'IN.TXT'); reset(f); read(f, n); write(n); end.`,
      purpose: 'ISO 6.6.5.2 read(f, v) integer case: s forms signed-integer',
      files: new Map<string, Uint8Array>([['IN.TXT', text('42')]]),
      expectedContains: '42',
    },
    {
      name: '6.6.5.2 read(f, c): 正向 - 读 char 不跳过空格',
      code: `program test; var f: file of char; c: char; begin assign(f,'IN.TXT'); reset(f); read(f, c); write(ord(c)); end.`,
      purpose: 'ISO 6.6.5.2 read(f, v) char case: s length 1, 不跳过空格',
      files: new Map<string, Uint8Array>([['IN.TXT', text(' A')]]),
      expectedContains: '32',
    },

    // --- page ---
    {
      name: '6.6.5.2 page(f): 正向 - 写入 form feed 字符',
      code: `program test; var f: file of char; begin assign(f,'OUT.TXT'); rewrite(f); page(f); write(f, 'X'); close(f); end.`,
      purpose: 'ISO 6.6.5.2 page(f) 在文件中写入 form feed (0x0C)',
      files: new Map<string, Uint8Array>([['OUT.TXT', new Uint8Array(0)]]),
      expectedFileContains: [{ url: 'OUT.TXT', contains: '\f' }],
    },

    // ==========================================================================
    // 6.6.5.3 Dynamic allocation procedures (new / dispose)
    // ==========================================================================

    {
      name: '6.6.5.3 new(p): 正向 - new 后 p^ 可读写',
      code: `program test; type iptr = ^integer; var p: iptr; begin new(p); p^ := 42; write(p^); dispose(p); end.`,
      purpose: 'ISO 6.6.5.3 new(p) 创建新变量，p^ := 42 赋值，write(p^) 输出 42',
      expectedContains: '42',
    },
    {
      name: '6.6.5.3 new(p): 正向 - new 后 p 不等于 nil',
      code: `program test; type iptr = ^integer; var p: iptr; begin new(p); if p <> nil then write('NOTNIL') else write('NIL'); dispose(p); end.`,
      purpose: 'ISO 6.6.5.3 new(p) 后 p 是 identifying-value，非 nil',
      expectedContains: 'NOTNIL',
    },
    {
      name: '6.6.5.3 nil 比较: 正向 - 未初始化指针等于 nil',
      code: `program test; type iptr = ^integer; var p: iptr; begin if p = nil then write('NIL') else write('NOTNIL'); end.`,
      purpose: 'ISO 6.4.4: 指针变量默认为 nil-value',
      expectedContains: 'NIL',
    },
    {
      name: '6.6.5.3 new/record: 正向 - 指向记录的指针',
      code: `program test; type rptr = ^rec; rec = record x: integer; y: integer; end; var p: rptr; begin new(p); p^.x := 10; p^.y := 20; write(p^.x + p^.y); dispose(p); end.`,
      purpose: 'ISO 6.6.5.3 new(p) 对记录类型，p^.field 访问',
      expectedContains: '30',
    },
    {
      name: '6.6.5.3 p^: 反向 - nil 解引用应报错',
      code: `program test; type iptr = ^integer; var p: iptr; begin p^ := 42; end.`,
      purpose: 'ISO 6.4.4/6.5.4: nil 指针解引用是 error',
      expectedError: 'nil pointer',
      maxSteps: 1000,
    },
    {
      name: '6.6.5.3 dispose(nil): 反向 - dispose 未初始化指针应报错',
      code: `program test; type iptr = ^integer; var p: iptr; begin dispose(p); end.`,
      purpose: 'ISO 6.6.5.3: dispose 的 identifying-value 为 nil 是 error',
      expectedError: 'nil-value',
      maxSteps: 1000,
    },
    {
      name: '6.6.5.3 dispose 后解引用: 反向 - dispose 后 p^ 应报错',
      code: `program test; type iptr = ^integer; var p: iptr; begin new(p); dispose(p); p^ := 42; end.`,
      purpose: 'ISO 6.6.5.3: dispose 后 p 置 nil，再解引用是 error',
      expectedError: 'nil pointer',
      maxSteps: 1000,
    },

    // ==========================================================================
    // 6.6.5.4 Transfer procedures (pack / unpack)
    // ==========================================================================

    {
      name: '6.6.5.4 pack: 反向 - 未实现的标准过程应报错',
      code: `program test; var a: array[1..10] of char; z: packed array[1..10] of char; begin pack(a, 1, z); end.`,
      purpose: 'ISO 6.6.5.4 pack - 当前实现未支持，必须报错',
      expectedError: 'unknown procedure',
      maxSteps: 1000,
    },
    {
      name: '6.6.5.4 unpack: 反向 - 未实现的标准过程应报错',
      code: `program test; var a: array[1..10] of char; z: packed array[1..10] of char; begin unpack(z, a, 1); end.`,
      purpose: 'ISO 6.6.5.4 unpack - 当前实现未支持，必须报错',
      expectedError: 'unknown procedure',
      maxSteps: 1000,
    },

    // ==========================================================================
    // 6.6.6.2 Arithmetic functions
    // ==========================================================================

    {
      name: '6.6.6.2 abs(x): 正向 - 整数绝对值',
      code: `program test; var x: integer; begin x := -5; write(abs(x)); end.`,
      purpose: 'ISO 6.6.6.2 abs(-5) = 5',
      expectedContains: '5',
    },
    {
      name: '6.6.6.2 abs(x): 正向 - 实数绝对值',
      code: `program test; var x: real; begin x := -3.5; write(abs(x)); end.`,
      purpose: 'ISO 6.6.6.2 abs(-3.5) = 3.5',
      expectedContains: '3.5',
    },
    {
      name: '6.6.6.2 sqr(x): 正向 - 整数平方',
      code: `program test; begin write(sqr(7)); end.`,
      purpose: 'ISO 6.6.6.2 sqr(7) = 49',
      expectedContains: '49',
    },
    {
      name: '6.6.6.2 sqr(x): 正向 - 实数平方',
      code: `program test; begin write(sqr(1.5)); end.`,
      purpose: 'ISO 6.6.6.2 sqr(1.5) = 2.25',
      expectedContains: '2.25',
    },
    {
      name: '6.6.6.2 sqrt(x): 正向 - 非负实数平方根',
      code: `program test; begin write(sqrt(4.0)); end.`,
      purpose: 'ISO 6.6.6.2 sqrt(4.0) = 2.0',
      expectedContains: '2',
    },
    {
      name: '6.6.6.2 sqrt(x): 反向 - 负数平方根应报错',
      code: `program test; begin write(sqrt(-1.0)); end.`,
      purpose: 'ISO 6.6.6.2 sqrt: "It shall be an error if such a value does not exist"',
      expectedError: '',
      maxSteps: 1000,
    },
    {
      name: '6.6.6.2 ln(x): 正向 - 自然对数',
      code: `program test; begin write(ln(1.0)); end.`,
      purpose: 'ISO 6.6.6.2 ln(1.0) = 0',
      expectedContains: '0',
    },
    {
      name: '6.6.6.2 ln(x): 反向 - 非正数对数应报错',
      code: `program test; begin write(ln(0.0)); end.`,
      purpose: 'ISO 6.6.6.2 ln: "It shall be an error if such a value does not exist" (x > 0 required)',
      expectedError: '',
      maxSteps: 1000,
    },
    {
      name: '6.6.6.2 exp(x): 正向 - 指数函数',
      code: `program test; begin write(round(exp(1.0))); end.`,
      purpose: 'ISO 6.6.6.2 exp(1.0) = e ≈ 2.718... (round to 3)',
      expectedContains: '3',
    },
    {
      name: '6.6.6.2 sin(x): 正向 - 正弦函数',
      code: `program test; begin write(round(sin(0.0))); end.`,
      purpose: 'ISO 6.6.6.2 sin(0) = 0',
      expectedContains: '0',
    },
    {
      name: '6.6.6.2 cos(x): 正向 - 余弦函数',
      code: `program test; begin write(round(cos(0.0))); end.`,
      purpose: 'ISO 6.6.6.2 cos(0) = 1',
      expectedContains: '1',
    },
    {
      name: '6.6.6.2 arctan(x): 正向 - 反正切函数',
      code: `program test; begin write(round(arctan(0.0))); end.`,
      purpose: 'ISO 6.6.6.2 arctan(0) = 0',
      expectedContains: '0',
    },

    // ==========================================================================
    // 6.6.6.3 Transfer functions (trunc / round)
    // ==========================================================================

    {
      name: '6.6.6.3 trunc(x): 正向 - 正数截断',
      code: `program test; begin write(trunc(3.7)); end.`,
      purpose: 'ISO 6.6.6.3 trunc(3.7) = 3 (0 <= x - trunc(x) < 1)',
      expectedContains: '3',
    },
    {
      name: '6.6.6.3 trunc(x): 正向 - 负数截断',
      code: `program test; begin write(trunc(-3.7)); end.`,
      purpose: 'ISO 6.6.6.3 trunc(-3.7) = -3 (-1 < x - trunc(x) <= 0)',
      expectedContains: '-3',
    },
    {
      name: '6.6.6.3 round(x): 正向 - 正数四舍五入',
      code: `program test; begin write(round(3.5)); end.`,
      purpose: 'ISO 6.6.6.3 round(3.5) = trunc(3.5+0.5) = 4',
      expectedContains: '4',
    },
    {
      name: '6.6.6.3 round(x): 正向 - 负数四舍五入',
      code: `program test; begin write(round(-3.5)); end.`,
      purpose: 'ISO 6.6.6.3 round(-3.5) = trunc(-3.5-0.5) = -4',
      expectedContains: '-4',
    },

    // ==========================================================================
    // 6.6.6.4 Ordinal functions (ord / chr / succ / pred)
    // ==========================================================================

    {
      name: '6.6.6.4 ord(x): 正向 - char 的序数',
      code: `program test; begin write(ord('A')); end.`,
      purpose: 'ISO 6.6.6.4 ord(A) = 65',
      expectedContains: '65',
    },
    {
      name: '6.6.6.4 ord(x): 正向 - 布尔的序数',
      code: `program test; begin write(ord(true)); end.`,
      purpose: 'ISO 6.6.6.4 ord(true) = 1',
      expectedContains: '1',
    },
    {
      name: '6.6.6.4 ord(x): 正向 - 整数的序数（即自身）',
      code: `program test; begin write(ord(42)); end.`,
      purpose: 'ISO 6.6.6.4 ord(42) = 42 (integer is its own ordinal)',
      expectedContains: '42',
    },
    {
      name: '6.6.6.4 chr(x): 正向 - 整数转字符',
      code: `program test; begin write(chr(66)); end.`,
      purpose: 'ISO 6.6.6.4 chr(66) = B',
      expectedContains: 'B',
    },
    {
      name: '6.6.6.4 succ(x): 正向 - 后继值',
      code: `program test; var c: char; begin c := 'A'; write(succ(c)); end.`,
      purpose: 'ISO 6.6.6.4 succ(A) = B',
      expectedContains: 'B',
    },
    {
      name: '6.6.6.4 pred(x): 正向 - 前驱值',
      code: `program test; var c: char; begin c := 'B'; write(pred(c)); end.`,
      purpose: 'ISO 6.6.6.4 pred(B) = A',
      expectedContains: 'A',
    },
    {
      name: '6.6.6.4 succ(x): 反向 - 枚举末值无后继应报错',
      code: `program test; type color = (red, green, blue); var c: color; begin c := blue; write(succ(c)); end.`,
      purpose: 'ISO 6.6.6.4 succ: "error if none" - blue 是最后一个枚举值',
      expectedError: '',
      maxSteps: 1000,
    },
    {
      name: '6.6.6.4 pred(x): 反向 - 枚举首值无前驱应报错',
      code: `program test; type color = (red, green, blue); var c: color; begin c := red; write(pred(c)); end.`,
      purpose: 'ISO 6.6.6.4 pred: "error if none" - red 是第一个枚举值',
      expectedError: '',
      maxSteps: 1000,
    },

    // ==========================================================================
    // 6.6.6.5 Boolean functions (odd / eof / eoln)
    // ==========================================================================

    {
      name: '6.6.6.5 odd(x): 正向 - 奇数返回 true',
      code: `program test; begin if odd(7) then write('ODD') else write('EVEN'); end.`,
      purpose: 'ISO 6.6.6.5 odd(7) = true (abs(7) mod 2 = 1)',
      expectedContains: 'ODD',
    },
    {
      name: '6.6.6.5 odd(x): 正向 - 偶数返回 false',
      code: `program test; begin if odd(8) then write('ODD') else write('EVEN'); end.`,
      purpose: 'ISO 6.6.6.5 odd(8) = false (abs(8) mod 2 = 0)',
      expectedContains: 'EVEN',
    },
    {
      name: '6.6.6.5 eof(f): 正向 - 文件末尾检测',
      code: `program test; var f: file of char; begin assign(f,'EMPTY.TXT'); reset(f); if eof(f) then write('EOF'); end.`,
      purpose: 'ISO 6.6.6.5 eof(f): "true if f.R is empty sequence"',
      files: new Map<string, Uint8Array>([['EMPTY.TXT', new Uint8Array(0)]]),
      expectedContains: 'EOF',
    },
    {
      name: '6.6.6.5 eoln(f): 正向 - 行结束检测',
      code: `program test; var f: file of char; begin assign(f,'IN.TXT'); reset(f); while not eoln(f) do get(f); if eoln(f) then write('EOLN'); end.`,
      purpose: 'ISO 6.6.6.5 eoln(f): "true if f^ is end-of-line or end-of-file"',
      files: new Map<string, Uint8Array>([['IN.TXT', text('AB\n')]]),
      expectedContains: 'EOLN',
    },
    {
      name: '6.6.6.5 eof: 正向 - 无参数默认对 input',
      code: `program test; begin if eof then write('INPUT_EOF'); end.`,
      purpose: 'ISO 6.6.6.5 eof: "If parameter omitted, applies to input"',
      input: [],
      expectedContains: 'INPUT_EOF',
    },
    {
      name: '6.6.6.5 eoln: 正向 - 无参数默认对 input',
      code: `program test; begin if eoln then write('INPUT_EOLN'); end.`,
      purpose: 'ISO 6.6.6.5 eoln: "If parameter omitted, applies to input" (空输入立即 EOLN)',
      input: [],
      expectedContains: 'INPUT_EOLN',
    },
  ]

  runPascalTests(tests)
})
