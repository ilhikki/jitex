import type * as JsonCode from '@/middle/ir/json-code.ts'
import type { TypeDescriptor } from '@/middle/lowering/type.ts'
import type { ExtraCallable } from '@/middle/analysis/analysis-type.ts'
import { syscallKeys } from '@/middle/lowering/helpers.ts'
import {
  arrayCount,
  arraySlot,
  fieldSlot,
  isByteScalar,
  isObjectRepr,
  isScalar,
  remainingArrayType,
  scalarKindOf,
  setSize,
  sizeOf,
} from './type-layout.ts'
import { rtKeys } from '@jitex/runtime'
import { bytesGetKey, bytesSetKey } from './scalar-keys.ts'
import type { SyscallRewriteTable } from './rewrite.ts'

function sc(key: string, args: JsonCode.Expr[]): JsonCode.Syscall {
  return { kind: 'syscall', key, args }
}

function litInt(v: number): JsonCode.Literal {
  return { kind: 'literal', key: 'number', arg: String(v) }
}

function litStr(s: string): JsonCode.Literal {
  return { kind: 'literal', key: 'string', arg: s }
}

function litReal(v: string): JsonCode.Literal {
  return { kind: 'literal', key: 'number', arg: v }
}

function parseType(arg: JsonCode.Expr | undefined): TypeDescriptor | undefined {
  if (!arg || arg.kind !== 'literal' || arg.key !== 'type') {
    return undefined
  }
  return JSON.parse(arg.arg) as TypeDescriptor
}

function isFloat(t: TypeDescriptor | undefined): boolean {
  return t?.tag === 'real'
}

function isSet(t: TypeDescriptor | undefined): boolean {
  return t?.tag === 'set'
}

function isCharArray(t: TypeDescriptor | undefined): boolean {
  return t?.tag === 'array' && t.elem?.tag === 'char'
}

function isBinaryFile(fileType: TypeDescriptor | undefined): boolean {
  return fileType?.tag === 'file' && fileType.elem?.tag === 'record'
}

function isByteFile(fileType: TypeDescriptor | undefined): boolean {
  return fileType?.tag === 'file' && isByteScalar(fileType.elem)
}

function fileKind(fileType: TypeDescriptor | undefined): string {
  const elem = fileType?.elem
  if (elem?.tag === 'record') {
    return 'blocks'
  }
  if (isByteScalar(elem)) {
    return 'bytes'
  }
  return 'text'
}

function defaultValueExpr(td: TypeDescriptor): JsonCode.Expr {
  switch (td.tag) {
    case 'integer':
      return litInt(td.low ?? 0)
    case 'enum':
    case 'boolean':
      return litInt(0)
    case 'real':
      return litReal('0')
    case 'char':
      return litInt(0)
    case 'set':
      return sc(rtKeys.bytesAlloc, [litInt(setSize(td))])
    case 'pointer':
      return litNullLiteral()
    case 'file':
      return sc(rtKeys.fileCreate, [litStr(fileKind(td))])
    case 'array':
      return isObjectRepr(td)
        ? sc(
          rtKeys.objectArrayNew,
          Array.from({ length: arrayCount(td) }, () => defaultValueExpr(td.elem!)),
        )
        : sc(rtKeys.bytesAlloc, [litInt(sizeOf(td))])
    case 'record':
      return isObjectRepr(td)
        ? sc(rtKeys.objectNew, recordDefaultArgs(td))
        : sc(rtKeys.bytesAlloc, [litInt(sizeOf(td))])
    default:
      return litInt(0)
  }
}

function recordDefaultArgs(td: TypeDescriptor): JsonCode.Expr[] {
  const args: JsonCode.Expr[] = []
  for (const f of td.fields ?? []) {
    args.push(litStr(f.name), defaultValueExpr(f.type))
  }
  for (const b of td.variant?.branches ?? []) {
    for (const f of b.fields) {
      args.push(litStr(f.name), defaultValueExpr(f.type))
    }
  }
  return args
}

