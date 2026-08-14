import { describe } from './_helper.ts'
import { type PascalTest, runPascalTests } from './_helper'

// 复现 tangle-official.pas DEBUGHELP 中 GOTO 888 的作用域问题
// 关键结构：GOTO 888 和 888: 在同一个 CompoundStatement 中
// 但该 CompoundStatement 是 IF 的 then 分支（非透明块内部）

describe('Phase 4: Goto Scope Repro (tangle DEBUGHELP)', () => {
  const tests: PascalTest[] = [
    {
      // 最小复现：GOTO 和 label 在同一 CompoundStatement，CompoundStatement 在 IF then 中
      name: 'goto and label in same compound inside if-then',
      code: `program test;
label 888;
var ddt: integer;
begin
  ddt := 0;
  if ddt = 0 then begin
    goto 888;
    888: ddt := 1;
  end;
  writeln('done', ddt);
end.`,
      purpose:
        'GOTO 888 和 888: 在同一个 BEGIN..END (CompoundStatement) 中，该 compound 在 IF then 分支内。ISO 6.8.1 b) 允许同一 statement-sequence 中的 goto',
      expectedContains: 'done1',
    },
    {
      // 最小复现：outer if 的 else 是 inner if，inner if 的 then 是含 goto+label 的 compound
      name: 'goto and label in compound inside nested if-else (no while)',
      code: `program test;
label 888;
var ddt: integer;
begin
  ddt := 0;
  if ddt < 0 then ddt := -1
  else if ddt = 0 then begin
    goto 888;
    888: ddt := 1;
  end;
  writeln('done', ddt);
end.`,
      purpose:
        '外层 IF 的 ELSE 是另一个 IF (嵌套 IF)，内层 IF 的 THEN 是含 GOTO 和 label 的 CompoundStatement。验证 collectLabelsFromNonTransparentBlock 是否能递归处理嵌套 IF',
      expectedContains: 'done1',
    },
    {
      // tangle DEBUGHELP 的实际结构（简化）
      name: 'tangle DEBUGHELP structure',
      code: `program test;
label 888, 10;
var ddt, k: integer;
begin
  ddt := 0;
  while true do begin
    if ddt < 0 then goto 10
    else if ddt = 0 then begin
      goto 888;
      888: ddt := 1;
    end else begin
      k := 1;
    end;
    goto 10;
  end;
  10: writeln('done', ddt);
end.`,
      purpose: 'tangle DEBUGHELP 中 GOTO 888 跳到同一 CompoundStatement 内的 label',
      expectedContains: 'done1',
    },
  ]
  runPascalTests(tests)
})
