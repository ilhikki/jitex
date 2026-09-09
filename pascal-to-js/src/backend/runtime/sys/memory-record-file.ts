import { PascalRecord, RecordFile } from '../runtime-type.ts'

export class MemoryRecordFile implements RecordFile {
  private records: PascalRecord[] = []
  private pos: number = 0
  private buffer: PascalRecord | undefined = undefined
  private mode: 'inspection' | 'generation' = 'inspection'
  private type: unknown | undefined = undefined
  getType(): unknown | undefined {
    return this.type
  }
  setType(type: unknown) {
    this.type = type
  }

  constructor(initialRecords?: PascalRecord[]) {
    if (initialRecords) {
      this.records = initialRecords.slice()
    }
    this.seek(0)
  }

  seek(pos: number): void {
    if (pos < 0) {
      throw new Error('seek position must be >= 0')
    }
    this.pos = pos
  }

  peekRecord(): PascalRecord | undefined {
    // 返回缓冲区引用，允许 f^.field := x 修改
    return this.records[this.pos]
  }

  advance(): void {
    if (this.pos >= this.records.length) {
      throw new Error('advance beyond EOF')
    }
    this.pos++
  }

  writeRecord(): void {
    if (this.mode !== 'generation') {
      throw new Error('writeRecord requires generation mode')
    }
    if (this.buffer === undefined) {
      throw new Error('writeRecord: buffer is undefined')
    }
    // 将缓冲区的深拷贝追加到记录列表
    this.records.push(this.buffer)
    // 清空缓冲区，因为 f^ 在 put 后未定义（ISO）
    this.buffer = undefined
  }

  setBuffer(record: PascalRecord): void {
    if (this.mode !== 'generation') {
      throw new Error('setBuffer requires generation mode')
    }
    this.buffer = record
  }

  getBuffer(): PascalRecord | undefined {
    return this.buffer
  }

  clear(): void {
    this.records = []
    this.pos = 0
    this.buffer = undefined
  }

  setMode(mode: 'inspection' | 'generation'): void {
    this.mode = mode
  }

  getMode(): 'inspection' | 'generation' {
    return this.mode
  }

  hasMore(): boolean {
    return this.pos < this.records.length
  }

  /** 获取所有记录（用于调试） */
  getRecords(): PascalRecord[] {
    return this.records
  }
}
