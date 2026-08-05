/**
 * E2E 测试运行器入口。
 *
 * 用法：
 *   npm run e2e                  # 运行所有阶段
 *   npm run e2e -- --stage=10    # 只运行阶段 10
 *   npm run e2e -- --report      # 运行后打开 HTML 报告
 *   npm run e2e -- --list        # 列出所有阶段
 *   npm run e2e -- --fresh       # 禁用流水线复用（每阶段独立运行）
 *
 * 命令参数：
 *   --stage=N      只运行指定阶段（可用逗号分隔多个，如 --stage=1,3,5）
 *   --list         列出所有阶段后退出
 *   --report       运行后用默认浏览器打开 HTML 报告
 *   --fresh        禁用流水线复用
 *
 * 流水线模式（默认）：
 *   阶段按顺序执行，每阶段复用上一阶段结果。
 *   某阶段失败后，后续依赖阶段自动跳过（标记 skipped）。
 *
 * 输出：
 *   - 控制台实时显示进度（带时间戳和耗时）
 *   - 测试报告写入 reports/{timestamp-id}/overview.json
 *   - HTML 报告写入 reports/index.html（顶级导航）和 reports/{id}/index.html（详情）
 *   - 保留所有历史测试文件夹
 */
import { parseArgs, runE2E, listStages, openReport } from './stages'

async function main() {
  const args = process.argv.slice(2)
  const opts = parseArgs(args)

  if (opts.list) {
    listStages()
    return
  }

  await runE2E(opts)

  if (opts.report) {
    openReport()
  }
}

main().catch((e) => {
  console.error('E2E 测试运行失败:', e)
  process.exit(1)
})
