/**
 * Pascal-H 插件测试（正反测试，AGENTS.md 原则 A.9）。
 *
 * 正测试：启用 pascalHPlugin，验证 break/break_in/breakin/erstat 功能正常。
 * 反测试：默认配置下（未启用插件），验证这些非标特性报错。
 *
 * ISO 7185 章节引用：6.9.8.2（标准过程列表）
 */
import { describe, test, assert, assertEquals } from './_helper'
import { run } from '@/compiler/transform'
import { pascalHPlugin } from '@/compiler/plugins/pascal-h.plugin'

type Status = 'pending' | 'running' | 'terminated' | 'error'

function ok(state: { status: string; outputBuffer: string[] }, expectedOutput: string, label: string) {
  assertEquals(
    state.status,
    'terminated' as Status,
    `${label}: expected status=terminated, got ${state.status}, error=${(state as any).error?.message}`,
  )
  assertEquals(
    state.outputBuffer.join(''),
    expectedOutput,
    `${label}: output mismatch.\n  expected: ${JSON.stringify(expectedOutput)}\n  actual:   ${JSON.stringify(state.outputBuffer.join(''))}`,
  )
}

function err(state: { status: string; error: { message: string } | null }, mustContain: string, label: string) {
  assertEquals(state.status, 'error' as Status, `${label}: expected status=error, got ${state.status}`)
  const msg = state.error?.message ?? ''
  assert(
    msg.includes(mustContain),
    `${label}: expected error to contain "${mustContain}", got: ${msg}`,
  )
}

describe('Pascal-H 插件（正测试：启用 pascalHPlugin）', () => {
  test('break 过程可编译并执行（空操作）', () => {
    const state = run(
      `PROGRAM P; BEGIN WRITELN('before'); BREAK; WRITELN('after'); END.`,
      { plugins: [pascalHPlugin], maxSteps: 1e5 },
    )
    ok(state, 'before\nafter\n', 'break')
  })

  test('break_in 过程可编译并执行', () => {
    const state = run(
      `PROGRAM P; BEGIN BREAK_IN; WRITELN('ok'); END.`,
      { plugins: [pascalHPlugin], maxSteps: 1e5 },
    )
    ok(state, 'ok\n', 'break_in')
  })

  test('breakin 过程（TANGLE 去除下划线后）可编译并执行', () => {
    const state = run(
      `PROGRAM P; BEGIN BREAKIN; WRITELN('ok'); END.`,
      { plugins: [pascalHPlugin], maxSteps: 1e5 },
    )
    ok(state, 'ok\n', 'breakin')
  })

  test('erstat 函数返回 0（文件未打开错误）', () => {
    const state = run(
      `PROGRAM P; VAR F: FILE OF CHAR; BEGIN RESET(F); IF ERSTAT(F)=0 THEN WRITELN('ok') ELSE WRITELN('fail'); END.`,
      { plugins: [pascalHPlugin], maxSteps: 1e5 },
    )
    ok(state, 'ok\n', 'erstat basic')
  })

  test('erstat 在表达式中使用（TeX 典型用法）', () => {
    const state = run(
      `PROGRAM P; VAR F: FILE OF CHAR; B: BOOLEAN; BEGIN RESET(F); B := ERSTAT(F)=0; IF B THEN WRITELN('opened') ELSE WRITELN('failed'); END.`,
      { plugins: [pascalHPlugin], maxSteps: 1e5 },
    )
    ok(state, 'opened\n', 'erstat expr')
  })
})

describe('Pascal-H 插件（反测试：默认配置下报错）', () => {
  test('break 过程默认报错（ISO 7185 6.9.8.2 未列出）', () => {
    err(
      run(`PROGRAM P; BEGIN BREAK; END.`, { maxSteps: 1e5 }),
      'unknown procedure',
      'break (neg)',
    )
  })

  test('break_in 过程默认报错', () => {
    err(
      run(`PROGRAM P; BEGIN BREAK_IN; END.`, { maxSteps: 1e5 }),
      'unknown procedure',
      'break_in (neg)',
    )
  })

  test('breakin 过程默认报错', () => {
    err(
      run(`PROGRAM P; BEGIN BREAKIN; END.`, { maxSteps: 1e5 }),
      'unknown procedure',
      'breakin (neg)',
    )
  })

  test('erstat 函数默认报错（ISO 7185 6.9.8.2 未列出）', () => {
    err(
      run(
        `PROGRAM P; VAR F: FILE OF CHAR; BEGIN RESET(F); IF ERSTAT(F)=0 THEN WRITELN('ok'); END.`,
        { maxSteps: 1e5 },
      ),
      'unknown function',
      'erstat (neg)',
    )
  })
})
