// ISO/IEC 7185:1990 - 6.4 Type-definitions
//
// 章节概括：
//   type-definition 引入标识符表示一个类型，语法为 type-definition = identifier '=' type-denoter，
//   type-denoter 为 type-identifier 或 new-type（new-ordinal-type / new-structured-type / new-pointer-type）；
//   每个 new-type 的出现都表示一个与其他任何 new-type 都不同的类型。标识符在块的 type-definition-part
//   中的出现构成定义点（region 为块）；除 new-pointer-type 的 domain-type 中的应用出现外，
//   type-denoter 不得含该标识符的应用出现。子条款进一步规定：simple-types（required simple-types
//   integer/real/Boolean/char 的语义，以及 enumerated-types、subrange-types）；structured-types 的通用规则
//   （packed 表示及 array/record/set/file 四类，其中 file-types 含 textfile）；pointer-types
//   （单个 nil 值与一集 identifying-value，仅由 new 创建）；compatible types 的四条情形；
//   assignment-compatibility 的五条情形及 integer 到 real 的隐式转换。
//
// 子章节：
//   6.4.1 General
//   6.4.2 Simple-types
//     6.4.2.1 General
//     6.4.2.2 Required simple-types
//     6.4.2.3 Enumerated-types
//     6.4.2.4 Subrange-types
//   6.4.3 Structured-types
//     6.4.3.1 General
//     6.4.3.2 Array-types
//     6.4.3.3 Record-types
//     6.4.3.4 Set-types
//     6.4.3.5 File-types
//   6.4.4 Pointer-types
//   6.4.5 Compatible types
//   6.4.6 Assignment-compatibility
//   6.4.7 Example of a type-definition-part

import { type PascalTest, runPascalTests } from './harness.ts'

