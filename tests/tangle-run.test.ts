import * as fs from 'fs'
import * as path from 'path'
import { parse } from '../src/index'
import { StaticAnalyzer } from '../src/static-analyzer'
import { runVM } from '../src/vm'

describe('Tangle Official - VM run', () => {
  const pasFile = path.join(__dirname, '..', 'knuth', 'web', 'tangle-official.pas')
  const source = fs.readFileSync(pasFile, 'utf-8')

  test('parse succeeds', () => {
    const result = parse(source)
    if (!result.success) {
      console.error('Parse error:', result.error, 'at position', result.position)
    }
    expect(result.success).toBe(true)
  })

  test('analyze (compile to JsonCode) succeeds', () => {
    const result = parse(source)
    expect(result.success).toBe(true)
    if (!result.success) return

    const analyzer = new StaticAnalyzer([])
    let jsonCode: any
    expect(() => {
      jsonCode = analyzer.analyze(result.astNode as any)
    }).not.toThrow()
    if (!jsonCode) return

    // 基本结构检查
    expect(jsonCode.version).toBe('1.0.0')
    expect(jsonCode.entry).toBe('MAIN')
    expect(jsonCode.procedures.length).toBeGreaterThan(10)
    expect(jsonCode.typeTable.length).toBeGreaterThan(20)

    console.log('Tangle compiled OK:')
    console.log('  procedures:', jsonCode.procedures.length)
    console.log('  types:', jsonCode.typeTable.length)
    console.log('  main body instructions:', jsonCode.procedures[jsonCode.procedures.length - 1].body.length)
  })

  test('run VM (expect early termination or error, not crash)', async () => {
    const result = parse(source)
    expect(result.success).toBe(true)
    if (!result.success) return

    // TANGLE 需要 WEBFILE/CHANGEFILE 输入，VM 没有真实文件 IO
    // 预期：VM 会因为缺少输入或文件操作而终止，但不应抛出未捕获异常
    let state: any
    try {
      state = await runVM(source, { input: [] })
    } catch (e: any) {
      // 编译期错误直接抛出是可以接受的（记录下来）
      console.log('VM threw (compile-time):', e.message)
      return
    }

    console.log('VM final status:', state.status)
    if (state.error) {
      console.log('VM error:', state.error.message)
    }
    console.log('VM output (first 500 chars):', state.outputBuffer.join('').slice(0, 500))

    // 程序应该终止（terminated/error），不应该卡死
    expect(['terminated', 'error']).toContain(state.status)
  }, 30000)
})
