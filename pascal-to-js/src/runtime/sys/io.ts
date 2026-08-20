import type { PascalArray, RuntimeContext, SyscallHandler } from '../runtime-type.ts'
import { formatField, formatReal } from '../runtime-util.ts'

const TRUE_STR = 'TRUE'
const FALSE_STR = 'FALSE'

export function ioSyscalls(): Record<string, SyscallHandler> {
  return {
    // ---------- io.write（无文件）----------
    'io.write.i64': (ctx, [value]) => {
      ctx.outputBuffer.push(String(value))
    },
    'io.write.f64': (ctx, [value]) => {
      ctx.outputBuffer.push(formatReal(value as number))
    },
    'io.write.bool': (ctx, [value]) => {
      ctx.outputBuffer.push(value ? TRUE_STR : FALSE_STR)
    },
    'io.write.char': (ctx, [value]) => {
      ctx.outputBuffer.push(value as string)
    },
    'io.write.str': (ctx, [value]) => {
      ctx.outputBuffer.push((value as PascalArray).value.array.join(''))
    },
    // ---------- io.writeln ----------
    'io.writeln.eol': (ctx) => {
      ctx.outputBuffer.push('\n')
    },
    // ---------- io.read（无文件，从 inputQueue）----------
    'io.read.i64': (ctx) => readInt(ctx),
    'io.read.f64': (ctx) => readReal(ctx),
    'io.read.bool': (ctx) => readBool(ctx),
    'io.read.char': (ctx) => readChar(ctx),
    'io.read.str': (ctx) => readStr(ctx),
    // ---------- io.eof / eoln / break ----------
    'io.eof': (ctx) => isInputEof(ctx),
    'io.eoln': (ctx) => isInputEndOfLine(ctx),
    'io.break': () => undefined,

    // 无文件：[value, width, precision?]
    'io.write.i64.fmt': (ctx, [value, width]) => {
      ctx.outputBuffer.push(formatField(String(value), width as number))
    },
    'io.write.f64.fmt': (ctx, [value, width, precision]) => {
      const formatted = precision !== undefined
        ? (value as number).toFixed(precision as number)
        : formatReal(value as number)
      ctx.outputBuffer.push(formatField(formatted, width as number))
    },
    'io.write.bool.fmt': (ctx, [value, width]) => {
      ctx.outputBuffer.push(formatField(value ? TRUE_STR : FALSE_STR, width as number))
    },
    'io.write.char.fmt': (ctx, [value, width]) => {
      ctx.outputBuffer.push(formatField(value as string, width as number))
    },
    'io.write.str.fmt': (ctx, [value, width]) => {
      ctx.outputBuffer.push(formatField((value as PascalArray).value.array.join(''), width as number))
    },
  }
}

// ---------- 读取辅助函数 ----------
function readInt(ctx: RuntimeContext): number {
  const tok = nextToken(ctx)
  return tok ? parseInt(tok, 10) | 0 : 0
}

function readReal(ctx: RuntimeContext): number {
  const tok = nextToken(ctx)
  return tok ? parseFloat(tok) : 0
}

function readBool(ctx: RuntimeContext): boolean {
  const tok = nextToken(ctx)
  if (!tok) {
    return false
  }
  const lower = tok.toLowerCase()
  return lower === 'true' || lower === 't'
}

function readChar(ctx: RuntimeContext): string {
  const tok = nextToken(ctx)
  return tok ? tok.charAt(0) : '\x00'
}

function readStr(ctx: RuntimeContext): string {
  const tok = nextToken(ctx)
  return tok ?? ''
}

// ---------- 词法分析（从输入队列中取下一个 token）----------
function nextToken(ctx: RuntimeContext): string | null {
  // 循环处理，直到成功取出一个 token 或确定无输入
  while (true) {
    // 如果当前 tokens 已用完，尝试从 inputQueue 加载下一行
    if (ctx.readState.tokenIdx >= ctx.readState.tokens.length) {
      if (ctx.inputQueue.length === 0) {
        return null
      }
      const line = ctx.inputQueue.shift()!
      ctx.readState.tokens = line.split(/\s+/).filter((s) => s.length > 0)
      ctx.readState.tokenIdx = 0
      // 如果分割后为空行，继续循环（跳过空行）
      if (ctx.readState.tokens.length === 0) {
        continue
      }
    }
    // 返回当前 token 并移动索引
    return ctx.readState.tokens[ctx.readState.tokenIdx++]
  }
}

function isInputEof(ctx: RuntimeContext): boolean {
  return ctx.inputQueue.length === 0 && ctx.readState.tokenIdx >= ctx.readState.tokens.length
}

function isInputEndOfLine(ctx: RuntimeContext): boolean {
  return ctx.readState.tokenIdx >= ctx.readState.tokens.length
}
