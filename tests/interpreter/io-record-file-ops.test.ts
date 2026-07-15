import {
  createRecordFileOps,
  PascalFile,
  PascalFileOps,
} from '../../src/interpreter'

function makeHandle(url: string, offset = 0): PascalFile {
  return { url, offset }
}

describe('createRecordFileOps', () => {
  let files: Map<string, Uint8Array>
  let ops: PascalFileOps

  beforeEach(() => {
    files = new Map()
    ops = createRecordFileOps(files)
  })

  describe('basic state: reset / rewrite / eof', () => {
    test('empty file starts at EOF after reset', () => {
      files.set('test1', new Uint8Array(0))
      const f = makeHandle('test1')
      ops.reset(f)
      expect(ops.eof(f)).toBe(true)
      expect(ops.bufferChar(f)).toBe(0)
    })

    test('file with content is not at EOF after reset', () => {
      files.set('test2', new TextEncoder().encode('hello'))
      const f = makeHandle('test2')
      ops.reset(f)
      expect(ops.eof(f)).toBe(false)
    })

    test('rewrite clears content and makes writable', () => {
      files.set('test3', new TextEncoder().encode('data'))
      const f = makeHandle('test3')
      ops.reset(f)
      expect(ops.eof(f)).toBe(false)

      ops.rewrite(f)
      expect(ops.eof(f)).toBe(true)
      expect(ops.bufferChar(f)).toBe(0)
      expect(files.get('test3')!.byteLength).toBe(0)
    })
  })

  describe('bufferChar / get', () => {
    test('read bytes sequentially', () => {
      files.set('seq', new Uint8Array([65, 66, 67]))
      const f = makeHandle('seq')
      ops.reset(f)

      expect(ops.bufferChar(f)).toBe(65)
      ops.get(f)
      expect(ops.bufferChar(f)).toBe(66)
      ops.get(f)
      expect(ops.bufferChar(f)).toBe(67)
      ops.get(f)
      expect(ops.bufferChar(f)).toBe(0)
      expect(ops.eof(f)).toBe(true)
    })

    test('get past end sets EOF', () => {
      files.set('eoftest', new Uint8Array([42]))
      const f = makeHandle('eoftest')
      ops.reset(f)
      expect(ops.eof(f)).toBe(false)
      ops.get(f)
      expect(ops.eof(f)).toBe(true)
    })

    test('bufferChar on empty file returns 0', () => {
      files.set('emptybuf', new Uint8Array(0))
      const f = makeHandle('emptybuf')
      ops.reset(f)
      expect(ops.bufferChar(f)).toBe(0)
    })
  })

  describe('eoln', () => {
    test('eoln is true when offset is at newline character', () => {
      files.set('eoln1', new Uint8Array([65, 10, 66]))
      const f = makeHandle('eoln1')
      ops.reset(f)

      expect(ops.eoln(f)).toBe(false)
      ops.get(f)
      expect(ops.eoln(f)).toBe(true)
    })

    test('eoln is true at end of file', () => {
      files.set('eoln2', new Uint8Array([65]))
      const f = makeHandle('eoln2')
      ops.reset(f)
      expect(ops.eoln(f)).toBe(false)
      ops.get(f)
      expect(ops.eoln(f)).toBe(true)
    })

    test('eoln is true on empty file', () => {
      files.set('eoln3', new Uint8Array(0))
      const f = makeHandle('eoln3')
      ops.reset(f)
      expect(ops.eoln(f)).toBe(true)
    })
  })

  describe('readln', () => {
    test('readln advances past newline', () => {
      files.set('rl1', new Uint8Array([65, 10, 66]))
      const f = makeHandle('rl1')
      ops.reset(f)

      expect(ops.bufferChar(f)).toBe(65)
      ops.readln(f)
      expect(ops.bufferChar(f)).toBe(66)
      expect(ops.eof(f)).toBe(false)
    })

    test('readln at EOF does nothing', () => {
      files.set('rl2', new Uint8Array(0))
      const f = makeHandle('rl2')
      ops.reset(f)
      ops.readln(f)
      expect(ops.eof(f)).toBe(true)
    })

    test('readln on last line sets EOF', () => {
      files.set('rl3', new Uint8Array([65]))
      const f = makeHandle('rl3')
      ops.reset(f)
      ops.readln(f)
      expect(ops.eof(f)).toBe(true)
    })
  })

  describe('write / writeln', () => {
    test('write throws when not writable', () => {
      const f = makeHandle('write1')
      ops.reset(f)
      expect(() => ops.write(f, 'hello')).toThrow('REWRITE')
    })

    test('writeln throws when not writable', () => {
      const f = makeHandle('write2')
      ops.reset(f)
      expect(() => ops.writeln(f)).toThrow('REWRITE')
    })

    test('write then writeln updates the Map', () => {
      const f = makeHandle('write3')
      ops.rewrite(f)

      ops.write(f, 'line1')
      ops.writeln(f)
      expect(new TextDecoder().decode(files.get('write3'))).toBe('line1\n')
    })

    test('multiple write + writeln', () => {
      const f = makeHandle('write4')
      ops.rewrite(f)

      ops.write(f, 'first')
      ops.writeln(f)
      ops.write(f, 'second')
      ops.writeln(f)
      expect(new TextDecoder().decode(files.get('write4'))).toBe('first\nsecond\n')
    })

    test('write appends to current line without writeln', () => {
      const f = makeHandle('write5')
      ops.rewrite(f)

      ops.write(f, 'part1')
      ops.write(f, 'part2')
      ops.writeln(f)
      expect(new TextDecoder().decode(files.get('write5'))).toBe('part1part2\n')
    })
  })

  describe('close', () => {
    test('close flushes current line to the Map', () => {
      const f = makeHandle('close1')
      ops.rewrite(f)

      ops.write(f, 'pending')
      ops.close(f)
      expect(new TextDecoder().decode(files.get('close1'))).toBe('pending\n')
    })

    test('close with empty buffer does nothing', () => {
      const f = makeHandle('close2')
      ops.rewrite(f)

      ops.write(f, '')
      ops.close(f)
      expect(files.get('close2')!.byteLength).toBe(0)
    })
  })

  describe('reset after write', () => {
    test('reset makes file readable from start', () => {
      files.set('rw', new TextEncoder().encode('hello\nworld'))
      const f = makeHandle('rw')
      ops.reset(f)
      expect(ops.bufferChar(f)).toBe(104) // 'h'
    })
  })

  describe('get after put', () => {
    test('put is a no-op', () => {
      files.set('put1', new Uint8Array([65, 66]))
      const f = makeHandle('put1')
      ops.reset(f)

      ops.put(f)
      expect(ops.bufferChar(f)).toBe(65)
    })
  })
})
