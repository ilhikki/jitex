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
  createState,
  createInterpreterState,
  runToCompletion,
  run,
  State,
  PascalFile,
  setRecordFileContent,
  getRecordFileLines,
  createRecordFileOps,
  createRecordFileHandle,
  populateSystemProcedures,
  populateSystemFunctions,
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

    const webContent = fs.readFileSync(tangleWebPath, 'utf-8')
    const webBytes = new TextEncoder().encode(webContent)

    const fileOps = createRecordFileOps()
    setRecordFileContent('web', webBytes)
    setRecordFileContent('change', new Uint8Array(0))
    setRecordFileContent('termin', new Uint8Array(0))

    const io = { file: fileOps, console: { write() {}, writeln() {}, read() { return '' }, readln() { return '' }, eof() { return true }, eoln() { return true } } }
    const state = createState(result.astNode, io)
    populateSystemProcedures(state)
    populateSystemFunctions(state)

    // WEBFILE
    const webFileValue = state.globalScope.variables.get('WEBFILE')
    expect(webFileValue).toBeDefined()
    if (!webFileValue) return
    const webFile = webFileValue.rawValue as PascalFile
    webFile.url = 'web'
    state.io.file.reset(webFile)

    // CHANGEFILE
    const changeFileValue = state.globalScope.variables.get('CHANGEFILE')
    expect(changeFileValue).toBeDefined()
    if (!changeFileValue) return
    const changeFile = changeFileValue.rawValue as PascalFile
    changeFile.url = 'change'
    state.io.file.reset(changeFile)

    // TERMIN
    const terminValue = state.globalScope.variables.get('TERMIN')
    if (terminValue) {
      const termin = terminValue.rawValue as PascalFile
      termin.url = 'termin'
      state.io.file.reset(termin)
    }

    // TERMOUT
    const termoutValue = state.globalScope.variables.get('TERMOUT')
    if (termoutValue) {
      const termout = termoutValue.rawValue as PascalFile
      termout.url = 'termout'
      state.io.file.rewrite(termout)
    }

    // PASCALFILE
    const pasFileValue = state.globalScope.variables.get('PASCALFILE')
    expect(pasFileValue).toBeDefined()
    if (!pasFileValue) return
    const pasFile = pasFileValue.rawValue as PascalFile
    pasFile.url = 'pas'
    state.io.file.rewrite(pasFile)

    // POOL
    const poolValue = state.globalScope.variables.get('POOL')
    expect(poolValue).toBeDefined()
    if (!poolValue) return
    const pool = poolValue.rawValue as PascalFile
    pool.url = 'pool'
    state.io.file.rewrite(pool)

    runToCompletion(state)
    expect(state.status).toBe('terminated')

    const pasOutput = getRecordFileLines('pas').join('\n')
    expect(pasOutput.length).toBeGreaterThan(0)

    if (pasOutput.length > 0) {
      fs.writeFileSync(tempOutputPath, pasOutput, 'utf-8')

      const outputResult = parse(pasOutput)
      expect(outputResult.success).toBe(true)

      if (outputResult.success) {
        const outputProgram = outputResult.astNode as ProgramNode
        expect(outputProgram.kind).toBe('Program')
        expect(outputProgram.block.compound.statements.length).toBeGreaterThan(0)

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
