import type { RuntimeContext, SyscallHandler } from '../runtime-type.ts'
import { formatField, formatReal } from '../runtime-util.ts'

export function ioSyscalls(): Record<string, SyscallHandler> {
  return {
    // ---------- io.write（无文件）----------
    'io.write.i64': (ctx, args) => {
      ctx.outputBuffer.push(String(args[0]))
    },
    'io.write.f64': (ctx, args) => {
      ctx.outputBuffer.push(formatReal(args[0] as number))
    },
    'io.write.bool': (ctx, args) => {
      ctx.outputBuffer.push(args[0] ? 'TRUE' : 'FALSE')
    },
    'io.write.char': (ctx, args) => {
      ctx.outputBuffer.push(args[0] as string)
    },
    'io.write.str': (ctx, args) => {
      ctx.outputBuffer.push(args[0] as string)
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
    'io.eoln': (ctx) => isInputEoln(ctx),
    'io.break': () => undefined,

    // 无文件：[value, width, precision?]
    'io.write.i64.fmt': (ctx, args) => {
      ctx.outputBuffer.push(formatField(String(args[0]), args[1] as number))
    },
    'io.write.f64.fmt': (ctx, args) => {
      ctx.outputBuffer.push(
        formatField(
          args[2] !== undefined ? (args[0] as number).toFixed(args[2] as number) : formatReal(args[0] as number),
          args[1] as number,
        ),
      )
    },
    'io.write.bool.fmt': (ctx, args) => {
      ctx.outputBuffer.push(formatField(args[0] ? 'TRUE' : 'FALSE', args[1] as number))
    },
    'io.write.char.fmt': (ctx, args) => {
      ctx.outputBuffer.push(formatField(args[0] as string, args[1] as number))
    },
    'io.write.str.fmt': (ctx, args) => {
      ctx.outputBuffer.push(formatField(args[0] as string, args[1] as number))
    },
  }
}

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
  if (!tok) return false
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

function nextToken(ctx: RuntimeContext): string | null {
  if (ctx.readState.tokenIdx >= ctx.readState.tokens.length) {
    if (ctx.inputQueue.length === 0) {
      return null
    }
    const line = ctx.inputQueue.shift()!
    ctx.readState.tokens = line.split(/\s+/).filter((s) => s.length > 0)
    ctx.readState.tokenIdx = 0
    if (ctx.readState.tokens.length === 0) {
      return nextToken(ctx) // 递归取下一行（空行跳过）
    }
  }
  return ctx.readState.tokens[ctx.readState.tokenIdx++]
}
function isInputEof(ctx: RuntimeContext): boolean {
  return ctx.inputQueue.length === 0 && ctx.readState.tokenIdx >= ctx.readState.tokens.length
}

function isInputEoln(ctx: RuntimeContext): boolean {
  return ctx.readState.tokenIdx >= ctx.readState.tokens.length
}
