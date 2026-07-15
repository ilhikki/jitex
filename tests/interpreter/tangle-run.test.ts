/**
 * 端到端测试：运行 TANGLE 程序，将 tangle.web 编译成 tangle.pas，
 * 并验证输出的 tangle.pas 也可以被解析和执行。
 *
 * 注意：此测试依赖的 Pascal 特性（文件缓冲区变量 F^、大数组等）
 * 可能尚未在解释器中完整实现，预期部分步骤会失败。
 */
import * as fs from 'fs'
import * as path from 'path'
import { parse, ProgramNode } from '../../src/index'
import {
  createInterpreterState,
  runToCompletion,
  run,
  State,
  PascalFile,
  fileReset,
  fileRewrite,
} from '../../src/interpreter'

describe('Tangle bootstrapping: compile tangle.web -> tangle.pas', () => {
  const tanglePasPath = path.join(__dirname, '..', '..', 'knuth', 'web', 'tangle-official.pas')
  const tangleWebPath = path.join(__dirname, '..', '..', 'knuth', 'web', 'tangle.web')
  const tempOutputPath = path.join(__dirname, '..', '..', 'tests', 'resources', 'tangle-output.pas')

  test('parse and run tangle pas', () => {
    const pasSource = fs.readFileSync(tanglePasPath, 'utf-8')
    const result = parse(pasSource)
    expect(result.success).toBe(true)
    if (!result.success) return

    const state = createInterpreterState(result.astNode)

    // 预填充 WEBFILE：将 tangle.web 的内容按行存入文件的 lines
    const webContent = fs.readFileSync(tangleWebPath, 'utf-8')
    const webLines = webContent.split('\n')

    const webFileValue = state.globalScope.variables.get('WEBFILE')
    expect(webFileValue).toBeDefined()
    if (!webFileValue) return
    const webFile = webFileValue.rawValue as PascalFile
    webFile.lines = webLines
    webFile.writable = false
    fileReset(webFile)

    // CHANGEFILE：空文件（无变更文件）
    const changeFileValue = state.globalScope.variables.get('CHANGEFILE')
    expect(changeFileValue).toBeDefined()
    if (!changeFileValue) return
    const changeFile = changeFileValue.rawValue as PascalFile
    changeFile.lines = []
    fileReset(changeFile)

    // TERMIN：空终端输入
    const terminValue = state.globalScope.variables.get('TERMIN')
    if (terminValue) {
      const termin = terminValue.rawValue as PascalFile
      termin.lines = []
      fileReset(termin)
    }

    // TERMOUT：终端输出
    const termoutValue = state.globalScope.variables.get('TERMOUT')
    if (termoutValue) {
      const termout = termoutValue.rawValue as PascalFile
      fileRewrite(termout)
    }

    // PASCALFILE：输出文件，初始化为可写
    const pasFileValue = state.globalScope.variables.get('PASCALFILE')
    expect(pasFileValue).toBeDefined()
    if (!pasFileValue) return
    const pasFile = pasFileValue.rawValue as PascalFile
    fileRewrite(pasFile)

    // POOL：字符串池文件，初始化为可写
    const poolValue = state.globalScope.variables.get('POOL')
    expect(poolValue).toBeDefined()
    if (!poolValue) return
    const pool = poolValue.rawValue as PascalFile
    fileRewrite(pool)

    // 运行到终止
    runToCompletion(state)
    expect(state.status).toBe('terminated')

    // 收集 PASCALFILE 的输出内容
    const pasOutput = pasFile.lines.join('\n')
    expect(pasOutput.length).toBeGreaterThan(0)

    // 如果输出不为空，写入临时文件并验证解析
    if (pasOutput.length > 0) {
      fs.writeFileSync(tempOutputPath, pasOutput, 'utf-8')

      // 验证输出可以被解析为有效的 Pascal 程序
      const outputResult = parse(pasOutput)
      expect(outputResult.success).toBe(true)

      if (outputResult.success) {
        const outputProgram = outputResult.astNode as ProgramNode
        expect(outputProgram.kind).toBe('Program')
        expect(outputProgram.block.compound.statements.length).toBeGreaterThan(0)

        // 尝试执行输出的 Pascal 程序
        const outputState = createInterpreterState(outputResult.astNode)
        runToCompletion(outputState)
        expect(outputState.status).toBe('terminated')
      }
    }
  })

  afterAll(() => {
    if (fs.existsSync(tempOutputPath)) {
      fs.unlinkSync(tempOutputPath)
    }
  })
})
