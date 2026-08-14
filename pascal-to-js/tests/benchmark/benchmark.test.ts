import { run as runIL } from '@/compiler/transform'
import { afterAll, assert, assertEquals, describe, test } from '../_harness.ts'

interface BenchmarkResult {
  name: string
  iterations: number
  totalTimeMs: number
  avgTimeMs: number
  minTimeMs: number
  maxTimeMs: number
  totalSteps: number
  avgSteps: number
  outputSize: number
  status: 'success' | 'error' | 'timeout'
  error?: string
}

function measureExecution(
  name: string,
  fn: () => any,
  iterations: number,
): BenchmarkResult {
  const times: number[] = []
  let totalSteps = 0
  let outputSize = 0
  let lastError: string | undefined

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    try {
      const result = fn()
      const end = performance.now()
      times.push(end - start)
      if (result?.steps !== undefined) totalSteps += result.steps
      if (result?.outputBuffer !== undefined) {
        outputSize = result.outputBuffer.join('').length
      }
    } catch (e: any) {
      lastError = e.message
      times.push(performance.now() - start)
    }
  }

  const totalTime = times.reduce((a, b) => a + b, 0)
  const status = lastError ? 'error' : 'success'

  return {
    name,
    iterations,
    totalTimeMs: totalTime,
    avgTimeMs: totalTime / iterations,
    minTimeMs: Math.min(...times),
    maxTimeMs: Math.max(...times),
    totalSteps,
    avgSteps: totalSteps / iterations,
    outputSize,
    status,
    error: lastError,
  }
}

function padRight(str: string, length: number): string {
  return str + ' '.repeat(Math.max(0, length - str.length))
}

function padLeft(str: string, length: number): string {
  return ' '.repeat(Math.max(0, length - str.length)) + str
}

function printReport(results: BenchmarkResult[]): void {
  console.log('\n========================================')
  console.log('          BENCHMARK REPORT')
  console.log('========================================')
  console.log('')
  console.log(
    padRight('Name', 40) +
      ' | ' +
      padLeft('Avg(ms)', 8) +
      ' | ' +
      padLeft('Min(ms)', 8) +
      ' | ' +
      padLeft('Max(ms)', 8) +
      ' | ' +
      padLeft('Iters', 8) +
      ' | ' +
      padLeft('AvgSteps', 10) +
      ' | ' +
      'Status',
  )
  console.log(
    '-'.repeat(40) +
      '|' +
      '-'.repeat(10) +
      '|' +
      '-'.repeat(10) +
      '|' +
      '-'.repeat(10) +
      '|' +
      '-'.repeat(10) +
      '|' +
      '-'.repeat(12) +
      '|' +
      '-'.repeat(10),
  )

  for (const r of results) {
    console.log(
      padRight(r.name, 40) +
        ' | ' +
        padLeft(r.avgTimeMs.toFixed(2), 8) +
        ' | ' +
        padLeft(r.minTimeMs.toFixed(2), 8) +
        ' | ' +
        padLeft(r.maxTimeMs.toFixed(2), 8) +
        ' | ' +
        padLeft(String(r.iterations), 8) +
        ' | ' +
        padLeft(String(Math.round(r.avgSteps)), 10) +
        ' | ' +
        r.status +
        (r.error ? ` (${r.error})` : ''),
    )
  }

  console.log('')
  console.log('========================================\n')
}

describe('Benchmark', () => {
  const results: BenchmarkResult[] = []

  afterAll(() => {
    printReport(results)
  })

  test('arithmetic-heavy loop', () => {
    const code = `program bench;
var i, x, y: integer;
begin
  x := 0;
  y := 1;
  for i := 1 to 100000 do
    begin
      x := x + i;
      y := y * 2;
      x := x - y;
    end;
  writeln('x=', x, ' y=', y);
end.`

    const r = measureExecution(
      'arithmetic-loop-100k',
      () => runIL(code, { maxSteps: 1e9 }),
      5,
    )
    results.push(r)
    assertEquals(r.status, 'success', `benchmark ${r.name} failed with status=${r.status} error=${r.error}`)
  }, 60000)

  test('array access loop', () => {
    const code = `program bench;
const N = 10000;
var arr: array[1..N] of integer;
var i, sum: integer;
begin
  for i := 1 to N do
    arr[i] := i * i;
  sum := 0;
  for i := 1 to N do
    sum := sum + arr[i];
  writeln('sum=', sum);
end.`

    const r = measureExecution(
      'array-access-10k',
      () => runIL(code, { maxSteps: 1e9 }),
      5,
    )
    results.push(r)
    assertEquals(r.status, 'success', `benchmark ${r.name} failed with status=${r.status} error=${r.error}`)
  }, 60000)

  test('string operations', () => {
    const code = `program bench;
var s: string;
var i: integer;
begin
  s := '';
  for i := 1 to 10000 do
    s := s + 'a';
  writeln('len=', length(s));
end.`

    const r = measureExecution(
      'string-concat-10k',
      () => runIL(code, { extensions: ['string'], maxSteps: 1e9 }),
      5,
    )
    results.push(r)
    assertEquals(r.status, 'success', `benchmark ${r.name} failed with status=${r.status} error=${r.error}`)
  }, 60000)

  test('nested loops', () => {
    const code = `program bench;
var i, j, k, sum: integer;
begin
  sum := 0;
  for i := 1 to 100 do
    for j := 1 to 100 do
      for k := 1 to 100 do
        sum := sum + i + j + k;
  writeln('sum=', sum);
end.`

    const r = measureExecution(
      'nested-loops-100x100x100',
      () => runIL(code, { maxSteps: 1e9 }),
      3,
    )
    results.push(r)
    assertEquals(r.status, 'success', `benchmark ${r.name} failed with status=${r.status} error=${r.error}`)
  }, 60000)

  test('goto backward loop', () => {
    const code = `program bench;
label 10;
var i, sum: integer;
begin
  i := 0;
  sum := 0;
10:
  i := i + 1;
  sum := sum + i;
  if i < 100000 then goto 10;
  writeln('sum=', sum);
end.`

    const r = measureExecution(
      'goto-backward-100k',
      () => runIL(code, { maxSteps: 1e9 }),
      5,
    )
    results.push(r)
    assertEquals(r.status, 'success', `benchmark ${r.name} failed with status=${r.status} error=${r.error}`)
  }, 60000)

  test('procedure calls', () => {
    const code = `program bench;
var sum: integer;

procedure add(var x: integer; n: integer);
begin
  x := x + n;
end;

begin
  sum := 0;
  add(sum, 1);
  add(sum, 2);
  add(sum, 4);
  add(sum, 8);
  writeln('sum=', sum);
end.`

    const r = measureExecution(
      'procedure-calls-4',
      () => runIL(code, { maxSteps: 1e9 }),
      10,
    )
    results.push(r)
    assertEquals(r.status, 'success', `benchmark ${r.name} failed with status=${r.status} error=${r.error}`)
  }, 60000)

  test('record operations', () => {
    const code = `program bench;
type
  Point = record
    x, y: integer;
  end;

var p: Point;
var i: integer;
begin
  for i := 1 to 100000 do
    begin
      p.x := i;
      p.y := i * 2;
    end;
  writeln('p.x=', p.x, ' p.y=', p.y);
end.`

    const r = measureExecution(
      'record-access-100k',
      () => runIL(code, { maxSteps: 1e9 }),
      5,
    )
    results.push(r)
    assertEquals(r.status, 'success', `benchmark ${r.name} failed with status=${r.status} error=${r.error}`)
  }, 60000)
})
