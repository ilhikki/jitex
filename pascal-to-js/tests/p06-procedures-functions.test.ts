// ISO/IEC 7185:1990 - 6.6 Procedure and function declarations
//
// 章节概括：
//   规定过程与函数的声明语法与语义。procedure-declaration 有「directive + procedure-identification」、
//   「procedure-heading + procedure-block」两种形式，function-declaration 与之类似并额外含 result-type
//   （只能为 simple-type-identifier 或 pointer-type-identifier）。heading 中标识符构成定义点；
//   forward 指令对应的标识符必须恰有一个应用出现在同一 procedure-and-function-declaration-part 内；
//   一个 procedure/function-identifier 至多关联一个 block；function-block 至少要有一条以该函数标识符
//   为赋值目标的赋值语句。参数部分规定 value/variable/procedural/functional 四类形式参数的定义点与绑定规则
//   （变量参数的实参须为 variable-access，不得为变体的 selector 或 packed 类型的分量）、参数表 congruity
//   判据，以及（扩展级别）conformant array 参数与 conformability 规则。required procedures 用前后断言定义
//   文件处理过程 rewrite/put/reset/get 与 read/write、动态分配过程 new/dispose、转移过程 pack/unpack；
//   required functions 定义算术函数（abs、sqr、sin、cos、exp、ln、sqrt、arctan）、转移函数（trunc、round）、
//   序数函数（ord、chr、succ、pred）与布尔函数（odd、eof、eoln）的结果与出错条件。
//
// 子章节：
//   6.6.1 Procedure-declarations
//   6.6.2 Function-declarations
//   6.6.3 Parameters
//     6.6.3.1 General
//     6.6.3.2 Value parameters
//     6.6.3.3 Variable parameters
//     6.6.3.4 Procedural parameters
//     6.6.3.5 Functional parameters
//     6.6.3.6 Parameter list congruity
//     6.6.3.7 Conformant array parameters
//     6.6.3.8 Conformability
//   6.6.4 Required procedures and functions
//   6.6.5 Required procedures
//     6.6.5.1 General
//     6.6.5.2 File handling procedures
//     6.6.5.3 Dynamic allocation procedures
//     6.6.5.4 Transfer procedures
//   6.6.6 Required functions
//     6.6.6.1 General
//     6.6.6.2 Arithmetic functions
//     6.6.6.3 Transfer functions
//     6.6.6.4 Ordinal functions
//     6.6.6.5 Boolean functions

import { type PascalTest, runPascalTests } from './harness.ts'

