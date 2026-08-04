/**
 * Pascal 文件模型。
 *
 * 新编译器（src/il/）中文件通过 PascalFile 接口管理，
 * 包含 url（文件名）和 offset（当前读位置）属性。
 * IO 操作通过 il/runtime.ts 的 dispatch 函数分发。
 */
export interface PascalFile {
  url: string
  offset: number
}