const tests: PascalTest[] = [
  // 6.4.1 General — type-definition 与 new-type 的相互区别

  {
    name: '6.4.1 type-definition 引入类型标识符（integer 的别名）',
    code: 'program test(output); type T = integer; var a: T; begin a := 5; writeln(a); end.',
    purpose: '6.4.1：type-definition 用标识符 T 表示 integer，a 具有该类型',
    expectedOutput: '5\n',
  },
  {
    name: '6.4.1 type-denoter 可以是已定义的类型标识符',
    code: 'program test(output); type A = 1..5; B = A; var v: B; begin v := 3; writeln(v); end.',
    purpose: '6.4.1：type-denoter = type-identifier，B 与 A 表示同一个类型',
    expectedOutput: '3\n',
  },
  {
    name: '6.4.1 两次出现同一 new-type 表示不同类型，但同源子界彼此兼容',
    code: 'program test(output); type T1 = 1..10; T2 = 1..10; var a: T1; b: T2; begin a := 4; b := a; writeln(b); end.',
    purpose: '6.4.1 每个 new-type 出现表示不同类型；6.4.5 b 二者都是 integer 的子界故兼容，赋值合法',
    expectedOutput: '4\n',
  },
  {
    name: '6.4.1 两个不同的 record new-type 之间不可赋值',
    code:
      'program test; type A = record x: integer end; B = record x: integer end; var a: A; b: B; begin a.x := 1; b := a; end.',
    purpose: '6.4.1 + 6.4.6 a：A、B 是互不相同的 new-type，既非同一类型也不兼容，赋值是错误',
    expectedError: '',
  },
  {
    name: '6.4.1 type-denoter 不得自引用（array 组件为自身）',
    code: 'program test; type T = array[1..2] of T; var a: T; begin a[1] := 1; end.',
    purpose: '6.4.1：除 new-pointer-type 的 domain-type 外，type-denoter 不得含自身标识符的应用出现',
    expectedError: '',
  },
  {
    name: '6.4.1 new-pointer-type 的 domain-type 可前向引用（递归记录）',
    code: `program test(output);
type
  P = ^Node;
  Node = record value: integer; next: P end;
var
  q: P;
begin
  new(q);
  q^.value := 7;
  writeln(q^.value);
end.`,
    purpose: '6.4.1/6.2.2.9：pointer-type 的 domain-type 允许引用尚未定义的类型，从而表达递归类型',
    expectedOutput: '7\n',
  },
  {
    name: '6.4.1 非指针类型不得前向引用',
    code: 'program test; type A = array[1..2] of B; B = integer; var a: A; begin a[1] := 1; end.',
    purpose: '6.2.2.9（与 6.4.1 的指针例外相对）：A 的定义中引用尚未定义的类型 B，是错误',
    expectedError: '',
  },

  // 6.4.2.2 Required simple-types

  {
    name: '6.4.2.2 四个 required simple-types 可作 type-denoter',
    code: `program test(output);
type
  I = integer; R = real; Bt = Boolean; C = char;
var
  iv: I; rv: R; bv: Bt; cv: C;
begin
  iv := 3;
  rv := iv;
  bv := true;
  cv := 'x';
  writeln(iv);
  writeln(trunc(rv));
  if bv then writeln('b-ok');
  writeln(cv);
end.`,
    purpose: '6.4.2.2：integer/real/Boolean/char 均存在且可作类型标识符使用',
    expectedOutput: '3\n3\nb-ok\nx\n',
  },
  {
    name: '6.4.2.2 real 不是 ordinal-type，不能作 subrange 边界',
    code: 'program test; type T = 1.0..2.0; var a: T; begin a := 1.5; end.',
    purpose: '6.4.2.4：subrange 的两个常量须同属一个 ordinal-type，而 real 不是 ordinal-type',
    expectedError: '',
  },
  {
    name: '6.4.2.2 real 不能作数组的 index-type',
    code: 'program test; var a: array[real] of integer; r: real; begin r := 1.0; a[r] := 1; end.',
    purpose: '6.4.3.2：index-type 必须是 ordinal-type，real 不满足',
    expectedError: '',
  },
  {
    name: '6.4.2.2 Boolean 中 false 是 true 的前驱',
    code: "program test(output); begin if false < true then writeln('ok'); end.",
    purpose: '6.4.2.2 c：false 是 true 的前驱，二者序数为 0 与 1',
    expectedOutput: 'ok\n',
  },
  {
    name: '6.4.2.2 char 的数字与大小写字母各自有序',
    code: "program test(output); begin if ('0' < '9') and ('A' < 'Z') and ('a' < 'z') then writeln('ok'); end.",
    purpose: '6.4.2.2 d：数字 0..9 数值有序、A..Z 与 a..z 字典有序',
    expectedOutput: 'ok\n',
  },

  // 6.4.2.3 Enumerated-types

  {
    name: '6.4.2.3 枚举常量的序数从 0 起连续',
    code: 'program test(output); type Color = (red, green, blue); begin writeln(ord(red), ord(green), ord(blue)); end.',
    purpose: '6.4.2.3 NOTE：枚举常量按定义顺序获得从 0 开始的连续序数',
    expectedOutput: '012\n',
  },
  {
    name: '6.4.2.3 枚举常量按定义顺序排序',
    code:
      "program test(output); type Color = (red, green, blue); begin if (red < green) and (green < blue) then writeln('ok'); end.",
    purpose: '6.4.2.1：ordinal-type 的序关系与其序数一致（6.4.2.3 依次递增）',
    expectedOutput: 'ok\n',
  },
  {
    name: '6.4.2.3 succ/pred 作用于枚举值',
    code:
      'program test(output); type Color = (red, green, blue); begin writeln(ord(succ(red))); writeln(ord(pred(blue))); end.',
    purpose: '6.4.2.3+6.7.2.2：枚举类型的后继与前驱沿序数递增/递减',
    expectedOutput: '1\n1\n',
  },
  {
    name: '6.4.2.3 枚举类型可作数组 index-type',
    code:
      'program test(output); type Color = (red, green, blue); var a: array[Color] of integer; begin a[red] := 1; a[blue] := 3; writeln(a[red], a[blue]); end.',
    purpose: '6.4.3.2：index-type 为 ordinal-type，枚举类型满足',
    expectedOutput: '13\n',
  },
  {
    name: '6.4.2.3 枚举常量可作 case-constant',
    code: `program test(output);
type Color = (red, green, blue);
var c: Color; n: integer;
begin
  c := green;
  case c of
    red: n := 1;
    green: n := 2;
    blue: n := 3
  end;
  writeln(n);
end.`,
    purpose: '6.4.2.3：枚举常量是 constant-identifier，可作 case-constant 且类型兼容 tag 表达式',
    expectedOutput: '2\n',
  },
  {
    name: '6.4.2.3 枚举类型变量的赋值与比较',
    code: `program test(output);
type Color = (red, green, blue);
var a, b: Color;
begin
  a := red;
  b := blue;
  if a <> b then writeln('different');
  if a = red then writeln('red');
end.`,
    purpose: '6.4.2.3：枚举常量可赋给同类型变量，同类型值可比较',
    expectedOutput: 'different\nred\n',
  },
  {
    name: '6.4.2.3 整数字面量不可赋给枚举类型变量',
    code: `program test;
type Color = (red, green, blue);
var c: Color;
begin
  c := 5;
end.`,
    purpose: '6.4.2.3 + 6.4.6：枚举类型只能取该枚举类型的值，integer 与其不满足赋值兼容',
    expectedError: '',
  },
  {
    name: '6.4.2.3 不同枚举类型之间不可赋值',
    code: `program test;
type Color = (red, green, blue);
     Light = (on, off);
var c: Color;
    l: Light;
begin
  c := l;
end.`,
    purpose: '6.4.1 + 6.4.6：两个枚举类型互不相同，彼此不赋值兼容',
    expectedError: '',
  },

  // 6.4.2.4 Subrange-types

  {
    name: '6.4.2.4 整数子界类型的赋值',
    code: 'program test(output); type T = 1..10; var a: T; begin a := 5; writeln(a); end.',
    purpose: '6.4.2.4：子界 1..10 的 host-type 为 integer，可赋值范围内值',
    expectedOutput: '5\n',
  },
  {
    name: '6.4.2.4 负边界的子界',
    code: 'program test(output); type T = -10..10; var a: T; begin a := -10; writeln(a); a := 10; writeln(a); end.',
    purpose: '6.4.2.4：subrange 边界常量可带符号（-10..10）',
    expectedOutput: '-10\n10\n',
  },
  {
    name: '6.4.2.4 字符子界',
    code: "program test(output); type T = 'A'..'Z'; var c: T; begin c := 'M'; writeln(c); end.",
    purpose: '6.4.2.4：char 是 ordinal-type，字符子界以字符常量为边界',
    expectedOutput: 'M\n',
  },
  {
    name: '6.4.2.4 枚举子界（host-type 为枚举类型）',
    code: `program test(output);
type Color = (red, green, blue); Sunny = red..blue;
var c: Sunny;
begin
  c := blue;
  writeln(ord(c));
end.`,
    purpose: '6.4.2.4：subrange 的 host-type 可为枚举类型，取值限于边界之间',
    expectedOutput: '2\n',
  },
  {
    name: '6.4.2.4 单值子界',
    code: 'program test(output); type T = 5..5; var a: T; begin a := 5; writeln(a); end.',
    purpose: '6.4.2.4：第一个常量须小于或等于第二个，5..5 合法',
    expectedOutput: '5\n',
  },
  {
    name: '6.4.2.4 下界大于上界的子界是错误',
    code: 'program test; type T = 10..1; var a: T; begin a := 1; end.',
    purpose: '6.4.2.4：第一个常量（最小値）须小于或等于第二个常量',
    expectedError: '',
  },
  {
    name: '6.4.2.4 子界两个边界常量必须同属一个 ordinal-type',
    code: "program test; type T = 'a'..5; var a: T; begin a := 'a'; end.",
    purpose: '6.4.2.4：两个常量须为同一 ordinal-type，char 与 integer 混用是错误',
    expectedError: '',
  },

  // 6.4.3.1 General — packed

  {
    name: '6.4.3.1 packed array 的取值与访问不受 packed 影响',
    code: 'program test(output); var a: packed array[1..3] of integer; begin a[1] := 5; writeln(a[1]); end.',
    purpose: '6.4.3.1：packed 只影响 data-storage 表示，不改变类型的值与分量对应关系',
    expectedOutput: '5\n',
  },

  // 6.4.3.2 Array-types

  {
    name: '6.4.3.2 Boolean 作为 index-type',
    code:
      'program test(output); var a: array[boolean] of integer; begin a[false] := 0; a[true] := 1; writeln(a[false], a[true]); end.',
    purpose: '6.4.3.2：index-type 为 ordinal-type，Boolean 的两个值各对应一个分量',
    expectedOutput: '01\n',
  },
  {
    name: '6.4.3.2 char 作为 index-type（按具体字符索引，不假设字符集范围）',
    code:
      "program test(output); var a: array[char] of integer; begin a['A'] := 1; a['B'] := 2; writeln(a['A'], a['B']); end.",
    purpose: '6.4.3.2：index-type 为 char，各分量由 index-type 的取值逐一映射',
    expectedOutput: '12\n',
  },
  {
    name: '6.4.3.2 多维 index-type 的缩写形式',
    code:
      'program test(output); var a: array[1..2, 1..2] of integer; begin a[1,1] := 1; a[1,2] := 2; a[2,1] := 3; a[2,2] := 4; writeln(a[1,1], a[1,2]); writeln(a[2,1], a[2,2]); end.',
    purpose: '6.4.3.2：array[1..2, 1..2] 是 array[1..2] of array[1..2] 的缩写，全形式与缩写形式等价',
    expectedOutput: '12\n34\n',
  },
  {
    name: '6.4.3.2 缩写形式 a[i,j] 与全形式 a[i][j] 指同一分量',
    code: `program test(output);
var a: array[1..2, 1..2] of integer;
begin
  a[1][2] := 7;
  writeln(a[1,2] + a[1][2]);
end.`,
    purpose: '6.4.3.2：两种写法表示同一分量，相加应为 7+7',
    expectedOutput: '14\n',
  },
  {
    name: '6.4.3.2 component-type 可为 record',
    code: `program test(output);
type Point = record x, y: integer end;
var a: array[1..2] of Point;
begin
  a[1].x := 1;
  a[2].y := 4;
  writeln(a[1].x, a[2].y);
end.`,
    purpose: '6.4.3.2：component-type 是任意 type-denoter，可取 record-type',
    expectedOutput: '14\n',
  },
  {
    name: '6.4.3.2 数组下标超出 index-type 是错误',
    code: 'program test; var a: array[1..3] of integer; begin a[5] := 10; end.',
    purpose: '6.4.3.2+6.4.6 c：5 与 index-type 1..3 兼容但不在其闭区间内，是错误',
    expectedError: '',
  },

  // 6.4.3.2 Array-types — string-type（packed array[1..n] of char）

  {
    name: '6.4.3.2 string-type 的逐字符访问',
    code: "program test(output); var s: packed array[1..5] of char; begin s := 'hello'; write(s[1]); write(s[5]); end.",
    purpose: '6.4.3.2：string-type 的分量与字符串元素按 index 递增一一对应',
    expectedOutput: 'ho',
  },
  {
    name: '6.4.3.2 string-type 整体写出',
    code: "program test(output); var s: packed array[1..5] of char; begin s := 'hello'; writeln(s); end.",
    purpose: '6.9.3.6+6.4.3.2：string-type 的值可整体写出，默认宽度为分量数',
    expectedOutput: 'hello\n',
  },
  {
    name: '6.4.5 d 分量数相同的两个 string-type 之间可赋值',
    code: `program test(output);
type A3 = packed array[1..3] of char; B3 = packed array[1..3] of char;
var a: A3; b: B3;
begin
  a := 'abc';
  b := a;
  writeln(b);
end.`,
    purpose: '6.4.5 d+6.4.6 e：A3、B3 是互不相同的 new-type，但同为 3 分量 string-type 故兼容',
    expectedOutput: 'abc\n',
  },
  {
    name: '6.4.3.2 分量数不同的 string-type 之间不可赋值',
    code: "program test(output); var s: packed array[1..10] of char; begin s := 'hello'; writeln(s); end.",
    purpose: "6.1.7/'hello' 为 5 分量 string-type；6.4.5 d 只兼容分量数相同的 string-type，故赋值是错误",
    expectedError: '',
  },

  // 6.4.3.3 Record-types

  {
    name: '6.4.3.3 固定部分的字段读写',
    code:
      'program test(output); type Point = record x, y: integer end; var p: Point; begin p.x := 10; p.y := 20; writeln(p.x, p.y); end.',
    purpose: '6.4.3.3：record-section 的每个 field-identifier 关联一个独立分量',
    expectedOutput: '1020\n',
  },
  {
    name: '6.4.3.3 空 field-list 的 record 只有单个 null 值',
    code: "program test(output); type Empty = record end; var e: Empty; begin writeln('ok'); end.",
    purpose: '6.4.3.3：既无 fixed-part 又无 variant-part 的 field-list 为空，是合法类型',
    expectedOutput: 'ok\n',
  },
  {
    name: '6.4.3.3 嵌套 record',
    code:
      'program test(output); type Point = record x, y: integer end; Circle = record center: Point; radius: integer end; var c: Circle; begin c.center.x := 10; c.center.y := 20; c.radius := 5; writeln(c.center.x, c.center.y); end.',
    purpose: '6.4.3.3：record-section 的 type-denoter 可取另一 record-type',
    expectedOutput: '1020\n',
  },
  {
    name: '6.4.3.3 同一 record 类型整体赋值',
    code: `program test(output);
type Point = record x, y: integer end;
var p, q: Point;
begin
  p.x := 3;
  p.y := 4;
  q := p;
  writeln(q.x, q.y);
end.`,
    purpose: '6.4.6 a：T1 与 T2 为同一 record 类型且可作 file 分量类型，整体赋值合法',
    expectedOutput: '34\n',
  },
  {
    name: '6.4.3.3 带 tag-field 的 variant-part：设置 tag 使变体激活后可访问其字段',
    code: `program test(output);
type
  shape = (circle, square);
  figure = record
    case s: shape of
      circle: (radius: integer);
      square: (side: integer)
  end;
var f: figure;
begin
  f.s := circle;
  f.radius := 5;
  writeln(f.radius);
end.`,
    purpose: '6.4.3.3：selector 为 field，其值使对应变体 active，可读写该变体的分量',
    expectedOutput: '5\n',
  },
  {
    name: '6.4.3.3 无 tag-field 的 variant-part：访问分量时 selector 取关联值',
    code: `program test(output);
type
  four_choices = 1..4;
  memory_word = record
    case four_choices of
      1: (int_field: integer);
      2: (gr: real);
      3: (mark: integer);
      4: (tag: integer)
  end;
var m: memory_word;
begin
  m.int_field := 42;
  writeln(m.int_field);
end.`,
    purpose: '6.5.3.3：selector 不是 field 时，对某变体分量的访问把关联值赋给 selector 使其激活',
    expectedOutput: '42\n',
  },

  // 6.4.3.4 Set-types

  {
    name: '6.4.3.4 set of 子界的构造与 in 运算',
    code: `program test(output);
type S = set of 1..10;
var a: S;
begin
  a := [2, 4, 6];
  if 4 in a then writeln('4');
  if 5 in a then writeln('5') else writeln('no-5');
end.`,
    purpose: '6.4.3.4：set-type 的值是 base-type 值的幂集，in 判断成员资格',
    expectedOutput: '4\nno-5\n',
  },
  {
    name: '6.4.3.4 set of 枚举类型',
    code: `program test(output);
type Color = (red, green, blue);
var s: set of Color;
begin
  s := [red, blue];
  if red in s then writeln('red');
  if green in s then writeln('green') else writeln('no-green');
end.`,
    purpose: '6.4.3.4：base-type 为 ordinal-type，枚举类型满足',
    expectedOutput: 'red\nno-green\n',
  },
  {
    name: '6.4.3.4 base-type 必须是 ordinal-type，set of real 是错误',
    code: 'program test; type S = set of real; var a: S; begin a := []; end.',
    purpose: '6.4.3.4：base-type = ordinal-type，real 不是 ordinal-type',
    expectedError: '',
  },
  {
    name: '6.4.3.4 base-type 兼容的 set 之间可赋值（成员在目标区间内）',
    code: `program test(output);
type S1 = set of 1..10; S2 = set of 1..5;
var a: S1; b: S2;
begin
  a := [3];
  b := a;
  if 3 in b then writeln('ok');
end.`,
    purpose: '6.4.5 c+6.4.6 d：1..5 与 1..10 同为 integer 子界故兼容，且成员 3 在目标 base-type 区间内',
    expectedOutput: 'ok\n',
  },
  {
    name: '6.4.3.4 packed set 的构造与 in 运算',
    code: `program test(output);
type S = packed set of 1..5;
var a: S;
begin
  a := [1, 5];
  if 5 in a then writeln('ok');
end.`,
    purpose: '6.4.3.1+6.4.3.4：packed set-type 的取值与 set 运算不受 packed 影响',
    expectedOutput: 'ok\n',
  },

  // 6.4.3.5 File-types

  {
    name: '6.4.3.5 record-type 可以作 file 的分量类型',
    code: `program test(f);
type
  Point = record x, y: integer end;
var
  f: file of Point; p: Point;
begin
  rewrite(f);
  p.x := 4;
  p.y := 2;
  f^ := p;
  put(f);
  reset(f);
  p := f^;
  writeln(p.x, p.y);
end.`,
    purpose: '6.4.3.5：component-type 可为任意 permissible 的 type-denoter，record-type 满足',
    expectedOutput: '42\n',
  },
  {
    name: '6.4.3.5 file-type 的分量类型不得是 file-type',
    code: 'program test; type F = file of integer; G = file of F; var g: G; begin rewrite(g); end.',
    purpose: '6.4.3.5：denote file-type 的 type-denoter 不可作分量类型',
    expectedError: '',
  },

  // 6.4.4 Pointer-types

  {
    name: '6.4.4 nil 值的赋值与比较',
    code: "program test(output); type TP = ^integer; var p: TP; begin p := nil; if p = nil then writeln('nil'); end.",
    purpose: '6.4.4：pointer-type 的值集含唯一的 nil-value，token nil 表示它',
    expectedOutput: 'nil\n',
  },
  {
    name: '6.4.4 new 创建变量并解引用',
    code: 'program test(output); type TP = ^integer; var p: TP; begin new(p); p^ := 7; writeln(p^); end.',
    purpose: '6.4.4：identifying-value 与所标识变量仅由 new 创建，可通过 p^ 访问',
    expectedOutput: '7\n',
  },
  {
    name: '6.4.4 同一 pointer-type 的变量间赋值',
    code: 'program test(output); type TP = ^integer; var p, q: TP; begin new(p); p^ := 3; q := p; writeln(q^); end.',
    purpose: '6.4.6 a+6.4.4：p、q 同属 pointer-type TP，赋值后二者标识同一变量',
    expectedOutput: '3\n',
  },
  {
    name: '6.4.4 nil 可赋给 record 的 pointer 分量',
    code: `program test(output);
type
  Node = record value: integer; next: ^Node end;
var
  p: ^Node;
begin
  new(p);
  p^.value := 1;
  p^.next := nil;
  writeln(p^.value);
end.`,
    purpose: '6.4.4 NOTE 2+6.4.6：nil 可适配任意 pointer-type，故可赋给 pointer 类型的 record 字段',
    expectedOutput: '1\n',
  },
  {
    name: '6.4.4 nil 可适配任意 pointer-type',
    code: `program test(output);
type PI = ^integer; PR = ^real;
var a: PI; b: PR;
begin
  a := nil;
  b := nil;
  if (a = nil) and (b = nil) then writeln('ok');
end.`,
    purpose: '6.4.4 NOTE 2：nil 没有单一类型，可按赋值兼容规则适配任意 pointer-type',
    expectedOutput: 'ok\n',
  },
  {
    name: '6.4.4 两个不同的 pointer-type 之间不可赋值',
    code: 'program test; type P = ^integer; Q = ^integer; var p: P; q: Q; begin new(p); q := p; end.',
    purpose: '6.4.1+6.4.6 a：^integer 的两次出现是互不相同的 new-pointer-type，赋值是错误',
    expectedError: '',
  },

  // 6.4.6 Assignment-compatibility

  {
    name: '6.4.6 b integer 到 real 的隐式转换',
    code: 'program test(output); var i: integer; r: real; begin i := 5; r := i; writeln(trunc(r)); end.',
    purpose: '6.4.6 b：T1 为 real、T2 为 integer 时赋值兼容，并执行 integer→real 隐式转换',
    expectedOutput: '5\n',
  },
  {
    name: '6.4.6 real 到 integer 的赋值不兼容',
    code: 'program test; var i: integer; r: real; begin r := 1.5; i := r; end.',
    purpose: '6.4.6：real 不是 ordinal-type，也不满足 a/b/d/e，故 real→integer 不是赋值兼容',
    expectedError: '',
  },
  {
    name: '6.4.6 c 子界值赋给其 host-type（integer）',
    code: 'program test(output); type T = 1..10; var a: T; i: integer; begin a := 5; i := a; writeln(i); end.',
    purpose: '6.4.5 b+6.4.6 c：T 是 integer 的子界，二者兼容且值在 integer 区间内',
    expectedOutput: '5\n',
  },
  {
    name: '6.4.6 c 兼容 ordinal-type 且值在目标区间内',
    code: 'program test(output); type T = 1..10; var a: T; i: integer; begin i := 5; a := i; writeln(a); end.',
    purpose: '6.4.6 c：integer 与子界 T 兼容，值 5 在 T 的闭区间 1..10 内',
    expectedOutput: '5\n',
  },
  {
    name: '6.4.6 c 兼容 ordinal-type 但值超出目标区间是错误',
    code: 'program test; type T = 1..10; var a: T; i: integer; begin i := 100; a := i; end.',
    purpose: '6.4.6 错误规则 a：T1、T2 是兼容 ordinal-type 但值 100 不在 1..10 内',
    expectedError: '',
  },
  {
    name: '6.4.6 c 整数常量超出子界上界是错误',
    code: 'program test; type T = 1..10; var a: T; begin a := 11; end.',
    purpose: '6.4.6 c：常量 11 与 T 兼容但不在 1..10 内，是错误',
    expectedError: '',
  },
  {
    name: '6.4.6 c 算术结果超出子界上界是错误',
    code: 'program test; type T = 1..10; var a: T; begin a := 8; a := a + 5; end.',
    purpose: '6.7.2.1+6.4.6 c：子界因子按 host-type integer 参与运算得 13，不在 1..10 内',
    expectedError: '',
  },
  {
    name: '6.4.6 c 兼容子界之间赋值且值在目标区间内',
    code: 'program test(output); type T1 = 1..10; T2 = 1..5; var a: T1; b: T2; begin a := 3; b := a; writeln(b); end.',
    purpose: '6.4.5 b+6.4.6 c：T1、T2 同为 integer 的子界而兼容，值 3 在 1..5 内',
    expectedOutput: '3\n',
  },
  {
    name: '6.4.6 c 兼容子界之间赋值但值超出目标区间是错误',
    code: 'program test; type T1 = 1..10; T2 = 1..5; var a: T1; b: T2; begin a := 8; b := a; end.',
    purpose: '6.4.6 错误规则 a：值 8 不在目标子界 1..5 内',
    expectedError: '',
  },
  {
    name: '6.4.6 c 字符子界赋值超出上界是错误',
    code: "program test; type T = 'A'..'C'; var c: T; begin c := 'Z'; end.",
    purpose: "6.4.2.2 d 2)+6.4.6 c：A..Z 字典有序，'Z' 不在 'A'..'C' 内",
    expectedError: '',
  },
  {
    name: '6.4.3.1 packed 可前缀于 record 类型',
    code: `program test(output);
type r = packed record x: integer; y: char end;
var v: r;
begin
  v.x := 3;
  v.y := 'A';
  writeln(v.x, v.y);
end.`,
    purpose: 'ISO 6.4.3.1：packed 可前缀于 array/record/file/set 四种结构类型，packed record 的字段仍可访问',
    expectedOutput: '3A\n',
  },
  {
    name: '6.4.3.1 packed 不得前缀于非结构类型',
    code: 'program test; type t = packed integer; begin end.',
    purpose: 'ISO 6.4.3.1：packed 只允许前缀于 array、record、file、set 类型',
    expectedError: '',
  },
  {
    name: '6.4.3.2 array 缺少 index-type 表应报错',
    code: 'program test; type t = array of integer; begin end.',
    purpose: 'ISO 6.4.3.2：array-type 须给出方括号括起的 index-type 表',
    expectedError: '',
  },
  {
    name: '6.4.3.2 array 缺少 of 应报错',
    code: 'program test; type t = array[1..3] integer; begin end.',
    purpose: 'ISO 6.4.3.2：index-type 表之后须有 of 与 component-type',
    expectedError: '',
  },
  {
    name: '6.4.3.2 array 缺少右方括号应报错',
    code: 'program test; type t = array[1..3 of integer; begin end.',
    purpose: 'ISO 6.4.3.2：index-type 表须以右方括号结束',
    expectedError: '',
  },
  {
    name: '6.4.3.2 array 的 component-type 非法应报错',
    code: 'program test; type t = array[1..3] of 5; begin end.',
    purpose: 'ISO 6.4.3.2：of 之后须为合法 type-denoter',
    expectedError: '',
  },
  {
    name: '6.4.3.3 record 缺少 end 应报错',
    code: 'program test; type t = record x: integer; begin end.',
    purpose: 'ISO 6.4.3.3：record-type 以 end 结束',
    expectedError: '',
  },
  {
    name: '6.4.3.3 record 字段缺少类型应报错',
    code: 'program test; type t = record x; end; begin end.',
    purpose: 'ISO 6.4.3.3：field-declaration 为 identifier-list : type-denoter',
    expectedError: '',
  },
  {
    name: '6.4.3.3 变体分支的 field-list 可含多个字段',
    code: `program test(output);
type r = record
  case tag: integer of
    1: (a: integer; b: char);
    2: (c: real);
end;
var v: r;
begin
  v.tag := 1;
  v.a := 5;
  v.b := 'X';
  writeln(v.a, v.b);
end.`,
    purpose: 'ISO 6.4.3.3：variant 的分支为 ( field-list )，其中可含多个以分号分隔的字段',
    expectedOutput: '5X\n',
  },
  {
    name: '6.4.3.3 variant 的 case-constant 之后缺少冒号应报错',
    code: 'program test; type r = record case tag: integer of 1 (a: integer) end; begin end.',
    purpose: 'ISO 6.4.3.3：variant = case-constant-list : ( field-list )',
    expectedError: '',
  },
  {
    name: '6.4.3.3 variant 的 field-list 缺少左圆括号应报错',
    code: 'program test; type r = record case tag: integer of 1: a: integer end; begin end.',
    purpose: 'ISO 6.4.3.3：case-constant-list 的冒号之后须为左圆括号',
    expectedError: '',
  },
  {
    name: '6.4.2.3 枚举值表须为 identifier-list',
    code: 'program test; type t = (1, 2); begin end.',
    purpose: 'ISO 6.4.2.3：enumeration-type 的值表由标识符组成',
    expectedError: '',
  },
  {
    name: '6.4.2.3 枚举值表缺少右圆括号应报错',
    code: 'program test; type t = (a, b; begin end.',
    purpose: 'ISO 6.4.2.3：enumeration-type = ( identifier-list )',
    expectedError: '',
  },
  {
    name: '6.4.4 指针类型缺少 domain-type 应报错',
    code: 'program test; type t = ^; begin end.',
    purpose: 'ISO 6.4.4：pointer-type = ^ domain-type',
    expectedError: '',
  },
  {
    name: '6.4.3.5 file of 之后缺少分量类型应报错',
    code: 'program test; type t = file of ; begin end.',
    purpose: 'ISO 6.4.3.5：file-type 给出 of 之后须有 component-type',
    expectedError: '',
  },
  {
    name: '6.4.3.4 set 类型缺少 of 应报错',
    code: 'program test; type t = set 1..3; begin end.',
    purpose: 'ISO 6.4.3.4：set-type = set of base-type',
    expectedError: '',
  },
  {
    name: '6.4.1 type-denoter 不得是孤立常量',
    code: 'program test; type t = 5; begin end.',
    purpose: 'ISO 6.4.1：type-denoter 为 type-identifier 或 new-type，孤立的常量不构成任何 new-type',
    expectedError: '',
  },
  {
    name: '6.4.2.4 子界类型缺少右边界应报错',
    code: 'program test; type t = 1..; begin end.',
    purpose: 'ISO 6.4.2.4：subrange-type = constant .. constant',
    expectedError: '',
  },
  {
    name: '6.4.2.4 Boolean 是 ordinal-type，可作为子界的 base-type',
    code: `program test(output);
type t = false..true;
var b: t;
begin
  b := true;
  if b = true then writeln('T') else writeln('F');
end.`,
    purpose:
      'ISO 6.4.2.2 d/6.4.2.4：Boolean 是序数类型，其值可作为子界的两端常量，该子界与其宿主的宿主类型 Boolean 兼容',
    expectedOutput: 'T\n',
  },
  {
    name: '6.4.3.2 index-type 可为已定义的子界类型标识符',
    code: `program test(output);
type idx = 1..3;
     t = array[idx] of integer;
var a: t;
begin
  a[2] := 7;
  writeln(a[2]);
end.`,
    purpose: 'ISO 6.4.3.2/6.4.1：index-type 是 ordinal-type，可写成先前定义的子界类型标识符',
    expectedOutput: '7\n',
  },
  {
    name: '6.4.3.2 分量数不同的 string-type 之间不得赋值',
    code: `program test;
var a: array[1..2, 1..2] of char;
begin
  a := 'ab';
end.`,
    purpose:
      'ISO 6.4.3.2/6.4.6 e：string-type 是分量数为 n 的一维 packed char 数组，二维 char 数组不属 string-type，分量数亦不同',
    expectedError: '',
  },
  {
    name: '6.4.1 类型定义缺少等号应报错',
    code: 'program test; type t integer; begin end.',
    purpose: 'ISO 6.4.1：type-definition = identifier = type-denoter',
    expectedError: '',
  },
  {
    name: '6.2.2.9 非类型标识符不得用作类型名',
    code: `program test;
var v: integer;
type t = v;
begin end.`,
    purpose: 'ISO 6.2.2.9/6.4.1：type-denoter 中的标识符须有类型定义点，变量标识符不是类型',
    expectedError: '',
  },
  {
    name: '6.4.1 type-denoter 处出现非法记号应报错',
    code: 'program test; type t = [1; begin end.',
    purpose: 'ISO 6.4.1：type-denoter 须为 type-identifier 或合法 new-type',
    expectedError: '',
  },
  {
    name: '6.4.3.2 array 的 index-type 表为空应报错',
    code: 'program test; type t = array[;] of integer; begin end.',
    purpose: 'ISO 6.4.3.2：index-type 表中每项都须为合法 ordinal-type',
    expectedError: '',
  },
  {
    name: '6.4.3.4 set 的 base-type 非法应报错',
    code: 'program test; type t = set of ; begin end.',
    purpose: 'ISO 6.4.3.4：of 之后须为合法 ordinal-type',
    expectedError: '',
  },
  {
    name: '6.4.3.3 variant-part 的 tag-type 非法应报错',
    code: 'program test; type r = record case tag: ; of 1: (a: integer) end; begin end.',
    purpose: 'ISO 6.4.3.3：variant-part = case [ tag-field : ] tag-type of variant {; variant}',
    expectedError: '',
  },
  {
    name: '6.4.3.3 variant-part 缺少 of 应报错',
    code: 'program test; type r = record case tag: integer 1: (a: integer) end; begin end.',
    purpose: 'ISO 6.4.3.3：tag-type 之后须有 of',
    expectedError: '',
  },
  {
    name: '6.4.3.3 variant 的 case-constant-list 非法应报错',
    code: 'program test; type r = record case tag: integer of : (a: integer) end; begin end.',
    purpose: 'ISO 6.4.3.3：variant = case-constant-list : ( field-list )',
    expectedError: '',
  },
  {
    name: '6.4.3.3 variant 的 field-list 中字段声明非法应报错',
    code: 'program test; type r = record case tag: integer of 1: (5) end; begin end.',
    purpose: 'ISO 6.4.3.3：field-list 中的每项须为合法 field-declaration',
    expectedError: '',
  },
  {
    name: '6.4.3.3 variant 的 field-list 缺少右圆括号应报错',
    code: 'program test; type r = record case tag: integer of 1: (a: integer end; begin end.',
    purpose: 'ISO 6.4.3.3：field-list 以右圆括号结束',
    expectedError: '',
  },
  {
    name: '6.4.3.3 variant 之间的多余分号被接受（实现宽化形式）',
    code: `program test(output);
type r = record
  case tag: integer of
    1: (a: integer);;
    2: (b: integer)
end;
var v: r;
begin
  v.tag := 2;
  v.b := 4;
  writeln(v.b);
end.`,
    purpose: 'ISO 6.4.3.3 的 variant 之间以单个分号分隔，出现连续分号时按空 variant 处理；本实现直接跳过（扩展）',
    expectedOutput: '4\n',
  },
  {
    name: '6.4.3.3 variant 的 field-list 内可再嵌 variant-part（以 end 终止的实现形式）',
    code: `program test(output);
type r = record
  case tag: integer of
    1: (a: integer;
        case inner: integer of
          1: (p: char);
          2: (q: char)
        end)
end;
var v: r;
begin
  v.tag := 1;
  v.inner := 1;
  v.p := 'Z';
  writeln(v.p);
end.`,
    purpose: 'ISO 6.4.3.3 允许 variant-part 嵌套在 field-list 内（此处按实现要求以内层 end 终止该嵌套部分）',
    expectedOutput: 'Z\n',
  },
  {
    name: '6.4.3.2 index-type 可为简单类型 integer',
    code: `program test;
type t = array[integer] of char;
begin end.`,
    purpose: 'ISO 6.4.3.2：index-type 是 ordinal-type，预定义类型 integer 本身即可作 index-type',
    expectedOutput: '',
  },
  {
    name: '6.4.3.5 file-type 可不给出分量类型',
    code: `program test;
type t = file;
begin end.`,
    purpose: 'ISO 6.4.3.5：file-type = file [ of component-type ]，省略 of 时分量类型为 undefined',
    expectedOutput: '',
  },
]

runPascalTests('ISO 7185 6.4 - Type-definitions', tests)