function binary(i32Key: string, f32Key: string, setKey?: string) {
  return (sys: JsonCode.Syscall): JsonCode.Expr => {
    const lt = parseType(sys.args[1])
    const rt = parseType(sys.args[3])
    const l = sys.args[0]
    const r = sys.args[2]
    if (setKey && isSet(lt)) {
      const size = setSize(lt!)
      return sc(setKey, [l, r, litInt(size)])
    }
    return sc(isFloat(lt) || isFloat(rt) ? f32Key : i32Key, [l, r])
  }
}

function binaryFixed(key: string) {
  return (sys: JsonCode.Syscall): JsonCode.Expr => sc(key, [sys.args[0], sys.args[1]])
}

function logical(i32Key: string, boolKey: string) {
  return (sys: JsonCode.Syscall): JsonCode.Expr => {
    const lt = parseType(sys.args[1])
    return sc(lt?.tag === 'integer' ? i32Key : boolKey, [sys.args[0], sys.args[2]])
  }
}

function compare(setKey: string | undefined, cmpKey: string) {
  return (sys: JsonCode.Syscall): JsonCode.Expr => {
    const lt = parseType(sys.args[1])
    const l = sys.args[0]
    const r = sys.args[2]
    if (setKey && isSet(lt)) {
      return sc(setKey, [l, r, litInt(setSize(lt!))])
    }
    return sc(cmpKey, [l, r])
  }
}

function unaryI32OrOther(i32Key: string, otherKey: string) {
  return (sys: JsonCode.Syscall): JsonCode.Expr => {
    const t = parseType(sys.args[1])
    return sc(t?.tag === 'integer' ? i32Key : otherKey, [sys.args[0]])
  }
}

function unaryFloatOrI32(f32Key: string, i32Key: string) {
  return (sys: JsonCode.Syscall): JsonCode.Expr => {
    const t = parseType(sys.args[1])
    return sc(isFloat(t) ? f32Key : i32Key, [sys.args[0]])
  }
}

function unary(key: string) {
  return (sys: JsonCode.Syscall): JsonCode.Expr => sc(key, [sys.args[0]])
}

function predSucc(isSucc: boolean, debug: boolean) {
  const i32Key = isSucc ? rtKeys.int32Add : rtKeys.int32Subtract
  const f32Key = isSucc ? rtKeys.float32Add : rtKeys.float32Subtract

  const checked = (expr: JsonCode.Expr, lo: number, hi: number): JsonCode.Expr =>
    debug ? sc(rtKeys.debugRangeCheck, [expr, litInt(lo), litInt(hi)]) : expr
  return (sys: JsonCode.Syscall): JsonCode.Expr => {
    const t = parseType(sys.args[1])
    const x = sys.args[0]

    if (t?.tag === 'char') {
      return sc(i32Key, [x, litInt(1)])
    }
    if (t?.tag === 'enum' && t.enumCount !== undefined) {
      return checked(sc(i32Key, [x, litInt(1)]), 0, t.enumCount - 1)
    }
    if (t?.low !== undefined && t?.high !== undefined) {
      return checked(sc(i32Key, [x, litInt(1)]), t.low, t.high)
    }
    return sc(isFloat(t) ? f32Key : i32Key, [x, litInt(1)])
  }
}

function ordRewrite(sys: JsonCode.Syscall): JsonCode.Expr {
  return sys.args[0]
}

function offsetExpr(indices: JsonCode.Expr[], lows: number[], strides: number[]): JsonCode.Expr {
  const terms = indices.map((idx, i) => {
    const low = lows[i] ?? 0
    const stride = strides[i] ?? 1
    const base = low === 0 ? idx : sc(rtKeys.int32Subtract, [idx, litInt(low)])
    return stride === 1 ? base : sc(rtKeys.int32Multiply, [base, litInt(stride)])
  })
  return terms.reduce((a, b) => sc(rtKeys.int32Add, [a, b]))
}

function elemIndexExpr(td: TypeDescriptor, indices: JsonCode.Expr[]): JsonCode.Expr {
  const dims = arrayDims(td)
  return elementOffset(indices, dims)
}

function arrayDims(td: TypeDescriptor): Array<{ low: number; high: number }> {
  const dims: Array<{ low: number; high: number }> = []
  let cur: TypeDescriptor | undefined = td
  while (cur && cur.tag === 'array') {
    for (const d of cur.dims ?? []) {
      dims.push(d)
    }
    cur = cur.elem
  }
  return dims
}

