/**
 * Pascal-H 插件测试（正反测试，AGENTS.md 原则 A.9）。
 *
 * 正测试：启用 pascalHPlugin，验证 break/break_in/breakin/erstat 功能正常。
 * 反测试：默认配置下（未启用插件），验证这些非标特性报错。
 *
 * ISO 7185 章节引用：6.9.8.2（标准过程列表）
 */
import { describe, test, expect } from 'vitest'
import { run } from '@/il/transform'
import { pascalHPlugin } from '@/il/plugins/pascal-h.plugin'

describe('Pascal-H 插件（正测试：启用 pascalHPlugin）', () => {
  test('break 过程可编译并执行（空操作）', () => {
    const state = run(
      `PROGRAM P; BEGIN WRITELN('before'); BREAK; WRITELN('after'); END.`,
      { plugins: [pascalHPlugin], maxSteps: 1e5 }
    )
    expect(state.status).toBe('terminated')
    expect(state.outputBuffer.join('')).toBe('before\nafter\n')
  })

  test('break_in 过程可编译并执行', () => {
    const state = run(
      `PROGRAM P; BEGIN BREAK_IN; WRITELN('ok'); END.`,
      { plugins: [pascalHPlugin], maxSteps: 1e5 }
    )
    expect(state.status).toBe('terminated')
    expect(state.outputBuffer.join('')).toBe('ok\n')
  })

  test('breakin 过程（TANGLE 去除下划线后）可编译并执行', () => {
    const state = run(
      `PROGRAM P; BEGIN BREAKIN; WRITELN('ok'); END.`,
      { plugins: [pascalHPlugin], maxSteps: 1e5 }
    )
    expect(state.status).toBe('terminated')
    expect(state.outputBuffer.join('')).toBe('ok\n')
  })

  test('erstat 函数返回 0（文件未打开错误）', () => {
    // erstat(f) 用于检查文件打开状态，模拟环境返回 0（成功）
    const state = run(
      `PROGRAM P; VAR F: FILE OF CHAR; BEGIN RESET(F); IF ERSTAT(F)=0 THEN WRITELN('ok') ELSE WRITELN('fail'); END.`,
      { plugins: [pascalHPlugin], maxSteps: 1e5 }
    )
    expect(state.status).toBe('terminated')
    expect(state.outputBuffer.join('')).toBe('ok\n')
  })

  test('erstat 在表达式中使用（TeX 典型用法）', () => {
    const state = run(
      `PROGRAM P; VAR F: FILE OF CHAR; B: BOOLEAN; BEGIN RESET(F); B := ERSTAT(F)=0; IF B THEN WRITELN('opened') ELSE WRITELN('failed'); END.`,
      { plugins: [pascalHPlugin], maxSteps: 1e5 }
    )
    expect(state.status).toBe('terminated')
    expect(state.outputBuffer.join('')).toBe('opened\n')
  })
})

describe('Pascal-H 插件（反测试：默认配置下报错）', () => {
  test('break 过程默认报错（ISO 7185 6.9.8.2 未列出）', () => {
    const state = run(
      `PROGRAM P; BEGIN BREAK; END.`,
      { maxSteps: 1e5 }
    )
    expect(state.status).toBe('error')
    expect(state.error?.message).toContain('unknown procedure')
  })

  test('break_in 过程默认报错', () => {
    const state = run(
      `PROGRAM P; BEGIN BREAK_IN; END.`,
      { maxSteps: 1e5 }
    )
    expect(state.status).toBe('error')
    expect(state.error?.message).toContain('unknown procedure')
  })

  test('breakin 过程默认报错', () => {
    const state = run(
      `PROGRAM P; BEGIN BREAKIN; END.`,
      { maxSteps: 1e5 }
    )
    expect(state.status).toBe('error')
    expect(state.error?.message).toContain('unknown procedure')
  })

  test('erstat 函数默认报错（ISO 7185 6.9.8.2 未列出）', () => {
    const state = run(
      `PROGRAM P; VAR F: FILE OF CHAR; BEGIN RESET(F); IF ERSTAT(F)=0 THEN WRITELN('ok'); END.`,
      { maxSteps: 1e5 }
    )
    expect(state.status).toBe('error')
    expect(state.error?.message).toContain('unknown function')
  })
})
