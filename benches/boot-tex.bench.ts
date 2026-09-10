// boot-tex syscall 内联开关的 A/B 基准（黑盒）。
//
// 负载：完整 boot-tex 流水线（TANGLE 自举 + TeX TRIP）。
// 只通过 createBootTexSuite({ inlineSyscalls }) 调节「是否内联」，
// 不复制 boot-tex 内部逻辑；耗时取自 runner 记录的 RunReport（即各阶段日志里的时间）。
//
// 运行：deno bench -A benches/boot-tex.bench.ts
//
// inlineSyscalls 取值：
//   undefined / false → 全部走 __sys dispatcher（基线）
//   true              → 内联所有已实现内联规则的 syscall
//   string[]          → 只内联列出的 key（逐个评测）

import { run, type RunReport } from '@jitex/integration'
import { createBootTexSuite } from '../boot-tex/src/tex/boot-tex.ts'

function printStageTimings(label: string, report: RunReport): void {
  console.log(`\n===== ${label} =====`)
  console.log(`total = ${report.duration} ms  (${report.success ? 'SUCCESS' : 'FAIL'})`)
  for (const s of report.stages) {
    console.log(`  #${s.id} ${s.title} = ${s.duration} ms`)
  }
}

async function runBootTex(label: string, inlineSyscalls?: boolean | string[]): Promise<void> {
  const report = await run(createBootTexSuite({ inlineSyscalls }), {
    reportDir: './reports/bench',
    runId: label,
    noReport: true,
    log: () => {},
  })
  printStageTimings(label, report)
}

Deno.bench(
  { name: 'boot-tex / inline off', warmup: 0, n: 1 },
  async () => {
    await runBootTex('inline-off')
  },
)

Deno.bench(
  { name: 'boot-tex / inline on', warmup: 0, n: 1 },
  async () => {
    await runBootTex('inline-on', true)
  },
)