function text(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

const tests: PascalTest[] = [
  // 6.6.1 / 6.6.2 过程与函数的声明、定义点与 block 关联

  {
    name: '6.6 无参过程的声明与调用',
    code: `program test(output);
        procedure hello;
        begin writeln('HI'); end;
        begin hello; end.`,
    purpose: 'ISO 6.6.1：procedure-heading 中标识符构成定义点，过程调用激活其 block',
    expectedOutput: 'HI\n',
  },
  {
    name: '6.6 带值参数的过程',
    code: `program test(output);
        procedure printn(n: integer);
        begin writeln(n); end;
        begin printn(42); end.`,
    purpose: 'ISO 6.6.3.2：值参数的当前值在 block 激活时赋予形参变量',
    expectedOutput: '42\n',
  },
  {
    name: '6.6 带变量参数的过程',
    code: `program test(output);
        var a: integer;
        procedure incvar(var x: integer);
        begin x := x + 1; end;
        begin a := 5; incvar(a); writeln(a); end.`,
    purpose: 'ISO 6.6.3.3：变量参数引用实参变量，对形参的赋值反映到实参上',
    expectedOutput: '6\n',
  },
  {
    name: '6.6 无参函数的声明与调用',
    code: `program test(output);
        function getanswer: integer;
        begin getanswer := 42; end;
        begin writeln(getanswer); end.`,
    purpose: 'ISO 6.6.2：function-heading 定义函数标识符，block 内对它赋值即函数结果',
    expectedOutput: '42\n',
  },
  {
    name: '6.6 带值参数与结果的函数',
    code: `program test(output);
        function add(a, b: integer): integer;
        begin add := a + b; end;
        begin writeln(add(5, 3)); end.`,
    purpose: 'ISO 6.6.2/6.6.3.2：函数调用以实参表达式激活 block，函数标识符的最终值即结果',
    expectedOutput: '8\n',
  },
  {
    name: '6.6 嵌套过程：过程标识符的定义点为其最内层块',
    code: `program test(output);
        procedure outer;
          procedure inner;
          begin writeln('IN'); end;
        begin inner; end;
        begin outer; end.`,
    purpose: 'ISO 6.6.1：过程标识符的 region 是最接近包含该声明的 block，故 inner 在 outer 内可见',
    expectedOutput: 'IN\n',
  },
  {
    name: '6.6 递归函数：函数标识符在其自身 block 内可见',
    code: `program test(output);
        var r: integer;
        function fact(n: integer): integer;
        begin
          if n <= 1 then fact := 1
          else fact := n * fact(n - 1);
        end;
        begin r := fact(5); writeln(r); end.`,
    purpose: 'ISO 6.6.2：函数标识符在函数自身的 block 内可被应用（递归）',
    expectedOutput: '120\n',
  },
  {
    name: '6.6 嵌套函数可访问外层函数的形参',
    code: `program test(output);
        function outer(x: integer): integer;
          function inner(y: integer): integer;
          begin inner := x + y; end;
        begin outer := inner(10); end;
        begin writeln(outer(5)); end.`,
    purpose: 'ISO 6.6.3.1：外层函数的形参是其 block 的变量标识符，内层函数可引用',
    expectedOutput: '15\n',
  },
  {
    name: '6.6 forward 过程声明与其后的定义',
    code: `program test(output);
        procedure p; forward;
        procedure q;
        begin p; end;
        procedure p;
        begin writeln('P'); end;
        begin q; end.`,
    purpose: 'ISO 6.6.1：forward 声明的标识符须在同一声明部分有一个 procedure-identification 形式的应用（即后续定义）',
    expectedOutput: 'P\n',
  },
  {
    name: '6.6 forward 函数声明与其后的定义',
    code: `program test(output);
        function f(n: integer): integer; forward;
        function g(n: integer): integer;
        begin g := f(n) + 1; end;
        function f(n: integer): integer;
        begin f := n * 2; end;
        begin writeln(g(5)); end.`,
    purpose: 'ISO 6.6.2：forward 声明的函数标识符须在同一声明部分有 function-identification 形式的应用',
    expectedOutput: '11\n',
  },
  {
    name: '6.6 forward 声明用于互递归过程',
    code: `program test(output);
        procedure ping(n: integer); forward;
        procedure pong(n: integer);
        begin
          if n > 0 then
          begin writeln('PONG'); ping(n - 1); end;
        end;
        procedure ping(n: integer);
        begin
          if n > 0 then
          begin writeln('PING'); pong(n - 1); end;
        end;
        begin ping(3); end.`,
    purpose: 'ISO 6.6.1：forward 使两个过程可以互相调用',
    expectedOutput: 'PING\nPONG\nPING\n',
  },
  {
    name: '6.6 forward 声明的标识符缺少后续定义应报错',
    code: `program test(output);
        procedure p; forward;
        begin
        end.`,
    purpose: 'ISO 6.6.1：forward 对应的标识符若无 procedure-identification 应用，则违反标准要求',
    expectedError: '',
  },
  {
    name: '6.6 同一过程标识符关联两个 block 应报错',
    code: `program test(output);
        procedure p;
        begin end;
        procedure p;
        begin end;
        begin p; end.`,
    purpose: 'ISO 6.6.1：一个 procedure-identifier 至多关联一个 procedure-block',
    expectedError: '',
  },
  {
    name: '6.6 函数 block 必须含对函数标识符的赋值语句',
    code: `program test(output);
        function f: integer;
        begin end;
        begin writeln(f); end.`,
    purpose: 'ISO 6.6.2：function-block 至少要有一条以该函数标识符为赋值目标的赋值语句',
    expectedError: '',
  },

  // 6.6.3.1 形式参数的定义点

  {
    name: '6.6 形参标识符遮蔽块外层的同名变量',
    code: `program test(output);
        var x: integer;
        procedure testparam(x: integer);
        begin writeln(x); end;
        begin x := 100; testparam(42); end.`,
    purpose: 'ISO 6.6.3.1：标识符出现在 value-parameter-specification 中构成形参的定义点，遮蔽外层同名变量',
    expectedOutput: '42\n',
  },
  {
    name: '6.6 形参与其所在 block 的局部变量同名应报错',
    code: `program test(output);
        procedure testparam(a: integer);
        var a: integer;
        begin a := 10; writeln(a); end;
        begin testparam(5); end.`,
    purpose: 'ISO 6.6.3.1：形参的 associated variable-identifier 的 region 是 block，不能再以局部变量声明同名',
    expectedError: '',
  },

  // 6.6.3.2 值参数

  {
    name: '6.6 值参数按值传递，不影响实参变量',
    code: `program test(output);
        var a: integer;
        procedure testvalue(x: integer);
        begin x := x + 1; end;
        begin a := 10; testvalue(a); writeln(a); end.`,
    purpose: 'ISO 6.6.3.2：值参数与实参是不同的变量，对形参赋值不改变实参',
    expectedOutput: '10\n',
  },
  {
    name: '6.6 值参数的实参可为任意表达式',
    code: `program test(output);
        procedure printvalue(x: integer);
        begin writeln(x); end;
        begin printvalue(5 + 3 * 2); end.`,
    purpose: 'ISO 6.6.3.2：值参数的实参须为与形参赋值相容的表达式',
    expectedOutput: '11\n',
  },
  {
    name: '6.6 数组可作值参数',
    code: `program test(output);
        type intarray = array[1..3] of integer;
        var a: intarray;
        procedure sum(v: intarray);
        begin writeln(v[1] + v[2] + v[3]); end;
        begin a[1] := 10; a[2] := 20; a[3] := 30; sum(a); end.`,
    purpose: 'ISO 6.6.3.2：值参数的实参表达式类型须与形参赋值相容（结构化类型亦同）',
    expectedOutput: '60\n',
  },
  {
    name: '6.6 记录可作值参数',
    code: `program test(output);
        type point = record x, y: integer end;
        var p: point;
        procedure printpoint(v: point);
        begin writeln(v.x); writeln(v.y); end;
        begin p.x := 10; p.y := 20; printpoint(p); end.`,
    purpose: 'ISO 6.6.3.2：记录类型的值参数按值传递整个结构',
    expectedOutput: '10\n20\n',
  },
  {
    name: '6.6 值参数的类型不得为文件类型',
    code: `program test(output);
        procedure p(x: text);
        begin end;
        begin p(output); end.`,
    purpose: 'ISO 6.6.3.2：形参所拥有的类型必须是允许作为 file-type 分量类型的类型，文件类型不满足',
    expectedError: '',
  },

  // 6.6.3.3 变量参数

  {
    name: '6.6 变量参数的实参必须是 variable-access，常量实参应报错',
    code: `program test(output);
        procedure testvar(var x: integer);
        begin x := 1; end;
        begin testvar(5); end.`,
    purpose: 'ISO 6.6.3.3：变量参数的实参须为 variable-access，常量表达式不是 variable-access',
    expectedError: '',
  },
  {
    name: '6.6 数组元素作变量参数',
    code: `program test(output);
        var arr: array[1..3] of integer;
        procedure setit(var x: integer);
        begin x := 42; end;
        begin arr[2] := 0; setit(arr[2]); writeln(arr[2]); end.`,
    purpose: 'ISO 6.5.1/6.6.3.3：indexed-variable 是 variable-access，可作变量参数并写回原分量',
    expectedOutput: '42\n',
  },
  {
    name: '6.6 记录字段作变量参数',
    code: `program test(output);
        type point = record x, y: integer end;
        var p: point;
        procedure setit(var v: integer);
        begin v := 42; end;
        begin p.x := 0; setit(p.x); writeln(p.x); end.`,
    purpose: 'ISO 6.5.1/6.6.3.3：field-designator 是 variable-access，可作变量参数',
    expectedOutput: '42\n',
  },
  {
    name: '6.6 变量下标访问的数组元素作变量参数',
    code: `program test(output);
        type point = record x, y: integer end;
        var a: array[1..3] of point;
            i: integer;
        procedure setit(var v: integer);
        begin v := 42; end;
        begin i := 2; a[i].x := 0; setit(a[i].x); writeln(a[i].x); end.`,
    purpose: 'ISO 6.6.3.3：实参在被访问时确定所指变量，运行期下标亦成立',
    expectedOutput: '42\n',
  },
  {
    name: '6.6 变体记录的变体字段可作变量参数',
    code: `program test(output);
        type kind = (kinda, kindb);
             rec = record
               pad: integer;
               case k: kind of
                 kinda: (x: integer);
                 kindb: (y: integer);
             end;
        var r: rec;
        procedure setit(var v: integer);
        begin v := 42; end;
        begin r.k := kinda; r.x := 0; setit(r.x); writeln(r.x); end.`,
    purpose: 'ISO 6.6.3.3：仅禁止「变体的 selector 字段」，激活变体的分量字段仍可作变量参数',
    expectedOutput: '42\n',
  },
  {
    name: '6.6 变体的 selector 字段作变量参数应报错',
    code: `program test(output);
        type kind = (kinda, kindb);
             rec = record
               case k: kind of
                 kinda: (x: integer);
                 kindb: (y: integer);
             end;
        var r: rec;
        procedure setkind(var v: kind);
        begin v := kindb; end;
        begin r.k := kinda; setkind(r.k); end.`,
    purpose: 'ISO 6.6.3.3：实参变量不得表示变体部分的 selector 字段',
    expectedError: '',
  },
  {
    name: '6.6 packed 类型的分量作变量参数应报错',
    code: `program test(output);
        var a: packed array[1..3] of char;
        procedure setit(var c: char);
        begin c := 'X'; end;
        begin setit(a[1]); end.`,
    purpose: 'ISO 6.6.3.3：实参变量不得表示 packed 类型变量的分量',
    expectedError: '',
  },
  {
    name: '6.6 变量参数的实参类型须与形参类型相同',
    code: `program test(output);
        type small = 1..10;
        var n: integer;
        procedure setit(var x: small);
        begin x := 5; end;
        begin n := 3; setit(n); end.`,
    purpose: 'ISO 6.6.3.3：实参所拥有的类型须与形参的 type-identifier 所表示的类型相同（integer 与子界非同一类型）',
    expectedError: '',
  },
  {
    name: '6.6 指针解引用作变量参数',
    code: `program test(output);
        type ip = ^integer;
        var p: ip;
        procedure setit(var v: integer);
        begin v := 42; end;
        begin new(p); p^ := 0; setit(p^); writeln(p^); dispose(p); end.`,
    purpose: 'ISO 6.5.1/6.6.3.3：identified-variable 是 variable-access，可作变量参数',
    expectedOutput: '42\n',
  },
  {
    name: '6.6 文件缓冲区变量作变量参数',
    code: `program test(f);
        type r = record x: integer end;
        var f: file of r;
            rec: r;
        procedure setit(var v: r);
        begin v.x := 42; end;
        begin
          rewrite(f);
          rec.x := 0;
          f^ := rec;
          setit(f^);
          put(f);
          reset(f);
          rec := f^;
          writeln(rec.x);
        end.`,
    purpose: 'ISO 6.5.1/6.6.3.3：buffer-variable 是 variable-access，可作变量参数',
    textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
    expectedOutput: '42\n',
  },

  // 6.6.3.4 / 6.6.3.5 / 6.6.3.6 过程参数、函数参数与参数表 congruity

  {
    name: '6.6 过程可作形式参数',
    code: `program test(output);
        procedure apply(procedure p);
        begin p; end;
        procedure hello;
        begin writeln('HELLO'); end;
        begin apply(hello); end.`,
    purpose: 'ISO 6.6.3.4：形参可为过程，实参为有定义点的 procedure-identifier',
    expectedOutput: 'HELLO\n',
  },
  {
    name: '6.6 函数可作形式参数',
    code: `program test(output);
        function apply(function f(x: integer): integer; y: integer): integer;
        begin apply := f(y); end;
        function dbl(x: integer): integer;
        begin dbl := x * 2; end;
        begin writeln(apply(dbl, 21)); end.`,
    purpose: 'ISO 6.6.3.5：形参可为函数，且 result-type 须与实参函数的返回类型表示同一类型',
    expectedOutput: '42\n',
  },
  {
    name: '6.6 过程参数的参数表不 congruity 应报错',
    code: `program test(output);
        procedure apply(procedure p(x: integer));
        begin end;
        procedure noparam;
        begin end;
        begin apply(noparam); end.`,
    purpose: 'ISO 6.6.3.4/6.6.3.6：两个 formal-parameter-list 须 congruous，或都不出现',
    expectedError: '',
  },
  {
    name: '6.6 过程形参可在块内多次调用',
    code: `program test(output);
        var k: integer;
        procedure twice(procedure p);
        begin p; p; end;
        procedure bump;
        begin k := k + 1; end;
        begin k := 0; twice(bump); writeln(k); end.`,
    purpose: 'ISO 6.6.3.4：形参在块的整个激活期标识实参过程，可被多次调用',
    expectedOutput: '2\n',
  },
  {
    name: '6.6 无形参表的函数形参',
    code: `program test(output);
        function apply(function f: integer): integer;
        begin apply := f + f; end;
        function seven: integer;
        begin seven := 7; end;
        begin writeln(apply(seven)); end.`,
    purpose: 'ISO 6.6.3.5：functional-parameter-section 可无形参表，结果类型须表示同一类型',
    expectedOutput: '14\n',
  },
  {
    name: '6.6 过程形参可转发给下一层形参',
    code: `program test(output);
        procedure outer(procedure p);
          procedure inner(procedure q);
          begin q; end;
        begin inner(p); end;
        procedure hello;
        begin writeln('HI'); end;
        begin outer(hello); end.`,
    purpose: 'ISO 6.6.3.4：形参本身亦可作另一过程形参的实参（链式传递）',
    expectedOutput: 'HI\n',
  },
  {
    name: '6.6 实参过程访问其外层过程的变量',
    code: `program test(output);
        procedure home;
          var k: integer;
          procedure bump;
          begin k := k + 1; end;
          procedure call(procedure p);
          begin k := 7; p; writeln(k); end;
        begin call(bump); end;
        begin home; end.`,
    purpose: 'ISO 6.6.3.4 / 6.2.2.5：形参标识实参过程，而实参过程访问其自身外层过程的变量',
    expectedOutput: '8\n',
  },
  {
    name: '6.6 过程形参带变量参数段',
    code: `program test(output);
        var a: integer;
        procedure apply(procedure p(var x: integer); var y: integer);
        begin p(y); end;
        procedure bump(var v: integer);
        begin v := v + 1; end;
        begin a := 3; apply(bump, a); writeln(a); end.`,
    purpose: 'ISO 6.6.3.4 / 6.6.3.6 b：变量参数段须与实参过程的形参表 congruous',
    expectedOutput: '4\n',
  },
  {
    name: '6.6 过程形参带值参数段',
    code: `program test(output);
        procedure apply(procedure p(x: integer); n: integer);
        begin p(n); end;
        procedure show(x: integer);
        begin writeln(x); end;
        begin apply(show, 9); end.`,
    purpose: 'ISO 6.6.3.4 / 6.6.3.6 a：值参数段须与实参过程的形参表 congruous',
    expectedOutput: '9\n',
  },
  {
    name: '6.6 多个形参的过程各对应一个实参',
    code: `program test(output);
        procedure two(procedure p; procedure q);
        begin p; q; end;
        procedure a;
        begin writeln('A'); end;
        procedure b;
        begin writeln('B'); end;
        begin two(a, b); end.`,
    purpose: 'ISO 6.7.3：多个形参与多个实参一一对应',
    expectedOutput: 'A\nB\n',
  },
  {
    name: '6.6 过程形参的实参须为过程标识符',
    code: `program test(output);
        var v: integer;
        procedure apply(procedure p);
        begin p; end;
        begin v := 1; apply(v); end.`,
    purpose: 'ISO 6.6.3.4：实参须是有定义点的 procedure-identifier，变量不满足',
    expectedError: '',
  },
  {
    name: '6.6 内置过程不可作过程形参的实参',
    code: `program test(output);
        procedure apply(procedure p);
        begin p; end;
        begin apply(write); end.`,
    purpose: 'ISO 6.6.3.4：实参须有被 program-block 包含的定义点，内置过程没有定义点',
    expectedError: '',
  },
  {
    name: '6.6 函数形参的 result-type 须与实参函数相同',
    code: `program test(output);
        function apply(function f: real): real;
        begin apply := f; end;
        function n: integer;
        begin n := 1; end;
        begin writeln(apply(n)); end.`,
    purpose: 'ISO 6.6.3.5：形参段的结果类型须与实参函数的结果类型表示同一类型',
    expectedError: '',
  },
  {
    name: '6.6 函数标识符不可作过程形参的实参',
    code: `program test(output);
        procedure apply(procedure p);
        begin p; end;
        function f: integer;
        begin f := 1; end;
        begin apply(f); end.`,
    purpose: 'ISO 6.6.3.4：实参须为 procedure-identifier，函数标识符不满足',
    expectedError: '',
  },
  {
    name: '6.6 形参表对应位置类型不同应报错',
    code: `program test(output);
        procedure apply(procedure p(x: integer));
        begin end;
        procedure q(x: real);
        begin end;
        begin apply(q); end.`,
    purpose: 'ISO 6.6.3.6 a：对应位置的值参数段的类型标识符须 denote 同一类型',
    expectedError: '',
  },
  {
    name: '6.6 值参数段与变量参数段不匹配应报错',
    code: `program test(output);
        procedure apply(procedure p(x: integer));
        begin end;
        procedure q(var x: integer);
        begin end;
        begin apply(q); end.`,
    purpose: 'ISO 6.6.3.6 a/b：对应位置须同为值参数段或同为变量参数段',
    expectedError: '',
  },
  {
    name: '6.6 实参可为 forward 声明的过程',
    code: `program test(output);
        procedure apply(procedure p);
        begin p; end;
        procedure hello; forward;
        procedure hello;
        begin writeln('F'); end;
        begin apply(hello); end.`,
    purpose: 'ISO 6.6.3.4 / 6.6.1：forward 与其后续定义构成同一定义点，可作实参',
    expectedOutput: 'F\n',
  },
  {
    name: '6.6 形参过程可在循环内被反复调用',
    code: `program test(output);
        var k: integer;
        procedure apply(procedure p; n: integer);
        var j: integer;
        begin for j := 1 to n do p; end;
        procedure bump;
        begin k := k + 1; end;
        begin k := 0; apply(bump, 3); writeln(k); end.`,
    purpose: 'ISO 6.6.3.4：形参在块的整个激活期内均可调用',
    expectedOutput: '3\n',
  },
  {
    name: '6.6 函数形参可在表达式内多次使用',
    code: `program test(output);
        function apply(function f: integer): integer;
        begin apply := f * f; end;
        function three: integer;
        begin three := 3; end;
        begin writeln(apply(three) + apply(three)); end.`,
    purpose: 'ISO 6.6.3.5：形参函数可作 factor 出现在表达式中',
    expectedOutput: '18\n',
  },
  {
    name: '6.6 形参标识符遮蔽同名的外层过程',
    code: `program test(output);
        procedure p;
        begin writeln('GLOBAL'); end;
        procedure apply(procedure p);
        begin p; end;
        begin apply(p); end.`,
    purpose: 'ISO 6.6.3.4 / 6.2.2.5：形参在其块内标识实参过程，实参可为同名外层过程',
    expectedOutput: 'GLOBAL\n',
  },
  {
    name: '6.6 形参标识符与同 region 的过程名重复应报错',
    code: `program test(output);
        procedure apply(procedure p);
          procedure p;
          begin end;
        begin end;
        begin end.`,
    purpose: 'ISO 6.2.2.7：形参标识符与同一 region 内的过程标识符不得各有定义点',
    expectedError: '',
  },
  {
    name: '6.6 rewrite(f) 后 f.M 为 Generation，可顺序写入',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN REWRITE(F);WRITELN(F,'HELLO');END.`,
    purpose: 'ISO 6.6.5.2：rewrite(f) 的后置断言为 f.L=f.R=S()、f.M=Generation、f^ 完全未定义',
    textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
    expectedFileContains: [{ url: 'F', contains: 'HELLO' }],
  },
  {
    name: '6.6 put(f) 将缓冲区内容附加到文件',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;V:CHAR;BEGIN REWRITE(F);V:='A';F^:=V;PUT(F);END.`,
    purpose: 'ISO 6.6.5.2：put(f) 的后置断言为 f.L=f0.L~S(f0^)、f.M=Generation、f^ 完全未定义',
    textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
    expectedFileContains: [{ url: 'F', contains: 'A' }],
  },
  {
    name: '6.6 未 rewrite 的 put 违反前断言应报错',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN F^:='A';PUT(F);END.`,
    purpose: 'ISO 6.6.5.2：put(f) 的前断言要求 f0.M=Generation，否则为 error',
    textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
    expectedError: '',
    maxSteps: 1000,
  },
  {
    name: '6.6 reset(f) 后 f^ 指向首个组件',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;CH:CHAR;BEGIN RESET(F);CH:=F^;WRITE(CH);END.`,
    purpose: 'ISO 6.6.5.2：reset(f) 的后置断言为 f.M=Inspection 且 f^=f.R.first（f.R 非空时）',
    textFiles: new Map<string, Uint8Array>([['F', text('AB')]]),
    expectedOutput: 'A',
  },
  {
    name: '6.6 reset 空文件后 eof 为真',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);IF EOF(F)THEN WRITE('EMPTY')ELSE WRITE('FULL');END.`,
    purpose: 'ISO 6.6.5.2/6.6.6.5：reset(f) 后 f.R=S()，故 eof(f) 为真',
    textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
    expectedOutput: 'EMPTY',
  },
  {
    name: '6.6 get(f) 将 f^ 前进到下一个组件',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;CH:CHAR;BEGIN RESET(F);GET(F);CH:=F^;WRITE(CH);END.`,
    purpose: 'ISO 6.6.5.2：get(f) 的后置断言为 f.R=f0.R.rest 且 f^=f.R.first',
    textFiles: new Map<string, Uint8Array>([['F', text('AB')]]),
    expectedOutput: 'B',
  },
  {
    name: '6.6 在 f.R 为空时 get 违反前断言应报错',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);GET(F);GET(F);GET(F);END.`,
    purpose: 'ISO 6.6.5.2：get(f) 的前断言要求 f0.R<>S()，读到文件尾后再 get 为 error',
    textFiles: new Map<string, Uint8Array>([['F', text('AB')]]),
    expectedError: '',
    maxSteps: 1000,
  },
  {
    name: '6.6 非文本文件的 write/read 等价于 f^ 赋值与 get',
    code: `program test(output);
        var f: file of integer;
            v: integer;
        begin
          rewrite(f);
          write(f, 42);
          reset(f);
          read(f, v);
          writeln(v);
        end.`,
    purpose: 'ISO 6.6.5.2：非 text 文件的 read(f,v) 等价于 v:=f^; get(f)，write(f,e) 等价于 f^:=e; put(f)',
    expectedOutput: '42\n',
  },

  // 6.6.5.3 Dynamic allocation procedures

  {
    name: '6.6 new 创建的新变量可读写',
    code: `PROGRAM TEST(OUTPUT);TYPE IPTR=^INTEGER;VAR P:IPTR;BEGIN NEW(P);P^:=42;WRITE(P^);DISPOSE(P);END.`,
    purpose: 'ISO 6.6.5.3：new(p) 创建新变量与该指针类型的新 identifying-value 并赋予 p',
    expectedOutput: '42',
  },
  {
    name: '6.6 new 后指针不再是 nil',
    code:
      `PROGRAM TEST(OUTPUT);TYPE IPTR=^INTEGER;VAR P:IPTR;BEGIN NEW(P);IF P<>NIL THEN WRITE('NOTNIL')ELSE WRITE('NIL');DISPOSE(P);END.`,
    purpose: 'ISO 6.6.5.3/6.4.4：new 创建的 identifying-value 不同于 nil-value',
    expectedOutput: 'NOTNIL',
  },
  {
    name: '6.6 new 可用于记录类型',
    code:
      `PROGRAM TEST(OUTPUT);TYPE RPTR=^REC;REC=RECORD X:INTEGER;Y:INTEGER END;VAR P:RPTR;BEGIN NEW(P);P^.X:=10;P^.Y:=20;WRITE(P^.X+P^.Y);DISPOSE(P);END.`,
    purpose: 'ISO 6.6.5.3：新变量拥有指针类型 domain-type 的类型',
    expectedOutput: '30',
  },
  {
    name: '6.6 nil 指针（或未定义指针）解引用应报错',
    code: `PROGRAM TEST(OUTPUT);TYPE IPTR=^INTEGER;VAR P:IPTR;BEGIN P^:=42;END.`,
    purpose: 'ISO 6.5.4：identified-variable 的 pointer-variable 为 nil 或未定义时为 error',
    expectedError: '',
    maxSteps: 1000,
  },
  {
    name: '6.6 dispose 未初始化（nil）指针应报错',
    code: `PROGRAM TEST(OUTPUT);TYPE IPTR=^INTEGER;VAR P:IPTR;BEGIN DISPOSE(P);END.`,
    purpose: 'ISO 6.6.5.3：若 q 具有 nil-value 或未定义，则 dispose(q) 为 error',
    expectedError: '',
    maxSteps: 1000,
  },
  {
    name: '6.6 dispose 后访问所指变量应报错',
    code: `PROGRAM TEST(OUTPUT);TYPE IPTR=^INTEGER;VAR P:IPTR;BEGIN NEW(P);DISPOSE(P);P^:=42;END.`,
    purpose: 'ISO 6.6.5.3/6.5.4：identifying-value 被移除后，该指针变量所指变量不可访问',
    expectedError: '',
    maxSteps: 1000,
  },

  // 6.6.5.4 Transfer procedures (pack / unpack)

  {
    name: '6.6 pack 将非紧缩数组的连续分量移入紧缩数组',
    code: `program test(output);
        var a: array[1..5] of integer;
            z: packed array[1..3] of integer;
        begin
          a[1] := 10; a[2] := 20; a[3] := 30; a[4] := 40; a[5] := 50;
          pack(a, 2, z);
          writeln(z[1]); writeln(z[2]); writeln(z[3]);
        end.`,
    purpose: 'ISO 6.6.5.4：pack(a,i,z) 等价于令 z[j]:=a[k]，k 从 i 起随 j 递增',
    expectedOutput: '20\n30\n40\n',
  },
  {
    name: '6.6 unpack 将紧缩数组的分量移回非紧缩数组',
    code: `program test(output);
        var a: array[1..5] of integer;
            z: packed array[1..3] of integer;
        begin
          z[1] := 1; z[2] := 2; z[3] := 3;
          unpack(z, a, 2);
          writeln(a[2]); writeln(a[3]); writeln(a[4]);
        end.`,
    purpose: 'ISO 6.6.5.4：unpack(z,a,i) 等价于令 a[k]:=z[j]，k 从 i 起随 j 递增',
    expectedOutput: '1\n2\n3\n',
  },

  // 6.6.6.2 Arithmetic functions

  {
    name: '6.6 abs 对整数参数返回同类型绝对值',
    code: `PROGRAM TEST(OUTPUT);VAR X:INTEGER;BEGIN X:=-5;WRITE(ABS(X));END.`,
    purpose: 'ISO 6.6.6.2：abs(x) 结果类型与参数相同，值为绝对值',
    expectedOutput: '5',
  },
  {
    name: '6.6 abs 对实数参数返回绝对值',
    code: `PROGRAM TEST(OUTPUT);VAR X:REAL;BEGIN X:=-3.5;WRITE(TRUNC(ABS(X)*10));END.`,
    purpose: 'ISO 6.6.6.2：abs 对实参返回实数；用 trunc 转为 integer 避免依赖实数输出格式',
    expectedOutput: '35',
  },
  {
    name: '6.6 sqr 对整数参数返回平方',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(SQR(7));END.`,
    purpose: 'ISO 6.6.6.2：sqr(7)=49，结果类型与参数相同（integer）',
    expectedOutput: '49',
  },
  {
    name: '6.6 sqr 对实数参数返回平方',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(TRUNC(SQR(1.5)*100));END.`,
    purpose: 'ISO 6.6.6.2：sqr(1.5)=2.25，用 trunc 转为 integer 比较',
    expectedOutput: '225',
  },
  {
    name: '6.6 sqrt 返回非负平方根',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(SQRT(4.0)));END.`,
    purpose: 'ISO 6.6.6.2：sqrt(x) 为 x 的非负平方根，结果恒为 real-type',
    expectedOutput: '2',
  },
  {
    name: '6.6 sqrt 对负数参数应报错',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(SQRT(-1.0));END.`,
    purpose: 'ISO 6.6.6.2：x 为负数时不存在非负平方根，为 error',
    expectedError: '',
    maxSteps: 1000,
  },
  {
    name: '6.6 ln 返回自然对数',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(LN(1.0)));END.`,
    purpose: 'ISO 6.6.6.2：ln(x) 为 x 的自然对数（x>0）；ln(1)=0',
    expectedOutput: '0',
  },
  {
    name: '6.6 ln 对非正参数应报错',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(LN(0.0));END.`,
    purpose: 'ISO 6.6.6.2：x 不大于零时 ln(x) 为 error',
    expectedError: '',
    maxSteps: 1000,
  },
  {
    name: '6.6 exp 返回自然对数底的幂',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(EXP(0.0)));END.`,
    purpose: 'ISO 6.6.6.2：exp(x) 为自然对数底 e 的 x 次幂；exp(0)=1',
    expectedOutput: '1',
  },
  {
    name: '6.6 sin 返回正弦值',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(SIN(0.0)));END.`,
    purpose: 'ISO 6.6.6.2：sin(x) 为弧度 x 的正弦；sin(0)=0',
    expectedOutput: '0',
  },
  {
    name: '6.6 cos 返回余弦值',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(COS(0.0)));END.`,
    purpose: 'ISO 6.6.6.2：cos(x) 为弧度 x 的余弦；cos(0)=1',
    expectedOutput: '1',
  },
  {
    name: '6.6 arctan 返回反正切主值',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(ARCTAN(0.0)));END.`,
    purpose: 'ISO 6.6.6.2：arctan(x) 为 x 的反正切主值（弧度）；arctan(0)=0',
    expectedOutput: '0',
  },

  // 6.6.6.3 Transfer functions

  {
    name: '6.6 trunc 截断正实数',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(TRUNC(3.7));END.`,
    purpose: 'ISO 6.6.6.3：x>=0 时 0<=x-trunc(x)<1',
    expectedOutput: '3',
  },
  {
    name: '6.6 trunc 截断负实数',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(TRUNC(-3.7));END.`,
    purpose: 'ISO 6.6.6.3：x<0 时 -1<x-trunc(x)<=0',
    expectedOutput: '-3',
  },
  {
    name: '6.6 round 对正数按 trunc(x+0.5) 取整',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(3.5));END.`,
    purpose: 'ISO 6.6.6.3：x>=0 时 round(x) 等价于 trunc(x+0.5)，round(3.5)=4',
    expectedOutput: '4',
  },
  {
    name: '6.6 round 对负数按 trunc(x-0.5) 取整',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ROUND(-3.5));END.`,
    purpose: 'ISO 6.6.6.3：x<0 时 round(x) 等价于 trunc(x-0.5)，round(-3.5)=-4',
    expectedOutput: '-4',
  },

  // 6.6.6.4 Ordinal functions

  {
    name: '6.6 ord 对布尔值返回 0 与 1',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ORD(FALSE));WRITE(ORD(TRUE));END.`,
    purpose: 'ISO 6.4.2.2：false 与 true 的序数分别为 0 和 1',
    expectedOutput: '01',
  },
  {
    name: '6.6 ord 对整数返回其自身',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(ORD(42));END.`,
    purpose: 'ISO 6.4.2.2：integer-type 值的序数即其值本身',
    expectedOutput: '42',
  },
  {
    name: '6.6 chr 与 ord 互为逆运算',
    code: `PROGRAM TEST(OUTPUT);VAR C:CHAR;BEGIN C:='A';IF CHR(ORD(C))=C THEN WRITE('OK')ELSE WRITE('BAD');END.`,
    purpose: 'ISO 6.6.6.4：对任意 char 值 ch 有 chr(ord(ch))=ch（char 字符集为 implementation-defined，故用往返）',
    expectedOutput: 'OK',
  },
  {
    name: '6.6 succ 返回后继序数值（integer）',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(SUCC(5));END.`,
    purpose: 'ISO 6.6.6.4：succ(x) 结果的序数比 x 大 1，结果类型与 x 相同',
    expectedOutput: '6',
  },
  {
    name: '6.6 pred 返回前驱序数值（integer）',
    code: `PROGRAM TEST(OUTPUT);BEGIN WRITE(PRED(5));END.`,
    purpose: 'ISO 6.6.6.4：pred(x) 结果的序数比 x 小 1，结果类型与 x 相同',
    expectedOutput: '4',
  },
  {
    name: '6.6 succ 对数字字符成立（数字字符连续有序）',
    code: `PROGRAM TEST(OUTPUT);VAR C:CHAR;BEGIN C:='0';IF SUCC(C)='1' THEN WRITE('OK')ELSE WRITE('BAD');END.`,
    purpose: 'ISO 6.4.2.2：表示数字 0..9 的字符子集数值上有序且连续，故 succ(0 号数字字符) 为 1 号数字字符',
    expectedOutput: 'OK',
  },
  {
    name: '6.6 succ 对枚举类型末值应报错',
    code: `PROGRAM TEST(OUTPUT);TYPE COLOR=(RED,GREEN,BLUE);VAR C:COLOR;BEGIN C:=BLUE;C:=SUCC(C);END.`,
    purpose: 'ISO 6.6.6.4：不存在序数更大一的值时为 error',
    expectedError: '',
    maxSteps: 1000,
  },
  {
    name: '6.6 pred 对枚举类型首值应报错',
    code: `PROGRAM TEST(OUTPUT);TYPE COLOR=(RED,GREEN,BLUE);VAR C:COLOR;BEGIN C:=RED;C:=PRED(C);END.`,
    purpose: 'ISO 6.6.6.4：不存在序数更小一的值时为 error',
    expectedError: '',
    maxSteps: 1000,
  },

  // 6.6.6.5 Boolean functions

  {
    name: '6.6 odd 对奇数返回真',
    code: `PROGRAM TEST(OUTPUT);BEGIN IF ODD(7)THEN WRITE('ODD')ELSE WRITE('EVEN');END.`,
    purpose: 'ISO 6.6.6.5：odd(x) 等价于 abs(x) mod 2 = 1',
    expectedOutput: 'ODD',
  },
  {
    name: '6.6 odd 对偶数返回假',
    code: `PROGRAM TEST(OUTPUT);BEGIN IF ODD(8)THEN WRITE('ODD')ELSE WRITE('EVEN');END.`,
    purpose: 'ISO 6.6.6.5：odd(x) 等价于 abs(x) mod 2 = 1',
    expectedOutput: 'EVEN',
  },
  {
    name: '6.6 odd 使用参数的绝对值（负奇数仍为真）',
    code: `PROGRAM TEST(OUTPUT);BEGIN IF ODD(-7)THEN WRITE('ODD')ELSE WRITE('EVEN');END.`,
    purpose: 'ISO 6.6.6.5：odd(x) 等价于 abs(x) mod 2 = 1，故参数符号不影响结果',
    expectedOutput: 'ODD',
  },
  {
    name: '6.6 eof(f) 在 f.R 为空序列时返回真',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);IF EOF(F)THEN WRITE('EOF');END.`,
    purpose: 'ISO 6.6.6.5：eof(f) 在 f.R 为空序列时为 true',
    textFiles: new Map<string, Uint8Array>([['F', new Uint8Array(0)]]),
    expectedOutput: 'EOF',
  },
  {
    name: '6.6 eof(f) 在 f.R 非空时返回假',
    code: `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);IF EOF(F)THEN WRITE('EOF')ELSE WRITE('MORE');END.`,
    purpose: 'ISO 6.6.6.5：eof(f) 仅在 f.R 为空序列时为 true',
    textFiles: new Map<string, Uint8Array>([['F', text('AB')]]),
    expectedOutput: 'MORE',
  },
  {
    name: '6.6 eoln(f) 在行结束符处返回真',
    code:
      `PROGRAM TEST(OUTPUT,F);VAR F:TEXT;BEGIN RESET(F);WHILE NOT EOLN(F)DO GET(F);IF EOLN(F)THEN WRITE('EOLN');END.`,
    purpose: 'ISO 6.6.6.5：eoln(f) 在 f.R.first 为 end-of-line 组件时为 true',
    textFiles: new Map<string, Uint8Array>([['F', text('AB\n')]]),
    expectedOutput: 'EOLN',
  },
  {
    name: '6.6 省略参数的 eof 应用于 input',
    code: `PROGRAM TEST(INPUT,OUTPUT);BEGIN IF EOF THEN WRITE('IN_EOF');END.`,
    purpose: 'ISO 6.6.6.5：eof 省略实参时应用于 input，且程序参数表须含 input',
    expectedOutput: 'IN_EOF',
  },
  {
    name: '6.6 省略参数的 eoln 应用于 input',
    code: `PROGRAM TEST(INPUT,OUTPUT);BEGIN IF EOLN THEN WRITE('IN_EOLN');END.`,
    purpose: 'ISO 6.6.6.5：eoln 省略实参时应用于 input，此时 eof(input) 须为假',
    input: '\n',
    expectedOutput: 'IN_EOLN',
  },
]

runPascalTests('ISO 7185 6.6 - Procedure and function declarations', tests)