function elementOffset(
  indices: JsonCode.Expr[],
  dims: Array<{ low: number; high: number }>,
): JsonCode.Expr {
  const strides = new Array<number>(dims.length).fill(1)
  for (let i = dims.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * (dims[i + 1].high - dims[i + 1].low + 1)
  }
  return offsetExpr(indices, dims.map((d) => d.low), strides)
}

function toConvertKey(td: TypeDescriptor | undefined, binary: boolean): string {
  if (binary) {
    switch (td?.tag) {
      case 'real':
        return rtKeys.convertFloat32ToBytes
      case 'boolean':
        return rtKeys.convertBooleanToBytes
      default:
        return rtKeys.convertInt32ToBytes
    }
  }
  switch (td?.tag) {
    case 'real':
      return rtKeys.convertFloat32ToText
    case 'boolean':
      return rtKeys.convertBooleanToText
    case 'char':
      return rtKeys.convertInt32ToChar
    default:
      return rtKeys.convertInt32ToText
  }
}

function fromConvertKey(td: TypeDescriptor | undefined, binary: boolean): string {
  if (binary) {
    switch (td?.tag) {
      case 'real':
        return rtKeys.convertBytesToFloat32
      case 'boolean':
        return rtKeys.convertBytesToBoolean
      default:
        return rtKeys.convertBytesToInt32
    }
  }
  switch (td?.tag) {
    case 'real':
      return rtKeys.convertTextToFloat32
    case 'boolean':
      return rtKeys.convertTextToBoolean
    case 'char':
      return rtKeys.convertCharToInt32
    default:
      return rtKeys.convertTextToInt32
  }
}

function requireIsoFileActuals(sys: JsonCode.Syscall, name: string): void {
  if (sys.args.length !== 2) {
    throw new Error(
      `ISO 7185 6.6.5.2: ${name}(f) shall have exactly one actual-parameter, a file-variable; a file-name is not an ISO 7185 form`,
    )
  }
}

function filePutRewrite(sys: JsonCode.Syscall): JsonCode.Expr {
  const [f, fileType, unit] = sys.args
  if (unit === undefined) {
    return sc(rtKeys.filePut, [f])
  }
  const tt = parseType(fileType)
  const kind = fileKind(tt)
  if (kind === 'blocks') {
    return sc(rtKeys.filePutBufferBlock, [f, unit])
  }
  if (kind === 'bytes') {
    return sc(rtKeys.filePutBufferByte, [f, unit])
  }
  if (tt?.elem?.tag === 'char') {
    return sc(rtKeys.filePutBufferCharacter, [f, unit])
  }

  return sc(rtKeys.filePutBufferText, [f, sc(toConvertKey(tt?.elem, false), [unit])])
}

interface ActualPair {
  value: JsonCode.Expr
  td: JsonCode.Expr
}

function actualPairs(args: JsonCode.Expr[]): ActualPair[] {
  const out: ActualPair[] = []
  for (let i = 0; i + 1 < args.length; i += 2) {
    out.push({ value: args[i], td: args[i + 1] })
  }
  return out
}

function splitFileTarget(pairs: ActualPair[]): {
  target: JsonCode.Expr
  fileType: TypeDescriptor | undefined
  rest: ActualPair[]
} {
  const first = pairs[0]
  const firstType = first ? parseType(first.td) : undefined
  if (first && firstType?.tag === 'file') {
    return { target: first.value, fileType: firstType, rest: pairs.slice(1) }
  }
  return { target: litNullLiteral(), fileType: undefined, rest: pairs }
}

function unpackWidthSpec(e: JsonCode.Expr): {
  value: JsonCode.Expr
  valueType: JsonCode.Expr | undefined
  width: JsonCode.Expr | undefined
  prec: JsonCode.Expr | undefined
} {
  if (e.kind === 'syscall' && e.key === syscallKeys.widthSpec) {
    const a = e.args
    return { value: a[0], valueType: a[1], width: a[2], prec: a[4] }
  }
  return { value: e, valueType: undefined, width: undefined, prec: undefined }
}

