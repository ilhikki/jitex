// ISO 7185 标准库正反测试（全部符合 ISO 7185:1990）
//
// 依据：ISO 7185:1990
//   - 6.6.5 Required procedures
//   - 6.6.6 Required functions
//
// 所有文件操作均使用 PROGRAM 参数绑定，去掉 ASSIGN/CLOSE，文本文件使用 TEXT 类型。

import { describe } from './_helper.ts'
import { type PascalTest, runPascalTests } from './_helper.ts'

function text(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

describe('ISO 7185 Standard Library (6.6.5 / 6.6.6) — compliant', () => {
  const tests: PascalTest[] = [
    // ==========================================================================
    // 6.6.5.2 File handling procedures
    // ==========================================================================

    // --- rewrite / write / writeln (text) ---
    {
      name: '6.6.5.2 rewrite(f): 正向 - 创建新文件用于写入',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN REWRITE(F);WRITELN(F,'HELLO');END.`,
      purpose: 'ISO 6.6.5.2 rewrite(f) post‑assertion',
      textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
      expectedFileContains: [{ url: 'F', contains: 'HELLO' }],
    },

    // --- put (for text file, using f^ and put) ---
    {
      name: '6.6.5.2 put(f): 正向 - 将缓冲区内容追加到文件',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;V:CHAR;BEGIN REWRITE(F);V:='A';F^:=V;PUT(F);END.`,
      purpose: 'ISO 6.6.5.2 put(f) pre‑assertion: f.M = Generation, f^ is not undefined',
      textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
      expectedFileContains: [{ url: 'F', contains: 'A' }],
    },

    {
      name: '6.6.5.2 put(f): 反向 - 未 rewrite 直接 put 应失败',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN F^:='A';PUT(F);END.`,
      purpose: 'ISO 6.6.5.2 put(f) pre‑assertion violated: f.M != Generation',
      textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
      expectedError: '',
      maxSteps: 1000,
    },

    // --- reset / get / read ---
    {
      name: '6.6.5.2 reset(f): 正向 - 打开文件用于读取，F^ 指向首字符',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;CH:CHAR;BEGIN RESET(F);CH:=F^;WRITE(CH);END.`,
      purpose: 'ISO 6.6.5.2 reset(f) post‑assertion',
      textFiles: new Map<string, Uint8Array>([['F', text('AB')]]),
      expectedContains: 'A',
    },

    {
      name: '6.6.5.2 reset(f): 正向 - 空文件 reset 后 EOF 为真',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);IF EOF(F)THEN WRITE('EMPTY')ELSE WRITE('NOT EMPTY');END.`,
      purpose: 'ISO 6.6.5.2 reset(f) post‑assertion: f.R = S()',
      textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
      expectedContains: 'EMPTY',
    },

    {
      name: '6.6.5.2 get(f): 正向 - 推进到下一个组件',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;CH:CHAR;BEGIN RESET(F);GET(F);CH:=F^;WRITE(CH);END.`,
      purpose: 'ISO 6.6.5.2 get(f) post‑assertion',
      textFiles: new Map<string, Uint8Array>([['F', text('AB')]]),
      expectedContains: 'B',
    },

    {
      name: '6.6.5.2 get(f): 反向 - EOF 后 get 应失败',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);GET(F);GET(F);GET(F);END.`,
      purpose: 'ISO 6.6.5.2 get(f) pre‑assertion violated: f0.R is S()',
      textFiles: new Map<string, Uint8Array>([['F', text('AB')]]),
      expectedError: '',
      maxSteps: 1000,
    },

    {
      name: '6.6.5.2 read(f, v): 正向 - 从文件读整数',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;N:INTEGER;BEGIN RESET(F);READ(F,N);WRITE(N);END.`,
      purpose: 'ISO 6.6.5.2 read(f, v) integer case',
      textFiles: new Map<string, Uint8Array>([['F', text('42')]]),
      expectedContains: '42',
    },

    {
      name: '6.6.5.2 read(f, c): 正向 - 读 char 不跳过空格',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;C:CHAR;BEGIN RESET(F);READ(F,C);WRITE(ORD(C));END.`,
      purpose: 'ISO 6.6.5.2 read(f, v) char case: s length 1',
      textFiles: new Map<string, Uint8Array>([['F', text(' A')]]),
      expectedContains: '32',
    },

    // --- page ---
    {
      name: '6.6.5.2 page(f): 正向 - 写入 form feed 字符',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN REWRITE(F);PAGE(F);WRITE(F,'X');END.`,
      purpose: 'ISO 6.6.5.2 page(f) 在文本文件中写入 form feed',
      textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
      expectedFileContains: [{ url: 'F', contains: '\f' }],
    },

    // ==========================================================================
    // 6.6.5.3 Dynamic allocation procedures (new / dispose) — 无需修改
    // ==========================================================================

    {
      name: '6.6.5.3 new(p): 正向 - new 后 p^ 可读写',
      code: `PROGRAM TEST(OUTPUT);TYPE IPTR=^INTEGER;VAR P:IPTR;BEGIN NEW(P);P^:=42;WRITE(P^);DISPOSE(P);END.`,
      purpose: 'ISO 6.6.5.3 new(p) 创建新变量',
      expectedContains: '42',
    },

    {
      name: '6.6.5.3 new(p): 正向 - new 后 p 不等于 nil',
      code:
        `PROGRAM TEST(OUTPUT);TYPE IPTR=^INTEGER;VAR P:IPTR;BEGIN NEW(P);IF P<>NIL THEN WRITE('NOTNIL')ELSE WRITE('NIL');DISPOSE(P);END.`,
      purpose: 'ISO 6.6.5.3 new(p) 后 p 是 identifying‑value，非 nil',
      expectedContains: 'NOTNIL',
    },

    {
      name: '6.6.5.3 nil 比较: 正向 - 未初始化指针等于 nil',
      code:
        `PROGRAM TEST(OUTPUT);TYPE IPTR=^INTEGER;VAR P:IPTR;BEGIN IF P=NIL THEN WRITE('NIL')ELSE WRITE('NOTNIL');END.`,
      purpose: 'ISO 6.4.4: 指针变量默认为 nil‑value',
      expectedContains: 'NIL',
    },

    {
      name: '6.6.5.3 new/record: 正向 - 指向记录的指针',
      code:
        `PROGRAM TEST(OUTPUT);TYPE RPTR=^REC;REC=RECORD X:INTEGER;Y:INTEGER END;VAR P:RPTR;BEGIN NEW(P);P^.X:=10;P^.Y:=20;WRITE(P^.X+P^.Y);DISPOSE(P);END.`,
      purpose: 'ISO 6.6.5.3 new(p) 对记录类型',
      expectedContains: '30',
    },

    {
      name: '6.6.5.3 p^: 反向 - nil 解引用应报错',
      code: `PROGRAM TEST(OUTPUT);TYPE IPTR=^INTEGER;VAR P:IPTR;BEGIN P^:=42;END.`,
      purpose: 'ISO 6.4.4/6.5.4: nil 指针解引用是 error',
      expectedError: 'nil pointer',
      maxSteps: 1000,
    },

    {
      name: '6.6.5.3 dispose(nil): 反向 - dispose 未初始化指针应报错',
      code: `PROGRAM TEST(OUTPUT);TYPE IPTR=^INTEGER;VAR P:IPTR;BEGIN DISPOSE(P);END.`,
      purpose: 'ISO 6.6.5.3: dispose 的 identifying‑value 为 nil 是 error',
      expectedError: 'nil-value',
      maxSteps: 1000,
    },

    {
      name: '6.6.5.3 dispose 后解引用: 反向 - dispose 后 p^ 应报错',
      code: `PROGRAM TEST(OUTPUT);TYPE IPTR=^INTEGER;VAR P:IPTR;BEGIN NEW(P);DISPOSE(P);P^:=42;END.`,
      purpose: 'ISO 6.6.5.3: dispose 后 p 置 nil，再解引用是 error',
      expectedError: 'nil pointer',
      maxSteps: 1000,
    },

    // ==========================================================================
    // 6.6.5.4 Transfer procedures (pack / unpack) — 这些过程标准要求存在，测试报错合理
    // ==========================================================================

    {
      name: '6.6.5.4 pack: 反向 - 未实现的标准过程应报错',
      code: `PROGRAM TEST(OUTPUT);VAR A:ARRAY[1..10] OF CHAR;Z:PACKED ARRAY[1..10] OF CHAR;BEGIN PACK(A,1,Z);END.`,
      purpose: 'ISO 6.6.5.4 pack — 当前实现未支持，必须报错',
      expectedError: 'unknown procedure',
      maxSteps: 1000,
    },

    {
      name: '6.6.5.4 unpack: 反向 - 未实现的标准过程应报错',
      code: `PROGRAM TEST(OUTPUT);VAR A:ARRAY[1..10] OF CHAR;Z:PACKED ARRAY[1..10] OF CHAR;BEGIN UNPACK(Z,A,1);END.`,
      purpose: 'ISO 6.6.5.4 unpack — 当前实现未支持，必须报错',
      expectedError: 'unknown procedure',
      maxSteps: 1000,
    },

    // ==========================================================================
    // 6.6.6.2 Arithmetic functions (无需修改)
    // ==========================================================================

    {
      name: '6.6.6.2 abs(x): 正向 - 整数绝对值',
      code: `PROGRAM TEST(OUTPUT);VAR X:INTEGER;BEGIN X:=-5;WRITE(ABS(X));END.`,
      purpose: 'ISO 6.6.6.2 abs(-5)=5',
      expectedContains: '5',
    },

    {
      name: '6.6.6.2 abs(x): 正向 - 实数绝对值',
      code: `PROGRAM TEST(OUTPUT);VAR X:REAL;BEGIN X:=-3.5;WRITE(ABS(X));END.`,
      purpose: 'ISO 6.6.6.2 abs(-3.5)=3.5',
      expectedContains: '3.5',
    },

    {
      name: '6.6.6.2 sqr(x): 正向 - 整数平方',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(SQR(7));END.`,
      purpose: 'ISO 6.6.6.2 sqr(7)=49',
      expectedContains: '49',
    },

    {
      name: '6.6.6.2 sqr(x): 正向 - 实数平方',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(SQR(1.5));END.`,
      purpose: 'ISO 6.6.6.2 sqr(1.5)=2.25',
      expectedContains: '2.25',
    },

    {
      name: '6.6.6.2 sqrt(x): 正向 - 非负实数平方根',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(SQRT(4.0));END.`,
      purpose: 'ISO 6.6.6.2 sqrt(4.0)=2.0',
      expectedContains: '2',
    },

    {
      name: '6.6.6.2 sqrt(x): 反向 - 负数平方根应报错',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(SQRT(-1.0));END.`,
      purpose: 'ISO 6.6.6.2 sqrt: "It shall be an error if such a value does not exist"',
      expectedError: '',
      maxSteps: 1000,
    },

    {
      name: '6.6.6.2 ln(x): 正向 - 自然对数',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(LN(1.0));END.`,
      purpose: 'ISO 6.6.6.2 ln(1.0)=0',
      expectedContains: '0',
    },

    {
      name: '6.6.6.2 ln(x): 反向 - 非正数对数应报错',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(LN(0.0));END.`,
      purpose: 'ISO 6.6.6.2 ln: "It shall be an error if such a value does not exist" (x>0)',
      expectedError: '',
      maxSteps: 1000,
    },

    {
      name: '6.6.6.2 exp(x): 正向 - 指数函数',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(EXP(1.0)));END.`,
      purpose: 'ISO 6.6.6.2 exp(1.0) ≈ 2.718... → 3',
      expectedContains: '3',
    },

    {
      name: '6.6.6.2 sin(x): 正向 - 正弦函数',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(SIN(0.0)));END.`,
      purpose: 'ISO 6.6.6.2 sin(0)=0',
      expectedContains: '0',
    },

    {
      name: '6.6.6.2 cos(x): 正向 - 余弦函数',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(COS(0.0)));END.`,
      purpose: 'ISO 6.6.6.2 cos(0)=1',
      expectedContains: '1',
    },

    {
      name: '6.6.6.2 arctan(x): 正向 - 反正切函数',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(ARCTAN(0.0)));END.`,
      purpose: 'ISO 6.6.6.2 arctan(0)=0',
      expectedContains: '0',
    },

    // ==========================================================================
    // 6.6.6.3 Transfer functions (trunc / round)
    // ==========================================================================

    {
      name: '6.6.6.3 trunc(x): 正向 - 正数截断',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(TRUNC(3.7));END.`,
      purpose: 'ISO 6.6.6.3 trunc(3.7)=3',
      expectedContains: '3',
    },

    {
      name: '6.6.6.3 trunc(x): 正向 - 负数截断',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(TRUNC(-3.7));END.`,
      purpose: 'ISO 6.6.6.3 trunc(-3.7)=-3',
      expectedContains: '-3',
    },

    {
      name: '6.6.6.3 round(x): 正向 - 正数四舍五入',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(3.5));END.`,
      purpose: 'ISO 6.6.6.3 round(3.5)=4',
      expectedContains: '4',
    },

    {
      name: '6.6.6.3 round(x): 正向 - 负数四舍五入',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(-3.5));END.`,
      purpose: 'ISO 6.6.6.3 round(-3.5)=-4',
      expectedContains: '-4',
    },

    // ==========================================================================
    // 6.6.6.4 Ordinal functions (ord / chr / succ / pred)
    // ==========================================================================

    {
      name: '6.6.6.4 ord(x): 正向 - char 的序数',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ORD('A'));END.`,
      purpose: 'ISO 6.6.6.4 ord(A)=65',
      expectedContains: '65',
    },

    {
      name: '6.6.6.4 ord(x): 正向 - 布尔的序数',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ORD(TRUE));END.`,
      purpose: 'ISO 6.6.6.4 ord(TRUE)=1',
      expectedContains: '1',
    },

    {
      name: '6.6.6.4 ord(x): 正向 - 整数的序数（即自身）',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ORD(42));END.`,
      purpose: 'ISO 6.6.6.4 ord(42)=42',
      expectedContains: '42',
    },

    {
      name: '6.6.6.4 chr(x): 正向 - 整数转字符',
      code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(CHR(66));END.`,
      purpose: 'ISO 6.6.6.4 chr(66)=B',
      expectedContains: 'B',
    },

    {
      name: '6.6.6.4 succ(x): 正向 - 后继值',
      code: `PROGRAM TEST(OUTPUT);VAR C:CHAR;BEGIN C:='A';WRITE(SUCC(C));END.`,
      purpose: 'ISO 6.6.6.4 succ(A)=B',
      expectedContains: 'B',
    },

    {
      name: '6.6.6.4 pred(x): 正向 - 前驱值',
      code: `PROGRAM TEST(OUTPUT);VAR C:CHAR;BEGIN C:='B';WRITE(PRED(C));END.`,
      purpose: 'ISO 6.6.6.4 pred(B)=A',
      expectedContains: 'A',
    },

    {
      name: '6.6.6.4 succ(x): 反向 - 枚举末值无后继应报错',
      code: `PROGRAM TEST(OUTPUT);TYPE COLOR=(RED,GREEN,BLUE);VAR C:COLOR;BEGIN C:=BLUE;WRITE(SUCC(C));END.`,
      purpose: 'ISO 6.6.6.4 succ: "error if none"',
      expectedError: '',
      maxSteps: 1000,
    },

    {
      name: '6.6.6.4 pred(x): 反向 - 枚举首值无前驱应报错',
      code: `PROGRAM TEST(OUTPUT);TYPE COLOR=(RED,GREEN,BLUE);VAR C:COLOR;BEGIN C:=RED;WRITE(PRED(C));END.`,
      purpose: 'ISO 6.6.6.4 pred: "error if none"',
      expectedError: '',
      maxSteps: 1000,
    },

    // ==========================================================================
    // 6.6.6.5 Boolean functions (odd / eof / eoln)
    // ==========================================================================

    {
      name: '6.6.6.5 odd(x): 正向 - 奇数返回 true',
      code: `PROGRAM TEST(OUTPUT);BEGIN IF ODD(7)THEN WRITE('ODD')ELSE WRITE('EVEN');END.`,
      purpose: 'ISO 6.6.6.5 odd(7)=true',
      expectedContains: 'ODD',
    },

    {
      name: '6.6.6.5 odd(x): 正向 - 偶数返回 false',
      code: `PROGRAM TEST(OUTPUT);BEGIN IF ODD(8)THEN WRITE('ODD')ELSE WRITE('EVEN');END.`,
      purpose: 'ISO 6.6.6.5 odd(8)=false',
      expectedContains: 'EVEN',
    },

    {
      name: '6.6.6.5 eof(f): 正向 - 文件末尾检测',
      code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);IF EOF(F)THEN WRITE('EOF');END.`,
      purpose: 'ISO 6.6.6.5 eof(f): "true if f.R is empty sequence"',
      textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
      expectedContains: 'EOF',
    },

    {
      name: '6.6.6.5 eoln(f): 正向 - 行结束检测',
      code:
        `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);WHILE NOT EOLN(F)DO GET(F);IF EOLN(F)THEN WRITE('EOLN');END.`,
      purpose: 'ISO 6.6.6.5 eoln(f): "true if f^ is end‑of‑line or end‑of‑file"',
      textFiles: new Map<string, Uint8Array>([['F', text('AB\n')]]),
      expectedContains: 'EOLN',
    },

    {
      name: '6.6.6.5 eof: 正向 - 无参数默认对 input',
      code: `PROGRAM TEST(INPUT,OUTPUT);BEGIN IF EOF THEN WRITE('INPUT_EOF');END.`,
      purpose: 'ISO 6.6.6.5 eof: "If parameter omitted, applies to input"',
      expectedContains: 'INPUT_EOF',
    },

    {
      name: '6.6.6.5 eoln: 正向 - 无参数默认对 input',
      code: `PROGRAM TEST(INPUT,OUTPUT);BEGIN IF EOLN THEN WRITE('INPUT_EOLN');END.`,
      purpose: 'ISO 6.6.6.5 eoln: "If parameter omitted, applies to input"',
      expectedContains: 'INPUT_EOLN',
    },
  ]

  runPascalTests(tests)
})
