import { assertEquals, describe, test } from '../../_harness.ts'
import type { TypeDescriptor } from '../../../src/middle/lowering/type.ts'
import { arraySlot, codecOf, fieldSlot, setSize, sizeOf } from '../../../src/middle/rewrite/type-layout.ts'

describe('rewrite: type-layout', () => {
  test('codecOf: 基本标量', () => {
    assertEquals(codecOf({ tag: 'i32' }), 'i32')
    assertEquals(codecOf({ tag: 'f64' }), 'f64')
    assertEquals(codecOf({ tag: 'bool' }), 'u8')
    assertEquals(codecOf({ tag: 'char' }), 'u8')
  })

  test('codecOf: 子界按范围选宽度', () => {
    assertEquals(codecOf({ tag: 'i32', low: 0, high: 10 }), 'i8')
    assertEquals(codecOf({ tag: 'i32', low: 0, high: 200 }), 'u8')
    assertEquals(codecOf({ tag: 'i32', low: 0, high: 1000 }), 'i16')
    assertEquals(codecOf({ tag: 'i32', low: 0, high: 70000 }), 'i32')
    assertEquals(codecOf({ tag: 'i32', low: -30000, high: 30000 }), 'i16')
  })

  test('codecOf: enum 按 enumCount', () => {
    assertEquals(codecOf({ tag: 'enum', enumCount: 10 }), 'i8')
    assertEquals(codecOf({ tag: 'enum', enumCount: 300 }), 'i16')
  })

  test('sizeOf: 标量', () => {
    assertEquals(sizeOf({ tag: 'i32' }), 4)
    assertEquals(sizeOf({ tag: 'f64' }), 8)
    assertEquals(sizeOf({ tag: 'bool' }), 1)
    assertEquals(sizeOf({ tag: 'char' }), 1)
    assertEquals(sizeOf({ tag: 'i32', low: 0, high: 10 }), 1)
  })

  test('sizeOf: array', () => {
    assertEquals(sizeOf({ tag: 'array', dims: [{ low: 1, high: 10 }], elem: { tag: 'i32' } }), 40)
    assertEquals(
      sizeOf({
        tag: 'array',
        dims: [{ low: 0, high: 2 }, { low: 0, high: 3 }],
        elem: { tag: 'i32', low: 0, high: 10 },
      }),
      12,
    )
  })

  test('sizeOf: record（固定字段）', () => {
    const td: TypeDescriptor = {
      tag: 'rec',
      fields: [
        { name: 'a', type: { tag: 'i32' } },
        { name: 'b', type: { tag: 'char' } },
      ],
    }
    assertEquals(sizeOf(td), 5)
  })

  test('setSize: 统一 32 字节（绝对位，覆盖 0..255）', () => {
    assertEquals(setSize({ tag: 'set', elem: { tag: 'i32', low: 0, high: 63 } }), 32)
    assertEquals(setSize({ tag: 'set', elem: { tag: 'i32', low: 0, high: 255 } }), 32)
  })

  test('fieldSlot: 固定字段', () => {
    const td: TypeDescriptor = {
      tag: 'rec',
      fields: [
        { name: 'a', type: { tag: 'i32' } },
        { name: 'b', type: { tag: 'char' } },
      ],
    }
    assertEquals(fieldSlot(td, 'a'), { offset: 0, size: 4, type: { tag: 'i32' }, isTag: false })
    assertEquals(fieldSlot(td, 'b'), { offset: 4, size: 1, type: { tag: 'char' }, isTag: false })
    assertEquals(fieldSlot(td, 'c'), undefined)
  })

  test('arraySlot: 一维', () => {
    const td: TypeDescriptor = { tag: 'array', dims: [{ low: 1, high: 10 }], elem: { tag: 'i32' } }
    assertEquals(arraySlot(td), { elemType: { tag: 'i32' }, elemSize: 4, lows: [1], strides: [4] })
  })

  test('arraySlot: 二维', () => {
    const td: TypeDescriptor = {
      tag: 'array',
      dims: [{ low: 0, high: 2 }, { low: 0, high: 3 }],
      elem: { tag: 'char' },
    }
    assertEquals(arraySlot(td), { elemType: { tag: 'char' }, elemSize: 1, lows: [0, 0], strides: [4, 1] })
  })
})
