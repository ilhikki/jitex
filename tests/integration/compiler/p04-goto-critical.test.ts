import { describe } from 'vitest'
import { type PascalTest, runPascalTests } from './_helper'

describe('Phase 4: Goto Critical Edge Cases', () => {
  const tests: PascalTest[] = [
    // ==========================================================================
    // 跨过程/函数 goto 测试（ISO 7185 6.8.1, 6.8.2.4）
    // 规则：goto 可以跳到同 block 或外层 block 的 label，但不能进入一个 block
    // NOTE 2: 内层 block 的 goto 可以引用外层 block 的 label，前提是 label 在最外层
    // ==========================================================================

    {
      name: 'goto-from-proc-to-main-label-allowed',
      code: `program test;
label 100;
procedure p;
begin
  writeln('in p');
  goto 100;
  writeln('skipped in p');
end;
begin
  p;
  writeln('after p');
100:
  writeln('label 100');
end.`,
      purpose: '从过程内 goto 到主程序 label（ISO 允许，label 在主程序最外层）',
      expectedContains: 'in p\nlabel 100',
      expectedNotContains: 'skipped in p\nafter p',
    },
    {
      name: 'goto-from-func-to-main-label-allowed',
      code: `program test;
label 200;
var x: integer;
function f: integer;
begin
  f := 42;
  writeln('in f');
  goto 200;
  writeln('skipped in f');
end;
begin
  x := f;
  writeln('after f');
200:
  writeln('label 200, x=', x);
end.`,
      purpose: '从函数内 goto 到主程序 label',
      expectedOutput: 'in f\nlabel 200, x=0\n',
    },
    {
      name: 'goto-from-inner-proc-to-outer-proc-label-allowed',
      code: `program test;
procedure outer;
label 300;
procedure inner;
begin
  writeln('in inner');
  goto 300;
  writeln('skipped in inner');
end;
begin
  inner;
  writeln('after inner');
300:
  writeln('label 300');
end;
begin
  outer;
end.`,
      purpose: '从内层过程 goto 到外层过程 label（ISO 允许，label 在外层最外层）',
      expectedContains: 'in inner\nlabel 300',
      expectedNotContains: 'skipped in inner\nafter inner',
    },
    {
      name: 'goto-from-proc-to-another-proc-label-forbidden',
      code: `program test;
procedure p1;
label 400;
begin
400:
  writeln('p1 label');
end;
procedure p2;
begin
  goto 400;
end;
begin
  p2;
end.`,
      purpose: '从一个过程 goto 到另一个过程的 label（ISO 禁止，label 不在作用域内）',
      expectedError: '',
    },
    {
      name: 'goto-from-main-to-proc-label-forbidden',
      code: `program test;
procedure p;
label 500;
begin
500:
  writeln('p label');
end;
begin
  goto 500;
end.`,
      purpose: '从主程序 goto 到过程内的 label（ISO 禁止，不能进入一个 block）',
      expectedError: '',
    },
    {
      name: 'goto-from-outer-proc-to-inner-proc-label-forbidden',
      code: `program test;
procedure outer;
procedure inner;
label 600;
begin
600:
  writeln('inner label');
end;
begin
  goto 600;
end;
begin
  outer;
end.`,
      purpose: '从外层过程 goto 到内层过程的 label（ISO 禁止，不能进入一个 block）',
      expectedError: '',
    },

    // ==========================================================================
    // Label 必须在外层 block 的 statement-sequence 顶层才能被内层 goto 引用
    // ==========================================================================

    {
      name: 'goto-to-label-inside-if-forbidden',
      code: `program test;
procedure outer;
var x: integer;
procedure inner;
begin
  goto 700;
end;
begin
  x := 0;
  if x = 0 then
    begin
700:
      writeln('label inside if');
    end;
  inner;
end;
begin
  outer;
end.`,
      purpose: 'goto 到 if 块内的 label（ISO 禁止，label 不在最外层）',
      expectedError: '',
    },
    {
      name: 'goto-to-label-inside-while-forbidden',
      code: `program test;
procedure outer;
var i: integer;
procedure inner;
begin
  goto 800;
end;
begin
  i := 0;
  while i < 5 do
    begin
800:
      writeln('label inside while');
      i := i + 1;
    end;
  inner;
end;
begin
  outer;
end.`,
      purpose: 'goto 到 while 块内的 label（ISO 禁止，label 不在最外层）',
      expectedError: '',
    },

    // ==========================================================================
    // LoopAnalysis 透明块末尾 label 误判测试
    // 问题：while(with{ label n; } call()) 会把 label n 当成循环体末尾，忽略 call()
    // ==========================================================================

    {
      name: 'while-with-label-then-call',
      code: `program test;
label 10;
var i: integer;
begin
  i := 0;
  while i < 3 do
    begin
      with i do
        begin
          i := i + 1;
10:
          writeln('label 10, i=', i);
        end;
      writeln('after with, i=', i);
    end;
  writeln('done');
end.`,
      purpose: 'while 内 with 块末尾有 label，其后还有语句（label 不应被视为循环体末尾）',
      expectedContains:
        'label 10, i=1\nafter with, i=1\nlabel 10, i=2\nafter with, i=2\nlabel 10, i=3\nafter with, i=3\ndone',
      maxSteps: 10000,
    },
    {
      name: 'while-compound-label-then-call',
      code: `program test;
label 20;
var i: integer;
begin
  i := 0;
  while i < 3 do
    begin
      begin
        i := i + 1;
20:
        writeln('label 20, i=', i);
      end;
      writeln('after inner compound, i=', i);
    end;
  writeln('done');
end.`,
      purpose: 'while 内复合语句末尾有 label，其后还有语句（label 不应被视为循环体末尾）',
      expectedContains:
        'label 20, i=1\nafter inner compound, i=1\nlabel 20, i=2\nafter inner compound, i=2\nlabel 20, i=3\nafter inner compound, i=3\ndone',
      maxSteps: 10000,
    },
    {
      name: 'while-case-label-then-call',
      code: `program test;
label 30;
var i: integer;
begin
  i := 0;
  while i < 3 do
    begin
      case i of
        0, 1, 2:
          begin
            i := i + 1;
30:
            writeln('label 30, i=', i);
          end;
      end;
      writeln('after case, i=', i);
    end;
  writeln('done');
end.`,
      purpose: 'while 内 case 语句分支末尾有 label，其后还有语句（label 不应被视为循环体末尾）',
      expectedContains:
        'label 30, i=1\nafter case, i=1\nlabel 30, i=2\nafter case, i=2\nlabel 30, i=3\nafter case, i=3\ndone',
      maxSteps: 10000,
    },
    {
      name: 'for-with-label-then-call',
      code: `program test;
label 40;
var i: integer;
begin
  for i := 1 to 3 do
    begin
      with i do
        begin
40:
          writeln('label 40, i=', i);
        end;
      writeln('after with, i=', i);
    end;
  writeln('done');
end.`,
      purpose: 'for 内 with 块末尾有 label，其后还有语句（label 不应被视为循环体末尾）',
      expectedContains:
        'label 40, i=1\nafter with, i=1\nlabel 40, i=2\nafter with, i=2\nlabel 40, i=3\nafter with, i=3\ndone',
      maxSteps: 10000,
    },
    {
      name: 'repeat-with-label-then-call',
      code: `program test;
label 50;
var i: integer;
begin
  i := 0;
  repeat
    with i do
      begin
        i := i + 1;
50:
        writeln('label 50, i=', i);
      end;
    writeln('after with, i=', i);
  until i >= 3;
  writeln('done');
end.`,
      purpose: 'repeat 内 with 块末尾有 label，其后还有语句（label 不应被视为循环体末尾）',
      expectedContains:
        'label 50, i=1\nafter with, i=1\nlabel 50, i=2\nafter with, i=2\nlabel 50, i=3\nafter with, i=3\ndone',
      maxSteps: 10000,
    },

    // ==========================================================================
    // 嵌套透明块末尾 label 测试
    // ==========================================================================

    {
      name: 'while-nested-with-label-then-call',
      code: `program test;
label 60;
var i: integer;
begin
  i := 0;
  while i < 2 do
    begin
      with i do
        begin
          with i do
            begin
              i := i + 1;
60:
              writeln('label 60, i=', i);
            end;
          writeln('inner with done');
        end;
      writeln('outer with done');
    end;
  writeln('done');
end.`,
      purpose: 'while 内嵌套两层 with，最内层末尾有 label，其后多层都有语句',
      expectedContains:
        'label 60, i=1\ninner with done\nouter with done\nlabel 60, i=2\ninner with done\nouter with done\ndone',
      maxSteps: 10000,
    },

    // ==========================================================================
    // 循环体内 goto 到透明块末尾 label 的情况
    // ==========================================================================

    {
      name: 'goto-to-with-label-from-while-body',
      code: `program test;
label 70;
var i: integer;
begin
  i := 0;
  while i < 5 do
    begin
      i := i + 1;
      if i = 3 then goto 70;
      writeln('before with, i=', i);
      with i do
        begin
70:
          writeln('label 70, i=', i);
        end;
      writeln('after with, i=', i);
    end;
  writeln('done');
end.`,
      purpose: 'while 体内 goto 到 with 块末尾的 label（label 后还有语句）',
      expectedContains:
        'before with, i=1\nlabel 70, i=1\nafter with, i=1\nbefore with, i=2\nlabel 70, i=2\nafter with, i=2\nlabel 70, i=3\nafter with, i=3\nbefore with, i=4\nlabel 70, i=4\nafter with, i=4\nbefore with, i=5\nlabel 70, i=5\nafter with, i=5\ndone',
      maxSteps: 10000,
    },

    // ==========================================================================
    // 跨过程 goto 终止中间激活测试
    // ==========================================================================

    {
      name: 'goto-from-nested-proc-terminates-intervening',
      code: `program test;
label 900;
procedure outer;
procedure inner;
begin
  writeln('in inner');
  goto 900;
  writeln('inner never');
end;
begin
  writeln('in outer');
  inner;
  writeln('outer never');
end;
begin
  writeln('in main');
  outer;
  writeln('main never');
900:
  writeln('label 900');
end.`,
      purpose: '从嵌套两层过程 goto 到主程序 label，验证中间激活都被终止',
      expectedContains: 'in main\nin outer\nin inner\nlabel 900',
      expectedNotContains: 'inner never\nouter never\nmain never',
    },

    // ==========================================================================
    // Label 作用域遮蔽测试（6.2.2.5）
    // ==========================================================================

    {
      name: 'label-shadowing-inner-takes-precedence',
      code: `program test;
label 100;
procedure outer;
label 100;
begin
  writeln('outer');
  goto 100;
  writeln('outer skipped');
100:
  writeln('outer label');
end;
begin
  outer;
100:
  writeln('main label');
end.`,
      purpose: '内层过程和外层程序声明相同 label，内层 goto 引用内层 label（遮蔽规则）',
      expectedContains: 'outer\nouter label\nmain label',
      expectedNotContains: 'outer skipped',
    },
    {
      name: 'label-shadowing-inner-goto-to-outer-forbidden',
      code: `program test;
label 100;
procedure outer;
label 100;
procedure inner;
begin
  goto 100;
end;
begin
  inner;
100:
  writeln('outer label');
end;
begin
  outer;
end.`,
      purpose: '三层嵌套，内层 goto 引用中间层的 label（内层被中间层遮蔽，不跳到主程序同名 label）',
      expectedContains: 'outer label',
      expectedNotContains: 'main label',
    },

    // ==========================================================================
    // 循环体末尾 label（非透明块内）测试
    // ==========================================================================

    {
      name: 'while-label-at-actual-end-of-body',
      code: `program test;
label 10;
var i: integer;
begin
  i := 0;
  while i < 3 do
    begin
      i := i + 1;
10:
      writeln('label 10, i=', i);
    end;
  writeln('done');
end.`,
      purpose: 'while 循环体末尾有 label（直接在 compound 末尾，不是在 with/case 内）',
      expectedContains: 'label 10, i=1\nlabel 10, i=2\nlabel 10, i=3\ndone',
      maxSteps: 10000,
    },
    {
      name: 'for-label-at-actual-end-of-body',
      code: `program test;
label 20;
var i: integer;
begin
  for i := 1 to 3 do
    begin
      writeln('i=', i);
20:
      writeln('label 20');
    end;
  writeln('done');
end.`,
      purpose: 'for 循环体末尾有 label（直接在 compound 末尾）',
      expectedContains: 'i=1\nlabel 20\ni=2\nlabel 20\ni=3\nlabel 20\ndone',
      maxSteps: 10000,
    },
    {
      name: 'repeat-label-at-actual-end-of-body',
      code: `program test;
label 30;
var i: integer;
begin
  i := 0;
  repeat
    i := i + 1;
    writeln('i=', i);
30:
    writeln('label 30');
  until i >= 3;
  writeln('done');
end.`,
      purpose: 'repeat 循环体末尾有 label（直接在 repeat 末尾）',
      expectedContains: 'i=1\nlabel 30\ni=2\nlabel 30\ni=3\nlabel 30\ndone',
      maxSteps: 10000,
    },

    // ==========================================================================
    // 多个 label 在循环体末尾
    // ==========================================================================

    {
      name: 'multiple-labels-at-end-of-while-body',
      code: `program test;
label 10, 20;
var i: integer;
begin
  i := 0;
  while i < 3 do
    begin
      i := i + 1;
10:
      writeln('label 10, i=', i);
20:
      writeln('label 20');
    end;
  writeln('done');
end.`,
      purpose: 'while 循环体末尾有多个连续 label',
      expectedContains:
        'label 10, i=1\nlabel 20\nlabel 10, i=2\nlabel 20\nlabel 10, i=3\nlabel 20\ndone',
      maxSteps: 10000,
    },

    // ==========================================================================
    // Goto 到循环体末尾 label（应使用 continue 优化）
    // ==========================================================================

    {
      name: 'goto-to-tail-label-in-while',
      code: `program test;
label 10;
var i: integer;
begin
  i := 0;
  while i < 5 do
    begin
      i := i + 1;
      if i = 3 then goto 10;
      writeln('before label, i=', i);
10:
      writeln('label 10, i=', i);
    end;
  writeln('done');
end.`,
      purpose: 'goto 到 while 循环体末尾的 label（tail label，可用 continue 优化）',
      expectedContains:
        'before label, i=1\nlabel 10, i=1\nbefore label, i=2\nlabel 10, i=2\nlabel 10, i=3\nbefore label, i=4\nlabel 10, i=4\nbefore label, i=5\nlabel 10, i=5\ndone',
      maxSteps: 10000,
    },

    // ==========================================================================
    // Label 声明但未使用（ISO 允许）
    // ==========================================================================

    {
      name: 'label-declared-but-not-used',
      code: `program test;
label 100;
begin
  writeln('hello');
end.`,
      purpose: '声明了 label 但未使用（ISO 允许，不报错）',
      expectedContains: 'hello',
    },
    {
      name: 'label-used-but-not-declared',
      code: `program test;
begin
100:
  writeln('hello');
end.`,
      purpose: '使用了 label 但未声明（ISO 禁止，应报错）',
      expectedError: '',
    },

    // ==========================================================================
    // Label 值范围测试（ISO 6.1.6: 0..9999）
    // ==========================================================================

    {
      name: 'label-min-value-0',
      code: `program test;
label 0;
begin
0:
  writeln('label 0');
end.`,
      purpose: 'label 值为 0（ISO 允许的最小值）',
      expectedContains: 'label 0',
    },
    {
      name: 'label-max-value-9999',
      code: `program test;
label 9999;
begin
9999:
  writeln('label 9999');
end.`,
      purpose: 'label 值为 9999（ISO 允许的最大值）',
      expectedContains: 'label 9999',
    },
    {
      name: 'label-value-too-large',
      code: `program test;
label 10000;
begin
10000:
  writeln('label 10000');
end.`,
      purpose: 'label 值为 10000（超出 ISO 范围 0..9999，应报错）',
      expectedError: '',
    },
  ]

  runPascalTests(tests)
})