function writeItem(
  target: JsonCode.Expr,
  fileType: TypeDescriptor | undefined,
  pair: ActualPair,
): JsonCode.Expr {
  const spec = unpackWidthSpec(pair.value)
  const value = spec.value
  const vt = parseType(spec.valueType ?? pair.td)
  const width = spec.width
  const prec = spec.prec
  if (fileKind(fileType) === 'blocks') {
    return sc(rtKeys.fileWriteBlock, [target, value])
  }
  if (isByteFile(fileType)) {
    return sc(rtKeys.fileWriteByte, [target, value])
  }
  if (isCharArray(vt)) {
    if (width === undefined) {
      return sc(rtKeys.fileWriteBytes, [target, value])
    }
    return sc(rtKeys.fileWriteText, [target, sc(rtKeys.convertBytesToTextField, [value, width])])
  }
  const binary = isBinaryFile(fileType)
  const convArgs: JsonCode.Expr[] = [value]
  if (width !== undefined) {
    convArgs.push(width)
    if (prec !== undefined) {
      convArgs.push(prec)
    }
  }
  const converted = sc(toConvertKey(vt, binary), convArgs)
  return binary ? sc(rtKeys.fileWriteBytes, [target, converted]) : sc(rtKeys.fileWriteText, [target, converted])
}

function writeCall(sys: JsonCode.Syscall, newline: boolean): JsonCode.Expr {
  const { target, fileType, rest } = splitFileTarget(actualPairs(sys.args))
  const writes = rest.map((p) => writeItem(target, fileType, p))
  if (newline) {
    writes.push(sc(rtKeys.fileWriteln, [target]))
  }
  if (writes.length === 1) {
    return writes[0]
  }
  if (writes.length === 0) {
    return sc(rtKeys.fileWriteln, [target])
  }
  return sc(rtKeys.closureNoValue, writes)
}

function readOne(
  target: JsonCode.Expr,
  fileType: TypeDescriptor | undefined,
  valueType: JsonCode.Expr,
): JsonCode.Expr {
  const vt = parseType(valueType)
  if (isByteFile(fileType)) {
    return sc(rtKeys.fileReadCharacter, [target])
  }
  const binary = isBinaryFile(fileType)
  const readKey = binary || vt?.tag === 'char' ? rtKeys.fileReadCharacter : rtKeys.fileReadToken

  const readArgs = binary ? [target, litInt(sizeOf(fileType!.elem!))] : [target]
  const raw = sc(readKey, readArgs)
  if (isCharArray(vt)) {
    return raw
  }
  return sc(fromConvertKey(vt, binary), [raw])
}

function writeBack(loc: JsonCode.Expr, value: JsonCode.Expr, _debug: boolean): JsonCode.Expr {
  if (loc.kind === 'ref') {
    return sc(rtKeys.assign, [loc, value])
  }
  if (loc.kind === 'syscall') {
    switch (loc.key) {
      case rtKeys.cellGet:
        return sc(rtKeys.cellSet, [loc.args[0], value])
      case rtKeys.pointerDereference:
        return sc(rtKeys.pointerAssign, [loc.args[0], value])
      case rtKeys.objectGet:
        return sc(rtKeys.objectSet, [...loc.args, value])
      case rtKeys.objectArrayGet:
        return sc(rtKeys.objectArraySet, [...loc.args, value])
      default:
        break
    }
  }
  throw new Error(
    `The write-back target must be a variable / variable parameter / array element / record field / dereference (actual: ${loc.kind}${
      loc.kind === 'syscall' ? ':' + loc.key : ''
    })`,
  )
}

function readCall(sys: JsonCode.Syscall, skipLine: boolean, debug: boolean): JsonCode.Expr {
  const { target, fileType, rest } = splitFileTarget(actualPairs(sys.args))
  const ops = rest.map((p) => writeBack(p.value, readOne(target, fileType, p.td), debug))
  if (skipLine) {
    ops.push(sc(rtKeys.fileReadln, [target]))
  }
  if (ops.length === 1) {
    return ops[0]
  }
  if (ops.length === 0) {
    return sc(rtKeys.fileReadln, [target])
  }
  return sc(rtKeys.closureNoValue, ops)
}

