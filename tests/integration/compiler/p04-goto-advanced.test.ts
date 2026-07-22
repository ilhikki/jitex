import { describe, it, expect } from '@jest/globals'
import { runPascalTest, type PascalTest } from '../_helper'

// 高级 goto 测试：非正常场景 + 嵌套非透明块多 label
// 防死循环：每个可能导致死循环的测试都设置了 maxSteps

describe('Phase 4: Goto Advanced', () => {
  const tests: PascalTest[] = [
    // ==========================================================================
    // 非正常场景：跳入循环 / 跳入 if 块
    // ==========================================================================

    {
      name: 'goto-into-while-loop-body',
      code: `program test;
label 50;
var i: integer;
begin
  i := 0;
  writeln('before goto');
  goto 50;
  writeln('skipped');
  while i < 5 do
    begin
      i := i + 1;
50:
      writeln('jumped into loop body, i=', i);
    end;
  writeln('after loop, i=', i);
end.`,
      purpose: 'GOTO 跳入 while 循环体（非透明块，label 不可达，应报错）',
      expectedError: '',
    },
    {
      name: 'goto-into-for-loop-body',
      code: `program test;
label 60;
var i: integer;
begin
  writeln('before goto');
  goto 60;
  writeln('skipped');
  for i := 1 to 3 do
    begin
      writeln('normal iter ', i);
60:
      writeln('jumped into for body');
    end;
  writeln('after for');
end.`,
      purpose: 'GOTO 跳入 for 循环体（非透明块，label 不可达，应报错）',
      expectedError: '',
    },
    {
      name: 'goto-into-repeat-loop-body',
      code: `program test;
label 70;
var i: integer;
begin
  i := 0;
  writeln('before goto');
  goto 70;
  writeln('skipped');
  repeat
    i := i + 1;
    writeln('normal repeat ', i);
70:
    writeln('jumped into repeat');
  until i > 5;
  writeln('after repeat, i=', i);
end.`,
      purpose: 'GOTO 跳入 repeat 循环体（非透明块，label 不可达，应报错）',
      expectedError: '',
    },
    {
      name: 'goto-into-if-then-branch',
      code: `program test;
label 80;
var x: integer;
begin
  x := 0;
  writeln('before goto');
  goto 80;
  writeln('skipped');
  if x > 0 then
    begin
      writeln('then branch');
80:
      writeln('jumped into then');
    end;
  writeln('after if');
end.`,
      purpose: 'GOTO 跳入 if-then 分支（非透明块，label 不可达，应报错）',
      expectedError: '',
    },
    {
      name: 'goto-into-if-else-branch',
      code: `program test;
label 90;
var x: integer;
begin
  x := 1;
  writeln('before goto');
  goto 90;
  writeln('skipped');
  if x > 0 then
    writeln('then')
  else
    begin
      writeln('else branch');
90:
      writeln('jumped into else');
    end;
  writeln('after if');
end.`,
      purpose: 'GOTO 跳入 if-else 分支（非透明块，label 不可达，应报错）',
      expectedError: '',
    },

    // ==========================================================================
    // 嵌套非透明块：if/while/repeat/for 嵌套，每层有 label，goto 跨层跳转
    // ==========================================================================

    {
      name: 'nested-if-then-goto-outer-label',
      code: `program test;
label 100;
var x, y: integer;
begin
  x := 1;
  y := 1;
  if x > 0 then
    begin
      if y > 0 then
        begin
          writeln('inner');
          goto 100;
          writeln('skipped inner');
        end;
      writeln('skipped middle');
    end;
  writeln('skipped outer');
100:
  writeln('label 100');
end.`,
      purpose: '嵌套 if-then 中 goto 跳到外层 label',
      expectedContains: 'inner\nlabel 100',
      expectedNotContains: 'skipped',
    },
    {
      name: 'nested-if-else-goto-outer-label',
      code: `program test;
label 110;
var x: integer;
begin
  x := 0;
  if x > 0 then
    writeln('then')
  else
    begin
      if x = 0 then
        begin
          writeln('else-inner');
          goto 110;
        end;
      writeln('else-skipped');
    end;
  writeln('after-if-skipped');
110:
  writeln('label 110');
end.`,
      purpose: '嵌套 if-else 中 goto 跳到外层 label',
      expectedContains: 'else-inner\nlabel 110',
      expectedNotContains: 'else-skipped\nafter-if-skipped',
    },
    {
      name: 'nested-while-goto-outer-label',
      code: `program test;
label 120;
var i, j: integer;
begin
  i := 1;
  while i <= 3 do
    begin
      j := 1;
      while j <= 3 do
        begin
          writeln('i=', i, ' j=', j);
          if (i = 2) and (j = 1) then goto 120;
          j := j + 1;
        end;
      i := i + 1;
    end;
  writeln('after loops');
120:
  writeln('label 120');
end.`,
      purpose: '嵌套 while 中 goto 跳出两层循环到外层 label',
      expectedContains: 'i=1 j=1\ni=1 j=2\ni=1 j=3\ni=2 j=1\nlabel 120',
      expectedNotContains: 'after loops',
    },
    {
      name: 'nested-for-goto-outer-label',
      code: `program test;
label 130;
var i, j: integer;
begin
  for i := 1 to 3 do
    begin
      for j := 1 to 3 do
        begin
          writeln('i=', i, ' j=', j);
          if (i = 1) and (j = 2) then goto 130;
        end;
    end;
  writeln('after loops');
130:
  writeln('label 130');
end.`,
      purpose: '嵌套 for 中 goto 跳出两层循环到外层 label',
      expectedContains: 'i=1 j=1\ni=1 j=2\nlabel 130',
      expectedNotContains: 'after loops',
    },
    {
      name: 'nested-repeat-goto-outer-label',
      code: `program test;
label 140;
var i, j: integer;
begin
  i := 0;
  repeat
    j := 0;
    repeat
      j := j + 1;
      writeln('i=', i, ' j=', j);
      if (i = 1) and (j = 1) then goto 140;
    until j >= 2;
    i := i + 1;
  until i >= 3;
  writeln('after loops');
140:
  writeln('label 140');
end.`,
      purpose: '嵌套 repeat 中 goto 跳出两层循环到外层 label',
      expectedContains: 'i=0 j=1\ni=0 j=2\ni=1 j=1\nlabel 140',
      expectedNotContains: 'after loops',
    },
    {
      name: 'mixed-nested-if-while-goto',
      code: `program test;
label 150;
var x, i: integer;
begin
  x := 1;
  if x > 0 then
    begin
      i := 0;
      while i < 10 do
        begin
          i := i + 1;
          if i = 3 then goto 150;
        end;
      writeln('after while in if');
    end;
  writeln('after if');
150:
  writeln('label 150');
end.`,
      purpose: 'if 内嵌套 while，goto 从 while 跳出 if 到外层 label',
      expectedContains: 'label 150',
      expectedNotContains: 'after while in if\nafter if',
    },
    {
      name: 'mixed-nested-while-for-goto',
      code: `program test;
label 160;
var i, j: integer;
begin
  i := 0;
  while i < 3 do
    begin
      i := i + 1;
      for j := 1 to 5 do
        begin
          if (i = 2) and (j = 3) then goto 160;
        end;
      writeln('completed for i=', i);
    end;
  writeln('after while');
160:
  writeln('label 160');
end.`,
      purpose: 'while 内嵌套 for，goto 从 for 跳出 while 到外层',
      expectedContains: 'completed for i=1\nlabel 160',
      expectedNotContains: 'after while',
    },
    {
      name: 'mixed-nested-for-if-goto',
      code: `program test;
label 170;
var i, x: integer;
begin
  for i := 1 to 5 do
    begin
      x := i;
      if x > 2 then
        begin
          writeln('x=', x);
          goto 170;
        end;
      writeln('skip x=', x);
    end;
  writeln('after for');
170:
  writeln('label 170');
end.`,
      purpose: 'for 内嵌套 if，goto 从 if 跳出 for 到外层',
      expectedContains: 'skip x=1\nskip x=2\nx=3\nlabel 170',
      expectedNotContains: 'after for',
    },
    {
      name: 'multiple-labels-in-nested-blocks',
      code: `program test;
label 200, 210, 220;
var i: integer;
begin
  writeln('start');
  for i := 1 to 3 do
    begin
      writeln('i=', i);
      if i = 1 then goto 200;
      if i = 2 then goto 210;
      if i = 3 then goto 220;
    end;
  writeln('after for');
200:
  writeln('label 200');
210:
  writeln('label 210');
220:
  writeln('label 220');
end.`,
      purpose: '多层嵌套中多个 label，goto 跳转到不同层级（label 在顶层透明块中）',
      expectedContains: 'start\ni=1\nlabel 200\nlabel 210\nlabel 220',
      expectedNotContains: 'after for',
    },
    {
      name: 'goto-between-if-branches',
      code: `program test;
label 300, 310;
var x: integer;
begin
  x := 1;
  if x = 1 then
    goto 300
  else
    goto 310;
  writeln('skipped');
300:
  writeln('label 300');
310:
  writeln('label 310');
end.`,
      purpose: 'if 分支中的 goto 跳转到外层 label（label 在透明块中）',
      expectedContains: 'label 300\nlabel 310',
      expectedNotContains: 'skipped',
    },
    {
      name: 'goto-from-repeat-to-for-label',
      code: `program test;
label 400, 410;
var i, j: integer;
begin
  i := 0;
400:
  for j := 1 to 2 do
    begin
      writeln('for j=', j, ' i=', i);
      if (i = 1) and (j = 2) then goto 410;
    end;
  i := i + 1;
  if i < 3 then goto 400;
410:
  writeln('done');
end.`,
      purpose: 'goto 在 repeat 模拟循环和 for 循环之间跳转',
      expectedContains: 'for j=1 i=0\nfor j=2 i=0\nfor j=1 i=1\nfor j=2 i=1\ndone',
    },
    {
      name: 'goto-triple-nested-mixed-blocks',
      code: `program test;
label 500, 510, 520;
var i, j, k: integer;
begin
  for i := 1 to 3 do
    begin
      j := 0;
      while j < 3 do
        begin
          j := j + 1;
          if j > 1 then
            begin
              k := 0;
              repeat
                k := k + 1;
                if (i = 2) and (j = 2) and (k = 1) then goto 500;
                if (i = 2) and (j = 2) and (k = 2) then goto 510;
              until k >= 2;
            end;
        end;
      writeln('completed i=', i);
    end;
  goto 520;
500:
  writeln('label 500');
510:
  writeln('label 510');
520:
  writeln('label 520');
end.`,
      purpose: 'for→while→if→repeat 四层嵌套，多 label 跨层 goto',
      expectedContains: 'completed i=1',
    },

    // ==========================================================================
    // 防死循环测试（使用 maxSteps）
    // ==========================================================================

    {
      name: 'goto-backward-infinite-loop-detected',
      code: `program test;
label 999;
var i: integer;
begin
  i := 0;
999:
  i := i + 1;
  goto 999;
end.`,
      purpose: '后向 goto 死循环，maxSteps 应终止',
      maxSteps: 1000,
      expectedError: 'step limit',
    },
    {
      name: 'goto-mutual-infinite-loop-detected',
      code: `program test;
label 800, 810;
begin
  goto 800;
800:
  goto 810;
810:
  goto 800;
end.`,
      purpose: '互相 goto 死循环，maxSteps 应终止',
      maxSteps: 1000,
      expectedError: 'step limit',
    },
    {
      name: 'goto-forward-skip-all-infinite',
      code: `program test;
label 700;
begin
  goto 700;
  while true do writeln('stuck');
700:
  writeln('safe');
end.`,
      purpose: '前向 goto 跳过无限 while，到达 label 安全退出',
      expectedContains: 'safe',
      maxSteps: 10000,
    },
  ]

  for (const t of tests) {
    it(t.name, async () => {
      const result = await runPascalTest(t)
      if (!result.passed) {
        console.error(`  [${t.name}] FAIL: ${result.message}`)
      }
      expect(result.passed).toBe(true)
    })
  }
})
