/**
 * E2E 测试运行器入口。
 *
 * 用法：
 *   npm run e2e              # 运行所有阶段
 *   npm run e2e -- --list    # 列出所有阶段
 *
 * 流水线模式：
 *   阶段按顺序执行，每阶段复用上一阶段结果。
 *   某阶段失败后，后续依赖阶段自动跳过（标记 skipped）。
 *
 * 输出：
 *   - 控制台实时显示进度（带时间戳和耗时）
 *   - 测试报告写入 reports/{timestamp-id}/overview.json
 *   - HTML 报告写入 reports/index.html（顶级导航）和 reports/{id}/index.html（详情）
 *   - 保留所有历史测试文件夹
 */
import { parseArgs, runE2E, listStages } from './stages'

async function main() {
  const args = process.argv.slice(2)
  const opts = parseArgs(args)

  if (opts.list) {
    listStages()
    return
  }

  await runE2E()
}

main().catch((e) => {
  console.error('E2E 测试运行失败:', e)
  process.exit(1)
})