export function buildExtraCallableRewriters(
  extraCallables?: Record<string, ExtraCallable>,
): SyscallRewriteTable {
  const table: SyscallRewriteTable = {}
  if (!extraCallables) {
    return table
  }
  for (const [name, spec] of Object.entries(extraCallables)) {
    table[`lowering.call.${name.toLowerCase()}`] = (sys) =>
      sc(spec.sysCallName, actualPairs(sys.args).map((p) => p.value))
  }
  return table
}

export function buildPascalRewriteTable(debug: boolean): SyscallRewriteTable {
  return {
    'lowering.add': binary(rtKeys.int32Add, rtKeys.float32Add, rtKeys.bitmapUnion),
    'lowering.sub': binary(rtKeys.int32Subtract, rtKeys.float32Subtract, rtKeys.bitmapDifference),
    'lowering.mul': binary(rtKeys.int32Multiply, rtKeys.float32Multiply, rtKeys.bitmapIntersection),
    'lowering.div': binaryFixed(rtKeys.float32Divide),

    'lowering.intDiv': (sys) =>
      sc(rtKeys.int32Divide, [
        sys.args[0],
        debug ? sc(rtKeys.debugDivideCheck, [sys.args[1]]) : sys.args[1],
      ]),
    'lowering.mod': (sys) =>
      sc(rtKeys.int32Modulo, [
        sys.args[0],
        debug ? sc(rtKeys.debugModuloCheck, [sys.args[1]]) : sys.args[1],
      ]),

    'lowering.and': logical(rtKeys.int32And, rtKeys.booleanAnd),
    'lowering.or': logical(rtKeys.int32Or, rtKeys.booleanOr),

    'lowering.neg': unaryFloatOrI32(rtKeys.float32Negate, rtKeys.int32Negate),
    'lowering.not': unaryI32OrOther(rtKeys.int32Not, rtKeys.booleanNot),

    'lowering.call.abs': unaryFloatOrI32(rtKeys.float32Absolute, rtKeys.int32Absolute),
    'lowering.call.sqr': (sys) => {
      const t = parseType(sys.args[1])
      const x = sys.args[0]
      return sc(isFloat(t) ? rtKeys.float32Multiply : rtKeys.int32Multiply, [x, x])
    },
    'lowering.call.sqrt': unary(rtKeys.float32SquareRoot),
    'lowering.call.sin': unary(rtKeys.float32Sine),
    'lowering.call.cos': unary(rtKeys.float32Cosine),
    'lowering.call.exp': unary(rtKeys.float32Exponential),
    'lowering.call.ln': unary(rtKeys.float32Logarithm),
    'lowering.call.arctan': unary(rtKeys.float32Arctangent),
    'lowering.call.odd': unary(rtKeys.int32Odd),
    'lowering.call.trunc': unary(rtKeys.castFloat32ToInt32),
    'lowering.call.round': unary(rtKeys.castFloat32ToInt32Round),
    'lowering.call.ord': ordRewrite,
    'lowering.call.chr': ordRewrite,
    'lowering.call.pred': predSucc(false, debug),
    'lowering.call.succ': predSucc(true, debug),

    'lowering.eq': compare(rtKeys.bitmapEqual, rtKeys.compareEqual),
    'lowering.ne': compare(rtKeys.bitmapNotEqual, rtKeys.compareNotEqual),
    'lowering.lt': compare(undefined, rtKeys.compareLess),
    'lowering.le': compare(rtKeys.bitmapSubset, rtKeys.compareLessOrEqual),
    'lowering.gt': compare(undefined, rtKeys.compareGreater),
    'lowering.ge': compare(rtKeys.bitmapSuperset, rtKeys.compareGreaterOrEqual),

    'lowering.in': (sys) => {
      const st = parseType(sys.args[3])
      return sc(rtKeys.bitmapContains, [sys.args[0], sys.args[2], litInt(setSize(st!))])
    },
    'lowering.ptr.deref': (sys) => sc(rtKeys.pointerDereference, sys.args),
    'lowering.ptr.assign': (sys) => sc(rtKeys.pointerAssign, sys.args),
    'lowering.ptr.dispose.check': (sys) => sc(rtKeys.pointerDisposeCheck, sys.args),

    'lowering.assign': (sys) => sc(rtKeys.assign, sys.args),

    'lowering.mem.default': (sys) => {
      const td = parseType(sys.args[0])
      if (!td) {
        throw new Error('rewrite: mem.default expects a type descriptor')
      }

      if (isObjectRepr(td)) {
        return defaultValueExpr(td)
      }
      if (td.tag === 'set') {
        return sc(rtKeys.bytesAlloc, [litInt(setSize(td))])
      }
      return sc(rtKeys.bytesAlloc, [litInt(sizeOf(td))])
    },
    'lowering.mem.copy': (sys) => {
      const td = parseType(sys.args[3])
      return sc(rtKeys.bytesCopy, [sys.args[0], sys.args[1], sys.args[2], litInt(sizeOf(td!))])
    },

    'lowering.set.empty': (sys) => {
      const td = parseType(sys.args[0])
      return sc(rtKeys.bytesAlloc, [litInt(setSize(td!))])
    },
    'lowering.set.elem': (sys) => {
      const td = parseType(sys.args[1])
      return sc(rtKeys.bitmapSingleton, [sys.args[0], litInt(setSize(td!))])
    },
    'lowering.set.range': (sys) => {
      const td = parseType(sys.args[2])
      return sc(rtKeys.bitmapRange, [sys.args[0], sys.args[1], litInt(setSize(td!))])
    },
    'lowering.set.literal': (sys) => {
      const td = parseType(sys.args[sys.args.length - 1])
      const elems = sys.args.slice(0, -1)
      const size = litInt(setSize(td!))
      if (elems.length === 0) {
        return sc(rtKeys.bytesAlloc, [size])
      }
      return elems.reduce((a, b) => sc(rtKeys.bitmapUnion, [a, b, size]))
    },

    'lowering.file.create': (sys) => sc(rtKeys.fileCreate, [litStr(fileKind(parseType(sys.args[0])))]),
    'lowering.call.reset': (sys) => {
      requireIsoFileActuals(sys, 'reset')
      return sc(rtKeys.fileReset, [sys.args[0]])
    },
    'lowering.call.rewrite': (sys) => {
      requireIsoFileActuals(sys, 'rewrite')
      return sc(rtKeys.fileRewrite, [sys.args[0]])
    },
    'lowering.call.get': (sys) => {
      const td = parseType(sys.args[1])

      if (td?.elem?.tag === 'record') {
        return sc(rtKeys.fileGet, [sys.args[0], litInt(sizeOf(td.elem))])
      }
      return sc(rtKeys.fileGet, [sys.args[0]])
    },

    'lowering.call.put': filePutRewrite,
    'lowering.file.put': filePutRewrite,
    'lowering.file.peek': (sys) => {
      const td = parseType(sys.args[1])

      if (td?.elem?.tag === 'record') {
        return sc(rtKeys.filePeek, [sys.args[0], litInt(sizeOf(td.elem))])
      }
      return sc(rtKeys.filePeek, [sys.args[0]])
    },
    'lowering.file.eof': (sys) => sc(rtKeys.fileEof, [sys.args[0]]),
    'lowering.file.eoln': (sys) => sc(rtKeys.fileEoln, [sys.args[0]]),
    'lowering.program.fileUrl': (sys) => sc(rtKeys.fileProgramUrl, [sys.args[0], sys.args[1]]),

    'lowering.call.write': (sys) => writeCall(sys, false),
    'lowering.call.writeln': (sys) => writeCall(sys, true),
    'lowering.call.read': (sys) => readCall(sys, false, debug),
    'lowering.call.readln': (sys) => readCall(sys, true, debug),
    'lowering.call.page': (sys) => {
      const pairs = actualPairs(sys.args)
      return sc(rtKeys.filePage, [pairs.length > 0 ? pairs[0].value : litNullLiteral()])
    },
    'lowering.call.eof': (sys) => {
      const pairs = actualPairs(sys.args)
      return sc(rtKeys.fileEof, [pairs.length > 0 ? pairs[0].value : litNullLiteral()])
    },
    'lowering.call.eoln': (sys) => {
      const pairs = actualPairs(sys.args)
      return sc(rtKeys.fileEoln, [pairs.length > 0 ? pairs[0].value : litNullLiteral()])
    },

    'lowering.call.new': (sys) => {
      const [p, ptd] = sys.args
      const pt = parseType(ptd)
      if (pt?.tag !== 'pointer' || !pt.elem) {
        throw new Error('ISO 7185 6.6.5.3: the actual parameter to new(p) shall be a variable of pointer type.')
      }

      const domain = pt.elem
      const inner = isObjectRepr(domain) ? defaultValueExpr(domain) : sc(rtKeys.bytesAlloc, [litInt(sizeOf(domain))])
      return writeBack(p, sc(rtKeys.cellNew, [inner]), debug)
    },
    'lowering.call.dispose': (sys) => {
      const [p, ptd] = sys.args
      if (parseType(ptd)?.tag !== 'pointer') {
        throw new Error('ISO 7185 6.6.5.3: the actual parameter to dispose(p) shall be a variable of pointer type.')
      }
      return sc(rtKeys.closureNoValue, [
        sc(rtKeys.pointerDisposeCheck, [p]),
        writeBack(p, litNullLiteral(), debug),
      ])
    },

    'lowering.call.pack': (sys) => {
      const [src, srcTd, start, , dst, dstTd] = sys.args
      const srcArr = arraySlot(parseType(srcTd)!)
      return sc(rtKeys.bytesPack, [
        src,
        litInt(srcArr.lows[0] ?? 0),
        litInt(srcArr.elemSize),
        start,
        dst,
        litInt(arrayCount(parseType(dstTd)!)),
      ])
    },
    'lowering.call.unpack': (sys) => {
      const [src, srcTd, dst, dstTd, start] = sys.args
      const dstArr = arraySlot(parseType(dstTd)!)
      return sc(rtKeys.bytesUnpack, [
        src,
        dst,
        litInt(dstArr.lows[0] ?? 0),
        litInt(dstArr.elemSize),
        start,
        litInt(arrayCount(parseType(srcTd)!)),
      ])
    },
    'lowering.array.access': (sys) => {
      const td = parseType(sys.args[sys.args.length - 1])
      const indices = sys.args.slice(0, -1)
      const arr = indices.shift()!
      return accessAt(arr, td!, indices, undefined, debug)
    },
    'lowering.array.assign': (sys) => {
      const td = parseType(sys.args[sys.args.length - 1])
      const rest = sys.args.slice(0, -1)
      const arr = rest.shift()!
      const value = rest.pop()!
      return assignAt(arr, td!, rest, value, undefined, debug)
    },
    'lowering.rec.access': (sys) => {
      const td = parseType(sys.args[2])
      const name = (sys.args[1] as JsonCode.Literal).arg
      return accessAt(sys.args[0], td!, [], name, debug)
    },
    'lowering.rec.assign': (sys) => {
      const td = parseType(sys.args[3])
      const name = (sys.args[1] as JsonCode.Literal).arg
      return assignAt(sys.args[0], td!, [], sys.args[2], name, debug)
    },
    'lowering.rec.copy': (sys) => {
      const td = parseType(sys.args[1])
      if (td && isObjectRepr(td)) {
        return sc(
          td.tag === 'array' ? rtKeys.objectArrayClone : rtKeys.objectClone,
          [sys.args[0]],
        )
      }
      return sc(rtKeys.bytesClone, [sys.args[0], litInt(sizeOf(td!))])
    },

    'lowering.cell.create': (sys) => sc(rtKeys.cellNew, [sys.args[0]]),
    'lowering.cell.get': (sys) => sc(rtKeys.cellGet, [sys.args[0]]),
    'lowering.cell.set': (sys) => sc(rtKeys.cellSet, [sys.args[0], sys.args[1]]),

    'lowering.call.indirect': (sys) => sc(rtKeys.callIndirect, sys.args),

    'lowering.range.check': (sys) => sc(rtKeys.debugRangeCheck, sys.args),
    'lowering.steps.check': () => sc(rtKeys.debugStepsCheck, []),
    'lowering.hook.function.enter': () => sc(rtKeys.hookFunctionEnter, []),
  }
}

