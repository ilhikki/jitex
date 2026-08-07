/**
 * tie — 合并多个 WEB change file 到一个最终 web 文件。
 *
 * 模仿 web2c 的 `tie -m` 行为：以 master web 为基础，按顺序应用一串 change file，
 * 输出合并后的最终 web（直接交给 TANGLE，不再需要 change file）。
 *
 * change file 格式（WEB 标准）：
 *   @x                —— 开始一个 change 块，后续到 @y 之前的行是"待查找的旧代码"
 *   @y                —— 旧代码结束，后续到 @z 之前的行是"替换的新代码"
 *   @z                —— 结束当前 change 块
 *
 *   非 @x/@y/@z 开头的行（在 @x 之前或在 @y/@z 之间但不在块内）被视为注释，跳过。
 *
 * 查找算法：单调向前查找。
 *   - 每个 change file 独立处理，从前一个 change file 结束的位置继续。
 *   - 一个 change file 内的多个 @x 块按顺序应用，每个块从前一块匹配位置之后开始查找。
 *   - 待查找的旧行在 web 中必须连续精确匹配（行内容字节级一致，不含行尾符）。
 *
 * 参考：web2c/tie.w（Nelson H. F. Beebe 的实现）。
 */

/** tie 应用过程中的诊断信息 */
export interface TieLog {
  level: 'info' | 'warn' | 'error'
  message: string
}

export interface TieResult {
  /** 合并后的最终 web 内容 */
  web: string
  /** 诊断日志 */
  logs: TieLog[]
}

/** 单个 change 块 */
interface ChangeBlock {
  /** @x 后的旧行（不含 @x/@y 行本身） */
  oldLines: string[]
  /** @y 后的新行（不含 @y/@z 行本身） */
  newLines: string[]
}

/**
 * 解析 change file，提取所有 @x/@y/@z 块。
 * 非 @x 开头的行（注释）被跳过。
 */
function parseChangeFile(content: string, filename: string, logs: TieLog[]): ChangeBlock[] {
  // 统一行尾：保留 \n 内部表示，行内容不含行尾符
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const blocks: ChangeBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // @x 开头（可能后面跟注释，如 "@x [1.2] l.30 - banner"）
    if (line.startsWith('@x')) {
      const oldLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('@y')) {
        oldLines.push(lines[i])
        i++
      }
      if (i >= lines.length) {
        logs.push({ level: 'error', message: `${filename}: @x 块未找到 @y（文件结束）` })
        break
      }
      // 跳过 @y 行
      i++
      const newLines: string[] = []
      while (i < lines.length && !lines[i].startsWith('@z')) {
        newLines.push(lines[i])
        i++
      }
      if (i >= lines.length) {
        logs.push({ level: 'error', message: `${filename}: @y 块未找到 @z（文件结束）` })
        break
      }
      // 跳过 @z 行
      i++
      blocks.push({ oldLines, newLines })
    } else {
      // 注释行，跳过
      i++
    }
  }
  logs.push({ level: 'info', message: `${filename}: 解析出 ${blocks.length} 个 change 块` })
  return blocks
}

/**
 * 在 web 行列表中从 startPos 开始查找 oldLines 的连续匹配位置。
 * 返回匹配的起始行索引，未找到返回 -1。
 */
function findMatch(webLines: string[], oldLines: string[], startPos: number): number {
  if (oldLines.length === 0) return -1
  const needle = oldLines[0]
  for (let i = startPos; i <= webLines.length - oldLines.length; i++) {
    if (webLines[i] !== needle) continue
    let match = true
    for (let j = 1; j < oldLines.length; j++) {
      if (webLines[i + j] !== oldLines[j]) {
        match = false
        break
      }
    }
    if (match) return i
  }
  return -1
}

/**
 * 合并 master web 与多个 change file，输出最终 web。
 *
 * 查找规则：
 *   - **每个 change file 独立**：从头开始查找（不从前一个 ch 的结束位置继续）。
 *     因为不同 ch 引用的行号可能跨越整个 web（一个 ch 改 web 头，下一个 ch 改 web 尾，
 *     再下一个 ch 又改 web 头）。这与 web2c tie 的实际行为一致。
 *   - **单个 change file 内部**：按 @x 块顺序单调向前查找（前一个块匹配位置之后），
 *     与 TANGLE 处理 change file 的方式一致。
 *
 * @param masterWeb  master web 内容
 * @param changes    [{ filename, content }] 按应用顺序排列
 * @returns          合并后的 web 内容 + 诊断日志
 */
export function tie(masterWeb: string, changes: { filename: string; content: string }[]): TieResult {
  const logs: TieLog[] = []
  // 统一行尾：保留 \n 内部表示
  const normalizedMaster = masterWeb.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  // 注意：split('\n') 会在末尾产生一个空串（如果文件以 \n 结尾）。
  // 保留它，最后 join 时还原。
  const webLines = normalizedMaster.split('\n')

  for (const { filename, content } of changes) {
    const blocks = parseChangeFile(content, filename, logs)
    // 每个 ch 独立从头查找
    let startPos = 0
    for (let bi = 0; bi < blocks.length; bi++) {
      const block = blocks[bi]
      if (block.oldLines.length === 0) {
        logs.push({
          level: 'warn',
          message: `${filename}: 块 ${bi + 1} 的 @x 段为空，跳过`,
        })
        continue
      }
      const idx = findMatch(webLines, block.oldLines, startPos)
      if (idx < 0) {
        logs.push({
          level: 'error',
          message: `${filename}: 块 ${bi + 1} 未找到匹配（从行 ${startPos + 1} 起查找，旧代码首行: ${JSON.stringify(block.oldLines[0]).slice(0, 80)}）`,
        })
        // tie 在不匹配时中止（与原版 tie 行为一致）
        return { web: webLines.join('\n'), logs }
      }
      // 替换：删除 oldLines.length 行，插入 newLines
      webLines.splice(idx, block.oldLines.length, ...block.newLines)
      startPos = idx + block.newLines.length
      logs.push({
        level: 'info',
        message: `${filename}: 块 ${bi + 1} 匹配成功（web 行 ${idx + 1}-${idx + block.oldLines.length} → ${block.newLines.length} 行）`,
      })
    }
  }

  return { web: webLines.join('\n'), logs }
}
