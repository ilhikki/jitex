import { parse } from '../../src/index'
import {
  createState,
  runToCompletion,
  populateSystemProcedures,
  populateSystemFunctions,
  State,
} from '../../src/interpreter'

export interface InterpreterTest {
  name: string
  code: string
  purpose: string
  features: string[]
  expectedOutput?: string
  expectedContains?: string
  expectedNotContains?: string
  expectedError?: boolean
}

export function runPas(code: string): { output: string; error: string | null } {
  const parseResult = parse(code)
  if (!parseResult.success) {
    return { output: '', error: parseResult.error || 'parse failed' }
  }
  let output = ''
  let error: string | null = null
  const io = {
    file: { read: () => '', write: () => {}, readln: () => '', writeln: () => {}, reset: () => {}, rewrite: () => {}, close: () => {}, assign: () => {}, eof: () => true, eoln: () => true },
    console: {
      write: (text: string) => { output += text },
      writeln: () => { output += '\n' },
      read: () => '',
      readln: () => '',
      eof: () => true,
      eoln: () => true,
    },
  }
  let state: State
  try {
    state = createState(parseResult.astNode, io as any)
    populateSystemProcedures(state)
    populateSystemFunctions(state)
    runToCompletion(state)
  } catch (e: any) {
    error = e.message || String(e)
  }
  return { output, error }
}

export function runPasWithInput(inputLines: string[], code: string): { output: string; error: string | null } {
  const parseResult = parse(code)
  if (!parseResult.success) {
    return { output: '', error: parseResult.error || 'parse failed' }
  }
  let output = ''
  let error: string | null = null
  let inputIdx = 0
  const io = {
    file: { read: () => '', write: () => {}, readln: () => '', writeln: () => {}, reset: () => {}, rewrite: () => {}, close: () => {}, assign: () => {}, eof: () => true, eoln: () => true },
    console: {
      write: (text: string) => { output += text },
      writeln: () => { output += '\n' },
      read: () => { return inputLines[inputIdx++] || '' },
      readln: () => { return inputLines[inputIdx++] || '' },
      eof: () => inputIdx >= inputLines.length,
      eoln: () => true,
    },
  }
  let state: State
  try {
    state = createState(parseResult.astNode, io as any)
    populateSystemProcedures(state)
    populateSystemFunctions(state)
    runToCompletion(state)
  } catch (e: any) {
    error = e.message || String(e)
  }
  return { output, error }
}

export function runInterpreterTest(t: InterpreterTest) {
  const { output, error } = runPas(t.code)
  
  if (t.expectedError) {
    expect(error).not.toBeNull()
    return
  }
  
  expect(error).toBeNull()
  
  if (t.expectedOutput !== undefined) {
    expect(output).toBe(t.expectedOutput)
  }
  if (t.expectedContains !== undefined) {
    expect(output).toContain(t.expectedContains)
  }
  if (t.expectedNotContains !== undefined) {
    expect(output).not.toContain(t.expectedNotContains)
  }
}