function litNullLiteral(): JsonCode.Literal {
  return { kind: 'literal', key: 'null', arg: 'null' }
}

function foldViewSub(base: JsonCode.Expr): { base: JsonCode.Expr; delta?: JsonCode.Expr } {
  if (base.kind === 'syscall' && base.key === rtKeys.viewSubarray) {
    return { base: base.args[0], delta: base.args[1] }
  }
  return { base }
}

function addOffset(delta: JsonCode.Expr | undefined, offset: JsonCode.Expr): JsonCode.Expr {
  if (delta === undefined) {
    return offset
  }
  if (offset.kind === 'literal' && offset.key === 'number' && offset.arg === '0') {
    return delta
  }
  return sc(rtKeys.int32Add, [delta, offset])
}

function checkedView(view: JsonCode.Expr, key: string, debug: boolean): JsonCode.Expr {
  return debug ? sc(rtKeys.debugAssertView, [view, litStr(key)]) : view
}

function accessAt(
  base: JsonCode.Expr,
  td: TypeDescriptor,
  indices: JsonCode.Expr[],
  fieldName: string | undefined,
  debug: boolean,
): JsonCode.Expr {
  if (fieldName === undefined && isObjectRepr(td)) {
    const dims = arrayDims(td)
    if (indices.length < dims.length) {
      const flatOff = elementOffset(indices, dims)
      return sc(rtKeys.objectArraySublist, [base, flatOff])
    }
    return sc(rtKeys.objectArrayGet, [base, elemIndexExpr(td, indices)])
  }

  const folded = foldViewSub(base)
  let offset: JsonCode.Expr
  let slotType: TypeDescriptor

  if (fieldName !== undefined) {
    if (isObjectRepr(td)) {
      return sc(rtKeys.objectGet, [base, litStr(fieldName)])
    }
    const slot = fieldSlot(td, fieldName)
    if (!slot) {
      const fixed = (td.fields ?? []).map((f) => f.name).join(',')
      const branches = (td.variant?.branches ?? [])
        .map((b) => `[${b.fields.map((f) => f.name).join(',')}]`)
        .join('')
      throw new Error(
        `rewrite: record has no field ${fieldName} (tag=${td.tag}; fixed=${fixed}; variant=${branches})`,
      )
    }
    offset = litInt(slot.offset)
    slotType = slot.type
  } else {
    const arr = arraySlot(td)
    offset = offsetExpr(indices, arr.lows, arr.strides)

    slotType = remainingArrayType(arr, indices.length) ?? arr.elemType
  }

  offset = addOffset(folded.delta, offset)
  if (isScalar(slotType)) {
    const key = bytesGetKey[scalarKindOf(slotType)]
    return sc(key, [checkedView(folded.base, key, debug), offset])
  }
  return sc(rtKeys.viewSubarray, [folded.base, offset, litInt(sizeOf(slotType))])
}

function assignAt(
  base: JsonCode.Expr,
  td: TypeDescriptor,
  indices: JsonCode.Expr[],
  value: JsonCode.Expr,
  fieldName: string | undefined,
  debug: boolean,
): JsonCode.Expr {
  if (fieldName === undefined && isObjectRepr(td)) {
    return sc(rtKeys.objectArraySet, [base, elemIndexExpr(td, indices), value])
  }

  const folded = foldViewSub(base)
  let offset: JsonCode.Expr
  let slotType: TypeDescriptor

  if (fieldName !== undefined) {
    if (isObjectRepr(td)) {
      return sc(rtKeys.objectSet, [base, litStr(fieldName), value])
    }
    const slot = fieldSlot(td, fieldName)
    if (!slot) {
      const fixed = (td.fields ?? []).map((f) => f.name).join(',')
      const branches = (td.variant?.branches ?? [])
        .map((b) => `[${b.fields.map((f) => f.name).join(',')}]`)
        .join('')
      throw new Error(
        `rewrite: record has no field ${fieldName} (tag=${td.tag}; fixed=${fixed}; variant=${branches})`,
      )
    }
    offset = litInt(slot.offset)
    slotType = slot.type
  } else {
    const arr = arraySlot(td)
    offset = offsetExpr(indices, arr.lows, arr.strides)

    slotType = remainingArrayType(arr, indices.length) ?? arr.elemType
  }

  offset = addOffset(folded.delta, offset)
  if (isScalar(slotType)) {
    const key = bytesSetKey[scalarKindOf(slotType)]
    return sc(key, [checkedView(folded.base, key, debug), offset, value])
  }
  return sc(rtKeys.bytesCopy, [folded.base, offset, value, litInt(sizeOf(slotType))])
}
